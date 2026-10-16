# Тест-ретест: те же биографии, другая модель (opus вместо sonnet). Насколько устойчивы ответы и процент.
import json, numpy as np
from variants import *
ids = sorted(f[:-5] for f in os.listdir(F + 'retest'))
A1 = {i: load(F + 'answers/' + i + '.json') for i in ids}; A2 = {i: load(F + 'retest/' + i + '.json') for i in ids}
allq = [q for q in man[str(bank['version'])]]
def vec(path): r = json.load(open(path)); return np.array([r.get(q, -1) for q in allq], float)
d = np.concatenate([np.abs(vec(F + 'answers/' + i + '.json') - vec(F + 'retest/' + i + '.json')) for i in ids])
print(f'{len(ids)} персонажей, {len(d)} ответов: средняя |разница| {d.mean():.2f}, точно совпало {np.mean(d==0)*100:.0f}%, разница ≥3 {np.mean(d>=3)*100:.0f}%')
r = [np.corrcoef(vec(F + 'answers/' + i + '.json'), vec(F + 'retest/' + i + '.json'))[0, 1] for i in ids]
print('корреляция профиля человека с самим собой: медиана', round(float(np.median(r)), 2), 'мин', round(min(r), 2))
self = [sim(A1[i][1], A2[i][1], IW[imp(A1[i][1])] * SW, IW[imp(A2[i][1])] * SW) for i in ids]
print('процент «человек сам с собой» (первое и второе прохождение): медиана', round(float(np.median(self))), 'мин', round(min(self)))
ex1 = np.mean([np.mean(np.abs(A1[i][1] - 5) >= 4) for i in ids]); ex2 = np.mean([np.mean(np.abs(A2[i][1] - 5) >= 4) for i in ids])
print(f'доля крайних ответов: sonnet {ex1*100:.0f}%, opus {ex2*100:.0f}%')
men = [i for i in ids if i.endswith('m')]; wom = [i for i in ids if i.endswith('w')]
pairs = [(m, w) for m in men for w in wom]
s1 = np.array([sim(A1[m][1], A1[w][1], IW[imp(A1[m][1])] * SW, IW[imp(A1[w][1])] * SW) for m, w in pairs])
s2 = np.array([sim(A2[m][1], A2[w][1], IW[imp(A2[m][1])] * SW, IW[imp(A2[w][1])] * SW) for m, w in pairs])
print(f'{len(pairs)} комбинаций: процент пары по первым ответам vs по вторым — средний сдвиг {np.mean(np.abs(s1-s2)):.1f} п., макс {np.max(np.abs(s1-s2)):.0f}; порядок пар совпадает в {cidx(s1, s2):.1f}% сравнений; средний уровень {s1.mean():.0f} → {s2.mean():.0f}')
for n, f in [('плоская важность', lambda a, b: sim(a, b, SW, SW))]:
    t1 = np.array([f(A1[m][1], A1[w][1]) for m, w in pairs]); t2 = np.array([f(A2[m][1], A2[w][1]) for m, w in pairs])
    print(f'  {n}: сдвиг {np.mean(np.abs(t1-t2)):.1f} п., порядок {cidx(t1, t2):.1f}%')
