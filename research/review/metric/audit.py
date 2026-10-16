import json, numpy as np, itertools, sys
from scipy import stats
rng = np.random.default_rng(20261016)
D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/'
S = json.load(open('scores.json'))
QS = S['qs']; QID = [q['id'] for q in QS]
J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(D + f))['ratings']}
j1, j2, p1, p2, d1, d2 = J('judge30.json'), J('judge30b.json'), J('judge30-pf.json'), J('judge30b-pf.json'), J('judge30-dyn.json'), J('judge30b-dyn.json')
types = {x['man']['id']: x['type'] for x in json.load(open(D + 'personas30.json'))['pairs']}
rows = [r for r in S['rows'] if r['set'] == 'judge30.json']
K = [(r['man'], r['woman']) for r in rows]
n = len(K)
e1 = np.array([j1[k]['couple'] for k in K], float); e2 = np.array([j2[k]['couple'] for k in K], float); E = (e1 + e2) / 2
pf = np.array([(p1[k]['pf'] + p2[k]['pf']) / 2 for k in K]); pf1 = np.array([p1[k]['pf'] for k in K]); pf2 = np.array([p2[k]['pf'] for k in K])
dy = np.array([(d1[k]['couple'] + d2[k]['couple']) / 2 for k in K])
T = np.array([r['rel'] for r in rows]); TF = np.array([r['fr'] for r in rows]); T0 = np.array([r['relNoSkip'] for r in rows]); TEQ = np.array([r['relEqual'] for r in rows])
num = lambda pid: int(pid[1:-1])
typ = np.array([types[m] if num(m) == num(w) else 'X' for m, w in K])
men = sorted({m for m, _ in K}); wom = sorted({w for _, w in K})
mi = np.array([men.index(m) for m, _ in K]); wi = np.array([wom.index(w) for _, w in K])
out = []
def P(*a):
    s = ' '.join(str(x) for x in a); print(s); out.append(s)

def cidx(t, e, w=None, mask=None, wdiff=False):
    t = np.asarray(t, float); e = np.asarray(e, float)
    st = np.sign(t[:, None] - t[None, :]); se = np.sign(e[:, None] - e[None, :])
    W = np.triu(np.ones((len(t), len(t))), 1)
    if w is not None: W = W * np.outer(w, w)
    if mask is not None: W = W * mask
    if wdiff: W = W * np.abs(e[:, None] - e[None, :])
    valid = (se != 0) * W
    sc = (st * se > 0) + 0.5 * (st == 0)
    return np.nan if valid.sum()==0 else 100 * (valid * sc).sum() / valid.sum()

def boot(fn, B=2000, mode='persons'):
    v = []
    for _ in range(B):
        if mode == 'persons':
            cm = np.bincount(rng.integers(0, len(men), len(men)), minlength=len(men))
            cw = np.bincount(rng.integers(0, len(wom), len(wom)), minlength=len(wom))
            w = cm[mi] * cw[wi]
        else:
            w = np.bincount(rng.integers(0, n, n), minlength=n)
        v.append(fn(w.astype(float)))
    v = np.array(v); return np.nanpercentile(v, [2.5, 97.5]), v

def ci_line(name, t, e, B=2000):
    c = cidx(t, e)
    (lp, hp), _ = boot(lambda w: cidx(t, e, w), B, 'pairs')
    (lc, hc), vc = boot(lambda w: cidx(t, e, w), B, 'persons')
    P(f'| {name} | {c:.1f} | {lp:.1f}–{hp:.1f} | {lc:.1f}–{hc:.1f} | ±{(hc-lc)/2:.1f} |')
    return c

