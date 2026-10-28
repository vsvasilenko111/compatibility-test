"""Вторая партия слепой выборки: 50 человек (design.md, 18). Шаги 1–8 без LLM одним прогоном.

Запуск из корня проекта:  python3 research/blind/batch2.py
затем:                    python3 research/blind/prep_inputs.py --batch 2
                          python3 research/blind/seal.py --batch 2

Ничего из первой партии не перезаписывается: её файлы только читаются (пороги скелета, формула ред. 5.1, id людей и пар —
чтобы не совпасть, рабочая часть — для потолка самоотчёта на объединённой рабочей части).
Зёрна — дерево seed_tree(<batch2>) с теми же именами, что у первой партии, и batch2_balance (design.md, 18.2).

Выход:
  b2-people.json, b2-selfreport.json          — «правда» и самоотчёт 50 человек (кто видит — как people.json, selfreport.json)
  private/b2-pairs.json                       — настоящие и дополнительные пары, часть, стадия, стаж, U (закрыто)
  private/b2-pair-vars.json                   — свойства пар ред. 5 (закрыто)
  private/b2-outcome.json                     — исход по формуле ред. 5.1 (закрыто)
  private/b2-outcome-ensemble.json            — риск по скелету для 30 формул ансамбля
  private/b2-outcome-ensemble-structural.json — то же для 24 вариантов другого устройства
  private/b2-benchmarks.json                  — формула исхода по самоотчёту
  private/b2-leak-threshold.json              — потолок самоотчёта и порог утечки: объединённая рабочая часть, проверочная
                                                часть второй партии (бутстрэп по людям со слоем «партия»)
  private/b2-report-private.json              — закрытые агрегаты отчёта (согласие вариантов ансамбля, правило 17.5)
  generation-report-b2.md                     — агрегатный отчёт «задумано — получилось» (без коэффициентов и исходов пар)
"""
import os
import sys

import numpy as np
from scipy.stats import binomtest, spearmanr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
import generate as G  # noqa: E402
import pair_vars as PVmod  # noqa: E402
from outcome import self_arrays, wauc_strat, wspear  # noqa: E402

QUOTA = [20, 16, 14]             # Москва, Казань, Ярославль; пополам м/ж (design.md, 18.3)
POOL_MULT = 64                   # пул на ячейку город × пол = 64·n; берётся каждый 64-й
BAL_KEYS = ("ISLAM", "NONDRINK", "SECURE", "INF", "PDIV")   # порядок «змейки» (18.3)
N_BATCH = sum(QUOTA)
T_TRIES = 80                     # как в pairs.py
N_BOOT = 2000                    # как в outcome.py

F_PEOPLE = os.path.join(B.ROOT, "b2-people.json")
F_SELF = os.path.join(B.ROOT, "b2-selfreport.json")
F_PAIRS = os.path.join(B.PRIV, "b2-pairs.json")
F_PV = os.path.join(B.PRIV, "b2-pair-vars.json")
F_OUT = os.path.join(B.PRIV, "b2-outcome.json")
F_ENS = os.path.join(B.PRIV, "b2-outcome-ensemble.json")
F_ENS_S = os.path.join(B.PRIV, "b2-outcome-ensemble-structural.json")
F_BENCH = os.path.join(B.PRIV, "b2-benchmarks.json")
F_LEAK = os.path.join(B.PRIV, "b2-leak-threshold.json")
F_REP_PRIV = os.path.join(B.PRIV, "b2-report-private.json")
F_REPORT = os.path.join(B.ROOT, "generation-report-b2.md")


def trees():
    """Дерево второй партии: те же имена, что в 8.1, внутри дочернего зерна batch2; плюс batch2_balance."""
    top = B.seed_tree()
    return top, B.seed_tree(top["batch2"])


