'use strict';
// Движок правил «Тиранов Подземья»: состояние, поле, действия, ход.

const ASPECTS = { 'Покорный': 'obedience', 'Злобный': 'malice', 'Завоеватель': 'conquest', 'Коварный': 'guile', 'Честолюбивый': 'ambition' };
const ASPECT_RU = { obedience: 'покорный', malice: 'злобный', conquest: 'завоеватель', guile: 'коварный', ambition: 'честолюбивый' };
const DECK_RU = { drow: 'Дроу', dragons: 'Драконы', elementals: 'Элементали', demons: 'Демоны', aberrations: 'Аберрации', undead: 'Нежить' };
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

const LOC = {}; BOARD.locs.forEach(l => { LOC[l.id] = l; });
const REG = {}; BOARD.regions.forEach(r => { REG[r.id] = r; });

let S = null;   // состояние партии
let T = null;   // топология активной части поля

const sleep = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function take(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }
const def = uid => CARDS[S.cards[uid]];
const pn = p => `<b style="color:${S.players[p].hex === '#2a2730' ? '#b9b3c6' : S.players[p].hex}">${S.players[p].name}</b>`;
const cn = uid => `«${def(uid).name}»`;
function log(msg) { S.log.push(msg); if (S.log.length > 400) S.log.shift(); UI.onLog && UI.onLog(msg); }