P('## A. C-index и 95% ДИ: наивный бутстрэп по комбинациям vs кластерный (мужчины и женщины ресэмплируются независимо, 2000 повторов)\n')
P('| сравнение | C, % | ДИ по парам | ДИ по людям | полуширина |'); P('|---|---|---|---|---|')
ci_line('тест ↔ среднее двух экспертов (отношения)', T, E)
ci_line('тест ↔ эксперт 1', T, e1); ci_line('тест ↔ эксперт 2', T, e2)
ci_line('эксперт 1 ↔ эксперт 2 (потолок)', e1, e2)
ci_line('тест (как в cindex.ts: −1 не пропуск) ↔ среднее', T0, E)
ci_line('тест (все сферы с весом 1) ↔ среднее', TEQ, E)
ci_line('партнёр-как-друг: тест ↔ среднее', TF, pf)
ci_line('партнёр-как-друг: эксперт 1 ↔ эксперт 2', pf1, pf2)
ci_line('тест ↔ эксперты «с динамикой» (среднее)', T, dy)
# paired difference: tuned vs equal, test vs ceiling
_, v1 = boot(lambda w: cidx(T, E, w) - cidx(TEQ, E, w), 2000)
P(f'\nРазница «подобранные веса − равные веса» (на тех же данных): {cidx(T,E)-cidx(TEQ,E):+.1f} п.п., кластерный ДИ {np.percentile(v1,2.5):+.1f}…{np.percentile(v1,97.5):+.1f}')
_, v2 = boot(lambda w: (cidx(e1, e2, w) - (cidx(T, e1, w) + cidx(T, e2, w)) / 2), 2000)
P(f'Разрыв «потолок − тест↔одиночный эксперт»: {cidx(e1,e2)-(cidx(T,e1)+cidx(T,e2))/2:+.1f} п.п., кластерный ДИ {np.percentile(v2,2.5):+.1f}…{np.percentile(v2,97.5):+.1f}')

# B. decomposition by type
P('\n## B. Разложение по типам\n')
P('Средние оценки по типам (эксперты / тест):\n'); P('| тип | n | эксперты, среднее | эксперты, мин–макс | тест, среднее | тест, мин–макс |'); P('|---|---|---|---|---|---|')
for t in 'ABCX':
    m = typ == t; P(f'| {t} | {m.sum()} | {E[m].mean():.1f} | {E[m].min():.0f}–{E[m].max():.0f} | {T[m].mean():.1f} | {T[m].min():.0f}–{T[m].max():.0f} |')
P('\nC-index по подмножествам (сравнения только внутри подмножества):\n'); P('| подмножество | комбинаций | сравнений (без ничьих эксперта) | C тест↔эксперты | C эксперт1↔эксперт2 | ДИ по людям (тест) |'); P('|---|---|---|---|---|---|')
def sub(name, m):
    idx = np.where(m)[0]; t, e = T[idx], E[idx]
    ncmp = int(sum(1 for i, j in itertools.combinations(range(len(idx)), 2) if e[i] != e[j]))
    c = cidx(t, e); cc = cidx(e1[idx], e2[idx])
    (lo, hi), _ = boot(lambda w: cidx(t, e, w[idx]) if (w[idx] > 0).sum() > 2 else np.nan, 1000)
    P(f'| {name} | {len(idx)} | {ncmp} | {c:.1f} | {cc:.1f} | {lo:.1f}–{hi:.1f} |')
sub('все', np.ones(n, bool))
sub('только задуманные (A+B+C)', typ != 'X'); sub('только A', typ == 'A'); sub('только A+B', np.isin(typ, ['A','B'])); sub('только B+C', np.isin(typ, ['B','C']))
sub('только перекрёстные (X)', typ == 'X')
sub('эксперты 30–70 («трудная середина»)', (E >= 30) & (E <= 70))
sub('эксперты 20–80', (E >= 20) & (E <= 80))
sub('эксперты < 50', E < 50)
sub('перекрёстные, эксперты 30–70', (typ == 'X') & (E >= 30) & (E <= 70))
# share of comparisons by category
P('\nВклад категорий сравнений во «все» (C-index 84%):\n'); P('| категория сравнения | доля сравнений | C в категории |'); P('|---|---|---|')
cat = {}
for i, j in itertools.combinations(range(n), 2):
    if E[i] == E[j]: continue
    a, b = sorted([typ[i], typ[j]]); key = a + '–' + b
    dt = T[i] - T[j]; de = E[i] - E[j]; s = 0.5 if dt == 0 else float((dt > 0) == (de > 0))
    cat.setdefault(key, []).append(s)
