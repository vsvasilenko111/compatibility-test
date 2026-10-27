"""Печать проверочной части и счётчик запусков на ней (ответ критику 2, п. 3 и 6; design.md, 8.2, 13.1, 13.5).

  python3 research/blind/seal.py                       — разложить исходы проверочной части в sealed/ (файлы 444)
  python3 research/blind/seal.py --register "<решение>" — записать запуск оценки на проверочной части;
                                                          больше HOLDOUT_LIMIT запусков на партию — отказ
  python3 research/blind/seal.py --open "<решение>"     — то же, что --register, и затем печатает в stdout пары и исходы
                                                          проверочной части; ЕДИНСТВЕННЫЙ разрешённый путь чтения
                                                          sealed/ для скрипта оценки (критик 3, п. 4; design.md, 7, 15.4)
  python3 research/blind/seal.py --rehash "<причина>"   — перепечатать в MANIFEST только ссылки на хеши private/, если
                                                          сами пары и исходы проверочной части не изменились
  python3 research/blind/seal.py --verify              — сверить хеши sealed/ с манифестом и журнал запусков

Запечатанное не перезаписывается: если файл уже есть и отличается — падение (печать сломана, разбираться руками).
Журнал запусков — два места: private/holdout-runs.jsonl (дописывается) и по файлу на запуск в sealed/runs/ (444).
Счётчик — максимум из двух, поэтому удаление jsonl лимит не сбрасывает; --verify сверяет их между собой.
"""
import datetime
import json
import os
import stat
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

SEALED = os.path.join(B.ROOT, "sealed")
RUNS = os.path.join(B.PRIV, "holdout-runs.jsonl")
RUNS_SEALED = os.path.join(SEALED, "runs")
HOLDOUT_LIMIT = 3   # запусков проверочной части на партию (design.md, 13.5)
RO = stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH   # 444


