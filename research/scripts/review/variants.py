# Сравнение вариантов подсчёта (см. preregistration.md). Запуск: python3 variants.py [old|fresh]
import json, sys, os, numpy as np
from scipy import stats
rng = np.random.default_rng(11)
R = '/Users/arkady.vasilenko/projects/compatibility-test/'
D = R + 'research/synthetic/'
F = R + 'research/synthetic/fresh/'
bank = json.load(open(R + 'src/questions/bank.json')); man = json.load(open(R + 'src/questions/manifest.json'))
Q = {q['id']: q for q in bank['questions']}
IDS = [i for i in man[str(bank['version'])] if Q[i]['block'] != 'maturity' and Q[i].get('scored', True) is not False]
SPH = np.array([Q[i]['sphere'] for i in IDS])
RW = dict(kids=1, living=1, budget=1, relatives=1, space=1, values=1, home=1, career=1, roles=.4, money=.4, intimacy=.4,
          leisure=.15, rhythm=.15, loyalty=.15, humor=.15, conflicts=.05, honesty=.05)
SW = np.array([RW[s] for s in SPH])
FIVE = [IDS.index(q) for q in ['kids-02', 'kids-08', 'living-01', 'living-03', 'values-04']]
IW = np.array([0, 1, 10, 50.])

def load(path):
    r = json.load(open(path))
    return r, np.array([np.nan if r.get(q, -1) < 0 else r[q] for q in IDS], float)
OLD = {f[:-5]: load(D + 'answers/' + f) for f in os.listdir(D + 'answers')}
MU = np.nanmean(np.array([v for _, v in OLD.values()]), axis=0)

def imp(v): k = np.abs(v - 5); return np.where(k >= 4, 3, np.where(k >= 2, 2, 1))
def fitf(o, t):
    same = (o - 5) * (t - 5) > 0
    return np.maximum(0, 1 - np.abs(o - t) * np.where(same, .5, 1) / 6)
def sim(a, b, wa, wb):
    ok = ~np.isnan(a) & ~np.isnan(b); a, b, wa, wb = a[ok], b[ok], wa[ok], wb[ok]
    sa = (wa * fitf(a, b)).sum() / wa.sum() if wa.sum() else 1
    sb = (wb * fitf(b, a)).sum() / wb.sum() if wb.sum() else 1
    return 100 * np.sqrt(sa * sb)
def ex(x): return 0 if x is None or x < 0 else max(0, (x - 5) / 5)
def risk(x, y):
    g = lambda v, k: v.get(k, -1)
    def d(x, y):
        av = np.mean([g(y, 'attach-02'), g(y, 'attach-03')])
        return [min(ex(g(x, 'regul-03')), ex(g(y, 'regul-04'))), min(ex(g(x, 'attach-01')), ex(av)),
                min(ex(g(x, 'trauma-06')), max(ex(g(y, 'regul-04')), ex(g(y, 'attach-02')))), min(ex(g(x, 'trauma-05')), ex(g(y, 'regul-01')))]
    return sum(map(max, d(x, y), d(y, x))) + min(ex(g(x, 'regul-01')), ex(g(y, 'regul-01'))) + min(ex(g(x, 'regul-04')), ex(g(y, 'regul-04')))
def gate(a, b):
    n = sum(1 for i in FIVE if not np.isnan(a[i]) and not np.isnan(b[i]) and abs(a[i] - b[i]) >= 6)
    return 1 - 0.15 * n
def corr(a, b):
    ok = ~np.isnan(a) & ~np.isnan(b); return np.corrcoef(a[ok], b[ok])[0, 1]
def expw(raw):
    return np.array([raw.get('imp:' + s, np.nan) / 10 for s in SPH])

def variants(ra, a, rb, b):
    flat = np.ones(len(IDS)) * SW
    v1 = sim(a, b, flat, flat)
    out = {
        'V0 текущий': sim(a, b, IW[imp(a)] * SW, IW[imp(b)] * SW),
        'V1 плоская важность': v1,
        'V3 пять ключевых': -np.nanmean(np.abs(a[FIVE] - b[FIVE])),
        'V4 стоп-факторы': v1 * gate(a, b),
    }
    out['V5 V0 + риск динамики'] = out['V0 текущий'] * (1 - 0.08 * risk(ra, rb))
    out['V6 комбинированный'] = v1 * gate(a, b) * (1 - 0.08 * risk(ra, rb))
    out['V7 корреляция'] = corr(a, b)
    out['V8 отличительное'] = corr(a - MU, b - MU)
    if 'imp:kids' in ra and 'imp:kids' in rb:
        out['V2 явная важность'] = sim(a, b, expw(ra), expw(rb))
    return out