// ---------- топология ----------
function buildTopology(sections) {
  const act = new Set(BOARD.locs.filter(l => sections.includes(l.sec)).map(l => l.id));
  const actReg = new Set(BOARD.regions.filter(r => sections.includes(r.sec)).map(r => r.id));
  const adj = {}; act.forEach(id => { adj[id] = new Set(); });
  const regAdj = {}; actReg.forEach(r => { regAdj[r] = new Set(); });
  const link = (a, b) => { if (act.has(a) && act.has(b)) { adj[a].add(b); adj[b].add(a); } };
  for (const rt of BOARD.routes) {
    const chain = [REG[rt.a].locs, ...rt.nodes.map(n => [n]), REG[rt.b].locs];
    for (let i = 0; i < chain.length - 1; i++) for (const x of chain[i]) for (const y of chain[i + 1]) link(x, y);
  }
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
  const sections = n === 2 ? ['C'] : n === 3 ? ['C', cfg.side || 'L'] : ['L', 'C', 'R'];
  S = { nextUid: 1, cards: {}, log: [], players: [], occ: {}, spies: {}, tokens: {}, market: [], mdeck: [], devoured: [],
        supply: { guard: [], priest: [], madman: [] }, pool: { p: 0, i: 0 }, played: [], eot: [], flags: {},
        first: 0, cur: 0, turnNo: 0, round: 1, endTriggered: false, over: false, phase: 'setup', botDelay: cfg.botDelay ?? 450,
        decks: cfg.decks };
  T = buildTopology(sections);
  cfg.players.forEach((pc, i) => {
    const P = { idx: i, name: pc.name, hex: pc.hex, house: pc.house, bot: !!pc.bot, deck: [], hand: [], discard: [], inner: [],
                barracks: 40, spiesFree: 5, trophies: {}, vp: 0 };
    for (let k = 0; k < 7; k++) P.deck.push(mkCard(cidByName('Знать')));
    for (let k = 0; k < 3; k++) P.deck.push(mkCard(cidByName('Солдат')));
    shuffle(P.deck);
    S.players.push(P);
  });
  for (let k = 0; k < 15; k++) S.supply.guard.push(mkCard(cidByName('Страж Дома')));
  for (let k = 0; k < 15; k++) S.supply.priest.push(mkCard(cidByName('Жрица Ллот')));
  for (let k = 0; k < 30; k++) S.supply.madman.push(mkCard(cidByName('Безумный изгой')));
  for (const d of cfg.decks) for (const c of CARDS_DATA.filter(c => c.deck === d)) for (let k = 0; k < c.count; k++) S.mdeck.push(mkCard(c.id));
  shuffle(S.mdeck);
  for (let k = 0; k < 6; k++) S.market.push(S.mdeck.pop());
  for (const id of T.act) S.occ[id] = LOC[id].white ? 'W' : null;
  for (const r of T.actReg) { S.spies[r] = []; if (REG[r].token) S.tokens[r] = { owner: null, full: false, infTurn: -1 }; }
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
function locName(id) { const l = LOC[id]; if (l.region) return REG[l.region].name; const rt = BOARD.routes.find(r => r.nodes.includes(id)); return `маршрут ${REG[rt.a].name} — ${REG[rt.b].name}`; }
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
function killTroop(p, id) {
  const v = S.occ[id]; S.occ[id] = null;
  const P = S.players[p]; P.trophies[v] = (P.trophies[v] || 0) + 1;
  log(`${pn(p)} уничтожает ${v === 'W' ? 'белый отряд' : 'отряд ' + pn(v)}: ${locName(id)}.`);
  updateControl();
  return v;
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
function promoteCard(p, uid) {
  if (isMadman(uid)) { S.supply.madman.push(uid); log(`${pn(p)}: Безумный изгой возвращается в резерв.`); return; }
  S.players[p].inner.push(uid); log(`${pn(p)} повышает ${cn(uid)} во внутренний круг.`);
}
function devourCard(uid, who) {
  if (isMadman(uid)) { S.supply.madman.push(uid); log(`Безумный изгой возвращается в резерв.`); return; }
  S.devoured.push(uid); log(`${who != null ? pn(who) + ' поглощает' : 'Поглощена'} ${cn(uid)}.`);
}
function refillMarket(slot) {
  S.market[slot] = S.mdeck.length ? S.mdeck.pop() : null;
  if (!S.mdeck.length) triggerEnd('закончилась колода рынка');
}
function giveMadman(t) {
  if (!S.supply.madman.length) { log('Резерв Безумных изгоев пуст.'); return; }
  S.players[t].discard.push(S.supply.madman.pop());
  log(`${pn(t)} получает Безумного изгоя.`);
}
// покупаемые сейчас карты: [{uid, src, slot?, cost}]
function buyables(p, opt = {}) {
  const res = [];
  S.market.forEach((u, i) => { if (u != null) res.push({ uid: u, src: 'market', slot: i, cost: def(u).cost }); });
  if (S.supply.guard.length) res.push({ uid: S.supply.guard[S.supply.guard.length - 1], src: 'guard', cost: 3 });
  if (S.supply.priest.length) res.push({ uid: S.supply.priest[S.supply.priest.length - 1], src: 'priest', cost: 2 });
  if (S.flags.devouredBuy && S.devoured.length && opt.withDevoured !== false) {
    const u = S.devoured[S.devoured.length - 1]; if (def(u).cost != null) res.push({ uid: u, src: 'devoured', cost: def(u).cost });
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
    if (o.white && v !== 'W') return false;
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
    res.push(killTroop(ctx.p, ch.id));
  }
  return res;
}
async function supplant(ctx, o = {}) {
  const opts = enemyTroopLocs(ctx.p, o);
  const ch = await bt(ctx, 'supplant', `Вытесните ${o.white ? 'белый ' : 'вражеский '}отряд`, opts.map(id => ({ t: 'loc', id })));
  if (!ch) return null;
  const v = killTroop(ctx.p, ch.id);
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
    else { removeSpy(ch.owner, ch.rid); log(`${pn(ctx.p)} высылает шпиона ${pn(ch.owner)} из «${REG[ch.rid].name}».`); }
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
  if (d.name === 'Гримлок') { const k = drawCards(t, 2); log(`${pn(t)}: Гримлок — берёт карт: ${k}.`); }
  if (d.name === 'Бурый увалень') {
    const MP = S.players[ctx.p];
    if (MP.hand.length) {
      const c2 = await pickCards(ctx.p, 'Бурый увалень: вы сами должны сбросить карту', [...MP.hand], { min: 1, purpose: 'discard', forced: true });
      take(MP.hand, c2[0]); MP.discard.push(c2[0]); log(`${pn(ctx.p)} сбрасывает ${cn(c2[0])}.`);
    }
  }
}
function madmanClockwise(targets, k = 1) {
  // при нехватке изгоев раздаём по часовой стрелке от первого игрока
  const order = S.players.map((_, i) => (S.first + i) % S.players.length).filter(q => targets.includes(q));
  for (let r = 0; r < k; r++) for (const q of order) giveMadman(q);
}
function vpPerTokens(p) { return Object.values(S.tokens).filter(t => t.owner === p).length; }

// ---------- розыгрыш карт ----------
function ctxFor(p, uid) { return { p, uid, cid: S.cards[uid], card: def(uid) }; }
async function playCard(p, uid, src = 'hand') {
  const P = S.players[p];
  if (src === 'hand') take(P.hand, uid);
  if (src !== 'inner') S.played.push(uid);
  log(`${pn(p)} играет ${cn(uid)}${src === 'market' ? ' с рынка' : src === 'inner' ? ' из внутреннего круга' : ''}.`);
  const fx = EFFECTS[def(uid).name];
  if (fx) await fx(ctxFor(p, uid)); else log(`(эффект ${cn(uid)} не реализован)`);
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
  S.pool = { p: 0, i: 0 }; S.played = []; S.eot = []; S.flags = {};
  log(`<hr>Ход: ${pn(S.cur)}${S.cur === S.first ? ` (раунд ${S.round})` : ''}`);
  for (const rid in S.tokens) {
    const t = S.tokens[rid];
    if (t.owner === S.cur && t.infTurn !== S.turnNo) { t.infTurn = S.turnNo; S.pool.i += 1; log(`${pn(S.cur)}: +1 влияние от жетона «${REG[rid].name}».`); }
  }
  UI.render();
  if (S.players[S.cur].bot) { await AI.takeTurn(S.cur); await endTurn(); }
  else UI.humanTurn();
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
  if (S.flags.neogi) for (let k = 0; k < S.flags.neogi; k++) for (const Q of S.players) if (Q.idx !== p) await forceDiscard(ctxFor(p, null), Q.idx);
  for (const rid in S.tokens) { const t = S.tokens[rid]; if (t.owner === p && t.full && REG[rid].token.fullVp) gainVP(p, REG[rid].token.fullVp, `полный контроль «${REG[rid].name}»`); }
  P.discard.push(...S.played, ...P.hand); S.played = []; P.hand = [];
  drawCards(p, 5);
  S.flags = {}; S.pool = { p: 0, i: 0 };
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
  const deckVp = [...P.deck, ...P.hand, ...P.discard, ...(S.cur === p ? S.played : [])].reduce((s, u) => s + def(u).vpDeck, 0);
  const innerVp = P.inner.reduce((s, u) => s + def(u).vpInner, 0);
  return { ctrl, full, trophies, deckVp, innerVp, tokens: P.vp, total: ctrl + full + trophies + deckVp + innerVp + P.vp };
}
function gameOver() {
  S.over = true; S.phase = 'over';
  log('<b>Игра окончена!</b>');
  UI.render(); UI.showScores();
}
