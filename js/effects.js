'use strict';
// Эффекты карт. Ключ — название карты как в PnP.

const others = p => S.players.map(P => P.idx).filter(q => q !== p);
const bigHand = q => S.players[q].hand.length > 3;
const hasOwnSpy = ctx => ownSpies(ctx.p).length > 0;
const hasOtherTroop = (rid, p) => REG[rid].locs.some(l => S.occ[l] != null && S.occ[l] !== 'W' && S.occ[l] !== p);

// «Выберите одно: Внедрите шпиона / Верните своего шпиона → ...»
function spyOr(ctx, label, fn, v, follow) {
  return chooseOne(ctx, [
    { label: 'Внедрить шпиона', v: { spy: 1 }, fn: () => placeSpy(ctx) },
    { label: `Вернуть своего шпиона → ${label}`, v, enabled: hasOwnSpy(ctx), fn: async () => { const r = await returnOwnSpy(ctx, follow); if (r != null) await fn(r); } },
  ]);
}
const eot = (ctx, o) => eotPromote(ctx, o);
const obedient = u => def(u).asp === 'obedience';

async function opponentDiscards(ctx) {
  const t = await chooseOpponent(ctx, bigHand, 'Выберите противника (более 3 карт в руке): он сбросит карту', 'discard');
  if (t != null) await forceDiscard(ctx, t);
}
async function madmanTo(ctx, filter) {
  const t = await chooseOpponent(ctx, filter, 'Выберите противника: он получит Безумного изгоя', 'madman');
  if (t != null) giveMadman(t);
}
// вернуть на поле отряды из трофейных залов
async function redeployTrophies(ctx, n, sources, kind, anywhere) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const avail = sources.filter(q => (S.players[q].trophies[kind] || 0) > 0);
    if (!avail.length) break;
    let src = avail[0];
    if (avail.length > 1) {
      src = await ask(ctx.p, { kind: 'player', text: 'Из чьего трофейного зала взять отряд?', options: avail, purpose: 'trophySource', optional: true, card: ctx.cid });
      if (src == null) break;
    }
    const locs = kind === ctx.p && !anywhere ? emptyDeployLocs(ctx.p, false) : [...T.act].filter(id => S.occ[id] == null);
    const ch = await bt(ctx, kind === 'W' ? 'deployWhite' : 'deploy', `Отправьте отряд из трофейного зала (${i + 1} из ${n})`, locs.map(id => ({ t: 'loc', id })));
    if (!ch) break;
    S.players[src].trophies[kind]--;
    S.occ[ch.id] = kind === 'W' ? 'W' : ctx.p;
    log(`${pn(ctx.p)} возвращает ${kind === 'W' ? 'белый отряд' : 'свой отряд'} из трофеев ${pn(src)}: ${locName(ch.id)}.`);
    updateControl(); done++;
  }
  return done;
}

