'use strict';
// Эффекты карт фанатских дополнений: Осада, Юголоты, Паукообразные (+ Отравленный слуга).

const fourAspects = () => aspectsPlayed() >= 4;
const hasFocusType = (ctx, type) => {
  const i = S.played.indexOf(ctx.uid);
  return (i >= 0 ? S.played.slice(0, i) : S.played).some(u => def(u).type === type);
};
async function poisonTo(ctx, n = 1, text) {
  const t = await chooseOpponent(ctx, null, text || `Выберите противника: он нанимает Отравленного слугу${n > 1 ? ` (×${n})` : ''}`, 'madman');
  if (t != null) for (let k = 0; k < n; k++) givePoison(t);
}
// добавить в паутину сыгранного на этом ходу слугу аспекта asp (в т.ч. эту карту)
async function addToWeb(ctx, asp) {
  const opts = S.played.filter(u => def(u).asp === asp || u === ctx.uid);
  const ch = await pickCards(ctx.p, `Добавьте в паутину «${ASPECT_RU[asp]}» слугу, сыгранного на этом ходу`, opts, { purpose: 'webAdd', card: ctx.cid });
  if (!ch || !ch.length) return;
  take(S.played, ch[0]); S.players[ctx.p].web.push(ch[0]);
  log(`${pn(ctx.p)} добавляет ${cn(ch[0])} в паутину.`);
}
const webLater = ctx => S.eotWeb.push(ctx.uid);
// переместить любой отряд (из локации с присутствием) в любую свободную локацию
async function moveAnyTroop(ctx) {
  const from = [...T.act].filter(id => S.occ[id] != null && presenceLoc(ctx.p, id));
  const a = await bt(ctx, 'moveFrom', 'Переместите отряд: выберите отряд', from.map(id => ({ t: 'loc', id })));
  if (!a) return false;
  const to = [...T.act].filter(id => S.occ[id] == null);
  const b = await bt(ctx, 'moveTo', 'Куда переместить отряд?', to.map(id => ({ t: 'loc', id })), { optional: false, from: a.id });
  if (!b) return false;
  const v = S.occ[a.id]; S.occ[a.id] = null; S.occ[b.id] = v;
  log(`${pn(ctx.p)} перемещает ${v === 'W' ? 'белый отряд' : 'отряд ' + pn(v)}: ${locName(a.id)} → ${locName(b.id)}.`);
  updateControl(); return true;
}
async function moveEnemySpy(ctx) {
  const opts = []; for (const r of T.actReg) for (const q of S.spies[r]) if (q !== ctx.p) opts.push({ t: 'spy', rid: r, owner: q });
  const a = await bt(ctx, 'return', 'Выберите вражеского шпиона для перемещения', opts);
  if (!a) return;
  const to = [...T.actReg].filter(r => r !== a.rid && !S.spies[r].includes(a.owner));
  const b = await bt(ctx, 'spyMoveTo', 'Куда переместить шпиона?', to.map(id => ({ t: 'region', id })), { optional: false, owner: a.owner });
  if (!b) return;
  take(S.spies[a.rid], a.owner); S.spies[b.id].push(a.owner);
  log(`${pn(ctx.p)} перемещает шпиона ${pn(a.owner)}: «${REG[a.rid].name}» → «${REG[b.id].name}».`);
  updateControl();
}
// вернуть свой шпион только из регионов, удовлетворяющих фильтру
async function returnOwnSpyWhere(ctx, filter, follow) {
  const own = ownSpies(ctx.p).filter(filter);
  const ch = await bt(ctx, 'recall', 'Верните своего шпиона', own.map(rid => ({ t: 'spy', rid, owner: ctx.p })), { follow });
  if (!ch) return null;
  removeSpy(ctx.p, ch.rid); log(`${pn(ctx.p)} возвращает шпиона из «${REG[ch.rid].name}».`);
  return ch.rid;
}
const enemyTroopsIn = (rid, p) => REG[rid].locs.some(l => S.occ[l] != null && S.occ[l] !== p);
async function promoteFrom(ctx, uids, text) {
  const ch = await pickCards(ctx.p, text, uids, { purpose: 'promote', card: ctx.cid });
  if (!ch || !ch.length) return false;
  const P = S.players[ctx.p];
  if (!take(S.played, ch[0]) && !take(P.hand, ch[0])) take(P.discard, ch[0]);
  promoteCard(ctx.p, ch[0]); return true;
}

