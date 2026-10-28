"""Критические значения проверки порции и вероятность ложного брака от шума (design.md, 17.14; критик 05, п. 2).

  python3 research/blind/batch_sim.py      → research/blind/batch-thresholds.json

Модель (записана до первой порции; ответов D не читает — только inputs/self и банк):
  - люди — те же 100 человек выборки (их самоотчёт по полям сопоставления 17.12); порция — n человек без возвращения;
  - ответ D на вопрос = round(среднее поля + b·SD поля·(a·z + √(1−a²)·ε) + сдвиг к желательному), обрезка 1..5,
    где z — нормальные метки рангов поля в выборке. a, b и сдвиг подбираются так, чтобы на всей выборке («в
    популяции», 200 повторов шума) ранговая корреляция, отношение SD и сдвиг были ровно заданными;
  - «граничный D» — в популяции ровно на порогах: прямые аналоги ρ = 0,5, слабые 0,3, отношение SD 0,8, сдвиг как
    во втором пилоте. Критические значения — 1-й перцентиль статистики у граничного D (для «наименьшего по вопросам» —
    1-й перцентиль минимума, т. е. 1% на всё семейство вопросов); для сдвига — 99-й перцентиль при сдвиге ровно 0,4
    (среднее) и (1 − 1%/K)-й при 0,6 (сфера, K сфер);
  - затем полный вердикт batch_check.verdict прогоняется на симулированных порциях: вероятность ложного брака у
    граничного и у «обычного» D, ложной остановки при сдвиге как во втором пилоте, и мощность против плохого D.
Ограничение: шум ответа независим между вопросами при данном человеке (общие склонности D не моделируются).
"""
import json
import os
import sys
import warnings

import numpy as np
from scipy.stats import norm, rankdata

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import batch_check as BC  # noqa: E402
import run_roles as RR  # noqa: E402

SEED = 20261028_51
N_GRID = (15, 20, 30, 40, 60, 80, 100)
SIMS = 10000        # порций на сценарий и n для критических значений
EVAL_SIMS = 4000    # из них — для вероятностей полного вердикта
POP_REPS = 200
ALPHA = .0025       # на правило; подобрано так, чтобы за весь прогон из 100 человек ложный брак у граничного D был ≈ 5%
RUN_SIMS = 1000
OUT = os.path.join(ROOT, "batch-thresholds.json")

# сценарии «в популяции» (ρ по классу, отношение SD, сдвиг по вопросу)
PILOT_SHIFT = {"conflicts-07": .58, "conflicts-01": .58, "trauma-06": .46, "conflicts-02": .42, "leisure-11": 0.0}
SCEN = {
    "boundary": {"rho": {"strong": .5, "weak": .3, "shift": .5}, "sdr": .8, "shift": "pilot"},
    "typical": {"rho": {"strong": .65, "weak": .4, "shift": .5}, "sdr": .9, "shift": "pilot"},
    "bad": {"rho": {"strong": .25, "weak": .1, "shift": .25}, "sdr": .55, "shift": "pilot"},
    "shift_mean_boundary": {"rho": {"strong": .5, "weak": .3, "shift": .5}, "sdr": .8, "shift": .4},
    "shift_sphere_boundary": {"rho": {"strong": .5, "weak": .3, "shift": .5}, "sdr": .8, "shift": .6},
    "shift_big": {"rho": {"strong": .65, "weak": .4, "shift": .5}, "sdr": .9, "shift": .8},
}


def population():
    ids = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "inputs", "self")) if f.endswith(".json"))
    recs = [RR.read_json(os.path.join(ROOT, "inputs", "self", f"{p}.json")) for p in ids]
    bank = {q["id"]: q for q in RR.read_json(RR.BANK)["questions"]}
    items = []
    for qid, field, fn, sign, des, cls, binary in BC.MAPPING:
        x = np.array([np.nan if fn(r) is None else fn(r) for r in recs], float)
        ok = ~np.isnan(x)
        z = np.full(len(x), np.nan)
        z[ok] = norm.ppf((rankdata(x[ok]) - .5) / ok.sum())
        items.append({"qid": qid, "sphere": bank[qid]["sphere"], "des": des, "cls": cls, "binary": binary,
                      "x": x, "ok": ok, "z": z, "mx": float(np.nanmean(x)), "sx": float(np.nanstd(x, ddof=1))})
    return ids, items


def answers(it, a, b, d, eps):
    """eps: (..., N) стандартный шум → ответ в шкале поля 1..5."""
    lat = a * np.nan_to_num(it["z"]) + np.sqrt(max(1 - a * a, 0)) * eps
    return np.clip(np.round(it["mx"] + b * it["sx"] * lat + it["des"] * d * it["sx"]), 1, 5)


