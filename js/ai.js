'use strict';
// Простой эвристический ИИ: оценивает позицию на поле и выбирает лучшее действие.

const AI = (() => {
  const STARTERS = new Set(['Знать', 'Солдат']);
  const DEVOUR_HAND = new Set(['Пожиратель разума', 'Глабрезу', 'Марилит', 'Оркус', 'Балор', 'Демогоргон', 'Суккуб', 'Умертвие']);

  // уровни сложности: noise — случайный разброс оценок, blunder — шанс выбрать случайный вариант,
  // waste — шанс бросить тратить силу (остаток сгорает), rival — насколько учитывать успехи сильнейшего соперника,
  // killBias — множитель пользы убийства против выставления отрядов, promoW — ценность повышения слуги,
  // rush — отстающий не выставляет последний отряд (это закончило бы игру). Веса подобраны прогоном ботов (tools/sim.py, LEVELS, HARD)
  const LV = {
    easy:   { noise: 4,   blunder: 0.4, waste: 0.3, rival: 0 },
    normal: { noise: 0.3, blunder: 0,   waste: 0,   rival: 0 },
    hard:   { noise: 0.05, blunder: 0,  waste: 0,   rival: 1, killBias: 0.6, promoW: 3, rush: true },
  };
  const lv = p => LV[S.players[p].level] || LV.normal;
  const jitter = p => Math.random() * lv(p).noise;

  function lateGame() { return S.mdeck.length < 30 || S.players.some(P => P.barracks < 12); }

  // ценность позиции на поле для игрока p; тяжёлый бот вычитает позицию сильнейшего соперника
  function V(p) {
    const r = lv(p).rival;
    if (!r) return V0(p);
    let m = -Infinity;
    for (const q of S.players) if (q.idx !== p) m = Math.max(m, V0(q.idx));
    return V0(p) - r * m;
  }
  function V0(p) {
    let v = 0;
    for (const rid of T.actReg) {
      const r = REG[rid], c = controller(rid);
      const w = r.vp + (r.token ? 1.5 + r.token.fullVp * 0.6 : 0);
      if (c === p) { v += w; if (fullControl(rid, p)) v += 2 + (r.token ? r.token.fullVp * 1.2 : 0); }
      else if (c != null) v -= w * 0.35;
      let mine = 0, enemyMax = 0;
      const cnt = regionCounts(rid);
      for (const k in cnt) { if (+k === p) mine = cnt[k]; else enemyMax = Math.max(enemyMax, cnt[k]); }
      if (mine && c !== p && mine === enemyMax) v += 0.4; // близко к контролю
      if (presenceRegion(p, rid)) v += 0.18;
    }
    v += trophyCount(p) * 1.0;
    return v;
  }
  function sim(p, fn) { const undo = fn(); const v = V(p); undo(); return v; }
  function gainDeploy(p, id) { const b = V(p); return sim(p, () => { S.occ[id] = p; return () => { S.occ[id] = null; }; }) - b; }
  function gainKill(p, id, supplant) {
    const b = V(p), P = S.players[p];
    return sim(p, () => {
      const o = S.occ[id]; S.occ[id] = supplant ? p : null; P.trophies[o] = (P.trophies[o] || 0) + 1;
      return () => { S.occ[id] = o; P.trophies[o]--; };
    }) - b + (o => (o !== 'W' && o != null ? 0.6 : 0))(S.occ[id]);
  }
  function gainReturn(p, opt) {
    const b = V(p);
    if (opt.t === 'loc') return sim(p, () => { const o = S.occ[opt.id]; S.occ[opt.id] = null; return () => { S.occ[opt.id] = o; }; }) - b + 0.3;
    return sim(p, () => { take(S.spies[opt.rid], opt.owner); return () => { S.spies[opt.rid].push(opt.owner); }; }) - b + 0.2;
  }
  function bestRegionTarget(p, rid, supplant) {
    let best = 0;
    for (const l of REG[rid].locs) { const o = S.occ[l]; if (o != null && o !== p) best = Math.max(best, gainKill(p, l, supplant)); }
    return best;
  }
  function gainSpy(p, rid, follow) {
    const b = V(p);
    let g = sim(p, () => { S.spies[rid].push(p); return () => { take(S.spies[rid], p); }; }) - b;
    const enemies = REG[rid].locs.filter(l => S.occ[l] != null && S.occ[l] !== p).length;
    if (!presenceRegion(p, rid) && enemies) g += 0.5;
    if (S.spies[rid].length === 0 && controller(rid) != null && controller(rid) !== p && fullControl(rid, controller(rid))) g += 2;
    if (follow) g += bestRegionTarget(p, rid, follow === 'supplant');
    return g + REG[rid].vp * 0.05;
  }
  function gainRecall(p, rid, follow) {
    const b = V(p);
    let g = sim(p, () => { take(S.spies[rid], p); return () => { S.spies[rid].push(p); }; }) - b;
    if (follow) g += bestRegionTarget(p, rid, follow === 'supplant');
    return g;
  }
  function playValue(d) { return STARTERS.has(d.name) ? 0.8 : d.name === 'Безумный изгой' ? -3 : (d.cost || 0); }
  function keepValue(uid) {
    const d = def(uid);
    if (d.name === 'Безумный изгой' || d.name === 'Отравленный слуга') return -5;
    if (d.name === 'Гримлок') return -2;
    if (d.name === 'Посол') return -1;
    return playValue(d);
  }
  function estScore(q) { const s = scoreOf(q); return s.total; }
  function leader(opts) { return opts.slice().sort((a, b) => estScore(b) - estScore(a))[0]; }

  function scoreV(p, v, label) {
    let s = (v.p || 0) * 1.0 + (v.i || 0) * 1.05;
    if (v.deploy) s += Math.min(v.deploy, emptyDeployLocs(p).length) * 1.1;
    if (v.kill) s += enemyTroopLocs(p).length ? 3 * v.kill : 0;
    if (v.killWhite) s += Math.min(v.killWhite, enemyTroopLocs(p, { white: true }).length) * 2.2;
    if (v.supplant) s += 4;
    if (v.supplantWhiteAny) s += enemyTroopLocs(p, { white: true, anywhere: true }).length ? 4.2 : 0;
    if (v.spy) s += v.spy * 1.6;
    if (v.draw) s += v.draw * 1.7;
    if (v.promote) s += v.promote * (lv(p).promoW || 2.2);
    if (v.ret) s += 1.8 * Math.min(v.ret, 2);
    if (v.vp) s += v.vp;
    if (v.recruit) s += v.recruit * 2.5;
    if (v.blockWhite) s += 0.6;
    if (v.discard) s += 0.8;
    if (v.devourThis) s -= 1.5;
    if (v.devourHand) s -= 0.5;
    if (v.cleanse) s += 3;
    if (v.web) s += 1.4;
    if (v.troops) s += v.troops * 0.8;
    if (/^Вернуть/.test(label)) s -= 0.8;
    return s + jitter(p);
  }

  function resolveBoard(p, req) {
    const opts = req.opts;
    let scored;
    switch (req.purpose) {
      case 'initial': {
        scored = opts.map(o => ({ o, s: Math.random() + REG[LOC[o.id].region].locs.length * 0.2 }));
        break;
      }
      case 'deploy': scored = opts.map(o => ({ o, s: gainDeploy(p, o.id) })); break;
      case 'kill': case 'killWhite': scored = opts.map(o => ({ o, s: gainKill(p, o.id, false) })); break;
      case 'supplant': scored = opts.map(o => ({ o, s: gainKill(p, o.id, true) })); break;
      case 'return': scored = opts.map(o => ({ o, s: gainReturn(p, o) })); break;
      case 'moveFrom': scored = opts.map(o => ({ o, s: gainReturn(p, o) })); break;
      case 'moveTo': case 'deployWhite': {
        const v = req.purpose === 'moveTo' ? S.occ[req.from] : 'W';
        scored = opts.map(o => ({ o, s: sim(p, () => {
          const f = req.from, fv = f ? S.occ[f] : null; if (f) S.occ[f] = null; S.occ[o.id] = v;
          return () => { S.occ[o.id] = null; if (f) S.occ[f] = fv; };
        }) }));
        break;
      }
      case 'spy': scored = opts.map(o => ({ o, s: gainSpy(p, o.id, req.follow) })); break;
      case 'recall': scored = opts.map(o => ({ o, s: gainRecall(p, o.rid, req.follow) })); break;
      case 'spyMoveTo': scored = opts.map(o => ({ o, s: -REG[o.id].locs.filter(l => S.occ[l] === req.owner).length - REG[o.id].vp * 0.1 + Math.random() * 0.1 })); break;
      case 'ownTroopsRegion': scored = opts.map(o => ({ o, s: -REG[o.id].vp + Math.random() })); break;
      case 'recallForSpy': scored = opts.map(o => ({ o, s: gainRecall(p, o.rid) })); break;
      case 'killRegion': scored = opts.map(o => ({ o, s: REG[o.id].locs.filter(l => S.occ[l] != null && S.occ[l] !== p).length + Math.random() })); break;
      default: scored = opts.map(o => ({ o, s: Math.random() }));
    }
    if (lv(p).noise) for (const x of scored) x.s += jitter(p);
    scored.sort((a, b) => b.s - a.s);
    if (Math.random() < lv(p).blunder) return opts[Math.floor(Math.random() * opts.length)];
    // необязательные действия с отрицательной пользой можно пропустить
    if (req.optional && scored[0].s < -1.5 && req.purpose !== 'deploy') return null;
    return scored[0].o;
  }

  function resolveCards(p, req) {
    const ids = req.options; const min = req.min || 0;
    const pickBy = f => ids.slice().sort((a, b) => f(b) - f(a))[0];
    let u;
    switch (req.purpose) {
      case 'promote': {
        if (Math.random() < lv(p).blunder) return [ids[Math.floor(Math.random() * ids.length)]];
        const early = !lateGame();
        u = pickBy(x => { const d = def(x); if (d.name === 'Безумный изгой') return 9; return d.vpInner - playValue(d) * (early ? 1.2 : 0.2); });
        return [u];
      }
      case 'discard': return [pickBy(x => -keepValue(x))];
      case 'madmanDiscard': u = pickBy(x => -keepValue(x)); return keepValue(u) <= 1 ? [u] : (min ? [u] : []);
      case 'devourHand': u = pickBy(x => -keepValue(x)); return keepValue(u) <= 2.5 || min ? [u] : [];
      case 'devourMarket': u = pickBy(x => def(x).cost || 0); return [u];
      case 'devourInner': u = pickBy(x => -def(x).vpInner); return def(u).vpInner <= 2 || min ? [u] : [];
      case 'webAdd': return [pickBy(x => -playValue(def(x)) + (def(x).name.includes('пауч') ? 1 : 0))];
      case 'marketPromote': u = pickBy(x => def(x).vpInner - (def(x).cost || 0) * 0.3); return [u];
      case 'peek': case 'topdeck': case 'copy':
      case 'recruit': case 'playMarket': case 'playInner': return [pickBy(x => (def(x).cost || 0) + def(x).vpDeck * 0.3 + Math.random() * 0.2)];
      default: return min ? [ids[0]] : [ids[0]];
    }
  }

  function resolve(p, req) {
    if (req.kind === 'board') return resolveBoard(p, req);
    if (req.kind === 'cards') return resolveCards(p, req);
    if (req.kind === 'choice') {
      const en = req.options.filter(o => o.enabled);
      return en.map(o => ({ o, s: scoreV(p, o.v, o.label) })).sort((a, b) => b.s - a.s)[0].o.value;
    }
    if (req.kind === 'player') return req.purpose === 'trophySource' ? req.options[0] : leader(req.options);
    if (req.kind === 'yesno') {
      if (req.purpose === 'devourThis') return true;
      if (req.purpose === 'gem') return req.gem === 'purple' || !lateGame() && Math.random() < 0.3;
      return true;
    }
    return null;
  }

  function nextCard(p) {
    const H = S.players[p].hand;
    if (Math.random() < lv(p).blunder) return H[Math.floor(Math.random() * H.length)];
    const hasJunk = H.some(u => keepValue(u) <= 1);
    const prio = u => {
      const d = def(u);
      if (d.name === 'Безумный изгой') return H.length > 1 && hasJunk ? 100 : -100;
      if (d.name === 'Отравленный слуга') return 95;
      if (/сыгранного на этом ходу|сыграли карты с 4|за каждый отдельный аспект|Скопируйте/.test(d.text)) return 8;
      if (DEVOUR_HAND.has(d.name)) return H.length > 1 ? 60 : 5;
      if (/фокусировка/.test(d.text)) return 10;
      if (/Возьмите|возьмите/.test(d.text)) return 50;
      if (STARTERS.has(d.name)) return 30;
      return 40 - (d.cost || 0);
    };
    return H.slice().sort((a, b) => prio(b) - prio(a))[0];
  }
  function buyScore(p, b) {
    const d = def(b.uid);
    return d.cost * 1.0 + d.vpDeck * (lateGame() ? 1.0 : 0.4) + d.vpInner * 0.2 + Math.random() * 0.4 + jitter(p);
  }
  async function pause() { UI.render(); if (S.botDelay) await sleep(S.botDelay); }

  async function takeTurn(p) {
    const P = S.players[p];
    while (P.hand.length) { await playCard(p, nextCard(p)); await pause(); }
    for (const g of ['purple', 'blue', 'red']) while (P.gems && P.gems[g]) spendGem(p, g);
    while (P.stones - P.stonesNew > 0) spendStone(p, 'i');
    for (let guard = 0; guard < 20; guard++) {
      const opts = buyables(p).filter(b => b.cost <= S.pool.i);
      if (!opts.length) break;
      const best = opts.map(b => ({ b, s: buyScore(p, b) })).sort((a, c) => c.s - a.s)[0];
      buy(p, best.b); await pause();
    }
    const grabStone = () => { const sp = stoneSpots(p); if (sp.length && S.pool.p >= 1 && !S.flags.stoneTaken) captureStone(p, sp[0]); };
    grabStone();
    for (let guard = 0; guard < 40 && S.pool.p > 0; guard++) {
      grabStone();
      if (P.barracks === 0) { await actDeploy(p); await pause(); continue; }
      const deps = emptyDeployLocs(p).map(id => gainDeploy(p, id)).sort((a, b) => b - a);
      const dep3 = (deps[0] || 0) + (deps[1] || 0) * 0.8 + (deps[2] || 0) * 0.6;
      if (Math.random() < lv(p).waste) break;
      if (S.pool.p >= 3) {
        const kills = enemyTroopLocs(p).map(id => gainKill(p, id, false));
        const bestKill = kills.length ? Math.max(...kills) : -99;
        const spies = []; for (const r of T.actReg) for (const q of S.spies[r]) if (q !== p && presenceRegion(p, r)) spies.push(gainReturn(p, { t: 'spy', rid: r, owner: q }));
        const bestSpy = spies.length ? Math.max(...spies) : -99;
        if (bestKill * (lv(p).killBias || 1) >= dep3 && bestKill > 0.5 && bestKill >= bestSpy) { await actAssassinate(p); await pause(); continue; }
        if (bestSpy > dep3 && bestSpy > 0.5) { await actReturnSpy(p); await pause(); continue; }
      }
      if (!deps.length) break;
      // отстающий тяжёлый бот не выставляет последний отряд — это закончило бы игру
      if (lv(p).rush && P.barracks === 1 && !S.endTriggered && estScore(p) < Math.max(...S.players.filter(q => q.idx !== p).map(q => estScore(q.idx)))) break;
      await actDeploy(p); await pause();
    }
  }

  return { resolve, takeTurn, V, LV };
})();
