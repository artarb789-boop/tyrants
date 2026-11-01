'use strict';
// Движок правил «Тиранов Подземья»: состояние, поле, действия, ход.

const ASPECTS = { 'Покорный': 'obedience', 'Злобный': 'malice', 'Завоеватель': 'conquest', 'Коварный': 'guile', 'Честолюбивый': 'ambition' };
const ASPECT_RU = { obedience: 'покорный', malice: 'злобный', conquest: 'завоеватель', guile: 'коварный', ambition: 'честолюбивый' };
const DECK_RU = { drow: 'Дроу', dragons: 'Драконы', elementals: 'Элементали', demons: 'Демоны', aberrations: 'Аберрации', undead: 'Нежить',
  siege: 'Осада', yugoloths: 'Юголоты', arachnids: 'Паукообразные' };
const FAN_DECKS = ['siege', 'yugoloths', 'arachnids'];
// «Места Силы»: альтернативные стороны полного контроля (по 2 на регион, одна выбирается случайно)
const POP = {
  // значок паутины на стороне полного контроля — ПО (начисляются в конце хода, как в базе)
  gauntlgrym: [{ vp: 2 }, { draw: 1, discard: 1 }], menzo: [{ vp: 2, pow: 1 }, { draw: 2, discard: 1 }],
  sszuraassnii: [{ vp: 2 }, { draw: 1, discard: 1 }], chchitl: [{ vp: 2 }, { draw: 1, discard: 1 }],
  araumycos: [{ vp: 3 }, { draw: 2, discard: 0 }], sinviilik: [{ vp: 2 }, { draw: 1, discard: 1 }], faerlin: [{ vp: 2 }, { draw: 1, discard: 1 }],
};
function popText(e) {
  const a = [];
  if (e.vp) a.push(`+${e.vp} ПО в конце хода`); if (e.pow) a.push(`+${e.pow} силы`);
  if (e.draw) a.push(`взять ${e.draw}`); if (e.discard) a.push(`сбросить ${e.discard}`);
  return a.join(', ');
}
const GEM = { blue: { p: 1, i: 0, name: 'синий' }, red: { p: 0, i: 1, name: 'красный' }, purple: { p: 1, i: 1, name: 'фиолетовый' } };
const HOUSES = [
  { name: 'Баррисон Дельармго', hex: '#d8313b' },
  { name: 'Ксорларрин', hex: '#3f7ff2' },
  { name: 'Миззрим', hex: '#f28a22' },
  { name: 'Бэнр', hex: '#2a2730' },
];
const CARDS = {};
CARDS_DATA.forEach(c => { c.asp = ASPECTS[c.aspect] || null; CARDS[c.id] = c; });
const CARD_BY_NAME = {};
CARDS_DATA.forEach(c => { CARD_BY_NAME[c.name] = c; });

// Поле — регионы, локации и связи между «элементами» (регион или локация маршрута)
let BD = null, LOC = {}, REG = {};
function setBoard(b) {
  BD = b; LOC = {}; REG = {};
  b.locs.forEach(l => { LOC[l.id] = l; });
  b.regions.forEach(r => { REG[r.id] = r; });
}
// базовое поле: маршруты -> связи
BOARD.links = [];
for (const rt of BOARD.routes) { const ch = [rt.a, ...rt.nodes, rt.b]; for (let i = 0; i < ch.length - 1; i++) BOARD.links.push([ch[i], ch[i + 1]]); }
setBoard(BOARD);

