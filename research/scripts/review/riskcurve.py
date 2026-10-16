import json, numpy as np
from variants import *
NEW = {f[:-5]: load(F + 'answers/' + f) for f in os.listdir(F + 'answers')}
J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(F + f))['ratings']}
ja, jb, jt = J('judge-a.json'), J('judge-b.json'), J('judge-t.json'); js = {**J('sim-1.json'), **J('sim-2.json')}
K = [(c['man'], c['woman']) for c in json.load(open(F + 'combos.json'))]
E = np.array([(ja[k]['couple'] + jb[k]['couple']) / 2 for k in K]); T = np.array([jt[k]['couple'] for k in K])
S = np.array([js[k]['together'] / 100 * (js[k]['satM'] + js[k]['satW']) / 20 for k in K]); ALL = (rank(E) + rank(T) + rank(S)) / 3
PF = np.array([(ja[k]['pf'] + jb[k]['pf']) / 2 for k in K])
design = {(p['man']['id'], p['woman']['id']): p['design'] for p in json.load(open(F + 'personas-v.json'))['pairs']}
des = np.array([design.get(k) is not None for k in K]); mid = np.array([design.get(k) == 'средняя' for k in K])
base = np.array([sim(NEW[m][1], NEW[w][1], IW[imp(NEW[m][1])] * SW, IW[imp(NEW[w][1])] * SW) for m, w in K])
rk = np.array([risk(NEW[m][0], NEW[w][0]) for m, w in K])
print('риск сам по себе (минус): ALL', round(cidx(-rk, ALL), 1), 'T', round(cidx(-rk, T), 1), '| у 20 задуманных', round(cidx(-rk, ALL, np.outer(des, des)), 1))
for p in [0, .05, .08, .1, .15, .2, .3]:
    t = base * (1 - p * rk)
    print(f'p={p:<4} E {cidx(t,E):5.1f} T {cidx(t,T):5.1f} S {cidx(t,S):5.1f} ALL {cidx(t,ALL):5.1f} | задуманные {cidx(t,ALL,np.outer(des,des)):5.1f} средние {cidx(t,ALL,np.outer(mid,mid)):5.1f}')
# «Партнёр как друг»
FW = dict(humor=1, leisure=1, rhythm=1, loyalty=1, honesty=1, money=1, conflicts=1, values=3, roles=1, space=1, home=1, relatives=1)
fw = np.array([FW.get(s, 0) for s in SPH]); blk = np.array([Q[i]['block'] == 'friendship' for i in IDS]).astype(float)
for name, wv in [('текущий pf (веса FRIENDSHIP)', fw), ('только блок дружбы, поровну', blk)]:
    t = np.array([sim(NEW[m][1], NEW[w][1], IW[imp(NEW[m][1])] * wv, IW[imp(NEW[w][1])] * wv) for m, w in K])
    lo, hi = boot(t, PF, K); print(f'{name:30} pf↔эксперты {cidx(t, PF):5.1f} (ДИ {lo:.0f}–{hi:.0f})')
print('pf: эксперт A ↔ B', round(cidx([ja[k]['pf'] for k in K], [jb[k]['pf'] for k in K]), 1))
