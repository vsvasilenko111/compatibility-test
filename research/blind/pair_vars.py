"""Свойства пары ред. 5 (design.md, 17.3): жизнь с родителями, отношение родни, конфликт с роднёй партнёра,
сексуальная удовлетворённость каждого, фактическая частота. Как доля быта — только здесь, в закрытом файле:
ни в самоотчёт, ни в досье, ни в самоописание не входят.

Запуск из корня проекта (после pairs.py и calibrate_r5.py):  python3 research/blind/pair_vars.py
Выход: research/blind/private/pair-vars.json (закрыто)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402


def main():
    B.check_versions()
    tree = B.seed_tree()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    P = B.arrays_from_people(people)
    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    m5 = B.load(os.path.join(B.PRIV, "model-r5.json"))
    assert pj["meta"]["people_sha256"] == B.sha256(os.path.join(B.ROOT, "people.json"))
    assert m5["model_sha256"] == pj["meta"]["model_sha256"] == B.sha256(os.path.join(B.PRIV, "model.json"))
    assert m5["outcome_spec_r5_sha256"] == B.sha256(os.path.join(B.PRIV, "outcome-spec-r5.json"))
    idx = {pid: i for i, pid in enumerate(P["ids"])}
    pairs = pj["pairs"]
    m = np.array([idx[p["man"]] for p in pairs])
    w = np.array([idx[p["woman"]] for p in pairs])
    stage = np.array([B.STAGES.index(p["stage"]) for p in pairs])
    dur = np.array([p["duration_months"] for p in pairs], dtype=float)
    Uz = np.array([p["U_pair_specific"] for p in pairs]) / m5["sigU4"]
    E = B.r5_pair_draws(B.rng_of(tree, "pair_r5"), len(m))
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
    meta = {"generator": "research/blind/pair_vars.py", "master_seed": B.MASTER_SEED, "lib_versions": B.lib_versions(),
            "pairs_sha256": B.sha256(os.path.join(B.PRIV, "pairs.json")),
            "model_r5_sha256": B.sha256(os.path.join(B.PRIV, "model-r5.json")),
            "note": "ЗАКРЫТО: свойства пары ред. 5 (design.md, 17.3). Не показывать ни одной LLM-роли и владельцу теста."}
    path = os.path.join(B.PRIV, "pair-vars.json")
    B.dump({"meta": meta, "pairs": out}, path)
    print(f"свойства пары: {len(out)}; pair-vars.json sha256: {B.sha256(path)[:16]}")


def arrays(pv, pairs, cuts):
    """pair-vars.json → массивы членов формулы (R5_TERMS) в порядке pairs."""
    by = {r["pair_id"]: r for r in pv["pairs"]}
    rs = [by[p["pair_id"]] for p in pairs]
    app = lambda key, lv: np.array([float(r[key] == lv) for r in rs])
    sex_raw = np.array([r["sex_satisfaction_pair_latent"] for r in rs])
    return {"sex_z": (sex_raw - cuts["sex_mu"]) / cuts["sex_sd"],
            "against_m": app("family_of_man_about_pair", "против"), "against_w": app("family_of_woman_about_pair", "против"),
            "neutral_m": app("family_of_man_about_pair", "нейтрально"),
            "neutral_w": app("family_of_woman_about_pair", "нейтрально"),
            "inlaw_m": np.array([float(r["man_conflict_with_her_family"]) for r in rs]),
            "inlaw_w": np.array([float(r["woman_conflict_with_his_family"]) for r in rs]),
            "live": np.array([float(bool(r["lives_with_parents"])) for r in rs])}


if __name__ == "__main__":
    main()
