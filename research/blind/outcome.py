"""Шаг 5 (design.md, 5; с ред. 5 — 17.5): исход каждой пары по заранее записанной формуле. Ответы теста не участвуют.
Формула — ред. 5 (outcome-spec.json + outcome-spec-r5.json, калибровка private/model-r5.json); свойства пары —
private/pair-vars.json. Предыстория пар (стаж, U) — из pairs.json, по формуле ред. 4.

Запуск из корня проекта (после pairs.py):  python3 research/blind/outcome.py
Выход (всё закрыто):
  private/outcome.json            — вероятность быть вместе через 3 года, выпавший исход, месяц распада,
                                    удовлетворённость (CSI-4), риск по скелету (центральная формула)
  private/outcome-ensemble.json   — риск по скелету для 30 формул ансамбля ред. 5 (design.md, 7, 17.7)
  private/benchmarks.json         — та же формула по самоотчёту (потолок самоотчёта) и её части
  private/leak-threshold.json     — порог утечки: потолок самоотчёта + верхняя граница бутстрэпа
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

N_BOOT = 2000


def self_arrays(recs, P):
    S = {k: np.array([r["z_self"][k] for r in recs]) for k in recs[0]["z_self"]}
    S["DRINK_LVL"] = np.array([B.DRINK_LEVELS.index(r["alcohol"]["frequency"]) for r in recs])
    S["RISKY"] = np.zeros(len(recs), dtype=bool)
    S["INF"] = np.array([r["admits_cheating_in_past"] for r in recs])
    S["DEBT_PROB"] = np.array([r["money"]["admits_problem_debt"] for r in recs])
    for k in ("PDIV", "KIDS_N", "REL_LVL", "ISLAM", "ORTH", "income_q", "age", "sex", "young"):
        S[k] = P[k]
    B.r5_from_records(recs, "z_self", S)
    return S


def wauc(y, x, wt):
    pos, neg = y, ~y
    if not pos.any() or not neg.any():
        return np.nan
    d = x[pos][:, None] - x[neg][None, :]
    W = wt[pos][:, None] * wt[neg][None, :]
    if W.sum() == 0:
        return np.nan
    return float(((d > 0) + .5 * (d == 0)).astype(float).__mul__(W).sum() / W.sum())


def wauc_strat(y, x, wt, stage):
    v, ww = [], []
    for s in np.unique(stage):
        mk = stage == s
        a = wauc(y[mk], x[mk], wt[mk])
        if not np.isnan(a):
            v.append(a); ww.append(wt[mk].sum())
    return float(np.average(v, weights=ww)) if v and sum(ww) > 0 else np.nan


def wspear(x, z, wt):
    """Взвешенная ранговая корреляция (веса — кратности из бутстрэпа)."""
    from scipy.stats import rankdata
    keep = wt > 0
    rx, rz = rankdata(x), rankdata(z)
    wv = wt[keep]
    a, b = rx[keep], rz[keep]
    a = a - np.average(a, weights=wv)
    b = b - np.average(b, weights=wv)
    return float(np.sum(wv * a * b) / np.sqrt(np.sum(wv * a * a) * np.sum(wv * b * b)))


def person_boot(m, w, fn, rng, reps=N_BOOT):
    """Кластерный бутстрэп по людям: тянем людей этой части с возвращением, вес пары = кратность м × кратность ж."""
    ppl = np.unique(np.concatenate([m, w]))
    pos = {p: i for i, p in enumerate(ppl)}
    mi = np.array([pos[x] for x in m])
    wi = np.array([pos[x] for x in w])
    out = []
    for _ in range(reps):
        cnt = np.bincount(rng.integers(0, len(ppl), len(ppl)), minlength=len(ppl))
        wt = cnt[mi] * cnt[wi]
        if (wt > 0).sum() < 10:
            continue
        out.append(fn(wt.astype(float)))
    return np.array(out)


def main():
    B.check_versions()
    tree = B.seed_tree()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    selfr = B.load(os.path.join(B.ROOT, "selfreport.json"))["people"]
    assert [p["id"] for p in people] == [s["id"] for s in selfr]
    P = B.arrays_from_people(people)
    S = self_arrays(selfr, P)
    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    model = B.load(os.path.join(B.PRIV, "model.json"))
    m5 = B.load(os.path.join(B.PRIV, "model-r5.json"))
    pv = B.load(os.path.join(B.PRIV, "pair-vars.json"))
    spec4 = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    spec5 = B.load(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"] == m5["outcome_spec_sha256"]
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json")) == m5["outcome_spec_r5_sha256"]
    assert pj["meta"]["model_sha256"] == B.sha256(os.path.join(B.PRIV, "model.json")) == m5["model_sha256"]
    assert pj["meta"]["people_sha256"] == B.sha256(os.path.join(B.ROOT, "people.json"))
    assert pv["meta"]["pairs_sha256"] == B.sha256(os.path.join(B.PRIV, "pairs.json"))
    assert pv["meta"]["model_r5_sha256"] == B.sha256(os.path.join(B.PRIV, "model-r5.json"))
    spec = B.merge_spec(spec4, spec5)
    idx = {pid: i for i, pid in enumerate(P["ids"])}
    pairs = pj["pairs"]
    m = np.array([idx[p["man"]] for p in pairs])
    w = np.array([idx[p["woman"]] for p in pairs])
    stage = np.array([B.STAGES.index(p["stage"]) for p in pairs])
    dur = np.array([p["duration_months"] for p in pairs], dtype=float)
    U = np.array([p["U_pair_specific"] for p in pairs])
    alpha, k, gamma, sU4, sU5 = np.array(m5["alpha"]), m5["k"], m5["gamma"], m5["sigU4"], m5["sigU5"]
    mu, sd = m5["sim_mu"], m5["sim_sd"]
    U5 = sU5 * U / sU4

    # свойства пары: реализованные (pair-vars.json) и ожидание при данных двоих (по «правде» и по самоотчёту)
    import pair_vars as PVmod
    V = PVmod.arrays(pv, pairs, m5["pair_cuts"])
    rx = B.rng_of(tree, "expect_r5")
    EVt = B.pair_vars_expected(P, m, w, m5["pair_cuts"], rx, m5["expect_draws"], m5["sexsat_U_corr"])
    EVs = B.pair_vars_expected(S, m, w, m5["pair_cuts"], rx, m5["expect_draws"], m5["sexsat_U_corr"])

    # ред. 5.1 (design.md, 17.14): правило 17.5 — по всем 180 парам, реализованные свойства и их ожидание
    for VV in (V, EVt):
        for wh in ("break", "sat"):
            assert B.r5_strength_check(P, m, w, spec, VV, wh)["ok"], "правило 17.5 нарушено на парах выборки"
    IND, MIS, SIM, PR, F = B.components_r5(P, m, w, spec, V, mu, sd)
    PE = B.pair_terms(P, m, w, EVt, spec["pair"])
    lin = IND + MIS + SIM + PR               # реализованный (со свойствами пары)
    lin_sk = IND + MIS + SIM + PE            # риск по скелету: ожидание свойств пары при данных двоих (17.5)
    p_break = B.p3(alpha, stage, dur, k * lin, U5, gamma)

    # исход 1: распад за 36 мес. (жребий V — тот же поток, что в ред. 4)
    Vd = B.rng_of(tree, "breakup_V").random(len(m))
    broke = Vd < p_break

    # исход 2: удовлетворённость, время до распада (те же потоки)
    rs = B.rng_of(tree, "sat_time")
    st = m5["sat_time"]
    lin_s = sum(B.components_r5(P, m, w, spec, V, mu, sd, "sat")[:4])
    zs = (lin_s - st["lin_s_mu"]) / st["lin_s_sd"]
    rho = spec5["sat_U_corr"]
    Us = rho * U / sU4 + np.sqrt(1 - rho ** 2) * rs.standard_normal(len(m))
    sh = spec5["sat_shares"]
    e = rs.standard_normal(len(m))
    Q = -np.sqrt(sh["skeleton"]) * zs - np.sqrt(sh["U"]) * Us + np.sqrt(1 - sh["skeleton"] - sh["U"]) * e
    Qexp = -np.sqrt(sh["skeleton"]) * zs - np.sqrt(sh["U"]) * rho * U / sU4
    csi = lambda q: 16 + 4.7 * (q - st["Q_mu"]) / st["Q_sd"]
    csi_draw = np.clip(np.round(csi(Q)), 0, 21).astype(int)
    LP = alpha[stage] + gamma * np.log(dur / 12) + k * lin + U5
    zlp = (LP - st["LP_mu"]) / st["LP_sd"]
    W = rs.random(len(m))
    month = 1 + np.floor(35 * W ** np.exp(.5 * zlp)).astype(int)

    out = []
    for i, p in enumerate(pairs):
        out.append({
            "pair_id": p["pair_id"],
            "p_together_3y": round(float(1 - p_break[i]), 4),
            "together_3y": bool(not broke[i]),
            "breakup_month": int(month[i]) if broke[i] else None,
            "satisfaction_csi4": int(csi_draw[i]) if not broke[i] else None,
            "distress_csi4_below_13_5": bool(csi_draw[i] < 13.5) if not broke[i] else None,
            "satisfaction_expected_csi4": round(float(csi(Qexp[i])), 2),
            "risk_logit_skeleton": round(float(k * lin_sk[i]), 5),
            "risk_logit_with_pair_vars": round(float(k * lin[i]), 5),
            "mismatches": [kk for kk in F if F[kk][i]],
        })
    meta = {"generator": "research/blind/outcome.py", "master_seed": B.MASTER_SEED, "lib_versions": B.lib_versions(),
            "revision": 5, "pairs_sha256": B.sha256(os.path.join(B.PRIV, "pairs.json")),
            "pair_vars_sha256": B.sha256(os.path.join(B.PRIV, "pair-vars.json")),
            "model_r5_sha256": B.sha256(os.path.join(B.PRIV, "model-r5.json")),
            "note": "ЗАКРЫТО. Исход ред. 5 посчитан до появления любого текста с новыми полями. Тест сюда не входит. "
                    "risk_logit_skeleton — главная метрика (без специфичной для пары части свойств пары и без U)."}
    path = os.path.join(B.PRIV, "outcome.json")
    B.dump({"meta": meta, "outcomes": out}, path)

    # основной ансамбль ред. 5 (30 формул)
    ens = []
    for e_ in m5["ensemble"]:
        a_, b_, c_, _, _ = B.components_r5(P, m, w, e_, EVt, mu, sd)
        ens.append(np.round(k * (a_ + b_ + c_ + B.pair_terms(P, m, w, EVt, e_["pair"])), 5))
    B.dump({"meta": {"note": "риск по скелету (k·lin, ред. 5) для каждого члена ансамбля; строки — члены, столбцы — pair_ids",
                     "outcome_sha256": B.sha256(path)},
            "pair_ids": [p["pair_id"] for p in pairs], "risk_logit_skeleton": np.array(ens)},
           os.path.join(B.PRIV, "outcome-ensemble.json"))

    # потолок самоотчёта и порог утечки
    sIND, sMIS, sSIM, _, _ = B.components_r5(S, m, w, spec, EVs, mu, sd)
    sPE = B.pair_terms(S, m, w, EVs, spec["pair"])
    lin_self = sIND + sMIS + sSIM + sPE
    B.dump({"pair_ids": [p["pair_id"] for p in pairs],
            "selfreport_formula": np.round(k * lin_self, 5), "selfreport_IND": np.round(k * sIND, 5),
            "selfreport_MIS": np.round(k * sMIS, 5), "selfreport_PAIR": np.round(k * sPE, 5),
            "skeleton_IND": np.round(k * IND, 5), "skeleton_MIS": np.round(k * MIS, 5),
            "skeleton_PAIR": np.round(k * PE, 5)}, os.path.join(B.PRIV, "benchmarks.json"))

    rb = B.rng_of(tree, "bootstrap")
    part = np.array([p["part"] for p in pairs])
    thr = {}
    for pt in ("work", "holdout", "all"):
        mk = np.ones(len(m), bool) if pt == "all" else part == pt
        y, x, sg = broke[mk], lin_self[mk], stage[mk]
        pt_auc = wauc_strat(y, x, np.ones(mk.sum()), sg)
        bs = person_boot(m[mk], w[mk], lambda wt: wauc_strat(y, x, wt, sg), rb)
        exp_auc = [B.auc_strat(np.random.default_rng(j).random(mk.sum()) < p_break[mk], x, sg) for j in range(300)]
        lk = (k * lin_sk)[mk]
        rho0 = wspear(x, lk, np.ones(mk.sum()))
        bsr = person_boot(m[mk], w[mk], lambda wt: wspear(x, lk, wt), rb)
        thr[pt] = {"n_pairs": int(mk.sum()), "n_breakups": int(y.sum()),
                   "MAIN_selfreport_ceiling_spearman_vs_skeleton_risk": round(rho0, 4),
                   "MAIN_leak_threshold_spearman": round(float(np.nanpercentile(bsr, 97.5)), 4),
                   "MAIN_spearman_boot_95": [round(float(np.nanpercentile(bsr, 2.5)), 4), round(float(np.nanpercentile(bsr, 97.5)), 4)],
                   "selfreport_ceiling_auc": round(pt_auc, 4),
                   "boot_97_5": round(float(np.nanpercentile(bs, 97.5)), 4),
                   "leak_threshold_auc": round(float(np.nanpercentile(bs, 97.5)), 4),
                   "selfreport_ceiling_auc_expected_over_V": round(float(np.mean(exp_auc)), 4)}
    B.dump({"note": "Главная метрика — ранговая корреляция балла теста с риском по скелету (design.md, 7; ред. 5 — 17.5). "
                    "Порог утечки = верхняя граница 95% бутстрэпа (по людям) у формулы исхода ред. 5, применённой "
                    "к самоотчёту (свойства пары — их ожидание по самоотчёту двоих; MAIN_leak_threshold_spearman). "
                    "Для AUC по одному жребию — то же (leak_threshold_auc). Записан до появления первого текста с новыми полями.",
            "outcome_sha256": B.sha256(path), "thresholds": thr}, os.path.join(B.PRIV, "leak-threshold.json"))

    print(f"пар {len(m)}; исход ред. 5 записан; outcome.json sha256: {B.sha256(path)[:16]}")


if __name__ == "__main__":
    main()
