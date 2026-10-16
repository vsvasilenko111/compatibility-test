# Вливает ответы на изменённые и новые вопросы (answers-<V>/, по умолчанию v6) в answers/: ответы на старые формулировки заменяются.
# Запуск: python3 merge-answers.py [v7] [--write] [--fresh] — --fresh: свежие пары (fresh/answers).
import json, os, sys
V = next((a for a in sys.argv[1:] if a.startswith('v')), 'v6')
D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic'
need = [l.split(' | ')[0] for l in open(f'{D}/questions-{V}-changed.txt') if l.strip()]
if '--fresh' in sys.argv: D += '/fresh'
bad = []
for f in sorted(os.listdir(f'{D}/answers')):
    p = f'{D}/answers-{V}/{f}'
    if not os.path.exists(p): bad.append(f'{f}: нет файла'); continue
    new = json.load(open(p))
    miss = [i for i in need if not isinstance(new.get(i), int) or not -1 <= new[i] <= 10]
    if miss: bad.append(f'{f}: нет/неверно {miss[:5]}…'); continue
    old = json.load(open(f'{D}/answers/{f}'))
    old.update({i: new[i] for i in need})
    old.update({k: v for k, v in new.items() if k.startswith('firm:')})  # отметки «не обсуждается» (v9)
    if '--write' in sys.argv: json.dump(old, open(f'{D}/answers/{f}', 'w'), ensure_ascii=False)
print('проблемы:', bad or 'нет')
