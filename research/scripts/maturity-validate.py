# Проверка на свежих парах p47–p58 по предрегистрации (research/maturity-preregistration.md). Формула — из maturity-graded.py без изменений.
import json, itertools, re
D = '/Users/arkady.vasilenko/projects/compatibility-test/research/synthetic/'
src = open('/Users/arkady.vasilenko/projects/compatibility-test/research/scripts/maturity-graded.py').read()
ns = {}
exec('import json\n' + re.search(r"def g\(.*?(?=rows=\[\])", src, re.S).group(0), ns)
feats = ns['feats']; A = lambda i: json.load(open(D + f'answers/{i}.json'))
tot = lambda f: sum(f[k] for k in ['pw', 'aa', 'sl', 'es', 'bx', 'bw'])
base = json.load(open(D + 'base-percent-v.json'))
P = {(p['man']['id'], p['woman']['id']): p for p in json.load(open(D + 'personas-v.json'))['pairs']}
j1 = json.load(open(D + 'judge-v.json'))['ratings']; j2 = {(r['man'], r['woman']): r['couple'] for r in json.load(open(D + 'judge-v-b.json'))['ratings']}
rows = [dict(k=(r['man'], r['woman']), e1=r['couple'], e2=j2[(r['man'], r['woman'])], e=(r['couple'] + j2[(r['man'], r['woman'])]) / 2,
             b=base[r['man'] + '|' + r['woman']], risk=tot(feats(A(r['man']), A(r['woman']))), p=P[(r['man'], r['woman'])]) for r in j1]
def ci(s, e=lambda r: r['e']):
    ok = n = 0
    for x, y in itertools.combinations(rows, 2):
        de = e(x) - e(y)
        if not de: continue
        dx = s(x) - s(y); ok += .5 if dx == 0 else (1 if (dx > 0) == (de > 0) else 0); n += 1
    return round(100 * ok / n, 1), n
for r in sorted(rows, key=lambda r: -r['e']):
    print(f"{r['k'][0]:5} {r['p']['type']:3} {r['p']['severity']:6} эксп {r['e1']:3}/{r['e2']:3}  процент {r['b']:5.1f}  риск {r['risk']:.2f}  {r['p']['dynamic'][:50]}")
print('\nэксперт1↔эксперт2:', ci(lambda r: r['e1'], lambda r: r['e2']))
for p in [0, 0.08, 0.15]: print(f'p={p}: со средним экспертов {ci(lambda r: r["b"] * (1 - p * r["risk"]))}, э1 {ci(lambda r: r["b"] * (1 - p * r["risk"]), lambda r: r["e1"])[0]}, э2 {ci(lambda r: r["b"] * (1 - p * r["risk"]), lambda r: r["e2"])[0]}')
print('только риск (минус):', ci(lambda r: -r['risk']))
