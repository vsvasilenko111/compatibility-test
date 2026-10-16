# Вливает ответы на изменённые и новые вопросы банка v6 (answers-v6/) в answers/: ответы на старые формулировки заменяются.
import json, os, sys
D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic'
need = [l.split(' | ')[0] for l in open(f'{D}/questions-v6-changed.txt') if l.strip()]
bad = []
for f in sorted(os.listdir(f'{D}/answers')):
    p = f'{D}/answers-v6/{f}'
    if not os.path.exists(p): bad.append(f'{f}: нет файла'); continue
    new = json.load(open(p))
    miss = [i for i in need if not isinstance(new.get(i), int) or not -1 <= new[i] <= 10]
    if miss: bad.append(f'{f}: нет/неверно {miss[:5]}…'); continue
    old = json.load(open(f'{D}/answers/{f}'))
    old.update({i: new[i] for i in need})
    if '--write' in sys.argv: json.dump(old, open(f'{D}/answers/{f}', 'w'), ensure_ascii=False)
print('проблемы:', bad or 'нет')
