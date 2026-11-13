# Архив игры для друга: только то, что нужно для запуска (страница, код, картинки) -> dist/tyrants.zip
# python tools/pack.py
# Картинки — арт правообладателя: архив только для своих, не для публичной раздачи.
import os, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HOWTO = """Тираны Подземья — как играть

1. Распакуйте архив в любую папку.
2. Откройте index.html двойным щелчком (лучше в Chrome или Edge).

Игра по сети:
- Ведущий в меню ставит у нужного места «Сеть» и нажимает «Создать комнату» — появится код из 5 символов.
- Друг открывает свою копию игры, нажимает «Присоединиться к игре по коду» и вводит код.
- Партия идёт на компьютере ведущего (вместе с ботами); нужен интернет. Версии игры у всех должны совпадать.
- Если связь оборвалась или страница перезагрузилась, игра сама вернёт вас в партию — продолжится с того же места.
"""

def main():
    if not os.path.exists(os.path.join(ROOT, 'img', 'board.jpg')):
        raise SystemExit('Нет картинок: сначала запустите tools/extract_assets.py со своим PnP-архивом.')
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    out = os.path.normpath(os.path.join(ROOT, 'dist', 'tyrants.zip'))
    files = ['index.html', 'style.css']
    for d in ['js', 'img']:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            files += [os.path.relpath(os.path.join(base, n), ROOT) for n in names]
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):
            z.write(os.path.join(ROOT, f), os.path.join('tyrants', f).replace('\\', '/'))
        z.writestr('tyrants/КАК ИГРАТЬ.txt', HOWTO)
    print(f'{out}: файлов {len(files) + 1}, {os.path.getsize(out) / 1e6:.1f} МБ')

main()
