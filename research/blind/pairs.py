"""Шаги 3–4 (design.md, 4): настоящие пары → их стадия и предыстория → разбиение по людям →
дополнительные пары внутри своей части (с отсевом «не доживших») → их стадия.

Запуск из корня проекта (после generate.py и calibrate.py):  python3 research/blind/pairs.py
Выход: research/blind/private/pairs.json  (тип пары real/alt хранится только здесь)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

T_TRIES = 80


def main():
    B.check_versions()
    tree = B.seed_tree()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    P = B.arrays_from_people(people)
    model = B.load(os.path.join(B.PRIV, "model.json"))
    spec = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    assert B.sha256(os.path.join(B.PRIV, "outcome-spec.json")) == model["outcome_spec_sha256"], "spec изменён после калибровки"
    a = model["match_weights"]
    alpha = np.array(model["alpha"])
    mdl = {"spec": spec, "k": model["k"], "alpha": alpha, "sim_mu": model["sim_mu"], "sim_sd": model["sim_sd"],
           "sigU": model["sigU"], "gamma": model["gamma"]}

    # [3] настоящие пары: максимальное паросочетание внутри города
    rnu = B.rng_of(tree, "match_noise")
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

    # [4] стадия, стаж, U настоящих пар (условно на «дожили до начала наблюдения»)
    rs = B.rng_of(tree, "real_stage")
    rstage = B.draw_stage(P, rm, rw, rs.random(len(rm)))
    R = (rs.random((len(rm), T_TRIES)), rs.standard_normal((len(rm), T_TRIES)), rs.random((len(rm), T_TRIES)))
    house_z = rs.standard_normal(len(rm))
    klin = model["k"] * B.lin_pred(P, rm, rw, spec, model["sim_mu"], model["sim_sd"])
    rdur, rU, tries, okk = B.prehistory_real(alpha, rstage, klin, model["gamma"], model["sigU"], R)

    # [5] разбиение по людям (единица — настоящая пара; страты город × стадия)
    part = B.split_real(P, rm, rw, rstage, B.rng_of(tree, "split"))
    person_part = np.empty(len(P["sex"]), dtype=object)
    person_part[rm] = part
    person_part[rw] = part

    # [6–7] дополнительные пары внутри части + их стадия и отсев по предыстории
    real_set = set(zip(rm.tolist(), rw.tolist()))
    cand = B.alt_candidates(groups, real_set, person_part)
    alt = B.alt_select(P, cand, model["tau"], model["alt_cap"], model["alt_target_per_100"],
                       B.rng_of(tree, "alt_select"), B.rng_of(tree, "alt_stage"), mdl, P)

    recs = []
    for i in range(len(rm)):
        recs.append({"m": int(rm[i]), "w": int(rw[i]), "type": "real", "part": part[i], "stage": int(rstage[i]),
                     "dur": float(rdur[i]), "U": float(rU[i]), "house_z": float(house_z[i]),
                     "prehistory_tries": int(tries[i] + 1), "in_age_window": bool(rok[i])})
    for r in alt:
        recs.append({"m": r["m"], "w": r["w"], "type": "alt", "part": person_part[r["m"]], "stage": r["stage"],
                     "dur": r["dur"], "U": r["U"], "house_z": r["house_z"], "survival_prob": r["surv"],
                     "in_age_window": True})
    pids = B.opaque_ids(B.rng_of(tree, "pair_ids"), len(recs), 6)
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
    meta = {"generator": "research/blind/pairs.py", "master_seed": B.MASTER_SEED, "lib_versions": B.lib_versions(),
            "n_real": int(len(rm)), "n_alt": len(alt), "n_alt_candidates": len(cand),
            "people_sha256": B.sha256(os.path.join(B.ROOT, "people.json")),
            "model_sha256": B.sha256(os.path.join(B.PRIV, "model.json")),
            "note": "ЗАКРЫТО: тип пары, часть, стадия, U. Не показывать ни одной LLM-роли и владельцу теста."}
    path = os.path.join(B.PRIV, "pairs.json")
    B.dump({"meta": meta, "pairs": out}, path)
    print(f"пары: настоящих {len(rm)}, дополнительных {len(alt)} (кандидатов {len(cand)}), всего {len(out)}")
    print("pairs.json sha256:", B.sha256(path))


if __name__ == "__main__":
    main()
