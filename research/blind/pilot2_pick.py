"""Жребий 10 настоящих пар рабочей части для второго пилота (reviews/03-pilot.md, critique п. 1).

  python3 research/blind/pilot2_pick.py      → research/blind/pilot/pilot2.json

Из private/pairs.json читаются только поля pair_id, type, part, man, woman; исходы не читаются. Слои — по
inputs/truth: на каждый слой тянется одна пара, где слой есть хотя бы у одного из двоих; остаток — простой жребий.
Зерно — SeedSequence(20261028).spawn(20)[19], имя pilot2_pick.
"""
import json
import os

import numpy as np

from pilot_pick import MASTER_SEED, ROOT, load_truth

SEED_INDEX = 19  # 20-е после pilot_pick (18); прежние зёрна не меняются
N_PAIRS = 10


def cheated(r):
    return r["изменял(а) в прошлых отношениях"] == "да"


def debt(r):
    return r["деньги"]["проблемный долг (просрочки, МФО, долг больше трёх доходов)"] == "да"


def avoidant(r):
    return r["привязанность"]["тип"] in ("избегающий", "тревожно-избегающий")


def stonewalls(r):
    return r["ссоры"]["уход от разговора, молчание"] in ("иногда", "часто")


def traditional(r):
    return r["роли в семье"]["глава семьи — мужчина"] == "да"


def yaroslavl(r):
    return r["город"] == "Ярославль"


def school(r):
    return r["образование"] == "школа"


STRATA = [cheated, debt, avoidant, stonewalls, traditional, yaroslavl, school]


def main():
    with open(os.path.join(ROOT, "private", "pairs.json"), encoding="utf-8") as f:
        pairs = [{k: p[k] for k in ("pair_id", "type", "part", "man", "woman")} for p in json.load(f)["pairs"]]
    real = sorted((p for p in pairs if p["part"] == "work" and p["type"] == "real"), key=lambda p: p["pair_id"])
    truth = load_truth()
    ss = np.random.SeedSequence(MASTER_SEED).spawn(SEED_INDEX + 1)[SEED_INDEX]
    rng = np.random.default_rng(ss)
    picked, rows = [], []
    for pred in STRATA:
        cand = [p for p in real if p not in picked and (pred(truth[p["man"]]) or pred(truth[p["woman"]]))]
        if not cand:
            rows.append({"stratum": pred.__name__, "pair_id": None, "n_candidates": 0})
            continue
        p = cand[int(rng.integers(len(cand)))]
        picked.append(p)
        rows.append({"stratum": pred.__name__, "pair_id": p["pair_id"], "n_candidates": len(cand)})
    while len(picked) < N_PAIRS:
        cand = [p for p in real if p not in picked]
        p = cand[int(rng.integers(len(cand)))]
        picked.append(p)
        rows.append({"stratum": "жребий", "pair_id": p["pair_id"], "n_candidates": len(cand)})
    people = [x for p in picked for x in (p["man"], p["woman"])]
    cover = {pred.__name__: sum(pred(truth[x]) for x in people) for pred in STRATA}
    out = {"design": "reviews/03-pilot.md, critique п. 1", "master_seed": MASTER_SEED,
           "seed": f"SeedSequence({MASTER_SEED}).spawn({SEED_INDEX + 1})[{SEED_INDEX}]", "seed_name": "pilot2_pick",
           "part": "work", "n_real_work_pairs": len(real), "pairs": rows, "people": people, "coverage_people": cover}
    with open(os.path.join(ROOT, "pilot", "pilot2.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ("pairs", "coverage_people")}, ensure_ascii=False))
    print(" ".join(people))


if __name__ == "__main__":
    main()
