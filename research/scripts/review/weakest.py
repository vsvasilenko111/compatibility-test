# Постфактум (после просмотра свежих данных): «слабое звено». Параметры выбираются ТОЛЬКО по старым 120 парам, свежие — проверка.
import json, numpy as np
from variants import *
KEYS = [s for s in RW if RW[s] >= 0.4]
def sph_scores(a, b):
    out = []
    for s in KEYS:
        m = SPH == s
        out.append(sim(a[m], b[m], IW[imp(a[m])], IW[imp(b[m])]))
    return np.array(out)
def weak(ra, a, rb, b, alpha, k, p):
    base = sim(a, b, IW[imp(a)] * SW, IW[imp(b)] * SW)
    low = np.sort(sph_scores(a, b))[:k].mean()
    return base ** (1 - alpha) * max(low, 1) ** alpha * (1 - p * risk(ra, rb))
J0 = lambda f: {(r['man'], r['woman']): r['couple'] for r in json.load(open(D + f))['ratings']}
a0, b0 = J0('judge30.json'), J0('judge30b.json'); K0 = list(a0); E0 = np.array([(a0[k] + b0[k]) / 2 for k in K0])
ad, bd = J0('judge-d.json'), J0('judge-d-b.json'); KD = list(ad); ED = np.array([(ad[k] + bd[k]) / 2 for k in KD])
NEW = {f[:-5]: load(F + 'answers/' + f) for f in os.listdir(F + 'answers')}
J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(F + f))['ratings']}
ja, jb, jt = J('judge-a.json'), J('judge-b.json'), J('judge-t.json'); js = {**J('sim-1.json'), **J('sim-2.json')}
K = [(c['man'], c['woman']) for c in json.load(open(F + 'combos.json'))]
E = np.array([(ja[k]['couple'] + jb[k]['couple']) / 2 for k in K]); T = np.array([jt[k]['couple'] for k in K])
S = np.array([js[k]['together'] / 100 * (js[k]['satM'] + js[k]['satW']) / 20 for k in K]); ALL = (rank(E) + rank(T) + rank(S)) / 3
design = {(p['man']['id'], p['woman']['id']): p['design'] for p in json.load(open(F + 'personas-v.json'))['pairs']}
mid = np.array([design.get(k) == 'средняя' for k in K]); des = np.array([design.get(k) is not None for k in K])
res = []
for alpha in [0, .2, .35, .5, .7]:
    for k in [1, 2, 3]:
        for p in [0, .08, .15]:
            sc = lambda KK, A: np.array([weak(A[m][0], A[m][1], A[w][0], A[w][1], alpha, k, p) for m, w in KK])
            res.append((alpha, k, p, cidx(sc(K0, OLD), E0), cidx(sc(KD, OLD), ED), sc(K, NEW)))
res.sort(key=lambda r: -(r[3] + r[4]))
print('α  k  p    | старые120 D40 | свежие: ALL  задуманные средние')
for alpha, k, p, o, d, t in res[:8] + [r for r in res if r[0] == 0 and r[2] == 0][:1]:
    print(f'{alpha:<4} {k} {p:<5}| {o:5.1f} {d:5.1f} | {cidx(t, ALL):5.1f} {cidx(t, ALL, np.outer(des, des)):5.1f} {cidx(t, ALL, np.outer(mid, mid)):5.1f}')
best = res[0]; lo, hi = boot(best[5], ALL, K); print('лучший по старым:', best[:3], f'свежие ALL ДИ {lo:.0f}–{hi:.0f}')