Object.assign(EFFECTS, {
  // ---- Отравленный слуга ----
  'Отравленный слуга': ctx => chooseOne(ctx, [
    { label: 'Вернуть своего шпиона → убрать Отравленного слугу в резерв', v: { cleanse: 1 }, enabled: hasOwnSpy(ctx),
      fn: async () => { if (await returnOwnSpy(ctx) != null) { take(S.played, ctx.uid); returnJunk(ctx.uid); } } },
    { label: 'Вернуть 2 своих отряда из одного региона → убрать Отравленного слугу в резерв', v: { cleanse: 1, troops: -2 },
      enabled: [...T.actReg].some(r => REG[r].locs.filter(l => S.occ[l] === ctx.p).length >= 2),
      fn: async () => {
        const regs = [...T.actReg].filter(r => REG[r].locs.filter(l => S.occ[l] === ctx.p).length >= 2);
        const r = await bt(ctx, 'ownTroopsRegion', 'Выберите регион: вернуть из него 2 своих отряда', regs.map(id => ({ t: 'region', id })));
        if (!r) return;
        REG[r.id].locs.filter(l => S.occ[l] === ctx.p).slice(0, 2).forEach(l => { S.occ[l] = null; S.players[ctx.p].barracks++; });
        log(`${pn(ctx.p)} возвращает 2 отряда из «${REG[r.id].name}» в казармы.`);
        updateControl(); take(S.played, ctx.uid); returnJunk(ctx.uid);
      } }], 'Отравленный слуга: можно избавиться от него'),

  // ---- Осада ----
  'Ужасная баллиста': async ctx => {
    gain(ctx, 1);
    const max = Math.min(3, S.pool.i); if (!max) return;
    const opts = [0, 1, 2, 3].filter(k => k <= max).map(k => ({ label: k ? `Обменять ${k} влияния на ${k} силы` : 'Не обменивать', v: {}, fn: async () => { S.pool.i -= k; S.pool.p += k; if (k) log(`${pn(ctx.p)} обменивает ${k} влияния на силу.`); } }));
    await chooseOne(ctx, opts, 'Ужасная баллиста: обмен влияния на силу');
  },
  'Чемпион Подземья': async ctx => { await assassinate(ctx, 1, { white: true }); if (fourAspects()) await supplant(ctx, { white: true }); },
  'Вождь': async ctx => { await supplant(ctx, { white: true }); if (fourAspects()) gainVP(ctx.p, 1, 'Вождь'); },
  'Преобразователь': async ctx => {
    const opts = enemyTroopLocs(ctx.p);
    const ch = await bt(ctx, 'kill', 'Уничтожьте отряд', opts.map(id => ({ t: 'loc', id })));
    if (!ch) return;
    const v = await killTroop(ctx.p, ch.id);
    if (v !== 'W' && (S.players[v].trophies.W || 0) > 0 && S.occ[ch.id] == null) {
      S.players[v].trophies.W--; S.occ[ch.id] = 'W';
      log(`Белый отряд из трофеев ${pn(v)} занимает освободившуюся локацию.`); updateControl();
    }
  },
  'Безжалостная осада': async ctx => { gain(ctx, 3); S.flags.siege = true; log('До конца хода отряды других игроков считаются белыми.'); },
  'Требушет': async ctx => {
    const opts = [...T.act].filter(id => S.occ[id] != null && S.occ[id] !== 'W').map(id => ({ t: 'loc', id }));
    const ch = await bt(ctx, 'return', 'Верните или вышлите отряд из любой локации', opts);
    if (!ch) return;
    const v = S.occ[ch.id]; S.occ[ch.id] = null; S.players[v].barracks++;
    log(`${pn(ctx.p)} возвращает в казармы отряд ${pn(v)}: ${locName(ch.id)}.`); updateControl();
  },
  'Военные трофеи': async ctx => {
    const n = aspectsPlayed();
    for (let k = 1; k <= n; k++) await chooseOne(ctx, [
      { label: '+1 влияния', v: { i: 1 }, fn: async () => gain(ctx, 0, 1) },
      { label: '+1 силы', v: { p: 1 }, fn: async () => gain(ctx, 1) }], `Аспект ${k} из ${n}:`);
  },
  'Сторожевой зверь': async ctx => draw(ctx, 1),
  'Лидер разведчиков': ctx => deploy(ctx, aspectsPlayed()),
  'Осадный зверь': ctx => chooseOne(ctx, [
    { label: '+1 силы и +2 влияния', v: { p: 1, i: 2 }, fn: async () => gain(ctx, 1, 2) },
    { label: 'Получить 1 ПО', v: { vp: 1 }, fn: async () => gainVP(ctx.p, 1, 'Осадный зверь') }]),
  'Интриган': ctx => chooseOne(ctx, [
    { label: 'Переместить вражеского шпиона в другой регион', v: { ret: 1 }, enabled: [...T.actReg].some(r => S.spies[r].some(q => q !== ctx.p)), fn: () => moveEnemySpy(ctx) },
    { label: 'Переместить отряд', v: { ret: 1 }, fn: () => moveAnyTroop(ctx) }]),
  'Каперы': async ctx => {
    for (let k = 1; k <= 2; k++) await chooseOne(ctx, [
      { label: '+1 влияния', v: { i: 1 }, fn: async () => gain(ctx, 0, 1) },
      { label: '+1 силы', v: { p: 1 }, fn: async () => gain(ctx, 1) }], `Действие ${k} из 2:`);
    if (fourAspects()) draw(ctx, 1);
  },
  'Теневой лазутчик': async ctx => {
    const r = await placeSpy(ctx); if (!r) return;
    const t = S.tokens[r];
    if (t && t.owner === ctx.p) {
      if (t.pop && t.full) await applyPop(ctx.p, r, t.pop);
      else { gain(ctx, 0, 1); if (t.full && REG[r].token.fullVp) gainVP(ctx.p, REG[r].token.fullVp, `жетон «${REG[r].name}»`); }
    }
  },
  'Военачальник': ctx => spyOr(ctx, '+2 влияния; можно повысить карту с рынка за её стоимость', async () => {
    gain(ctx, 0, 2);
    const opts = S.market.filter(u => u != null && costOf(u) <= S.pool.i);
    const ch = await pickCards(ctx.p, 'Повысьте карту с рынка, заплатив её стоимость (или пропустите)', opts, { purpose: 'marketPromote', card: ctx.cid });
    if (!ch || !ch.length) return;
    const slot = S.market.indexOf(ch[0]); S.pool.i -= costOf(ch[0]);
    S.players[ctx.p].inner.push(ch[0]); log(`${pn(ctx.p)} повышает ${cn(ch[0])} с рынка во внутренний круг.`);
    refillMarket(slot);
  }, { i: 2, promote: 1 }),
  'Аватар Ллот': ctx => chooseOne(ctx, [
    { label: 'Внедрить шпиона, затем взять карту', v: { spy: 1, draw: 1 }, fn: async () => { await placeSpy(ctx); draw(ctx, 1); } },
    { label: 'Вернуть шпиона → положить другую сыгранную карту или карту из сброса на верх колоды', v: { draw: 1 }, enabled: hasOwnSpy(ctx),
      fn: async () => {
        if (await returnOwnSpy(ctx) == null) return;
        const P = S.players[ctx.p];
        const ch = await pickCards(ctx.p, 'Выберите карту — она ляжет на верх вашей колоды', [...S.played.filter(u => u !== ctx.uid), ...P.discard], { purpose: 'topdeck', card: ctx.cid });
        if (!ch || !ch.length) return;
        if (!take(S.played, ch[0])) take(P.discard, ch[0]);
        P.deck.push(ch[0]); log(`${pn(ctx.p)} кладёт ${cn(ch[0])} на верх колоды.`);
      } }]),
  'Таранящий зверь': async ctx => { gain(ctx, 1, 1); if (fourAspects()) eot(ctx); },
  'Мародёры': async ctx => {
    const opts = S.played.filter(u => u !== ctx.uid && def(u).cost != null && def(u).cost <= 4 && def(u).name !== 'Мародёры');
    const ch = await pickCards(ctx.p, 'Мародёры: скопируйте эффекты сыгранной карты стоимостью до 4', opts, { purpose: 'copy', card: ctx.cid });
    if (!ch || !ch.length) return;
    log(`${pn(ctx.p)} копирует ${cn(ch[0])}.`);
    await EFFECTS[def(ch[0]).name](Object.assign({}, ctx, { cid: S.cards[ch[0]], card: def(ch[0]) }));
  },
  'Осадная башня': ctx => chooseOne(ctx, [
    { label: 'Взять карту', v: { draw: 1 }, fn: async () => draw(ctx, 1) },
    { label: 'В конце хода повысить другого сыгранного слугу', v: { promote: 1 }, fn: async () => eot(ctx) }]),
  'Гидра': async ctx => { await assassinate(ctx); eot(ctx); },
  'Укротитель зверей': async ctx => { gain(ctx, 0, 2); S.flags.discount = (S.flags.discount || 0) + 1; log('До конца хода найм слуг дешевле на 1.'); },

  // ---- Юголоты ----
  'Дерро изгои': ctx => assassinate(ctx, 2),
  'Гидролот': ctx => chooseOne(ctx, [
    { label: 'Уничтожить отряд', v: { kill: 1 }, fn: () => assassinate(ctx) },
    { label: 'Вернуть шпиона из региона с вражескими отрядами → уничтожить до 2 отрядов там', v: { kill: 2 }, enabled: ownSpies(ctx.p).some(r => enemyTroopsIn(r, ctx.p)),
      fn: async () => { const r = await returnOwnSpyWhere(ctx, r => enemyTroopsIn(r, ctx.p), 'kill'); if (r) await assassinate(ctx, 2, { region: r, noPresence: true }); } }]),
  'Элитный куо-тоа': ctx => assassinate(ctx, 1, { anywhere: true }),
  'Благородный куо-тоа': async ctx => gain(ctx, 3, 3),
  'Жрец Дагона': ctx => chooseOne(ctx, [
    { label: 'Вытеснить 2 белых отряда', v: { supplant: 1, killWhite: 1 }, fn: async () => { await supplant(ctx, { white: true }); await supplant(ctx, { white: true }); } },
    { label: 'Вытеснить вражеский отряд', v: { supplant: 1 }, fn: () => supplant(ctx) }]),
  'Рядовой куо-тоа': async ctx => gain(ctx, 3),
  'Меззолот': async ctx => { gain(ctx, 1); if (hasFocusType(ctx, 'Юголот')) await assassinate(ctx); },
  'Дерголот': async ctx => { gain(ctx, 2); if (hasFocusType(ctx, 'Юголот')) gain(ctx, 2); },
  'Агент Жентарима': ctx => chooseOne(ctx, [
    { label: '+3 влияния', v: { i: 3 }, fn: async () => gain(ctx, 0, 3) },
    { label: '+2 силы', v: { p: 2 }, fn: async () => gain(ctx, 2) },
    { label: 'Взять карту', v: { draw: 1 }, fn: async () => draw(ctx, 1) }]),
  'Гачолот': ctx => chooseOne(ctx, [
    { label: 'Один противник сбрасывает 2 карты', v: { discard: 2 }, fn: async () => { const t = await chooseOpponent(ctx, q => S.players[q].hand.length > 0, 'Кто сбросит 2 карты?', 'discard'); if (t != null) { await forceDiscard(ctx, t); await forceDiscard(ctx, t); } } },
    { label: 'Выслать 2-х шпионов', v: { ret: 2 }, fn: () => returnEnemy(ctx, 2, { spiesOnly: true }) },
    { label: 'Передвинуть 2 вражеских отряда', v: { ret: 1 }, fn: () => moveEnemy(ctx, 2) }]),
  'Никалот': async ctx => {
    for (let k = 1; k <= 4; k++) await chooseOne(ctx, [
      { label: 'Внедрить шпиона', v: { spy: 1 }, fn: () => placeSpy(ctx) },
      { label: 'Вернуть своего шпиона → выслать вражеского шпиона', v: { ret: 1 }, enabled: hasOwnSpy(ctx) && [...T.actReg].some(r => S.spies[r].some(q => q !== ctx.p)),
        fn: async () => { if (await returnOwnSpy(ctx) != null) await returnEnemy(ctx, 1, { spiesOnly: true }); } }], `Действие ${k} из 4:`);
  },
  'Арканалот': ctx => chooseOne(ctx, [
    { label: 'Внедрить 2-х шпионов', v: { spy: 2 }, fn: async () => { const a = await placeSpy(ctx); await placeSpy(ctx, { exclude: a ? [a] : [] }); } },
    { label: `Взять карту за каждого своего шпиона в регионе с вражескими отрядами (${ownSpies(ctx.p).filter(r => enemyTroopsIn(r, ctx.p)).length})`,
      v: { draw: ownSpies(ctx.p).filter(r => enemyTroopsIn(r, ctx.p)).length }, enabled: ownSpies(ctx.p).some(r => enemyTroopsIn(r, ctx.p)),
      fn: async () => draw(ctx, ownSpies(ctx.p).filter(r => enemyTroopsIn(r, ctx.p)).length) }]),
  'Чтящий Маска': ctx => chooseOne(ctx, [
    { label: '+1 влияния', v: { i: 1 }, fn: async () => gain(ctx, 0, 1) },
    { label: 'Внедрить шпиона', v: { spy: 1 }, fn: () => placeSpy(ctx) },
    { label: 'Выбрать противника — он сбрасывает карту', v: { discard: 1 }, fn: async () => { const t = await chooseOpponent(ctx, q => S.players[q].hand.length > 0, 'Кто сбросит карту?', 'discard'); if (t != null) await forceDiscard(ctx, t); } }]),
  'Искажённый маг': async ctx => {
    let budget = 5; const empty = [];
    while (true) {
      const opts = S.market.filter(u => u != null && def(u).cost <= budget);
      const ch = await pickCards(ctx.p, `Искажённый маг: наймите слугу с рынка бесплатно (осталось ${budget} влияния)`, opts, { purpose: 'recruit', card: ctx.cid });
      if (!ch || !ch.length) break;
      const slot = S.market.indexOf(ch[0]); budget -= def(ch[0]).cost;
      S.players[ctx.p].discard.push(ch[0]); S.market[slot] = null; empty.push(slot);
      log(`${pn(ctx.p)} бесплатно нанимает ${cn(ch[0])}.`);
    }
    if (!empty.length) return;
    take(S.played, ctx.uid); S.market[empty[0]] = ctx.uid; log(`${cn(ctx.uid)} занимает место на рынке.`);
    for (const sl of empty.slice(1)) refillMarket(sl);
  },
  'Жрица Маска': async ctx => {
    const t = await chooseOpponent(ctx, q => S.players[q].hand.length > 0, 'Чью руку посмотреть?', 'peekTarget');
    if (t == null) return;
    const ch = await pickCards(ctx.p, `Рука ${S.players[t].name}: выберите карту`, [...S.players[t].hand], { purpose: 'peek', min: 1, card: ctx.cid });
    const u = ch[0], c = def(u).cost || 0;
    await chooseOne(ctx, [
      { label: `Нанять с рынка бесплатно слугу стоимостью до ${c}`, v: { recruit: 1 }, enabled: S.market.some(x => x != null && def(x).cost <= c),
        fn: () => recruitFree(ctx, { maxCost: c, text: `Наймите слугу стоимостью до ${c} без оплаты` }) },
      { label: `Противник сбрасывает ${cn(u).replace(/<[^>]+>/g, '')}, вы получаете ${def(u).vpDeck} ПО`, v: { vp: def(u).vpDeck, discard: 1 },
        fn: async () => { const TP = S.players[t]; take(TP.hand, u); TP.discard.push(u); log(`${pn(t)} сбрасывает ${cn(u)}.`); if (def(u).vpDeck > 0) gainVP(ctx.p, def(u).vpDeck, 'Жрица Маска'); await sentryReact(t); } }]);
  },
  'Ультралот': async ctx => {
    if (!await devourFromHand(ctx, 'Ультралот: поглотите карту с руки → наймите любого слугу с рынка бесплатно')) return;
    await recruitFree(ctx, { maxCost: 99, text: 'Наймите любого слугу с рынка без оплаты' });
  },

  // ---- Паукообразные ----
  'Ядовитый паучок': async ctx => { await poisonTo(ctx); webLater(ctx); },
  'Демонический паук': ctx => chooseOne(ctx, [
    { label: `Уничтожить отряд; противники получают Отравленных слуг (${webCount(ctx.p, 'malice')})`, v: { kill: 1, discard: webCount(ctx.p, 'malice') * 0.5 },
      fn: async () => { await assassinate(ctx); for (let k = 0; k < webCount(ctx.p, 'malice'); k++) await poisonTo(ctx); } },
    { label: 'Добавить в паутину «злобного» слугу (или эту карту)', v: { web: 1 }, fn: () => addToWeb(ctx, 'malice') }]),
  'Мерзкий паук': async ctx => {
    await assassinate(ctx, 2);
    for (let k = 0; k < webCount(ctx.p, 'malice'); k++) {
      const t = await chooseOpponent(ctx, null, 'Выберите противника: он возвращает шпиона (или получает Отравленного слугу)', 'madman');
      if (t == null) break;
      const own = ownSpies(t);
      if (!own.length) { givePoison(t); continue; }
      const r = await ask(t, { kind: 'board', purpose: 'recall', text: 'Мерзкий паук: верните своего шпиона', opts: own.map(rid => ({ t: 'spy', rid, owner: t })), optional: false });
      removeSpy(t, r.rid); log(`${pn(t)} возвращает шпиона из «${REG[r.rid].name}».`); await sentryReact(t);
    }
  },
  'Аспект Злобы': async ctx => {
    await assassinate(ctx, 2, { anywhere: true });
    for (let k = 1, n = webCount(ctx.p, 'malice'); k <= n; k++) await chooseOne(ctx, [
      { label: 'Уничтожить отряд', v: { kill: 1 }, fn: () => assassinate(ctx) },
      { label: 'Противник нанимает 2-х Отравленных слуг', v: { discard: 1.5 }, fn: () => poisonTo(ctx, 2) }], `Паутина ${k} из ${n}:`);
  },
  'Бронированный паучок': async ctx => { gain(ctx, 1); webLater(ctx); },
  'Гигантский паук': ctx => chooseOne(ctx, [
    { label: `+3 силы и +1 силы за каждого «завоевателя» в паутине (${webCount(ctx.p, 'conquest')})`, v: { p: 3 + webCount(ctx.p, 'conquest') }, fn: async () => gain(ctx, 3 + webCount(ctx.p, 'conquest')) },
    { label: 'Добавить в паутину слугу-«завоевателя» (или эту карту)', v: { web: 1 }, fn: () => addToWeb(ctx, 'conquest') }]),
  'Паук-голем': async ctx => gain(ctx, 4 + 2 * webCount(ctx.p, 'conquest')),
  'Аспект Завоевания': async ctx => gain(ctx, 6 + 3 * webCount(ctx.p, 'conquest')),
  'Паучок-наблюдатель': async ctx => { await placeSpy(ctx); webLater(ctx); },
  'Исчезающий паук': ctx => chooseOne(ctx, [
    { label: 'Внедрить шпиона', v: { spy: 1 }, fn: () => placeSpy(ctx) },
    { label: `Вернуть шпиона → вытеснить отряд в его регионе, +1 силы за каждого «коварного» в паутине (${webCount(ctx.p, 'guile')})`, v: { supplant: 1, p: webCount(ctx.p, 'guile') }, enabled: hasOwnSpy(ctx),
      fn: async () => { const r = await returnOwnSpy(ctx, 'supplant'); if (r == null) return; await supplant(ctx, { region: r, noPresence: true }); if (webCount(ctx.p, 'guile')) gain(ctx, webCount(ctx.p, 'guile')); } },
    { label: 'Добавить в паутину «коварного» слугу (или эту карту)', v: { web: 1 }, fn: () => addToWeb(ctx, 'guile') }]),
  'Теневой паук': async ctx => {
    await supplant(ctx, { anywhere: true });
    const n = webCount(ctx.p, 'guile');
    if (n && hasOwnSpy(ctx) && await yesno(ctx, `Вернуть своего шпиона, чтобы взять ${n} карт(ы)?`, 'recallDraw')) { if (await returnOwnSpy(ctx) != null) draw(ctx, n); }
  },
  'Аспект Коварства': async ctx => {
    for (let k = 0; k < 5; k++) if (!await placeSpy(ctx)) break;
    for (let k = 1, n = webCount(ctx.p, 'guile'); k <= n; k++) await chooseOne(ctx, [
      { label: 'Выслать вражеского шпиона', v: { ret: 1 }, fn: () => returnEnemy(ctx, 1, { spiesOnly: true }) },
      { label: 'Вернуть своего шпиона → взять 2 карты', v: { draw: 2 }, enabled: hasOwnSpy(ctx), fn: async () => { if (await returnOwnSpy(ctx) != null) draw(ctx, 2); } }], `Паутина ${k} из ${n}:`);
  },
  'Древний паучок': async ctx => { gain(ctx, 0, 2); webLater(ctx); },
  'Паучий рой': ctx => chooseOne(ctx, [
    { label: `+4 влияния; за каждого «честолюбивого» в паутине можно поглотить карту рынка (${webCount(ctx.p, 'ambition')})`, v: { i: 4 },
      fn: async () => { gain(ctx, 0, 4); for (let k = 0; k < webCount(ctx.p, 'ambition'); k++) if (!await devourMarket(ctx)) break; } },
    { label: 'Добавить в паутину «честолюбивого» слугу (или эту карту)', v: { web: 1 }, fn: () => addToWeb(ctx, 'ambition') }]),
  'Мастер паутины': async ctx => {
    const n = 1 + Math.floor(webCount(ctx.p, 'ambition') / 2);
    for (let k = 1; k <= n; k++) if (!await promoteFrom(ctx, [...S.played, ...S.players[ctx.p].discard], `Повысьте слугу, сыгранного на этом ходу, или из сброса (${k} из ${n})`)) break;
  },
  'Аспект Честолюбия': async ctx => {
    await recruitFree(ctx, { maxCost: 7, text: 'Наймите слугу с рынка стоимостью до 7 без оплаты' });
    const P = S.players[ctx.p];
    for (let k = 1, n = webCount(ctx.p, 'ambition'); k <= n; k++) if (!await promoteFrom(ctx, [...P.hand, ...P.discard], `Повысьте слугу с руки или из сброса (${k} из ${n})`)) break;
  },
});
