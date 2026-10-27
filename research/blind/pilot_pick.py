"""Жребий пяти человек для пилота ролей (design.md, 16.6).

  python3 research/blind/pilot_pick.py      → research/blind/pilot/pilot.json

Только рабочая часть. Из private/pairs.json читаются только поля part, man, woman (кто в какой части);
слои — по inputs/truth (не по исходам). Зерно — SeedSequence(20261028).spawn(19)[18], имя pilot_pick.
"""
import glob
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
MASTER_SEED = 20261028
PILOT_SEED_INDEX = 18  # 19-е после blindlib.SEED_NAMES (18 имён); прежние зёрна не меняются


def working_ids():
    with open(os.path.join(ROOT, "private", "pairs.json"), encoding="utf-8") as f:
        pairs = json.load(f)["pairs"]
    work = {p[k] for p in pairs if p["part"] == "work" for k in ("man", "woman")}
    hold = {p[k] for p in pairs if p["part"] != "work" for k in ("man", "woman")}
    if work & hold:
        raise SystemExit("человек в обеих частях — разбиение нарушено")
    return sorted(work)


def load_truth():
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "inputs", "truth", "*.json"))):
        with open(f, encoding="utf-8") as fh:
            out[os.path.basename(f)[:-5]] = json.load(fh)
    return out


def anxious(r):
    return r["привязанность"]["тревожность в отношениях"] in ("выше среднего", "очень высокая")


def conflictual(r):
    return r["ссоры"]["критика, презрение, враждебность"] == "часто"


def drinker_strict(r):
    return r["алкоголь"]["рискованное питьё"] == "да" or r["алкоголь"]["как часто пьёт"] == "еженедельно и чаще"


def drinker_loose(r):
    return r["алкоголь"]["как часто пьёт"] == "ежемесячно"


def wellbeing(r):
    return (r["привязанность"]["тип"] == "надёжный"
            and r["ссоры"]["критика, презрение, враждебность"] in ("почти никогда", "редко")
            and r["алкоголь"]["как часто пьёт"] in ("не пьёт", "реже раза в месяц")
            and r["деньги"]["проблемный долг (просрочки, МФО, долг больше трёх доходов)"] == "нет"
            and r["изменял(а) в прошлых отношениях"] == "нет"
            and r["черты"]["эмоциональная неустойчивость"] in ("очень низкая", "ниже среднего", "средняя"))


def religious(r):
    return r["вера"]["религиозность"] == "практикует регулярно"


def main():
    work = working_ids()
    truth = load_truth()
    ss = np.random.SeedSequence(MASTER_SEED).spawn(PILOT_SEED_INDEX + 1)[PILOT_SEED_INDEX]
    rng = np.random.default_rng(ss)
    strata = [("тревожный", [anxious]), ("конфликтный", [conflictual]),
              ("пьющий", [drinker_strict, drinker_loose]), ("благополучный", [wellbeing]),
              ("религиозный", [religious])]
    picked, rows = [], []
    for name, preds in strata:
        for pred in preds:
            cand = [p for p in work if p not in picked and pred(truth[p])]
            if cand:
                break
        if not cand:
            raise SystemExit(f"слой «{name}» пуст в рабочей части")
        pid = str(rng.choice(cand))
        picked.append(pid)
        rows.append({"id": pid, "stratum": name, "criterion": pred.__name__, "n_candidates": len(cand)})
    out = {"design": "design.md, 16.6", "master_seed": MASTER_SEED, "seed": f"SeedSequence({MASTER_SEED}).spawn(19)[18]",
           "seed_name": "pilot_pick", "part": "work", "n_work_people": len(work), "pilot": rows}
    os.makedirs(os.path.join(ROOT, "pilot"), exist_ok=True)
    with open(os.path.join(ROOT, "pilot", "pilot.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