const EFFECTS = {
  // ---- стартовые и базовые ----
  'Солдат': async ctx => gain(ctx, 1),
  'Знать': async ctx => gain(ctx, 0, 1),
  'Страж Дома': async ctx => gain(ctx, 2),
  'Жрица Ллот': async ctx => gain(ctx, 0, 2),
  'Безумный изгой': async ctx => {
    const P = S.players[ctx.p];
    if (!P.hand.length) return;
    const ch = await pickCards(ctx.p, 'Безумный изгой: сбросьте карту с руки, чтобы вернуть изгоя в резерв (или пропустите)', [...P.hand], { purpose: 'madmanDiscard', card: ctx.cid });
    if (!ch || !ch.length) return;
    take(P.hand, ch[0]); P.discard.push(ch[0]);
    take(S.played, ctx.uid); S.supply.madman.push(ctx.uid);
    log(`${pn(ctx.p)} сбрасывает ${cn(ch[0])} и возвращает Безумного изгоя в резерв.`);
  },

  // ---- Дроу ----
  'Мерзавец': ctx => chooseOne(ctx, [
    { label: '+2 силы', v: { p: 2 }, fn: async () => gain(ctx, 2) },
    { label: 'Уничтожить отряд', v: { kill: 1 }, fn: () => assassinate(ctx) }]),
  'Охотник за головами': async ctx => gain(ctx, 3),
  'Доппельгангер': ctx => supplant(ctx),
  'Клинок Смерти': ctx => assassinate(ctx, 2),
  'Инквизитор': ctx => chooseOne(ctx, [
    { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) },
    { label: 'Уничтожить отряд', v: { kill: 1 }, fn: () => assassinate(ctx) }]),
  'Опытный разведчик': ctx => supplant(ctx, { white: true }),
  'Отряд наёмников': ctx => deploy(ctx, 3),
  'Рейнджер Подземья': ctx => assassinate(ctx, 2, { white: true }),
  'Мастер школы Мили-Магтир': ctx => chooseOne(ctx, [
    { label: 'Отправить 4 отряда', v: { deploy: 4 }, fn: () => deploy(ctx, 4) },
    { label: 'Вытеснить белый отряд из любой локации', v: { supplantWhiteAny: 1 }, fn: () => supplant(ctx, { white: true, anywhere: true }) }]),
  'Мастер оружия': async ctx => {
    for (let k = 1; k <= 3; k++) await chooseOne(ctx, [
      { label: 'Отправить отряд', v: { deploy: 1 }, fn: () => deploy(ctx, 1) },
      { label: 'Уничтожить белый отряд', v: { killWhite: 1 }, fn: () => assassinate(ctx, 1, { white: true }) }], `Действие ${k} из 3:`);
  },
  'Ткач заклинаний': ctx => spyOr(ctx, 'вытеснить отряд в его регионе', r => supplant(ctx, { region: r, noPresence: true }), { supplant: 1 }, 'supplant'),
  'Мастер-шпион': ctx => placeSpy(ctx),
  'Лазутчик': async ctx => { const r = await placeSpy(ctx); if (r && hasOtherTroop(r, ctx.p)) gain(ctx, 1); },
  'Торговец информацией': ctx => spyOr(ctx, 'взять 3 карты', async () => draw(ctx, 3), { draw: 3 }),
  'Мастера волшебства': ctx => chooseOne(ctx, [
    { label: 'Внедрить 2-х шпионов', v: { spy: 2 }, fn: async () => { const a = await placeSpy(ctx); await placeSpy(ctx, { exclude: a ? [a] : [] }); } },
    { label: 'Вернуть своего шпиона → +4 силы', v: { p: 4, recall: 1 }, enabled: hasOwnSpy(ctx), fn: async () => { if (await returnOwnSpy(ctx) != null) gain(ctx, 4); } }]),
  'Заступник': ctx => chooseOne(ctx, [
    { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) },
    { label: 'В конце хода повысить другого сыгранного слугу', v: { promote: 1 }, fn: async () => eot(ctx) }]),
  'Избранная Ллот': async ctx => { await returnEnemy(ctx); eot(ctx); },
  'Дроу-посредник': async ctx => { if (S.players[ctx.p].inner.length >= 4) gain(ctx, 0, 3); eot(ctx); },
  'Член cовета': async ctx => { await moveEnemy(ctx, 2); eot(ctx); },
  'Матрона-мать': async ctx => {
    const P = S.players[ctx.p];
    P.discard.push(...P.deck); P.deck = [];
    log(`${pn(ctx.p)} кладёт всю колоду в сброс.`);
    const ch = await pickCards(ctx.p, 'Повысьте слугу из сброса', [...P.discard], { purpose: 'promote', card: ctx.cid });
    if (ch && ch.length) { take(P.discard, ch[0]); promoteCard(ctx.p, ch[0]); }
  },

  // ---- Драконы ----
  'Драконий культист': ctx => chooseOne(ctx, [
    { label: '+2 силы', v: { p: 2 }, fn: async () => gain(ctx, 2) },
    { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) }]),
  'Красный вирмлинг': async ctx => gain(ctx, 2, 2),
  'Коготь дракона': async ctx => { await assassinate(ctx); if (trophyCount(ctx.p) >= 5) gain(ctx, 2); },
  'Северин Силраджин': async ctx => gain(ctx, 5),
  'Красный дракон': async ctx => {
    await supplant(ctx);
    await returnEnemy(ctx, 1, { spiesOnly: true });
    const n = [...T.actReg].filter(r => fullControl(r, ctx.p)).length;
    if (n) gainVP(ctx.p, n, 'Красный дракон');
  },
  'Кобольд': ctx => chooseOne(ctx, [
    { label: 'Отправить отряд', v: { deploy: 1 }, fn: () => deploy(ctx) },
    { label: 'Уничтожить белый отряд', v: { killWhite: 1 }, fn: () => assassinate(ctx, 1, { white: true }) }]),
  'Белый вирмлинг': async ctx => { await deploy(ctx, 2); await devourMarket(ctx); },
  'Чёрный вирмлинг': async ctx => { gain(ctx, 0, 1); await assassinate(ctx, 1, { white: true }); },
  'Белый дракон': async ctx => { await deploy(ctx, 3); const n = Math.floor(controlledRegions(ctx.p).length / 2); if (n) gainVP(ctx.p, n, 'Белый дракон'); },
  'Чёрный дракон': async ctx => { await supplant(ctx, { white: true, anywhere: true }); const n = Math.floor((S.players[ctx.p].trophies.W || 0) / 3); if (n) gainVP(ctx.p, n, 'Чёрный дракон'); },
  'Наблюдатель Тэй': ctx => spyOr(ctx, '+3 влияния', async () => gain(ctx, 0, 3), { i: 3 }),
  'Чародей Тэй': ctx => spyOr(ctx, '+4 силы', async () => gain(ctx, 4), { p: 4 }),
  'Зелёный вирмлинг': async ctx => { const r = await placeSpy(ctx); if (r && hasOtherTroop(r, ctx.p)) gain(ctx, 0, 2); },
  'Рат Модар': async ctx => { draw(ctx, 2); await placeSpy(ctx); },
  'Зелёный дракон': ctx => chooseOne(ctx, [
    { label: 'Внедрить шпиона, затем вытеснить отряд в этом регионе', v: { spy: 1, supplant: 1 }, fn: async () => { const r = await placeSpy(ctx, { follow: 'supplant' }); if (r) await supplant(ctx, { region: r, noPresence: true }); } },
    { label: 'Вернуть шпиона → вытеснить отряд в его регионе, затем 1 ПО за каждый свой жетон контроля', v: { supplant: 1, vp: 1 }, enabled: hasOwnSpy(ctx),
      fn: async () => { const r = await returnOwnSpy(ctx, 'supplant'); if (r == null) return; await supplant(ctx, { region: r, noPresence: true }); const n = vpPerTokens(ctx.p); if (n) gainVP(ctx.p, n, 'Зелёный дракон'); } }]),
  'Фанатик культа': async ctx => { gain(ctx, 0, 2); await devourMarket(ctx); },
  'Жрец Лаогзеда': async ctx => { await moveEnemy(ctx); eot(ctx); },
  'Говорящий с вирмами': async ctx => { gain(ctx, 0, 1); eot(ctx); },
  'Синий вирмлинг': async ctx => { gain(ctx, 0, 3); await returnEnemy(ctx); },
  'Синий дракон': async ctx => {
    eot(ctx, { max: 2, after: () => { const n = Math.floor(S.players[ctx.p].inner.length / 3); if (n) gainVP(ctx.p, n, 'Синий дракон'); } });
  },

  // ---- Элементали ----
  'Культист Вечного пламени': async ctx => { await assassinate(ctx); if (hasFocus(ctx, 'malice')) gain(ctx, 2); },
  'Огненный элементаль': async ctx => {
    await chooseOne(ctx, [
      { label: '+2 силы', v: { p: 2 }, fn: async () => gain(ctx, 2) },
      { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) }]);
    if (hasFocus(ctx, 'malice')) draw(ctx, 1);
  },
  'Огненный элементальный мирмидон': async ctx => { gain(ctx, 2); eot(ctx, { filter: obedient, what: '«покорного» слугу' }); },
  'Ванифер': async ctx => { await assassinate(ctx); await recruitFree(ctx, { asp: 'malice', maxCost: 4, text: 'Наймите «злобного» слугу стоимостью до 4 без оплаты' }); },
  'Имикс': async ctx => { gain(ctx, 4); if (hasFocus(ctx, 'malice')) gain(ctx, 2); },
  'Культист Сокрушающих волн': async ctx => { await assassinate(ctx, 1, { white: true }); if (hasFocus(ctx, 'conquest')) await deploy(ctx, 2); },
  'Водный элементаль': async ctx => { await deploy(ctx, 2); if (hasFocus(ctx, 'conquest')) draw(ctx, 1); },
  'Водный элементальный мирмидон': async ctx => { await assassinate(ctx, 1, { white: true }); eot(ctx, { filter: obedient, what: '«покорного» слугу' }); },
  'Гар Раскалывающий кили': async ctx => { await deploy(ctx, 3); await recruitFree(ctx, { asp: 'conquest', maxCost: 4, text: 'Наймите слугу-«завоевателя» стоимостью до 4 без оплаты' }); },
  'Олхидра': async ctx => { await supplant(ctx, { white: true, anywhere: true }); if (hasFocus(ctx, 'conquest')) await deploy(ctx, 2); },
  'Воздушный элементаль': async ctx => { await spyOr(ctx, 'отправить 3 отряда', () => deploy(ctx, 3), { deploy: 3 }); if (hasFocus(ctx, 'guile')) draw(ctx, 1); },
  'Воздушный элементальный мирмидон': async ctx => { await placeSpy(ctx); eot(ctx, { filter: obedient, what: '«покорного» слугу' }); },
  'Культист Воющей ненависти': async ctx => { await spyOr(ctx, '+3 влияния', async () => gain(ctx, 0, 3), { i: 3 }); if (hasFocus(ctx, 'guile')) gain(ctx, 1); },
  'Эйрис Калинот': async ctx => { gain(ctx, 1); await placeSpy(ctx); await recruitFree(ctx, { asp: 'guile', maxCost: 4, text: 'Наймите «коварного» слугу стоимостью до 4 без оплаты' }); },
  'Ян-Си-Бин': async ctx => { const r = await placeSpy(ctx, { follow: 'kill' }); if (r) await assassinate(ctx, 1, { region: r, noPresence: true }); if (hasFocus(ctx, 'guile')) await placeSpy(ctx); },
  'Культист Чёрной земли': async ctx => { eot(ctx); if (hasFocus(ctx, 'ambition')) gain(ctx, 0, 2); },
  'Земляной элементаль': async ctx => { gain(ctx, 0, 1); await returnEnemy(ctx); if (hasFocus(ctx, 'ambition')) draw(ctx, 1); },
  'Земляной элементальный мирмидон': async ctx => { gain(ctx, 0, 2); eot(ctx); },
  'Марлос Урнрейл': async ctx => { gain(ctx, 0, 1); eot(ctx); await recruitFree(ctx, { asp: 'ambition', maxCost: 4, text: 'Наймите «честолюбивого» слугу стоимостью до 4 без оплаты' }); },
  'Огремоч': async ctx => { gain(ctx, 0, 2); eot(ctx); if (hasFocus(ctx, 'ambition')) eot(ctx); },

  // ---- Демоны ----
  'Гуль': async ctx => { gain(ctx, 2); madmanClockwise(others(ctx.p)); },
  'Пожиратель разума': async ctx => {
    if (!await devourFromHand(ctx, 'Пожиратель разума: поглотите карту с руки, чтобы выбрать эффект (или пропустите)')) return;
    await chooseOne(ctx, [
      { label: '+3 влияния', v: { i: 3 }, fn: async () => gain(ctx, 0, 3) },
      { label: 'Уничтожить отряд', v: { kill: 1 }, fn: () => assassinate(ctx) }]);
  },
  'Глабрезу': async ctx => { if (await devourFromHand(ctx, 'Глабрезу: поглотите карту с руки → уничтожьте 2 отряда')) await assassinate(ctx, 2); },
  'Марилит': async ctx => { if (await devourFromHand(ctx, 'Марилит: поглотите карту с руки → +5 силы')) gain(ctx, 5); },
  'Оркус': async ctx => {
    if (!await devourFromHand(ctx, 'Оркус: поглотите карту с руки → уничтожьте 2 отряда')) return;
    await assassinate(ctx, 2);
    await redeployTrophies(ctx, 2, others(ctx.p), ctx.p, true);
  },
  'Бормочущий ротовик': async ctx => {
    ctx.deployed = [];
    await deploy(ctx, 2);
    const near = new Set();
    for (const id of ctx.deployed) {
      const ns = [...T.adj[id]]; if (LOC[id].region) ns.push(...REG[LOC[id].region].locs);
      for (const n of ns) { const v = S.occ[n]; if (v != null && v !== 'W' && v !== ctx.p) near.add(v); }
    }
    await madmanTo(ctx, q => near.has(q));
  },
  'Дерро': async ctx => { await supplant(ctx, { white: true, anywhere: true }); giveMadman(ctx.p); },
  'Эттин': ctx => chooseOne(ctx, [
    { label: 'Отправить 3 отряда', v: { deploy: 3 }, fn: () => deploy(ctx, 3) },
    { label: 'Уничтожить 2 белых отряда', v: { killWhite: 2 }, fn: () => assassinate(ctx, 2, { white: true }) }]),
  'Балор': async ctx => { if (!await devourFromHand(ctx, 'Балор: поглотите карту с руки → вытеснить белый отряд где угодно и отправить отряд')) return; await supplant(ctx, { white: true, anywhere: true }); await deploy(ctx, 1); },
  'Демогоргон': async ctx => {
    if (!await devourFromHand(ctx, 'Демогоргон: поглотите карту с руки → вытесните 2 белых отряда, противники получают по 2 изгоя')) return;
    await supplant(ctx, { white: true }); await supplant(ctx, { white: true });
    madmanClockwise(others(ctx.p), 2);
  },
  'Ночная карга': ctx => spyOr(ctx, 'взять 2 карты', async () => draw(ctx, 2), { draw: 2 }),
  'Шакальник': ctx => spyOr(ctx, '+2 силы и +2 влияния', async () => gain(ctx, 2, 2), { p: 2, i: 2 }),
  'Суккуб': async ctx => {
    if (!await devourFromHand(ctx, 'Суккуб: поглотите карту с руки → внедрите шпиона и уничтожьте отряд в этом регионе')) return;
    const r = await placeSpy(ctx, { follow: 'kill' }); if (r) await assassinate(ctx, 1, { region: r, noPresence: true });
  },
  'Врок': ctx => spyOr(ctx, '+5 силы', async () => gain(ctx, 5), { p: 5 }),
  'Граз’зт': ctx => chooseOne(ctx, [
    { label: 'Внедрить 2-х шпионов', v: { spy: 2 }, fn: async () => { const a = await placeSpy(ctx); await placeSpy(ctx, { exclude: a ? [a] : [] }); } },
    { label: 'Вернуть любое число своих шпионов → вытеснить отряд в каждом из этих регионов', v: { supplant: 2 }, enabled: hasOwnSpy(ctx),
      fn: async () => {
        const regs = [];
        while (ownSpies(ctx.p).length) { const r = await returnOwnSpy(ctx, 'supplant'); if (r == null) break; regs.push(r); }
        for (const r of regs) await supplant(ctx, { region: r, noPresence: true });
      } }]),
  'Взрослый миконид': async ctx => { gain(ctx, 0, 2); await madmanTo(ctx); },
  'Нальфешни': async ctx => { gain(ctx, 0, 3); promoteTop(ctx); },
  'Хезроу': async ctx => { await moveEnemy(ctx); promoteTop(ctx); },
  'Верховный миконид': async ctx => { await madmanTo(ctx); eot(ctx); },
  'Зуггтмой': async ctx => {
    const P = S.players[ctx.p];
    const ch = await pickCards(ctx.p, 'Зуггтмой: поглотите карту из внутреннего круга → +3 влияния и повышение до 2-х слуг в конце хода', [...P.inner], { purpose: 'devourInner', card: ctx.cid });
    if (!ch || !ch.length) return;
    take(P.inner, ch[0]); devourCard(ch[0], ctx.p);
    gain(ctx, 0, 3); eot(ctx, { max: 2 });
  },

  // ---- Аберрации ----
  'Наблюдатель': async ctx => gain(ctx, 2, 1),
  'Гаут': ctx => chooseOne(ctx, [
    { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) },
    { label: 'Взять карту; противник с 4+ картами сбрасывает карту', v: { draw: 1, discard: 1 }, fn: async () => { draw(ctx, 1); await opponentDiscards(ctx); } }]),
  'Свидетель разума': async ctx => { const r = await assassinate(ctx); if (r.length && r[0] !== 'W' && bigHand(r[0])) await forceDiscard(ctx, r[0]); },
  'Злобоглаз': async ctx => { await assassinate(ctx); const n = Math.floor(trophyCount(ctx.p) / 3); if (n) gain(ctx, n); },
  'Тиран Смерти': async ctx => {
    const regs = [...T.actReg].filter(r => presenceRegion(ctx.p, r) && REG[r].locs.some(l => S.occ[l] != null && S.occ[l] !== ctx.p));
    const ch = await bt(ctx, 'killRegion', 'Тиран Смерти: выберите регион — уничтожьте в нём до 3-х отрядов', regs.map(id => ({ t: 'region', id })));
    if (!ch) return;
    const r = await assassinate(ctx, 3, { region: ch.id });
    if (r.length) gain(ctx, 0, r.length);
  },
  'Черепная крыса': async ctx => { await deploy(ctx, 2); await opponentDiscards(ctx); },
  'Гримлок': ctx => deploy(ctx, 1),
  'Кваггот': ctx => assassinate(ctx, controlledRegions(ctx.p).length, { white: true }),
  'Бурый увалень': ctx => deploy(ctx, 3),
  'Неоги': async ctx => { await deploy(ctx, 4); S.flags.neogi = (S.flags.neogi || 0) + 1; },
  'Плащевик': ctx => spyOr(ctx, 'уничтожить отряд в его регионе', r => assassinate(ctx, 1, { region: r, noPresence: true }), { kill: 1 }, 'kill'),
  'Нотик': async ctx => {
    await spyOr(ctx, 'взять карту', async () => draw(ctx, 1), { draw: 1 });
    for (const q of others(ctx.p)) if (bigHand(q)) await forceDiscard(ctx, q);
  },
  'Оболваненный раб': ctx => spyOr(ctx, '+2 силы и +2 влияния', async () => gain(ctx, 2, 2), { p: 2, i: 2 }),
  'Чууль': async ctx => {
    const r = await placeSpy(ctx); if (!r) return;
    for (const q of others(ctx.p)) if (REG[r].locs.some(l => S.occ[l] === q) && bigHand(q)) await forceDiscard(ctx, q);
  },
  'Аболет': ctx => chooseOne(ctx, [
    { label: 'Внедрить 2-х шпионов', v: { spy: 2 }, fn: async () => { const a = await placeSpy(ctx); await placeSpy(ctx, { exclude: a ? [a] : [] }); } },
    { label: `Взять по карте за каждого своего шпиона на поле (${ownSpies(ctx.p).length})`, v: { draw: ownSpies(ctx.p).length }, enabled: hasOwnSpy(ctx), fn: async () => draw(ctx, ownSpies(ctx.p).length) }]),
  'Посол': async ctx => eot(ctx),
  'Пожиратель интеллекта': ctx => chooseOne(ctx, [
    { label: '+3 влияния', v: { i: 3 }, fn: async () => gain(ctx, 0, 3) },
    { label: 'Выслать до 2-х вражеских отрядов или шпионов', v: { ret: 2 }, fn: () => returnEnemy(ctx, 2) }]),
  'Кукольник': async ctx => { gain(ctx, 0, 2); eot(ctx); },
  'Улитарид': async ctx => {
    const opts = S.market.filter(u => u != null && def(u).cost <= 4);
    const ch = await pickCards(ctx.p, 'Улитарид: сыграйте карту с рынка стоимостью до 4 (затем она будет поглощена)', opts, { purpose: 'playMarket', card: ctx.cid });
    if (!ch || !ch.length) return;
    const u = ch[0], slot = S.market.indexOf(u);
    S.market[slot] = null;
    await playCard(ctx.p, u, 'market');
    take(S.played, u); devourCard(u, ctx.p);
    if (S.market[slot] == null) refillMarket(slot);
  },
  'Старший мозг': async ctx => {
    promoteTop(ctx);
    const P = S.players[ctx.p];
    const ch = await pickCards(ctx.p, 'Старший мозг: сыграйте карту из внутреннего круга (она вернётся обратно)', [...P.inner], { purpose: 'playInner', card: ctx.cid });
    if (ch && ch.length) await playCard(ctx.p, ch[0], 'inner');
  },

  // ---- Нежить ----
  'Умертвие': ctx => chooseOne(ctx, [
    { label: '+2 силы', v: { p: 2 }, fn: async () => gain(ctx, 2) },
    { label: 'Поглотить карту с руки → вытеснить отряд', v: { supplant: 1, devourHand: 1 }, enabled: S.players[ctx.p].hand.length > 0,
      fn: async () => { if (await devourFromHand(ctx)) await supplant(ctx); } }]),
  'Ползающий падальщик': async ctx => {
    gain(ctx, 3);
    const opts = S.market.filter(u => u != null);
    if (!opts.length) return;
    take(S.played, ctx.uid);
    const r = await devourMarket(ctx, { optional: false, replaceWith: ctx.uid });
    if (r == null) S.played.push(ctx.uid); else log(`${cn(ctx.uid)} занимает место на рынке.`);
  },
  'Мясной голем': async ctx => { gain(ctx, 2); if (enemyTroopLocs(ctx.p).length && await devourThis(ctx, 'Поглотить «Мясного голема», чтобы уничтожить отряд?')) await assassinate(ctx); },
  'Ревенант': async ctx => {
    await assassinate(ctx, 2);
    if (trophyCount(ctx.p) >= 8 && take(S.played, ctx.uid)) promoteCard(ctx.p, ctx.uid);
  },
  'Рыцарь Смерти': async ctx => { await supplant(ctx); const n = Math.floor(trophyCount(ctx.p) / 5); if (n) gainVP(ctx.p, n, 'Рыцарь Смерти'); },
  'Орда скелетов': async ctx => { await deploy(ctx, 2); if (await devourThis(ctx, 'Поглотить «Орду скелетов», чтобы отправить ещё 3 отряда?')) await deploy(ctx, 3); },
  'Скелет минотавра': ctx => chooseOne(ctx, [
    { label: 'Отправить 3 отряда', v: { deploy: 3 }, fn: () => deploy(ctx, 3) },
    { label: 'Поглотить эту карту → уничтожить до 3-х белых отрядов в одном регионе', v: { killWhite: 3, devourThis: 1 },
      fn: async () => {
        take(S.played, ctx.uid); devourCard(ctx.uid, ctx.p);
        const regs = [...T.actReg].filter(r => presenceRegion(ctx.p, r) && REG[r].locs.some(l => S.occ[l] === 'W'));
        const ch = await bt(ctx, 'killRegion', 'Выберите регион: уничтожьте в нём до 3-х белых отрядов', regs.map(id => ({ t: 'region', id })));
        if (ch) await assassinate(ctx, 3, { region: ch.id, white: true });
      } }]),
  'Огр-зомби': ctx => supplant(ctx, { white: true, anywhere: true }),
  'Ненасытный зомби': async ctx => { gain(ctx, 1); await assassinate(ctx, 1, { white: true }); },
  'Лорд-мумия': async ctx => {
    for (let k = 1; k <= 2; k++) await chooseOne(ctx, [
      { label: 'Уничтожить белый отряд', v: { killWhite: 1 }, fn: () => assassinate(ctx, 1, { white: true }) },
      { label: 'Взять белый отряд из трофеев любого игрока и отправить в любую локацию', v: { blockWhite: 1 }, enabled: S.players.some(P => (P.trophies.W || 0) > 0),
        fn: () => redeployTrophies(ctx, 1, S.players.map(P => P.idx), 'W', true) }], `Действие ${k} из 2:`);
  },
  'Призрак': async ctx => {
    const r = await placeSpy(ctx, { follow: 'kill' });
    if (r && enemyTroopLocs(ctx.p, { region: r, noPresence: true }).length && await devourThis(ctx, 'Поглотить «Призрака», чтобы уничтожить отряд в регионе с этим шпионом?')) await assassinate(ctx, 1, { region: r, noPresence: true });
  },
  'Привидение': ctx => spyOr(ctx, 'до конца хода верхнюю поглощённую карту можно нанять', async () => { S.flags.devouredBuy = true; log('Верхнюю карту стопки поглощения можно нанять до конца хода.'); }, { i: 1 }),
  'Фокусник': ctx => spyOr(ctx, 'нанять до 2-х слуг стоимостью до 3 без оплаты', async () => {
    for (let k = 0; k < 2; k++) if (!await recruitFree(ctx, { maxCost: 3, text: `Наймите слугу стоимостью до 3 без оплаты (${k + 1} из 2)` })) break;
  }, { recruit: 2 }),
  'Баньши': async ctx => { const r = await placeSpy(ctx); if (r && S.spies[r].some(q => q !== ctx.p)) gain(ctx, 3); },
  'Лич': async ctx => {
    const r = await placeSpy(ctx); if (!r) return;
    const owners = [...new Set(REG[r].locs.map(l => S.occ[l]).filter(v => v != null && v !== 'W' && v !== ctx.p))];
    await redeployTrophies(ctx, 2, owners, ctx.p, false);
  },
  'Порождение вампира': async ctx => { gain(ctx, 0, 1); await returnEnemy(ctx); },
  'Культист Миркула': ctx => chooseOne(ctx, [
    { label: '+2 влияния', v: { i: 2 }, fn: async () => gain(ctx, 0, 2) },
    { label: 'Поглотить эту карту → в конце хода повысить до 2-х других слуг', v: { promote: 2, devourThis: 1 },
      fn: async () => { take(S.played, ctx.uid); devourCard(ctx.uid, ctx.p); eot(ctx, { max: 2 }); } }]),
  'Некромант': ctx => chooseOne(ctx, [
    { label: '+3 влияния', v: { i: 3 }, fn: async () => gain(ctx, 0, 3) },
    { label: 'Повысить этого слугу, слугу с руки или из сброса', v: { promote: 1 },
      fn: async () => {
        const P = S.players[ctx.p];
        const opts = [...(S.played.includes(ctx.uid) ? [ctx.uid] : []), ...P.hand, ...P.discard];
        const ch = await pickCards(ctx.p, 'Некромант: выберите слугу для повышения (эта карта, рука или сброс)', opts, { purpose: 'promote', card: ctx.cid });
        if (!ch || !ch.length) return;
        if (!take(S.played, ch[0]) && !take(P.hand, ch[0])) take(P.discard, ch[0]);
        promoteCard(ctx.p, ch[0]);
      } }]),
  'Верховный жрец Миркула': async ctx => { await returnEnemy(ctx); eot(ctx, { max: 99, filter: u => def(u).type === 'Нежить', what: 'слугу-нежить' }); },
  'Вампир': ctx => chooseOne(ctx, [
    { label: 'Вытеснить отряд', v: { supplant: 1 }, fn: () => supplant(ctx) },
    { label: 'Повысить слугу из сброса, затем 1 ПО за каждые 3 карты во внутреннем круге', v: { promote: 1, vp: 2 }, fn: async () => {
      const P = S.players[ctx.p];
      const ch = await pickCards(ctx.p, 'Вампир: повысьте слугу из сброса', [...P.discard], { purpose: 'promote', card: ctx.cid });
      if (ch && ch.length) { take(P.discard, ch[0]); promoteCard(ctx.p, ch[0]); }
      const n = Math.floor(P.inner.length / 3); if (n) gainVP(ctx.p, n, 'Вампир');
    } }]),
};
