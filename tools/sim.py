# Прогон партий ботов без интерфейса (QuickJS): python tools/sim.py [партий] [игроков] [колода1,колода2]
import sys, os, json, quickjs
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
games = int(sys.argv[1]) if len(sys.argv) > 1 else 5
np_ = int(sys.argv[2]) if len(sys.argv) > 2 else 2
fixed = sys.argv[3].split(',') if len(sys.argv) > 3 else None
ALL = ['drow', 'dragons', 'elementals', 'demons', 'aberrations', 'undead']
src = '\n'.join(open(os.path.join(root, 'js', f + '.js'), encoding='utf-8').read() for f in ['data_cards', 'data_board', 'engine', 'effects', 'ai'])
stub = "var UI={ask:function(){throw new Error('human ask')},render:function(){},humanTurn:function(){},showScores:function(){},onLog:null};var setTimeout=function(f){f()};"
for g in range(games):
    ctx = quickjs.Context(); ctx.set_memory_limit(1 << 30); ctx.set_max_stack_size(1 << 26)
    ctx.eval(stub + src)
    if g == 0:
        print('без эффекта:', ctx.eval("JSON.stringify([...new Set(CARDS_DATA.map(c=>c.name))].filter(n=>!EFFECTS[n]))"))
    decks = fixed or [ALL[(g * 2) % 6], ALL[(g * 2 + 1) % 6]]
    ctx.eval(f"""var __done=false, __err=null;
      newGame({{players:Array.from({{length:{np_}}},(_, i)=>({{name:'Бот'+(i+1),bot:true,hex:'#fff',house:'x'}})), decks:{json.dumps(decks)}, botDelay:0}});
      (async()=>{{ await initialDeploy(); await startTurn(); }})().then(()=>{{__done=true}}, e=>{{__err=String(e)+' @@ '+e.stack; __done=true}});""")
    n = 0
    while not ctx.eval('__done'):
        if not ctx.execute_pending_job(): break
        n += 1
    err = ctx.eval('__err')
    if err or not ctx.eval('__done'):
        print('ОШИБКА', err or 'не завершилась'); print(ctx.eval("S.log.slice(-20).join('\n')")); sys.exit(1)
    res = json.loads(ctx.eval("JSON.stringify({r:S.round,t:S.turnNo,sc:S.players.map(P=>scoreOf(P.idx)),bar:S.players.map(P=>P.barracks),md:S.mdeck.length})"))
    print(f"#{g+1} {'+'.join(decks)} раундов {res['r']} ходов {res['t']} рынок {res['md']} казармы {res['bar']} :: " +
          ' | '.join(f"{s['total']} (рег {s['ctrl']}+{s['full']} троф {s['trophies']} кол {s['deckVp']} круг {s['innerVp']} жет {s['tokens']})" for s in res['sc']))