// ---------- «Демоническая паутина»: модульное поле из гексов ----------
const TILE_W = 1000, TILE_H = 866, IMG_W = 1852, IMG_H = 1610;
const HEX_DIR = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];  // соседи по граням 0..5 (плоский верх)
const WEB_TILE = {}; (typeof WEB_TILES !== 'undefined' ? WEB_TILES : []).forEach(t => { WEB_TILE[t.id] = t; });
function webLayout(n, center) {
  const pick = a => a.splice(Math.floor(Math.random() * a.length), 1)[0];
  const cs = shuffle(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  const L = [{ id: center || pick(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']), q: 0, r: 0 }];
  HEX_DIR.forEach(([q, r], i) => L.push({ id: cs[i], q, r }));
  if (n === 2) L.push({ id: 'B1', q: -1, r: -1 }, { id: 'B2', q: 1, r: 1 });
  else if (n === 3) L.push({ id: 'B1', q: -1, r: -1 }, { id: 'B2', q: 2, r: -1 }, { id: pick(['B3', 'B4']), q: -1, r: 2 });
  else {
    const b34 = shuffle(['B3', 'B4']), b56 = shuffle(['B5', 'B6']), c78 = shuffle(['C7', 'C8']);
    L.push({ id: c78[0], q: 0, r: -2 }, { id: c78[1], q: 0, r: 2 }, { id: 'B1', q: -1, r: -1 }, { id: 'B2', q: 1, r: 1 },
           { id: b34[0], q: 1, r: -2 }, { id: b34[1], q: -1, r: 2 }, { id: b56[0], q: -2, r: 1 }, { id: b56[1], q: 2, r: -1 });
  }
  return L;
}
const tileExit = (t, e) => WEB_TILE[t.id].exits[((e - t.rot) % 6 + 6) % 6];
function buildWebBoard(n, center) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const L = webLayout(n, center);
    const at = {}; L.forEach(t => { at[t.q + ',' + t.r] = t; });
    // повороты: каждый тайл — с максимумом соединений с уже выложенными соседями
    L.forEach((t, i) => {
      let best = -1, opts = [];
      for (let k = 0; k < 6; k++) {
        t.rot = k; let m = 0;
        for (let e = 0; e < 6; e++) {
          const nb = at[(t.q + HEX_DIR[e][0]) + ',' + (t.r + HEX_DIR[e][1])];
          if (nb && nb.rot != null && L.indexOf(nb) < i && tileExit(t, e) && tileExit(nb, (e + 3) % 6)) m++;
        }
        if (m > best) { best = m; opts = [k]; } else if (m === best) opts.push(k);
      }
      t.rot = opts[Math.floor(Math.random() * opts.length)];
    });
    // все гексы должны быть достижимы
    const seen = new Set([L[0]]), st = [L[0]];
    while (st.length) {
      const t = st.pop();
      for (let e = 0; e < 6; e++) {
        const nb = at[(t.q + HEX_DIR[e][0]) + ',' + (t.r + HEX_DIR[e][1])];
        if (nb && !seen.has(nb) && tileExit(t, e) && tileExit(nb, (e + 3) % 6)) { seen.add(nb); st.push(nb); }
      }
    }
    if (seen.size === L.length) return assembleWeb(L, at);
  }
  throw new Error('не удалось собрать поле');
}
function assembleWeb(L, at) {
  const b = { web: true, tiles: [], regions: [], locs: [], links: [], combos: [], stones: [] };
  const elId = (t, key) => {
    const tr = WEB_TILE[t.id].regions.find(r => r.key === key);
    return tr ? (tr.token || t.id + '_' + key) : t.id + '_' + key;
  };
  for (const t of L) {
    const td = WEB_TILE[t.id];
    const cx = t.q * TILE_W * 0.75, cy = (t.r + t.q / 2) * TILE_H;
    const a = t.rot * Math.PI / 3, sc = TILE_W / IMG_W;
    const P = (x, y) => { const dx = (x - IMG_W / 2) * sc, dy = (y - IMG_H / 2) * sc; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; };
    b.tiles.push({ id: t.id, x: cx, y: cy, rot: t.rot });
    for (const r of td.regions) {
      const rid = elId(t, r.key);
      const reg = { id: rid, name: r.name, vp: r.vp, start: r.start, sec: 'C', locs: [], token: r.token ? { inf: 1, fullVp: r.fullVp } : null };
      r.locs.forEach((l, i) => { const [x, y] = P(l.x, l.y); const id = rid + '_' + i; reg.locs.push(id); b.locs.push({ id, x, y, region: rid, sec: 'C', white: l.white }); });
      b.regions.push(reg);
    }
    for (const nd of td.nodes) { const [x, y] = P(nd.x, nd.y); b.locs.push({ id: elId(t, nd.key), x, y, region: null, sec: 'C', white: false, name: `маршрут (тайл ${t.id})` }); }
    for (const [x, y] of td.links) b.links.push([elId(t, x), elId(t, y)]);
    if (td.combo) b.combos.push(td.regions.map(r => elId(t, r.key)));
    for (let e = 0; e < 6; e++) {
      const ex = tileExit(t, e); if (!ex) continue;
      const nb = at[(t.q + HEX_DIR[e][0]) + ',' + (t.r + HEX_DIR[e][1])];
      const ex2 = nb ? tileExit(nb, (e + 3) % 6) : null;
      if (ex2) { if (L.indexOf(nb) > L.indexOf(t)) b.links.push([elId(t, ex), elId(nb, ex2)]); }
      else if (ex[0] === 'N') b.stones.push(elId(t, ex));  // тупик маршрута — Камень Силы
    }
  }
  const xs = b.tiles.map(t => t.x), ys = b.tiles.map(t => t.y);
  b.view = [Math.min(...xs) - TILE_W / 2 - 20, Math.min(...ys) - TILE_H / 2 - 20, Math.max(...xs) - Math.min(...xs) + TILE_W + 40, Math.max(...ys) - Math.min(...ys) + TILE_H + 40];
  b.stones = [...new Set(b.stones)];
  return b;
}

let S = null;   // состояние партии
let T = null;   // топология активной части поля

const sleep = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function take(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }
const def = uid => CARDS[S.cards[uid]];
const pn = p => `<b style="color:${S.players[p].hex === '#2a2730' ? '#b9b3c6' : S.players[p].hex}">${S.players[p].name}</b>`;
const cn = uid => `«${def(uid).name}»`;
function log(msg) {
  // строки игрока, пока разыгрывается его карта, дописываются в строку «играет …»
  const m = S.logMerge, last = S.log.length - 1;
  if (m && S.log[last] === m.line && msg.startsWith(m.pre)) {
    const rest = msg.slice(m.pre.length).replace(/^:?\s*/, '');
    m.line = S.log[last] = m.line.replace(/\.$/, '') + (m.n++ ? '; ' : ': ') + rest;
    UI.onLog && UI.onLog(m.line, true); return;
  }
  S.log.push(msg); if (S.log.length > 400) S.log.shift(); UI.onLog && UI.onLog(msg);
}

// ---------- топология ----------
function buildTopology(sections) {
  const act = new Set(BD.locs.filter(l => sections.includes(l.sec)).map(l => l.id));
  const actReg = new Set(BD.regions.filter(r => sections.includes(r.sec)).map(r => r.id));
  const adj = {}; act.forEach(id => { adj[id] = new Set(); });
  const regAdj = {}; actReg.forEach(r => { regAdj[r] = new Set(); });
  const link = (a, b) => { if (act.has(a) && act.has(b)) { adj[a].add(b); adj[b].add(a); } };
  const locsOf = e => (REG[e] ? REG[e].locs : [e]);
  for (const [x, y] of BD.links) for (const a of locsOf(x)) for (const b of locsOf(y)) link(a, b);
  for (const r of actReg) for (const l of REG[r].locs) if (act.has(l)) for (const n of adj[l]) if (LOC[n].region !== r) regAdj[r].add(n);
  return { act, actReg, adj, regAdj, sections };
}

// ---------- запросы к игрокам ----------
async function ask(p, req) {
  req.p = p;
  if (S.players[p].bot) { if (S.botDelay) await sleep(S.botDelay); return AI.resolve(p, req); }
  return UI.ask(p, req);
}

// ---------- создание партии ----------
function mkCard(cid) { const uid = S.nextUid++; S.cards[uid] = cid; return uid; }
function cidByName(n) { return CARD_BY_NAME[n].id; }

function newGame(cfg) {
  const n = cfg.players.length;
  setBoard(cfg.board === 'web' ? buildWebBoard(n, cfg.center) : BOARD);
  const sections = BD.web ? ['C'] : n === 2 ? ['C'] : n === 3 ? ['C', cfg.side || 'L'] : ['L', 'C', 'R'];
  S = { nextUid: 1, cards: {}, log: [], players: [], occ: {}, spies: {}, tokens: {}, market: [], mdeck: [], devoured: [],
        supply: { guard: [], priest: [], madman: [], poison: [] }, pool: { p: 0, i: 0 }, played: [], eot: [], eotWeb: [], flags: {},
        modules: cfg.modules || {}, gems: {}, stones: {}, board: BD,
        first: 0, cur: 0, turnNo: 0, round: 1, endTriggered: false, over: false, phase: 'setup', botDelay: cfg.botDelay ?? 450,
        decks: cfg.decks };
  T = buildTopology(sections);
  cfg.players.forEach((pc, i) => {
    const P = { idx: i, name: pc.name, hex: pc.hex, house: pc.house, bot: !!pc.bot, level: pc.level || 'normal', deck: [], hand: [], discard: [], inner: [],
                barracks: 40, spiesFree: 5, trophies: {}, vp: 0, web: [], gems: { blue: 0, red: 0, purple: 0 }, stones: 0, stonesNew: 0 };
    for (let k = 0; k < 7; k++) P.deck.push(mkCard(cidByName('Знать')));
    for (let k = 0; k < 3; k++) P.deck.push(mkCard(cidByName('Солдат')));
    shuffle(P.deck);
    S.players.push(P);
  });
  for (let k = 0; k < 15; k++) S.supply.guard.push(mkCard(cidByName('Страж Дома')));
  for (let k = 0; k < 15; k++) S.supply.priest.push(mkCard(cidByName('Жрица Ллот')));
  for (let k = 0; k < 30; k++) S.supply.madman.push(mkCard(cidByName('Безумный изгой')));
  if (cfg.decks.includes('arachnids')) for (let k = 0; k < 20; k++) S.supply.poison.push(mkCard(cidByName('Отравленный слуга')));
  for (const d of cfg.decks) for (const c of CARDS_DATA.filter(c => c.deck === d)) for (let k = 0; k < c.count; k++) S.mdeck.push(mkCard(c.id));
  shuffle(S.mdeck);
  for (let k = 0; k < 6; k++) S.market.push(S.mdeck.pop());
  for (const id of T.act) S.occ[id] = LOC[id].white ? 'W' : null;
  for (const r of T.actReg) {
    S.spies[r] = [];
    if (REG[r].token) S.tokens[r] = { owner: null, full: false, infTurn: -1, pop: S.modules.pop && POP[r] ? POP[r][Math.floor(Math.random() * 2)] : null };
  }
  for (const id of BD.stones || []) if (S.occ[id] === null) S.stones[id] = true;
  if (S.modules.gems) {
    const bag = shuffle([...Array(15).fill('purple'), ...Array(35).fill('blue'), ...Array(35).fill('red')]);
    for (const id of T.act) if (S.occ[id] === 'W' && bag.length) S.gems[id] = bag.pop();
  }
  S.first = Math.floor(Math.random() * n);
  S.cur = S.first;
  log(`Новая партия: ${n} игрока, колоды рынка — ${cfg.decks.map(d => DECK_RU[d]).join(' + ')}.`);
  log(`Первый игрок — ${pn(S.first)}.`);
  return S;
}

// ---------- чтение поля ----------
function regionCounts(rid) { const c = {}; for (const l of REG[rid].locs) { const o = S.occ[l]; if (o != null) c[o] = (c[o] || 0) + 1; } return c; }
function controller(rid) {
  const c = regionCounts(rid); let best = null, bv = 0, tie = false;
  for (const k in c) { if (c[k] > bv) { bv = c[k]; best = k; tie = false; } else if (c[k] === bv) tie = true; }
  if (best === null || tie || best === 'W') return null;
  return +best;
}
function fullControl(rid, p) {
  if (!REG[rid].locs.every(l => S.occ[l] === p)) return false;
  return !S.spies[rid].some(q => q !== p);
}
function presenceRegion(p, rid) {
  if (S.spies[rid].includes(p)) return true;
  if (REG[rid].locs.some(l => S.occ[l] === p)) return true;
  for (const n of T.regAdj[rid]) if (S.occ[n] === p) return true;
  return false;
}
function presenceLoc(p, id) {
  const l = LOC[id];
  if (l.region) return presenceRegion(p, l.region);
  if (S.occ[id] === p) return true;
  for (const n of T.adj[id]) if (S.occ[n] === p) return true;
  return false;
}
function troopsOnBoard(p) { let n = 0; for (const id of T.act) if (S.occ[id] === p) n++; return n; }
function ownSpies(p) { return [...T.actReg].filter(r => S.spies[r].includes(p)); }
function trophyCount(p, filter) { const t = S.players[p].trophies; let n = 0; for (const k in t) if (!filter || filter(k)) n += t[k]; return n; }
function locName(id) {
  const l = LOC[id]; if (l.region) return REG[l.region].name; if (l.name) return l.name;
  const rt = BOARD.routes.find(r => r.nodes.includes(id)); return `маршрут ${REG[rt.a].name} — ${REG[rt.b].name}`;
}
// Камни Силы («Демоническая паутина»): захват за 1 силу (1 за ход), трата — 3 силы или 3 влияния, не в ход захвата
function stoneSpots(p) { return Object.keys(S.stones).filter(id => S.occ[id] === p); }
function captureStone(p, id) {
  if (S.pool.p < 1 || S.flags.stoneTaken || S.occ[id] !== p || !S.stones[id]) return false;
  S.pool.p -= 1; delete S.stones[id]; S.flags.stoneTaken = true;
  S.players[p].stones++; S.players[p].stonesNew++;
  log(`${pn(p)} захватывает Камень Силы: ${locName(id)}.`); return true;
}
function spendStone(p, kind) {
  const P = S.players[p]; if (P.stones - P.stonesNew < 1) return false;
  P.stones--; if (kind === 'p') S.pool.p += 3; else S.pool.i += 3;
  log(`${pn(p)} тратит Камень Силы: +3 ${kind === 'p' ? 'силы' : 'влияния'}.`); return true;
}
// бонус тайла A2 за три региона
function applyCombos(p) {
  for (const regs of BD.combos || []) {
    if (!regs.every(r => REG[r] && T.actReg.has(r))) continue;
    const names = regs.map(r => REG[r].name).join(', ');
    if (regs.every(r => controller(r) === p)) {
      if (regs.every(r => fullControl(r, p))) { S.pool.i += 2; S.pool.p += 2; log(`${pn(p)}: полный контроль (${names}) — +2 влияния, +2 силы.`); gainVP(p, 4, names); }
      else { S.pool.i += 1; S.pool.p += 1; log(`${pn(p)}: контроль (${names}) — +1 влияния, +1 силы.`); gainVP(p, 1, names); }
    } else if (regs.every(r => REG[r].locs.some(l => S.occ[l] === p))) { S.pool.i += 1; log(`${pn(p)}: отряды во всех регионах (${names}) — +1 влияния.`); }
  }
}
function controlledRegions(p) { return [...T.actReg].filter(r => controller(r) === p); }

// ---------- изменения поля ----------
function updateControl() {
  for (const rid of T.actReg) {
    const t = S.tokens[rid]; if (!t) continue;
    const c = controller(rid);
    if (c !== t.owner) {
      if (t.owner != null) log(`${pn(t.owner)} теряет жетон контроля «${REG[rid].name}».`);
      t.owner = c;
      if (c != null) {
        log(`${pn(c)} получает жетон контроля «${REG[rid].name}».`);
        if (c === S.cur && S.phase === 'turn' && t.infTurn !== S.turnNo) { t.infTurn = S.turnNo; S.pool.i += 1; log(`${pn(c)}: +1 влияние от жетона.`); }
      }
    }
    t.full = c != null && fullControl(rid, c);
  }
}
function gainVP(p, n, why) { S.players[p].vp += n; log(`${pn(p)} получает ${n} ПО${why ? ` (${why})` : ''}.`); }
function triggerEnd(reason) { if (!S.endTriggered) { S.endTriggered = true; log(`<b>Условие конца игры:</b> ${reason}. Раунд доигрывается до конца.`); } }
function placeTroop(p, id) {
  const P = S.players[p];
  if (P.barracks === 0) { gainVP(p, 1, 'в казармах нет отрядов'); return false; }
  S.occ[id] = p; P.barracks--;
  log(`${pn(p)} отправляет отряд: ${locName(id)}.`);
  if (P.barracks === 0) triggerEnd(`${P.name} отправил последний отряд`);
  updateControl();
  return true;
}
async function killTroop(p, id) {
  const v = S.occ[id]; S.occ[id] = null;
  const P = S.players[p];
  log(`${pn(p)} уничтожает ${v === 'W' ? 'белый отряд' : 'отряд ' + pn(v)}: ${locName(id)}.`);
  const gem = v === 'W' ? S.gems[id] : null;
  if (gem) {
    delete S.gems[id];
    const takeGem = await ask(p, { kind: 'yesno', text: `Под белым отрядом ${GEM[gem].name} камень. Вернуть отряд в запас и забрать камень? (Нет — отряд в трофейный зал, камень уходит из игры)`, purpose: 'gem', gem });
    if (takeGem) { P.gems[gem]++; log(`${pn(p)} забирает ${GEM[gem].name} камень, белый отряд уходит в запас.`); updateControl(); return v; }
    log('Камень убран из игры.');
  }
  P.trophies[v] = (P.trophies[v] || 0) + 1;
  updateControl();
  return v;
}
function spendGem(p, g) {
  const P = S.players[p]; if (!P.gems[g]) return;
  P.gems[g]--; S.pool.p += GEM[g].p; S.pool.i += GEM[g].i;
  log(`${pn(p)} тратит ${GEM[g].name} камень.`);
}
function removeSpy(owner, rid) { take(S.spies[rid], owner); S.players[owner].spiesFree++; updateControl(); }

// ---------- карты ----------
function drawCards(p, n) {
  const P = S.players[p]; let k = 0;
  for (let i = 0; i < n; i++) {
    if (!P.deck.length) { if (!P.discard.length) break; P.deck = shuffle(P.discard); P.discard = []; log(`${pn(p)} замешивает сброс в колоду.`); }
    P.hand.push(P.deck.pop()); k++;
  }
  return k;
}
function topOfDeck(p) {
  const P = S.players[p];
  if (!P.deck.length) { if (!P.discard.length) return null; P.deck = shuffle(P.discard); P.discard = []; log(`${pn(p)} замешивает сброс в колоду.`); }
  return P.deck[P.deck.length - 1];
}
function isMadman(uid) { return def(uid).name === 'Безумный изгой'; }
function isPoison(uid) { return def(uid).name === 'Отравленный слуга'; }
function isJunk(uid) { return isMadman(uid) || isPoison(uid); }
function returnJunk(uid) { (isMadman(uid) ? S.supply.madman : S.supply.poison).push(uid); log(`${def(uid).name} возвращается в резерв.`); }
function promoteCard(p, uid) {
  if (isJunk(uid)) { returnJunk(uid); return; }
  S.players[p].inner.push(uid); log(`${pn(p)} повышает ${cn(uid)} во внутренний круг.`);
}
function devourCard(uid, who) {
  if (isJunk(uid)) { returnJunk(uid); return; }
  S.devoured.push(uid); log(`${who != null ? pn(who) + ' поглощает' : 'Поглощена'} ${cn(uid)}.`);
}
function refillMarket(slot) {
  S.market[slot] = S.mdeck.length ? S.mdeck.pop() : null;
  if (!S.mdeck.length) triggerEnd('закончилась колода рынка');
}
// «Сторожевой зверь»: когда противник заставляет нанять изгоя, сбросить карту или вернуть шпиона
async function sentryReact(t) {
  const P = S.players[t];
  const u = P.hand.find(x => def(x).name === 'Сторожевой зверь');
  if (u == null) return;
  const yes = await ask(t, { kind: 'yesno', text: 'Сыграть «Сторожевого зверя»: +1 ПО и взять карту?', purpose: 'sentry', card: S.cards[u] });
  if (!yes) return;
  take(P.hand, u); P.discard.push(u);
  log(`${pn(t)} разыгрывает «Сторожевого зверя».`);
  gainVP(t, 1, 'Сторожевой зверь'); drawCards(t, 1);
}
async function giveMadman(t, byOpponent = true) {
  if (!S.supply.madman.length) { log('Резерв Безумных изгоев пуст.'); return; }
  S.players[t].discard.push(S.supply.madman.pop());
  log(`${pn(t)} получает Безумного изгоя.`);
  if (byOpponent) await sentryReact(t);
}
function givePoison(t) {
  if (!S.supply.poison.length) { log('Резерв Отравленных слуг пуст.'); return; }
  S.players[t].discard.push(S.supply.poison.pop());
  log(`${pn(t)} получает Отравленного слугу.`);
}
function aspectsPlayed() { return new Set(S.played.map(u => def(u).asp).filter(Boolean)).size; }
function webCount(p, asp) { return S.players[p].web.filter(u => def(u).asp === asp).length; }
function costOf(uid) { const c = def(uid).cost; return c == null ? null : Math.max(0, c - (S.flags.discount || 0)); }
// покупаемые сейчас карты: [{uid, src, slot?, cost}]
function buyables(p, opt = {}) {
  const res = [];
  S.market.forEach((u, i) => { if (u != null) res.push({ uid: u, src: 'market', slot: i, cost: costOf(u) }); });
  if (S.supply.guard.length) { const u = S.supply.guard[S.supply.guard.length - 1]; res.push({ uid: u, src: 'guard', cost: costOf(u) }); }
  if (S.supply.priest.length) { const u = S.supply.priest[S.supply.priest.length - 1]; res.push({ uid: u, src: 'priest', cost: costOf(u) }); }
  if (S.flags.devouredBuy && S.devoured.length && opt.withDevoured !== false) {
    const u = S.devoured[S.devoured.length - 1]; if (def(u).cost != null) res.push({ uid: u, src: 'devoured', cost: costOf(u) });
  }
  return res;
}
function takeBuyable(p, b) {
  if (b.src === 'market') refillMarket(b.slot);
  else if (b.src === 'guard') S.supply.guard.pop();
  else if (b.src === 'priest') S.supply.priest.pop();
  else if (b.src === 'devoured') S.devoured.pop();
  S.players[p].discard.push(b.uid);
}
function buy(p, b) {
  if (S.pool.i < b.cost) return false;
  S.pool.i -= b.cost; takeBuyable(p, b);
  log(`${pn(p)} нанимает ${cn(b.uid)} за ${b.cost} влияния.`);
  return true;
}

// ---------- примитивы эффектов ----------
const opt = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);
function bt(ctx, purpose, text, opts, extra = {}) {
  if (!opts.length) return Promise.resolve(null);
  return ask(ctx.p, Object.assign({ kind: 'board', purpose, text, opts, optional: true, card: ctx.cid }, extra));
}
function emptyDeployLocs(p, anywhere) {
  const all = [...T.act].filter(id => S.occ[id] == null);
  if (anywhere || troopsOnBoard(p) === 0) return all;
  return all.filter(id => presenceLoc(p, id));
}
async function deploy(ctx, n = 1, o = {}) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (S.players[ctx.p].barracks === 0) { gainVP(ctx.p, 1, 'в казармах нет отрядов'); done++; continue; }
    const opts = o.locs ? o.locs.filter(id => S.occ[id] == null) : emptyDeployLocs(ctx.p, o.anywhere);
    const ch = await bt(ctx, 'deploy', `Отправьте отряд${n > 1 ? ` (${i + 1} из ${n})` : ''}`, opts.map(id => ({ t: 'loc', id })));
    if (!ch) break;
    placeTroop(ctx.p, ch.id); done++;
    if (ctx.deployed) ctx.deployed.push(ch.id);
  }
  return done;
}
function enemyTroopLocs(p, o = {}) {
  return [...T.act].filter(id => {
    const v = S.occ[id];
    if (v == null || v === p) return false;
    if (o.white && v !== 'W' && !S.flags.siege) return false;
    if (o.players && v === 'W') return false;
    if (o.region && LOC[id].region !== o.region) return false;
    if (o.anywhere || o.noPresence) return true;
    return presenceLoc(p, id);
  });
}
async function assassinate(ctx, n = 1, o = {}) {
  const res = [];
  for (let i = 0; i < n; i++) {
    const opts = enemyTroopLocs(ctx.p, o);
    const what = o.white ? 'белый отряд' : 'отряд';
    const ch = await bt(ctx, o.white ? 'killWhite' : 'kill', `Уничтожьте ${what}${n > 1 ? ` (${i + 1} из ${n})` : ''}`, opts.map(id => ({ t: 'loc', id })));
    if (!ch) break;
    res.push(await killTroop(ctx.p, ch.id));
  }
  return res;
}
async function supplant(ctx, o = {}) {
  const opts = enemyTroopLocs(ctx.p, o);
  const ch = await bt(ctx, 'supplant', `Вытесните ${o.white ? 'белый ' : 'вражеский '}отряд`, opts.map(id => ({ t: 'loc', id })));
  if (!ch) return null;
  const v = await killTroop(ctx.p, ch.id);
  placeTroop(ctx.p, ch.id);
  return v;
}
async function returnEnemy(ctx, n = 1, o = {}) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const opts = [];
    if (!o.spiesOnly) for (const id of T.act) { const v = S.occ[id]; if (v != null && v !== 'W' && v !== ctx.p && presenceLoc(ctx.p, id)) opts.push({ t: 'loc', id }); }
    if (!o.troopsOnly) for (const r of T.actReg) for (const q of S.spies[r]) if (q !== ctx.p && presenceRegion(ctx.p, r)) opts.push({ t: 'spy', rid: r, owner: q });
    const ch = await bt(ctx, 'return', o.spiesOnly ? 'Вышлите вражеского шпиона' : 'Вышлите вражеский отряд или шпиона', opts);
    if (!ch) break;
    if (ch.t === 'loc') { const v = S.occ[ch.id]; S.occ[ch.id] = null; S.players[v].barracks++; log(`${pn(ctx.p)} высылает отряд ${pn(v)}: ${locName(ch.id)}.`); updateControl(); }
    else { removeSpy(ch.owner, ch.rid); log(`${pn(ctx.p)} высылает шпиона ${pn(ch.owner)} из «${REG[ch.rid].name}».`); await sentryReact(ch.owner); }
    done++;
  }
  return done;
}
async function moveEnemy(ctx, n = 1) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const from = enemyTroopLocs(ctx.p, {});
    const a = await bt(ctx, 'moveFrom', `Переместите вражеский отряд${n > 1 ? ` (${i + 1} из ${n})` : ''}: выберите отряд`, from.map(id => ({ t: 'loc', id })));
    if (!a) break;
    const to = [...T.act].filter(id => S.occ[id] == null);
    const b = await bt(ctx, 'moveTo', 'Куда переместить отряд?', to.map(id => ({ t: 'loc', id })), { optional: false, from: a.id });
    if (!b) break;
    const v = S.occ[a.id]; S.occ[a.id] = null; S.occ[b.id] = v;
    log(`${pn(ctx.p)} перемещает ${v === 'W' ? 'белый отряд' : 'отряд ' + pn(v)}: ${locName(a.id)} → ${locName(b.id)}.`);
    updateControl(); done++;
  }
  return done;
}
async function placeSpy(ctx, o = {}) {
  const P = S.players[ctx.p];
  if (P.spiesFree === 0) {
    const own = ownSpies(ctx.p);
    if (!own.length) return null;
    const r = await bt(ctx, 'recallForSpy', 'Все шпионы на поле: верните одного, чтобы внедрить его заново', own.map(rid => ({ t: 'spy', rid, owner: ctx.p })));
    if (!r) return null;
    removeSpy(ctx.p, r.rid);
  }
  const opts = [...T.actReg].filter(rid => !S.spies[rid].includes(ctx.p) && !(o.exclude || []).includes(rid));
  const ch = await bt(ctx, 'spy', 'Внедрите шпиона: выберите регион', opts.map(id => ({ t: 'region', id })), { follow: o.follow });
  if (!ch) return null;
  S.spies[ch.id].push(ctx.p); P.spiesFree--;
  log(`${pn(ctx.p)} внедряет шпиона: «${REG[ch.id].name}».`);
  updateControl();
  return ch.id;
}
async function returnOwnSpy(ctx, follow) {
  const own = ownSpies(ctx.p);
  const ch = await bt(ctx, 'recall', 'Верните своего шпиона', own.map(rid => ({ t: 'spy', rid, owner: ctx.p })), { follow });
  if (!ch) return null;
  removeSpy(ctx.p, ch.rid);
  log(`${pn(ctx.p)} возвращает шпиона из «${REG[ch.rid].name}».`);
  return ch.rid;
}
function gain(ctx, p = 0, i = 0) {
  S.pool.p += p; S.pool.i += i;
  const parts = []; if (p) parts.push(`+${p} силы`); if (i) parts.push(`+${i} влияния`);
  if (parts.length) log(`${pn(ctx.p)}: ${parts.join(', ')}.`);
}
function draw(ctx, n) { const k = drawCards(ctx.p, n); if (k) log(`${pn(ctx.p)} берёт карт: ${k}.`); }
function hasFocus(ctx, asp) {
  const i = S.played.indexOf(ctx.uid);
  const before = i >= 0 ? S.played.slice(0, i) : S.played;
  return before.some(u => def(u).asp === asp);
}
async function chooseOne(ctx, options, text = 'Выберите одно:') {
  const list = options.map((o, i) => ({ label: o.label, value: i, enabled: o.enabled !== false, v: o.v || {} }));
  if (!list.some(o => o.enabled)) return;
  const v = await ask(ctx.p, { kind: 'choice', text, options: list, card: ctx.cid, optional: true });
  if (v == null) return;
  await options[v].fn();
}
async function yesno(ctx, text, purpose, extra = {}) {
  return ask(ctx.p, Object.assign({ kind: 'yesno', text, purpose, card: ctx.cid }, extra));
}
async function pickCards(p, text, uids, o = {}) {
  if (!uids.length) return [];
  return ask(p, Object.assign({ kind: 'cards', text, options: uids, min: 0, max: 1 }, o));
}
async function devourFromHand(ctx, text) {
  const P = S.players[ctx.p];
  if (!P.hand.length) return false;
  const ch = await pickCards(ctx.p, text || 'Поглотите карту с руки (или пропустите)', [...P.hand], { purpose: 'devourHand', card: ctx.cid });
  if (!ch || !ch.length) return false;
  take(P.hand, ch[0]); devourCard(ch[0], ctx.p);
  return true;
}
async function devourMarket(ctx, o = {}) {
  const opts = S.market.filter(u => u != null);
  const ch = await pickCards(ctx.p, 'Поглотите карту с рынка' + (o.optional === false ? '' : ' (или пропустите)'), opts, { purpose: 'devourMarket', card: ctx.cid, min: o.optional === false ? 1 : 0 });
  if (!ch || !ch.length) return null;
  const slot = S.market.indexOf(ch[0]);
  devourCard(ch[0], ctx.p);
  if (o.replaceWith != null) { S.market[slot] = o.replaceWith; } else refillMarket(slot);
  return ch[0];
}
async function devourThis(ctx, text) {
  if (!S.played.includes(ctx.uid)) return false;
  const yes = await yesno(ctx, text, 'devourThis');
  if (!yes) return false;
  take(S.played, ctx.uid); devourCard(ctx.uid, ctx.p);
  return true;
}
function eotPromote(ctx, o = {}) { S.eot.push(Object.assign({ src: ctx.uid, p: ctx.p, max: 1, filter: null }, o)); }
function promoteTop(ctx) {
  const u = topOfDeck(ctx.p); if (u == null) return;
  S.players[ctx.p].deck.pop(); promoteCard(ctx.p, u);
}
async function recruitFree(ctx, o = {}) {
  const opts = buyables(ctx.p, { withDevoured: false }).filter(b => b.cost != null && b.cost <= o.maxCost && (!o.asp || def(b.uid).asp === o.asp));
  const uniq = []; const seen = new Set();
  for (const b of opts) { const k = b.src === 'market' ? 'm' + b.slot : b.src; if (!seen.has(k)) { seen.add(k); uniq.push(b); } }
  const ch = await pickCards(ctx.p, o.text || 'Наймите слугу без оплаты', uniq.map(b => b.uid), { purpose: 'recruit', card: ctx.cid });
  if (!ch || !ch.length) return false;
  const b = uniq.find(x => x.uid === ch[0]);
  takeBuyable(ctx.p, b); log(`${pn(ctx.p)} бесплатно нанимает ${cn(b.uid)}.`);
  return true;
}
async function chooseOpponent(ctx, filter, text, purpose) {
  const opts = S.players.map(P => P.idx).filter(q => q !== ctx.p && (!filter || filter(q)));
  if (!opts.length) return null;
  if (opts.length === 1) return opts[0];
  return ask(ctx.p, { kind: 'player', text, options: opts, purpose, card: ctx.cid });
}
async function forceDiscard(ctx, t) {
  const TP = S.players[t]; if (!TP.hand.length) return;
  const ch = await pickCards(t, `${S.players[ctx.p].name} заставляет вас сбросить карту`, [...TP.hand], { min: 1, purpose: 'discard', forced: true });
  const uid = ch[0]; const d = def(uid);
  if (d.name === 'Посол') {
    const yes = await ask(t, { kind: 'yesno', text: 'Повысить «Посла» во внутренний круг вместо сброса?', purpose: 'ambassador', card: d.id });
    if (yes) { take(TP.hand, uid); promoteCard(t, uid); return; }
  }
  take(TP.hand, uid); TP.discard.push(uid); log(`${pn(t)} сбрасывает ${cn(uid)}.`);
  await sentryReact(t);
  if (d.name === 'Гримлок') { const k = drawCards(t, 2); log(`${pn(t)}: Гримлок — берёт карт: ${k}.`); }
  if (d.name === 'Бурый увалень') {
    const MP = S.players[ctx.p];
    if (MP.hand.length) {
      const c2 = await pickCards(ctx.p, 'Бурый увалень: вы сами должны сбросить карту', [...MP.hand], { min: 1, purpose: 'discard', forced: true });
      take(MP.hand, c2[0]); MP.discard.push(c2[0]); log(`${pn(ctx.p)} сбрасывает ${cn(c2[0])}.`);
    }
  }
}
async function madmanClockwise(targets, k = 1) {
  // при нехватке изгоев раздаём по часовой стрелке от первого игрока
  const order = S.players.map((_, i) => (S.first + i) % S.players.length).filter(q => targets.includes(q));
  for (let r = 0; r < k; r++) for (const q of order) await giveMadman(q);
}
function vpPerTokens(p) { return Object.values(S.tokens).filter(t => t.owner === p).length; }

