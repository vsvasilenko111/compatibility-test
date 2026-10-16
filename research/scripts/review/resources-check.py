# «Ресурсы пары»: уровень навыков (среднее двоих) против оценок свежих пар. rel-v9-fresh.json — проценты v9 по combos.json (выгрузка compare()).
import json, numpy as np, itertools, os
D='/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/'; F=D+'fresh/'
DIM = {
 'спор': ['regul-01','regul-07','conflicts-02'],
 'остыть': ['regul-02','regul-06'],
 'мириться': ['regul-08','reflect-01','reflect-02'],
 'опора': ['attach-01','attach-03','reflect-03'],
}
DIM['всё'] = sorted(set(sum(DIM.values(), [])))
def person(a, ids):
    v=[a[i] for i in ids if a.get(i,-1)>=0]; return 1-np.mean(v)/10 if v else np.nan
def cidx(t,e):
    n=c=0
    for i,j in itertools.combinations(range(len(t)),2):
        if e[i]==e[j]: continue
        n+=1; s=np.sign(t[i]-t[j])*np.sign(e[i]-e[j]); c+= 1 if s>0 else .5 if s==0 else 0
    return 100*c/n
rd=lambda f:{(r['man'],r['woman']):r for r in json.load(open(f))['ratings']}
K=[(c['man'],c['woman']) for c in json.load(open(F+'combos.json'))]
ja,jb,jt=rd(F+'judge-a.json'),rd(F+'judge-b.json'),rd(F+'judge-t.json'); js={**rd(F+'sim-1.json'),**rd(F+'sim-2.json')}
E=[(ja[k]['couple']+jb[k]['couple'])/2 for k in K]; T=[jt[k]['couple'] for k in K]; S=[js[k]['together']/100*(js[k]['satM']+js[k]['satW'])/20 for k in K]
A={f[:-5]:json.load(open(F+'answers/'+f)) for f in os.listdir(F+'answers')}
for agg in ['mean','min']:
  for d,ids in DIM.items():
    r=[]
    for m,w in K:
        x,y=person(A[m],ids),person(A[w],ids); r.append((x+y)/2 if agg=='mean' else min(x,y))
    print(agg, d, f'E {cidx(r,E):.1f} T {cidx(r,T):.1f} S {cidx(r,S):.1f}')
# распределение личных уровней по старым+свежим
O={f[:-5]:json.load(open(D+'answers/'+f)) for f in os.listdir(D+'answers')}
for d,ids in DIM.items():
    v=[person(a,ids) for a in list(O.values())+list(A.values())]; print(d, np.round(np.percentile(v,[10,25,50,75,90]),2))
rel=json.load(open(os.path.dirname(os.path.abspath(__file__)) + '/../../review/rel-v9-fresh.json'))
from scipy.stats import rankdata
res=[ (person(A[m],DIM['всё'])+person(A[w],DIM['всё']))/2 for m,w in K]
ALL=(rankdata(E)+rankdata(T)+rankdata(S))/3
print('%% планов: E %.1f T %.1f S %.1f ALL %.1f'%(cidx(rel,E),cidx(rel,T),cidx(rel,S),cidx(rel,ALL)))
print('ресурсы:  E %.1f T %.1f S %.1f ALL %.1f'%(cidx(res,E),cidx(res,T),cidx(res,S),cidx(res,ALL)))
print('corr', np.corrcoef(rankdata(rel),rankdata(res))[0,1])
for wt in [.2,.33,.5]:
    c=(1-wt)*rankdata(rel)+wt*rankdata(res); print('смесь',wt,'E %.1f T %.1f S %.1f ALL %.1f'%(cidx(c,E),cidx(c,T),cidx(c,S),cidx(c,ALL)))
