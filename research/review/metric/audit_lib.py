import json, numpy as np, os
from scipy import stats
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))
D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/'
S = json.load(open(os.path.join(HERE, 'scores.json')))
QS = S['qs']; QID = [q['id'] for q in QS]; SPH = np.array([q['sphere'] for q in QS])
RW = dict(kids=1, living=1, budget=1, relatives=1, space=1, values=1, home=1, career=1, roles=.4, money=.4, intimacy=.4, leisure=.15, rhythm=.15, loyalty=.15, humor=.15, conflicts=.05, honesty=.05)
SW = np.array([RW.get(s, 1) for s in SPH])
J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(D + f))['ratings']}
j1, j2 = J('judge30.json'), J('judge30b.json')
types = {x['man']['id']: x['type'] for x in json.load(open(D + 'personas30.json'))['pairs']}
rows = [r for r in S['rows'] if r['set'] == 'judge30.json']
K = [(r['man'], r['woman']) for r in rows]; n = len(K)
e1 = np.array([j1[k]['couple'] for k in K], float); e2 = np.array([j2[k]['couple'] for k in K], float); E = (e1 + e2) / 2
T = np.array([r['rel'] for r in rows])
num = lambda pid: int(pid[1:-1])
typ = np.array([types[m] if num(m) == num(w) else 'X' for m, w in K])
men = sorted({m for m, _ in K}); wom = sorted({w for _, w in K})
mi = np.array([men.index(m) for m, _ in K]); wi = np.array([wom.index(w) for _, w in K])
A = {}
for f in os.listdir(D + 'answers'):
    r = json.load(open(D + 'answers/' + f)); A[f[:-5]] = np.array([np.nan if (q not in r or r[q] < 0) else r[q] for q in QID], float)
IW = np.array([0, 1, 10, 50.])
def imp(v): k = np.abs(v - 5); return np.where(k >= 4, 3, np.where(k >= 2, 2, 1))
def fitf(own, oth):
    same = (own - 5) * (oth - 5) > 0
    return np.maximum(0, 1 - np.abs(own - oth) * np.where(same, .5, 1) / 6)
def score_vec(a, b, eq=False):
    ok = ~np.isnan(a) & ~np.isnan(b); a, b = a[ok], b[ok]; k = np.ones(ok.sum()) if eq else SW[ok]
    wa, wb = IW[imp(a)] * k, IW[imp(b)] * k
    sa = (wa * fitf(a, b)).sum() / wa.sum() if wa.sum() else 1; sb = (wb * fitf(b, a)).sum() / wb.sum() if wb.sum() else 1
    return 100 * np.sqrt(sa * sb)
def score(m, w, Ans, eq=False): return score_vec(Ans[m], Ans[w], eq)
def cidx(t, e, w=None, mask=None, wdiff=False):
    t = np.asarray(t, float); e = np.asarray(e, float)
    st = np.sign(t[:, None] - t[None, :]); se = np.sign(e[:, None] - e[None, :])
    W = np.triu(np.ones((len(t), len(t))), 1)
    if w is not None: W = W * np.outer(w, w)
    if mask is not None: W = W * mask
    if wdiff: W = W * np.abs(e[:, None] - e[None, :])
    valid = (se != 0) * W
    if valid.sum() == 0: return np.nan
    return 100 * (valid * ((st * se > 0) + 0.5 * (st == 0))).sum() / valid.sum()
def boot(fn, B=1000):
    v = []
    for _ in range(B):
        cm = np.bincount(rng.integers(0, len(men), len(men)), minlength=len(men)); cw = np.bincount(rng.integers(0, len(wom), len(wom)), minlength=len(wom))
        v.append(fn((cm[mi] * cw[wi]).astype(float)))
    v = np.array(v); return np.nanpercentile(v, [2.5, 97.5]), v
def auc(x, pos, neg):
    a, b = x[pos], x[neg]; return 100 * np.mean([(u > v) + 0.5 * (u == v) for u in a for v in b])
