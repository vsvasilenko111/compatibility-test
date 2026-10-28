"""Главная метрика теста на рабочей части слепой выборки (design.md, 7, 13.3, 15.3, 16.10, 17.5, 17.7, 17.14 п. 5, 17.16).

Запуск из корня проекта (после `npx vite-node research/blind/score_pairs.ts`):
    python3 research/blind/metric_eval.py
Читает: metric/scores.json (балл теста, код приложения), private/pairs.json, outcome.json, outcome-ensemble.json,
outcome-ensemble-structural.json, benchmarks.json, leak-threshold.json — и сразу оставляет только пары рабочей части
(`part == "work"`). sealed/ не читается, `seal.py --open` не вызывается: проверочная часть сюда не попадает.
Выход: metric/metric-06.json — только агрегаты; вклад сфер и согласие ансамблей — private/metric-06-private.json (метрики, интервалы, сравнения). Ни коэффициентов формулы исхода, ни
весов факторов, ни исходов или риска отдельных пар в выходе и в stdout нет.

Знак. Балл выше — пара «лучше», риск выше — пара хуже. Везде печатается ρ = Spearman(балл, −риск): 0 — угадывание,
1 — полное согласие с риском по скелету; так же ориентирован потолок самоотчёта (Spearman(риск по самоотчёту, риск по
скелету)). AUC — балл против распада (ниже балл — выше риск), c-index — против месяца распада.

Бутстрэп — по людям рабочей части (design.md, 7): люди с возвращением, вес пары — произведение кратностей двоих;
4 000 повторов; зерно — SeedSequence(20261028).spawn(27)[26] (новый поток после 26 имён blindlib.SEED_NAMES;
blindlib.py не меняется, чтобы не трогать хеш кода исхода, 17.14 п. 7).
"""
import json
import os
import sys

import numpy as np
from scipy.stats import rankdata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
from outcome import wauc_strat  # noqa: E402

N_BOOT = 4000
N_PERM = 2000
N_VDRAW = 1000
MIS_KEYS = ("kids", "drink", "rel")   # «дети, пьянство, религиозность» (design.md, 7); дети = жёсткое или мягкое
RAKE_FAIL = []   # повторы, где доли не подогнались (нет дополнительных пар с несовпадением) — печатается доля
OUT = os.path.join(B.ROOT, "metric", "metric-06.json")
# закрытое (критик 06, п. 1): вклад сфер и согласие вариантов ансамбля с центральной формулой — подсказка об устройстве
# формулы исхода; владельцу теста — только словами в отчёте, числа — в private/
OUT_PRIV = os.path.join(B.PRIV, "metric-06-private.json")


def rng_metric():
    ss = np.random.SeedSequence(B.MASTER_SEED).spawn(len(B.SEED_NAMES) + 1)[len(B.SEED_NAMES)]
    return np.random.default_rng(ss)


def rake(is_real, F, base, iters=200):
    """Веса пар: настоящие — base; дополнительные — base, подогнанные (raking) так, чтобы их взвешенная доля каждого
    несовпадения из MIS_KEYS равнялась доле у настоящих (с теми же кратностями). Тогда и во всей части доля та же."""
    w = base.astype(float).copy()
    alt = ~is_real
    if base[is_real].sum() == 0 or base[alt].sum() == 0:
        return w
    target = {k: np.average(F[k][is_real], weights=base[is_real]) for k in MIS_KEYS}
    for _ in range(iters):
        worst = 0.0
        for k in MIS_KEYS:
            f = F[k] & alt
            tot = w[alt].sum()
            cur = w[f].sum() / tot if tot > 0 else 0
            t = target[k]
            worst = max(worst, abs(cur - t))
            if 0 < cur < 1:
                w[f] *= t / cur
                w[alt & ~F[k]] *= (1 - t) / (1 - cur)
            elif cur == 0 and t > 0:
                pass   # нет дополнительных пар с этим несовпадением — подогнать нельзя (печатается как недосягаемо)
        if worst < 1e-10:
            break
    if worst > 1e-6:
        RAKE_FAIL.append(worst)
    return w


