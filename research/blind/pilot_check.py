"""Проверка пилота ролей по порогу design.md, 16.7–16.8.

  python3 research/blind/pilot_check.py [pilot/pilot2.json]   → stdout и pilot/check-<время>.json

Читает: pilot/pilot.json, texts/, answers/, raw/, raw_rejected/, inputs/truth, inputs/self, src/questions/bank.json.
private/ и sealed/ не читает.
"""
import datetime as dt
import glob
import json
import os
import statistics as st
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.realpath(os.path.join(ROOT, "..", ".."))
ORD5 = ["очень низкая", "ниже среднего", "средняя", "выше среднего", "очень высокая"]
FREQ4 = ["почти никогда", "редко", "иногда", "часто"]
ALC = {"не пьёт": 1, "реже раза в месяц": 2, "ежемесячно": 3, "еженедельно и чаще": 4}


def j(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def freq(v):
    return 1 + 4 * FREQ4.index(v) / 3


def mapped(rec, which):
    """Пилотное сопоставление 16.8: уровни → шкала вопроса 1..5 (меньше — желательнее)."""
    if which == "truth":
        alc = ALC[rec["алкоголь"]["как часто пьёт"]] + (1 if rec["алкоголь"]["рискованное питьё"] == "да" else 0)
    else:
        alc = ALC[rec["алкоголь"]["как часто пьёт (по его/её словам)"]]
    anx = 1 + ORD5.index(rec["привязанность"]["тревожность в отношениях"])
    return {"leisure-11": alc, "conflicts-02": freq(rec["ссоры"]["критика, презрение, враждебность"]),
            "regul-04": freq(rec["ссоры"]["уход от разговора, молчание"]), "attach-01": anx, "trauma-06": anx}


def kids_opt(v):
    return None if v == "не знаю" else min(int(str(v).rstrip("+")), 4) + 1


def main():
    bank = {q["id"]: q for q in j(os.path.join(PROJECT, "src", "questions", "bank.json"))["questions"]}
    src = j(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "pilot", "pilot.json"))
    pilot = src["pilot"] if "pilot" in src else [{"id": x, "stratum": "pilot2"} for x in src["people"]]
    out = {"checked": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "people": []}

    ct = subprocess.run([sys.executable, os.path.join(ROOT, "check_transcripts.py"), os.path.join(ROOT, "raw")],
                        capture_output=True, text=True)
    out["check_transcripts"] = {"exit": ct.returncode, "tail": ct.stdout.strip().splitlines()[-3:]}
    n_raw = len(glob.glob(os.path.join(ROOT, "raw", "*", "*", "*.jsonl")))
    rej = {}
    for p in glob.glob(os.path.join(ROOT, "raw_rejected", "*", "*", "*.jsonl")):
        role = os.path.relpath(p, os.path.join(ROOT, "raw_rejected")).split(os.sep)[0]
        rej[role] = rej.get(role, 0) + 1
    out["raw_accepted"] = n_raw
    out["raw_rejected_by_role"] = rej

    wrong, shifts_t, shifts_s, kids_ok = 0, [], [], 0
    for row in pilot:
        pid = row["id"]
        truth = j(os.path.join(ROOT, "inputs", "truth", f"{pid}.json"))
        selfr = j(os.path.join(ROOT, "inputs", "self", f"{pid}.json"))
        r = {"id": pid, "stratum": row["stratum"]}
        for kind in ("dossier", "self"):
            m = j(os.path.join(ROOT, "texts", kind, f"{pid}.json"))
            r[kind] = {"text_wrong": m["text_wrong"], "attempts": len(m["attempts"]),
                       "misses_by_attempt": [a["misses"] for a in m["attempts"]], "words": m["attempts"][-1]["words"]}
            wrong += m["text_wrong"]
        a = j(os.path.join(ROOT, "answers", f"{pid}.json"))
        resp = a["responses"]
        problems = []
        if len(resp) != len(bank):
            problems.append(f"ответов {len(resp)} из {len(bank)}")
        for qid, v in resp.items():
            q = bank[qid]
            if v == "skipped":
                if not q.get("optional"):
                    problems.append(f"пропуск у обязательного {qid}")
                continue
            if "firm" in v and not q.get("firm"):
                problems.append(f"отметка у {qid}")
        if len(set(a["priorities"])) != 5:
            problems.append("не 5 сфер")
        opts = [v["option"] for v in resp.values() if v != "skipped"]
        shown = [v["shown"] for v in resp.values() if v != "skipped"]
        r["answers"] = {"n": len(resp), "skipped": sum(v == "skipped" for v in resp.values()),
                        "firm_marked": sorted(k for k, v in resp.items() if v != "skipped" and v.get("firm")),
                        "priorities": a["priorities"], "problems": problems,
                        "option_sd": round(st.pstdev(opts), 2),
                        "shown_share": {k: round(shown.count(k) / len(shown), 2) for k in range(1, 6)}}
        mt, ms = mapped(truth, "truth"), mapped(selfr, "self")
        items = {}
        for qid in mt:
            v = resp.get(qid)
            if v in (None, "skipped"):
                continue
            items[qid] = {"truth": round(mt[qid], 2), "self": round(ms[qid], 2), "D": v["option"]}
        st_ = st.mean(x["truth"] - x["D"] for x in items.values())
        ss_ = st.mean(x["self"] - x["D"] for x in items.values())
        shifts_t.append(st_)
        shifts_s.append(ss_)
        kid_self = kids_opt(selfr["дети"]["сколько хочет"])
        kid_d = resp["kids-02"]["option"] if resp.get("kids-02") not in (None, "skipped") else None
        kmatch = kid_self is None or kid_self == kid_d
        kids_ok += kmatch
        r["shift"] = {"items": items, "toward_desirable_vs_truth": round(st_, 2),
                      "toward_desirable_vs_self": round(ss_, 2),
                      "kids": {"self_option": kid_self, "D_option": kid_d, "match": kmatch}}
        out["people"].append(r)
    out["summary"] = {
        "text_wrong": f"{wrong} из {2 * len(pilot)}",
        "mean_shift_vs_truth": round(st.mean(shifts_t), 2),
        "mean_shift_vs_self": round(st.mean(shifts_s), 2),
        "kids_match": f"{kids_ok} из {len(pilot)}",
        "d_problems": sum(len(p["answers"]["problems"]) for p in out["people"]),
    }
    os.makedirs(os.path.join(ROOT, "pilot"), exist_ok=True)
    path = os.path.join(ROOT, "pilot", f"check-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
