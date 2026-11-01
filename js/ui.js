'use strict';
// Интерфейс: экран настройки, поле (SVG поверх картинки), рынок, рука, окна выбора.

const UI = (() => {
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, html) => { const e = document.createElement(tag); for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const img = cid => `img/cards/${cid}.webp`;
  const POW = '<span class="ico pow">⚔</span>', INF = '<span class="ico inf">🕸</span>';

  let pending = null;   // { req, resolve }
  let busy = false;     // идёт розыгрыш эффекта / ход бота
  let lastViewer = null;
  const humans = () => S.players.filter(P => !P.bot).map(P => P.idx);
  function viewer() { if (!S.players[S.cur].bot) return S.cur; const h = humans(); return h.length ? (lastViewer != null && h.includes(lastViewer) ? lastViewer : h[0]) : null; }
  const myTurn = () => S && S.phase === 'turn' && !S.players[S.cur].bot && !busy && !pending;

  // ---------- настройка ----------
  const setup = { n: 2, seats: [], decks: ['drow', 'dragons'], side: 'L', speed: 450, modules: { pop: false, gems: false } };
  function initSetup() {
    for (let i = 0; i < 4; i++) setup.seats.push({ name: i === 0 ? 'Игрок' : HOUSES[i].name, bot: i !== 0 });
    try { const s = JSON.parse(localStorage.getItem('tyrants.setup') || 'null'); if (s) Object.assign(setup, s); } catch (e) {}
    renderSetup();
  }
  function renderSetup() {
    const box = $('#setupBody'); box.innerHTML = '';
    const nRow = el('div', { class: 'row' }, '<span class="lbl">Игроков:</span>');
    for (const n of [2, 3, 4]) nRow.append(el('button', { class: 'pill' + (setup.n === n ? ' on' : ''), onclick: () => { setup.n = n; renderSetup(); } }, n));
    box.append(nRow);
    for (let i = 0; i < setup.n; i++) {
      const s = setup.seats[i];
      const r = el('div', { class: 'row seat' });
      r.append(el('span', { class: 'sw', style: `background:${HOUSES[i].hex}` }));
      r.append(el('span', { class: 'house' }, HOUSES[i].name));
      const inp = el('input', { value: s.name, maxlength: 18 }); inp.oninput = () => { s.name = inp.value; };
      r.append(inp);
      for (const [b, t] of [[false, 'Человек'], [true, 'Бот']]) r.append(el('button', { class: 'pill' + (s.bot === b ? ' on' : ''), onclick: () => { s.bot = b; renderSetup(); } }, t));
      box.append(r);
    }
    const dRow = el('div', { class: 'row wrap' }, '<span class="lbl">Колоды рынка (выберите 2):</span>');
    const fRow = el('div', { class: 'row wrap' }, '<span class="lbl">Фанатские колоды:</span>');
    for (const d of Object.keys(DECK_RU)) (FAN_DECKS.includes(d) ? fRow : dRow).append(el('button', { class: 'pill' + (setup.decks.includes(d) ? ' on' : ''), onclick: () => {
      if (setup.decks.includes(d)) setup.decks = setup.decks.filter(x => x !== d); else { setup.decks.push(d); if (setup.decks.length > 2) setup.decks.shift(); }
      renderSetup(); } }, DECK_RU[d]));
    box.append(dRow); box.append(fRow);
    if (!setup.modules) setup.modules = { pop: false, gems: false };
    const mRow = el('div', { class: 'row wrap' }, '<span class="lbl">Фанатские модули:</span>');
    for (const [k, t, hint] of [['pop', 'Места Силы', 'другие бонусы полного контроля на жетонах'], ['gems', 'Камни Тьмы', 'камни под белыми отрядами: +1 сила / +1 влияние']])
      mRow.append(el('button', { class: 'pill' + (setup.modules[k] ? ' on' : ''), title: hint, onclick: () => { setup.modules[k] = !setup.modules[k]; renderSetup(); } }, t));
    box.append(mRow);
    const bRow = el('div', { class: 'row wrap' }, '<span class="lbl">Поле:</span>');
    for (const [v, t] of [['base', 'Классическое'], ['web', 'Демоническая паутина (гексы)']]) bRow.append(el('button', { class: 'pill' + ((setup.board || 'base') === v ? ' on' : ''), onclick: () => { setup.board = v; renderSetup(); } }, t));
    box.append(bRow);
    if (setup.n === 3 && setup.board !== 'web') {
      const sRow = el('div', { class: 'row' }, '<span class="lbl">Часть поля:</span>');
      for (const [v, t] of [['L', 'центр + левая'], ['R', 'центр + правая']]) sRow.append(el('button', { class: 'pill' + (setup.side === v ? ' on' : ''), onclick: () => { setup.side = v; renderSetup(); } }, t));
      box.append(sRow);
    }
    const spRow = el('div', { class: 'row' }, '<span class="lbl">Скорость ботов:</span>');
    for (const [v, t] of [[900, 'медленно'], [450, 'обычно'], [120, 'быстро']]) spRow.append(el('button', { class: 'pill' + (setup.speed === v ? ' on' : ''), onclick: () => { setup.speed = v; renderSetup(); } }, t));
    box.append(spRow);
    const ok = setup.decks.length === 2;
    box.append(el('div', { class: 'row' }, `<span class="hint">${setup.n === 2 ? 'Вдвоём играется только центральная часть поля.' : setup.n === 3 ? 'Втроём — центр и одна боковая часть.' : 'Вчетвером — всё поле.'} Первая партия — рекомендуются Дроу + Драконы.</span>`));
    const st = el('button', { class: 'big', onclick: start }, 'Начать партию'); if (!ok) st.disabled = true;
    box.append(st);
  }
  async function start() {
    try { localStorage.setItem('tyrants.setup', JSON.stringify(setup)); } catch (e) {}
    const players = setup.seats.slice(0, setup.n).map((s, i) => ({ name: s.name.trim() || HOUSES[i].name, bot: s.bot, hex: HOUSES[i].hex, house: HOUSES[i].name }));
    newGame({ players, decks: setup.decks, side: setup.side, botDelay: setup.speed, modules: setup.modules, board: setup.board || 'base' });
    $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
    $('#log').innerHTML = ''; S.log.forEach(m => onLog(m));
    buildBoardStatic(); render();
    await initialDeploy();
    await startTurn();
  }

  // ---------- поле ----------
  const SHADE = {
    L: '0,0 610,0 600,250 560,440 470,620 450,800 440,1000 440,1300 470,1500 460,1700 430,2000 0,2000',
    R: '1290,0 2000,0 2000,2000 1430,2000 1440,1800 1470,1600 1540,1450 1590,1150 1490,900 1540,800 1550,640 1470,500 1360,380 1300,250',
  };
  function regBox(rid) {
    const ls = REG[rid].locs.map(l => LOC[l]);
    const xs = ls.map(l => l.x), ys = ls.map(l => l.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  function buildBoardStatic() {
    const svg = $('#svg'); svg.innerHTML = '';
    const bimg = $('#board img');
    if (S.board.web) {
      bimg.classList.add('hidden');
      svg.setAttribute('viewBox', S.board.view.join(' '));
      const gT = sv('g', { id: 'gTiles' });
      for (const t of S.board.tiles) {
        const im = sv('image', { href: `img/web/${t.id}.webp`, x: -500, y: -433, width: 1000, height: 866, transform: `translate(${t.x} ${t.y}) rotate(${t.rot * 60})` });
        gT.append(im);
      }
      svg.append(gT);
    } else {
      bimg.classList.remove('hidden');
      svg.setAttribute('viewBox', '0 0 2000 2000');
      for (const s of ['L', 'R']) if (!T.sections.includes(s)) svg.append(sv('polygon', { points: SHADE[s], class: 'shade' }));
    }
    svg.append(sv('g', { id: 'gReg' })); svg.append(sv('g', { id: 'gLoc' })); svg.append(sv('g', { id: 'gSpy' })); svg.append(sv('g', { id: 'gOpt' }));
  }
  function renderBoard() {
    const gReg = $('#gReg'), gLoc = $('#gLoc'), gSpy = $('#gSpy'), gOpt = $('#gOpt');
    gReg.innerHTML = ''; gLoc.innerHTML = ''; gSpy.innerHTML = ''; gOpt.innerHTML = '';
    const req = pending && pending.req.kind === 'board' ? pending.req : null;
    const optLoc = new Map(), optReg = new Map(), optSpy = new Map();
    if (req) for (const o of req.opts) { if (o.t === 'loc') optLoc.set(o.id, o); else if (o.t === 'region') optReg.set(o.id, o); else optSpy.set(o.rid + ':' + o.owner, o); }
    for (const rid of T.actReg) {
      const b = regBox(rid), r = REG[rid];
      const rect = sv('rect', { x: b.x0 - 34, y: b.y0 - 34, width: b.x1 - b.x0 + 68, height: b.y1 - b.y0 + 68, rx: 18, class: 'regHit' + (optReg.has(rid) ? ' opt' : '') });
      const c = controller(rid), cnt = regionCounts(rid);
      const t = sv('title'); t.textContent = `${r.name} — ${r.vp} ПО${r.start ? ' (стартовый)' : ''}\nКонтроль: ${c != null ? S.players[c].name + (fullControl(rid, c) ? ' (полный)' : '') : 'нет'}\n` +
        Object.keys(cnt).map(k => `${k === 'W' ? 'белые' : S.players[k].name}: ${cnt[k]}`).join(', ') + (S.spies[rid].length ? `\nШпионы: ${S.spies[rid].map(q => S.players[q].name).join(', ')}` : '');
      rect.append(t);
      if (optReg.has(rid)) rect.onclick = () => answer(optReg.get(rid));
      gReg.append(rect);
      if (c != null) gReg.append(sv('rect', { x: b.x0 - 30, y: b.y0 - 30, width: b.x1 - b.x0 + 60, height: b.y1 - b.y0 + 60, rx: 16, class: 'ctrl' + (fullControl(rid, c) ? ' full' : ''), stroke: lightHex(S.players[c].hex) }));
      if (r.token) {
        const tk = S.tokens[rid];
        const g = sv('g', { class: 'token' });
        const cx = b.x0 - 58, cy = b.y1 + 6;
        g.append(sv('circle', { cx, cy, r: 20, fill: tk.owner != null ? S.players[tk.owner].hex : '#4b3a6b', stroke: '#e8dcff', 'stroke-width': 3 }));
        const tx = sv('text', { x: cx, y: cy + 8, class: 'tokTxt' }); tx.textContent = tk.full ? '★' : '🕸'; g.append(tx);
        const tt = sv('title'); tt.textContent = `Жетон «${r.name}»: +1 влияние за ход; полный контроль: ${tk.pop ? popText(tk.pop) + ' в начале хода (Место Силы)' : `+${r.token.fullVp} ПО в конце хода`}`; g.append(tt);
        gReg.append(g);
      }
      // шпионы
      S.spies[rid].forEach((q, k) => {
        const x = (b.x0 + b.x1) / 2 + (k - (S.spies[rid].length - 1) / 2) * 34, y = b.y1 + 44;
        const key = rid + ':' + q;
        const d = sv('path', { d: `M${x} ${y - 16} L${x + 13} ${y} L${x} ${y + 16} L${x - 13} ${y} Z`, fill: S.players[q].hex, class: 'spy' + (optSpy.has(key) ? ' opt' : '') });
        const tt = sv('title'); tt.textContent = `Шпион: ${S.players[q].name}`; d.append(tt);
        if (optSpy.has(key)) d.onclick = () => answer(optSpy.get(key));
        gSpy.append(d);
      });
    }
    for (const id of T.act) {
      const l = LOC[id], v = S.occ[id];
      const isOpt = optLoc.has(id) || (l.region && optReg.has(l.region));
      const c = sv('circle', { cx: l.x, cy: l.y, r: 21, class: 'loc' + (v == null ? ' empty' : v === 'W' ? ' white' : ' troop') });
      if (v != null && v !== 'W') { c.setAttribute('fill', S.players[v].hex); c.setAttribute('stroke', lightHex(S.players[v].hex)); }
      gLoc.append(c);
      if (S.stones[id]) gLoc.append(sv('path', { d: `M${l.x} ${l.y - 40} l12 14 l-12 14 l-12 -14 Z`, class: 'stone' }));
      if (S.gems[id] && v === 'W') gLoc.append(sv('circle', { cx: l.x + 16, cy: l.y - 16, r: 9, class: 'gem ' + S.gems[id] }));
      if (v === 'W') { gLoc.append(sv('path', { d: `M${l.x - 9} ${l.y - 9} L${l.x + 9} ${l.y + 9} M${l.x + 9} ${l.y - 9} L${l.x - 9} ${l.y + 9}`, class: 'wx' })); }
      if (isOpt) {
        const o = sv('circle', { cx: l.x, cy: l.y, r: 27, class: 'optRing' });
        o.onclick = () => answer(optLoc.get(id) || optReg.get(l.region));
        gOpt.append(o);
      }
      if (req && req.purpose === 'moveTo' && req.from === id) gOpt.append(sv('circle', { cx: l.x, cy: l.y, r: 29, class: 'fromRing' }));
    }
  }
  function lightHex(h) { return h === '#2a2730' ? '#cfc6e6' : '#ffffff'; }

  // ---------- панели ----------
  function cardImg(uid, cls, onclick) {
    const d = def(uid);
    const im = el('img', { src: img(d.id), class: 'card ' + (cls || ''), 'data-cid': d.id, draggable: 'false' });
    if (onclick) im.onclick = onclick;
    return im;
  }
  function renderPlayers() {
    const box = $('#players'); box.innerHTML = '';
    for (const P of S.players) {
      const sc = scoreOf(P.idx);
      const toks = Object.keys(S.tokens).filter(r => S.tokens[r].owner === P.idx).map(r => REG[r].name + (S.tokens[r].full ? '★' : '')).join(', ');
      const d = el('div', { class: 'pl' + (P.idx === S.cur ? ' cur' : '') });
      d.innerHTML = `<div class="plTop"><span class="sw" style="background:${P.hex}"></span><b>${P.name}</b>${P.bot ? ' <span class="tag">бот</span>' : ''}${P.idx === S.first ? ' <span class="tag">1-й</span>' : ''}
        <span class="vpTotal" title="Очки, если игра закончится сейчас">≈ ${sc.total} ПО</span></div>
        <div class="plStats">
          <span title="Отряды в казармах">🛡 ${P.barracks}</span>
          <span title="Шпионы в запасе">◆ ${P.spiesFree}</span>
          <span title="Трофейный зал">💀 ${trophyCount(P.idx)}</span>
          <span title="Жетоны ПО">🏅 ${P.vp}</span>
          <span title="Колода / сброс / рука">🂠 ${P.deck.length}/${P.discard.length}/${P.hand.length}</span>
          <a class="inner" title="Внутренний круг">👑 ${P.inner.length}</a>
          ${S.decks.includes('arachnids') ? `<a class="web" title="Паутина">🕷 ${P.web.length}</a>` : ''}
          ${S.board.web ? `<span title="Камни Силы">◆ ${P.stones}</span>` : ''}
          ${S.modules.gems ? `<span title="Камни: синие / красные / фиолетовые">💎 ${P.gems.blue}/${P.gems.red}/${P.gems.purple}</span>` : ''}
        </div>${toks ? `<div class="plToks">🕸 ${toks}</div>` : ''}`;
      d.querySelector('.inner').onclick = () => showZone(`Внутренний круг: ${P.name}`, P.inner);
      const wb = d.querySelector('.web'); if (wb) wb.onclick = () => showZone(`Паутина: ${P.name}`, P.web);
      box.append(d);
    }
  }
  function renderMarket() {
    const box = $('#market'); box.innerHTML = '';
    const canBuy = myTurn();
    S.market.forEach((u, i) => {
      if (u == null) { box.append(el('div', { class: 'card slot' })); return; }
      const c = costOf(u);
      const im = cardImg(u, 'mk' + (canBuy && S.pool.i >= c ? ' afford' : ''), () => { if (myTurn()) doBuy({ uid: u, src: 'market', slot: i, cost: c }); });
      box.append(im);
    });
    $('#mdeckCount').textContent = `колода: ${S.mdeck.length}`;
    const sup = $('#supply'); sup.innerHTML = '';
    const pile = (uids, cost, src, label) => {
      const w = el('div', { class: 'pile' });
      if (uids.length) {
        const u = uids[uids.length - 1];
        w.append(cardImg(u, 'sp' + (canBuy && cost != null && S.pool.i >= cost ? ' afford' : ''), () => { if (myTurn() && cost != null) doBuy({ uid: u, src, cost }); }));
      } else w.append(el('div', { class: 'card sp slot' }));
      w.append(el('div', { class: 'pileN' }, `${label}: ${uids.length}`));
      sup.append(w);
    };
    pile(S.supply.priest, S.supply.priest.length ? costOf(S.supply.priest[0]) : 2, 'priest', 'Жрицы');
    pile(S.supply.guard, S.supply.guard.length ? costOf(S.supply.guard[0]) : 3, 'guard', 'Стражи');
    pile(S.supply.madman, null, null, 'Изгои');
    if (S.decks.includes('arachnids')) pile(S.supply.poison, null, null, 'Отравленные');
    const dv = el('div', { class: 'pile' });
    if (S.devoured.length) {
      const u = S.devoured[S.devoured.length - 1], c = costOf(u);
      const buyable = S.flags.devouredBuy && c != null;
      dv.append(cardImg(u, 'sp dim' + (buyable ? ' afford' : ''), () => { if (myTurn() && buyable) doBuy({ uid: u, src: 'devoured', cost: c }); }));
    } else dv.append(el('div', { class: 'card sp slot' }));
    const lnk = el('a', { class: 'pileN' }, `Поглощено: ${S.devoured.length}`); lnk.onclick = () => showZone('Поглощённые карты', S.devoured);
    dv.append(lnk); sup.append(dv);
  }
  function renderTurn() {
    const P = S.players[S.cur];
    $('#powN').textContent = S.pool.p; $('#infN').textContent = S.pool.i;
    const mine = myTurn();
    $('#turnTitle').innerHTML = S.phase === 'over' ? 'Игра окончена' : `Ход: <span style="color:${P.hex === '#2a2730' ? '#b9b3c6' : P.hex}">${P.name}</span> · раунд ${S.round}${S.endTriggered ? ' · <b class="warn">последний раунд</b>' : ''}`;
    const bD = $('#bDeploy'), bK = $('#bKill'), bS = $('#bSpy'), bE = $('#bEnd'), bA = $('#bAll');
    bD.disabled = !mine || S.pool.p < 1; bK.disabled = !mine || S.pool.p < 3; bS.disabled = !mine || S.pool.p < 3;
    bE.disabled = !mine; bA.disabled = !mine || !P.hand.length;
    const gb = $('#gems'); gb.innerHTML = '';
    if (S.modules.gems && !P.bot) for (const g of ['blue', 'red', 'purple']) if (P.gems[g]) {
      const b = el('button', { class: 'gemBtn ' + g, title: 'Потратить камень' }, `💎×${P.gems[g]} <small>${g === 'blue' ? '+1⚔' : g === 'red' ? '+1🕸' : '+1⚔ +1🕸'}</small>`);
      b.disabled = !mine; b.onclick = () => { if (myTurn()) { spendGem(S.cur, g); render(); } };
      gb.append(b);
    }
    if (S.board.web && !P.bot) {
      const spots = stoneSpots(S.cur);
      if (spots.length && !S.flags.stoneTaken) {
        const b = el('button', { class: 'gemBtn purple', title: 'Ваш отряд стоит на Камне Силы' }, 'Захватить камень <small>1⚔</small>');
        b.disabled = !mine || S.pool.p < 1; b.onclick = () => { if (myTurn()) { captureStone(S.cur, spots[0]); render(); } };
        gb.append(b);
      }
      const free = P.stones - P.stonesNew;
      if (P.stones) for (const [k, t] of [['p', '+3⚔'], ['i', '+3🕸']]) {
        const b = el('button', { class: 'gemBtn', title: free ? 'Потратить Камень Силы' : 'Камень нельзя тратить в ход захвата' }, `◆×${P.stones} <small>${t}</small>`);
        b.disabled = !mine || !free; b.onclick = () => { if (myTurn()) { spendStone(S.cur, k); render(); } };
        gb.append(b);
      }
    }
    const v = viewer();
    const hand = $('#hand'); hand.innerHTML = '';
    $('#handTitle').textContent = v == null ? 'Рука' : v === S.cur ? 'Ваша рука' : `Рука: ${S.players[v].name} (ждёт хода)`;
    if (v != null) for (const u of S.players[v].hand) hand.append(cardImg(u, 'hd' + (mine && v === S.cur ? ' playable' : ''), () => { if (myTurn() && v === S.cur) doPlay(u); }));
    const pl = $('#played'); pl.innerHTML = '';
    for (const u of S.played) pl.append(cardImg(u, 'pd'));
    const pr = $('#prompt');
    if (pending && pending.req.kind === 'board') {
      pr.innerHTML = `<span class="ptext">${pending.req.text}</span>`;
      if (pending.req.optional) pr.append(el('button', { class: 'skip', onclick: () => answer(null) }, 'Пропустить'));
      pr.classList.add('active');
    } else if (S.phase === 'turn' && !P.bot && !busy && !pending) {
      pr.innerHTML = '<span class="ptext dim">Сыграйте карты с руки, нанимайте слуг на рынке, тратьте силу на действия.</span>'; pr.classList.remove('active');
    } else if (P.bot && S.phase !== 'over') { pr.innerHTML = `<span class="ptext dim">Ходит бот ${P.name}…</span>`; pr.classList.remove('active'); }
    else { pr.innerHTML = ''; pr.classList.remove('active'); }
  }
  function render() {
    if (!S) return;
    renderBoard(); renderPlayers(); renderMarket(); renderTurn();
    // карта под курсором могла исчезнуть после перерисовки
    const under = document.elementFromPoint(mouse.x, mouse.y);
    if (!under || !under.dataset || !under.dataset.cid) hideZoom();
  }
  function onLog(msg) {
    const box = $('#log'); if (!box) return;
    box.append(el('div', { class: 'lg' }, msg));
    while (box.children.length > 300) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }

  // ---------- действия человека ----------
  async function run(fn) {
    if (busy) return; busy = true; render();
    try { await fn(); } catch (e) { console.error(e); log(`<span class="warn">Ошибка: ${e.message}</span>`); }
    busy = false; render();
  }
  function doPlay(u) { run(() => playCard(S.cur, u)); }
  function doBuy(b) { if (S.pool.i < b.cost) { flash('Не хватает влияния'); return; } run(async () => buy(S.cur, b)); }
  function flash(t) { const f = $('#flash'); f.textContent = t; f.classList.add('show'); setTimeout(() => f.classList.remove('show'), 1400); }
  function bindButtons() {
    $('#bDeploy').onclick = () => myTurn() && run(() => actDeploy(S.cur));
    $('#bKill').onclick = () => myTurn() && run(() => actAssassinate(S.cur));
    $('#bSpy').onclick = () => myTurn() && run(() => actReturnSpy(S.cur));
    $('#bAll').onclick = () => myTurn() && run(async () => {
      const P = S.players[S.cur];
      // сначала простые карты ресурсов, потом остальные по одной
      for (const u of P.hand.filter(x => ['Знать', 'Солдат', 'Страж Дома', 'Жрица Ллот'].includes(def(x).name))) await playCard(S.cur, u);
      render();
    });
    $('#bEnd').onclick = async () => {
      if (!myTurn()) return;
      const P = S.players[S.cur];
      if ((P.hand.length || S.pool.p || S.pool.i) && !await confirmBox(`Завершить ход? ${P.hand.length ? `В руке ещё ${P.hand.length} карт. ` : ''}${S.pool.p || S.pool.i ? 'Неистраченные ресурсы сгорят.' : ''}`)) return;
      busy = true; render();
      try { await endTurn(); } catch (e) { console.error(e); log(`<span class="warn">Ошибка: ${e.message}</span>`); }
      busy = false; render();
    };
    $('#bRules').onclick = showRules;
    $('#bMenu').onclick = async () => { if (await confirmBox('Выйти в меню? Текущая партия будет потеряна.')) location.reload(); };
  }
  async function humanTurn() {
    if (humans().length > 1 && lastViewer !== S.cur) await handoff(S.cur, 'Ваш ход');
    lastViewer = S.cur;
    render();
  }

  // ---------- запросы ----------
  async function handoff(p, why) {
    const m = openModal();
    m.append(el('h2', {}, `Передайте устройство: <span style="color:${lightText(p)}">${S.players[p].name}</span>`));
    m.append(el('p', {}, why));
    await new Promise(res => m.append(el('button', { class: 'big', onclick: res }, 'Я готов')));
    closeModal(); lastViewer = p; render();
  }
  function lightText(p) { const h = S.players[p].hex; return h === '#2a2730' ? '#b9b3c6' : h; }
  async function ask(p, req) {
    if (p !== S.cur && humans().length > 1 && lastViewer !== p) await handoff(p, req.text);
    return new Promise(resolve => {
      pending = { req, resolve };
      if (req.kind === 'board') { render(); return; }
      render();
      if (req.kind === 'choice') return showChoice(req);
      if (req.kind === 'cards') return showCards(req);
      if (req.kind === 'player') return showPlayer(req);
      if (req.kind === 'yesno') return showYesNo(req);
    });
  }
  function answer(v) {
    if (!pending) return;
    const { resolve } = pending; pending = null; closeModal();
    if (S.cur !== lastViewer && !S.players[S.cur].bot && humans().length > 1) { /* вернём устройство на следующем запросе */ }
    resolve(v); render();
  }
  function openModal(wide) { const m = $('#modal'); m.innerHTML = ''; m.classList.remove('hidden'); const box = el('div', { class: 'mbox' + (wide ? ' wide' : '') }); m.append(box); return box; }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; hideZoom(); }
  function cardHead(box, req) { if (req.card) { const im = el('img', { src: img(req.card), class: 'card mcard', 'data-cid': req.card }); box.append(im); } }
  function showChoice(req) {
    const m = openModal();
    const wrap = el('div', { class: 'mrow' }); cardHead(wrap, req);
    const col = el('div', { class: 'mcol' });
    col.append(el('h3', {}, req.text));
    for (const o of req.options) { const b = el('button', { class: 'opt', onclick: () => answer(o.value) }, o.label); if (!o.enabled) b.disabled = true; col.append(b); }
    if (req.optional) col.append(el('button', { class: 'skip', onclick: () => answer(null) }, 'Пропустить'));
    wrap.append(col); m.append(wrap);
  }
  function showYesNo(req) {
    const m = openModal();
    const wrap = el('div', { class: 'mrow' }); cardHead(wrap, req);
    const col = el('div', { class: 'mcol' });
    col.append(el('h3', {}, req.text));
    col.append(el('button', { class: 'opt', onclick: () => answer(true) }, 'Да'));
    col.append(el('button', { class: 'skip', onclick: () => answer(false) }, 'Нет'));
    wrap.append(col); m.append(wrap);
  }
  function showPlayer(req) {
    const m = openModal();
    m.append(el('h3', {}, req.text));
    for (const q of req.options) m.append(el('button', { class: 'opt', style: `border-color:${S.players[q].hex}`, onclick: () => answer(q) }, `${S.players[q].name} (в руке ${S.players[q].hand.length})`));
    if (req.optional) m.append(el('button', { class: 'skip', onclick: () => answer(null) }, 'Пропустить'));
  }
  function showCards(req) {
    const m = openModal(true);
    m.append(el('h3', {}, req.text));
    const sel = new Set(); const max = req.max || 1, min = req.min || 0;
    const grid = el('div', { class: 'cgrid' });
    const ok = el('button', { class: 'opt' }, 'Готово');
    const upd = () => { ok.disabled = sel.size < min || sel.size > max; grid.querySelectorAll('img').forEach(i => i.classList.toggle('sel', sel.has(+i.dataset.uid))); };
    for (const u of req.options) {
      const im = cardImg(u, 'pick'); im.dataset.uid = u;
      im.onclick = () => { if (max === 1) { answer([u]); return; } if (sel.has(u)) sel.delete(u); else if (sel.size < max) sel.add(u); upd(); };
      grid.append(im);
    }
    m.append(grid);
    const row = el('div', { class: 'brow' });
    if (max > 1) { ok.onclick = () => answer([...sel]); row.append(ok); }
    if (min === 0) row.append(el('button', { class: 'skip', onclick: () => answer([]) }, 'Пропустить'));
    m.append(row); upd();
  }
  function showZone(title, uids) {
    if (pending && pending.req.kind !== 'board') return;
    const m = openModal(true);
    m.append(el('h3', {}, `${title} (${uids.length})`));
    const grid = el('div', { class: 'cgrid' });
    for (const u of uids) grid.append(cardImg(u, 'pick'));
    if (!uids.length) grid.append(el('p', { class: 'dim' }, 'Пусто'));
    m.append(grid);
    m.append(el('button', { class: 'skip', onclick: closeModal }, 'Закрыть'));
  }
  function confirmBox(text) {
    return new Promise(res => {
      const m = openModal();
      m.append(el('h3', {}, text));
      m.append(el('button', { class: 'opt', onclick: () => { closeModal(); res(true); } }, 'Да'));
      m.append(el('button', { class: 'skip', onclick: () => { closeModal(); res(false); } }, 'Отмена'));
    });
  }
  function showScores() {
    const m = openModal(true);
    const rows = [['ctrl', 'Контролируемые регионы'], ['full', 'Полный контроль (по 2 ПО)'], ['trophies', 'Трофейный зал'], ['deckVp', 'Карты в колоде, руке, сбросе'], ['innerVp', 'Внутренний круг'], ['tokens', 'Жетоны ПО'], ['total', 'Итого']];
    const sc = S.players.map(P => scoreOf(P.idx));
    const best = Math.max(...sc.map(s => s.total));
    let h = `<h2>Итоги партии</h2><table class="score"><tr><th></th>${S.players.map((P, i) => `<th style="color:${lightText(i)}">${P.name}${sc[i].total === best ? ' 👑' : ''}</th>`).join('')}</tr>`;
    for (const [k, t] of rows) h += `<tr class="${k === 'total' ? 'tot' : ''}"><td>${t}</td>${sc.map(s => `<td>${s[k]}</td>`).join('')}</tr>`;
    h += '</table>';
    m.innerHTML = h;
    const winners = S.players.filter((P, i) => sc[i].total === best).map(P => P.name);
    m.append(el('p', { class: 'win' }, winners.length > 1 ? `Ничья: ${winners.join(', ')}` : `Победитель: ${winners[0]}`));
    m.append(el('button', { class: 'big', onclick: () => location.reload() }, 'Новая партия'));
    m.append(el('button', { class: 'skip', onclick: closeModal }, 'Посмотреть поле'));
  }
  function showRules() {
    const m = openModal(true);
    m.innerHTML = `<h2>Кратко о правилах</h2><div class="rules">
      <p><b>Цель</b> — больше всех победных очков (ПО). Ход: в любом порядке играйте карты с руки и тратьте ресурсы:
      ${POW} <b>сила</b> — отправить отряд (1), уничтожить вражеский отряд (3), выслать вражеского шпиона (3);
      ${INF} <b>влияние</b> — нанять слугу с рынка, Жрицу Ллот (2) или Стража Дома (3). Неистраченное сгорает.</p>
      <p><b>Присутствие</b>: в регионе — если там ваш шпион или отряд, либо ваш отряд в соседней локации маршрута; в локации маршрута — если ваш отряд в соседней локации. Отправлять, уничтожать и высылать можно только там, где есть присутствие (если на поле нет ваших отрядов — отправить можно куда угодно).</p>
      <p><b>Контроль</b> региона — ваших отрядов больше, чем любого другого цвета (включая белых). <b>Полный контроль</b> — все локации ваши и нет чужих шпионов.
      Жетоны контроля (круглые регионы) дают +1 влияние за ход, при полном контроле — ещё ПО в конце хода.</p>
      <p><b>Конец хода</b>: повышение слуг во внутренний круг, ПО за жетоны, сброс сыгранных карт и руки, добор 5 карт.</p>
      <p><b>Конец игры</b> — кто-то отправил последний отряд или опустела колода рынка; раунд доигрывается.
      Подсчёт: ПО регионов под контролем, +2 за полный контроль, 1 ПО за каждый отряд в трофейном зале, ПО карт колоды (левое число) и внутреннего круга (правое число), жетоны ПО.</p>
      <p><b>Фанатские дополнения.</b> <i>Осада</i> и <i>Юголоты</i> — новые колоды рынка; <i>Паукообразные</i> добавляют паутину игрока (карты в ней считаются колодой в конце игры и усиливают пауков по аспектам) и Отравленных слуг (−1 ПО, избавиться — вернуть своего шпиона или 2 своих отряда из региона).
      <i>Места Силы</i> — другие бонусы полного контроля на жетонах (в начале хода). <i>Камни Тьмы</i> — под белыми отрядами лежат камни: уничтожив отряд, можно вернуть его в запас и забрать камень (+1 сила / +1 влияние) или взять в трофеи, убрав камень.
      <i>Демоническая паутина</i> — поле из гексов: камни силы ◆ на тупиках маршрутов захватываются отрядом за 1 силу (1 за ход) и тратятся со следующего хода на +3 силы или +3 влияния.</p>
      <p><b>Подсказки</b>: наведите курсор на карту — она увеличится; на регион — увидите расклад сил. Значок 👑 у игрока — посмотреть внутренний круг.</p></div>`;
    m.append(el('button', { class: 'skip', onclick: closeModal }, 'Закрыть'));
  }

  // ---------- увеличение карт ----------
  const mouse = { x: -1, y: -1 };
  document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  function hideZoom() { $('#zoom').classList.add('hidden'); }
  function bindZoom() {
    document.addEventListener('mouseover', e => {
      const t = e.target;
      if (t.tagName === 'IMG' && t.dataset.cid && !t.classList.contains('mcard')) {
        const z = $('#zoom'); z.querySelector('img').src = img(t.dataset.cid); z.classList.remove('hidden');
        const r = t.getBoundingClientRect(); const w = 300, h = 420;
        let x = r.right + 12; if (x + w > innerWidth) x = r.left - w - 12; if (x < 0) x = 8;
        let y = r.top + r.height / 2 - h / 2; y = Math.max(8, Math.min(innerHeight - h - 8, y));
        z.style.left = x + 'px'; z.style.top = y + 'px';
      }
    });
    document.addEventListener('mouseout', e => { if (e.target.tagName === 'IMG' && e.target.dataset.cid) hideZoom(); });
    document.addEventListener('mousedown', hideZoom, true);
  }

  document.addEventListener('DOMContentLoaded', () => { initSetup(); bindButtons(); bindZoom(); });
  return { ask, render, humanTurn, showScores, onLog };
})();
