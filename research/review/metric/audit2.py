import json, numpy as np, glob, os, itertools
from audit_lib import *
out = []
def P(*a):
    s = ' '.join(str(x) for x in a); print(s); out.append(s)
# --- verify reimplementation
Tre = np.array([score(m, w, A) for m, w in K])
P(f'Проверка переписанной формулы: max |Python − TS| = {np.abs(Tre - T).max():.2e}\n')

P('## F. Базовые модели (без подбора) против теста\n')
P('| модель | C ↔ эксперты | ДИ по людям | AUC A vs C | C внутри перекрёстных |'); P('|---|---|---|---|---|')
X = typ == 'X'
def line(nm, s):
    c = cidx(s, E); (lo, hi), _ = boot(lambda w: cidx(s, E, w), 1000)
    P(f'| {nm} | {c:.1f} | {lo:.1f}–{hi:.1f} | {auc(s, typ=="A", typ=="C"):.0f} | {cidx(s[X], E[X]):.1f} |')
def mad(qids, Ans=A):
    ix = [QID.index(q) for q in qids]
    return np.array([-np.nanmean(np.abs(Ans[m][ix] - Ans[w][ix])) for m, w in K])
def eucl(qids, Ans=A):
    ix = [QID.index(q) for q in qids]
    return np.array([-np.sqrt(np.nanmean((Ans[m][ix] - Ans[w][ix]) ** 2)) for m, w in K])
def pcorr(qids, Ans=A, center=None):
    ix = [QID.index(q) for q in qids]; r = []
    for m, w in K:
        a, b = Ans[m][ix], Ans[w][ix]
        if center is not None: a, b = a - center[ix], b - center[ix]
        ok = ~np.isnan(a) & ~np.isnan(b); r.append(np.corrcoef(a[ok], b[ok])[0, 1])
    return np.array(r)
line('**тест (прод: веса сфер + важность + формула)**', T)
line('та же формула, все сферы с весом 1', np.array([score(m, w, A, eq=True) for m, w in K]))
line('средняя |разница| по всем 119 вопросам', mad(QID))
line('евклидово расстояние по всем 119', eucl(QID))
line('корреляция профилей (Пирсон, 119 вопросов)', pcorr(QID))
REL = [q['id'] for q in QS if q['block'] == 'relationship']; FR = [q['id'] for q in QS if q['block'] == 'friendship']
line(f'средняя |разница|, только блок отношений ({len(REL)})', mad(REL))
line(f'средняя |разница|, только блок дружбы ({len(FR)})', mad(FR))
FIVE = ['kids-02', 'kids-08', 'living-01', 'living-03', 'values-04']
line('5 вопросов: сколько детей, когда дети, где жить, переезд за границу, вера', mad(FIVE))
line('3 вопроса: сколько детей, переезд за границу, вера', mad(['kids-02', 'living-03', 'values-04']))
line('1 вопрос: сколько детей (kids-02)', mad(['kids-02']))
KIDS = [q for q in QID if q.startswith('kids')]; LIV = [q for q in QID if q.startswith('living')]
line(f'сферы дети+жильё+бюджет+вера-ценности (|разница|)', mad([q for q in QID if q.split('-')[0] in ('kids','living','budget','values')]))
# random subsets
P('\nСлучайные наборы вопросов (средняя |разница|, 500 наборов каждого размера):\n'); P('| размер набора | медиана C | 5-й – 95-й перцентиль | доля наборов ≥ 84.3 |'); P('|---|---|---|---|')
for k in [5, 10, 20, 40]:
    v = np.array([cidx(mad(list(rng.choice(QID, k, replace=False))), E) for _ in range(500)])
    P(f'| {k} | {np.median(v):.1f} | {np.percentile(v,5):.1f}–{np.percentile(v,95):.1f} | {100*(v>=84.3).mean():.0f}% |')
# single item C
single = sorted(((cidx(mad([q]), E), q) for q in QID), reverse=True)
P('\nЛучшие одиночные вопросы (in-sample, сам выбор — подгонка): ' + ', '.join(f'{q} {c:.1f}' for c, q in single[:8]))
P(f'Одиночных вопросов с C ≥ 75: {sum(c >= 75 for c, _ in single)}; с C ≥ 70: {sum(c >= 70 for c, _ in single)}; медиана одиночного: {np.median([c for c,_ in single]):.1f}')

# --- normative
P('\n## G. Нормативный профиль и «отличительное сходство»\n')
allids = sorted(A); M = np.nanmean(np.array([A[i] for i in allids]), axis=0)
norm = {i: np.corrcoef(*[x[~np.isnan(A[i])] for x in (A[i], M)])[0, 1] for i in allids}
NS = np.array([norm[m] + norm[w] for m, w in K])
P(f'Нормативность персонажа r(ответы, средний профиль 92 персонажей): медиана {np.median(list(norm.values())):.2f}, диапазон {min(norm.values()):.2f}–{max(norm.values()):.2f}')
P(f'Средняя корреляция профилей двух случайных персонажей (все 120 комбинаций): {pcorr(QID).mean():.2f}; после вычитания среднего профиля: {pcorr(QID, center=M).mean():.2f}\n')
P('| предиктор | C ↔ эксперты | AUC A vs C | C внутри перекрёстных |'); P('|---|---|---|---|')
for nm, s in [('корреляция профилей, сырые ответы', pcorr(QID)), ('корреляция профилей, ответы − средний профиль (отличительное сходство)', pcorr(QID, center=M)),
              ('отличительное сходство, только блок отношений', pcorr(REL, center=M)), ('нормативность пары (сумма r с средним профилем) — без сравнения партнёров', NS), ('тест (прод)', T)]:
    P(f'| {nm} | {cidx(s, E):.1f} | {auc(s, typ=="A", typ=="C"):.0f} | {cidx(s[X], E[X]):.1f} |')