def cidx(t, e, mask=None):
    t, e = np.asarray(t, float), np.asarray(e, float)
    st = np.sign(t[:, None] - t[None, :]); se = np.sign(e[:, None] - e[None, :])
    W = np.triu(np.ones((len(t), len(t))), 1) * (se != 0)
    if mask is not None: W = W * mask
    if W.sum() == 0: return np.nan
    return 100 * (W * ((st * se > 0) + .5 * (st == 0))).sum() / W.sum()
def boot(t, e, K, B=2000):
    men = sorted({m for m, _ in K}); wom = sorted({w for _, w in K})
    mi = np.array([men.index(m) for m, _ in K]); wi = np.array([wom.index(w) for _, w in K]); v = []
    for _ in range(B):
        cm = np.bincount(rng.integers(0, len(men), len(men)), minlength=len(men)); cw = np.bincount(rng.integers(0, len(wom), len(wom)), minlength=len(wom))
        w = (cm[mi] * cw[wi]).astype(float); v.append(cidx(t, e, np.outer(w, w)))
    return np.nanpercentile(v, [2.5, 97.5])
def auc(x, pos, neg): return 100 * np.mean([(u > v) + .5 * (u == v) for u in x[pos] for v in x[neg]])
def rank(x): return stats.rankdata(x) / len(x)

def run(K, crit, ans, design=None):
    rows = [variants(ans[m][0], ans[m][1], ans[w][0], ans[w][1]) for m, w in K]
    names = list(rows[0].keys())
    print(f'\nкритерии ↔ друг с другом (C-index): ' + ', '.join(f'{x}↔{y} {cidx(crit[x], crit[y]):.1f}' for i, x in enumerate(crit) for y in list(crit)[i + 1:]))
    res = {}
    for n in names:
        t = np.array([r[n] for r in rows]); res[n] = t
        line = f'{n:24}' + ' '.join(f'{c} {cidx(t, e):5.1f}' for c, e in crit.items())
        main = list(crit)[-1]; lo, hi = boot(t, crit[main], K)
        line += f' | {main} ДИ {lo:.0f}–{hi:.0f} τ {stats.kendalltau(t, crit[main]).statistic:.2f}'
        if design is not None:
            des = np.array([design.get(k) is not None for k in K]); m = np.outer(des, des)
            mid = np.array([design.get(k) == 'средняя' for k in K])
            line += f' | задуманные {cidx(t, crit[main], m):5.1f} средние {cidx(t, crit[main], np.outer(mid, mid)):5.1f}'
            line += f' AUC крепк/пробл {auc(t, np.array([design.get(k) == "крепкая" for k in K]), np.array([design.get(k) == "проблемная" for k in K])):5.1f}'
        print(line)
    return res

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'old'
    if which == 'old':
        J = lambda f: {(r['man'], r['woman']): r['couple'] for r in json.load(open(D + f))['ratings']}
        a, b = J('judge30.json'), J('judge30b.json'); K = list(a)
        E = np.array([(a[k] + b[k]) / 2 for k in K])
        print('СТАРЫЕ 120 пар (на них всё подбиралось)'); run(K, {'E': E}, OLD)
        a, b = J('judge-d.json'), J('judge-d-b.json'); K = list(a)
        print('\nПАРЫ D (40 комбинаций)'); run(K, {'E': np.array([(a[k] + b[k]) / 2 for k in K])}, OLD)
    else:
        NEW = {f[:-5]: load(F + 'answers/' + f) for f in os.listdir(F + 'answers')}
        J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(F + f))['ratings']}
        ja, jb, jt = J('judge-a.json'), J('judge-b.json'), J('judge-t.json'); js = {**J('sim-1.json'), **J('sim-2.json')}
        K = [(c['man'], c['woman']) for c in json.load(open(F + 'combos.json'))]
        E = np.array([(ja[k]['couple'] + jb[k]['couple']) / 2 for k in K]); T = np.array([jt[k]['couple'] for k in K])
        S = np.array([js[k]['together'] / 100 * (js[k]['satM'] + js[k]['satW']) / 20 for k in K])
        ALL = (rank(E) + rank(T) + rank(S)) / 3
        print('эксперт A ↔ эксперт B:', round(cidx([ja[k]['couple'] for k in K], [jb[k]['couple'] for k in K]), 1),
              '| pf A↔B:', round(cidx([ja[k]['pf'] for k in K], [jb[k]['pf'] for k in K]), 1))
        design = {(p['man']['id'], p['woman']['id']): p['design'] for p in json.load(open(F + 'personas-v.json'))['pairs']}
        print('СВЕЖИЕ 60 комбинаций'); run(K, {'E': E, 'T': T, 'S': S, 'ALL': ALL}, NEW, design)
