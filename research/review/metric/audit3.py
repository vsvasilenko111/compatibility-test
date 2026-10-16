# Честная оценка выигрыша от подбора весов сфер: разбиение по ЛЮДЯМ (мужчины и женщины делятся пополам независимо),
# обучение — комбинации, где оба человека из обучающих половин; проверка — оба из проверочных; смешанные выброшены.
import numpy as np, json
from audit_lib import *
SPL = sorted(set(SPH)); sidx = {s: i for i, s in enumerate(SPL)}
# per combo per sphere sums [numA,sumA,numB,sumB]
C4 = np.zeros((n, len(SPL), 4))
for c, (m, w) in enumerate(K):
    a, b = A[m], A[w]; ok = ~np.isnan(a) & ~np.isnan(b)
    wa, wb = IW[imp(np.nan_to_num(a))], IW[imp(np.nan_to_num(b))]
    fa, fb = fitf(np.nan_to_num(a), np.nan_to_num(b)), fitf(np.nan_to_num(b), np.nan_to_num(a))
    for q in np.where(ok)[0]:
        s = sidx[SPH[q]]; C4[c, s] += [wa[q] * fa[q], wa[q], wb[q] * fb[q], wb[q]]
def sc(wv, idx):
    t = C4[idx] * wv[None, :, None]; s = t.sum(1); return np.sqrt(s[:, 0] / s[:, 1] * s[:, 2] / s[:, 3])
prod = np.array([RW[s] for s in SPL]); eq = np.ones(len(SPL))
assert np.allclose(sc(prod, np.arange(n)) * 100, T)
GRID = [0, .05, .15, .4, 1]
def tune(idx):
    w = np.ones(len(SPL)); best = cidx(sc(w, idx), E[idx])
    for _ in range(2):
        for s in range(len(SPL)):
            for g in GRID:
                w2 = w.copy(); w2[s] = g
                if w2.sum() == 0: continue
                c = cidx(sc(w2, idx), E[idx])
                if c > best + 1e-9: best, w = c, w2
    return w, best
FIVE = [QID.index(q) for q in ['kids-02', 'kids-08', 'living-01', 'living-03', 'values-04']]
five = np.array([-np.nanmean(np.abs(A[m][FIVE] - A[w][FIVE])) for m, w in K])
wall, ball = tune(np.arange(n))
print(f'Жадный подбор весов на ВСЕХ 120 (in-sample): C = {ball:.1f}  (прод-веса {cidx(T,E):.1f}, равные {cidx(sc(eq,np.arange(n)),E):.1f})')
res = []
for it in range(150):
    hm = rng.permutation(len(men)) < len(men) // 2; hw = rng.permutation(len(wom)) < len(wom) // 2
    tr = np.where(hm[mi] & hw[wi])[0]; te = np.where(~hm[mi] & ~hw[wi])[0]
    if len(tr) < 15 or len(te) < 15: continue
    w, b = tune(tr)
    res.append((b, cidx(sc(w, te), E[te]), cidx(sc(eq, te), E[te]), cidx(sc(prod, te), E[te]), cidx(five[te], E[te]), len(tr), len(te)))
r = np.array(res)
print(f'{len(r)} разбиений; в среднем обучающих {r[:,5].mean():.0f}, проверочных {r[:,6].mean():.0f} комбинаций')
for i, nm in enumerate(['подбор, на обучении (in-sample)', 'подбор → на проверке', 'равные веса на проверке', 'прод-веса на проверке (ВНИМАНИЕ: подобраны на всех данных)', '5 вопросов на проверке']):
    print(f'  {nm}: среднее {np.nanmean(r[:,i]):.1f}, 10–90 перц. {np.nanpercentile(r[:,i],10):.1f}–{np.nanpercentile(r[:,i],90):.1f}')
d = r[:, 1] - r[:, 2]
print(f'  выигрыш подбора над равными весами на проверке: {np.nanmean(d):+.1f} п.п.; лучше в {100*np.mean(d>0):.0f}% разбиений, хуже в {100*np.mean(d<0):.0f}%')
print(f'  оптимизм (обучение − проверка): {np.nanmean(r[:,0]-r[:,1]):+.1f} п.п.')
json.dump(r.tolist(), open('cv-persons.json', 'w'))
