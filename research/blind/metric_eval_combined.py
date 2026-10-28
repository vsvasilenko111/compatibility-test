"""Главная метрика теста на ОБЪЕДИНЁННОЙ рабочей части двух партий (design.md 18.6; правила — 7, 13.3, 15.3, 16.10,
17.7, 17.14 п. 5, 17.16; отчёт — reviews/07-metric-88.md).

Запуск из корня проекта (после score_pairs.ts для обеих партий НА БАНКЕ v16 — 18.6: та же версия теста, что в 06):
    python3 research/blind/metric_eval_combined.py
Читает: metric/scores.json и metric/b2-scores.json (балл теста, код приложения v16), private/pairs.json, outcome.json,
outcome-ensemble.json, outcome-ensemble-structural.json, benchmarks.json и их b2-копии, b2-leak-threshold.json — и сразу
оставляет только пары рабочей части (`part == "work"`). sealed/ и sealed/b2/ не читаются, `seal.py --open` не
вызывается. Из b2-leak-threshold.json берётся только `work_combined`.
Выход: metric/metric-07.json — только агрегаты; вклад сфер и согласие ансамблей — private/metric-07-private.json.
Ни коэффициентов формулы исхода, ни весов факторов, ни исходов или риска отдельных пар в выходе и в stdout нет.

Отличия от metric_eval.py (отчёт 06) — только то, что записано в 18.6:
- пары обеих партий (пары не пересекают партий); raking главной строки — к долям несовпадений у настоящих пар
  объединённой рабочей части;
- бутстрэп по людям СО СЛОЕМ «партия»: в каждом повторе люди рабочей части каждой партии тянутся с возвращением
  отдельно (столько же, сколько их в партии); вес пары — произведение кратностей; 4 000 повторов; зерно
  `metric_combined` (32-е имя, seed_tree()["metric_combined"]). Перестановки и перетяжки V (в плане зёрна для них не
  записаны) — дочерние зёрна того же: metric_combined.spawn(2) → [перестановки, перетяжки V];
- справочно: то же по каждой партии отдельно (raking — к настоящим парам своей партии) и разница «партия 2 − партия 1»
  на тех же повторах;
- случайный балл: ответы перемешиваются между людьми внутри пола И партии (балл есть только для пар внутри партии).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
import metric_eval as ME  # noqa: E402  (rake, wspear, rho, cindex_month, ci — те же функции, что в отчёте 06)
from outcome import wauc_strat  # noqa: E402

N_BOOT = 4000
N_PERM = 2000
N_VDRAW = 1000
MIS_KEYS = ME.MIS_KEYS
OUT = os.path.join(B.ROOT, "metric", "metric-07.json")
OUT_PRIV = os.path.join(B.PRIV, "metric-07-private.json")
BANK_REQUIRED = 16   # 18.6: банк v16, src/scoring/ коммита 035f4c0
MIN_BOOT_OK = 0.95   # критик 07, п. 1: если годных повторов меньше 95%, интервал не печатается (условный и смещённый)
METRIC_06 = os.path.join(B.ROOT, "metric", "metric-06.json")


def seed_combined():
    i = B.SEED_NAMES.index("metric_combined")
    assert i == 31
    return B.seed_tree()["metric_combined"]


def load_batch(b):
    pre = "" if b == 1 else "b2-"
    P = lambda f: os.path.join(B.PRIV, pre + f)
    S = B.load(os.path.join(B.ROOT, "metric", "scores.json" if b == 1 else "b2-scores.json"))
    assert int(S["meta"]["bank_version"]) == BANK_REQUIRED, f"партия {b}: балл посчитан не на банке v{BANK_REQUIRED}"
    pj, oc = B.load(P("pairs.json")), B.load(P("outcome.json"))
    ens, est, bm = B.load(P("outcome-ensemble.json")), B.load(P("outcome-ensemble-structural.json")), B.load(P("benchmarks.json"))
    assert oc["meta"]["pairs_sha256"] == B.sha256(P("pairs.json"))
    assert ens["meta"]["outcome_sha256"] == B.sha256(P("outcome.json"))
    assert est["meta"]["outcome_sha256"] == B.sha256(P("outcome.json"))
    work = [p for p in pj["pairs"] if p["part"] == "work"]          # проверочная часть отбрасывается сразу
    ids = [p["pair_id"] for p in work]
    o_by = {o["pair_id"]: o for o in oc["outcomes"]}
    O = [o_by[i] for i in ids]
    col = lambda lst: [lst.index(i) for i in ids]
    d = {
        "S": S, "work": work, "O": O,
        "ens": np.array(ens["risk_logit_skeleton"])[:, col(ens["pair_ids"])],
        "est": np.array(est["risk_logit_skeleton"])[:, col(est["pair_ids"])],
        "est_names": est["variants"],
        "self": np.array(bm["selfreport_formula"])[col(bm["pair_ids"])],
        "outcome_sha256": B.sha256(P("outcome.json")),
        "scores_sha256": B.sha256(os.path.join(B.ROOT, "metric", "scores.json" if b == 1 else "b2-scores.json")),
    }
    return d


def main():
    B.check_versions()
    D = {1: load_batch(1), 2: load_batch(2)}
    assert D[1]["est_names"] == D[2]["est_names"] and len(D[1]["est_names"]) == 24
    assert D[1]["ens"].shape[0] == D[2]["ens"].shape[0] == 30
    assert D[1]["S"]["meta"]["spheres"] == D[2]["S"]["meta"]["spheres"]
    assert D[1]["S"]["meta"]["bank_sha256"] == D[2]["S"]["meta"]["bank_sha256"]
    assert D[1]["S"]["meta"]["compare_sha256"] == D[2]["S"]["meta"]["compare_sha256"]
    spheres = D[1]["S"]["meta"]["spheres"]
    # версия теста = версия отчёта 06 (критик 07, п. 2): хеши банка, compare, spheres и файла баллов партии 1
    m06 = B.load(METRIC_06)["meta"]
    assert m06["scores_sha256"] == D[1]["scores_sha256"], "scores.json партии 1 не тот, что в отчёте 06"
    for b in (1, 2):
        for k in ("bank_version", "bank_sha256", "compare_sha256", "spheres_sha256", "scored_questions", "spheres"):
            assert D[b]["S"]["meta"][k] == m06["scores_meta"][k], f"партия {b}: {k} не как в отчёте 06"
    assert len(D[2]["S"]["meta"].get("src_tree_sha256", "")) == 64
    del m06
    est_names = D[1]["est_names"]
    lt = B.load(os.path.join(B.PRIV, "b2-leak-threshold.json"))
    assert lt["outcome_sha256"] == D[2]["outcome_sha256"] and lt["batch1_outcome_sha256"] == D[1]["outcome_sha256"]
    ltw = lt["thresholds"]["work_combined"]
    del lt

    work = D[1]["work"] + D[2]["work"]
    O = D[1]["O"] + D[2]["O"]
    batch = np.array([1] * len(D[1]["work"]) + [2] * len(D[2]["work"]))
    ens_risk = np.hstack([D[1]["ens"], D[2]["ens"]])
    est_risk = np.hstack([D[1]["est"], D[2]["est"]])
    self_risk = np.concatenate([D[1]["self"], D[2]["self"]])
    sc = {}
    for b in (1, 2):
        for r in D[b]["S"]["pairs"]:
            sc[(r["man"], r["woman"])] = r
    meta_scores = {b: {k: v for k, v in D[b]["S"]["meta"].items() if k != "note"} for b in (1, 2)}
    sha = {b: (D[b]["outcome_sha256"], D[b]["scores_sha256"]) for b in (1, 2)}
    del D

    n = len(work)
    m_id = np.array([p["man"] for p in work])
    w_id = np.array([p["woman"] for p in work])
    # люди: сначала партия 1, затем партия 2 (id партий не пересекаются)
    ppl_b = {b: np.unique(np.concatenate([m_id[batch == b], w_id[batch == b]])) for b in (1, 2)}
    assert not set(ppl_b[1]) & set(ppl_b[2])
    ppl = np.concatenate([ppl_b[1], ppl_b[2]])
    pos = {x: i for i, x in enumerate(ppl)}
    mi = np.array([pos[x] for x in m_id])
    wi = np.array([pos[x] for x in w_id])
    n1, n2 = len(ppl_b[1]), len(ppl_b[2])
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
    for v in X.values():
        assert not np.isnan(v).any()
    # calibrate() монотонна; проверка из 06 (критик 07, п. 6): на рабочей части каждой партии ранги те же
    from scipy.stats import rankdata
    xc = getsc("score_calibrated")
    for b in (1, 2):
        mk = batch == b
        assert 0 < xc[mk].min() and xc[mk].max() < 100 and \
            np.corrcoef(rankdata(xc[mk]), rankdata(X["prio"][mk]))[0, 1] > 0.9999, "calibrate() меняет ранги — разобрать"

    # ---- бутстрэп со слоем «партия» (18.6)
    rng = np.random.default_rng(seed_combined())
    boots = []
    for _ in range(N_BOOT):
        c1 = np.bincount(rng.integers(0, n1, n1), minlength=n1)
        c2 = np.bincount(rng.integers(0, n2, n2), minlength=n2)
        boots.append(np.concatenate([c1, c2]))
    mult = [(c[mi] * c[wi]).astype(float) for c in boots]
    ones = np.ones(n)

    # наборы пар: объединённая часть и каждая партия; raking — к настоящим парам своего набора
    scopes = {"combined": np.ones(n, bool), "batch1": batch == 1, "batch2": batch == 2}
    fail_share = {}
    w_main, w_main_b = {}, {}
    for sname, sm in scopes.items():
        ME.RAKE_FAIL.clear()
        w = np.zeros(n)
        w[sm] = ME.rake(is_real[sm], {k: F[k][sm] for k in MIS_KEYS}, ones[sm])
        assert not ME.RAKE_FAIL, f"веса главной строки не подогнались ({sname})"
        w_main[sname] = w
        wb = []
        for mm in mult:
            x = np.zeros(n)
            x[sm] = ME.rake(is_real[sm], {k: F[k][sm] for k in MIS_KEYS}, mm[sm])
            wb.append(x)
        w_main_b[sname] = wb
        fail_share[sname] = round(len(ME.RAKE_FAIL) / N_BOOT, 4)

    rows = {"all_weighted": (None, True), "all_unweighted": (None, False), "real": (is_real, False), "alt": (~is_real, False)}

    def wts(scope, row, b=None):
        mk, weighted = rows[row]
        sm = scopes[scope] if mk is None else scopes[scope] & mk
        if weighted:
            base = w_main[scope] if b is None else w_main_b[scope][b]
        else:
            base = ones if b is None else mult[b]
        return np.where(sm, base, 0.0)

    def stat(f, scope, row, need=10):
        pt = f(wts(scope, row))
        bs = np.full(N_BOOT, np.nan)
        for b in range(N_BOOT):
            wt = wts(scope, row, b)
            if (wt > 0).sum() >= need:
                bs[b] = f(wt)
        return pt, bs

    def summ(pt, bs, key="rho"):
        ok = int((~np.isnan(bs)).sum())
        d = {key: round(float(pt), 4), "ci95": ME.ci(bs) if ok >= MIN_BOOT_OK * N_BOOT else None, "n_boot_ok": ok}
        if d["ci95"] is None:
            d["ci95_conditional_biased"] = ME.ci(bs) if ok > 0 else None
        return d

    res = {"meta": {"generator": "research/blind/metric_eval_combined.py", "design": "18.6",
                    "scores_meta": meta_scores, "n_pairs_work": n,
                    "n_pairs_work_by_batch": {b: int((batch == b).sum()) for b in (1, 2)},
                    "n_real": int(is_real.sum()), "n_alt": int((~is_real).sum()),
                    "n_real_by_batch": {b: int((is_real & (batch == b)).sum()) for b in (1, 2)},
                    "n_people_work": len(ppl), "n_people_work_by_batch": {1: n1, 2: n2},
                    "n_boot": N_BOOT, "bootstrap": "по людям со слоем «партия» (18.6)", "seed": "metric_combined",
                    "n_perm": N_PERM, "n_vdraw": N_VDRAW, "lib_versions": B.lib_versions(),
                    "outcome_sha256": {b: sha[b][0] for b in (1, 2)}, "scores_sha256": {b: sha[b][1] for b in (1, 2)},
                    "note": "только агрегаты рабочих частей; ρ = Spearman(балл, −риск по скелету)"}}

    # ---- 1. главная метрика: дважды (16.10), строки раздела 7; объединённая и по партиям; разница партий
    main, boot_main = {}, {}
    for var in ("prio", "noprio"):
        main[var] = {}
        for scope in scopes:
            main[var][scope] = {}
            for row in rows:
                pt, bs = stat(lambda wt: ME.rho(X[var], risk, wt), scope, row)
                main[var][scope][row] = summ(pt, bs)
                boot_main[(var, scope, row)] = (pt, bs)
        main[var]["batch2_minus_batch1"] = {}
        for row in rows:
            p1, b1 = boot_main[(var, "batch1", row)]
            p2, b2 = boot_main[(var, "batch2", row)]
            main[var]["batch2_minus_batch1"][row] = summ(p2 - p1, b2 - b1, "delta")
    res["main"] = main
    # справка (критик 07, п. 5): ранги внутри партии (доля веса партии ниже значения), затем взвешенный Пирсон —
    # убирает разницу уровней между партиями; точечно, главная строка
    def within_rank(v, wt):
        r = np.zeros(n)
        for b in (1, 2):
            mk = (batch == b) & (wt > 0)
            r[mk] = ME.wranks(v[mk], wt[mk]) / wt[mk].sum()
        return r

    def wpearson(a, c, wt):
        a = a - np.average(a, weights=wt)
        c = c - np.average(c, weights=wt)
        return float(np.sum(wt * a * c) / np.sqrt(np.sum(wt * a * a) * np.sum(wt * c * c)))
    res["within_batch_ranks"] = {var: round(wpearson(within_rank(X[var], w_main["combined"]),
                                                      within_rank(-risk, w_main["combined"]), w_main["combined"]), 4)
                                 for var in ("prio", "noprio")}
    # разброс по партиям (агрегаты; риск — только отношение, без масштаба формулы)
    res["spread_by_batch"] = {
        "score_noprio_sd": {b: round(float(X["noprio"][batch == b].std()), 2) for b in (1, 2)},
        "risk_sd_ratio_batch2_to_batch1": round(float(risk[batch == 2].std() / risk[batch == 1].std()), 3),
        "risk_mean_higher_in_batch2": bool(risk[batch == 2].mean() > risk[batch == 1].mean()),
        "real_riskier_than_alt": {b: bool(risk[(batch == b) & is_real].mean() > risk[(batch == b) & ~is_real].mean())
                                  for b in (1, 2)}}
    diff = {}
    for scope in scopes:
        diff[scope] = {}
        for row in rows:
            pt, bs = stat(lambda wt: ME.rho(X["prio"], risk, wt) - ME.rho(X["noprio"], risk, wt), scope, row)
            diff[scope][row] = summ(pt, bs, "delta")
    res["prio_minus_noprio"] = diff
    wm = w_main["combined"]
    res["weights_check"] = {k: {"real": round(float(F[k][is_real].mean()), 3),
                                "alt_raw": round(float(F[k][~is_real].mean()), 3),
                                "alt_weighted": round(float(np.average(F[k][~is_real], weights=wm[~is_real])), 3)}
                            for k in MIS_KEYS}
    res["weights_check"]["boot_reps_not_raked_share"] = fail_share
    res["weights_check"]["effective_n_alt"] = round(float(wm[~is_real].sum() ** 2 / (wm[~is_real] ** 2).sum()), 1)
    res["weights_check"]["weight_share_batch2"] = round(float(wm[batch == 2].sum() / wm.sum()), 3)

    # ---- 2. ориентиры: потолок самоотчёта (те же веса), порог утечки (записан до текстов), случайный балл
    ceil = {}
    for scope in scopes:
        ceil[scope] = {}
        for row in ("all_weighted", "all_unweighted"):
            pt, bs = stat(lambda wt: ME.wspear(-self_risk, -risk, wt), scope, row)
            ceil[scope][row] = summ(pt, bs)
    res["selfreport_ceiling"] = ceil
    res["leak_threshold_recorded_work_combined"] = {
        "n_pairs": ltw["n_pairs"], "n_people": ltw["n_people"],
        "selfreport_ceiling_spearman": ltw["MAIN_selfreport_ceiling_spearman_vs_skeleton_risk"],
        "leak_threshold_spearman": ltw["MAIN_leak_threshold_spearman"],
        "selfreport_ceiling_auc": ltw["selfreport_ceiling_auc"], "leak_threshold_auc": ltw["leak_threshold_auc"]}
    assert ltw["n_pairs"] == n and ltw["n_people"] == len(ppl)

    ss_perm, ss_v = seed_combined().spawn(2)
    rp = np.random.default_rng(ss_perm)
    groups = {(b, s): np.unique((m_id if s == "m" else w_id)[batch == b]) for b in (1, 2) for s in ("m", "w")}
    perm = {"prio": [], "noprio": []}
    for _ in range(N_PERM):
        pm, pw = {}, {}
        for (b, s), g in groups.items():
            (pm if s == "m" else pw).update(dict(zip(g, rp.permutation(g))))
        for var, key in (("prio", "score"), ("noprio", "score_no_prio")):
            xs = np.array([sc[(pm[m], pw[w])][key] for m, w in zip(m_id, w_id)], float)
            perm[var].append(ME.rho(xs, risk, wm))
    res["random_score"] = {var: {"mean": round(float(np.mean(v)), 4), "range95": ME.ci(v),
                                 "p_one_sided": round(float((np.sum(np.array(v) >= main[var]["combined"]["all_weighted"]["rho"]) + 1)
                                                            / (len(v) + 1)), 4)}
                           for var, v in perm.items()}
    res["random_score_note"] = ("справка, в плане не записано: перестановка людей внутри пола и партии — нулевое "
                                "распределение при тех же людях; вывод — по бутстрэпу по людям (7, 18.6)")

    # ---- 3. ансамбли (17.7): точечные ρ главной строки объединённой части + по партиям
    priv_agree = {}

    def ens_summary(R, label, names=None):
        out = {}
        for scope in scopes:
            out[scope] = {}
            for var in ("prio", "noprio"):
                vals = np.array([ME.rho(X[var], R[j], w_main[scope]) for j in range(R.shape[0])])
                d = {"min": round(float(vals.min()), 4), "median": round(float(np.median(vals)), 4),
                     "max": round(float(vals.max()), 4), "n_below_0.1": int((vals < 0.1).sum())}
                if names and scope == "combined":
                    d["by_variant"] = {nm: round(float(v), 4) for nm, v in zip(names, vals)}
                out[scope][var] = d
        ag = np.array([ME.wspear(R[j], risk, wm) for j in range(R.shape[0])])
        priv_agree[label] = {"min": round(float(ag.min()), 4), "median": round(float(np.median(ag)), 4)}
        return out
    res["ensemble_main_30"] = ens_summary(ens_risk, "main_30")
    res["ensemble_structural_24"] = ens_summary(est_risk, "structural_24", est_names)

    # ---- 4. вспомогательные (7): AUC по распаду (слои — стадия), AUC по 1000 перетяжек V, c-index, ρ с CSI-4
    aux = {}
    for var in ("prio", "noprio"):
        x = -X[var]
        a = {}
        for scope in scopes:
            pt, bs = stat(lambda wt: wauc_strat(broke, x, wt, stage), scope, "all_weighted")
            a[f"auc_breakup_strat_{scope}"] = summ(pt, bs, "auc")
        pt, bs = stat(lambda wt: wauc_strat(broke, x, wt, stage), "combined", "all_unweighted")
        a["auc_breakup_strat_unweighted"] = summ(pt, bs, "auc")
        rv = np.random.default_rng(ss_v)
        av = [wauc_strat(rv.random(n) < p_break, x, wm, stage) for _ in range(N_VDRAW)]
        a["auc_expected_over_V"] = {"auc": round(float(np.nanmean(av)), 4), "range95_over_V": ME.ci(av)}
        pt, bs = stat(lambda wt: ME.cindex_month(X[var], month, broke, wt), "combined", "all_weighted")
        a["cindex_month"] = summ(pt, bs, "c")
        tog = ~broke & ~np.isnan(csi)
        pt, bs = stat(lambda wt: ME.wspear(X[var][tog], csi[tog], wt[tog]), "combined", "all_weighted")
        a["rho_csi4_together"] = {**summ(pt, bs), "n": int(tog.sum())}
        aux[var] = a
    aux["selfreport_ceiling_auc_weighted"] = round(wauc_strat(broke, self_risk, wm, stage), 4)
    aux["oracle_skeleton_auc_weighted"] = round(wauc_strat(broke, risk, wm, stage), 4)
    rv = np.random.default_rng(ss_v)
    draws = [rv.random(n) < p_break for _ in range(N_VDRAW)]
    aux["oracle_skeleton_auc_expected_over_V"] = round(float(np.nanmean([wauc_strat(d, risk, wm, stage) for d in draws])), 4)
    aux["selfreport_auc_expected_over_V"] = round(float(np.nanmean([wauc_strat(d, self_risk, wm, stage) for d in draws])), 4)
    aux["n_breakups_work"] = int(broke.sum())
    aux["n_breakups_by_batch"] = {b: int((broke & (batch == b)).sum()) for b in (1, 2)}
    res["auxiliary"] = aux

    # ---- 5. сферы (закрыто): ρ одной сферы и вклад (ρ полного − ρ без сферы), объединённая часть
    sph = {}
    for s in spheres:
        xs = getsc("sphere", s)
        d = {}
        ok = ~np.isnan(xs)
        d["rho_sphere_alone"] = round(ME.rho(xs[ok], risk[ok], wm[ok]), 4)
        for var, key in (("prio", "drop_sphere"), ("noprio", "drop_sphere_no_prio")):
            xd = getsc(key, s)
            full = X[var]
            pt, bs = stat(lambda wt: ME.rho(full, risk, wt) - ME.rho(xd, risk, wt), "combined", "all_weighted")
            d[f"contribution_{var}"] = {"delta": round(float(pt), 4), "ci95": ME.ci(bs)}
        sph[s] = d
    with open(OUT_PRIV, "w", encoding="utf-8") as f:
        json.dump({"note": "ЗАКРЫТО: вклад сфер теста в главную метрику и согласие вариантов ансамбля с центральной "
                           "формулой (объединённая рабочая часть, 18.6). Владельцу теста — только словами "
                           "(reviews/07-metric-88.md).",
                   "spheres": sph, "ensemble_agreement_with_central": priv_agree}, f, ensure_ascii=False, indent=1)
        f.write("\n")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
        f.write("\n")
    mw = main["noprio"]["combined"]["all_weighted"]
    mp = main["prio"]["combined"]["all_weighted"]
    print(f"объединённая рабочая часть: {n} пар, {len(ppl)} человек; ρ без важных сфер {mw['rho']} {mw['ci95']}, "
          f"с важными {mp['rho']} {mp['ci95']}; → {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
