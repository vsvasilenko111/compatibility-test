"""Калибровка редакции 5 (design.md, 17.6): пороги свойств пары, σ_U5, α5, k5, константы удовлетворённости и
времени, основной ансамбль ред. 5. На калибровочной популяции (своё зерно), рабочие люди не участвуют.

Калибровочная популяция, настоящие и дополнительные пары, их стадии, стаж и U — те же, что в calibrate.py
(формула предыстории ред. 4 и model.json не меняются; код сверяет, что предыстория воспроизвелась).

Запуск из корня проекта (после calibrate.py):  python3 research/blind/calibrate_r5.py
Выход: research/blind/private/model-r5.json (закрыто)
"""
import os
import sys
import time

import numpy as np
from scipy.optimize import brentq
from scipy.special import expit, logit
from scipy.stats import spearmanr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
from calibrate import T_TRIES, city_groups, match_all  # noqa: E402
from generate import reference_intercepts, reference_r5_cuts  # noqa: E402

PI2_3 = np.pi ** 2 / 3


def self_extend(S, P):
    """Поля самоотчёта, которых selfreport() не копирует, но которые нужны свойствам пары и формуле."""
    for k in ("income_q", "age", "sex", "young", "ISLAM", "ORTH", "REL_LVL", "KIDS_N", "PDIV", "CONF"):
        S[k] = P[k]
    return S


def calib_world(tree, model, spec4):
    """Калибровочная популяция и её пары ровно как в calibrate.py (те же потоки и порядок жребиев)."""
    ct = B.seed_tree(tree["calibration"])
    icpt = reference_intercepts(tree)
    rng = B.rng_of(ct, "skeleton")
    P, _ = B.derive(B.make_frame(100, rng), rng, icpt)
    P["batch"] = np.repeat(np.arange(100), 100)
    S = B.selfreport(P, B.rng_of(ct, "selfreport"))
    cuts5 = reference_r5_cuts(tree)
    B.derive_r5(P, B.rng_of(ct, "skeleton_r5"), cuts5)
    B.selfreport_r5(P, S, B.rng_of(ct, "selfreport_r5"), cuts5)
    self_extend(S, P)
    G = city_groups(P)
    rnu = B.rng_of(ct, "match_noise")
    nus = [rnu.standard_normal((len(mi), len(wi))) for _, mi, wi in G]
    m, w, _, mats = match_all(P, G, nus, model["match_weights"])
    rs = B.rng_of(ct, "real_stage")
    stage = B.draw_stage(P, m, w, rs.random(len(m)))
    R = (rs.random((len(m), T_TRIES)), rs.standard_normal((len(m), T_TRIES)), rs.random((len(m), T_TRIES)))
    sim_mu, sim_sd = model["sim_mu"], model["sim_sd"]
    sr = B.sim_raw(P, m, w)
    assert abs(sr.mean() - sim_mu) < 1e-12 and abs(sr.std() - sim_sd) < 1e-12, "пары калибровки не воспроизвелись"
    k4, a4, g, sU = model["k"], np.array(model["alpha"]), model["gamma"], model["sigU"]
    lin4 = B.lin_pred(P, m, w, spec4, sim_mu, sim_sd)
    dur, U, _, _ = B.prehistory_real(a4, stage, k4 * lin4, g, sU, R)
    p4 = B.p3(a4, stage, dur, k4 * lin4, U, g)
    chk = {B.STAGES[s]: round(float(p4[stage == s].mean()), 4) for s in range(3)}
    assert chk == model["calibration"]["calib_breakup_by_stage_real"], ("предыстория не воспроизвелась", chk)
    # дополнительные пары (как в calibrate.py)
    real_set = set(zip(m.tolist(), w.tolist()))
    part_pair = B.split_real(P, m, w, stage, B.rng_of(ct, "split"))
    person_part = np.empty(len(P["sex"]), dtype=object)
    person_part[m] = part_pair
    person_part[w] = part_pair
    gb = {}
    for (b, mi, wi), (_, _, Sm, okm) in zip(G, mats):
        gb.setdefault(b, []).append((mi, wi, Sm, okm))
    cands = {b: B.alt_candidates(gg, real_set, person_part) for b, gg in gb.items()}
    mdl = {"spec": spec4, "k": k4, "alpha": a4, "sim_mu": sim_mu, "sim_sd": sim_sd, "sigU": sU, "gamma": g}
    rsel, rst = B.rng_of(ct, "alt_select"), B.rng_of(ct, "alt_stage")
    alt = []
    for b in cands:
        alt += B.alt_select(P, cands[b], model["tau"], model["alt_cap"], model["alt_target_per_100"], rsel, rst, mdl, P)
    am, aw = np.array([r["m"] for r in alt]), np.array([r["w"] for r in alt])
    ast = np.array([r["stage"] for r in alt])
    adur, aU = np.array([r["dur"] for r in alt]), np.array([r["U"] for r in alt])
    ap = B.p3(a4, ast, adur, k4 * B.lin_pred(P, am, aw, spec4, sim_mu, sim_sd), aU, g)
    assert round(float(ap.mean()), 4) == model["calibration"]["alt_breakup"], "дополнительные пары не воспроизвелись"
    return ct, P, S, (m, w, stage, dur, U), (am, aw, ast, adur, aU)


