# Разметка тайлов «Демонической паутины» -> js/data_web.js
# Номера кружков — из автоматического разбора тайлов (hexan.py, кружки найдены преобразованием Хафа);
# регионы, связи и выходы проверены вручную по картинкам. Выходы: 0=верх, далее по часовой.
# python tools/web_tiles.py <папка с an_*.json>
import json, sys, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
AN = sys.argv[1]
EXTRA = {('A3', 'x828'): (828, 1150)}  # кружок, который не нашёлся автоматически

# регион: (ключ, название, ПО, кружки, флаги) ; флаги: s — стартовый (чёрная рамка), t:<id> — жетон контроля
B_RING = lambda reg, ex: dict(regions=[reg], nodes=[0, 1, 2, 3, 4], links=[[n, 'R0'] for n in range(5)], exits=ex)
T = {
  'A1': dict(regions=[('R0', 'Араумикос', 8, [6, 7, 8, 9, 10, 11], 't:araumycos')], nodes=[0, 1, 2, 3, 4, 5],
             links=[[n, 'R0'] for n in range(6)], exits=[4, 2, 3, 5, 0, 1]),
  'A2': dict(regions=[('R0', 'Город туманов', 4, [0, 2, 4], ''), ('R1', 'Тёмное пламя', 4, [1, 3, 5], ''), ('R2', 'Галленгаст', 4, [6, 7, 8], '')],
             nodes=[], links=[['R0', 'R1'], ['R0', 'R2'], ['R1', 'R2']], exits=['R0', 'R2', 'R2', 'R1', 'R1', 'R0'], combo=True),
  'A3': dict(regions=[('R0', 'Араумикос', 2, [6, 'x828'], 't:araumycos'), ('R1', 'Застава 1', 2, [5], ''), ('R2', 'Застава 2', 2, [1], ''),
                      ('R3', 'Застава 3', 2, [2], ''), ('R4', 'Застава 4', 2, [4], ''), ('R5', 'Застава 5', 2, [0], ''), ('R6', 'Застава 6', 2, [3], '')],
             nodes=[], links=[['R0', 'R%d' % k] for k in range(1, 7)], exits=['R1', 'R2', 'R3', 'R4', 'R5', 'R6']),
  'A4': dict(regions=[], nodes=list(range(7)), links=[[0, 2], [0, 4], [0, 5], [1, 3], [1, 5], [1, 6], [2, 3], [2, 5], [3, 5], [4, 5], [4, 6], [5, 6]], exits=[6, 4, 0, 2, 3, 1]),
  'A5': dict(regions=[], nodes=list(range(7)), links=[[0, 4], [0, 5], [1, 2], [1, 5], [2, 5], [3, 5], [3, 6], [4, 5], [5, 6]], exits=[3, 2, 1, 0, 4, 6]),
  'A6': dict(regions=[], nodes=list(range(7)), links=[[0, 1], [0, 2], [2, 3], [2, 5], [3, 4], [5, 6]], exits=[3, 6, 5, 1, 0, 4]),
  'A7': dict(regions=[], nodes=[0], links=[], exits=[0, 0, 0, 0, 0, 0]),
  'A8': dict(regions=[], nodes=list(range(6)), links=[[0, 3], [0, 4], [1, 4], [1, 5], [2, 3], [2, 5]], exits=[0, 3, 2, 5, 1, 4]),
  'A9': dict(regions=[('R0', 'Колодцы тьмы', 9, list(range(9)), 's')], nodes=[], links=[], exits=['R0'] * 6),
  'B1': B_RING(('R0', 'Мензоберранзан', 4, [5, 6, 7], 't:menzo'), [2, 0, 4, None, 3, 1]),
  'B2': dict(regions=[('R0', 'Синвиилик', 3, [4, 5, 7, 8], 't:sinviilik'), ('R1', 'Врит', 2, [6], '')], nodes=[0, 1, 2, 3],
             links=[[n, 'R0'] for n in range(4)] + [['R0', 'R1']], exits=['R1', 1, 2, None, 0, 3]),
  'B3': B_RING(('R0', 'Гаунтлгрим', 2, [5, 6, 7], 't:gauntlgrym'), [3, 0, 1, None, 4, 2]),
  'B4': B_RING(('R0', "Ч'читл", 2, [5, 6, 7], 't:chchitl'), [3, 1, 2, None, 0, 4]),
  'B5': B_RING(('R0', "Сс'зураасснии", 2, [5, 6, 7], 't:sszuraassnii'), [0, 4, 1, None, 2, 3]),
  'B6': B_RING(('R0', 'Фаэрлин', 2, [5, 6, 7], 't:faerlin'), [0, 1, 4, None, 2, 3]),
  'C1': dict(regions=[('R0', 'Сумерки', 3, [8, 10, 11], ''), ('R1', 'Спиральная пустыня', 3, [6, 7, 9], ''), ('R2', 'Магматические врата', 2, [0, 1], 's')],
             nodes=[2, 3, 4, 5], links=[['R0', 2], ['R0', 4], [4, 'R1'], [2, 'R2'], [5, 'R1'], [5, 'R2'], [3, 'R1']], exits=['R0', 'R2', 'R2', 3, None, None]),
  'C2': dict(regions=[('R0', 'Граклстух', 3, [9, 10, 11, 12], ''), ('R1', 'Мантол-Дерит', 5, [0, 1, 2, 3, 4, 5], 's')],
             nodes=[6, 7, 8], links=[[6, 'R0'], ['R0', 8], [8, 'R1'], ['R1', 7]], exits=[None, 'R0', 7, 'R1', 'R1', 6]),
  'C3': dict(regions=[('R0', 'Красный лес', 4, [6, 7, 9], ''), ('R1', 'Ксал Велдрин', 3, [0, 1, 2, 3], 's'), ('R2', 'Железные пустоши', 3, [8, 10, 11], '')],
             nodes=[4, 5], links=[['R0', 'R1'], ['R1', 'R2'], ['R1', 4], ['R1', 5]], exits=['R0', 4, 'R2', 'R2', 5, 'R0']),
  'C4': dict(regions=[('R0', 'Барьер', 4, [10, 11], ''), ('R1', 'Красные врата', 4, [7, 8], ''), ('R2', 'Иблис', 1, [9], ''), ('R3', 'Каэр Сиди', 3, [0, 1, 2], 's')],
             nodes=[3, 4, 5, 6], links=[['R0', 'R2'], ['R0', 6], [6, 'R3'], ['R1', 'R2'], ['R1', 3], [3, 'R3'], ['R3', 4], ['R3', 5]], exits=[None, 'R0', 5, 4, 'R1', 'R1']),
  'C5': dict(regions=[('R0', 'Эрелхей-Синлу', 4, [6, 7, 8, 9, 10], ''), ('R1', 'Эт-Куа', 3, [0, 1, 2, 3], 's')],
             nodes=[4, 5], links=[[5, 'R0'], ['R0', 4]], exits=[5, 'R1', 'R1', 4, None, None]),
  'C6': dict(regions=[('R0', "Зи'кзолца", 2, [0, 1], 's'), ('R1', 'Чёрные врата', 4, [7, 8], '')],
             nodes=[2, 3, 4, 5, 6], links=[[6, 2], [2, 'R0'], [2, 'R1'], [2, 3], [4, 'R1'], ['R1', 5]], exits=[6, None, 3, 5, 'R1', 4]),
  'C7': dict(regions=[('R0', 'Паучий дом', 5, [5, 6, 9, 10, 13, 14], ''), ('R1', 'Врата Танатоса', 5, [7, 8, 11, 12, 15, 16], '')],
             nodes=[0, 1, 2, 3, 4], links=[[3, 'R0'], [4, 'R0'], ['R0', 2], [2, 'R1'], ['R1', 1], ['R1', 0]], exits=[None, 4, 0, 'R1', 1, 3]),
  'C8': dict(regions=[('R0', 'Энзитир', 3, [4, 6], ''), ('R1', 'Венлатир', 3, [5, 7], ''), ('R2', 'Кселатир', 3, [8, 9], '')],
             nodes=[0, 1, 2, 3], links=[[3, 'R0'], ['R0', 0], [0, 'R2'], [0, 'R1'], ['R1', 1], ['R2', 2]], exits=[None, 2, 0, 1, 0, 3]),
  # экспериментальные гексы: «Пустоши» и «Равнодушие» не связаны маршрутами (попасть туда можно шпионом),
  # развилки маршрутов без локации сведены к связям между соседними узлами
  'X1': dict(regions=[('R0', 'Пустоши', 3, [6, 9, 11, 8, 10], ''), ('R1', 'Поднятые холмы', 3, [12, 13, 14], ''), ('R2', 'Гниющая равнина', 3, [4, 5, 7], '')],
             nodes=[0, 1, 2], links=[[2, 'R2'], ['R2', 1], [1, 'R1'], ['R1', 0]], exits=[None, 0, 'R1', 1, 'R2', 2]),
  'X2': dict(regions=[('R0', 'Равнодушие', 4, [4, 5, 6, 7], '')], nodes=[0, 1, 2, 3], links=[[3, 1], [1, 0], [0, 2]], exits=[None, 2, 0, 1, 1, 3]),
  'X3': dict(regions=[], nodes=[0], links=[], exits=[None, 0, 0, 0, 0, 0]),
  'X4': dict(regions=[('R0', 'Вопящий фонтан', 5, [2, 3, 4], '')], nodes=[0, 1], links=[], exits=[None, 0, 0, 'R0', 1, 1]),
}
FULL_VP = {'menzo': 2, 'araumycos': 3}

