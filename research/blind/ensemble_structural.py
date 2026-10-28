"""Ансамбль формул ДРУГОГО УСТРОЙСТВА (ответ критику 2, п. 1; design.md, 13.3).

Отдельный файл: model.json и цепочка хешей не трогаются. Варианты — из private/outcome-ensemble-structural-spec.json
(множители и правила относительно точечной формулы): вес несовпадений ×2–4 при индивидуальных ×0,5; эффект партнёра;
выпадение по одному семейству; взаимодействия (оба тревожные; тревожный + избегающий; максимум враждебности двоих);
сильные взаимодействия с весом, сопоставимым с индивидуальными рисками (критик 3, п. 3).
С ред. 5 (design.md, 17.7) — поверх формулы ред. 5, плюс 8 новых вариантов (_note_v3 в спеке).
Жребия нет — варианты детерминированы (ожидание свойств пары — тот же поток expect_r5, что в outcome.py).

Запуск из корня проекта (после outcome.py):  python3 research/blind/ensemble_structural.py
Выход (закрыто): private/outcome-ensemble-structural.json — риск по скелету (k·lin) каждого варианта на каждой паре
и ранговое согласие вариантов с точечной формулой (на выборке и на калибровочной популяции).
"""
import os
import sys

import numpy as np
from scipy.stats import spearmanr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
from calibrate_r5 import calib_world  # noqa: E402

SPEC_ES = os.path.join(B.PRIV, "outcome-ensemble-structural-spec.json")


INTER = ("both_anxious", "anxious_avoidant", "dw_continuous", "both_anx_continuous")


def inter_flags(D, m, w, hc):
    """Взаимодействия пары: бинарные индикаторы (0/1) и непрерывные произведения z-баллов (критик 3, п. 3)."""
    return {"both_anxious": ((D["ANX"][m] >= hc) & (D["ANX"][w] >= hc)).astype(float),
            "anxious_avoidant": (((D["ANX"][m] >= hc) & (D["AVO"][w] >= hc))      # требование — уход
                                 | ((D["ANX"][w] >= hc) & (D["AVO"][m] >= hc))).astype(float),
            "dw_continuous": D["ANX"][m] * D["AVO"][w] + D["ANX"][w] * D["AVO"][m],
            "both_anx_continuous": D["ANX"][m] * D["ANX"][w]}


def humor_dissim(D, m, w):
    """Несходство стилей юмора: среднее |Δ| по трём стилям (вариант r5_humor_similarity)."""
    return np.mean([np.abs(D[kk][m] - D[kk][w]) for kk in ("HUM_AFF", "HUM_AGG", "HUM_SELF")], axis=0)


def lin_variant(D, m, w, spec, mu, sd, es, v, EV, xs=None):
    """Линейный предиктор варианта v (риск по скелету: свойства пары — их ожидание EV при данных двоих).
    Без v (пустой dict) — точечная формула ред. 5; spec — merge_spec(ред. 4, ред. 5).
    xs — веса взаимодействий и замен ред. 5 (inter_scale / r5_scale), подобраны на калибровке."""
    c = dict(spec["ind"])
    drop = set(v.get("drop", []))
    r5m = v.get("r5_mult", 1.0)
    humor = set(es["r5_families"]["R5_humor"])
    cont = set(es["ind_continuous"]) | humor            # HUM_AGG — непрерывный индивидуальный риск
    for kk in c:
        c[kk] *= v.get("ind_mult", 1.0)
        if kk in humor:
            c[kk] *= r5m
            if drop & {"R5", "R5_humor"}:
                c[kk] = 0.0
        if "IND" in drop or ("IND_continuous" in drop and kk in cont) \
                or ("IND_binary" in drop and kk in es["ind_binary"]):
            c[kk] = 0.0
    inter = set(v.get("inter", []))
    host_c = c["HOST"]
    if "host_max" in inter:
        c["HOST"] = 0.0
    Im, Iw = B.ind(D, m, c), B.ind(D, w, c)
    if "partner_weight" in v:
        pw = v["partner_weight"]
        IND = np.maximum(Im + pw * Iw, Iw + pw * Im) * 2 / (1 + pw)   # уходит тот, кому хуже; масштаб как у суммы
    else:
        IND = Im + Iw
    if "host_max" in inter:
        IND = IND + 2 * host_c * np.maximum(D["HOST"][m], D["HOST"][w])
    F = B.mis_flags(D, m, w)
    mm = 0.0 if "MIS" in drop else v.get("mis_mult", 1.0)
    MIS = sum(spec["mis"][kk] * mm * F[kk] for kk in F)
    SIM = 0.0 if "SIM" in drop else spec["beta_sim"] * (B.sim_raw(D, m, w) - mu) / sd
    wi = spec["mis"][es["interaction_weight_rel_to_mis"]] * es["interaction_weight_mult"]
    fl = inter_flags(D, m, w, es["high_cut_z"])
    X = 0.0
    for name in INTER:
        if name in inter:
            X = X + (xs[v["name"]][name] if "inter_scale" in v else wi) * fl[name]
    # свойства пары (ред. 5)
    pc = dict(spec["pair"])
    for kk in pc:
        if kk == "close_amp":
            continue
        pc[kk] *= r5m
        if drop & {"R5", "PAIR5"} or ("R5_intimacy" in drop and kk in es["r5_families"]["R5_intimacy"]) \
                or ("R5_relatives" in drop and kk in es["r5_families"]["R5_relatives"]):
            pc[kk] = 0.0
    if v.get("r5_sex") == "discrepancy":
        pc["sex"] = 0.0
        X = X + xs[v["name"]]["r5"] * np.abs(D["DESIRE"][m] - D["DESIRE"][w])
    if v.get("r5_humor_sim"):
        X = X + xs[v["name"]]["r5"] * humor_dissim(D, m, w)
    return IND + MIS + SIM + X + B.pair_terms(D, m, w, EV, pc)


