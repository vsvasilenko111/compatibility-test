import json, itertools
D='/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/'
J1=json.load(open(D+'judge-d.json'))['ratings']; J2={(r['man'],r['woman']):r['couple'] for r in json.load(open(D+'judge-d-b.json'))['ratings']}
P={(p['man']['id'],p['woman']['id']):p for p in json.load(open(D+'personas-d.json'))['pairs']}
A=lambda i: json.load(open(D+f'answers/{i}.json'))
def g(v,k): x=v.get(k,-1); return None if x<0 else x
def ex(x): return max(0,(x-5)/5) if x is not None else 0
def feats(a,b):
    def dir(x,y):
        av=sum(v for v in [g(y,'attach-02'),g(y,'attach-03')] if v is not None)/2
        return dict(pw=min(ex(g(x,'regul-03')),ex(g(y,'regul-04'))),
                    aa=min(ex(g(x,'attach-01')),ex(av)),
                    sl=min(ex(g(x,'trauma-06')),max(ex(g(y,'regul-04')),ex(g(y,'attach-02')))),
                    es=min(ex(g(x,'trauma-05')),ex(g(y,'regul-01'))))
    d1,d2=dir(a,b),dir(b,a)
    f={k:max(d1[k],d2[k]) for k in d1}
    f['bx']=min(ex(g(a,'regul-01')),ex(g(b,'regul-01')))       # оба вспыльчивые
    f['bw']=min(ex(g(a,'regul-04')),ex(g(b,'regul-04')))       # оба уходят
    f['bs']=min(ex(g(a,'reflect-03')),ex(g(b,'reflect-03')))   # оба молчат о чувствах
    f['rum']=max(ex(g(a,'regul-02')),ex(g(b,'regul-02')))
    return f
rows=[]
for r in J1:
    k=(r['man'],r['woman']); p=P.get(k)
    rows.append(dict(k=k,des=p is not None,kind=p['type'] if p else 'x',e=(r['couple']+J2[k])/2,f=feats(A(k[0]),A(k[1]))))
def ci(rs,s):
    ok=n=0
    for x,y in itertools.combinations(rs,2):
        de=x['e']-y['e']
        if not de: continue
        dx=s(x)-s(y); ok+=.5 if dx==0 else (1 if (dx>0)==(de>0) else 0); n+=1
    return round(100*ok/n,1)
des=[r for r in rows if r['des']]
print('признак: c-index внутри 16 задуманных (минус признак)')
for k in des[0]['f']: print(f'  {k:4} {ci(des,lambda r:-r["f"][k])}')
tot=lambda r:sum(r['f'][k] for k in ['pw','aa','sl','es','bx','bw'])
print('  сумма', ci(des,lambda r:-tot(r)))
for r in sorted(des,key=lambda r:-r['e']): print(f"  {r['k'][0]:5} {r['kind']:3} эксп {r['e']:5.1f} риск {tot(r):.2f}", {k:round(v,1) for k,v in r['f'].items() if v})

base=json.load(open('/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/base-percent.json'))
def load(f1,f2):
    a=json.load(open(D+f1))['ratings']; b={(r['man'],r['woman']):r['couple'] for r in json.load(open(D+f2))['ratings']}
    return [dict(k=(r['man'],r['woman']),e=(r['couple']+b[(r['man'],r['woman'])])/2,b=base[r['man']+'|'+r['woman']],f=feats(A(r['man']),A(r['woman'])),des=(r['man'],r['woman']) in P) for r in a]
sets={'D: 16 задуманных':[r for r in load('judge-d.json','judge-d-b.json') if r['des']],'D: все 40':load('judge-d.json','judge-d-b.json'),
      '120 старые эксп':load('judge30.json','judge30b.json'),'120 эксп-динамика':load('judge30-dyn.json','judge30b-dyn.json')}
print()
for p in [0,0.03,0.05,0.08,0.1,0.15,0.2]:
    print(f'p={p:<5}', ' | '.join(f'{n} {ci(rs,lambda r:r["b"]*(1-p*tot(r)) )}' for n,rs in sets.items()))
