"""Проверка порции ответов D по самоотчёту (design.md, 3.3, 17.11–17.12; критик 04, обязательные п. 2 и 3).

  python3 research/blind/batch_check.py --ids a6zt ern9 ...      # порция
  python3 research/blind/batch_check.py --all                    # все, у кого есть answers/
  ... --cumulative            # ещё и нарастающим итогом по всем, у кого есть ответы

По сопоставлению «вопрос ↔ поле» (MAPPING, 17.12; ред. 5.1 — 17.14) считает по каждому вопросу и каждой сфере:
отношение SD ответа D к SD самоотчёта (кроме двоичных полей), ранговую корреляцию ответа с самоотчётом, сдвиг к
желательному полюсу против самоотчёта (в SD самоотчёта) и, справочно, против «правды». Выносит вердикт «принять /
брак» и «остановка по сдвигу» по правилам 17.14: критические значения зависят от числа людей и посчитаны
симуляцией (batch_sim.py → batch-thresholds.json) так, чтобы ложный брак от шума был редким. Проверяет, что тексты
и ответы сделаны действующими заданиями (prompts/roles.json = run_roles.py).

Читает: inputs/truth, inputs/self, texts/, answers/, raw/ (заголовки), src/questions/bank.json, batch-thresholds.json.
private/, sealed/, people.json, selfreport.json не читает.
Выход: stdout и pilot/batch-check-<время>.json.
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import string
import sys

import numpy as np
from scipy.stats import spearmanr

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.realpath(os.path.join(ROOT, "..", ".."))
sys.path.insert(0, ROOT)
import run_roles as RR  # noqa: E402  (только шаблоны и guard; вызовов модели нет)

ORD5 = ["очень низкая", "ниже среднего", "средняя", "выше среднего", "очень высокая"]
FREQ4 = ["почти никогда", "редко", "иногда", "часто"]
ALC4 = ["не пьёт", "реже раза в месяц", "ежемесячно", "еженедельно и чаще"]
DESIRE4 = ["реже раза в неделю", "примерно раз в неделю", "несколько раз в неделю", "почти каждый день"]
TALK3 = ["трудно, обычно избегает таких разговоров", "смотря о чём", "легко"]
CLOSE3 = ["решения принимает без оглядки на родителей", "советуется с родителями и прислушивается к ним",
          "мнение родителей для него (неё) решающее"]

# Пороги ред. 5.1 (design.md, 17.14; записаны до первой порции). Критические значения зависят от числа людей и
# посчитаны симуляцией batch_sim.py → batch-thresholds.json (зерно и модель — там же). Точечные пороги 3.3 (0,8 / 0,5)
# и остановки 17.11 (0,4 / 0,6 SD) — это пороги «в популяции»; на n людях решение принимается тестом против них.
THRESHOLDS = os.path.join(ROOT, "batch-thresholds.json")
SD_RATIO_POP, RHO_POP_STRONG, RHO_POP_WEAK = .8, .5, .3     # 3.3; слабые аналоги — мягкий порог (17.14)
SHIFT_MEAN_POP, SHIFT_SPHERE_POP = .4, .6                   # 17.11
ITEM_RULES_MIN_N = 40                                       # проверка отдельного вопроса — только от 40 человек


def lin(levels, v):
    """Уровень записи → шкала 1..5 линейно (16.8)."""
    return 1 + 4 * levels.index(v) / (len(levels) - 1)


def g(*path):
    def get(rec):
        for k in path:
            rec = rec[k]
        return rec
    return get


def alc_self(rec):
    return rec["алкоголь"].get("как часто пьёт", rec["алкоголь"].get("как часто пьёт (по его/её словам)"))


def credit(rec):
    return 5.0 if rec["деньги"]["есть свой кредит, кредитка или рассрочка"] == "да" else 1.0


def kids(rec):
    v = rec["дети"]["сколько хочет"]
    return None if v == "не знаю" else float(min(int(str(v).rstrip("+")), 4) + 1)


# Сопоставление 17.12 (ред. 5.1 — 17.14): (вопрос, поле, функция записи → 1..5, знак: +1 — больше поле → больший номер
# варианта, −1 — наоборот; желательный полюс поля: −1 — меньше, +1 — больше, 0 — направления нет;
# класс: "strong" — прямой аналог (медианы и проверка вопроса против 0,5), "weak" — слабый аналог (только проверка
# вопроса против мягкого порога 0,3, в медианы не входит), "shift" — только правило остановки по сдвигу;
# двоичное ли поле: у двоичного отношение SD не считается — другая мера)
MAPPING = [
    ("leisure-11", "частота алкоголя", lambda r: lin(ALC4, alc_self(r)), +1, -1, "strong", False),
    ("conflicts-02", "критика и враждебность (громкость — неточный аналог)",
     lambda r: lin(FREQ4, r["ссоры"]["критика, презрение, враждебность"]), +1, -1, "shift", False),
    ("conflicts-07", "уход от разговора", lambda r: lin(FREQ4, r["ссоры"]["уход от разговора, молчание"]), +1, -1, "weak", False),
    ("conflicts-01", "уход от разговора", lambda r: lin(FREQ4, r["ссоры"]["уход от разговора, молчание"]), +1, -1, "weak", False),
    ("regul-08", "оборона в ссорах", lambda r: lin(FREQ4, r["ссоры"]["оборона, оправдания вместо разговора"]), +1, -1, "strong", False),
    # attach-01: «не буду трогать» (1) — скорее избегание, социально желательны средние варианты 3–4 → без направления
    ("attach-01", "тревожность в отношениях", lambda r: lin(ORD5, r["привязанность"]["тревожность в отношениях"]), +1, 0, "weak", False),
    ("trauma-06", "тревожность в отношениях", lambda r: lin(ORD5, r["привязанность"]["тревожность в отношениях"]), +1, -1, "strong", False),
    ("attach-03", "избегание близости", lambda r: lin(ORD5, r["привязанность"]["избегание близости"]), +1, -1, "strong", False),
    ("budget-09", "есть свой кредит", credit, +1, 0, "strong", True),
    ("kids-02", "сколько детей хочет", kids, +1, 0, "strong", False),
    ("humor-11", "подкалывает и высмеивает партнёра", lambda r: lin(FREQ4, r["юмор"]["подкалывает и высмеивает партнёра, шутит обидно"]), +1, -1, "strong", False),
    ("humor-06", "шутит по-доброму", lambda r: lin(FREQ4, r["юмор"]["шутит по-доброму, смешит других"]), -1, 0, "weak", False),
    ("intimacy-02", "как часто хотелось бы близости", lambda r: lin(DESIRE4, r["близость"]["как часто хотелось бы близости (секса)"]), +1, 0, "strong", False),
    ("intimacy-03", "легко говорить о сексе", lambda r: lin(TALK3, r["близость"]["говорить с партнёром о сексе"]), -1, +1, "strong", False),
    ("relatives-04", "считается с мнением родителей", lambda r: lin(CLOSE3, r["отношения с родителями сейчас"]["насколько считается с мнением родителей"]), +1, -1, "strong", False),
    ("relatives-05", "считается с мнением родителей", lambda r: lin(CLOSE3, r["отношения с родителями сейчас"]["насколько считается с мнением родителей"]), +1, -1, "weak", False),
]
# справочно: humor-11 против враждебности самоотчёта (критик 05, п. 2–3). Если ρ с враждебностью не меньше, чем с
# «подкалывает партнёра», вопрос мерит враждебность, а не юмор — пометка в выводе, не брак.
HOST_FIELD = lambda r: lin(FREQ4, r["ссоры"]["критика, презрение, враждебность"])


def j(p):
    return RR.read_json(p)


def template_rx(tpl):
    """Шаблон str.format → регулярное выражение на весь текст (поля — любые строки)."""
    parts = []
    for lit, field, _, _ in string.Formatter().parse(tpl):
        parts.append(re.escape(lit))
        if field is not None:
            parts.append("(.*?)")
    return re.compile("".join(parts) + r"\Z", re.S)


TEMPLATES = {"A": (RR.SYS_A, [RR.TASK_A]), "B": (RR.SYS_B, [RR.TASK_B]), "C": (RR.SYS_C, [RR.TASK_C]),
             "D": (RR.SYS_D, [RR.TASK_D, RR.TASK_D_PRIO])}
TEMPLATE_RX = {r: (sysp, [template_rx(t) for t in tpls]) for r, (sysp, tpls) in TEMPLATES.items()}


def raw_header(rel):
    with open(RR.guard(os.path.join(ROOT, rel)), encoding="utf-8") as f:
        return json.loads(f.readline())


def version_problems(pid):
    """Сырые потоки, на которые ссылаются итоговые тексты и ответы, сделаны действующими заданиями (17.11, п. 3)."""
    probs, raws = [], []
    for kind in ("dossier", "self"):
        p = os.path.join(ROOT, "texts", kind, f"{pid}.json")
        if not os.path.exists(p):
            probs.append(f"нет texts/{kind}/{pid}.json")
            continue
        for a in j(p)["attempts"]:
            raws += [a["raw_author"], a["raw_restorer"]]
    ap = os.path.join(ROOT, "answers", f"{pid}.json")
    if os.path.exists(ap):
        raws += j(ap)["raw"]
    for rel in raws:
        try:
            h = raw_header(rel)
        except (OSError, ValueError) as e:
            probs.append(f"{rel}: нет заголовка ({e.__class__.__name__})")
            continue
        role = h.get("role")
        sysp, rxs = TEMPLATE_RX.get(role, (None, []))
        if h.get("system_prompt") != sysp:
            probs.append(f"{rel}: системный промпт роли {role} не действующий")
        elif not any(rx.match(h.get("prompt", "")) for rx in rxs):
            probs.append(f"{rel}: задание роли {role} не по действующему шаблону")
    return probs


def answer_problems(a, bank):
    probs = []
    resp = a["responses"]
    if set(resp) != set(bank):
        probs.append(f"ответов {len(resp)}, в банке {len(bank)} (банк ответа {a.get('bank_version')})")
    for qid, v in resp.items():
        q = bank.get(qid)
        if q is None:
            continue
        if v == "skipped":
            if not q.get("optional"):
                probs.append(f"пропуск у обязательного {qid}")
            continue
        if "firm" in v and not q.get("firm"):
            probs.append(f"отметка у {qid}")
    if len(set(a.get("priorities", []))) != RR.PRIORITY_TOP:
        probs.append("не 5 сфер")
    return probs


def thresholds():
    return RR.read_json(THRESHOLDS)


def crit(table, n):
    """Критическое значение для n людей: из таблицы batch-thresholds.json берётся строка с наибольшим n_grid ≤ n
    (для меньших n — первая строка); так тест не строже, чем посчитано."""
    grid = sorted(int(k) for k in table)
    use = max([g_ for g_ in grid if g_ <= n], default=grid[0])
    return table[str(use)], use


def item_values(ids, qid, fn, sign):
    xs, xt, ys, ids_ok = [], [], [], []
    for pid in ids:
        a = j(os.path.join(ROOT, "answers", f"{pid}.json"))["responses"].get(qid)
        if a in (None, "skipped"):
            continue
        rs = j(os.path.join(ROOT, "inputs", "self", f"{pid}.json"))
        vs = fn(rs)
        vt = fn(j(os.path.join(ROOT, "inputs", "truth", f"{pid}.json")))
        if vs is None:
            continue
        xs.append(vs)
        xt.append(vt)
        ys.append(float(a["option"]))
        ids_ok.append(pid)
    ys = np.array(ys)
    yv = ys if sign > 0 else 6 - ys     # знак −1: переворачиваем ответ в шкалу поля
    return np.array(xs), np.array(xt), yv, ids_ok


def spear(a, b):
    return float(spearmanr(a, b).correlation) if len(a) > 2 and len(set(a)) > 1 and len(set(b)) > 1 else None


def stats(ids, bank):
    rows = {}
    for qid, field, fn, sign, desirable, cls, binary in MAPPING:
        directed = desirable != 0
        if qid not in bank:
            rows[qid] = {"field": field, "missing_in_bank": True}
            continue
        xs, xt, yv, ids_ok = item_values(ids, qid, fn, sign)
        sd_s = float(np.std(xs, ddof=1)) if len(xs) > 1 else float("nan")
        r = {"field": field, "sphere": bank[qid]["sphere"], "n": int(len(xs)), "directed": directed, "class": cls,
             "binary": binary,
             # у двоичного поля отношение SD не имеет смысла (другая мера): только ранговая (точечно-бисериальная) связь
             "sd_ratio": (round(float(np.std(yv, ddof=1)) / sd_s, 3) if sd_s > 0 and not binary else None),
             "spearman_self": None if spear(xs, yv) is None else round(spear(xs, yv), 3),
             "spearman_truth": None if spear(xt, yv) is None else round(spear(xt, yv), 3)}
        if directed and sd_s > 0:
            # > 0 — ответ D ближе к желательному полюсу, чем самоотчёт (в SD самоотчёта)
            r["shift_vs_self_sd"] = round(float(desirable * np.mean(yv - xs)) / sd_s, 3)
            st = float(np.std(xt, ddof=1))
            r["shift_vs_truth_sd"] = round(float(desirable * np.mean(yv - xt)) / st, 3) if st > 0 else None
        if qid == "humor-11":
            hs = np.array([HOST_FIELD(j(os.path.join(ROOT, "inputs", "self", f"{p}.json"))) for p in ids_ok])
            rh = spear(hs, yv)
            r["spearman_self_hostility"] = None if rh is None else round(rh, 3)
            r["measures_hostility_rather_than_humor"] = (rh is not None and r["spearman_self"] is not None
                                                         and rh >= r["spearman_self"])
        rows[qid] = r
    return rows


def verdict(rows, n_people, T):
    """Вердикт ред. 5.1 (design.md, 17.14). Брак — только если статистика ниже критического значения для этого n
    (при «граничном» D — в популяции ровно на порогах 3.3 — такое случается с вероятностью ≈ 1% на правило)."""
    strong = [r for r in rows.values() if r.get("class") == "strong" and r.get("n", 0) > 2]
    weak = [r for r in rows.values() if r.get("class") == "weak" and r.get("n", 0) > 2]
    sdr = [r["sd_ratio"] for r in strong if r.get("sd_ratio") is not None]
    rho = [r["spearman_self"] for r in strong if r.get("spearman_self") is not None]
    reasons, used = [], {}
    c, g_ = crit(T["median_spearman_strong"], n_people)
    used["median_spearman_strong"] = {"critical": c, "n_grid": g_}
    if rho and np.median(rho) < c:
        reasons.append(f"медиана ранговой корреляции {np.median(rho):.2f} < {c:.2f} (n = {n_people}; в популяции 0,5)")
    c, g_ = crit(T["median_sd_ratio_strong"], n_people)
    used["median_sd_ratio_strong"] = {"critical": c, "n_grid": g_}
    if sdr and np.median(sdr) < c:
        reasons.append(f"медиана отношения SD {np.median(sdr):.2f} < {c:.2f} (n = {n_people}; в популяции 0,8)")
    if n_people >= ITEM_RULES_MIN_N:          # отдельный вопрос — только нарастающим итогом от 40 человек
        for cls, key in (("strong", "item_spearman_strong"), ("weak", "item_spearman_weak")):
            c, g_ = crit(T[key], n_people)
            used[key] = {"critical": c, "n_grid": g_}
            for qid, r in rows.items():
                if r.get("class") == cls and r.get("n", 0) > 2 and r.get("spearman_self") is not None \
                        and r["spearman_self"] < c:
                    reasons.append(f"{qid}: ранговая корреляция {r['spearman_self']:.2f} < {c:.2f} ({cls}, n = {r['n']})")
        c, g_ = crit(T["item_sd_ratio"], n_people)
        used["item_sd_ratio"] = {"critical": c, "n_grid": g_}
        for qid, r in rows.items():
            if r.get("class") in ("strong", "weak") and r.get("n", 0) > 2 and r.get("sd_ratio") is not None \
                    and r["sd_ratio"] < c:
                reasons.append(f"{qid}: отношение SD {r['sd_ratio']:.2f} < {c:.2f} (n = {r['n']})")
    # сдвиг D к желательному: все направленные вопросы, включая conflicts-02 (класс shift)
    dirs = [r for r in rows.values() if r.get("directed") and r.get("shift_vs_self_sd") is not None and r.get("n", 0) > 2]
    shifts = [r["shift_vs_self_sd"] for r in dirs]
    by_sphere = {}
    for r in dirs:
        by_sphere.setdefault(r["sphere"], []).append(r["shift_vs_self_sd"])
    sph = {k: round(float(np.mean(v)), 3) for k, v in by_sphere.items()}
    stop = []
    c, g_ = crit(T["shift_mean"], n_people)
    used["shift_mean"] = {"critical": c, "n_grid": g_}
    if shifts and np.mean(shifts) > c:
        stop.append(f"средний сдвиг D к желательному {np.mean(shifts):+.2f} SD > {c:.2f} (n = {n_people}; в популяции 0,4)")
    tab, g_ = crit(T["shift_sphere"], n_people)
    used["shift_sphere"] = {"critical": tab, "n_grid": g_}
    stop += [f"сфера {k}: сдвиг {v:+.2f} SD > {tab[k]:.2f} (в популяции 0,6)" for k, v in sph.items() if k in tab and v > tab[k]]
    warn = []
    if sdr and np.median(sdr) < SD_RATIO_POP:
        warn.append(f"медиана отношения SD {np.median(sdr):.2f} ниже популяционного порога {SD_RATIO_POP} (предупреждение; брак — только по критическому значению для n)")
    if rho and np.median(rho) < RHO_POP_STRONG:
        warn.append(f"медиана ранговой корреляции {np.median(rho):.2f} ниже популяционного порога {RHO_POP_STRONG} (предупреждение; брак — только по критическому значению для n)")
    h = rows.get("humor-11", {})
    if h.get("measures_hostility_rather_than_humor"):
        warn.append(f"humor-11: ρ с враждебностью {h['spearman_self_hostility']:.2f} ≥ ρ с «подкалывает» "
                    f"{h['spearman_self']:.2f} — вопрос мерит враждебность, а не юмор")
    return {"reject_reasons": reasons, "stop_reasons": stop, "warnings": warn, "critical_used": used,
            "median_sd_ratio": round(float(np.median(sdr)), 3) if sdr else None,
            "median_spearman_self": round(float(np.median(rho)), 3) if rho else None,
            "mean_shift_vs_self_sd": round(float(np.mean(shifts)), 3) if shifts else None, "shift_by_sphere": sph}


def check(ids, bank, label, T):
    out = {"label": label, "ids": ids, "n": len(ids), "people": {}}
    probs_all = []
    for pid in ids:
        pr = version_problems(pid)
        ap = os.path.join(ROOT, "answers", f"{pid}.json")
        pr += answer_problems(j(ap), bank) if os.path.exists(ap) else [f"нет answers/{pid}.json"]
        out["people"][pid] = pr
        probs_all += [f"{pid}: {x}" for x in pr]
    have = [p for p in ids if os.path.exists(os.path.join(ROOT, "answers", f"{p}.json"))]
    rows = stats(have, bank)
    v = verdict(rows, len(have), T)
    v["reject_reasons"] = [f"версии/ответы: {x}" for x in probs_all] + v["reject_reasons"]
    out.update(items=rows, **v)
    out["verdict"] = "брак" if v["reject_reasons"] else "принять"
    out["stop"] = bool(v["stop_reasons"])
    return out


def main():
    ap = argparse.ArgumentParser()
    g_ = ap.add_mutually_exclusive_group(required=True)
    g_.add_argument("--ids", nargs="+")
    g_.add_argument("--all", action="store_true")
    ap.add_argument("--cumulative", action="store_true")
    args = ap.parse_args()
    bank = {q["id"]: q for q in j(RR.BANK)["questions"]}
    all_ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, "answers", "*.json")))
    ids = all_ids if args.all else args.ids
    for pid in ids:
        if not re.fullmatch(r"[a-z0-9]{4}", pid):
            raise SystemExit(f"плохой id {pid!r}")
    T = thresholds()
    res = {"checked": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "design": "design.md, 17.11–17.12, 17.14",
           "thresholds_file": os.path.relpath(THRESHOLDS, PROJECT), "thresholds_sha256": hashlib.sha256(open(THRESHOLDS, "rb").read()).hexdigest(),
           "population_thresholds": {"sd_ratio": SD_RATIO_POP, "spearman_strong": RHO_POP_STRONG,
                                     "spearman_weak": RHO_POP_WEAK, "shift_mean_sd": SHIFT_MEAN_POP,
                                     "shift_sphere_sd": SHIFT_SPHERE_POP, "item_rules_min_n": ITEM_RULES_MIN_N},
           "portion": check(ids, bank, "порция", T)}
    if args.cumulative:
        res["cumulative"] = check(all_ids, bank, "нарастающий итог", T)
    os.makedirs(os.path.join(ROOT, "pilot"), exist_ok=True)
    path = os.path.join(ROOT, "pilot", f"batch-check-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    RR.write_file(path, res)
    for key in ("portion", "cumulative"):
        if key not in res:
            continue
        r = res[key]
        print(f"[{r['label']}] {r['n']} чел.: {r['verdict'].upper()}"
              + (" | ОСТАНОВКА ПО СДВИГУ" if r["stop"] else "")
              + f" | медиана SD-отношения {r['median_sd_ratio']}, медиана ρ {r['median_spearman_self']}, "
                f"средний сдвиг {r['mean_shift_vs_self_sd']} SD")
        for x in (r["reject_reasons"][:15] + r["stop_reasons"]):
            print("   -", x)
        for x in r["warnings"]:
            print("   ! ", x)
    print("→", os.path.relpath(path, PROJECT))
    sys.exit(0 if res["portion"]["verdict"] == "принять" and not res["portion"]["stop"] else 1)


if __name__ == "__main__":
    main()