def sigma_u5(k, Uz, resid, stage, target):
    """σ_U5: дисперсия (σ·Uz + k·resid) внутри стадий = target (design.md, 17.5)."""
    u, r = B.center_by(Uz, stage), B.center_by(resid, stage)
    a, b, c = u.var(), 2 * k * np.mean(u * r), k * k * r.var() - target
    disc = b * b - 4 * a * c
    return float(max(0.0, (-b + np.sqrt(max(disc, 0))) / (2 * a)))


def fit_alpha(k, lin, stage, dur, U5, gamma, targets, iters=40):
    alpha = logit(targets).copy()
    for _ in range(iters):
        p = B.p3(alpha, stage, dur, k * lin, U5, gamma)
        for s in range(3):
            alpha[s] += logit(targets[s]) - logit(p[stage == s].mean())
    return alpha, B.p3(alpha, stage, dur, k * lin, U5, gamma)


def main():
    B.check_versions()
    t0 = time.time()
    tree = B.seed_tree()
    model = B.load(os.path.join(B.PRIV, "model.json"))
    spec4 = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    spec5 = B.load(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"]
    spec = B.merge_spec(spec4, spec5)
    gamma, sU4, uc = model["gamma"], model["sigU"], spec5["sexsat_U_corr"]
    assert gamma == spec5["gamma_duration_per_ln_year"]
    mu, sd = model["sim_mu"], model["sim_sd"]
    ct, P, S, real, altp = calib_world(tree, model, spec4)
    m, w, stage, dur, U = real
    am, aw, ast, adur, aU = altp
    print(f"[{time.time()-t0:.0f}s] калибровочный мир воспроизведён: {len(m)} настоящих, {len(am)} доп. пар")

    # свойства пары: пороги — на настоящих парах калибровки
    rp = B.rng_of(ct, "pair_r5")
    Vr, pcuts = B.pair_vars_r5(P, m, w, stage, dur, U / sU4, B.r5_pair_draws(rp, len(m)), uc, None)
    Va, _ = B.pair_vars_r5(P, am, aw, ast, adur, aU / sU4, B.r5_pair_draws(rp, len(am)), uc, pcuts)
    rx = B.rng_of(ct, "expect_r5")
    M = spec5["expect_draws"]
    EVt = B.pair_vars_expected(P, m, w, pcuts, rx, M, uc)
    EVs = B.pair_vars_expected(S, m, w, pcuts, rx, M, uc)
    print(f"[{time.time()-t0:.0f}s] свойства пары и ожидания готовы")
    # ред. 5.1 (design.md, 17.14): знак связи «химии» с удовлетворённостью сексом и правило 17.5 по всем парам
    r_u_sex = float(np.corrcoef(U, Vr["sex_raw"])[0, 1])
    assert r_u_sex < 0, "U — риск: corr(U, удовлетворённость сексом) должна быть < 0 (критик 05, п. 1)"
    strength = {"break_real": B.r5_strength_check(P, m, w, spec, Vr, "break"),
                "sat_real": B.r5_strength_check(P, m, w, spec, Vr, "sat"),
                "break_expected": B.r5_strength_check(P, m, w, spec, EVt, "break")}
    assert all(v["ok"] for v in strength.values()), "правило 17.5 нарушено: новый фактор сильнее сильных ред. 4"

    IND, MIS, SIM, PR, _ = B.components_r5(P, m, w, spec, Vr, mu, sd)
    PE = B.pair_terms(P, m, w, EVt, spec["pair"])
    sI, sM, sS, _, _ = B.components_r5(S, m, w, spec, EVs, mu, sd)
    sP = B.pair_terms(S, m, w, EVs, spec["pair"])
    lin_real, lin_skel, lin_self = IND + MIS + SIM + PR, IND + MIS + SIM + PE, sI + sM + sS + sP
    resid = PR - PE
    Uz = U / sU4
    target_u = float(B.center_by(U, stage).var())          # прежняя специфичная для пары дисперсия (внутри стадий)
    tg = np.array([spec5["stage_targets_3y_breakup"][s] for s in B.STAGES])

    def world(k):
        s5 = sigma_u5(k, Uz, resid, stage, target_u)
        U5 = s5 * Uz
        al, p = fit_alpha(k, lin_real, stage, dur, U5, gamma, tg)
        L = B.center_by(k * lin_real + U5 + gamma * np.log(dur / 12), stage)
        tot = L.var() + PI2_3
        v = lambda x: float(B.center_by(x, stage).var() / tot)
        ls = B.center_by(lin_self, stage)
        lk = B.center_by(lin_skel, stage)
        T = U5 + k * resid
        sh = {"skeleton": v(k * lin_skel), "pair_specific_total": v(T), "U5": v(U5),
              "skeleton_plus_pair_specific": v(k * lin_skel + T), "duration": v(gamma * np.log(dur / 12)),
              "noise_V": float(PI2_3 / tot),
              "R2_selfreport_formula": float(np.cov(ls, L)[0, 1] ** 2 / (ls.var() * tot)),
              "R2_skeleton_formula": float(np.cov(lk, L)[0, 1] ** 2 / (lk.var() * tot))}
        fam = {"IND_r4": v(k * (IND - spec5["ind_r5"]["HUM_AGG"] * (P["HUM_AGG"][m] + P["HUM_AGG"][w]))),
               "IND_r5_humor": v(k * spec5["ind_r5"]["HUM_AGG"] * (P["HUM_AGG"][m] + P["HUM_AGG"][w])),
               "MIS": v(k * MIS), "SIM": v(k * SIM), "PAIR_expected": v(k * PE), "PAIR_resid": v(k * resid)}
        return s5, U5, al, p, {kk: round(x, 4) for kk, x in sh.items()}, {kk: round(x, 4) for kk, x in fam.items()}

    def f(k):
        return world(k)[4]["R2_selfreport_formula"] - spec5["k_rule"]["target_R2_selfreport_formula"]

    lo, hi = spec5["k_rule"]["k_bounds"]
    flo, fhi = f(lo), f(hi)
    k5 = lo if flo > 0 else (hi if fhi < 0 else brentq(f, lo, hi, xtol=.002))
    s5, U5, alpha5, p5, shares, fam = world(k5)
    print(f"[{time.time()-t0:.0f}s] k5 = {k5:.3f}, σ_U5 = {s5:.3f}")

    y = B.rng_of(ct, "breakup_V").random(len(m)) < p5
    fa = lambda x: round(float(B.auc_strat(y, x, stage)), 4)
    aucs = {"oracle_skeleton": fa(lin_skel), "oracle_skeleton_plus_pair_specific": fa(k5 * lin_real + U5),
            "selfreport_formula": fa(lin_self)}
    fam_auc = {"oracle_IND_only": fa(IND), "oracle_MIS_only": fa(MIS), "oracle_PAIR_expected_only": fa(PE),
               "selfreport_MIS_only": fa(sM), "selfreport_PAIR_expected_only": fa(sP)}
    grid = {}
    for kk in (0.5, 0.74, 1.0, round(float(k5), 3)):
        _, U5g, _, pg, shg, _ = world(kk)
        yg = np.random.default_rng(7).random(len(m)) < pg
        grid[str(kk)] = {"shares": shg, "auc": {"oracle_skeleton": round(float(B.auc_strat(yg, lin_skel, stage)), 4),
                                                "selfreport_formula": round(float(B.auc_strat(yg, lin_self, stage)), 4)}}

    # удовлетворённость и время (настоящие + дополнительные пары калибровки)
    allm, allw = np.concatenate([m, am]), np.concatenate([w, aw])
    Vall = {kk: np.concatenate([Vr[kk], Va[kk]]) for kk in B.R5_TERMS}
    lin_s = sum(B.components_r5(P, allm, allw, spec, Vall, mu, sd, "sat")[:4])
    allUz = np.concatenate([U, aU]) / sU4
    rsat = B.rng_of(ct, "sat_time")
    rho = spec5["sat_U_corr"]
    Us = rho * allUz + np.sqrt(1 - rho ** 2) * rsat.standard_normal(len(allUz))
    shs = spec5["sat_shares"]
    Q = (-np.sqrt(shs["skeleton"]) * (lin_s - lin_s.mean()) / lin_s.std() - np.sqrt(shs["U"]) * Us
         + np.sqrt(1 - shs["skeleton"] - shs["U"]) * rsat.standard_normal(len(allUz)))
    alin = sum(B.components_r5(P, am, aw, spec, Va, mu, sd)[:4])
    allst, alldur = np.concatenate([stage, ast]), np.concatenate([dur, adur])
    LP = alpha5[allst] + gamma * np.log(alldur / 12) + k5 * np.concatenate([lin_real, alin]) + s5 * allUz
    ap5 = expit(alpha5[ast] + gamma * np.log(adur / 12) + k5 * alin + s5 * aU / sU4)
    sat = {"lin_s_mu": float(lin_s.mean()), "lin_s_sd": float(lin_s.std()), "Q_mu": float(Q.mean()),
           "Q_sd": float(Q.std()), "LP_mu": float(LP.mean()), "LP_sd": float(LP.std())}

    # основной ансамбль ред. 5: прежние множители членов ред. 4 + новые множители (зерно ensemble_r5)
    re = B.rng_of(tree, "ensemble_r5")
    sig = spec5["ensemble"]["sigma_log_multiplier"]
    mult = lambda d: {kk: (float(v * np.exp(sig * re.standard_normal())) if v != 0 else 0.0) for kk, v in d.items()}
    ens = []
    for e in model["ensemble"]:
        ens.append({"ind": {**e["ind"], **mult(spec5["ind_r5"])}, "ind_sat": {**spec4["ind_sat"], **mult(spec5["ind_sat_r5"])},
                    "mis": e["mis"], "mis_sat_mult": spec4["mis_sat_mult"], "beta_sim": e["beta_sim"],
                    "pair": mult(spec5["pair_r5"]), "pair_sat": mult(spec5["pair_sat_r5"])})
    ens_r = []
    for e in ens:
        a_, b_, c_, _, _ = B.components_r5(P, m, w, e, EVt, mu, sd)
        ens_r.append(spearmanr(a_ + b_ + c_ + B.pair_terms(P, m, w, EVt, e["pair"]), lin_skel).correlation)

    # проверки свойств пары на настоящих парах калибровки (design.md, 17.9)
    young_pair = (P["age"][m] + P["age"][w]) / 2 < 25
    liv = stage >= 1
    yo_m, yo_w = P["age"][m] <= 24, P["age"][w] <= 24
    sat_all = np.concatenate([Vr["sexsat_m"], Vr["sexsat_w"]])
    yo_all = np.concatenate([yo_m, yo_w])
    wm = np.concatenate([Vr["wants_more_m"], Vr["wants_more_w"]])
    checks = {
        "live_young_pair": float(Vr["live"][liv & young_pair].mean()), "live_older_pair": float(Vr["live"][liv & ~young_pair].mean()),
        "approve_against_neutral_approve": [float(np.mean(np.concatenate([Vr["app_m"], Vr["app_w"]]) == L)) for L in range(3)],
        "inlaw": float(np.concatenate([Vr["inlaw_m"], Vr["inlaw_w"]]).mean()),
        "inlaw_dating": float(np.concatenate([Vr["inlaw_m"], Vr["inlaw_w"]])[np.tile(stage == 0, 2)].mean()),
        "inlaw_living": float(np.concatenate([Vr["inlaw_m"], Vr["inlaw_w"]])[np.tile(liv, 2)].mean()),
        "inlaw_any_pair_by_stage": {B.STAGES[s]: float(np.maximum(Vr["inlaw_m"], Vr["inlaw_w"])[stage == s].mean())
                                    for s in range(3)},
        "inlaw_living_with_parents": float(np.concatenate([Vr["inlaw_m"], Vr["inlaw_w"]])[np.tile(Vr["live"] > 0, 2)].mean()),
        "inlaw_not_living_with_parents": float(np.concatenate([Vr["inlaw_m"], Vr["inlaw_w"]])[np.tile(liv & (Vr["live"] == 0), 2)].mean()),
        "sexsat_20_24": [float(np.mean(sat_all[yo_all] == L)) for L in range(3)],
        "sexsat_25_30": [float(np.mean(sat_all[~yo_all] == L)) for L in range(3)],
        "sexfreq": [float(np.mean(Vr["sexfreq"] == L)) for L in range(4)],
        "sexfreq_weekly_plus_by_stage": {B.STAGES[s]: float(np.mean(Vr["sexfreq"][stage == s] >= 1)) for s in range(3)},
        "wants_more_m_w": [float(np.mean(Vr["wants_more_m"])), float(np.mean(Vr["wants_more_w"]))],
        "wants_more_all": float(wm.mean()),
        "r_approve_sides": float(np.corrcoef(Vr["app_m"], Vr["app_w"])[0, 1]),
    }
    log = {"n_real": int(len(m)), "n_alt": int(len(am)), "k5": round(float(k5), 4), "k5_at_bound": bool(flo > 0 or fhi < 0),
           "sigma_U5": round(s5, 4), "sigma_U4": sU4, "target_pair_specific_var": round(target_u, 4),
           "sigma_U5_below_U4": bool(s5 < sU4), "corr_U_sexsat_latent": round(r_u_sex, 4),
           "rule_17_5_ok": bool(all(v["ok"] for v in strength.values())),
           "alpha5": alpha5.tolist(),
           "breakup_by_stage_real": {B.STAGES[s]: round(float(p5[stage == s].mean()), 4) for s in range(3)},
           "breakup_real": round(float(p5.mean()), 4), "breakup_alt": round(float(ap5.mean()), 4),
           "shares": shares, "auc": aucs, "k_grid": grid,
           "ensemble_spearman_with_central": {"min": round(float(min(ens_r)), 3), "median": round(float(np.median(ens_r)), 3)},
           "pair_checks": checks}
    out = {"note": "Калибровка ред. 5 (design.md, 17.6). Подобрано на калибровочной популяции. Закрыто от владельца теста.",
           "outcome_spec_r5_sha256": B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json")),
           "outcome_spec_sha256": model["outcome_spec_sha256"],
           "model_sha256": B.sha256(os.path.join(B.PRIV, "model.json")),
           "k": float(k5), "alpha": alpha5.tolist(), "gamma": gamma, "sigU4": sU4, "sigU5": s5,
           "sim_mu": mu, "sim_sd": sd, "pair_cuts": pcuts, "sexsat_U_corr": uc, "expect_draws": M,
           "sat_time": sat, "ensemble": ens, "calibration": log,
           "private_family": {"shares": fam, "auc": fam_auc}, "strength_check_calibration": strength}
    B.dump(out, os.path.join(B.PRIV, "model-r5.json"))
    print(f"[{time.time()-t0:.0f}s] model-r5.json sha256: {B.sha256(os.path.join(B.PRIV, 'model-r5.json'))[:16]}")


if __name__ == "__main__":
    main()
