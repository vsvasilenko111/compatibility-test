"""Печать проверочной части и счётчик запусков на ней (ответ критику 2, п. 3 и 6; design.md, 8.2, 13.1, 13.5).

  python3 research/blind/seal.py                       — разложить исходы проверочной части в sealed/ (файлы 444)
  python3 research/blind/seal.py --register "<решение>" — записать запуск оценки на проверочной части;
                                                          больше HOLDOUT_LIMIT запусков на партию — отказ
  python3 research/blind/seal.py --open "<решение>"     — то же, что --register, и затем печатает в stdout пары и исходы
                                                          проверочной части; ЕДИНСТВЕННЫЙ разрешённый путь чтения
                                                          sealed/ для скрипта оценки (критик 3, п. 4; design.md, 7, 15.4)
  python3 research/blind/seal.py --rehash "<причина>"   — перепечатать в MANIFEST только ссылки на хеши private/, если
                                                          сами пары и исходы проверочной части не изменились
  python3 research/blind/seal.py --reseal "<причина>"   — перепечатать исходы проверочной части после предрегистрированной
                                                          смены формулы (design.md, 17.8; ужесточено в 17.14): только если
                                                          на проверочной части не было ни одного запуска, пары те же,
                                                          в design.md есть «Разрешение перепечатки №<n>» с хешем НОВОЙ
                                                          спеки (не той, что в прежних перепечатках) и хешем кода исхода,
                                                          совпадающим с текущим; не больше RESEAL_LIMIT перепечаток на
                                                          партию; нет ни проверки порции, ни ответов D по действующим
                                                          заданиям; прежние запечатанные файлы не читаются, а переносятся
                                                          в sealed/superseded/r<ред.>/; счётчик запусков не сбрасывается;
                                                          каждая перепечатка — в sealed/reseal/ и в журнал
  python3 research/blind/seal.py --code-hash           — напечатать хеш кода исхода (для записи в design.md)
  python3 research/blind/seal.py --verify              — сверить хеши sealed/ с манифестом и журнал запусков

Вторая партия (design.md, 18.5): те же команды с префиксом --batch 2 (python3 research/blind/seal.py --batch 2 [...]).
Печать — sealed/b2/ (свой MANIFEST, файлы 444), источник — private/b2-pairs.json и private/b2-outcome.json, свой
счётчик запусков (private/b2-holdout-runs.jsonl и sealed/b2/runs/, лимит HOLDOUT_LIMIT); --reseal для партии 2
отказывает (формула исхода заморожена, design.md 18.1).

Запечатанное не перезаписывается: если файл уже есть и отличается — падение (печать сломана, разбираться руками).
Журнал запусков — два места: private/holdout-runs.jsonl (дописывается) и по файлу на запуск в sealed/runs/ (444).
Счётчик — максимум из двух, поэтому удаление jsonl лимит не сбрасывает; --verify сверяет их между собой.
"""
import datetime
import glob
import hashlib
import json
import os
import re
import stat
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

SEALED = os.path.join(B.ROOT, "sealed")
RUNS = os.path.join(B.PRIV, "holdout-runs.jsonl")
RUNS_SEALED = os.path.join(SEALED, "runs")
HOLDOUT_LIMIT = 3   # запусков проверочной части на партию (design.md, 13.5)
RO = stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH   # 444
SUPERSEDED = os.path.join(SEALED, "superseded")
SPEC_R5 = os.path.join(B.PRIV, "outcome-spec-r5.json")
DESIGN = os.path.join(B.ROOT, "design.md")
MANIFEST_KEEP = ("revision", "superseded")          # ключи манифеста, которые переживают обычную печать и rehash
RESEAL_LIMIT = 2    # перепечаток на партию людей (design.md, 17.14): ред. 5 и ред. 5.1; дальше — только новая партия
RESEAL_DIR = os.path.join(SEALED, "reseal")
RESEAL_JOURNAL = os.path.join(B.PRIV, "reseal-journal.jsonl")
PAIRS_FILE = os.path.join(B.PRIV, "pairs.json")
OUTCOME_FILE = os.path.join(B.PRIV, "outcome.json")
BATCH = 1


def use_batch2():
    """Переключить все пути на вторую партию (design.md, 18.5). Первая партия при этом не читается и не пишется."""
    global SEALED, RUNS, RUNS_SEALED, SUPERSEDED, RESEAL_DIR, RESEAL_JOURNAL, PAIRS_FILE, OUTCOME_FILE, BATCH
    BATCH = 2
    SEALED = os.path.join(B.ROOT, "sealed", "b2")
    RUNS = os.path.join(B.PRIV, "b2-holdout-runs.jsonl")
    RUNS_SEALED = os.path.join(SEALED, "runs")
    SUPERSEDED = os.path.join(SEALED, "superseded")
    RESEAL_DIR = os.path.join(SEALED, "reseal")
    RESEAL_JOURNAL = os.path.join(B.PRIV, "b2-reseal-journal.jsonl")
    PAIRS_FILE = os.path.join(B.PRIV, "b2-pairs.json")
    OUTCOME_FILE = os.path.join(B.PRIV, "b2-outcome.json")
