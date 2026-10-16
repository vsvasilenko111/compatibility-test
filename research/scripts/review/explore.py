import json, numpy as np
from variants import *
NEW = {f[:-5]: load(F + 'answers/' + f) for f in os.listdir(F + 'answers')}
J = lambda f: {(r['man'], r['woman']): r for r in json.load(open(F + f))['ratings']}
ja, jb, jt = J('judge-a.json'), J('judge-b.json'), J('judge-t.json'); js = {**J('sim-1.json'), **J('sim-2.json')}
P = {(p['man']['id'], p['woman']['id']): p for p in json.load(open(F + 'personas-v.json'))['pairs']}
for k, p in sorted(P.items(), key=lambda kv: -(ja[kv[0]]['couple'] + jb[kv[0]]['couple'] + jt[kv[0]]['couple'])):
    v = variants(NEW[k[0]][0], NEW[k[0]][1], NEW[k[1]][0], NEW[k[1]][1])
    s = js[k]
    print(f"{p['pair']} {p['design']:10} V0 {v['V0 текущий']:4.0f} риск {risk(NEW[k[0]][0], NEW[k[1]][0]):.2f} | A {ja[k]['couple']:3} B {jb[k]['couple']:3} T {jt[k]['couple']:3} S {s['together']:3}/{s['satM']}/{s['satW']}")
    if p['design'] == 'средняя': print('   замысел:', p['rationale'][:260]); print('   T:', jt[k]['why'][:200])