def main():
    B.check_versions()
    tree = B.seed_tree()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    P = B.arrays_from_people(people)
    model = B.load(os.path.join(B.PRIV, "model.json"))
    m5 = B.load(os.path.join(B.PRIV, "model-r5.json"))
    spec4 = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    spec5 = B.load(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    spec = B.merge_spec(spec4, spec5)
    es = B.load(SPEC_ES)
    oj = B.load(os.path.join(B.PRIV, "outcome.json"))
    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"]
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json")) == m5["outcome_spec_r5_sha256"]
    assert oj["meta"]["pairs_sha256"] == B.sha256(os.path.join(B.PRIV, "pairs.json"))
    assert oj["meta"]["model_r5_sha256"] == B.sha256(os.path.join(B.PRIV, "model-r5.json"))
    idx = {pid: i for i, pid in enumerate(P["ids"])}
    pairs = pj["pairs"]
    m = np.array([idx[p["man"]] for p in pairs])
    w = np.array([idx[p["woman"]] for p in pairs])
    k, mu, sd, uc, M = m5["k"], m5["sim_mu"], m5["sim_sd"], m5["sexsat_U_corr"], m5["expect_draws"]
    EV = B.pair_vars_expected(P, m, w, m5["pair_cuts"], B.rng_of(tree, "expect_r5"), M, uc)   # как в outcome.py
    central = k * lin_variant(P, m, w, spec, mu, sd, es, {}, EV)
    ref = np.array([o["risk_logit_skeleton"] for o in oj["outcomes"]])
    assert np.allclose(np.round(central, 5), ref), "точечная формула не воспроизводится"

    ct, CP, _, real, _ = calib_world(tree, model, spec4)
    cm, cw = real[0], real[1]
    CEV = B.pair_vars_expected(CP, cm, cw, m5["pair_cuts"], B.rng_of(ct, "expect_r5"), M, uc)   # как в calibrate_r5
    c_central = lin_variant(CP, cm, cw, spec, mu, sd, es, {}, CEV)
    # веса сильных взаимодействий (критик 3, п. 3): SD вклада = mult × SD индивидуальных рисков пары на калибровке
    c_ind_sd = float(np.std(B.ind(CP, cm, spec["ind"]) + B.ind(CP, cw, spec["ind"])))
    c_fl = inter_flags(CP, cm, cw, es["high_cut_z"])
    xs = {v["name"]: {nm: round(v["inter_scale_mult"] * c_ind_sd / float(np.std(c_fl[nm])), 6) for nm in v["inter"]}
          for v in es["variants"] if v.get("inter_scale") == "match_ind_sd"}
    # замены ред. 5 (_note_v3): SD вклада = SD соответствующего вклада точечной формулы на калибровке
    sex_sd = spec["pair"]["sex"] * float(np.std(CEV["sex_z"]))
    agg_sd = spec["ind"]["HUM_AGG"] * float(np.std(CP["HUM_AGG"][cm] + CP["HUM_AGG"][cw]))
    for v in es["variants"]:
        if v.get("r5_scale") == "match_sex_sd":
            xs[v["name"]] = {"r5": round(sex_sd / float(np.std(np.abs(CP["DESIRE"][cm] - CP["DESIRE"][cw]))), 6)}
        elif v.get("r5_scale") == "match_humagg_sd":
            xs[v["name"]] = {"r5": round(agg_sd / float(np.std(humor_dissim(CP, cm, cw))), 6)}
    risks, agree = [], {}
    for v in es["variants"]:
        r = k * lin_variant(P, m, w, spec, mu, sd, es, v, EV, xs)
        risks.append(np.round(r, 5))
        cr = lin_variant(CP, cm, cw, spec, mu, sd, es, v, CEV, xs)
        agree[v["name"]] = {"spearman_with_central_sample": round(float(spearmanr(r, central).correlation), 4),
                            "spearman_with_central_calibration": round(float(spearmanr(cr, c_central).correlation), 4)}
    out = {"meta": {"generator": "research/blind/ensemble_structural.py", "lib_versions": B.lib_versions(),
                    "revision": 5, "spec_sha256": B.sha256(SPEC_ES),
                    "model_sha256": B.sha256(os.path.join(B.PRIV, "model.json")),
                    "model_r5_sha256": B.sha256(os.path.join(B.PRIV, "model-r5.json")),
                    "outcome_sha256": B.sha256(os.path.join(B.PRIV, "outcome.json")),
                    "note": "ЗАКРЫТО. Риск по скелету (k·lin, ред. 5) для вариантов другого устройства; строки — варианты, "
                            "столбцы — pair_ids. Выпавший исход по-прежнему по точечной формуле (outcome.json)."},
           "variants": [v["name"] for v in es["variants"]], "pair_ids": [p["pair_id"] for p in pairs],
           "risk_logit_skeleton": np.array(risks), "agreement": agree,
           "strong_interaction_weights_lin": xs}
    path = os.path.join(B.PRIV, "outcome-ensemble-structural.json")
    B.dump(out, path)
    print(f"вариантов {len(risks)}; outcome-ensemble-structural.json sha256: {B.sha256(path)[:16]}")


if __name__ == "__main__":
    main()