# ================================================================ шаг 1–2: пул, сбалансированный жребий, люди
def pool_frame(rng):
    sex, city, cell = [], [], []
    for c, q in enumerate(QUOTA):
        for s in (0, 1):
            m = POOL_MULT * (q // 2)
            sex += [s] * m
            city += [c] * m
            cell += [2 * c + s] * m
    sex = np.array(sex)
    u = rng.random(len(sex))
    age = np.where(sex == 0, B.AGES[np.searchsorted(np.cumsum(B.AGE_W[0]), u, side="right").clip(0, 10)],
                   B.AGES[np.searchsorted(np.cumsum(B.AGE_W[1]), u, side="right").clip(0, 10)])
    return {"sex": sex, "city": np.array(city), "batch": np.ones(len(sex), int), "age": age}, np.array(cell)


def balance_bits(P):
    return np.column_stack([P["ISLAM"], P["DRINK_LVL"] == 0, B.att_style(P["ANX"], P["AVO"]) == "надёжный",
                            P["INF"], P["PDIV"]]).astype(int)


def serpentine_rank(bits):
    """Номер в порядке «змейки»: направление каждого следующего признака меняется в соседних группах предыдущих."""
    r = np.zeros(len(bits), dtype=np.int64)
    for j in range(bits.shape[1]):
        v = np.where(r % 2 == 0, bits[:, j], 1 - bits[:, j])
        r = 2 * r + v
    return r


def systematic_pick(cell, bits, rng_bal):
    """В каждой ячейке (по порядку: Москва м, Москва ж, Казань м, …) — каждый 64-й из отсортированного пула,
    начиная со случайного номера 0–63. Вероятность попасть в выборку у каждого человека пула — ровно 1/64."""
    rank = serpentine_rank(bits)
    chosen, starts = [], []
    for c in range(2 * len(QUOTA)):
        idx = np.where(cell == c)[0]
        order = idx[np.lexsort((np.arange(len(idx)), rank[idx]))]
        st = int(rng_bal.integers(0, POOL_MULT))
        starts.append(st)
        pick = order[st::POOL_MULT]
        assert len(pick) == len(idx) // POOL_MULT
        chosen.append(pick)
    return np.concatenate(chosen), starts


def sub(D, idx, n):
    return {k: (v[idx] if isinstance(v, np.ndarray) and v.ndim >= 1 and len(v) == n else v) for k, v in D.items()}


def new_ids(rng, n, length, taken):
    out = [x for x in B.opaque_ids(rng, n + 40, length) if x not in taken]
    assert len(out) >= n
    return out[:n]


def step_people(top, t2):
    old = B.load(os.path.join(B.ROOT, "people.json"))
    icpt, cuts5 = old["meta"]["reference_intercepts"], old["meta"]["reference_r5_cuts"]
    rng = B.rng_of(t2, "skeleton")
    frame, cell = pool_frame(rng)
    P, _ = B.derive(frame, rng, icpt)
    S = B.selfreport(P, B.rng_of(t2, "selfreport"))
    B.derive_ext(P, B.rng_of(t2, "skeleton_ext"))
    B.selfreport_ext(P, S, B.rng_of(t2, "selfreport_ext"))
    B.derive_r5(P, B.rng_of(t2, "skeleton_r5"), cuts5)
    B.selfreport_r5(P, S, B.rng_of(t2, "selfreport_r5"), cuts5)
    npool = len(P["sex"])
    bits = balance_bits(P)
    pick, starts = systematic_pick(cell, bits, B.rng_of(top, "batch2_balance"))
    Pp, Sp = sub(P, pick, npool), sub(S, pick, npool)
    ids = new_ids(B.rng_of(t2, "person_ids"), len(pick), 4, {p["id"] for p in old["people"]})
    order = np.argsort(ids)
    people = [B.person_records(Pp, ids)[i] for i in order]
    selfr = [G.self_records(Sp, ids)[i] for i in order]
    meta = {"generator": "research/blind/batch2.py", "batch": 2, "master_seed": B.MASTER_SEED,
            "seed": "seed_tree(seed_tree()['batch2']); balance — 'batch2_balance' (design.md, 18.2)",
            "n": len(ids), "city_quota": dict(zip(B.CITIES, QUOTA)), "pool_mult": POOL_MULT, "balance_keys": BAL_KEYS,
            "min_eig_corr": B.min_eig(), "lib_versions": B.lib_versions(),
            "reference_intercepts": icpt, "reference_r5_cuts": cuts5,
            "batch1_people_sha256": B.sha256(os.path.join(B.ROOT, "people.json")),
            "note": "«правда» о человеке, вторая партия. Не показывать владельцу теста и отвечающему (design.md, 6, 18)."}
    B.dump({"meta": meta, "people": people}, F_PEOPLE)
    B.dump({"meta": {"generator": "research/blind/batch2.py", "batch": 2, "master_seed": B.MASTER_SEED,
                     "lib_versions": B.lib_versions(),
                     "note": "слой самоотчёта второй партии (design.md, 3, 18)"}, "people": selfr}, F_SELF)
    # пул — ожидание генератора для отчёта (агрегаты; люди пула никуда не пишутся)
    return {"P": P, "bits": bits, "cell": cell, "pick": pick, "starts": starts}


# ================================================================ шаг 3–7: пары
def step_pairs(t2):
    people = B.load(F_PEOPLE)["people"]
    P = B.arrays_from_people(people)
    model = B.load(os.path.join(B.PRIV, "model.json"))
    spec = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"]
    a = model["match_weights"]
    alpha = np.array(model["alpha"])
    mdl = {"spec": spec, "k": model["k"], "alpha": alpha, "sim_mu": model["sim_mu"], "sim_sd": model["sim_sd"],
           "sigU": model["sigU"], "gamma": model["gamma"]}
    rnu = B.rng_of(t2, "match_noise")
    groups, rm, rw, rok = [], [], [], []
    for c in range(len(B.CITIES)):
        mi = np.where((P["city"] == c) & (P["sex"] == 0))[0]
        wi = np.where((P["city"] == c) & (P["sex"] == 1))[0]
        nu = rnu.standard_normal((len(mi), len(wi)))
        pr, S, ok = B.match_city(P, mi, wi, a, nu)
        groups.append((mi, wi, S, ok))
        for x, y, o in pr:
            rm.append(x); rw.append(y); rok.append(o)
    rm, rw = np.array(rm), np.array(rw)
    rs = B.rng_of(t2, "real_stage")
    rstage = B.draw_stage(P, rm, rw, rs.random(len(rm)))
    R = (rs.random((len(rm), T_TRIES)), rs.standard_normal((len(rm), T_TRIES)), rs.random((len(rm), T_TRIES)))
    house_z = rs.standard_normal(len(rm))
    klin = model["k"] * B.lin_pred(P, rm, rw, spec, model["sim_mu"], model["sim_sd"])
    rdur, rU, tries, _ = B.prehistory_real(alpha, rstage, klin, model["gamma"], model["sigU"], R)
    part = B.split_real(P, rm, rw, rstage, B.rng_of(t2, "split"))
    person_part = np.empty(len(P["sex"]), dtype=object)
    person_part[rm] = part
    person_part[rw] = part
    real_set = set(zip(rm.tolist(), rw.tolist()))
    cand = B.alt_candidates(groups, real_set, person_part)
    target = int(round(model["alt_target_per_100"] * N_BATCH / 100))
    alt = B.alt_select(P, cand, model["tau"], model["alt_cap"], target,
                       B.rng_of(t2, "alt_select"), B.rng_of(t2, "alt_stage"), mdl, P)
    recs = []
    for i in range(len(rm)):
        recs.append({"m": int(rm[i]), "w": int(rw[i]), "type": "real", "part": part[i], "stage": int(rstage[i]),
                     "dur": float(rdur[i]), "U": float(rU[i]), "house_z": float(house_z[i]),
                     "prehistory_tries": int(tries[i] + 1), "in_age_window": bool(rok[i])})
    for r in alt:
        recs.append({"m": r["m"], "w": r["w"], "type": "alt", "part": person_part[r["m"]], "stage": r["stage"],
                     "dur": r["dur"], "U": r["U"], "house_z": r["house_z"], "survival_prob": r["surv"],
                     "in_age_window": True})
    old_pids = {p["pair_id"] for p in B.load(os.path.join(B.PRIV, "pairs.json"))["pairs"]}
    pids = new_ids(B.rng_of(t2, "pair_ids"), len(recs), 6, old_pids)
    order = np.argsort(pids)
    out = []
    for j in order:
        r = recs[j]
        m, w = r["m"], r["w"]
        living = r["stage"] >= 1
        hs = float(B.house_share(P, np.array([m]), np.array([w]), np.array([r["house_z"]]))[0]) if living else None
        o = {"pair_id": pids[j], "man": P["ids"][m], "woman": P["ids"][w], "city": B.CITIES[P["city"][m]],
             "type": r["type"], "part": r["part"], "stage": B.STAGES[r["stage"]], "duration_months": int(r["dur"]),
             "age_gap_m_minus_w": int(P["age"][m] - P["age"][w]),
             "housework_share_on_woman": None if hs is None else round(hs, 3),
             "U_pair_specific": round(r["U"], 5)}
        if r["type"] == "real":
            o["prehistory_tries"] = r["prehistory_tries"]
            o["in_age_window"] = r["in_age_window"]
        else:
            o["prehistory_survival_prob"] = round(r["survival_prob"], 4)
        out.append(o)
    meta = {"generator": "research/blind/batch2.py", "batch": 2, "master_seed": B.MASTER_SEED,
            "lib_versions": B.lib_versions(), "n_real": int(len(rm)), "n_alt": len(alt), "n_alt_candidates": len(cand),
            "alt_target": target, "people_sha256": B.sha256(F_PEOPLE),
            "model_sha256": B.sha256(os.path.join(B.PRIV, "model.json")),
            "note": "ЗАКРЫТО: тип пары, часть, стадия, U (вторая партия). Пары только внутри второй партии (design.md, 18.4)."}
    B.dump({"meta": meta, "pairs": out}, F_PAIRS)
    return {"n_cand": len(cand), "target": target}


# ================================================================ свойства пар ред. 5
def step_pair_vars(t2):
    P = B.arrays_from_people(B.load(F_PEOPLE)["people"])
    pj = B.load(F_PAIRS)
    m5 = B.load(os.path.join(B.PRIV, "model-r5.json"))
    assert pj["meta"]["people_sha256"] == B.sha256(F_PEOPLE)
    assert m5["model_sha256"] == pj["meta"]["model_sha256"] == B.sha256(os.path.join(B.PRIV, "model.json"))
    assert m5["outcome_spec_r5_sha256"] == B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    idx = {pid: i for i, pid in enumerate(P["ids"])}
    pairs = pj["pairs"]
    m = np.array([idx[p["man"]] for p in pairs])
    w = np.array([idx[p["woman"]] for p in pairs])
    stage = np.array([B.STAGES.index(p["stage"]) for p in pairs])
    dur = np.array([p["duration_months"] for p in pairs], dtype=float)
    Uz = np.array([p["U_pair_specific"] for p in pairs]) / m5["sigU4"]
    E = B.r5_pair_draws(B.rng_of(t2, "pair_r5"), len(m))
    V, _ = B.pair_vars_r5(P, m, w, stage, dur, Uz, E, m5["sexsat_U_corr"], m5["pair_cuts"])
    out = []
    for i, p in enumerate(pairs):
        out.append({
            "pair_id": p["pair_id"],
            "lives_with_parents": bool(V["live"][i]) if stage[i] >= 1 else None,
            "family_of_man_about_pair": B.APPROVE_LEVELS[int(V["app_m"][i])],
            "family_of_woman_about_pair": B.APPROVE_LEVELS[int(V["app_w"][i])],
            "man_conflict_with_her_family": bool(V["inlaw_m"][i]),
            "woman_conflict_with_his_family": bool(V["inlaw_w"][i]),
            "sex_satisfaction_man": B.SEXSAT_LEVELS[int(V["sexsat_m"][i])],
            "sex_satisfaction_woman": B.SEXSAT_LEVELS[int(V["sexsat_w"][i])],
            "sex_frequency": B.DESIRE_LEVELS[int(V["sexfreq"][i])],
            "man_wants_more_than_now": bool(V["wants_more_m"][i]),
            "woman_wants_more_than_now": bool(V["wants_more_w"][i]),
            "sex_satisfaction_pair_latent": round(float(V["sex_raw"][i]), 5),
        })
    meta = {"generator": "research/blind/batch2.py", "batch": 2, "master_seed": B.MASTER_SEED,
            "lib_versions": B.lib_versions(), "pairs_sha256": B.sha256(F_PAIRS),
            "model_r5_sha256": B.sha256(os.path.join(B.PRIV, "model-r5.json")),
            "note": "ЗАКРЫТО: свойства пары ред. 5, вторая партия (design.md, 17.3, 18.4)."}
    B.dump({"meta": meta, "pairs": out}, F_PV)


# ================================================================ шаг 8: исход, ансамбли, потолки
def person_boot_strat(m_id, w_id, fn, rng, reps=N_BOOT):
    """Бутстрэп по людям со слоем «партия» (design.md, 18.6): люди каждой партии тянутся с возвращением отдельно;
    вес пары — кратность мужчины × кратность женщины. m_id, w_id — пары (партия, номер человека)."""
    ppl = sorted(set(m_id) | set(w_id))
    pos = {p: i for i, p in enumerate(ppl)}
    mi = np.array([pos[x] for x in m_id])
    wi = np.array([pos[x] for x in w_id])
    strata = {}
    for p, i in pos.items():
        strata.setdefault(p[0], []).append(i)
    strata = [np.array(v) for _, v in sorted(strata.items())]
    out = []
    for _ in range(reps):
        cnt = np.zeros(len(ppl), int)
        for st in strata:
            cnt += np.bincount(st[rng.integers(0, len(st), len(st))], minlength=len(ppl))
        wt = cnt[mi] * cnt[wi]
        if (wt > 0).sum() < 10:
            continue
        out.append(fn(wt.astype(float)))
    return np.array(out)


def step_outcome(t2):
    people = B.load(F_PEOPLE)["people"]
    selfr = B.load(F_SELF)["people"]
    assert [p["id"] for p in people] == [s["id"] for s in selfr]
    P = B.arrays_from_people(people)
    S = self_arrays(selfr, P)
    pj = B.load(F_PAIRS)
    model = B.load(os.path.join(B.PRIV, "model.json"))
    m5 = B.load(os.path.join(B.PRIV, "model-r5.json"))
    pv = B.load(F_PV)
    spec4 = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    spec5 = B.load(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"] == m5["outcome_spec_sha256"]
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json")) == m5["outcome_spec_r5_sha256"]
    assert pj["meta"]["model_sha256"] == B.sha256(os.path.join(B.PRIV, "model.json")) == m5["model_sha256"]
    assert pj["meta"]["people_sha256"] == B.sha256(F_PEOPLE)
    assert pv["meta"]["pairs_sha256"] == B.sha256(F_PAIRS)
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
    V = PVmod.arrays(pv, pairs, m5["pair_cuts"])
    rx = B.rng_of(t2, "expect_r5")
    EVt = B.pair_vars_expected(P, m, w, m5["pair_cuts"], rx, m5["expect_draws"], m5["sexsat_U_corr"])
    EVs = B.pair_vars_expected(S, m, w, m5["pair_cuts"], rx, m5["expect_draws"], m5["sexsat_U_corr"])
    strength = []
    for VV, lab in ((V, "realized"), (EVt, "expected")):
        for wh in ("break", "sat"):
            r = B.r5_strength_check(P, m, w, spec, VV, wh)
            strength.append({"pair_vars": lab, **r})
            assert r["ok"], "правило 17.5 нарушено на парах второй партии — остановка (design.md, 18.5)"
    IND, MIS, SIM, PR, F = B.components_r5(P, m, w, spec, V, mu, sd)
    PE = B.pair_terms(P, m, w, EVt, spec["pair"])
    lin = IND + MIS + SIM + PR
    lin_sk = IND + MIS + SIM + PE
    p_break = B.p3(alpha, stage, dur, k * lin, U5, gamma)
    broke = B.rng_of(t2, "breakup_V").random(len(m)) < p_break
    rs = B.rng_of(t2, "sat_time")
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
    Wt = rs.random(len(m))
    month = 1 + np.floor(35 * Wt ** np.exp(.5 * zlp)).astype(int)
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
    meta = {"generator": "research/blind/batch2.py", "batch": 2, "master_seed": B.MASTER_SEED,
            "lib_versions": B.lib_versions(), "revision": "5.1", "pairs_sha256": B.sha256(F_PAIRS),
            "pair_vars_sha256": B.sha256(F_PV), "model_r5_sha256": B.sha256(os.path.join(B.PRIV, "model-r5.json")),
            "outcome_spec_r5_sha256": B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json")),
            "note": "ЗАКРЫТО. Исход второй партии по формуле ред. 5.1 (без изменений), посчитан до любого текста. "
                    "risk_logit_skeleton — главная метрика."}
    B.dump({"meta": meta, "outcomes": out}, F_OUT)

    # основной ансамбль (30 формул)
    ens = []
    for e_ in m5["ensemble"]:
        a_, b_, c_, _, _ = B.components_r5(P, m, w, e_, EVt, mu, sd)
        ens.append(np.round(k * (a_ + b_ + c_ + B.pair_terms(P, m, w, EVt, e_["pair"])), 5))
    B.dump({"meta": {"note": "риск по скелету (k·lin, ред. 5.1) для каждого члена ансамбля; вторая партия",
                     "outcome_sha256": B.sha256(F_OUT)},
            "pair_ids": [p["pair_id"] for p in pairs], "risk_logit_skeleton": np.array(ens)}, F_ENS)

    # ансамбль другого устройства (24 варианта): веса взаимодействий и замен — уже подобранные на калибровке
    import ensemble_structural as ESmod
    es = B.load(ESmod.SPEC_ES)
    es_old = B.load(os.path.join(B.PRIV, "outcome-ensemble-structural.json"))
    assert es_old["meta"]["spec_sha256"] == B.sha256(ESmod.SPEC_ES)
    xs = es_old["strong_interaction_weights_lin"]
    EV2 = B.pair_vars_expected(P, m, w, m5["pair_cuts"], B.rng_of(t2, "expect_r5"), m5["expect_draws"], m5["sexsat_U_corr"])
    central = k * ESmod.lin_variant(P, m, w, spec, mu, sd, es, {}, EV2)
    assert np.allclose(np.round(central, 5), np.array([o["risk_logit_skeleton"] for o in out])), \
        "точечная формула не воспроизводится в ансамбле другого устройства"
    risks, agree = [], {}
    for v in es["variants"]:
        r = k * ESmod.lin_variant(P, m, w, spec, mu, sd, es, v, EV2, xs)
        risks.append(np.round(r, 5))
        agree[v["name"]] = round(float(spearmanr(r, central).correlation), 4)
    B.dump({"meta": {"generator": "research/blind/batch2.py", "batch": 2, "lib_versions": B.lib_versions(),
                     "revision": "5.1", "spec_sha256": B.sha256(ESmod.SPEC_ES),
                     "weights_from": "private/outcome-ensemble-structural.json (strong_interaction_weights_lin)",
                     "outcome_sha256": B.sha256(F_OUT), "note": "ЗАКРЫТО. Варианты другого устройства, вторая партия."},
            "variants": [v["name"] for v in es["variants"]], "pair_ids": [p["pair_id"] for p in pairs],
            "risk_logit_skeleton": np.array(risks), "agreement_spearman_with_central": agree}, F_ENS_S)

    # формула по самоотчёту (потолок)
    sIND, sMIS, sSIM, _, _ = B.components_r5(S, m, w, spec, EVs, mu, sd)
    sPE = B.pair_terms(S, m, w, EVs, spec["pair"])
    lin_self = sIND + sMIS + sSIM + sPE
    B.dump({"pair_ids": [p["pair_id"] for p in pairs],
            "selfreport_formula": np.round(k * lin_self, 5), "selfreport_IND": np.round(k * sIND, 5),
            "selfreport_MIS": np.round(k * sMIS, 5), "selfreport_PAIR": np.round(k * sPE, 5),
            "skeleton_IND": np.round(k * IND, 5), "skeleton_MIS": np.round(k * MIS, 5),
            "skeleton_PAIR": np.round(k * PE, 5)}, F_BENCH)

    # потолок самоотчёта и порог утечки: объединённая рабочая часть, проверочная часть второй партии, вся вторая партия
    b1p = B.load(os.path.join(B.PRIV, "pairs.json"))["pairs"]
    b1o = {o["pair_id"]: o for o in B.load(os.path.join(B.PRIV, "outcome.json"))["outcomes"]}
    b1b = B.load(os.path.join(B.PRIV, "benchmarks.json"))
    b1self = dict(zip(b1b["pair_ids"], b1b["selfreport_formula"]))
    rows = []   # (партия, man, woman, часть, распад, по самоотчёту, по скелету, стадия)
    for p in b1p:
        o = b1o[p["pair_id"]]
        rows.append((1, p["man"], p["woman"], p["part"], not o["together_3y"], b1self[p["pair_id"]],
                     o["risk_logit_skeleton"], B.STAGES.index(p["stage"])))
    for i, p in enumerate(pairs):
        rows.append((2, p["man"], p["woman"], p["part"], bool(broke[i]), float(k * lin_self[i]), float(k * lin_sk[i]),
                     int(stage[i])))
    rb = B.rng_of(t2, "bootstrap")
    thr = {}
    for name, sel in (("work_combined", lambda r: r[3] == "work"), ("holdout_batch2", lambda r: r[0] == 2 and r[3] == "holdout"),
                      ("work_batch2", lambda r: r[0] == 2 and r[3] == "work"), ("all_batch2", lambda r: r[0] == 2)):
        R_ = [r for r in rows if sel(r)]
        m_id = [(r[0], r[1]) for r in R_]
        w_id = [(r[0], r[2]) for r in R_]
        y = np.array([r[4] for r in R_])
        x = np.array([r[5] for r in R_])
        lk = np.array([r[6] for r in R_])
        sg = np.array([r[7] for r in R_])
        one = np.ones(len(R_))
        rho0 = wspear(x, lk, one)
        bsr = person_boot_strat(m_id, w_id, lambda wt: wspear(x, lk, wt), rb)
        a0 = wauc_strat(y, x, one, sg)
        bsa = person_boot_strat(m_id, w_id, lambda wt: wauc_strat(y, x, wt, sg), rb)
        thr[name] = {"n_pairs": len(R_), "n_people": len(set(m_id) | set(w_id)), "n_breakups": int(y.sum()),
                     "MAIN_selfreport_ceiling_spearman_vs_skeleton_risk": round(rho0, 4),
                     "MAIN_leak_threshold_spearman": round(float(np.nanpercentile(bsr, 97.5)), 4),
                     "MAIN_spearman_boot_95": [round(float(np.nanpercentile(bsr, 2.5)), 4),
                                               round(float(np.nanpercentile(bsr, 97.5)), 4)],
                     "selfreport_ceiling_auc": round(a0, 4),
                     "leak_threshold_auc": round(float(np.nanpercentile(bsa, 97.5)), 4)}
    B.dump({"note": "Вторая партия (design.md, 18.5): потолок самоотчёта (формула ред. 5.1 по самоотчёту) и порог утечки = "
                    "верхняя граница 95% бутстрэпа по людям со слоем «партия». work_combined — рабочие пары обеих партий. "
                    "Записан до первого текста второй партии. Порог первой партии (leak-threshold.json) не пересчитывается.",
            "outcome_sha256": B.sha256(F_OUT), "batch1_outcome_sha256": B.sha256(os.path.join(B.PRIV, "outcome.json")),
            "thresholds": thr}, F_LEAK)
    return {"P": P, "m": m, "w": w, "stage": stage, "p_break": p_break, "broke": broke, "F": F, "V": V,
            "pairs": pairs, "thr": thr, "strength": strength, "agree": agree, "month": month}


# ================================================================ отчёт
def pc(x):
    return f"{100 * float(x):.1f}%"


def report(pool, pr_info, oc):
    P0 = pool["P"]
    pick = pool["pick"]
    people = B.load(F_PEOPLE)["people"]
    P = B.arrays_from_people(people)
    selfr = B.load(F_SELF)["people"]
    S = self_arrays(selfr, P)
    n = len(people)
    L = ["# Слепая выборка, вторая партия: отчёт генерации", "",
         "Сгенерировано `research/blind/batch2.py` (не править руками; design.md, 18). Отчёт агрегатный: ни id, ни "
         "коэффициентов формулы исхода, ни исходов отдельных пар. «Выборка» — 50 новых людей и их пары. «Ожидание» — пул "
         f"того же генератора ({len(P0['sex'])} человек, из которого систематической выборкой взят каждый {POOL_MULT}-й, "
         "18.3); калибровочные проверки генератора (доли ±3 п. п., корреляции, SD) — в `generation-report.md` первой партии: "
         "генератор не менялся.", "",
         f"Хеши: b2-people.json `{B.sha256(F_PEOPLE)[:16]}`, b2-selfreport.json `{B.sha256(F_SELF)[:16]}`, "
         f"private/b2-pairs.json `{B.sha256(F_PAIRS)[:16]}`, private/b2-pair-vars.json `{B.sha256(F_PV)[:16]}`, "
         f"private/b2-outcome.json `{B.sha256(F_OUT)[:16]}`. Формула исхода — ред. 5.1 без изменений "
         f"(outcome-spec-r5.json `{B.sha256(os.path.join(B.PRIV, 'outcome-spec-r5.json'))[:16]}`). "
         f"Версии: numpy {B.lib_versions()['numpy']}, scipy {B.lib_versions()['scipy']}.", ""]
    bad = []

    def tbl(title, rows, head=("Показатель", "Задумано", "Выборка", "Ожидание (пул)")):
        L.extend([f"## {title}", "", "| " + " | ".join(head) + " |", "|" + "---|" * len(head)])
        for r in rows:
            L.append("| " + " | ".join(str(x) for x in r) + " |")
        L.append("")

    # ---- состав и балансировка
    sex = P["sex"]
    rows = [("мужчины / женщины", "25 / 25", f"{(sex == 0).sum()} / {(sex == 1).sum()}", "—")]
    for c, q in enumerate(QUOTA):
        rows.append((f"город: {B.CITIES[c]}", q, int((P["city"] == c).sum()), "—"))
    rows.append(("возраст", "20–30", f"{P['age'].min()}–{P['age'].max()}", f"{P0['age'].min()}–{P0['age'].max()}"))
    rows.append(("средний возраст м − ж", "≈ +1,8", f"{P['age'][sex == 0].mean() - P['age'][sex == 1].mean():+.2f}",
                 f"{P0['age'][P0['sex'] == 0].mean() - P0['age'][P0['sex'] == 1].mean():+.2f}"))
    tbl("Состав", rows)
    bits = pool["bits"]
    names = {"ISLAM": "мусульманин", "NONDRINK": "не пьёт", "SECURE": "надёжная привязанность", "INF": "изменял(а) в прошлом",
             "PDIV": "родители расстались до 15 лет"}
    rows = []
    for j, kk in enumerate(BAL_KEYS):
        exp_ = float(bits[:, j].mean()) * n
        rows.append((names[kk], "ожидание пула × 50", int(bits[pick, j].sum()), f"{exp_:.1f}"))
    for c in range(len(QUOTA)):
        mk = P0["city"] == c
        exp_ = float(P0["ISLAM"][mk].mean()) * QUOTA[c]
        rows.append((f"мусульмане, {B.CITIES[c]}", "ожидание пула × квота", int(P["ISLAM"][P["city"] == c].sum()), f"{exp_:.1f}"))
    tbl("Сбалансированный жребий (13.4, 18.3): число людей с признаком", rows,
        ("Признак", "Ожидание", "Выборка", "Ожидание (пул), чел."))
    L.append(f"Начала систематической выборки по ячейкам (Москва м, Москва ж, Казань м, …): {pool['starts']}.")
    L.append("")

    # ---- выборка против ожидания (как 13.4): z = (выборка − пул) / SE простого жребия (у сбалансированных — с запасом)
    young, young0 = P["age"] <= 24, P0["age"] <= 24
    nm, nm0 = ~P["ISLAM"], ~P0["ISLAM"]
    att = B.att_style(P["ANX"], P["AVO"]) == "надёжный"
    att0 = B.att_style(P0["ANX"], P0["AVO"]) == "надёжный"
    drinkers, drinkers0 = P["DRINK_LVL"] > 0, P0["DRINK_LVL"] > 0
    hf = B.freq_of(P["HOST"]) == 3
    hf0 = B.freq_of(P0["HOST"]) == 3
    ind_rows = [
        ("не пьют, 20–24 (без мусульман)", (P["DRINK_LVL"] == 0)[young & nm], (P0["DRINK_LVL"] == 0)[young0 & nm0], True),
        ("не пьют, 25–30 (без мусульман)", (P["DRINK_LVL"] == 0)[~young & nm], (P0["DRINK_LVL"] == 0)[~young0 & nm0], True),
        ("еженедельно и чаще среди пьющих, м", (P["DRINK_LVL"] == 3)[drinkers & (sex == 0)],
         (P0["DRINK_LVL"] == 3)[drinkers0 & (P0["sex"] == 0)], False),
        ("еженедельно и чаще среди пьющих, ж", (P["DRINK_LVL"] == 3)[drinkers & (sex == 1)],
         (P0["DRINK_LVL"] == 3)[drinkers0 & (P0["sex"] == 1)], False),
        ("надёжная привязанность", att, att0, True),
        ("изменял(а) в прошлом, 20–24", P["INF"][young], P0["INF"][young0], False),
        ("изменял(а) в прошлом, 25–30", P["INF"][~young], P0["INF"][~young0], False),
        ("тревожность ECR-R, M", B.ecr_anx(P["ANX"]), B.ecr_anx(P0["ANX"]), False),
        ("избегание ECR-R, M", B.ecr_avo(P["AVO"]), B.ecr_avo(P0["AVO"]), False),
        ("родители расстались до 15 лет", P["PDIV"], P0["PDIV"], False),
        ("враждебность «часто»", hf, hf0, False),
        ("рискованное питьё, м", P["RISKY"][sex == 0], P0["RISKY"][P0["sex"] == 0], False),
        ("проблемный долг", P["DEBT_PROB"], P0["DEBT_PROB"], False),
        ("тайно проверял телефон", P["JEAL"], P0["JEAL"], False),
    ]
    L.extend(["## Выборка против ожидания генератора", "",
              "Ожидание — доля или среднее в пуле того же генератора. z = (выборка − ожидание) / SE простого жребия при n "
              "выборки (у признаков сбалансированного жребия настоящий разброс меньше — z для них консервативен). |z| > 2 — "
              "строка в «Не сошлось». «В здоровую сторону» — отклонение к меньшему риску; знаковый тест — внизу.", "",
              "| Показатель | n | Ожидание | Выборка | z | В здоровую сторону |", "|---|---|---|---|---|---|"])
    healthy = []
    for name, x, x0, good_high in ind_rows:
        x, x0 = np.asarray(x, float), np.asarray(x0, float)
        if len(x) == 0:
            continue
        se = x0.std() / np.sqrt(len(x))
        z = (x.mean() - x0.mean()) / se if se > 0 else 0.0
        h = (z > 0) == good_high if z != 0 else None
        if h is not None:
            healthy.append(h)
        L.append(f"| {name} | {len(x)} | {x0.mean():.3f} | {x.mean():.3f} | {z:+.2f} | {'да' if h else ('нет' if h is not None else '—')} |")
        if abs(z) > 2:
            bad.append(f"Выборка вне ±2 SE: {name} — ожидание {x0.mean():.3f}, выборка {x.mean():.3f}, z = {z:+.2f}")
    for c in range(len(QUOTA)):
        x = P["ISLAM"][P["city"] == c].astype(float)
        x0 = P0["ISLAM"][P0["city"] == c].astype(float)
        se = x0.std() / np.sqrt(len(x))
        z = (x.mean() - x0.mean()) / se
        L.append(f"| ислам, {B.CITIES[c]} | {len(x)} | {x0.mean():.3f} | {x.mean():.3f} | {z:+.2f} | — |")
        if abs(z) > 2:
            bad.append(f"Выборка вне ±2 SE: ислам, {B.CITIES[c]} — z = {z:+.2f}")
    for s_, sl in ((1, "ж"), (0, "м")):
        for yg, yl in ((False, "25–30"), (True, "20–24")):
            mk = (sex == s_) & (young == yg) & ~np.isnan(P["KIDS_N"])
            mk0 = (P0["sex"] == s_) & (young0 == yg) & ~np.isnan(P0["KIDS_N"])
            x, x0 = P["KIDS_N"][mk], P0["KIDS_N"][mk0]
            se = x0.std() / np.sqrt(max(len(x), 1))
            z = (x.mean() - x0.mean()) / se if len(x) else 0.0
            L.append(f"| желаемое число детей, {sl} {yl}, среднее | {len(x)} | {x0.mean():.3f} | {x.mean():.3f} | {z:+.2f} | — |")
            if abs(z) > 2:
                bad.append(f"Выборка вне ±2 SE: желаемое число детей, {sl} {yl} — z = {z:+.2f}")
    # корреляции латентных (2.5.2): доля вне ±1,96 SE и максимум |z|
    R0 = B.corr_matrix()
    Z = np.column_stack([P[kk] for kk in B.LATENT])
    Rs = np.corrcoef(Z.T)
    iu = np.triu_indices(len(B.LATENT), 1)
    zc = (Rs[iu] - R0[iu]) / ((1 - R0[iu] ** 2) / np.sqrt(n - 1))
    L.append(f"| корреляции латентных: доля вне ±1,96 SE (из {len(zc)}; ожидание ≈ 5%) |  | 0.050 | {np.mean(np.abs(zc) > 1.96):.3f} |  | — |")
    L.append(f"| корреляции латентных: макс. модуль z (ожидание ≈ 3,0) |  | 3.000 | {np.abs(zc).max():.2f} |  | — |")
    sds = np.array([P[kk].std() for kk in B.LATENT])
    L.append(f"| SD латентных: минимум / медиана (на 50 людях — справочно; правило ≥ 0,9 — на калибровке) |  | 1.00 | "
             f"{sds.min():.2f} / {np.median(sds):.2f} |  | — |")
    k_h = int(sum(healthy))
    pbin = binomtest(k_h, len(healthy), .5).pvalue if healthy else 1.0
    L.extend(["", f"Знаковый тест: в здоровую сторону {k_h} из {len(healthy)} показателей с направлением, p = {pbin:.3f} "
                  "(двусторонний).", ""])
    if pbin < .05:
        bad.append(f"выборка сдвинута в одну сторону (знаковый тест p = {pbin:.3f})")
    if np.mean(np.abs(zc) > 1.96) > .10:
        bad.append("корреляции латентных: доля вне ±1,96 SE больше 10%")

    # ---- трудные и новые поля (2.5.4, 13.2, 17.9)
    rows = [
        ("тревожность ECR-R > 5", "≈ 15–16%", pc((B.ecr_anx(P["ANX"]) > 5).mean()), pc((B.ecr_anx(P0["ANX"]) > 5).mean())),
        ("рискованное питьё, все", "≈ 4%", pc(P["RISKY"].mean()), pc(P0["RISKY"].mean())),
        ("проблемный долг", "6%", pc(P["DEBT_PROB"].mean()), pc(P0["DEBT_PROB"].mean())),
        ("изменял(а) в прошлом, все", "≈ 23%", pc(P["INF"].mean()), pc(P0["INF"].mean())),
        ("враждебность «часто»", "15%", pc(hf.mean()), pc(hf0.mean())),
        ("надёжная привязанность", "55–60%", pc(att.mean()), pc(att0.mean())),
    ]
    for kk, lab in (("DEFENS", "оборона в ссорах"), ("JEAL_FEEL", "ревность как чувство"), ("CONTROL", "контроль партнёра"),
                    ("LIE", "приврать в мелочах")):
        f = np.array([B.FREQ.index(r[{"DEFENS": "conflict_defensiveness", "JEAL_FEEL": "jealousy_feeling",
                                      "CONTROL": "controlling_partner", "LIE": "lies_to_partner_small_things"}[kk]])
                      for r in people])
        tgt = np.diff(np.concatenate([[0], B.EXT_CUTS[kk], [1]]))
        rows.append((f"{lab}: почти никогда / редко / иногда / часто", " / ".join(f"{100 * t:.0f}" for t in tgt),
                     " / ".join(f"{100 * (f == i).mean():.0f}" for i in range(4)),
                     " / ".join(f"{100 * (P0[kk + '_F'] == i).mean():.0f}" for i in range(4))))
    for kk in B.R5_LAT:
        lv = len(B.R5_SHARES[kk])
        rows.append((f"{kk}: доли категорий", " / ".join(f"{100 * t:.0f}" for t in B.R5_SHARES[kk]),
                     " / ".join(f"{100 * (P[kk + '_F'] == i).mean():.0f}" for i in range(lv)),
                     " / ".join(f"{100 * (P0[kk + '_F'] == i).mean():.0f}" for i in range(lv))))
    rr = [float(np.corrcoef(P[kk], S[kk])[0, 1]) for kk in B.SR_DIR]
    rows.append(("самоотчёт: r «правда — самоотчёт» по 10 чертам, среднее", "0,77–0,79 (калибровка)", f"{np.mean(rr):.2f}", "—"))
    sh = [float(np.mean(S[kk] - P[kk]) * s_) for kk, s_ in B.SR_DIR.items()]
    rows.append(("самоотчёт: средний сдвиг к желательному, SD", "≈ 0,4", f"{np.mean(sh):.2f}", "—"))
    tbl("Скелет и самоотчёт: трудные люди и новые поля (2.5, 13.2, 17.9)", rows)

    # ---- пары
    pairs, m, w, stage, F, V = oc["pairs"], oc["m"], oc["w"], oc["stage"], oc["F"], oc["V"]
    typ = np.array([p["type"] for p in pairs])
    part = np.array([p["part"] for p in pairs])
    real = typ == "real"
    deg = np.bincount(np.concatenate([m, w]), minlength=n)
    ppart = {}
    for p in pairs:
        ppart.setdefault(p["man"], set()).add(p["part"])
        ppart.setdefault(p["woman"], set()).add(p["part"])
    rows = [("всего пар", "25 настоящих + до 65 дополнительных", len(pairs)),
            ("настоящих / дополнительных", f"25 / цель {pr_info['target']}", f"{real.sum()} / {(~real).sum()} "
             f"(кандидатов {pr_info['n_cand']})"),
            ("пар на человека: мин / среднее / макс", "≈ 3–4 в первой партии; здесь меньше (малые пулы)",
             f"{deg.min()} / {deg.mean():.1f} / {deg.max()}")]
    for pt in ("work", "holdout"):
        ppl = {x for x, s_ in ppart.items() if pt in s_}
        mk = part == pt
        rows.append((f"часть {pt}: людей / пар (настоящих + доп.)", "60/40 по людям (Ярославль 50/50)",
                     f"{len(ppl)} / {mk.sum()} ({(mk & real).sum()} + {(mk & ~real).sum()})"))
    rows.append(("людей в обеих частях", 0, sum(len(s_) > 1 for s_ in ppart.values())))
    cities = np.array([p["city"] for p in pairs])
    for c in B.CITIES:
        rows.append((f"пар в городе {c}: work / holdout", "—", f"{((cities == c) & (part == 'work')).sum()} / "
                     f"{((cities == c) & (part == 'holdout')).sum()}"))
    if real.sum() > 2:
        cr = B.pair_corrs(P, m[real], w[real])
        for kk, lab, t in (("REL", "религиозность", .60), ("EDU", "образование", .50), ("TRAD", "традиционализм", .45),
                           ("VIEWS", "оси взглядов (ср.)", .25), ("KIDS", "желаемое число детей", .30),
                           ("DRINK", "алкоголь", .35), ("SMOKE", "никотин", .25), ("PERS", "личность (ср. по 7)", .05)):
            rows.append((f"r внутри настоящих пар: {lab}", f"{t:.2f} (в пулах 7–10 на пол — ниже, 18.4)", f"{cr[kk]:.2f}"))
        rows.append(("разница возрастов м − ж, настоящие: среднее (SD)", "+2 (2,5)", f"{cr['AGE_MEAN']:+.1f} ({cr['AGE_SD']:.1f})"))
        rows.append(("ислам: оба мусульмане среди настоящих пар с мусульманином", "85% (недостижимо в малых пулах)",
                     "—" if np.isnan(cr["ISL_MATCH"]) else pc(cr["ISL_MATCH"])))
    for s_, lab, t in ((0, "встречаются", "31%"), (1, "живут вместе", "21%"), (2, "в браке", "48%")):
        rows.append((f"стадия «{lab}», настоящие", t, pc((stage[real] == s_).mean())))
    for kk, lab in (("kids_hard", "дети: жёсткое"), ("kids_soft", "дети: мягкое"), ("drink", "пьянство"),
                    ("rel", "религиозность"), ("money", "деньги")):
        rows.append((f"несовпадение «{lab}»: настоящие / доп.", "доп. после отсева ≈ настоящие",
                     f"{pc(F[kk][real].mean())} / {pc(F[kk][~real].mean()) if (~real).any() else '—'}"))
    living = stage >= 1
    rows.append(("живут с родителями одного из партнёров (среди живущих вместе)", "15% (< 25) / 5% (≥ 25)",
                 pc(V["live"][living].mean()) if living.any() else "—"))
    app = np.concatenate([V["against_m"], V["against_w"]]), np.concatenate([V["neutral_m"], V["neutral_w"]])
    rows.append(("родня о паре: против / нейтрально (обе стороны)", "10 / 20%", f"{pc(app[0].mean())} / {pc(app[1].mean())}"))
    inl = np.concatenate([V["inlaw_m"], V["inlaw_w"]])
    st2 = np.concatenate([stage, stage])
    rows.append(("заметный конфликт с роднёй партнёра: встречаются / живут вместе и в браке", "8 / 20%",
                 f"{pc(inl[st2 == 0].mean()) if (st2 == 0).any() else '—'} / {pc(inl[st2 >= 1].mean()) if (st2 >= 1).any() else '—'}"))
    L.extend(["## Пары", "", "| Показатель | Задумано | Выборка |", "|---|---|---|"])
    for r in rows:
        L.append("| " + " | ".join(str(x) for x in r) + " |")
    L.append("")

    # ---- исход (агрегаты, как в отчёте первой партии)
    pb, br = oc["p_break"], oc["broke"]
    rows = [("доля распадов за 3 года, все пары: ожидаемая / выпавшая", "≈ 0,28–0,30", f"{pb.mean():.3f} / {br.mean():.3f} ({br.sum()} из {len(br)})")]
    for s_, lab, t in ((0, "встречаются", .50), (1, "живут вместе", .30), (2, "в браке", .15)):
        mk = stage == s_
        if mk.any():
            rows.append((f"распад, «{lab}»: ожидаемый / выпавший", f"{t:.2f}", f"{pb[mk].mean():.3f} / {br[mk].mean():.3f} (n={mk.sum()})"))
    for pt in ("work", "holdout"):
        mk = part == pt
        rows.append((f"распад, часть {pt}: ожидаемый / выпавший", "—", f"{pb[mk].mean():.3f} / {br[mk].mean():.3f} ({br[mk].sum()} из {mk.sum()})"))
    ok17 = all(r["ok"] for r in oc["strength"])
    rows.append(("правило 17.5 «ни один новый фактор не сильнее сильных ред. 4» на всех парах второй партии", "да", "да" if ok17 else "НЕТ"))
    L.extend(["## Исход (формула ред. 5.1 без изменений)", "", "| Показатель | Задумано | Выборка |", "|---|---|---|"])
    for r in rows:
        L.append("| " + " | ".join(str(x) for x in r) + " |")
    L.append("")

    # ---- мощность: потолок самоотчёта
    L.extend(["## Мощность и порог утечки (до текстов)", "",
              "Потолок самоотчёта — Spearman формулы исхода по самоотчёту с риском по скелету; интервал — 95% бутстрэп по людям "
              "со слоем «партия» (18.6). Порог утечки = верхняя граница интервала.", "",
              "| Набор | людей / пар | Потолок самоотчёта [95%] | Порог утечки |", "|---|---|---|---|"])
    for name, lab in (("work_combined", "объединённая рабочая часть (партии 1 + 2)"), ("work_batch2", "рабочая часть партии 2"),
                      ("holdout_batch2", "проверочная часть партии 2"), ("all_batch2", "вся партия 2")):
        t = oc["thr"][name]
        L.append(f"| {lab} | {t['n_people']} / {t['n_pairs']} | {t['MAIN_selfreport_ceiling_spearman_vs_skeleton_risk']:.2f} "
                 f"[{t['MAIN_spearman_boot_95'][0]:.2f}; {t['MAIN_spearman_boot_95'][1]:.2f}] | {t['MAIN_leak_threshold_spearman']:.2f} |")
    nw = oc["thr"]["work_combined"]["n_people"]
    L.extend(["", f"Ожидаемая ширина интервала главной метрики на объединённой рабочей части (18.6): ≈ 0,77·√(58/{nw}) = "
                  f"{0.77 * np.sqrt(58 / nw):.2f} (сейчас 0,77 на 58 людях).", ""])
    if not ok17:
        bad.append("правило 17.5 нарушено")
    L.extend(["## Не сошлось", ""] + ([f"- {b}" for b in bad] if bad else ["- ничего"]) + [""])
    with open(F_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    B.dump({"note": "ЗАКРЫТО: агрегаты второй партии, которые подсказывают устройство формулы (design.md, 15.1).",
            "structural_agreement_spearman_with_central": oc["agree"], "strength_check_17_5": oc["strength"]}, F_REP_PRIV)
    return bad


def main():
    B.check_versions()
    assert B.min_eig() > 0
    top, t2 = trees()
    pool = step_people(top, t2)
    pr_info = step_pairs(t2)
    step_pair_vars(t2)
    oc = step_outcome(t2)
    bad = report(pool, pr_info, oc)
    pj = B.load(F_PAIRS)
    print(f"вторая партия: людей {len(B.load(F_PEOPLE)['people'])}; пар {len(pj['pairs'])} "
          f"(настоящих {pj['meta']['n_real']}, дополнительных {pj['meta']['n_alt']}); "
          f"b2-outcome.json sha256 {B.sha256(F_OUT)[:16]}; «не сошлось»: {len(bad)}")


if __name__ == "__main__":
    main()