def text(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def put(name, obj):
    path = os.path.join(SEALED, name)
    body = text(obj)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if f.read() != body:
                raise SystemExit(f"sealed/{name} уже запечатан и отличается — печать не перезаписывается")
        os.chmod(path, RO)
        return path
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    os.chmod(path, RO)
    return path


def seal(rehash_reason=None):
    os.makedirs(SEALED, exist_ok=True)
    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    oj = B.load(os.path.join(B.PRIV, "outcome.json"))
    assert oj["meta"]["pairs_sha256"] == B.sha256(os.path.join(B.PRIV, "pairs.json"))
    hold = {p["pair_id"] for p in pj["pairs"] if p["part"] == "holdout"}
    pairs = [{"pair_id": p["pair_id"], "man": p["man"], "woman": p["woman"], "stage": p["stage"]}
             for p in pj["pairs"] if p["pair_id"] in hold]
    outs = [o for o in oj["outcomes"] if o["pair_id"] in hold]
    files = {"holdout-pairs.json": {"note": "ЗАПЕЧАТАНО: пары проверочной части", "pairs": pairs},
             "holdout-outcomes.json": {"note": "ЗАПЕЧАТАНО: исходы проверочной части", "outcomes": outs}}
    man = {"pairs_sha256": B.sha256(os.path.join(B.PRIV, "pairs.json")),
           "outcome_sha256": B.sha256(os.path.join(B.PRIV, "outcome.json")), "files": {}}
    for name, obj in files.items():
        man["files"][name] = B.sha256(put(name, obj))   # содержимое проверочной части: только «то же самое или падение»
    mpath = os.path.join(SEALED, "MANIFEST.json")
    if os.path.exists(mpath) and B.load(mpath) != man:
        old = B.load(mpath)
        if old["files"] != man["files"]:
            raise SystemExit("sealed/MANIFEST.json: хеши запечатанных файлов разошлись — печать не перезаписывается")
        if not rehash_reason:
            raise SystemExit("sealed/MANIFEST.json: изменились только ссылки на хеши private/pairs.json и outcome.json "
                             "(сами пары и исходы проверочной части те же). Перепечатать ссылки: "
                             "seal.py --rehash \"<причина>\" (запись в sealed/rehash/)")
        rdir = os.path.join(SEALED, "rehash")
        os.makedirs(rdir, exist_ok=True)
        n = len([f for f in os.listdir(rdir) if f.endswith(".json")]) + 1
        rec = {"n": n, "reason": rehash_reason, "at": datetime.datetime.now().isoformat(timespec="seconds"),
               "old": {k: old[k] for k in ("pairs_sha256", "outcome_sha256")},
               "new": {k: man[k] for k in ("pairs_sha256", "outcome_sha256")}, "files_unchanged": man["files"]}
        rp = os.path.join(rdir, f"rehash-{n}.json")
        with open(rp, "w", encoding="utf-8") as f:
            f.write(text(rec))
        os.chmod(rp, RO)
        os.chmod(mpath, stat.S_IRUSR | stat.S_IWUSR)
        os.remove(mpath)
        print(f"sealed/MANIFEST.json: ссылки на хеши перепечатаны (запись sealed/rehash/rehash-{n}.json)")
    put("MANIFEST.json", man)
    print(f"sealed/: {len(pairs)} пар проверочной части; файлы 444")


def runs_log():
    runs = []
    if os.path.exists(RUNS):
        with open(RUNS, encoding="utf-8") as f:
            runs = [json.loads(x) for x in f if x.strip()]
    return runs


def runs_sealed():
    if not os.path.isdir(RUNS_SEALED):
        return []
    return sorted(f for f in os.listdir(RUNS_SEALED) if f.startswith("run-") and f.endswith(".json"))


def verify(stream=None):
    man = B.load(os.path.join(SEALED, "MANIFEST.json"))
    for name, h in man["files"].items():
        path = os.path.join(SEALED, name)
        assert B.sha256(path) == h, f"sealed/{name}: хеш не совпал"
        assert stat.S_IMODE(os.stat(path).st_mode) == RO, f"sealed/{name}: права не 444"
    log, sl = runs_log(), runs_sealed()
    assert len(log) == len(sl), f"журнал запусков расходится: jsonl {len(log)}, sealed/runs {len(sl)} — разбираться руками"
    for f in sl:
        assert stat.S_IMODE(os.stat(os.path.join(RUNS_SEALED, f)).st_mode) == RO, f"sealed/runs/{f}: права не 444"
    print(f"sealed/: хеши и права в порядке; запусков проверочной части {len(sl)} из {HOLDOUT_LIMIT}", file=stream or sys.stdout)


def register(decision):
    n_done = max(len(runs_log()), len(runs_sealed()))
    if n_done >= HOLDOUT_LIMIT:
        raise SystemExit(f"лимит запусков проверочной части на партию исчерпан ({HOLDOUT_LIMIT}); нужен свежий батч")
    if not decision.strip():
        raise SystemExit("нужно описание решения")
    rec = {"n": n_done + 1, "decision": decision, "at": datetime.datetime.now().isoformat(timespec="seconds")}
    os.makedirs(RUNS_SEALED, exist_ok=True)
    path = os.path.join(RUNS_SEALED, f"run-{rec['n']}.json")
    if os.path.exists(path):
        raise SystemExit(f"sealed/runs/run-{rec['n']}.json уже есть — журнал расходится, разбираться руками")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text(rec))
    os.chmod(path, RO)
    with open(RUNS, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"запуск проверочной части №{rec['n']} из {HOLDOUT_LIMIT} записан", file=sys.stderr)
    return rec


def open_holdout(decision):
    verify(sys.stderr)
    rec = register(decision)
    out = {"run": rec, "pairs": B.load(os.path.join(SEALED, "holdout-pairs.json"))["pairs"],
           "outcomes": B.load(os.path.join(SEALED, "holdout-outcomes.json"))["outcomes"]}
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--register":
        register(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--open":
        open_holdout(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--rehash":
        seal(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "--verify":
        verify()
    else:
        seal()