// ---------- розыгрыш карт ----------
function ctxFor(p, uid) { return { p, uid, cid: S.cards[uid], card: def(uid) }; }
async function playCard(p, uid, src = 'hand') {
  const P = S.players[p];
  if (src === 'hand') take(P.hand, uid);
  if (src !== 'inner') S.played.push(uid);
  log(`${pn(p)} играет ${cn(uid)}${src === 'market' ? ' с рынка' : src === 'inner' ? ' из внутреннего круга' : ''}.`);
  const fx = EFFECTS[def(uid).name], outer = S.logMerge;
  S.logMerge = { pre: pn(p), line: S.log[S.log.length - 1], n: 0 };
  try { if (fx) await fx(ctxFor(p, uid)); else log(`(эффект ${cn(uid)} не реализован)`); }
  finally { S.logMerge = outer; }
}

// ---------- основные действия за ресурсы ----------
async function actDeploy(p) {
  if (S.pool.p < 1) return;
  const ctx = ctxFor(p, null); ctx.cid = null;
  if (S.players[p].barracks === 0) { S.pool.p -= 1; gainVP(p, 1, 'в казармах нет отрядов'); return; }
  const n = await deploy(ctx, 1); if (n) S.pool.p -= 1;
}
async function actAssassinate(p) {
  if (S.pool.p < 3) return;
  const ctx = ctxFor(p, null); ctx.cid = null;
  const r = await assassinate(ctx, 1); if (r.length) S.pool.p -= 3;
}
async function actReturnSpy(p) {
  if (S.pool.p < 3) return;
  const ctx = ctxFor(p, null); ctx.cid = null;
  const n = await returnEnemy(ctx, 1, { spiesOnly: true }); if (n) S.pool.p -= 3;
}