def rowspear(x, y):
    """Ранговая корреляция по строкам (x, y: (S, n))."""
    rx, ry = rankdata(x, axis=1), rankdata(y, axis=1)
    rx -= rx.mean(1, keepdims=True)
    ry -= ry.mean(1, keepdims=True)
    den = np.sqrt((rx * rx).sum(1) * (ry * ry).sum(1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, (rx * ry).sum(1) / den, np.nan)


def pop_metrics(it, a, b, d, E):
    ok = it["ok"]
    y = answers(it, a, b, d, E)[:, ok]
    x = np.broadcast_to(it["x"][ok], y.shape)
    rho = float(rowspear(x.reshape(1, -1), y.reshape(1, -1))[0])
    sdr = float(y.std() / it["x"][ok].std())
    sh = float(it["des"] * (y - x).mean() / it["sx"]) if it["des"] else 0.0
    return rho, sdr, sh


def bisect(f, lo, hi, target, iters=16):
    flo = f(lo) - target
    for _ in range(iters):
        mid = (lo + hi) / 2
        if (f(mid) - target) * flo > 0:
            lo, flo = mid, f(mid) - target
        else:
            hi = mid
    return (lo + hi) / 2


def calibrate(it, rho_t, sdr_t, sh_t, E):
    if it["binary"]:
        sdr_t = 1.0 / it["sx"]          # двоичное поле: SD ответа ≈ 1 ступень (отношение SD не меряется)
    a, b, d = .7, .8, 0.0
    for _ in range(4):
        b = bisect(lambda v: pop_metrics(it, a, v, d, E)[1], .05, 3.0, sdr_t)
        a = bisect(lambda v: pop_metrics(it, v, b, d, E)[0], 0.0, 1.0, rho_t)
        if it["des"]:
            d = bisect(lambda v: pop_metrics(it, a, b, v, E)[2], -1.0, 2.0, sh_t)
    return a, b, d, pop_metrics(it, a, b, d, E)


def simulate(items, params, n, rng, sims=SIMS):
    """Статистики batch_check по S симулированным порциям из n человек (S × вопросов)."""
    N = len(items[0]["x"])
    pick = np.argsort(rng.random((sims, N)), axis=1)[:, :n]
    out = {}
    for it, (a, b, d) in zip(items, params):
        eps = rng.standard_normal((sims, N))
        y = answers(it, a, b, d, eps)
        okm = it["ok"][pick]
        x = np.where(okm, it["x"][pick], np.nan)
        yy = np.take_along_axis(y, pick, 1)
        # люди без значения поля (дети «не знаю») выпадают: заменяем их значения так, чтобы не влиять на ранги
        rho, sdr, sh = np.full(sims, np.nan), np.full(sims, np.nan), np.full(sims, np.nan)
        nn = okm.sum(1)
        for k in np.unique(nn):
            rows_ = nn == k
            if k < 3:
                continue
            xs = x[rows_][okm[rows_]].reshape(-1, k)
            ys = yy[rows_][okm[rows_]].reshape(-1, k)
            rho[rows_] = rowspear(xs, ys)
            sx = xs.std(1, ddof=1)
            with np.errstate(invalid="ignore", divide="ignore"):
                sdr[rows_] = np.where(sx > 0, ys.std(1, ddof=1) / sx, np.nan)
                if it["des"]:
                    sh[rows_] = np.where(sx > 0, it["des"] * (ys - xs).mean(1) / sx, np.nan)
        if it["binary"]:
            sdr[:] = np.nan
        out[it["qid"]] = {"rho": rho, "sdr": sdr, "shift": sh, "n": nn}
    return out


def q(x, p):
    return round(float(np.nanquantile(x, p)), 3)


def rows_of(items, st, s):
    rows = {}
    for it in items:
        v = st[it["qid"]]
        rows[it["qid"]] = {"sphere": it["sphere"], "class": it["cls"], "binary": it["binary"], "directed": it["des"] != 0,
                           "n": int(v["n"][s]),
                           "sd_ratio": None if np.isnan(v["sdr"][s]) else round(float(v["sdr"][s]), 3),
                           "spearman_self": None if np.isnan(v["rho"][s]) else round(float(v["rho"][s]), 3),
                           **({"shift_vs_self_sd": round(float(v["shift"][s]), 3)} if it["des"] and not np.isnan(v["shift"][s]) else {})}
    return rows


def stats_subset(items, Y, sub):
    """Статистики batch_check для подмножества людей sub (Y — ответы всех людей на каждый вопрос)."""
    rows = {}
    for it, y in zip(items, Y):
        ok = it["ok"][sub]
        xs, ys = it["x"][sub][ok], y[sub][ok]
        n = len(xs)
        sx = xs.std(ddof=1) if n > 1 else 0.0
        rho = float(rowspear(xs[None], ys[None])[0]) if n > 2 else np.nan
        sdr = float(ys.std(ddof=1) / sx) if sx > 0 and not it["binary"] else np.nan
        r = {"sphere": it["sphere"], "class": it["cls"], "binary": it["binary"], "directed": it["des"] != 0, "n": int(n),
             "sd_ratio": None if np.isnan(sdr) else round(sdr, 3), "spearman_self": None if np.isnan(rho) else round(rho, 3)}
        if it["des"] and sx > 0:
            r["shift_vs_self_sd"] = round(float(it["des"] * (ys - xs).mean() / sx), 3)
        rows[it["qid"]] = r
    return rows


def run_level(items, params, T, rng, sims=RUN_SIMS, portion=20):
    """Весь прогон по протоколу 16.10, п. 4: порции по 20 человек, после каждой — проверка порции и, начиная
    с 40 человек, нарастающего итога. Доля прогонов, где хоть одна проверка дала брак / остановку."""
    N = len(items[0]["x"])
    rej = stop = 0
    for _ in range(sims):
        Y = [answers(it, a, b, d, rng.standard_normal(N)) for it, (a, b, d) in zip(items, params)]
        order = rng.permutation(N)
        any_rej = any_stop = False
        for k in range(portion, N + 1, portion):
            checks = [(order[k - portion:k], portion)] + ([(order[:k], k)] if k >= 2 * portion else [])
            for sub, n in checks:
                v = BC.verdict(stats_subset(items, Y, sub), n, T)
                any_rej |= bool(v["reject_reasons"])
                any_stop |= bool(v["stop_reasons"])
        rej += any_rej
        stop += any_stop
    return {"reject_any": round(rej / sims, 4), "stop_any": round(stop / sims, 4)}


def main():
    warnings.filterwarnings("ignore", category=RuntimeWarning)   # пустые срезы: сфера без разброса в порции
    rng = np.random.default_rng(SEED)
    ids, items = population()
    E = rng.standard_normal((POP_REPS, len(ids)))
    params, pop_check = {}, {}
    for name, sc in SCEN.items():
        ps, chk = [], {}
        for it in items:
            sh_t = (PILOT_SHIFT.get(it["qid"], .28) if sc["shift"] == "pilot" else sc["shift"]) if it["des"] else 0.0
            a, b, d, got = calibrate(it, sc["rho"][it["cls"]], sc["sdr"], sh_t, E)
            ps.append((a, b, d))
            chk[it["qid"]] = {"rho": round(got[0], 3), "sd_ratio": round(got[1], 3), "shift": round(got[2], 3)}
        params[name], pop_check[name] = ps, chk
        print(f"сценарий {name}: подобран")
    strong = [it["qid"] for it in items if it["cls"] == "strong"]
    weak = [it["qid"] for it in items if it["cls"] == "weak"]
    sd_items = [it["qid"] for it in items if it["cls"] in ("strong", "weak") and not it["binary"]]
    dirs = [it["qid"] for it in items if it["des"]]
    spheres = sorted({it["sphere"] for it in items if it["des"]})
    T = {k: {} for k in ("median_spearman_strong", "median_sd_ratio_strong", "item_spearman_strong",
                         "item_spearman_weak", "item_sd_ratio", "shift_mean", "shift_sphere")}
    sims = {}
    for n in N_GRID:
        sims[n] = {name: simulate(items, params[name], n, rng) for name in SCEN}
        b_ = sims[n]["boundary"]
        mat = lambda st, keys, f: np.column_stack([st[k][f] for k in keys])
        T["median_spearman_strong"][str(n)] = q(np.nanmedian(mat(b_, strong, "rho"), 1), ALPHA)
        T["median_sd_ratio_strong"][str(n)] = q(np.nanmedian(mat(b_, [k for k in strong if k in sd_items], "sdr"), 1), ALPHA)
        T["item_spearman_strong"][str(n)] = q(np.nanmin(mat(b_, strong, "rho"), 1), ALPHA)
        T["item_spearman_weak"][str(n)] = q(np.nanmin(mat(b_, weak, "rho"), 1), ALPHA)
        T["item_sd_ratio"][str(n)] = q(np.nanmin(mat(b_, sd_items, "sdr"), 1), ALPHA)
        sm = sims[n]["shift_mean_boundary"]
        T["shift_mean"][str(n)] = q(np.nanmean(mat(sm, dirs, "shift"), 1), 1 - ALPHA)
        ss = sims[n]["shift_sphere_boundary"]
        T["shift_sphere"][str(n)] = {sp: q(np.nanmean(mat(ss, [it["qid"] for it in items if it["des"] and it["sphere"] == sp], "shift"), 1),
                                           1 - ALPHA / len(spheres)) for sp in spheres}
    # полный вердикт batch_check на симулированных порциях
    probs = {}
    for n in N_GRID:
        pr = {}
        for name in ("boundary", "typical", "bad", "shift_big"):
            st = sims[n][name]
            rej = stop = 0
            for s in range(EVAL_SIMS):
                v = BC.verdict(rows_of(items, st, s), n, T)
                rej += bool(v["reject_reasons"])
                stop += bool(v["stop_reasons"])
            pr[name] = {"reject": round(rej / EVAL_SIMS, 4), "stop": round(stop / EVAL_SIMS, 4)}
        # для сравнения: правила ред. 5 (17.11 до 5.1) на тех же порциях — точечные пороги без поправки на шум
        old_in = [it["qid"] for it in items if it["qid"] != "conflicts-02"]
        old_dirs = [it["qid"] for it in items if it["qid"] != "conflicts-02" and it["qid"] != "attach-01" and it["des"]] + ["attach-01"]
        for name in ("boundary", "typical"):
            st = sims[n][name]
            R_ = np.column_stack([st[k]["rho"] for k in old_in])
            S_ = np.column_stack([st[k]["sdr"] if k != "budget-09" else
                                  np.full(SIMS, np.nan) for k in old_in])
            # в ред. 5 у budget-09 отношение SD считалось (двоичное поле в шкале 1..5): SD ответа ≈ 1 против SD поля
            sx_b = items[[it["qid"] for it in items].index("budget-09")]["sx"]
            S_[:, old_in.index("budget-09")] = 1.0 / sx_b
            rej = (np.nanmedian(S_, 1) < .8) | (np.nanmedian(R_, 1) < .5) | (np.nanmin(S_, 1) < .6) | (np.nanmin(R_, 1) < .3)
            pr[f"{name}_rules_r5"] = {"reject": round(float(rej.mean()), 4)}
            S_[:, old_in.index("budget-09")] = np.nan     # то же без ошибки с двоичным полем — только шум
            rej = (np.nanmedian(S_, 1) < .8) | (np.nanmedian(R_, 1) < .5) | (np.nanmin(S_, 1) < .6) | (np.nanmin(R_, 1) < .3)
            pr[f"{name}_rules_r5_without_credit_sd"] = {"reject": round(float(rej.mean()), 4)}
        probs[str(n)] = pr
        print(f"n = {n}: " + "; ".join(f"{k} брак {v['reject']:.3f}" + (f" / остановка {v['stop']:.3f}" if "stop" in v else "") for k, v in pr.items()))
    run = {name: run_level(items, params[name], T, rng) for name in ("boundary", "typical")}
    print("весь прогон (порции по 20 + нарастающий итог):", run)
    out = {"note": "Критические значения проверки порции (design.md, 17.14), посчитаны batch_sim.py до первой порции. "
                   "Строка — n людей в проверке (берётся наибольшая строка n ≤ фактического). Брак — статистика ниже "
                   "критического значения; остановка — сдвиг выше. Ответов D симуляция не читала.",
           "seed": SEED, "sims": SIMS, "eval_sims": EVAL_SIMS, "run_sims": RUN_SIMS, "pop_reps": POP_REPS, "alpha_per_rule": ALPHA, "n_grid": list(N_GRID),
           "classes": {"strong": strong, "weak": weak, "sd_ratio_items": sd_items, "directed": dirs, "spheres": spheres},
           "scenarios": {k: {"rho": v["rho"], "sd_ratio": v["sdr"],
                             "shift": "как во втором пилоте (16.10): уход от разговора 0,58, тревожность 0,46, критика 0,42, "
                                      "алкоголь 0, остальные 0,28" if v["shift"] == "pilot" else v["shift"]} for k, v in SCEN.items()},
           "population_check": pop_check,
           **T,
           "probabilities": probs,
           "whole_run_portions_of_20": run}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print("→", os.path.relpath(OUT, os.path.join(ROOT, "..", "..")))


if __name__ == "__main__":
    main()