tot = sum(len(v) for v in cat.values())
for k, v in sorted(cat.items(), key=lambda kv: -len(kv[1])): P(f'| {k} | {100*len(v)/tot:.1f}% ({len(v)}) | {100*np.mean(v):.1f} |')
# by |Δexpert|
P('\nC-index по величине разницы экспертов |ΔE|:\n'); P('| ΔE | доля сравнений | C тест | C эксп1↔эксп2 (по тем же парам) |'); P('|---|---|---|---|')
dE = np.abs(E[:, None] - E[None, :]); U = np.triu(np.ones((n, n)), 1)
for lo, hi in [(0.1, 5), (5, 10), (10, 20), (20, 30), (30, 50), (50, 101)]:
    m = (dE > lo - 1e-9) & (dE <= hi) & (dE > 0) if lo > 0.1 else (dE > 0) & (dE <= hi)
    mm = m * U; share = mm.sum() / ((dE > 0) * U).sum()
    P(f'| {lo if lo>0.1 else 0}–{hi} | {100*share:.1f}% | {cidx(T, E, mask=m):.1f} | {cidx(e1, e2, mask=m):.1f} |')

# AUC of intended types
P('\n## C. AUC различения задуманных типов\n'); P('| контраст | AUC теста | AUC экспертов (среднее) |'); P('|---|---|---|')
def auc(x, pos, neg):
    a, b = x[pos], x[neg]; return 100 * np.mean([(u > v) + 0.5 * (u == v) for u in a for v in b])
for nm, pos, neg in [('A vs C', typ == 'A', typ == 'C'), ('A vs B', typ == 'A', typ == 'B'), ('B vs C', typ == 'B', typ == 'C'), ('A vs перекрёстные', typ == 'A', typ == 'X'), ('задуманные A vs все остальные', typ == 'A', typ != 'A')]:
    P(f'| {nm} | {auc(T,pos,neg):.1f} | {auc(E,pos,neg):.1f} |')

# Rank correlations
P('\n## D. Альтернативные меры согласия (тест ↔ среднее экспертов), кластерный ДИ\n'); P('| мера | значение | ДИ по людям | эксперт1↔эксперт2 |'); P('|---|---|---|---|')
def wspear(t, e, w):
    keep = w > 0; t2 = np.repeat(t, w.astype(int)); e2 = np.repeat(e, w.astype(int)); return stats.spearmanr(t2, e2)[0]
def wtau(t, e, w):
    t2 = np.repeat(t, w.astype(int)); e2 = np.repeat(e, w.astype(int)); return stats.kendalltau(t2, e2)[0]
def wpear(t, e, w):
    t2 = np.repeat(t, w.astype(int)); e2 = np.repeat(e, w.astype(int)); return np.corrcoef(t2, e2)[0, 1]
for nm, f in [('Kendall τ-b', wtau), ('Spearman ρ', wspear), ('Pearson r', wpear)]:
    v = f(T, E, np.ones(n)); (lo, hi), _ = boot(lambda w: f(T, E, w), 600); P(f'| {nm} | {v:.3f} | {lo:.3f}–{hi:.3f} | {f(e1, e2, np.ones(n)):.3f} |')
v = cidx(T, E, wdiff=True); (lo, hi), _ = boot(lambda w: cidx(T, E, w, wdiff=True), 1000)
P(f'| C-index, вес = |ΔE| | {v:.1f} | {lo:.1f}–{hi:.1f} | {cidx(e1,e2,wdiff=True):.1f} |')
# Kendall tau-b relation to C: tau≈2C-1 when no ties

# Calibration
P('\n## E. Калибровка (абсолютный уровень)\n')
sl, ic, r, _, _ = stats.linregress(T, E)
P(f'Средний тест {T.mean():.1f}% vs средний эксперт {E.mean():.1f}; SD теста {T.std():.1f} vs SD экспертов {E.std():.1f}')
P(f'Регрессия эксперты = {ic:.1f} + {sl:.2f}·тест (идеальная калибровка: 0 + 1.00·тест); MAE |тест − эксперты| = {np.abs(T-E).mean():.1f} п.; R² = {r*r:.2f}')
P('\n| тест в диапазоне | n | средний тест | средняя оценка экспертов |'); P('|---|---|---|---|')
for lo, hi in [(0, 40), (40, 50), (50, 60), (60, 70), (70, 80), (80, 101)]:
    m = (T >= lo) & (T < hi)
    if m.sum(): P(f'| {lo}–{hi} | {m.sum()} | {T[m].mean():.1f} | {E[m].mean():.1f} |')
cal = json.load(open(D + 'calibration.json'))
P(f'\n(calibration.json: перцентильная шкала по {cal["n"]} парам; это нормировка по рангу, а не калибровка к исходу.)')
json.dump({'T': T.tolist(), 'E': E.tolist(), 'typ': typ.tolist(), 'K': K}, open('core.json', 'w'))
open('out-audit.md', 'w').write('\n'.join(out))