// ---------- ход ----------
async function initialDeploy() {
  S.phase = 'initial';
  const n = S.players.length;
  for (let k = 0; k < n; k++) {
    const p = (S.first + k) % n; S.cur = p;
    const freeRegs = [...T.actReg].filter(r => REG[r].start && !REG[r].locs.some(l => S.occ[l] != null && S.occ[l] !== 'W'));
    const opts = []; for (const r of freeRegs) for (const l of REG[r].locs) if (S.occ[l] == null) opts.push({ t: 'loc', id: l });
    UI.render();
    const ch = await ask(p, { kind: 'board', purpose: 'initial', text: 'Выставьте стартовый отряд в свободный стартовый регион', opts, optional: false });
    placeTroop(p, ch.id);
  }
  for (const P of S.players) drawCards(P.idx, 5);
  S.cur = S.first;
}
async function startTurn() {
  S.phase = 'turn'; S.turnNo++;
  S.pool = { p: 0, i: 0 }; S.played = []; S.eot = []; S.eotWeb = []; S.flags = {};
  log(`<hr>Ход: ${pn(S.cur)}${S.cur === S.first ? ` (раунд ${S.round})` : ''}`);
  for (const rid in S.tokens) {
    const t = S.tokens[rid];
    if (t.owner !== S.cur || t.infTurn === S.turnNo) continue;
    t.infTurn = S.turnNo;
    if (t.pop && t.full) await applyPop(S.cur, rid, t.pop);
    else { S.pool.i += 1; log(`${pn(S.cur)}: +1 влияние от жетона «${REG[rid].name}».`); }
  }
  applyCombos(S.cur);
  UI.render();
  if (S.players[S.cur].bot) { await AI.takeTurn(S.cur); await endTurn(); }
  else UI.humanTurn();
}
// начало хода: сила и добор/сброс с жетона «Места Силы» (ПО — в конце хода)
async function applyPop(p, rid, e) {
  if (!e.pow && !e.draw) return;
  log(`${pn(p)}: полный контроль «${REG[rid].name}» — ${popText(Object.assign({}, e, { vp: 0 }))}.`);
  S.pool.p += e.pow || 0;
  if (e.draw) drawCards(p, e.draw);
  for (let k = 0; k < (e.discard || 0); k++) {
    const P = S.players[p]; if (!P.hand.length) break;
    const ch = await ask(p, { kind: 'cards', text: `«${REG[rid].name}»: сбросьте карту`, options: [...P.hand], min: 1, max: 1, purpose: 'discard' });
    take(P.hand, ch[0]); P.discard.push(ch[0]); log(`${pn(p)} сбрасывает ${cn(ch[0])}.`);
  }
}
async function endTurn() {
  const p = S.cur, P = S.players[p];
  S.phase = 'endturn';
  for (const r of S.eot) {
    for (let k = 0; k < r.max; k++) {
      const cand = S.played.filter(u => u !== r.src && (!r.filter || r.filter(u)));
      if (!cand.length) break;
      const ch = await pickCards(p, r.text || `Конец хода: повысьте ${r.what || 'другого слугу'}, сыгранного на этом ходу${r.max > 1 ? ` (${k + 1} из ${r.max})` : ''}`, cand, { purpose: 'promote', card: S.cards[r.src] });
      if (!ch || !ch.length) break;
      take(S.played, ch[0]); promoteCard(p, ch[0]);
    }
    if (r.after) r.after();
  }
  for (const u of S.eotWeb) {
    if (!S.played.includes(u)) continue;
    if (await ask(p, { kind: 'yesno', text: `Добавить ${cn(u)} в паутину?`, purpose: 'web', card: S.cards[u] })) { take(S.played, u); P.web.push(u); log(`${pn(p)} добавляет ${cn(u)} в паутину.`); }
  }
  if (S.flags.neogi) for (let k = 0; k < S.flags.neogi; k++) for (const Q of S.players) if (Q.idx !== p) await forceDiscard(ctxFor(p, null), Q.idx);
  for (const rid in S.tokens) { const t = S.tokens[rid]; if (t.owner !== p || !t.full) continue; const vp = t.pop ? t.pop.vp || 0 : REG[rid].token.fullVp; if (vp) gainVP(p, vp, `полный контроль «${REG[rid].name}»`); }
  P.discard.push(...S.played, ...P.hand); S.played = []; P.hand = [];
  drawCards(p, 5);
  S.flags = {}; S.pool = { p: 0, i: 0 }; P.stonesNew = 0;
  const next = (p + 1) % S.players.length;
  if (next === S.first) {
    if (S.endTriggered) { return gameOver(); }
    S.round++;
  }
  S.cur = next;
  UI.render();
  await startTurn();
}
function scoreOf(p) {
  const P = S.players[p];
  let ctrl = 0, full = 0;
  for (const rid of T.actReg) if (controller(rid) === p) { ctrl += REG[rid].vp; if (fullControl(rid, p)) full += 2; }
  const trophies = trophyCount(p);
  const deckVp = [...P.deck, ...P.hand, ...P.discard, ...P.web, ...(S.cur === p ? S.played : [])].reduce((s, u) => s + def(u).vpDeck, 0);
  const innerVp = P.inner.reduce((s, u) => s + def(u).vpInner, 0);
  return { ctrl, full, trophies, deckVp, innerVp, tokens: P.vp, total: ctrl + full + trophies + deckVp + innerVp + P.vp };
}
function gameOver() {
  S.over = true; S.phase = 'over';
  log('<b>Игра окончена!</b>');
  UI.render(); UI.showScores();
}