def wranks(x, wt):
    """Взвешенные средние ранги: ранг = сумма весов меньших значений + половина веса равных (сдвиг на константу
    на корреляцию не влияет). Для целых кратностей — то же, что средние ранги размноженной выборки."""
    order = np.argsort(x, kind="mergesort")
    xs, ws = x[order], wt[order]
    r = np.empty(len(x))
    i = 0
    cum = 0.0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] == xs[i]:
            j += 1
        wsum = ws[i:j + 1].sum()
        r[order[i:j + 1]] = cum + wsum / 2
        cum += wsum
        i = j + 1
    return r


def wspear(x, z, wt):
    """Взвешенный Spearman: ранги считаются внутри набора с весом > 0 и с этими весами, затем взвешенный Пирсон
    (критик 06, п. 5: прежняя outcome.wspear брала ранги по всем парам без весов)."""
    keep = wt > 0
    x, z, wv = np.asarray(x, float)[keep], np.asarray(z, float)[keep], wt[keep]
    a, b = wranks(x, wv), wranks(z, wv)
    a = a - np.average(a, weights=wv)
    b = b - np.average(b, weights=wv)
    den = np.sqrt(np.sum(wv * a * a) * np.sum(wv * b * b))
    return float(np.sum(wv * a * b) / den) if den > 0 else np.nan


def rho(score, risk, wt):
    return wspear(score, -risk, wt)


def cindex_month(score, month, broke, wt):
    """Harrell c: пара с меньшим баллом должна распасться раньше. Оставшиеся вместе — цензура на 36 мес."""
    t = np.where(broke, month, 37.0)
    num = den = 0.0
    for i in np.where(broke)[0]:
        later = t > t[i]
        if not later.any():
            continue
        ww = wt[i] * wt[later]
        d = score[later] - score[i]
        num += np.sum(ww * ((d > 0) + 0.5 * (d == 0)))
        den += np.sum(ww)
    return num / den if den > 0 else np.nan


def pct(a, q):
    a = np.asarray(a, float)
    a = a[~np.isnan(a)]
    return float(np.percentile(a, q))


def ci(a):
    return [round(pct(a, 2.5), 4), round(pct(a, 97.5), 4)]


