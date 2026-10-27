"""Калибровка на отдельной популяции (зерно «calibration», design.md, 8.1): веса подбора пар a_k, τ,
α по стадиям, k, константы удовлетворённости и времени, ансамбль формул. Рабочие люди здесь не участвуют.

Запуск из корня проекта:  python3 research/blind/calibrate.py
Выход: research/blind/private/model.json
"""
import os
import sys
import time

import numpy as np
from scipy.optimize import brentq
from scipy.special import logit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
from generate import reference_intercepts  # noqa: E402

NB = 100          # 100 батчей по 100 человек = 10 000 человек, 5 000 настоящих пар
T_TRIES = 80
ALT_TARGET = 130  # на батч из 100 человек (как в рабочей выборке)
ALT_CAP = 5
PI2_3 = np.pi ** 2 / 3


def city_groups(P):
    G = []
    for b in np.unique(P["batch"]):
        for c in range(len(B.CITIES)):
            base = (P["batch"] == b) & (P["city"] == c)
            G.append((b, np.where(base & (P["sex"] == 0))[0], np.where(base & (P["sex"] == 1))[0]))
    return G


def match_all(P, G, nus, a):
    m, w, ok, mats = [], [], [], []
    for (b, mi, wi), nu in zip(G, nus):
        pr, S, okm = B.match_city(P, mi, wi, a, nu)
        mats.append((mi, wi, S, okm))
        for x, y, o in pr:
            m.append(x); w.append(y); ok.append(o)
    return np.array(m), np.array(w), np.array(ok), mats


def calibrate_matching(P, G, nus, log):
    a = {k: .5 for k in B.MATCH_DIMS}
    a.update(ISL=.5, AGE=.05)
    for it in range(60):
        m, w, ok, _ = match_all(P, G, nus, a)
        r = B.pair_corrs(P, m, w)
        for k in B.MATCH_DIMS:
            a[k] = float(np.clip(a[k] * np.exp(3.0 * (B.MATCH_TARGET[k] - r[k])), 1e-3, 50))
        a["ISL"] = float(np.clip(a["ISL"] * np.exp(3.0 * (B.ISLAM_MATCH_T - r["ISL_MATCH"])), 1e-3, 50))
        a["AGE"] = float(np.clip(a["AGE"] * np.exp(1.0 * (r["AGE_SD"] - B.AGE_SD_T)), 1e-4, 5))
    m, w, ok, mats = match_all(P, G, nus, a)
    r = B.pair_corrs(P, m, w)
    log["match_weights"] = a
    log["real_corr"] = r
    log["real_out_of_age_window"] = float(1 - ok.mean())
    return a, m, w, mats


def calib_alpha(k, lin, stage, R, spec, sigU, gamma, iters=14):
    tg = np.array([spec["stage_targets_3y_breakup"][s] for s in B.STAGES])
    alpha = logit(tg).copy()
    for _ in range(iters):
        dur, U, _, _ = B.prehistory_real(alpha, stage, k * lin, gamma, sigU, R)
        p = B.p3(alpha, stage, dur, k * lin, U, gamma)
        for s in range(3):
            alpha[s] += logit(tg[s]) - logit(p[stage == s].mean())
    dur, U, tries, okk = B.prehistory_real(alpha, stage, k * lin, gamma, sigU, R)
    p = B.p3(alpha, stage, dur, k * lin, U, gamma)
    return alpha, dur, U, p, tries, okk


def shares(k, comp, lin_self, stage, dur, U, gamma):
    IND, MIS, SIM = comp
    lin = IND + MIS + SIM
    L = B.center_by(k * lin + U + gamma * np.log(dur / 12), stage)
    tot = L.var() + PI2_3
    v = lambda x: B.center_by(x, stage).var() / tot
    ls = B.center_by(lin_self, stage)
    out = {"skeleton": v(k * lin), "IND": v(k * IND), "MIS": v(k * MIS), "SIM": v(k * SIM), "U": v(U),
           "duration": v(gamma * np.log(dur / 12)), "noise_V": PI2_3 / tot,
           "R2_selfreport_formula": float(np.cov(ls, L)[0, 1] ** 2 / (ls.var() * tot)),
           "R2_skeleton_formula": float(np.cov(B.center_by(lin, stage), L)[0, 1] ** 2 / (B.center_by(lin, stage).var() * tot)),
           "corr_lin_U": float(np.corrcoef(B.center_by(lin, stage), B.center_by(U, stage))[0, 1])}
    return {k2: round(float(x), 4) for k2, x in out.items()}