rT = stats.spearmanr(T, NS)[0]; res = T - np.polyval(np.polyfit(NS, T, 1), NS)
P(f'\nСвязь теста с нормативностью пары: Spearman {rT:.2f}. C-index теста после вычитания линейной части нормативности: {cidx(res, E):.1f} (было {cidx(T, E):.1f}).')
# test score of each person vs "average persona"
Mvec = M.copy()
avgp = {i: score_vec(A[i], np.round(Mvec)) for i in allids}
AP = np.array([avgp[m] + avgp[w] for m, w in K])
P(f'Совместимость каждого с «усреднённым персонажем» (та же формула), сумма по паре: C ↔ эксперты {cidx(AP, E):.1f}; Spearman с тестом {stats.spearmanr(AP, T)[0]:.2f}.')

# --- noise
P('\n## H. Чувствительность к шуму\n')
dT = np.abs(T[:, None] - T[None, :]); dE = np.abs(E[:, None] - E[None, :]); U = np.triu(np.ones((n, n), bool), 1) & (dE > 0)
tot = U.sum()
P('| |Δтест| | доля сравнений | C в этой группе |'); P('|---|---|---|')
for lo, hi in [(0, 1), (1, 2), (2, 5), (5, 10), (10, 101)]:
    m = U & (dT >= lo) & (dT < hi)
    P(f'| {lo}–{hi} п. | {100*m.sum()/tot:.1f}% ({m.sum()}) | {cidx(T, E, mask=m):.1f} |')
P(f'\n1 п.п. C-index = {tot/100:.0f} сравнений; одна комбинация участвует в ~{2*tot/n:.0f} сравнениях (≈{2*tot/n/tot*100:.1f} п.п. C).')
for sd in [1, 2, 3, 5]:
    v = [cidx(T + rng.normal(0, sd, n), E) for _ in range(300)]
    P(f'Гауссов шум SD={sd} п. к итоговому проценту: C = {np.mean(v):.1f} ± {np.std(v):.1f}')
# answer noise
P('\nШум в ответах (каждый ответ + округлённый N(0,σ), обрезка 0–10; имитация перепрохождения теста):\n')
P('| σ ответа | средний |Δ процента| пары | C (среднее ± SD) | доля сравнений, сменивших порядок | тест-ретест Spearman по 120 комбинациям |'); P('|---|---|---|---|---|---|')
for sig in [0.5, 1.0, 1.5]:
    cs, dd, fl, rr = [], [], [], []
    for _ in range(60):
        An = {i: np.where(np.isnan(v), np.nan, np.clip(np.round(v + rng.normal(0, sig, len(v))), 0, 10)) for i, v in A.items()}
        Tn = np.array([score(m, w, An) for m, w in K])
        cs.append(cidx(Tn, E)); dd.append(np.abs(Tn - T).mean())
        sT = np.sign(T[:, None] - T[None, :]); sN = np.sign(Tn[:, None] - Tn[None, :]); fl.append(((sT != sN) & U).sum() / tot)
        rr.append(stats.spearmanr(T, Tn)[0])
    P(f'| {sig} | {np.mean(dd):.1f} п. | {np.mean(cs):.1f} ± {np.std(cs):.1f} | {100*np.mean(fl):.1f}% | {np.mean(rr):.3f} |')
P(f'\nРасхождение экспертов между собой: средняя |эксп1 − эксп2| = {np.abs(e1-e2).mean():.1f} п., ничьих у среднего экспертов: {(np.triu(np.ones((n,n)),1)*(np.abs(E[:,None]-E[None,:])==0)).sum():.0f} из {n*(n-1)//2} пар (исключаются из C).')

# --- D set
P('\n## I. Пары D (совпадают планы, плохая динамика)\n')
Dr = [r for r in S['rows'] if r['set'] == 'judge-d.json']; dj1, dj2 = J('judge-d.json'), J('judge-d-b.json')
TD = np.array([r['rel'] for r in Dr]); ED = np.array([(dj1[(r['man'], r['woman'])]['couple'] + dj2[(r['man'], r['woman'])]['couple']) / 2 for r in Dr])
E1D = np.array([dj1[(r['man'], r['woman'])]['couple'] for r in Dr]); E2D = np.array([dj2[(r['man'], r['woman'])]['couple'] for r in Dr])
intD = np.array([r['man'][1:-1] == r['woman'][1:-1] for r in Dr])
P(f'40 комбинаций: C тест↔эксперты {cidx(TD, ED):.1f}, эксперт↔эксперт {cidx(E1D, E2D):.1f}; только 16 задуманных D-пар: тест {cidx(TD[intD], ED[intD]):.1f}, эксперты {cidx(E1D[intD], E2D[intD]):.1f}')
P(f'Задуманные D-пары: тест в среднем {TD[intD].mean():.1f}%, эксперты {ED[intD].mean():.1f}; A-пары: тест {T[typ=="A"].mean():.1f}, эксперты {E[typ=="A"].mean():.1f}')
AD = np.concatenate([T[typ == 'A'], TD[intD]]); lab = np.r_[np.ones((typ == 'A').sum()), np.zeros(intD.sum())]
P(f'AUC «A выше D» по тесту: {auc(AD, lab == 1, lab == 0):.0f}; по экспертам: {auc(np.concatenate([E[typ=="A"], ED[intD]]), lab == 1, lab == 0):.0f}')
open('out-audit2.md', 'w').write('\n'.join(out))