# код, от которого зависят исходы проверочной части (design.md, 17.14): его хеш записывается в design.md до пересчёта
OUTCOME_CODE = ("blindlib.py", "generate.py", "calibrate.py", "pairs.py", "calibrate_r5.py", "pair_vars.py", "outcome.py")
PERMIT_RX = re.compile(r"Разрешение перепечатки №(\d+): ред\. ([0-9.]+); спека outcome-spec-r5\.json SHA-256 "
                       r"`?([0-9a-f]{64})`?; код исхода SHA-256 `?([0-9a-f]{64})`?")


def code_hash():
    """Хеш кода исхода: SHA-256 от строк «имя файла  SHA-256 файла» в фиксированном порядке."""
    lines = "".join(f"{n}  {B.sha256(os.path.join(B.ROOT, n))}\n" for n in OUTCOME_CODE)
    return hashlib.sha256(lines.encode("utf-8")).hexdigest()


def reseal_records():
    """Прежние перепечатки: файлы sealed/reseal/ (444), журнал private/ и записи superseded в манифесте.
    Счётчик — максимум из трёх, поэтому удаление одного места его не сбрасывает."""
    files = sorted(f for f in os.listdir(RESEAL_DIR) if f.startswith("reseal-") and f.endswith(".json")) \
        if os.path.isdir(RESEAL_DIR) else []
    recs = [B.load(os.path.join(RESEAL_DIR, f)) for f in files]
    journal = []
    if os.path.exists(RESEAL_JOURNAL):
        with open(RESEAL_JOURNAL, encoding="utf-8") as f:
            journal = [json.loads(x) for x in f if x.strip()]
    mpath = os.path.join(SEALED, "MANIFEST.json")
    n_sup = len(B.load(mpath).get("superseded", {})) if os.path.exists(mpath) else 0
    return recs, journal, max(len(recs), len(journal), n_sup)


def work_part_used():
    """Есть ли уже материал ред. 5 для оценки теста на рабочей части: файл проверки порции или ответы D, сделанные
    действующими заданиями (design.md, 17.14: после первой оценки формула исхода не меняется до новой партии)."""
    found = sorted(os.path.basename(f) for f in glob.glob(os.path.join(B.ROOT, "pilot", "batch-check-*.json")))
    import batch_check as BC          # только шаблоны и проверка версий; вызовов модели нет
    for f in sorted(glob.glob(os.path.join(B.ROOT, "answers", "*.json"))):
        pid = os.path.basename(f)[:-5]
        if not BC.version_problems(pid):
            found.append(f"answers/{pid}.json (действующие задания)")
    return found


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


def holdout_files():
    """Содержимое проверочной части по private/ (в stdout не печатается)."""
    pj = B.load(PAIRS_FILE)
    oj = B.load(OUTCOME_FILE)
    assert oj["meta"]["pairs_sha256"] == B.sha256(PAIRS_FILE)
    hold = {p["pair_id"] for p in pj["pairs"] if p["part"] == "holdout"}
    pairs = [{"pair_id": p["pair_id"], "man": p["man"], "woman": p["woman"], "stage": p["stage"]}
             for p in pj["pairs"] if p["pair_id"] in hold]
    outs = [o for o in oj["outcomes"] if o["pair_id"] in hold]
    files = {"holdout-pairs.json": {"note": "ЗАПЕЧАТАНО: пары проверочной части", "pairs": pairs},
             "holdout-outcomes.json": {"note": "ЗАПЕЧАТАНО: исходы проверочной части", "outcomes": outs}}
    man = {"pairs_sha256": B.sha256(PAIRS_FILE), "outcome_sha256": B.sha256(OUTCOME_FILE), "files": {}}
    if BATCH != 1:
        man["batch"] = BATCH
    return pairs, files, man


