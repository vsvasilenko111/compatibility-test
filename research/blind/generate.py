"""Шаги 1–2 (design.md): скелеты 100 человек и слой самоотчёта.

Запуск из корня проекта:  python3 research/blind/generate.py
Выход: research/blind/people.json («правда»), research/blind/selfreport.json («как подаёт себя»).
Человек тянется целиком до составления пар; о будущем партнёре генератор ничего не знает.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

N_BATCH_REF = 2000   # опорная популяция 200 000 человек — только для порогов и интерсептов


def reference_population(tree):
    rng = B.rng_of(tree, "reference")
    frame = B.make_frame(N_BATCH_REF, rng)
    return B.derive(frame, rng, None)


def reference_intercepts(tree):
    return reference_population(tree)[1]


def reference_r5_cuts(tree):
    """Пороги новых полей ред. 5 — на той же опорной популяции, своим зерном reference_r5 (design.md, 17.2)."""
    P, _ = reference_population(tree)
    _, cuts = B.derive_r5(P, B.rng_of(tree, "reference_r5"), None)
    return cuts


def self_records(S, ids):
    recs = []
    for i in range(len(ids)):
        kn = S["KIDS_N"][i]
        recs.append({
            "id": ids[i],
            "sex": "м" if S["sex"][i] == 0 else "ж",
            "age": int(S["age"][i]),
            "city": B.CITIES[S["city"][i]],
            "education": S["edu"][i], "work": S["work"][i], "income_quintile_in_city": int(S["income_q"][i]),
            "attachment": {"anxiety_ecr_1_7": round(float(B.ecr_anx(S["ANX"][i])), 2),
                           "avoidance_ecr_1_7": round(float(B.ecr_avo(S["AVO"][i])), 2)},
            "big5_1_5": {"neuroticism": float(B.five(S["N"][i])), "agreeableness": float(B.five(S["A"][i])),
                         "conscientiousness": float(B.five(S["C"][i]))},
            "conflict": {"hostility_criticism_contempt": B.FREQ[int(S["HOST_FREQ"][i])],
                         "withdrawal_stonewalling": B.FREQ[int(S["WD_FREQ"][i])]},
            "long_term_orientation_1_7": round(float(np.clip(4.8 + 1.2 * S["COMM"][i], 1, 7)), 1),
            "life_satisfaction_1_10": int(np.clip(round(6.5 + 1.8 * S["LS"][i]), 1, 10)),
            "admits_secretly_checking_partner_phone": bool(S["JEAL"][i]),
            **B.ext_record(S, i),
            **B.r5_record(S, i),
            "alcohol": {"frequency": B.DRINK_LEVELS[int(S["DRINK_LVL"][i])]},
            "nicotine": S["smoke"][i],
            "money": {"has_consumer_debt": bool(S["DEBT_ANY"][i]), "admits_problem_debt": bool(S["DEBT_PROB"][i]),
                      "saves_nothing": bool(S["SPEND"][i] > .5)},
            "admits_cheating_in_past": bool(S["INF"][i]),
            "parents": {"born_outside_union": bool(S["BORN_SINGLE"][i]),
                        "parents_separated_before_15": bool(S["PDIV"][i]), "step_parent": bool(S["STEP"][i])},
            "kids": {"wanted": "не знаю" if np.isnan(kn) else ("5+" if kn >= 5 else int(kn)),
                     "first_child_when": S["kids_when"][i]},
            "religion": {"confession": S["CONF"][i], "religiosity": B.REL_LEVELS[int(S["REL_LVL"][i])]},
            "roles": {"man_is_head_of_family": bool(S["PATERNAL"][i]), "man_must_provide": bool(S["BREADW"][i]),
                      "housework_should_be": S["house_ideal"][i]},
            "views_z": {f"{B.VIEW_LABELS[v][0]} ↔ {B.VIEW_LABELS[v][1]}": round(float(S[v][i]), 2) for v in B.VIEW_LABELS},
            "z_self": {k: round(float(S[k][i]), 4) for k in list(B.SR_DIR) + ["TRAD"] + list(B.VIEW_LABELS) + B.EXT_LAT
                       + [x for x in B.R5_LAT if x in S]},
        })
    return recs


def main():
    versions = B.check_versions()
    assert B.min_eig() > 0, "корреляционная матрица не положительно определена"
    tree = B.seed_tree()
    icpt = reference_intercepts(tree)
    rng = B.rng_of(tree, "skeleton")
    frame = B.make_frame(1, rng)
    P, _ = B.derive(frame, rng, icpt)
    ids = B.opaque_ids(B.rng_of(tree, "person_ids"), len(P["sex"]), 4)
    S = B.selfreport(P, B.rng_of(tree, "selfreport"))
    # новые поля с нулевым весом — своими зёрнами, после всех прежних жребиев (design.md, 13.2)
    B.derive_ext(P, B.rng_of(tree, "skeleton_ext"))
    B.selfreport_ext(P, S, B.rng_of(tree, "selfreport_ext"))
    # ред. 5: юмор, близость, родня — своими зёрнами, после всех прежних (design.md, 17.1–17.4)
    cuts5 = reference_r5_cuts(tree)
    B.derive_r5(P, B.rng_of(tree, "skeleton_r5"), cuts5)
    B.selfreport_r5(P, S, B.rng_of(tree, "selfreport_r5"), cuts5)

    order = np.argsort(ids)  # порядок в файле — по случайному id, а не по полу/городу
    people = [B.person_records(P, ids)[i] for i in order]
    selfr = [self_records(S, ids)[i] for i in order]
    meta = {"generator": "research/blind/generate.py", "master_seed": B.MASTER_SEED,
            "n": len(ids), "min_eig_corr": B.min_eig(), "lib_versions": versions,
            "reference_intercepts": icpt, "reference_r5_cuts": cuts5,
            "note": "«правда» о человеке. Не показывать владельцу теста и отвечающему (design.md, 6)."}
    B.dump({"meta": meta, "people": people}, os.path.join(B.ROOT, "people.json"))
    B.dump({"meta": {"generator": "research/blind/generate.py", "master_seed": B.MASTER_SEED, "lib_versions": versions,
                     "note": "слой самоотчёта: как человек себя видит и подаёт (design.md, 3)"},
            "people": selfr}, os.path.join(B.ROOT, "selfreport.json"))
    print("people.json:", B.sha256(os.path.join(B.ROOT, "people.json"))[:16],
          "| selfreport.json:", B.sha256(os.path.join(B.ROOT, "selfreport.json"))[:16])
    print("м/ж:", int((P["sex"] == 0).sum()), int((P["sex"] == 1).sum()),
          "| возраст:", int(P["age"].min()), "–", int(P["age"].max()))


if __name__ == "__main__":
    main()