def main():
    B.check_versions()
    S = B.load(os.path.join(B.ROOT, "metric", "scores.json"))
    sc = {(r["man"], r["woman"]): r for r in S["pairs"]}
    spheres = S["meta"]["spheres"]

    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    oc = B.load(os.path.join(B.PRIV, "outcome.json"))
    ens = B.load(os.path.join(B.PRIV, "outcome-ensemble.json"))
    est = B.load(os.path.join(B.PRIV, "outcome-ensemble-structural.json"))
    bm = B.load(os.path.join(B.PRIV, "benchmarks.json"))
    lt = B.load(os.path.join(B.PRIV, "leak-threshold.json"))
    assert oc["meta"]["pairs_sha256"] == B.sha256(os.path.join(B.PRIV, "pairs.json"))
    assert ens["meta"]["outcome_sha256"] == B.sha256(os.path.join(B.PRIV, "outcome.json"))
    assert lt["outcome_sha256"] == B.sha256(os.path.join(B.PRIV, "outcome.json"))

    # ---- только рабочая часть: всё остальное отбрасывается сразу
    work = [p for p in pj["pairs"] if p["part"] == "work"]
    ids = [p["pair_id"] for p in work]
    o_by = {o["pair_id"]: o for o in oc["outcomes"]}
    O = [o_by[i] for i in ids]
    col = lambda pid_list: [pid_list.index(i) for i in ids]
    ens_risk = np.array(ens["risk_logit_skeleton"])[:, col(ens["pair_ids"])]
    est_risk = np.array(est["risk_logit_skeleton"])[:, col(est["pair_ids"])]
    self_risk = np.array(bm["selfreport_formula"])[col(bm["pair_ids"])]
    est_names = est["variants"]
    assert est_risk.shape[0] == len(est_names) == 24 and ens_risk.shape[0] == 30
    del pj, oc, ens, est, bm, o_by

    n = len(work)
    m_id = np.array([p["man"] for p in work])
    w_id = np.array([p["woman"] for p in work])
    ppl = np.unique(np.concatenate([m_id, w_id]))
    pos = {x: i for i, x in enumerate(ppl)}
    mi = np.array([pos[x] for x in m_id])
    wi = np.array([pos[x] for x in w_id])
    is_real = np.array([p["type"] == "real" for p in work])
    stage = np.array([B.STAGES.index(p["stage"]) for p in work])
    risk = np.array([o["risk_logit_skeleton"] for o in O])
    broke = np.array([not o["together_3y"] for o in O])
    p_break = np.array([1 - o["p_together_3y"] for o in O])
    month = np.array([o["breakup_month"] or 37 for o in O], float)
    csi = np.array([o["satisfaction_csi4"] if o["satisfaction_csi4"] is not None else np.nan for o in O], float)
    F = {k: np.array([k in o["mismatches"] for o in O]) for k in ("drink", "rel")}
    F["kids"] = np.array([("kids_hard" in o["mismatches"]) or ("kids_soft" in o["mismatches"]) for o in O])
    del O

    def getsc(key, sub=None):
        out = []
        for m, w in zip(m_id, w_id):
            r = sc[(m, w)]
            v = r[key] if sub is None else r[key][sub]
            out.append(np.nan if v is None else v)
        return np.array(out, float)

    X = {"prio": getsc("score"), "noprio": getsc("score_no_prio")}
    # calibrate() монотонна; на рабочей части нет ни обрезки 0/100, ни совпадений — ранги те же (проверка, не вариант)
    xc = getsc("score_calibrated")
    # (одна ничья из-за округления до 1e-4 в scores.json допустима)
    assert 0 < xc.min() and xc.max() < 100 and np.corrcoef(rankdata(xc), rankdata(X["prio"]))[0, 1] > 0.9999, \
        "calibrate() меняет ранги — разобрать"
    for v in X.values():
        assert not np.isnan(v).any()

    rng = rng_metric()
    boots = [np.bincount(rng.integers(0, len(ppl), len(ppl)), minlength=len(ppl)) for _ in range(N_BOOT)]
    mult = [(c[mi] * c[wi]).astype(float) for c in boots]
    ones = np.ones(n)
    w_main = rake(is_real, F, ones)
    assert not RAKE_FAIL, "веса главной строки не подогнались"
    w_main_b = [rake(is_real, F, mm) for mm in mult]
    rake_fail_share = len(RAKE_FAIL) / N_BOOT

    rows = {"all_weighted": (np.ones(n, bool), True), "all_unweighted": (np.ones(n, bool), False),
            "real": (is_real, False), "alt": (~is_real, False)}

    def wts(row, b=None):
        mk, weighted = rows[row]
        base = (w_main if b is None else w_main_b[b]) if weighted else (ones if b is None else mult[b])
        return np.where(mk, base, 0.0)

    def stat_row(f, row, need=10):
        pt = f(wts(row))
        bs = []
        for b in range(N_BOOT):
            wt = wts(row, b)
            if (wt > 0).sum() < need:
                continue
            bs.append(f(wt))
        return pt, np.array(bs)

    res = {"meta": {"generator": "research/blind/metric_eval.py", "scores_meta": S["meta"], "n_pairs_work": n,
                    "n_real": int(is_real.sum()), "n_alt": int((~is_real).sum()), "n_people_work": len(ppl),
                    "n_boot": N_BOOT, "n_perm": N_PERM, "lib_versions": B.lib_versions(),
                    "outcome_sha256": B.sha256(os.path.join(B.PRIV, "outcome.json")),
                    "scores_sha256": B.sha256(os.path.join(B.ROOT, "metric", "scores.json")),
                    "note": "только агрегаты рабочей части; ρ = Spearman(балл, −риск по скелету)"}}

    # ---- 1. главная метрика: дважды (16.10), по строкам раздела 7
    main = {}
    boot_main = {}
    for var in ("prio", "noprio"):
        main[var] = {}
        for row in rows:
            pt, bs = stat_row(lambda wt: rho(X[var], risk, wt), row)
            main[var][row] = {"rho": round(pt, 4), "ci95": ci(bs), "n_boot_ok": len(bs)}
            if row == "all_weighted":
                boot_main[var] = bs
    # разница «с важными сферами − без» (парный бутстрэп по тем же людям)
    diff = {}
    for row in rows:
        f = lambda wt: rho(X["prio"], risk, wt) - rho(X["noprio"], risk, wt)
        pt, bs = stat_row(f, row)
        diff[row] = {"delta": round(pt, 4), "ci95": ci(bs)}
    res["main"] = main
    res["prio_minus_noprio"] = diff
    # проверка весов: доли несовпадений после raking
    res["weights_check"] = {k: {"real": round(float(F[k][is_real].mean()), 3),
                                "alt_raw": round(float(F[k][~is_real].mean()), 3),
                                "alt_weighted": round(float(np.average(F[k][~is_real], weights=w_main[~is_real])), 3)}
                            for k in MIS_KEYS}
    res["weights_check"]["boot_reps_not_raked_share"] = round(rake_fail_share, 4)
    res["weights_check"]["effective_n_alt"] = round(float(w_main[~is_real].sum() ** 2 / (w_main[~is_real] ** 2).sum()), 1)

    # ---- 2. ориентиры: потолок самоотчёта, порог утечки, случайный балл
    ceil = {}
    for row in rows:
        pt, bs = stat_row(lambda wt: wspear(-self_risk, -risk, wt), row)
        ceil[row] = {"rho": round(pt, 4), "ci95": ci(bs)}
    res["selfreport_ceiling"] = ceil
    res["leak_threshold_recorded_work"] = {
        "selfreport_ceiling_spearman": lt["thresholds"]["work"]["MAIN_selfreport_ceiling_spearman_vs_skeleton_risk"],
        "leak_threshold_spearman": lt["thresholds"]["work"]["MAIN_leak_threshold_spearman"],
        "selfreport_ceiling_auc": lt["thresholds"]["work"]["selfreport_ceiling_auc"],
        "leak_threshold_auc": lt["thresholds"]["work"]["leak_threshold_auc"],
        "selfreport_ceiling_auc_expected_over_V": lt["thresholds"]["work"]["selfreport_ceiling_auc_expected_over_V"]}
    # случайный балл: те же ответы, перемешанные между людьми внутри пола (рабочая часть) — распределение ρ при нуле
    men_w = np.unique(m_id)
    wom_w = np.unique(w_id)
    rp = np.random.default_rng(np.random.SeedSequence(B.MASTER_SEED).spawn(len(B.SEED_NAMES) + 2)[-1])
    perm = {"prio": [], "noprio": []}
    for _ in range(N_PERM):
        pm = dict(zip(men_w, rp.permutation(men_w)))
        pw = dict(zip(wom_w, rp.permutation(wom_w)))
        for var, key in (("prio", "score"), ("noprio", "score_no_prio")):
            xs = np.array([sc[(pm[m], pw[w])][key] for m, w in zip(m_id, w_id)], float)
            perm[var].append(rho(xs, risk, w_main))
    res["random_score"] = {var: {"mean": round(float(np.mean(v)), 4), "range95": ci(v),
                                 "p_one_sided": round(float((np.sum(np.array(v) >= main[var]["all_weighted"]["rho"]) + 1)
                                                            / (len(v) + 1)), 4)}
                           for var, v in perm.items()}
    res["random_score_note"] = ("справка, в плане не записано: перестановка людей внутри пола — нулевое распределение при "
                                "тех же людях; вывод делается по бутстрэпу по людям (раздел 7)")
    res["truth_answers"] = ("не считается: в плане (design.md 7, 5.7, 17) вариант «тест по правде» не записан, и ответов D "
                            "по «правде» нет — D отвечал только по самоописанию; ближайший ориентир — потолок самоотчёта "
                            "(формула исхода по самоотчёту) и оракул по скелету (ρ = 1 по построению).")

    # ---- 3. ансамбли (17.7): основной 30 и другого устройства 24 — точечные ρ главной строки
    priv_agree = {}

    def ens_summary(R, label, names=None):
        out = {}
        for var in ("prio", "noprio"):
            vals = np.array([rho(X[var], R[j], w_main) for j in range(R.shape[0])])
            d = {"min": round(float(vals.min()), 4), "median": round(float(np.median(vals)), 4),
                 "max": round(float(vals.max()), 4)}
            if names:
                d["by_variant"] = {nm: round(float(v), 4) for nm, v in zip(names, vals)}
            out[var] = d
        # согласие вариантов с центральным риском (насколько по-разному они ранжируют пары)
        ag = np.array([wspear(R[j], risk, w_main) for j in range(R.shape[0])])
        priv_agree[label] = {"min": round(float(ag.min()), 4), "median": round(float(np.median(ag)), 4)}
        return out
    res["ensemble_main_30"] = ens_summary(ens_risk, "main_30")
    res["ensemble_structural_24"] = ens_summary(est_risk, "structural_24", est_names)

    # ---- 4. вспомогательные (раздел 7): AUC по распаду с расслоением по стадии, AUC по 1000 перетяжек V,
    # c-index по месяцу распада, ρ с CSI-4 у оставшихся вместе
    aux = {}
    for var in ("prio", "noprio"):
        x = -X[var]   # выше — рискованнее
        a = {}
        pt, bs = stat_row(lambda wt: wauc_strat(broke, x, wt, stage), "all_weighted")
        a["auc_breakup_strat"] = {"auc": round(pt, 4), "ci95": ci(bs)}
        pt, bs = stat_row(lambda wt: wauc_strat(broke, x, wt, stage), "all_unweighted")
        a["auc_breakup_strat_unweighted"] = {"auc": round(pt, 4), "ci95": ci(bs)}
        rv = np.random.default_rng(np.random.SeedSequence(B.MASTER_SEED).spawn(len(B.SEED_NAMES) + 3)[-1])
        av = [wauc_strat(rv.random(n) < p_break, x, w_main, stage) for _ in range(N_VDRAW)]
        a["auc_expected_over_V"] = {"auc": round(float(np.nanmean(av)), 4), "range95_over_V": ci(av)}
        pt, bs = stat_row(lambda wt: cindex_month(X[var], month, broke, wt), "all_weighted")
        a["cindex_month"] = {"c": round(pt, 4), "ci95": ci(bs)}
        tog = ~broke & ~np.isnan(csi)
        pt, bs = stat_row(lambda wt: wspear(X[var][tog], csi[tog], wt[tog]), "all_weighted")
        a["rho_csi4_together"] = {"rho": round(pt, 4), "ci95": ci(bs), "n": int(tog.sum())}
        aux[var] = a
    # ориентир для AUC: потолок самоотчёта и «оракул по скелету» на тех же весах
    aux["selfreport_ceiling_auc_weighted"] = round(wauc_strat(broke, self_risk, w_main, stage), 4)
    aux["oracle_skeleton_auc_weighted"] = round(wauc_strat(broke, risk, w_main, stage), 4)
    rv = np.random.default_rng(np.random.SeedSequence(B.MASTER_SEED).spawn(len(B.SEED_NAMES) + 3)[-1])
    draws = [rv.random(n) < p_break for _ in range(N_VDRAW)]
    aux["oracle_skeleton_auc_expected_over_V"] = round(float(np.nanmean([wauc_strat(d, risk, w_main, stage) for d in draws])), 4)
    aux["selfreport_auc_expected_over_V"] = round(float(np.nanmean([wauc_strat(d, self_risk, w_main, stage) for d in draws])), 4)
    aux["n_breakups_work"] = int(broke.sum())
    res["auxiliary"] = aux

    # ---- 5. сферы: ρ балла одной сферы и вклад сферы (ρ полного − ρ без сферы, парный бутстрэп); без весов исхода
    sph = {}
    for s in spheres:
        xs = getsc("sphere", s)
        d = {}
        ok = ~np.isnan(xs)
        d["rho_sphere_alone"] = round(rho(xs[ok], risk[ok], w_main[ok]), 4)
        for var, key in (("prio", "drop_sphere"), ("noprio", "drop_sphere_no_prio")):
            xd = getsc(key, s)
            full = X[var]
            pt, bs = stat_row(lambda wt: rho(full, risk, wt) - rho(xd, risk, wt), "all_weighted")
            d[f"contribution_{var}"] = {"delta": round(pt, 4), "ci95": ci(bs)}
        sph[s] = d
    with open(OUT_PRIV, "w", encoding="utf-8") as f:
        json.dump({"note": "ЗАКРЫТО: вклад сфер теста в главную метрику и согласие вариантов ансамбля с центральной "
                           "формулой (рабочая часть). Владельцу теста — только словами (reviews/06-metric.md).",
                   "spheres": sph, "ensemble_agreement_with_central": priv_agree}, f, ensure_ascii=False, indent=1)
        f.write("\n")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
        f.write("\n")
    mw = main["noprio"]["all_weighted"]
    mp = main["prio"]["all_weighted"]
    print(f"рабочая часть: {n} пар; ρ без важных сфер {mw['rho']} {mw['ci95']}, с важными {mp['rho']} {mp['ci95']}; "
          f"→ {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