def seal(rehash_reason=None):
    os.makedirs(SEALED, exist_ok=True)
    pairs, files, man = holdout_files()
    mpath0 = os.path.join(SEALED, "MANIFEST.json")
    if os.path.exists(mpath0):
        old0 = B.load(mpath0)
        for k in MANIFEST_KEEP:
            if k in old0:
                man[k] = old0[k]
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
    print(f"{os.path.relpath(SEALED, B.ROOT)}/: {len(pairs)} пар проверочной части; файлы 444")


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
    for label, rec in man.get("superseded", {}).items():      # прежние печати (design.md, 17.8)
        for name, h in rec["files"].items():
            path = os.path.join(SUPERSEDED, label, name)
            assert B.sha256(path) == h, f"sealed/superseded/{label}/{name}: хеш не совпал"
            assert stat.S_IMODE(os.stat(path).st_mode) == RO, f"sealed/superseded/{label}/{name}: права не 444"
    rs_recs, rs_journal, _ = reseal_records()
    if rs_journal:
        assert len(rs_journal) == len(rs_recs), \
            f"журнал перепечаток расходится: private {len(rs_journal)}, sealed/reseal {len(rs_recs)} — разбираться руками"
    assert len(rs_recs) <= RESEAL_LIMIT, f"перепечаток {len(rs_recs)} > {RESEAL_LIMIT}"
    log, sl = runs_log(), runs_sealed()
    assert len(log) == len(sl), f"журнал запусков расходится: jsonl {len(log)}, sealed/runs {len(sl)} — разбираться руками"
    for f in sl:
        assert stat.S_IMODE(os.stat(os.path.join(RUNS_SEALED, f)).st_mode) == RO, f"sealed/runs/{f}: права не 444"
    print(f"{os.path.relpath(SEALED, B.ROOT)}/: хеши и права в порядке; запусков проверочной части {len(sl)} из {HOLDOUT_LIMIT}"
          + ("" if BATCH == 1 else f" (партия {BATCH})"), file=stream or sys.stdout)


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


