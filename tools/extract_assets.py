# Вырезает картинки карт и поля из PnP-архива «Тираны Подземья» в img/.
# Картинки — арт правообладателя, поэтому в репозиторий не кладутся.
#   pip install pymupdf opencv-python-headless numpy
#   python tools/extract_assets.py "C:\Users\...\Desktop\Tirany_Podzemya.zip"
import sys, os, re, zipfile, tempfile, collections
import pymupdf, cv2, numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CARD_PDFS = ['Карты Базы (1) начальные колоды.pdf', 'Карты Базы (2) колоды Элементалей и Демонов.pdf', 'Карты Допа (3) колоды Аберраций и Нежити.pdf']
BOARD_PDF = 'Поле (целиком).pdf'
DECKS = ['drow', 'dragons', 'elementals', 'demons', 'aberrations', 'undead']
XS = [30, 208, 387, 565]; YS = [47, 296, 546, 795]  # сетка 3x3 карт на листе


def unpack(zpath, dst):
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename
            if not info.flag_bits & 0x800:  # имя не в UTF-8 — архив из Windows
                try: name = name.encode('cp437').decode('cp866')
                except UnicodeError: pass
            if name.endswith('/'): continue
            out = os.path.join(dst, os.path.basename(name))
            with z.open(info) as src, open(out, 'wb') as f: f.write(src.read())


def cell_of(x, y):
    for i in range(3):
        for j in range(3):
            if XS[j] <= x < XS[j + 1] and YS[i] <= y < YS[i + 1]: return (i, j)
    return None


def card_cells(doc):
    """Для каждой карты листа: (страница, ячейка, название, метка колоды, номер n/40)."""
    for pn, pg in enumerate(doc):
        cells = collections.defaultdict(list)
        for b in pg.get_text('dict')['blocks']:
            if b['type'] != 0: continue
            for l in b['lines']:
                for s in l['spans']:
                    if not s['text'].strip(): continue
                    x0, y0, x1, y1 = s['bbox']; c = cell_of((x0 + x1) / 2, (y0 + y1) / 2)
                    if c: cells[c].append((y0 - YS[c[0]], x0 - XS[c[1]], round(s['size']), s['font'], s['text'].strip()))
        for c, sp in sorted(cells.items()):
            sp.sort()
            name = next((t for y, x, sz, f, t in sp if f.startswith('Tiamat') and sz == 14 and y < 20), None)
            label = next((t for y, x, sz, f, t in sp if f.startswith('Tiamat') and sz == 10), None)
            body = [t for y, x, sz, f, t in sp if f.startswith('Cronos') and 'Italic' not in f]
            if not name: name = ' '.join(body[:2])  # двухстрочные названия (мирмидоны)
            idx = next((int(t.split('/')[0]) for t in body if re.fullmatch(r'\d+/40', t)), None)
            yield pn, c, name, label, idx


def main():
    zpath = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(r'~\Desktop\Tirany_Podzemya.zip')
    os.makedirs(os.path.join(ROOT, 'img', 'cards'), exist_ok=True)
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        unpack(zpath, tmp)
        seen, per_deck, deck_i, prev = set(), collections.Counter(), -1, 999
        for fname in CARD_PDFS:
            doc = pymupdf.open(os.path.join(tmp, fname))
            for pn, (i, j), name, label, idx in card_cells(doc):
                if label in ('СТАРТОВАЯ', 'БАЗОВАЯ'): deck = 'start' if label == 'СТАРТОВАЯ' else 'base'
                else:
                    if idx is not None and idx < prev: deck_i += 1
                    if idx is not None: prev = idx
                    deck = DECKS[deck_i]
                if (deck, name) in seen: continue
                seen.add((deck, name)); per_deck[deck] += 1
                cid = f'{deck}_{per_deck[deck]:02d}'
                pix = doc[pn].get_pixmap(dpi=144, clip=pymupdf.Rect(XS[j], YS[i], XS[j + 1], YS[i + 1]))
                a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
                cv2.imwrite(os.path.join(ROOT, 'img', 'cards', cid + '.webp'), cv2.cvtColor(a, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 82])
            doc.close()
        print('карт:', len(seen), dict(per_deck))
        doc = pymupdf.open(os.path.join(tmp, BOARD_PDF))
        x = pymupdf.Pixmap(doc, doc[0].get_images()[0][0])
        a = np.frombuffer(x.samples, dtype=np.uint8).reshape(x.height, x.width, x.n)[:, :, :3]
        a = cv2.resize(cv2.cvtColor(a, cv2.COLOR_RGB2BGR), (2000, 2000), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(ROOT, 'img', 'board.jpg'), a, [cv2.IMWRITE_JPEG_QUALITY, 86])
        x = None; doc.close()
        print('поле: img/board.jpg')


if __name__ == '__main__':
    main()