out = []
for tid, t in T.items():
    an = json.load(open(os.path.join(AN, f'an_{tid}.json')))
    C = an['circles']
    def pt(c):
        if isinstance(c, str): x, y = EXTRA[(tid, c)]; return dict(x=x, y=y, white=False)
        return dict(x=C[c]['x'], y=C[c]['y'], white=C[c]['innerWhite'] > 0.2 and C[c]['innerWhite'] < 0.9)
    regs = []
    for key, name, vp, circ, fl in t['regions']:
        tok = next((f[2:] for f in fl.split(',') if f.startswith('t:')), None)
        regs.append(dict(key=key, name=name, vp=vp, start='s' in fl.split(','), token=tok, fullVp=FULL_VP.get(tok, 1) if tok else 0, locs=[pt(c) for c in circ]))
    el = lambda e: e if isinstance(e, str) else f'N{e}'
    out.append(dict(id=tid, regions=regs, nodes=[dict(key=f'N{n}', **pt(n)) for n in t['nodes']],
                    links=[[el(a), el(b)] for a, b in t['links']], exits=[None if e is None else el(e) for e in t['exits']], combo=bool(t.get('combo'))))
    keys = {r['key'] for r in regs} | {f'N{n}' for n in t['nodes']}
    for a, b in t['links']: assert el(a) in keys and el(b) in keys, (tid, a, b)
    for e in t['exits']: assert e is None or el(e) in keys, (tid, e)
open(os.path.join(ROOT, 'js', 'data_web.js'), 'w', encoding='utf-8').write(
    '// разметка тайлов «Демонической паутины» (tools/web_tiles.py)\nconst WEB_TILES = ' + json.dumps(out, ensure_ascii=False) + ';\n')
print('тайлов:', len(out), 'белых отрядов:', sum(l['white'] for t in out for r in t['regions'] for l in r['locs']))