def reseal(reason):
    """Перепечатка исходов проверочной части БЕЗ открытия (design.md, 17.8). Прежние запечатанные файлы не читаются
    (только хешируются для сверки) и переносятся в sealed/superseded/r<ред.>/; счётчик запусков не трогается."""
    if BATCH != 1:
        raise SystemExit("для второй партии перепечатка не предусмотрена: формула исхода заморожена (design.md, 18.1, 18.5)")
    if not reason.strip():
        raise SystemExit("нужна причина перепечатки")
    n_done = max(len(runs_log()), len(runs_sealed()))
    if n_done > 0:
        raise SystemExit(f"на проверочной части уже было запусков: {n_done}. Исходы видели — перепечатка без открытия "
                         "невозможна; решение владельца проекта (design.md, 17.8, п. 1)")
    prev, journal, n_prev = reseal_records()
    n_new = n_prev + 1
    if n_new > RESEAL_LIMIT:
        raise SystemExit(f"перепечаток уже {n_prev} из {RESEAL_LIMIT} на партию — дальше только новая партия людей "
                         "(design.md, 17.14)")
    spec_sha, c_sha = B.sha256(SPEC_R5), code_hash()
    with open(DESIGN, encoding="utf-8") as f:
        permits = {int(mt.group(1)): mt.groups()[1:] for mt in PERMIT_RX.finditer(f.read())}
    if n_new not in permits:
        raise SystemExit(f"в design.md нет «Разрешение перепечатки №{n_new}: ред. …; спека outcome-spec-r5.json SHA-256 …; "
                         "код исхода SHA-256 …» — пересчёт не предрегистрирован (design.md, 17.14)")
    rev_new, p_spec, p_code = permits[n_new]
    if p_spec != spec_sha:
        raise SystemExit("хеш спеки в разрешении не совпадает с private/outcome-spec-r5.json (design.md, 17.14)")
    used_specs = {r.get("outcome_spec_r5_sha256") for r in prev + journal}
    if spec_sha in used_specs:
        raise SystemExit("спека та же, что в прежней перепечатке — перепечатка разрешена только при смене спеки (17.14)")
    if p_code != c_sha:
        raise SystemExit(f"хеш кода исхода {c_sha[:16]}… не совпадает с записанным в разрешении №{n_new} (design.md, 17.14)")
    used = work_part_used()
    if used:
        raise SystemExit("на рабочей части уже есть материал ред. 5 для оценки теста — формула исхода не меняется до "
                         "новой партии (design.md, 17.14): " + ", ".join(used[:5]))
    verify(sys.stderr)                                    # старая печать цела (хеши и права), журналы согласованы
    mpath = os.path.join(SEALED, "MANIFEST.json")
    old = B.load(mpath)
    pairs, files, man = holdout_files()
    new_body = {name: text(obj) for name, obj in files.items()}
    new_hash = {name: hashlib.sha256(body.encode("utf-8")).hexdigest() for name, body in new_body.items()}
    if new_hash["holdout-pairs.json"] != old["files"]["holdout-pairs.json"]:
        raise SystemExit("пары проверочной части изменились — перепечатка запрещена (design.md, 17.8, п. 2)")
    if new_hash["holdout-outcomes.json"] == old["files"]["holdout-outcomes.json"]:
        raise SystemExit("исходы проверочной части не изменились — перепечатывать нечего (для ссылок на хеши — --rehash)")
    rev_old = old.get("revision", 4)
    label = f"r{rev_old}"
    sdir = os.path.join(SUPERSEDED, label)
    if os.path.exists(sdir):
        raise SystemExit(f"sealed/superseded/{label}/ уже есть — разбираться руками")
    os.makedirs(sdir)
    moved = {}
    for name in ("holdout-outcomes.json", "MANIFEST.json"):
        src, dst = os.path.join(SEALED, name), os.path.join(sdir, name)
        h = B.sha256(src)
        os.rename(src, dst)                               # перенос без чтения содержимого
        os.chmod(dst, RO)
        moved[name] = h
    assert moved["holdout-outcomes.json"] == old["files"]["holdout-outcomes.json"]
    man["revision"] = rev_new
    man["superseded"] = dict(old.get("superseded", {}))
    man["superseded"][label] = {"files": moved, "pairs_sha256": old["pairs_sha256"], "outcome_sha256": old["outcome_sha256"]}
    for name in files:
        man["files"][name] = B.sha256(put(name, files[name]))
    put("MANIFEST.json", man)
    rdir = RESEAL_DIR
    os.makedirs(rdir, exist_ok=True)
    n = n_new
    if os.path.exists(os.path.join(rdir, f"reseal-{n}.json")):
        raise SystemExit(f"sealed/reseal/reseal-{n}.json уже есть — журнал расходится, разбираться руками")
    rec = {"n": n, "reason": reason, "at": datetime.datetime.now().isoformat(timespec="seconds"),
           "design": "design.md, 17.8, 17.14", "revision": rev_new, "outcome_spec_r5_sha256": spec_sha,
           "outcome_code_sha256": c_sha, "outcome_code_files": list(OUTCOME_CODE), "reseal_limit": RESEAL_LIMIT,
           "opened": False,
           "holdout_runs_before": n_done, "superseded_dir": f"sealed/superseded/{label}/", "old_files": moved,
           "new_files": man["files"], "pairs_unchanged": True,
           "new_refs": {k: man[k] for k in ("pairs_sha256", "outcome_sha256")}}
    rp = os.path.join(rdir, f"reseal-{n}.json")
    with open(rp, "w", encoding="utf-8") as f:
        f.write(text(rec))
    os.chmod(rp, RO)
    if not journal and prev:                              # журнал заведён в ред. 5.1: прежние записи переносятся в него
        with open(RESEAL_JOURNAL, "a", encoding="utf-8") as f:
            for r in prev:
                f.write(json.dumps({k: r.get(k) for k in ("n", "at", "reason", "outcome_spec_r5_sha256", "opened",
                                                          "holdout_runs_before")}, ensure_ascii=False) + "\n")
    with open(RESEAL_JOURNAL, "a", encoding="utf-8") as f:
        f.write(json.dumps({k: rec[k] for k in ("n", "at", "reason", "revision", "outcome_spec_r5_sha256",
                                                "outcome_code_sha256", "opened", "holdout_runs_before")},
                           ensure_ascii=False) + "\n")
    verify()
    print(f"sealed/: исходы проверочной части перепечатаны без открытия ({len(pairs)} пар; ред. {man['revision']}); "
          f"прежние — sealed/superseded/{label}/; запись sealed/reseal/reseal-{n}.json; счётчик запусков {n_done} из {HOLDOUT_LIMIT}")


def open_holdout(decision):
    verify(sys.stderr)
    rec = register(decision)
    out = {"run": rec, "pairs": B.load(os.path.join(SEALED, "holdout-pairs.json"))["pairs"],
           "outcomes": B.load(os.path.join(SEALED, "holdout-outcomes.json"))["outcomes"]}
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if sys.argv[1:3] == ["--batch", "2"]:
        use_batch2()
        del sys.argv[1:3]
    elif len(sys.argv) >= 2 and sys.argv[1] == "--batch":
        raise SystemExit("известны партии 1 (без --batch) и 2 (--batch 2)")
    if len(sys.argv) >= 3 and sys.argv[1] == "--register":
        register(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--open":
        open_holdout(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--reseal":
        reseal(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--rehash":
        seal(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "--verify":
        verify()
    elif len(sys.argv) == 2 and sys.argv[1] == "--code-hash":
        print(code_hash())
    else:
        seal()
