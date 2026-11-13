'use strict';
// Интерфейс: экран настройки, поле (SVG поверх картинки), рынок, рука, окна выбора.

const UI = (() => {
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, html) => { const e = document.createElement(tag); for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const img = cid => `img/cards/${cid}.webp`;
  // значки силы и влияния как на картах: меч и паутина в белом кружке
  const icoSvg = inner => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.4" fill="#fff" stroke="#1a1420" stroke-width="2.6"/>${inner}</svg>`);
  const POW_URI = icoSvg('<g fill="#1a1420"><circle cx="16" cy="5.6" r="1.7"/><rect x="15" y="6" width="2" height="4.4"/><path d="M9.6 10.2h12.8l-1 2.2H10.6z"/><path d="M14.5 12.4h3l-.2 10.8L16 27.4l-1.3-4.2z"/><path d="M8.4 13.6c1.6 3.2 3.4 4.6 5.4 5.2v-2.6c-1.6-.6-3.4-1.6-5.4-2.6zM23.6 13.6c-1.6 3.2-3.4 4.6-5.4 5.2v-2.6c1.6-.6 3.4-1.6 5.4-2.6z"/></g>');
  const INF_URI = icoSvg((() => {
    const pt = (r, k) => [16 + r * Math.cos(k * Math.PI / 4 + Math.PI / 8), 16 + r * Math.sin(k * Math.PI / 4 + Math.PI / 8)].map(v => v.toFixed(2)).join(' ');
    let d = ''; for (let k = 0; k < 8; k++) d += `M16 16L${pt(12.4, k)}`;
    for (const r of [3.6, 7.2, 10.8]) { d += `M${pt(r, 0)}`; for (let k = 1; k <= 8; k++) d += `Q${pt(r * 0.78, k - 0.5)} ${pt(r, k)}`; }
    return `<path d="${d}" fill="none" stroke="#1a1420" stroke-width="1.15"/>`;
  })());
  document.head.append(el('style', {}, `.ic.pow{background-image:url("${POW_URI}")}.ic.inf{background-image:url("${INF_URI}")}`));
  const POW = '<i class="ic pow"></i>', INF = '<i class="ic inf"></i>';
  const LEVEL_RU = { easy: 'лёгкий бот', normal: 'бот', hard: 'тяжёлый бот' };
  const CENTER_RU = {
    A1: 'Араумикос: город на 6 мест, 8 ПО, жетон контроля — много очков',
    A2: 'Город туманов, Тёмное пламя, Галленгаст: бонус в начале хода за все три региона',
    A3: 'Араумикос (2 места) и шесть застав с белыми отрядами',
    A4: 'густая сеть маршрутов: 7 узлов, 12 связей',
    A5: 'сеть маршрутов: 7 узлов, все пути через центр',
    A6: 'дерево маршрутов: 7 узлов без колец, путь не обойти',
    A7: 'один узел на пересечении всех путей — блокирующий',
    A8: 'кольцо маршрутов: 6 узлов',
    A9: 'Колодцы тьмы: стартовый регион на 9 мест, 9 ПО — много войск',
  };

  let pending = null;   // { req, resolve }
  let busy = false;     // идёт розыгрыш эффекта / ход бота
  let lastViewer = null;
  // игра по сети: ведущий держит партию, гость видит её копию и шлёт команды
  const net = { seat: null, host: null, hostBusy: false, seats: {}, online: {}, tokens: {}, asks: new Map(), askSeq: 0, syncT: 0, started: false, lobby: null, join: null };
  const NET_VER = `1:${CARDS_DATA.length}:${typeof WEB_TILES !== 'undefined' ? WEB_TILES.length : 0}`;   // у гостя должна быть та же версия игры
  const isGuest = () => NET.role === 'guest', isHost = () => NET.role === 'host';
  const local = P => !P.bot && !P.remote;   // человек за этим компьютером
  const humans = () => isGuest() ? [net.seat] : S.players.filter(local).map(P => P.idx);
  function viewer() { if (isGuest()) return net.seat; if (local(S.players[S.cur])) return S.cur; const h = humans(); return h.length ? (lastViewer != null && h.includes(lastViewer) ? lastViewer : h[0]) : null; }
  const isBusy = () => isGuest() ? net.hostBusy : busy;
  const myTurn = () => S && S.phase === 'turn' && !pending && !isBusy() && (isGuest() ? S.cur === net.seat : local(S.players[S.cur]));

  // ---------- настройка ----------
  const setup = { n: 2, seats: [], decks: ['drow', 'dragons'], side: 'L', speed: 450, level: 'normal', modules: { pop: false, gems: false } };
  function initSetup() {
    for (let i = 0; i < 4; i++) setup.seats.push({ name: i === 0 ? 'Игрок' : HOUSES[i].name, bot: i !== 0, hex: HOUSES[i].hex });
    try { const s = JSON.parse(localStorage.getItem('tyrants.setup') || 'null'); if (s) Object.assign(setup, s); } catch (e) {}
    setup.seats.forEach((s, i) => { if (!s.hex) s.hex = HOUSES[i].hex; });
    setup.palOpen = null;
    setTimeout(resumeSession, 0);
    // палитра закрывается щелчком мимо
    document.addEventListener('click', e => { if (setup.palOpen != null && !e.target.closest('.palette, .sw.pick')) { setup.palOpen = null; renderSetup(); } });
    renderSetup();
  }
  function renderSetup() {
    const box = $('#setupBody'); box.innerHTML = '';
    const nRow = el('div', { class: 'row' }, '<span class="lbl">Игроков:</span>');
    for (const n of [2, 3, 4]) nRow.append(el('button', { class: 'pill' + (setup.n === n ? ' on' : ''), onclick: () => { setup.n = n; renderSetup(); } }, n));
    box.append(nRow);
    const seats = el('div', { class: 'seats' + (setup.n > 2 ? ' two' : '') });
    for (let i = 0; i < setup.n; i++) {
      const s = setup.seats[i];
      const r = el('div', { class: 'row seat' });
      const sw = el('button', { class: 'sw pick', style: `background:${s.hex}`, title: 'Выбрать цвет', onclick: () => { setup.palOpen = setup.palOpen === i ? null : i; renderSetup(); } });
      r.append(sw);
      if (setup.palOpen === i) {
        const pal = el('div', { class: 'palette' });
        for (const [hex, nm] of PALETTE) {
          const other = setup.seats.slice(0, setup.n).findIndex((o, j) => j !== i && o.hex === hex);
          pal.append(el('button', { class: (s.hex === hex ? 'on' : '') + (other >= 0 ? ' taken' : ''), style: `background:${hex}`, title: nm + (other >= 0 ? ` — занят (${setup.seats[other].name}), поменяетесь цветами` : ''),
            onclick: () => { if (other >= 0) setup.seats[other].hex = s.hex; s.hex = hex; setup.palOpen = null; renderSetup(); } }));
        }
        r.append(pal);
      }
      r.append(el('span', { class: 'house' }, HOUSES[i].name));
      const inp = el('input', { value: s.name, maxlength: 18 }); inp.oninput = () => { s.name = inp.value; };
      r.append(inp);
      const kind = s.net ? 'net' : s.bot ? 'bot' : 'human';
      for (const [k, t, hint] of [['human', 'Человек', 'играет за этим компьютером'], ['bot', 'Бот', ''], ['net', 'Сеть', 'игрок подключится со своего компьютера по коду комнаты']])
        r.append(el('button', { class: 'pill' + (kind === k ? ' on' : ''), title: hint, onclick: () => { s.bot = k === 'bot'; s.net = k === 'net'; renderSetup(); } }, t));
      if (s.net) { inp.disabled = true; inp.value = 'имя придёт от игрока'; }
      seats.append(r);
    }
    box.append(seats);
    const dRow = el('div', { class: 'row wrap' }, '<span class="lbl" title="Выберите две колоды">Колоды рынка (2):</span>');
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
    if (setup.board === 'web') bRow.append(el('button', { class: 'pill' + (setup.xhex ? ' on' : ''), title: 'Один из экспериментальных гексов X1–X4 заменяет гекс C: регионы без маршрутов, развилки, транзитные узлы. Правила дополнения: «на свой страх и риск»',
      onclick: () => { setup.xhex = !setup.xhex; renderSetup(); } }, '+ X-гекс'));
    box.append(bRow);
    // центральный гекс: по правилам его выбирают игроки
    if (setup.board === 'web') {
      const cRow = el('div', { class: 'row wrap' }, '<span class="lbl">Центр поля:</span>');
      const cur = setup.center || '';
      for (const [v, t] of [['', 'случайный'], ...Object.keys(CENTER_RU).map(k => [k, k])])
        cRow.append(el('button', { class: 'pill mini' + (cur === v ? ' on' : ''), title: v ? CENTER_RU[v] : 'Любой гекс A', onclick: () => { setup.center = v; renderSetup(); } }, t));
      box.append(cRow);
      const info = el('div', { class: 'row centerInfo' });
      if (cur) info.append(el('img', { src: `img/web/${cur}.webp`, alt: cur, class: 'centerImg' }));
      info.append(el('span', { class: 'hint' }, cur ? `${cur} — ${CENTER_RU[cur]}` : 'Центральный гекс выберется случайно из A1–A9.'));
      box.append(info);
    }
    if (setup.n === 3 && setup.board !== 'web') {
      const sRow = el('div', { class: 'row' }, '<span class="lbl">Часть поля:</span>');
      for (const [v, t] of [['L', 'центр + левая'], ['R', 'центр + правая']]) sRow.append(el('button', { class: 'pill' + (setup.side === v ? ' on' : ''), onclick: () => { setup.side = v; renderSetup(); } }, t));
      box.append(sRow);
    }
    const spRow = el('div', { class: 'row' }, '<span class="lbl">Скорость ботов:</span>');
    for (const [v, t] of [[900, 'медленно'], [450, 'обычно'], [120, 'быстро']]) spRow.append(el('button', { class: 'pill' + (setup.speed === v ? ' on' : ''), onclick: () => { setup.speed = v; renderSetup(); } }, t));
    box.append(spRow);
    const lRow = el('div', { class: 'row' }, '<span class="lbl">Сложность ботов:</span>');
    for (const [v, t, hint] of [['easy', 'лёгкая', 'ошибается, тратит не всю силу'], ['normal', 'средняя', ''], ['hard', 'тяжёлая', 'следит за лидером, бережёт отряды, выше ценит повышения']])
      lRow.append(el('button', { class: 'pill' + ((setup.level || 'normal') === v ? ' on' : ''), title: hint, onclick: () => { setup.level = v; renderSetup(); } }, t));
    box.append(lRow);
    const ok = setup.decks.length === 2;
    box.append(el('div', { class: 'row' }, `<span class="hint">${setup.board === 'web' ? 'Поле из гексов собирается под число игроков.' : setup.n === 2 ? 'Вдвоём играется только центральная часть поля.' : setup.n === 3 ? 'Втроём — центр и одна боковая часть.' : 'Вчетвером — всё поле.'} Первая партия — рекомендуются Дроу + Драконы.</span>`));
    const hasNet = setup.seats.slice(0, setup.n).some(s => s.net);
    const st = el('button', { class: 'big', onclick: start }, hasNet ? 'Создать комнату' : 'Начать партию'); if (!ok) st.disabled = true;
    box.append(st);
    box.append(el('button', { class: 'joinBtn', onclick: joinDialog, title: 'Друг создал комнату — введите его код' }, 'Присоединиться к игре по коду'));
  }
  async function start() {
    try { localStorage.setItem('tyrants.setup', JSON.stringify(setup)); } catch (e) {}
    const seats = setup.seats.slice(0, setup.n);
    let names = {};
    if (seats.some(s => s.net)) { names = await hostLobby(seats); if (!names) return; }
    const players = seats.map((s, i) => ({ name: names[i] || s.name.trim() || HOUSES[i].name, bot: s.bot && !s.net, remote: !!s.net, level: setup.level || 'normal', hex: s.hex || HOUSES[i].hex, house: HOUSES[i].name }));
    newGame({ players, decks: setup.decks, side: setup.side, botDelay: setup.speed, modules: setup.modules, board: setup.board || 'base', xhex: setup.board === 'web' && !!setup.xhex, center: setup.board === 'web' && setup.center || null });
    showGame();
    if (isHost()) { net.started = true; for (const seat in net.seats) sendStart(+seat); }
    await initialDeploy();
    await startTurn();
  }
  function showGame() {
    $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
    $('#log').innerHTML = ''; S.log.forEach(m => onLog(m)); logNew = 0; setTab('game');
    buildBoardStatic(); render();
  }

  // ---------- игра по сети: ведущий ----------
  const toGuests = msg => { for (const seat in net.seats) if (net.online[seat]) NET.send(net.seats[seat], msg); };
  const seatOfPeer = id => { for (const s in net.seats) if (net.seats[s] === id) return +s; return null; };
  function stateMsg() { const s = Object.assign({}, S); delete s.log; return s; }
  function sendStart(seat) {
    const id = net.seats[seat]; if (!id) return;
    NET.send(id, { t: 'start', seat, S: stateMsg(), sections: T.sections, log: S.log.slice(-300), busy });
    for (const [k, a] of net.asks) if (a.p === seat) NET.send(id, { t: 'ask', id: k, req: a.req });   // незакрытые вопросы — заново
  }
  // состояние рассылается не чаще раза в 60 мс; перед вопросом и в конце партии — сразу
  function scheduleSync() { if (!isHost() || !net.started || net.syncT) return; net.syncT = setTimeout(flushSync, 60); }
  function flushSync() { clearTimeout(net.syncT); net.syncT = 0; if (isHost() && net.started) toGuests({ t: 'sync', S: stateMsg(), busy }); }
  function hostMsg(from, m) {
    if (m.t === 'hello') return hostHello(from, m);
    const seat = seatOfPeer(from); if (seat == null) return;
    if (m.t === 'answer') { const a = net.asks.get(m.id); if (a && a.p === seat) { net.asks.delete(m.id); a.resolve(decodeAnswer(a.req, m.v)); render(); } return; }
    if (m.t === 'cmd') {
      if (net.started && S.cur === seat && S.players[seat].remote && S.phase === 'turn' && !busy && !pending && !net.asks.size) exec(m.c);
      flushSync();   // гость ждёт ответа, даже если команда не прошла
    }
  }
  function hostHello(from, m) {
    const refuse = text => { NET.send(from, { t: 'refuse', text }); setTimeout(() => NET.kick(from), 500); };
    if (m.ver !== NET_VER) return refuse('У вас другая версия игры. Нужна та же, что у ведущего.');
    const name = String(m.name || '').trim().slice(0, 18), token = String(m.token || '');
    const take = seat => { const old = net.seats[seat]; if (old && old !== from) NET.kick(old); net.seats[seat] = from; net.online[seat] = true; net.tokens[seat] = token; };
    if (!net.started) {
      if (!net.lobby) return refuse('Партия ещё не создана.');
      // тот же гость после перезагрузки — на своё место, новый — на первое свободное
      let free = token ? net.lobby.seats.findIndex((s, i) => s.net && net.tokens[i] === token) : -1;
      if (free < 0) free = net.lobby.seats.findIndex((s, i) => s.net && !net.seats[i]);
      if (free < 0) return refuse('Все места для сетевых игроков уже заняты.');
      take(free); net.lobby.names[free] = name || HOUSES[free].name;
      NET.send(from, { t: 'lobby', seat: free, house: HOUSES[free].name, hex: net.lobby.seats[free].hex, code: NET.code });
      net.lobby.draw(); return;
    }
    // партия идёт — вернуть отключившегося игрока на его место
    // по ключу — даже если ведущий ещё не заметил обрыв; иначе — отключившийся с тем же именем или любой отключившийся
    const cands = S.players.filter(P => P.remote && !net.online[P.idx]);
    const P = (token && S.players.find(P => P.remote && net.tokens[P.idx] === token)) || cands.find(P => P.name === name) || cands[0];
    if (!P) return refuse('Партия уже идёт, свободных мест нет. Возможно, ваше место уже отдано боту.');
    take(P.idx);
    sendStart(P.idx); flash(`${P.name} снова в игре`, 2500); render();
  }
  function hostClose(from) {
    const seat = seatOfPeer(from); if (seat == null) return;
    net.online[seat] = false;
    if (!net.started) { delete net.seats[seat]; if (net.lobby) { delete net.lobby.names[seat]; net.lobby.draw(); } return; }
    flash(`${S.players[seat].name} отключился — можно подождать или отдать место боту`, 4000); render();
  }
  function hostLobby(seats) {
    const m = openModal(); m.classList.add('lobby');
    m.innerHTML = '<h2>Комната для игры по сети</h2><p class="dim">Создаю комнату…</p>';
    return new Promise(async resolve => {
      let code;
      try { code = await NET.host({ msg: hostMsg, close: hostClose, error: t => flash(t, 3500) }); }
      catch (e) { m.innerHTML = `<h2>Не получилось создать комнату</h2><p>${e.message}</p>`; m.append(el('button', { class: 'skip', onclick: closeModal }, 'Закрыть')); return resolve(null); }
      const finish = names => { net.lobby = null; closeModal(); resolve(names); };
      net.lobby = { seats, names: {}, draw };
      function draw() {
        m.innerHTML = '';
        m.append(el('h2', {}, 'Комната для игры по сети'));
        m.append(el('p', {}, 'Сообщите код другу. Он открывает свою копию игры, нажимает «Присоединиться к игре по коду» и вводит этот код.'));
        const row = el('div', { class: 'row' });
        row.append(el('div', { class: 'roomCode' }, code));
        row.append(el('button', { class: 'mini', onclick: e => { navigator.clipboard && navigator.clipboard.writeText(code); e.target.textContent = 'Скопировано'; } }, 'Копировать'));
        m.append(row);
        for (const [i, s] of seats.entries()) {
          const st = s.net ? (net.lobby.names[i] ? `<b class="ok">✓ ${net.lobby.names[i]}</b> — подключён` : '<span class="dim">ждём игрока…</span>') : s.bot ? 'бот' : `${s.name || 'Игрок'} — за этим компьютером`;
          m.append(el('div', { class: 'lobbySeat' }, `<span class="sw" style="background:${s.hex}"></span><span class="house">${HOUSES[i].name}</span>${st}`));
        }
        const ready = seats.every((s, i) => !s.net || net.seats[i]);
        const brow = el('div', { class: 'brow end' });
        brow.append(el('button', { class: 'skip', onclick: () => { NET.close(); net.seats = {}; net.online = {}; finish(null); } }, 'Отмена'));
        const go = el('button', { class: 'opt', onclick: () => finish({ ...net.lobby.names }) }, 'Начать партию'); go.disabled = !ready;
        brow.append(go); m.append(brow);
      }
      draw();
    });
  }
  // ответ гостя приходит номером варианта — превращаем обратно в вариант
  function encodeAnswer(req, v) {
    if (v == null) return null;
    if (req.kind === 'board') return req.opts.indexOf(v);
    if (req.kind === 'choice') return req.options.findIndex(o => o.value === v);
    return v;
  }
  function decodeAnswer(req, v) {
    if (v == null || v === -1) return null;
    if (req.kind === 'board') return req.opts[v] || null;
    if (req.kind === 'choice') return req.options[v] ? req.options[v].value : null;
    return v;
  }
  function netAsk(p, req) {
    return new Promise(resolve => {
      const id = ++net.askSeq; net.asks.set(id, { p, req, resolve });
      flushSync(); if (net.online[p]) NET.send(net.seats[p], { t: 'ask', id, req });
      render();
    });
  }
  // отключившегося игрока заменяет бот
  function convertToBot(p) {
    const P = S.players[p]; P.remote = false; P.bot = true; P.level = setup.level || 'normal';
    const id = net.seats[p]; delete net.seats[p]; net.online[p] = false; if (id) NET.kick(id);
    log(`${pn(p)}: дальше за этого игрока ходит бот.`);
    for (const [k, a] of [...net.asks]) if (a.p === p) { net.asks.delete(k); Promise.resolve(AI.resolve(p, a.req)).then(a.resolve); }
    const go = () => {
      if (busy) return setTimeout(go, 200);
      if (S.cur !== p || S.phase !== 'turn') return render();
      busy = true; render();
      (async () => { try { await AI.takeTurn(p); await endTurn(); } catch (e) { console.error(e); } busy = false; render(); })();
    };
    go();
  }

  // ---------- игра по сети: гость ----------
  // ключ этой вкладки: после перезагрузки ведущий узнаёт гостя и возвращает на его место
  const store = (kind, key, val) => { try { const st = kind === 's' ? sessionStorage : localStorage; if (val === undefined) return JSON.parse(st.getItem(key) || 'null'); if (val === null) st.removeItem(key); else st.setItem(key, JSON.stringify(val)); } catch (e) { return null; } };
  const myToken = store('s', 'tyrants.netToken') || (() => { const t = Math.random().toString(36).slice(2) + Date.now().toString(36); store('s', 'tyrants.netToken', t); return t; })();
  const saveSession = () => { store('s', 'tyrants.netSession', { ...net.join, t: Date.now() }); store('l', 'tyrants.lastJoin', net.join); };
  const dropSession = () => store('s', 'tyrants.netSession', null);
  const rj = { on: false, tries: 0, timer: 0 };   // автоматическое переподключение
  function banner(text) {
    const b = $('#netBanner'); b.classList.toggle('hidden', !text); if (!text) return;
    b.innerHTML = ''; b.append(el('span', {}, text));
    b.append(el('button', { class: 'mini', onclick: () => { stopRejoin(); dropSession(); NET.close(); location.reload(); } }, 'Выйти из партии'));
  }
  function joinStatus(text) { const st = document.querySelector('.lobby .jStatus'); if (st) st.textContent = text; else if (!rj.on) flash(text, 4000); }
  function connectOnce() {
    clearTimeout(rj.timer);
    const { name, code } = net.join;
    NET.close();
    NET.join(code, { msg: guestMsg, open: id => NET.send(id, { t: 'hello', name, token: myToken, ver: NET_VER }), close: guestLost, error: connFail })
      .then(id => { net.host = id; }, e => connFail(e.message));
    rj.timer = setTimeout(() => connFail('ведущий не отвечает'), 10000);   // ответа нет — следующая попытка
  }
  function connFail(text) {
    clearTimeout(rj.timer);
    if (!rj.on) { joinStatus(text); return; }
    // пауза между попытками растёт: 1, 2, 4, 8, 10 секунд
    const d = Math.min(10000, 1000 * 2 ** Math.min(rj.tries, 4)); rj.tries++;
    banner(`Связь с ведущим потеряна. Переподключаюсь… (попытка ${rj.tries + 1})`);
    rj.timer = setTimeout(() => { if (rj.on) connectOnce(); }, d);
  }
  function startRejoin(text) { rj.on = true; rj.tries = 0; banner(text); connectOnce(); }
  function stopRejoin() { rj.on = false; clearTimeout(rj.timer); banner(null); }
  function joinDialog() {
    const last = net.join || store('l', 'tyrants.lastJoin') || {};
    const m = openModal(); m.classList.add('lobby');
    const name = el('input', { value: last.name || setup.seats[0].name || 'Игрок', maxlength: 18 });
    const code = el('input', { value: last.code || '', maxlength: 5, placeholder: 'ABCDE', class: 'codeIn' });
    const status = el('p', { class: 'dim jStatus' }, 'Нужен интернет. Игра у вас и у ведущего должна быть одной версии.');
    const go = el('button', { class: 'opt', onclick: () => guestConnect(name.value.trim() || 'Игрок', code.value.trim().toUpperCase()) }, 'Подключиться');
    m.append(el('h2', {}, 'Присоединиться к игре'));
    const r1 = el('div', { class: 'row seat' }, '<span class="lbl">Ваше имя:</span>'); r1.append(name); m.append(r1);
    const r2 = el('div', { class: 'row seat' }, '<span class="lbl">Код комнаты:</span>'); r2.append(code); m.append(r2);
    m.append(status);
    const brow = el('div', { class: 'brow end' });
    brow.append(el('button', { class: 'skip', onclick: () => { stopRejoin(); NET.close(); closeModal(); } }, 'Отмена')); brow.append(go);
    m.append(brow); code.focus();
  }
  function guestConnect(name, code) {
    if (code.length < 5) { joinStatus('Введите код из 5 символов.'); return; }
    net.join = { name, code }; rj.on = false;
    joinStatus('Подключаюсь…');
    connectOnce();
  }
  function guestMsg(from, m) {
    if (m.t === 'refuse') {
      const wasRejoin = rj.on; stopRejoin(); dropSession(); NET.close();
      if (S || wasRejoin) { const box = openModal(); box.classList.add('confirm'); box.append(el('h3', {}, 'Вернуться в партию не получилось'));
        box.append(el('p', {}, m.text)); box.append(el('button', { class: 'opt', onclick: () => location.reload() }, 'В меню')); }
      else joinStatus(m.text);
      return;
    }
    if (m.t === 'lobby') {
      net.seat = m.seat; stopRejoin(); saveSession();
      const box = openModal(); box.classList.add('lobby');
      box.append(el('h2', {}, `Вы в комнате ${m.code}`));
      box.append(el('p', {}, `Ваш дом: <span class="sw" style="background:${m.hex}"></span> <b>${m.house}</b>. Ждём, пока ведущий начнёт партию…`));
      box.append(el('button', { class: 'skip', onclick: () => { stopRejoin(); dropSession(); NET.close(); closeModal(); } }, 'Выйти из комнаты'));
      return;
    }
    if (m.t === 'start') {
      const back = !!S; stopRejoin(); saveSession();
      net.seat = m.seat; net.hostBusy = m.busy; pending = null; closeModal();
      S = m.S; S.log = []; setBoard(S.board); T = buildTopology(m.sections);
      showGame(); m.log.forEach(x => onLog(x)); logNew = 0; updTabs();
      if (back) flash('Связь восстановлена', 2000);
      return;
    }
    if (!S) return;
    if (m.t === 'sync') { S = m.S; S.log = []; net.hostBusy = m.busy; render(); }
    else if (m.t === 'log') onLog(m.msg, m.replace);
    else if (m.t === 'fx') fx(m.kind, m.id);
    else if (m.t === 'ask') { pending = null; showAsk(m.req).then(v => NET.send(net.host, { t: 'answer', id: m.id, v: encodeAnswer(m.req, v) })); }
    else if (m.t === 'over') { dropSession(); render(); showScores(); }
  }
  function guestLost() {
    if (rj.on) return connFail('нет связи');
    if (!net.join) return;
    if (S || net.seat != null) startRejoin('Связь с ведущим потеряна. Переподключаюсь…');   // в партии или в комнате — пробуем сами
    else joinStatus('Связь с ведущим потеряна.');
  }
  // страницу перезагрузили посреди партии — возвращаемся сами
  function resumeSession() {
    const ses = store('s', 'tyrants.netSession');
    if (!ses || Date.now() - ses.t > 12 * 3600e3) return;
    net.join = { name: ses.name, code: ses.code };
    startRejoin(`Возвращаюсь в партию ${ses.code}…`);
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
  // ---------- камера: приближение, перемещение, вращение (как в RTS) ----------
  // экран = (x, y) + R(a) · s · точка поля; вращение — вокруг центра экрана
  const view = { s: 1, x: 0, y: 0, a: 0 };
  let dragged = false;
  const wrapSize = () => { const w = $('#boardWrap'); return [w.clientWidth, w.clientHeight]; };
  const center = () => wrapSize().map(v => v / 2);
  function applyView() {
    const [W, H] = wrapSize();
    view.s = Math.max(0.6, Math.min(6, view.s));
    // в центре экрана всегда какая-то точка поля: так до любого края можно доехать при любом приближении
    const r = view.a * Math.PI / 180, co = Math.cos(r), si = Math.sin(r), cx = W / 2 - view.x, cy = H / 2 - view.y;
    const px = Math.min(W, Math.max(0, (co * cx + si * cy) / view.s)), py = Math.min(H, Math.max(0, (-si * cx + co * cy) / view.s));
    view.x = W / 2 - view.s * (co * px - si * py); view.y = H / 2 - view.s * (si * px + co * py);
    $('#board').style.transform = `translate(${view.x}px, ${view.y}px) rotate(${view.a}deg) scale(${view.s})`;
  }
  function zoomAt(f, mx, my) {
    const ns = Math.max(0.6, Math.min(6, view.s * f));
    view.x = mx - (mx - view.x) * ns / view.s; view.y = my - (my - view.y) * ns / view.s; view.s = ns;
    applyView();
  }
  function rotateAt(da, mx, my) {
    const r = da * Math.PI / 180, co = Math.cos(r), si = Math.sin(r), dx = view.x - mx, dy = view.y - my;
    view.x = mx + dx * co - dy * si; view.y = my + dx * si + dy * co; view.a = (view.a + da) % 360;
    applyView();
  }
  // плавный возврат: масштаб 1, без поворота
  let tween = 0;
  function resetView(animate) {
    cancelAnimationFrame(tween);
    const from = { ...view }, to = { s: 1, x: 0, y: 0, a: Math.abs(view.a) > 180 ? Math.sign(view.a) * 360 : 0 };
    if (!animate) { Object.assign(view, { s: 1, x: 0, y: 0, a: 0 }); applyView(); return; }
    const t0 = performance.now(), T = 350;
    const step = now => {
      const k = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - k, 3);
      for (const key in to) view[key] = from[key] + (to[key] - from[key]) * e;
      if (k < 1) { $('#board').style.transform = `translate(${view.x}px, ${view.y}px) rotate(${view.a}deg) scale(${view.s})`; tween = requestAnimationFrame(step); }
      else { view.a = 0; applyView(); }
    };
    tween = requestAnimationFrame(step);
  }
  // вращение с разгоном и торможением: spin — куда крутить (−1, 0, 1)
  const SPIN_MAX = 110, SPIN_ACC = 650;   // град/с, град/с²
  let spin = 0, spinV = 0, spinRaf = 0;
  function setSpin(d) {
    spin = d; if (spinRaf) return;
    cancelAnimationFrame(tween);
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000), dv = SPIN_ACC * dt; last = now;
      spinV += Math.max(-dv, Math.min(dv, spin * SPIN_MAX - spinV));
      if (spinV) rotateAt(spinV * dt, ...center());
      if (spin || Math.abs(spinV) > 1) spinRaf = requestAnimationFrame(step); else { spinV = 0; spinRaf = 0; }
    };
    spinRaf = requestAnimationFrame(step);
  }
  function bindPanZoom() {
    const wrap = $('#boardWrap');
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // левая кнопка — перемещение, правая или средняя — вращение
    let start = null;
    wrap.addEventListener('pointerdown', e => {
      if (e.target.closest('#zoomCtl') || e.button > 2) return;
      if (e.button !== 0) e.preventDefault();
      cancelAnimationFrame(tween);
      start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, rot: e.button !== 0, lx: e.clientX }; dragged = false;
    });
    window.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true; $('#board').classList.add('panning');
      if (start.rot) { rotateAt((e.clientX - start.lx) * 0.35, ...center()); start.lx = e.clientX; return; }
      view.x = start.vx + dx; view.y = start.vy + dy; applyView();
    });
    window.addEventListener('pointerup', () => { start = null; $('#board').classList.remove('panning'); });
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    wrap.addEventListener('auxclick', e => e.preventDefault());
    // после перетаскивания клик по локации не срабатывает
    wrap.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
    $('#zIn').onclick = () => zoomAt(1.4, ...center());
    $('#zOut').onclick = () => zoomAt(1 / 1.4, ...center());
    $('#zReset').onclick = () => resetView(true);
    // кнопки вращения — пока зажаты
    for (const [id, d] of [['#rL', -1], ['#rR', 1]]) {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); setSpin(d); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { if (spin === d) setSpin(0); });
    }
    // Q / E — вращение, пока клавиша зажата
    const KEYS = { KeyQ: -1, KeyE: 1 };
    window.addEventListener('keydown', e => {
      if (!(e.code in KEYS) || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea')) || $('#game').classList.contains('hidden')) return;
      setSpin(KEYS[e.code]);
    });
    window.addEventListener('keyup', e => { if (e.code in KEYS && spin === KEYS[e.code]) setSpin(0); });
    window.addEventListener('blur', () => setSpin(0));
    window.addEventListener('resize', applyView);
  }
  function buildBoardStatic() {
    resetView();
    const svg = $('#svg'); svg.innerHTML = '';
    svg.setAttribute('viewBox', (S.board.web ? S.board.view : [0, 0, 2000, 2000]).join(' '));
    const root = sv('g', { id: 'gRoot' }); svg.append(root);
    if (S.board.web) {
      const gT = sv('g', { id: 'gTiles' });
      for (const t of S.board.tiles) {
        const im = sv('image', { href: `img/web/${t.id}.webp`, x: -500, y: -433, width: 1000, height: 866, transform: `translate(${t.x} ${t.y}) rotate(${t.rot * 60})` });
        gT.append(im);
      }
      root.append(gT);
    } else {
      root.append(sv('image', { href: 'img/board.jpg', x: 0, y: 0, width: 2000, height: 2000, preserveAspectRatio: 'none' }));
      for (const s of ['L', 'R']) if (!T.sections.includes(s)) root.append(sv('polygon', { points: SHADE[s], class: 'shade' }));
    }
    for (const id of ['gReg', 'gLoc', 'gSpy', 'gFx', 'gOpt']) root.append(sv('g', { id }));
    prevBoard = null; anim.clear(); pendingKill.clear();
  }
  // ---------- анимации: отряды и шпионы появляются и исчезают ----------
  let prevBoard = null;          // что было на поле при прошлой отрисовке
  const anim = new Map();        // ключ -> время начала появления
  // появление переживает перерисовки: анимация продолжается с того же места
  function popIn(node, key, isNew) {
    const now = performance.now();
    if (isNew) anim.set(key, now);
    const t = anim.get(key); if (t == null) return;
    if (now - t > 600) { anim.delete(key); return; }
    node.classList.add('popIn'); node.style.animationDelay = `${-(now - t)}ms`;
  }
  const pendingKill = new Set();   // локации, где отряд только что уничтожен
  function fx(kind, id) { if (kind === 'kill') pendingKill.add(id); if (isHost() && net.started) toGuests({ t: 'fx', kind, id }); }
  // кружок раскалывается на куски, они разлетаются и под «силой тяжести» падают вниз за экран
  function shatter(l, fill, stroke) {
    const probe = sv('circle', { cx: l.x, cy: l.y, r: 21, fill: 'none' }); $('#gFx').append(probe);
    const b = probe.getBoundingClientRect(); probe.remove();
    if (!b.width) return;
    const sx = b.left + b.width / 2, sy = b.top + b.height / 2, r = b.width / 2, layer = $('#fxLayer');
    const N = 7, a0 = Math.random() * Math.PI * 2, G = 2200;
    for (let k = 0; k < N; k++) {
      const a1 = a0 + k * 2 * Math.PI / N, a2 = a1 + 2 * Math.PI / N, am = (a1 + a2) / 2;
      const pts = ['50% 50%']; for (let q = 0; q <= 4; q++) { const a = a1 + (a2 - a1) * q / 4; pts.push(`${50 + 54 * Math.cos(a)}% ${50 + 54 * Math.sin(a)}%`); }
      const p = el('div', { class: 'shard' });
      Object.assign(p.style, { left: `${sx - r}px`, top: `${sy - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, background: fill,
        borderColor: stroke, borderWidth: `${Math.max(1.5, r * 0.19)}px`, clipPath: `polygon(${pts.join(',')})`, transformOrigin: `${50 + 30 * Math.cos(am)}% ${50 + 30 * Math.sin(am)}%` });
      layer.append(p);
      // разлёт наружу и чуть вверх, затем падение до низа экрана
      const vx = Math.cos(am) * (90 + Math.random() * 160), vy = Math.sin(am) * 120 - 260 - Math.random() * 200, spin = (Math.random() - 0.5) * 900;
      const H = innerHeight - sy + 3 * r + 40, T = (-vy + Math.sqrt(vy * vy + 2 * G * H)) / G;
      const frames = [{ transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 }];
      const crack = 0.05;   // короткая пауза «трещины» — куски чуть расходятся
      frames.push({ transform: `translate(${Math.cos(am) * r * 0.18}px, ${Math.sin(am) * r * 0.18}px) rotate(0deg)`, opacity: 1, offset: crack });
      for (let i = 1; i <= 14; i++) {
        const t = T * i / 14;
        frames.push({ transform: `translate(${Math.cos(am) * r * 0.18 + vx * t}px, ${Math.sin(am) * r * 0.18 + vy * t + G * t * t / 2}px) rotate(${spin * t}deg)`, opacity: i === 14 ? 0.6 : 1, offset: crack + (1 - crack) * i / 14 });
      }
      const an = p.animate(frames, { duration: (T + 0.08) * 1000, easing: 'linear', fill: 'forwards' });
      an.onfinish = () => p.remove(); setTimeout(() => p.remove(), (T + 1) * 1000);
    }
    // вспышка на месте гибели
    const fl = sv('circle', { cx: l.x, cy: l.y, r: 21, class: 'deathFlash' }); $('#gFx').append(fl);
    setTimeout(() => fl.remove(), 600);
  }
  function ghost(node) {
    node.classList.add('ghost');
    $('#gFx').append(node);
    const rm = () => node.remove(); node.addEventListener('animationend', rm); setTimeout(rm, 900);
  }
  function spyShape(x, y, hex) {
    const g = sv('g', { class: 'spyG' });
    g.append(sv('path', { d: `M${x} ${y - 30} L${x + 24} ${y} L${x} ${y + 30} L${x - 24} ${y} Z`, fill: hex, class: 'spy' }));
    g.append(sv('path', { d: `M${x - 13} ${y} Q${x} ${y - 12} ${x + 13} ${y} Q${x} ${y + 12} ${x - 13} ${y} Z`, class: 'spyEye' }));
    g.append(sv('circle', { cx: x, cy: y, r: 4.5, fill: hex, 'pointer-events': 'none' }));
    return g;
  }
  function renderBoard() {
    const gReg = $('#gReg'), gLoc = $('#gLoc'), gSpy = $('#gSpy'), gOpt = $('#gOpt');
    gReg.innerHTML = ''; gLoc.innerHTML = ''; gSpy.innerHTML = ''; gOpt.innerHTML = '';
    const prev = prevBoard, spyNow = new Map();
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
        // в центре рисунка города: на гексах — центр тайла, на классическом поле круг города над плашкой отрядов
        const [cx, cy] = r.center || [(b.x0 + b.x1) / 2 + 12, b.y0 - 150];
        g.append(sv('circle', { cx, cy, r: 52, fill: tk.owner != null ? S.players[tk.owner].hex : '#4b3a6b', stroke: tk.full ? '#ffd75a' : '#e8dcff', 'stroke-width': tk.full ? 7 : 4 }));
        g.append(sv('image', { href: INF_URI, x: cx - 33, y: cy - 33, width: 66, height: 66 }));
        if (tk.full) {
          g.append(sv('circle', { cx: cx + 40, cy: cy - 40, r: 18, fill: '#ffd75a', stroke: '#3a2600', 'stroke-width': 3 }));
          const tx = sv('text', { x: cx + 40, y: cy - 32, class: 'tokStar' }); tx.textContent = '★'; g.append(tx);
        }
        const tt = sv('title'); tt.textContent = tokTitle(rid); g.append(tt);
        gReg.append(g);
      }
      // шпионы
      S.spies[rid].forEach((q, k) => {
        const x = (b.x0 + b.x1) / 2 + (k - (S.spies[rid].length - 1) / 2) * 54, y = b.y1 + 66;
        const key = rid + ':' + q;
        const g = spyShape(x, y, S.players[q].hex), d = g.firstChild;
        if (optSpy.has(key)) { d.classList.add('opt'); d.onclick = () => answer(optSpy.get(key)); }
        const tt = sv('title'); tt.textContent = `Шпион: ${S.players[q].name}`; d.append(tt);
        spyNow.set(key, { x, y, hex: S.players[q].hex });
        popIn(g, 'spy:' + key, prev && !prev.spy.has(key));
        gSpy.append(g);
      });
    }
    for (const id of T.act) {
      const l = LOC[id], v = S.occ[id];
      const isOpt = optLoc.has(id) || (l.region && optReg.has(l.region));
      const c = sv('circle', { cx: l.x, cy: l.y, r: 21, class: 'loc' + (v == null ? ' empty' : v === 'W' ? ' white' : ' troop') });
      if (v != null && v !== 'W') { c.setAttribute('fill', S.players[v].hex); c.setAttribute('stroke', lightHex(S.players[v].hex)); }
      gLoc.append(c);
      const was = prev ? prev.occ[id] : undefined;
      if (v != null) popIn(c, 'loc:' + id, prev && was !== v);
      if (prev && was != null && was !== v) {
        const fill = was === 'W' ? '#fbfbfb' : S.players[was].hex, stroke = was === 'W' ? '#555' : lightHex(fill);
        if (pendingKill.delete(id)) shatter(l, fill, stroke);
        else ghost(sv('circle', { cx: l.x, cy: l.y, r: 21, class: 'loc troop', fill, stroke }));
      }
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
    if (prev) for (const [key, s] of prev.spy) if (!spyNow.has(key)) ghost(spyShape(s.x, s.y, s.hex));
    prevBoard = { occ: { ...S.occ }, spy: spyNow };
  }
  // что даёт жетон контроля
  function tokFull(rid) {
    const tk = S.tokens[rid];
    if (!tk.pop) return `+${REG[rid].token.fullVp} ПО`;
    const e = tk.pop, a = [];
    if (e.vp) a.push(`+${e.vp} ПО`); if (e.pow) a.push(`+${e.pow}${POW}`);
    if (e.draw) a.push(`взять ${e.draw}`); if (e.discard) a.push(`сбросить ${e.discard}`);
    return a.join(', ');
  }
  function tokTitle(rid) {
    const tk = S.tokens[rid], r = REG[rid];
    return `Жетон «${r.name}»${tk.owner != null ? ` — у игрока ${S.players[tk.owner].name}` : ''}.\n` +
      `Контроль: +1 влияние в начале хода.\nПолный контроль (все локации ваши, нет чужих шпионов): ` +
      (tk.pop ? `${popText(tk.pop)} — вместо +1 влияния (Место Силы).` : `ещё +${r.token.fullVp} ПО в конце хода.`);
  }
  function lightHex(h) { return isDarkHex(h) ? '#cfc6e6' : '#ffffff'; }

  // ---------- панели ----------
  function cardImg(uid, cls, onclick) {
    const d = def(uid);
    const im = el('img', { src: img(d.id), class: 'card ' + (cls || ''), 'data-cid': d.id, draggable: 'false' });
    if (onclick) im.onclick = onclick;
    return im;
  }
  function renderPlayers() {
    const box = $('#players'); box.innerHTML = '';
    box.style.setProperty('--pc', S.players.length === 3 ? 3 : 2);
    for (const P of S.players) {
      const sc = scoreOf(P.idx);
      const toks = Object.keys(S.tokens).filter(r => S.tokens[r].owner === P.idx).map(r => {
        const tk = S.tokens[r], full = tokFull(r);
        const gives = tk.full ? (tk.pop ? full : `+1${INF} ${full}`) : `+1${INF} <span class="dim">· полный: ${full}</span>`;
        return `<span class="tokChip${tk.full ? ' full' : ''}" title="${tokTitle(r)}">${tk.full ? '★ ' : ''}<b>${REG[r].name}</b> ${gives}</span>`;
      }).join('');
      const d = el('div', { class: 'pl' + (P.idx === S.cur ? ' cur' : '') });
      d.innerHTML = `<div class="plTop"><span class="sw" style="background:${P.hex}"></span><b>${P.name}</b>${P.bot ? ` <span class="tag">${LEVEL_RU[P.level] || 'бот'}</span>` : ''}${isGuest() && P.idx === net.seat ? ' <span class="tag me">вы</span>' : ''}${P.remote ? (isHost() && !net.online[P.idx]
          ? ' <span class="tag off">нет связи</span> <a class="toBot" title="Дальше за этого игрока будет ходить бот">отдать боту</a>' : ' <span class="tag netTag">по сети</span>') : ''}${P.idx === S.first ? ' <span class="tag">1-й</span>' : ''}
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
        </div>${toks ? `<div class="plToks">${toks}</div>` : ''}`;
      d.querySelector('.inner').onclick = () => showZone(`Внутренний круг: ${P.name}`, P.inner);
      const tb = d.querySelector('.toBot'); if (tb) tb.onclick = async () => { if (await confirmBox(`Отдать место игрока ${P.name} боту? Вернуться в эту партию он уже не сможет.`)) convertToBot(P.idx); };
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
      const im = cardImg(u, 'mk' + (canBuy && S.pool.i >= c ? ' afford' : ''), () => buyCmd(u, c));
      box.append(im);
    });
    $('#mdeckCount').textContent = S.mdeck.length;
    const sup = $('#supply'); sup.innerHTML = '';
    const pile = (uids, cost, src, label) => {
      const w = el('div', { class: 'pile' });
      if (uids.length) {
        const u = uids[uids.length - 1];
        w.append(cardImg(u, 'sp' + (canBuy && cost != null && S.pool.i >= cost ? ' afford' : ''), () => { if (cost != null) buyCmd(u, cost); }));
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
      dv.append(cardImg(u, 'sp dim' + (buyable ? ' afford' : ''), () => { if (buyable) buyCmd(u, c); }));
    } else dv.append(el('div', { class: 'card sp slot' }));
    const lnk = el('a', { class: 'pileN' }, `Поглощено: ${S.devoured.length}`); lnk.onclick = () => showZone('Поглощённые карты', S.devoured);
    dv.append(lnk); sup.append(dv);
  }
  function renderTurn() {
    const P = S.players[S.cur];
    $('#powN').textContent = S.pool.p; $('#infN').textContent = S.pool.i;
    const mine = myTurn();
    $('#turnTitle').innerHTML = S.phase === 'over' ? 'Игра окончена' : `Ход: <span style="color:${textHex(P.hex)}">${P.name}</span> · раунд ${S.round}${S.endTriggered ? ' · <b class="warn">последний раунд</b>' : ''}`;
    const bD = $('#bDeploy'), bK = $('#bKill'), bS = $('#bSpy'), bE = $('#bEnd'), bA = $('#bAll');
    bD.disabled = !mine || S.pool.p < 1;
    const empty = P.barracks === 0;
    bD.innerHTML = empty ? `+1 ПО <small>1${POW}</small>` : `Отряд <small>1${POW}</small>`;
    bD.title = empty ? 'Казармы пусты: по правилам вместо отряда вы получаете 1 ПО за 1 силу' : 'Отправить отряд за 1 силу (подряд, пока хватает силы)';
    if (S.endTriggered && !endShown) { endShown = true; flash('Условие конца игры: раунд доигрывается до конца', 3500); } bK.disabled = !mine || S.pool.p < 3; bS.disabled = !mine || S.pool.p < 3;
    bE.disabled = !mine; bA.disabled = !mine || !P.hand.length;
    const gb = $('#gems'); gb.innerHTML = '';
    const v = viewer();
    if (S.modules.gems && v === S.cur) for (const g of ['blue', 'red', 'purple']) if (P.gems[g]) {
      const b = el('button', { class: 'gemBtn ' + g, title: 'Потратить камень' }, `💎×${P.gems[g]} <small>${g === 'blue' ? '+1' + POW : g === 'red' ? '+1' + INF : '+1' + POW + ' +1' + INF}</small>`);
      b.disabled = !mine; b.onclick = () => command({ t: 'gem', g });
      gb.append(b);
    }
    if (S.board.web && v === S.cur) {
      const spots = stoneSpots(S.cur);
      if (spots.length && !S.flags.stoneTaken) {
        const b = el('button', { class: 'gemBtn purple', title: 'Ваш отряд стоит на Камне Силы' }, `Взять камень <small>1${POW}</small>`);
        b.disabled = !mine || S.pool.p < 1; b.onclick = () => command({ t: 'capture' });
        gb.append(b);
      }
      const free = P.stones - P.stonesNew;
      if (P.stones) for (const [k, t] of [['p', '+3' + POW], ['i', '+3' + INF]]) {
        const b = el('button', { class: 'gemBtn', title: free ? 'Потратить Камень Силы' : 'Камень нельзя тратить в ход захвата' }, `◆×${P.stones} <small>${t}</small>`);
        b.disabled = !mine || !free; b.onclick = () => command({ t: 'stone', k });
        gb.append(b);
      }
    }
    const hand = $('#hand'); hand.innerHTML = '';
    $('#handTitle').textContent = v == null ? 'Рука' : v === S.cur ? 'Ваша рука' : `Рука: ${S.players[v].name} (ждёт хода)`;
    if (v != null) for (const u of S.players[v].hand) hand.append(cardImg(u, 'hd' + (mine && v === S.cur ? ' playable' : ''), () => { if (v === S.cur) command({ t: 'play', uid: u }); }));
    const pl = $('#played'); pl.innerHTML = '';
    for (const u of S.played) pl.append(cardImg(u, 'pd'));
    const pr = $('#prompt');
    if (pending && pending.req.kind === 'board') {
      const series = pending.req.purpose === 'deploy' && !pending.req.card;   // «Отправить отряд» за силу — подряд
      pr.innerHTML = `<span class="ptext">${pending.req.text}${series ? ` <span class="dim">· силы хватит на ${S.pool.p}</span>` : ''}</span>`;
      if (pending.req.optional) pr.append(el('button', { class: 'skip', onclick: () => answer(null) }, series ? 'Готово' : 'Пропустить'));
      pr.classList.add('active');
    } else if (myTurn()) {
      pr.innerHTML = '<span class="ptext dim">Сыграйте карты с руки, нанимайте слуг на рынке, тратьте силу на действия.</span>'; pr.classList.remove('active');
    } else if (S.phase !== 'over') {
      const wait = [...net.asks.values()][0];
      const t = wait ? `Ждём, пока ${S.players[wait.p].name} сделает выбор…` : S.cur !== v ? `Ходит ${P.bot ? 'бот ' : ''}${P.name}${P.remote && !isGuest() ? ' (по сети)' : ''}…` : '';
      pr.innerHTML = t ? `<span class="ptext dim">${t}</span>` : ''; pr.classList.remove('active');
    } else { pr.innerHTML = ''; pr.classList.remove('active'); }
  }
  function render() {
    if (!S) return;
    renderBoard(); renderPlayers(); renderMarket(); renderTurn(); updTabs();
    if (isHost()) scheduleSync();
    // карта под курсором могла исчезнуть после перерисовки
    const under = document.elementFromPoint(mouse.x, mouse.y);
    if (!under || !under.dataset || !under.dataset.cid) hideZoom();
  }
  function onLog(msg, replaceLast) {
    if (isHost() && net.started) toGuests({ t: 'log', msg, replace: !!replaceLast });
    const box = $('#log'); if (!box) return;
    if (replaceLast && box.lastChild) { box.lastChild.innerHTML = msg; return; }
    box.append(el('div', { class: 'lg' }, msg));
    while (box.children.length > 300) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
    if (tab !== 'log') { logNew++; updTabs(); }
  }
  // ---------- вкладки «Игра» / «Журнал» ----------
  let tab = 'game', logNew = 0;
  function setTab(t) {
    tab = t;
    $('#paneGame').classList.toggle('hidden', t !== 'game'); $('#paneLog').classList.toggle('hidden', t !== 'log');
    $('#tabGame').classList.toggle('on', t === 'game'); $('#tabLog').classList.toggle('on', t === 'log');
    if (t === 'log') { logNew = 0; $('#log').scrollTop = $('#log').scrollHeight; }
    updTabs();
  }
  function updTabs() {
    $('#logNew').textContent = logNew ? `+${logNew}` : '';
    // пока открыт журнал, «Игра» подсвечивается, если ждут вашего действия
    $('#tabGame').classList.toggle('attn', !!S && (myTurn() || !!pending));
  }

  // ---------- действия человека ----------
  async function run(fn) {
    if (busy) return; busy = true; render();
    try { await fn(); } catch (e) { console.error(e); log(`<span class="warn">Ошибка: ${e.message}</span>`); }
    busy = false; render();
  }
  // действие игрока: у ведущего выполняется сразу, у гостя уходит ведущему
  function command(c) {
    if (!myTurn()) return;
    if (isGuest()) { net.hostBusy = true; NET.send(net.host, { t: 'cmd', c }); render(); return; }
    exec(c);
  }
  function buyCmd(uid, cost) { if (!myTurn()) return; if (S.pool.i < cost) { flash('Не хватает влияния'); return; } command({ t: 'buy', uid }); }
  // выполнить действие текущего игрока (своего или сетевого)
  function exec(c) {
    const p = S.cur, P = S.players[p];
    switch (c.t) {
      case 'play': if (P.hand.includes(c.uid)) run(() => playCard(p, c.uid)); break;
      case 'buy': { const b = buyables(p).find(x => x.uid === c.uid); if (b && S.pool.i >= b.cost) run(async () => buy(p, b)); break; }
      // отряды выставляются подряд, пока хватает силы; «Готово» — закончить
      case 'deploy': run(async () => {
        do { const p0 = S.pool.p; await actDeploy(p); if (S.pool.p === p0) break; render(); }
        while (S.pool.p >= 1 && P.barracks > 0 && S.phase === 'turn');
      }); break;
      case 'kill': run(() => actAssassinate(p)); break;
      case 'spy': run(() => actReturnSpy(p)); break;
      // сначала простые карты ресурсов, потом остальные по одной
      case 'all': run(async () => { for (const u of P.hand.filter(x => ['Знать', 'Солдат', 'Страж Дома', 'Жрица Ллот'].includes(def(x).name))) await playCard(p, u); }); break;
      case 'gem': if (P.gems[c.g]) { spendGem(p, c.g); render(); } break;
      case 'stone': if (P.stones - P.stonesNew > 0) { spendStone(p, c.k); render(); } break;
      case 'capture': { const sp = stoneSpots(p); if (sp.length && !S.flags.stoneTaken && S.pool.p >= 1) captureStone(p, sp[0]); render(); break; }
      case 'end': (async () => {
        busy = true; render();
        try { await endTurn(); } catch (e) { console.error(e); log(`<span class="warn">Ошибка: ${e.message}</span>`); }
        busy = false; render();
      })(); break;
    }
  }
  let endShown = false;
  function flash(t, ms = 1400) { const f = $('#flash'); f.textContent = t; f.classList.add('show'); clearTimeout(flash.t); flash.t = setTimeout(() => f.classList.remove('show'), ms); }
  function bindButtons() {
    $('#bDeploy').onclick = () => command({ t: 'deploy' });
    $('#bKill').onclick = () => command({ t: 'kill' });
    $('#bSpy').onclick = () => command({ t: 'spy' });
    $('#bAll').onclick = () => command({ t: 'all' });
    $('#bEnd').onclick = async () => {
      if (!myTurn()) return;
      const P = S.players[S.cur];
      if ((P.hand.length || S.pool.p || S.pool.i) && !await confirmBox(`Завершить ход? ${P.hand.length ? `В руке ещё ${P.hand.length} карт. ` : ''}${S.pool.p || S.pool.i ? 'Неистраченные ресурсы сгорят.' : ''}`)) return;
      command({ t: 'end' });
    };
    $('#bRules').onclick = showRules;
    $('#tabGame').onclick = () => setTab('game');
    $('#tabLog').onclick = () => setTab('log');
    $('#bMenu').onclick = async () => {
      const t = isHost() ? 'Выйти в меню? Партия закончится и у сетевых игроков.' : isGuest() ? 'Выйти из партии? Ведущий сможет отдать ваше место боту.' : 'Выйти в меню? Текущая партия будет потеряна.';
      if (await confirmBox(t)) { dropSession(); stopRejoin(); NET.close(); location.reload(); }
    };
  }
  async function humanTurn() {
    if (S.players[S.cur].remote) { render(); return; }   // сетевой игрок ходит командами
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
  function lightText(p) { return textHex(S.players[p].hex); }
  async function ask(p, req) {
    if (S.players[p].remote) return netAsk(p, req);
    if (p !== S.cur && humans().length > 1 && lastViewer !== p) await handoff(p, req.text);
    return showAsk(req);
  }
  function showAsk(req) {
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
      const m = openModal(); m.classList.add('confirm');
      m.append(el('h3', {}, text));
      const row = el('div', { class: 'brow end' });
      row.append(el('button', { class: 'skip', onclick: () => { closeModal(); res(false); } }, 'Отмена'));
      row.append(el('button', { class: 'opt', onclick: () => { closeModal(); res(true); } }, 'Да'));
      m.append(row);
    });
  }
  function showScores() {
    if (isHost() && net.started) { flushSync(); toGuests({ t: 'over' }); }
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
      <i>Демоническая паутина</i> — поле из гексов: камни силы ◆ на тупиках маршрутов захватываются отрядом за 1 силу (1 за ход) и тратятся со следующего хода на +3 силы или +3 влияния. <i>X-гексы</i> (по желанию): один случайный X-гекс заменяет гекс C; в «Пустоши» и «Равнодушие» не ведёт ни один маршрут — туда попадают шпионом.</p>
      <p><b>Подсказки</b>: поле приближается колесом мыши или кнопками ＋/－ справа сверху и перетаскивается мышью; ⤢ — показать всё поле. Вращение — как камера в стратегиях: зажмите ⟲/⟳ или клавиши Q/E, либо тяните поле правой (средней) кнопкой мыши. «Отправить отряд» выставляет отряды подряд, пока хватает силы («Готово» — закончить). Вкладка «Журнал» сверху — история партии. <b>Игра по сети</b>: поставьте у места «Сеть» и нажмите «Создать комнату» — друг открывает свою копию игры, жмёт «Присоединиться к игре по коду» и вводит код; ваша партия ведётся на вашем компьютере, вместе с ботами. Сложность ботов выбирается в меню: лёгкие ошибаются и тратят не всю силу, тяжёлые следят за лидером и реже размениваются на убийства. Наведите курсор на карту — она увеличится; на регион — увидите расклад сил. Значок 👑 у игрока — посмотреть внутренний круг.</p></div>`;
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
        // на больших экранах превью крупнее
        const r = t.getBoundingClientRect(); const w = Math.round(Math.max(300, Math.min(480, innerHeight * 0.42))), h = Math.round(w * 1.4);
        z.style.setProperty('--zw', w + 'px');
        let x = r.right + 12; if (x + w > innerWidth) x = r.left - w - 12; if (x < 0) x = 8;
        let y = r.top + r.height / 2 - h / 2; y = Math.max(8, Math.min(innerHeight - h - 8, y));
        z.style.left = x + 'px'; z.style.top = y + 'px';
      }
    });
    document.addEventListener('mouseout', e => { if (e.target.tagName === 'IMG' && e.target.dataset.cid) hideZoom(); });
    document.addEventListener('mousedown', hideZoom, true);
  }

  document.addEventListener('DOMContentLoaded', () => { initSetup(); bindButtons(); bindZoom(); bindPanZoom(); });
  return { ask, render, humanTurn, showScores, onLog, fx };
})();