def aucs(y, stage, k, comp, comp_self, U):
    IND, MIS, SIM = comp
    lin = IND + MIS + SIM
    f = lambda x: round(B.auc_strat(y, x, stage), 4)
    return {"oracle_skeleton": f(lin), "oracle_IND_only": f(IND), "oracle_MIS_only": f(MIS),
            "oracle_skeleton_plus_U": f(k * lin + U), "selfreport_formula": f(sum(comp_self)),
            "selfreport_MIS_only": f(comp_self[1]), "unstratified_oracle": round(B.auc(y, lin), 4)}


def main():
    B.check_versions()
    t0 = time.time()
    tree = B.seed_tree()
    ct = B.seed_tree(tree["calibration"])
    spec = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    spec_hash = B.sha256(os.path.join(B.PRIV, "outcome-spec.json"))
    sigU, gamma = float(np.sqrt(spec["sigma_U2"])), spec["gamma_duration_per_ln_year"]
    log = {"outcome_spec_sha256": spec_hash, "n_people": NB * 100}

    icpt = reference_intercepts(tree)
    rng = B.rng_of(ct, "skeleton")
    P, _ = B.derive(B.make_frame(NB, rng), rng, icpt)
    P["batch"] = np.repeat(np.arange(NB), 100)
    S = B.selfreport(P, B.rng_of(ct, "selfreport"))
    G = city_groups(P)
    rnu = B.rng_of(ct, "match_noise")
    nus = [rnu.standard_normal((len(mi), len(wi))) for _, mi, wi in G]

    a, m, w, mats = calibrate_matching(P, G, nus, log)
    print(f"[{time.time()-t0:.0f}s] подбор пар:", {k: round(v, 3) for k, v in log["real_corr"].items()})

    rs = B.rng_of(ct, "real_stage")
    stage = B.draw_stage(P, m, w, rs.random(len(m)))
    R = (rs.random((len(m), T_TRIES)), rs.standard_normal((len(m), T_TRIES)), rs.random((len(m), T_TRIES)))
    sr = B.sim_raw(P, m, w)
    sim_mu, sim_sd = float(sr.mean()), float(sr.std())
    comp = B.components(P, m, w, spec, sim_mu, sim_sd)[:3]
    comp_self = B.components(S, m, w, spec, sim_mu, sim_sd)[:3]
    lin, lin_self = sum(comp), sum(comp_self)
    log["stage_mix_real"] = {B.STAGES[s]: round(float((stage == s).mean()), 4) for s in range(3)}

    # k: доля, объяснимая формулой ПО САМООТЧЁТУ, = цель (Joel 2020: 12% по самоотчётам; design.md, 5.4)
    tgt = spec["k_rule"]["target_R2_selfreport_formula"]
    cache = {}

    def f(k):
        al, dur, U, p, _, _ = calib_alpha(k, lin, stage, R, spec, sigU, gamma)
        sh = shares(k, comp, lin_self, stage, dur, U, gamma)
        cache[round(k, 4)] = sh
        return sh["R2_selfreport_formula"] - tgt

    lo, hi = spec["k_rule"]["k_bounds"]
    flo, fhi = f(lo), f(hi)
    if flo > 0:
        k = lo
    elif fhi < 0:
        k = hi
    else:
        k = brentq(f, lo, hi, xtol=.005)
    log["k"] = round(float(k), 4)
    log["k_at_bound"] = bool(flo > 0 or fhi < 0)
    print(f"[{time.time()-t0:.0f}s] k = {k:.3f}")

    alpha, dur, U, p, tries, okk = calib_alpha(k, lin, stage, R, spec, sigU, gamma)
    log["alpha"] = alpha.tolist()
    log["real_prehistory_tries_mean"] = float(tries.mean() + 1)
    log["real_prehistory_failed"] = float(1 - okk.mean())
    rv = B.rng_of(ct, "breakup_V")
    y = rv.random(len(m)) < p
    log["calib_breakup_by_stage_real"] = {B.STAGES[s]: round(float(p[stage == s].mean()), 4) for s in range(3)}
    log["calib_breakup_real"] = round(float(p.mean()), 4)
    log["shares"] = shares(k, comp, lin_self, stage, dur, U, gamma)
    log["auc"] = aucs(y, stage, k, comp, comp_self, U)

    # сетка k (критик, п. 8)
    grid = {}
    for kk in (0.5, 0.74, 1.0, round(float(k), 3)):
        al, d2, U2, p2, _, _ = calib_alpha(kk, lin, stage, R, spec, sigU, gamma)
        y2 = np.random.default_rng(7).random(len(m)) < p2
        grid[str(kk)] = {"shares": shares(kk, comp, lin_self, stage, d2, U2, gamma),
                         "auc": aucs(y2, stage, kk, comp, comp_self, U2)}
    log["k_grid"] = grid
    print(f"[{time.time()-t0:.0f}s] доли:", log["shares"])
    print("AUC:", log["auc"])

    # τ дополнительных пар: корреляции по ценностям примерно вдвое ниже, чем у настоящих
    real_set = set(zip(m.tolist(), w.tolist()))
    rsplit = B.rng_of(ct, "split")
    part_pair = B.split_real(P, m, w, stage, rsplit)
    person_part = np.empty(len(P["sex"]), dtype=object)
    person_part[m] = part_pair
    person_part[w] = part_pair
    groups_by_batch = {}
    for (b, mi, wi), (mi2, wi2, Sm, okm) in zip(G, mats):
        groups_by_batch.setdefault(b, []).append((mi, wi, Sm, okm))
    cands = {b: B.alt_candidates(g, real_set, person_part) for b, g in groups_by_batch.items()}
    VAL = ["REL", "EDU", "TRAD", "KIDS", "DRINK"]
    real_val = np.mean([log["real_corr"][v] for v in VAL])
    best = None
    tau_log = {}
    for tau in np.round(np.geomspace(.1, 20, 14), 3):
        rsel = np.random.default_rng(11)
        alt = [r for b in cands for r in B.alt_select(P, cands[b], tau, ALT_CAP, ALT_TARGET, rsel)]
        am, aw = np.array([r["m"] for r in alt]), np.array([r["w"] for r in alt])
        ratio = np.mean([B.pair_corrs(P, am, aw)[v] for v in VAL]) / real_val
        tau_log[str(tau)] = round(float(ratio), 3)
        if best is None or abs(ratio - .5) < abs(best[1] - .5):
            best = (float(tau), ratio)
    tau = best[0]
    log["tau"] = tau
    log["tau_grid_ratio_alt_to_real_value_corr"] = tau_log

    model = {"spec": spec, "k": float(k), "alpha": alpha, "sim_mu": sim_mu, "sim_sd": sim_sd,
             "sigU": sigU, "gamma": gamma}
    rsel, rst = B.rng_of(ct, "alt_select"), B.rng_of(ct, "alt_stage")
    alt = []
    for b in cands:
        alt += B.alt_select(P, cands[b], tau, ALT_CAP, ALT_TARGET, rsel, rst, model, P)
    am, aw = np.array([r["m"] for r in alt]), np.array([r["w"] for r in alt])
    ast = np.array([r["stage"] for r in alt])
    adur, aU = np.array([r["dur"] for r in alt]), np.array([r["U"] for r in alt])
    acomp = B.components(P, am, aw, spec, sim_mu, sim_sd)[:3]
    alin = sum(acomp)
    ap = B.p3(alpha, ast, adur, k * alin, aU, gamma)
    log["alt_per_batch_mean"] = len(alt) / NB
    log["alt_corr"] = B.pair_corrs(P, am, aw)
    log["alt_breakup"] = round(float(ap.mean()), 4)
    log["alt_breakup_by_stage"] = {B.STAGES[s]: round(float(ap[ast == s].mean()), 4) for s in range(3)}
    fr = B.mis_flags(P, m, w)
    fa = B.mis_flags(P, am, aw)
    log["mismatch_rates_real"] = {k2: round(float(v.mean()), 4) for k2, v in fr.items()}
    log["mismatch_rates_alt"] = {k2: round(float(v.mean()), 4) for k2, v in fa.items()}

    # константы удовлетворённости и времени (по настоящим + дополнительным парам калибровки)
    allm, allw = np.concatenate([m, am]), np.concatenate([w, aw])
    lin_s = B.lin_pred(P, allm, allw, spec, sim_mu, sim_sd, which="sat")
    allU = np.concatenate([U, aU])
    rsat = B.rng_of(ct, "sat_time")
    Us = spec["sat_U_corr"] * allU / sigU + np.sqrt(1 - spec["sat_U_corr"] ** 2) * rsat.standard_normal(len(allU))
    sh = spec["sat_shares"]
    Q = (-np.sqrt(sh["skeleton"]) * (lin_s - lin_s.mean()) / lin_s.std() - np.sqrt(sh["U"]) * Us
         + np.sqrt(1 - sh["skeleton"] - sh["U"]) * rsat.standard_normal(len(allU)))
    allst, alldur = np.concatenate([stage, ast]), np.concatenate([dur, adur])
    LP = alpha[allst] + gamma * np.log(alldur / 12) + k * np.concatenate([lin, alin]) + allU
    sat = {"lin_s_mu": float(lin_s.mean()), "lin_s_sd": float(lin_s.std()), "Q_mu": float(Q.mean()),
           "Q_sd": float(Q.std()), "LP_mu": float(LP.mean()), "LP_sd": float(LP.std())}

    # ансамбль формул (критик, п. 3)
    re = B.rng_of(tree, "ensemble")
    ens = []
    for _ in range(spec["ensemble"]["n"]):
        mult = lambda d: {kk: float(v * np.exp(spec["ensemble"]["sigma_log_multiplier"] * re.standard_normal())) for kk, v in d.items()}
        ens.append({"ind": mult(spec["ind"]), "mis": mult(spec["mis"]),
                    "beta_sim": float(spec["beta_sim"] * np.exp(spec["ensemble"]["sigma_log_multiplier"] * re.standard_normal()))})
    # согласие членов ансамбля с центральной формулой на калибровке
    ens_r = []
    from scipy.stats import spearmanr
    for e in ens:
        sp = dict(spec, ind=e["ind"], mis=e["mis"], beta_sim=e["beta_sim"])
        ens_r.append(spearmanr(B.lin_pred(P, m, w, sp, sim_mu, sim_sd), lin).correlation)
    log["ensemble_spearman_with_central"] = {"min": round(float(min(ens_r)), 3), "median": round(float(np.median(ens_r)), 3)}

    out = {"note": "Подобрано на калибровочной популяции (не на рабочих людях). Закрыто от владельца теста.",
           "outcome_spec_sha256": spec_hash, "match_weights": a, "match_noise_sd": 1.0,
           "tau": tau, "alt_cap": ALT_CAP, "alt_target_per_100": ALT_TARGET,
           "k": float(k), "alpha": alpha.tolist(), "gamma": gamma, "sigU": sigU,
           "sim_mu": sim_mu, "sim_sd": sim_sd, "sat_time": sat, "ensemble": ens,
           "reference_intercepts": icpt, "calibration": log}
    B.dump(out, os.path.join(B.PRIV, "model.json"))
    print(f"[{time.time()-t0:.0f}s] τ = {tau}; доп. пар на батч {log['alt_per_batch_mean']:.1f}; "
          f"распад: настоящие {log['calib_breakup_real']}, доп. {log['alt_breakup']}")
    print("model.json sha256:", B.sha256(os.path.join(B.PRIV, "model.json"))[:16])


if __name__ == "__main__":
    main()
