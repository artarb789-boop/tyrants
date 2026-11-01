# Прогон партий ботов без интерфейса (QuickJS): python tools/sim.py [партий] [игроков] [колода1,колода2]
import sys, os, json, quickjs
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
games = int(sys.argv[1]) if len(sys.argv) > 1 else 5
np_ = int(sys.argv[2]) if len(sys.argv) > 2 else 2
fixed = sys.argv[3].split(',') if len(sys.argv) > 3 else None
ALL = ['drow', 'dragons', 'elementals', 'demons', 'aberrations', 'undead', 'siege', 'yugoloths', 'arachnids']
MODS = os.environ.get('MODS', '')
LEVELS = os.environ.get('LEVELS', 'normal').split(',')
wins = {}
src = '\n'.join(open(os.path.join(root, 'js', f + '.js'), encoding='utf-8').read() for f in ['data_cards', 'data_cards_fan', 'data_board', 'data_web', 'engine', 'effects', 'effects_fan', 'ai'])
stub = "var UI={ask:function(){throw new Error('human ask')},render:function(){},humanTurn:function(){},showScores:function(){},onLog:function(m){var x=m.match(/играет «([^»]+)»/);if(x)__played[x[1]]=1}};var __played={};var setTimeout=function(f){f()};"
played = set()
for g in range(games):
    ctx = quickjs.Context(); ctx.set_memory_limit(1 << 30); ctx.set_max_stack_size(1 << 26)
    ctx.eval(stub + src)
    if os.environ.get('HARD'): ctx.eval('Object.assign(AI.LV.hard, %s)' % os.environ['HARD'])   # подбор параметров тяжёлого бота
    if g == 0:
        print('без эффекта:', ctx.eval("JSON.stringify([...new Set(CARDS_DATA.map(c=>c.name))].filter(n=>!EFFECTS[n]))"))
    decks = fixed or [ALL[(g * 2) % 9], ALL[(g * 2 + 1) % 9]]
    lv = [LEVELS[(i + g) % len(LEVELS)] for i in range(np_)]   # уровни сдвигаются по местам от партии к партии
    ctx.eval(f"""var __done=false, __err=null;
      newGame({{players:{json.dumps(lv)}.map((l, i)=>({{name:'Бот'+(i+1),bot:true,level:l,hex:'#fff',house:'x'}})), decks:{json.dumps(decks)}, botDelay:0, board:{json.dumps(os.environ.get('BOARD', 'base'))}, xhex:{'true' if os.environ.get('XHEX') else 'false'}, center:{json.dumps(os.environ.get('CENTER') or None)}, modules:{{pop:{'true' if 'pop' in MODS else 'false'}, gems:{'true' if 'gems' in MODS else 'false'}}}}});
      if ({'true' if os.environ.get('STRESS') else 'false'}) for (const P of S.players) {{ for (const c of CARDS_DATA.filter(c=>{json.dumps(decks)}.includes(c.deck)||(c.deck==='poison'&&{json.dumps(decks)}.includes('arachnids')))) P.deck.push(mkCard(c.id)); shuffle(P.deck); }}
      (async()=>{{ await initialDeploy(); await startTurn(); }})().then(()=>{{__done=true}}, e=>{{__err=String(e)+' @@ '+e.stack; __done=true}});""")
    n = 0
    while not ctx.eval('__done'):
        if not ctx.execute_pending_job(): break
        n += 1
    err = ctx.eval('__err')
    if err or not ctx.eval('__done'):
        print('ОШИБКА', err or 'не завершилась'); print(ctx.eval("S.log.slice(-20).join('\\n')")); sys.exit(1)
    played |= set(json.loads(ctx.eval("JSON.stringify(Object.keys(__played))")))
    res = json.loads(ctx.eval("JSON.stringify({r:S.round,t:S.turnNo,sc:S.players.map(P=>scoreOf(P.idx)),bar:S.players.map(P=>P.barracks),md:S.mdeck.length})"))
    best = max(s['total'] for s in res['sc'])
    for i, sc in enumerate(res['sc']):
        if sc['total'] == best: wins[lv[i]] = wins.get(lv[i], 0) + 1
    print(f"#{g+1} [{','.join(lv)}] {'+'.join(decks)} раундов {res['r']} ходов {res['t']} рынок {res['md']} казармы {res['bar']} :: " +
          ' | '.join(f"{s['total']} (рег {s['ctrl']}+{s['full']} троф {s['trophies']} кол {s['deckVp']} круг {s['innerVp']} жет {s['tokens']})" for s in res['sc']))
if len(set(LEVELS)) > 1: print('победы по уровням:', wins)
if os.environ.get('COVER'):
    names = json.loads(ctx.eval("JSON.stringify([...new Set(CARDS_DATA.filter(c=>%s.includes(c.deck)||c.deck==='poison').map(c=>c.name))])" % json.dumps(fixed or ALL)))
    print('ни разу не сыграны:', [n for n in names if n not in played])
