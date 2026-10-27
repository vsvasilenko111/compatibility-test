"""Сводка «задумано — получилось» (research/blind/generation-report.md).

Запуск из корня проекта после outcome.py:  python3 research/blind/report.py
Отчёт агрегатный: ни одного id, ни одного коэффициента формулы исхода (design.md, 6, 8.3).
"""
import os
import sys

import numpy as np
from scipy.stats import norm, spearmanr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402
from calibrate import city_groups  # noqa: E402
from generate import reference_intercepts  # noqa: E402
from outcome import person_boot, self_arrays, wauc_strat, wspear  # noqa: E402

PI2_3 = np.pi ** 2 / 3
rows = []
srows = []      # выборка против ожидания генератора (критик 2, п. 5)
private = {}    # числа, которые владельцу теста не показываются (доли и AUC по семействам и т. п.) -> private/


def sflag(name, g, c, se, healthy=None, n=None):
    """g — выборка, c — ожидание генератора (калибровка), se — SE на выборке; healthy: +1, если «здоровее»
    = выше, −1 — ниже, None — направления нет."""
    z = (g - c) / se if se > 0 else 0.0
    hd = None if healthy is None or abs(z) < 1e-9 else ("да" if np.sign(z) == healthy else "нет")
    srows.append((name, n, c, g, z, hd))


def share_flag(name, x, c, healthy=None):
    x = np.asarray(x, float)
    n = len(x)
    sflag(name, x.mean(), c, np.sqrt(max(c * (1 - c), 1e-9) / n), healthy, n)


def mean_flag(name, x, c, healthy=None):
    x = np.asarray(x, float)
    sflag(name, x.mean(), c, x.std(ddof=1) / np.sqrt(len(x)), healthy, len(x))


def pc(x):
    return f"{100 * x:.1f}%"


def add(table, name, plan, src, got, cal, ok=None):
    rows.append((table, name, plan, src, got, cal, ok))


def tol_ok(v, lo, hi):
    return "да" if lo <= v <= hi else "НЕТ"


def main():
    B.check_versions()
    tree = B.seed_tree()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    selfr = B.load(os.path.join(B.ROOT, "selfreport.json"))["people"]
    P = B.arrays_from_people(people)
    # нужные поля, которых нет в обратном загрузчике
    P["edu"] = np.array([p["education"] for p in people])
    P["smoke"] = np.array([p["nicotine"] for p in people])
    P["style"] = np.array([p["attachment"]["style"] for p in people])
    P["host_f"] = np.array([p["conflict"]["hostility_criticism_contempt"] for p in people])
    P["PATERNAL"] = np.array([p["roles"]["man_is_head_of_family"] for p in people])
    P["BREADW"] = np.array([p["roles"]["man_must_provide"] for p in people])
    P["young"] = P["age"] <= 24
    S = self_arrays(selfr, P)
    S["JEAL"] = np.array([s["admits_secretly_checking_partner_phone"] for s in selfr])
    EXT_FIELD = {"DEFENS": "conflict_defensiveness", "JEAL_FEEL": "jealousy_feeling",
                 "CONTROL": "controlling_partner", "LIE": "lies_to_partner_small_things"}
    for k, fld in EXT_FIELD.items():
        P[k] = np.array([p["z"][k] for p in people])
        P[k + "_F"] = np.array([B.FREQ.index(p[fld]) for p in people])
        S[k + "_F"] = np.array([B.FREQ.index(x[fld]) for x in selfr])
    P["N"], P["A"] = np.array([p["z"]["N"] for p in people]), np.array([p["z"]["A"] for p in people])

    # калибровочная популяция (10 000 человек, своё зерно) — показывает, что генератор попадает в доли
    ct = B.seed_tree(tree["calibration"])
    icpt = reference_intercepts(tree)
    rng = B.rng_of(ct, "skeleton")
    C, _ = B.derive(B.make_frame(100, rng), rng, icpt)
    C["batch"] = np.repeat(np.arange(100), 100)
    CS = B.selfreport(C, B.rng_of(ct, "selfreport"))
    B.derive_ext(C, B.rng_of(ct, "skeleton_ext"))
    B.selfreport_ext(C, CS, B.rng_of(ct, "selfreport_ext"))
    C["style"] = B.att_style(C["ANX"], C["AVO"])

    def both(f):
        return f(P), f(C)

    T = "Скелет"
    sx = (P["sex"] == 0).sum(), (P["sex"] == 1).sum()
    add(T, "мужчины / женщины", "50 / 50", "по построению", f"{sx[0]} / {sx[1]}", "—", tol_ok(sx[0], 50, 50))
    add(T, "возраст", "20–30", "аудитория", f"{P['age'].min()}–{P['age'].max()}", f"{C['age'].min()}–{C['age'].max()}",
        tol_ok(P["age"].min(), 20, 30))
    g, c = both(lambda X: X["age"][X["sex"] == 0].mean() - X["age"][X["sex"] == 1].mean())
    add(T, "средний возраст м − ж", "≈ +1,5…2 (чтобы в парах мужчина был старше)", "[допущение], поправка 2", f"{g:+.2f}", f"{c:+.2f}")
    for ci, cname in enumerate(B.CITIES):
        add(T, f"город: {cname}", f"{B.CITY_QUOTA[ci]}", "квота [допущение]", f"{(P['city'] == ci).sum()}", "—")
    for ci, cname in enumerate(B.CITIES):
        sh = B.EDU_SHARES[cname]
        g, c = both(lambda X: np.mean(np.array(X["edu"])[X["city"] == ci] == "высшее"))
        add(T, f"высшее образование, {cname}", pc(sh[2]), "[допущение]", pc(g), pc(c), tol_ok(c, sh[2] - .03, sh[2] + .03))
    g, c = both(lambda X: np.mean(np.array(X["style"]) == "надёжный"))
    add(T, "надёжная привязанность (оба z < 0,6)", "55–60%", "Mickelson 1997 [пров.]", pc(g), pc(c), tol_ok(c, .55, .60))
    g, c = both(lambda X: np.mean(B.ecr_anx(X["ANX"]) > 5))
    add(T, "тревожность ECR-R > 5", "≈ 15–16% (пересчитано, критик п. 9)", "нормы Fraley [пров.]", pc(g), pc(c), tol_ok(c, .14, .17))
    g, c = both(lambda X: (B.ecr_anx(X["ANX"]).mean(), B.ecr_anx(X["ANX"]).std()))
    add(T, "тревожность ECR-R, M (SD)", "3,64 (1,33)", "Fraley [пров.]", f"{g[0]:.2f} ({g[1]:.2f})", f"{c[0]:.2f} ({c[1]:.2f})")
    g, c = both(lambda X: (B.ecr_avo(X["AVO"]).mean(), B.ecr_avo(X["AVO"]).std()))
    add(T, "избегание ECR-R, M (SD)", "2,93 (1,18)", "Fraley [пров.]", f"{g[0]:.2f} ({g[1]:.2f})", f"{c[0]:.2f} ({c[1]:.2f})")
    for fi, (f, t) in enumerate(zip(B.FREQ, (.10, .40, .35, .15))):
        g, c = both(lambda X: np.mean(B.freq_of(X["HOST"]) == fi))
        add(T, f"враждебность в конфликте «{f}»", pc(t), "[допущение]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    for y, lab, t in ((True, "20–24", .45), (False, "25–30", .38)):
        g, c = both(lambda X: X["JEAL"][X["young"] == y].mean())
        add(T, f"тайно проверял телефон, {lab}", pc(t), "ВЦИОМ 2025 [пров.]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    for y, lab, t in ((True, "20–24", .54), (False, "25–30", .61)):
        g, c = both(lambda X: np.mean(X["DRINK_LVL"][(X["young"] == y) & ~X["ISLAM"]] == 0))
        add(T, f"не пьют, {lab} (без мусульман)", pc(t) + " (м −5, ж +5 п. п.)", "ВЦИОМ 2024 [пров.]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    for s, lab, t in ((0, "м", (.15, .50, .35)), (1, "ж", (.39, .48, .13))):
        g, c = both(lambda X: [np.mean(X["DRINK_LVL"][(X["sex"] == s) & (X["DRINK_LVL"] > 0)] == L) for L in (1, 2, 3)])
        add(T, f"частота среди пьющих, {lab}: <1/мес / ежемес. / еженед.+",
            " / ".join(f"{100 * v:.0f}" for v in t), "Росстат СЗН-2023 [пров.]",
            " / ".join(f"{100 * v:.0f}" for v in g), " / ".join(f"{100 * v:.0f}" for v in c),
            tol_ok(max(abs(a - b) for a, b in zip(c, t)), 0, .03))
    for s, lab, t in ((0, "м", .07), (1, "ж", .015)):
        g, c = both(lambda X: X["RISKY"][X["sex"] == s].mean())
        add(T, f"рискованное питьё (AUDIT ≥ 8), {lab}", pc(t), "Росстат СЗН-2023, снижено для 20–30 [допущение]", pc(g), pc(c), tol_ok(c, t - .015, t + .015))
    for y, lab, t in ((True, "20–24", .40), (False, "25–30", .43)):
        g, c = both(lambda X: np.mean(np.array(X["smoke"])[X["young"] == y] != "нет"))
        add(T, f"никотин в любой форме, {lab}", pc(t), "ВЦИОМ 2024 [ист., непров.]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    for y, lab, t in ((True, "20–24", .25), (False, "25–30", .40)):
        g, c = both(lambda X: X["DEBT_ANY"][X["young"] == y].mean())
        add(T, f"свой потребкредит, {lab}", pc(t), "[допущение] от ВЦИОМ 2023", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    g, c = both(lambda X: X["DEBT_PROB"].mean())
    add(T, "проблемный долг", "6% (5–8%)", "[допущение], критик п. 9", pc(g), pc(c), tol_ok(c, .05, .08))
    g, c = both(lambda X: np.mean(X["SPEND"] > .5) if "SPEND" in X else np.nan)
    add(T, "не откладывает ничего", "31%", "НАФИ 2024 [пров.]", pc(g), pc(c), tol_ok(c, .28, .34))
    for y, lab, t in ((True, "20–24", .123 / .75), (False, "25–30", .22 / .75)):
        g, c = both(lambda X: X["INF"][X["young"] == y].mean())
        add(T, f"изменял(а) в прошлом («правда»), {lab}", pc(t), "ВЦИОМ 2025 / доля признания 0,75 [допущение]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    g, c = both(lambda X: X["PDIV"].mean())
    add(T, "родители расстались до 15 лет", "36,5% (0,87 × 42%)", "Andersson 2017 [пров.]; диапазон base-rates 35–45%", pc(g), pc(c), tol_ok(c, .34, .39))
    g, c = both(lambda X: X["BORN_SINGLE"].mean())
    add(T, "рождён вне союза (отдельное поле)", "13%", "Andersson 2017 [пров.]", pc(g), pc(c), tol_ok(c, .11, .15))
    for s, lab in ((1, "ж"), (0, "м")):
        t = B.KIDS_P[s] / B.KIDS_P[s].sum()
        g, c = both(lambda X: [np.mean(X["KIDS_N"][(X["sex"] == s) & ~np.isnan(X["KIDS_N"])] == v) for v in range(6)])
        add(T, f"желаемое число детей 0/1/2/3/4/5+, {lab}", " / ".join(f"{100 * v:.0f}" for v in t), "РПН-2022 табл. 33 [пров.]",
            " / ".join(f"{100 * v:.0f}" for v in g), " / ".join(f"{100 * v:.0f}" for v in c), tol_ok(max(abs(a - b) for a, b in zip(c, t)), 0, .03))
    for s, y, lab, t in ((1, True, "ж до 25", 1.89), (0, True, "м до 25", 1.84), (1, False, "ж 25–30", 2.03), (0, False, "м 25–30", 1.92)):
        g, c = both(lambda X: np.nanmean(X["KIDS_N"][(X["sex"] == s) & (X["young"] == y)]))
        add(T, f"среднее желаемое число детей, {lab}", f"{t:.2f}", "РПН-2022 табл. 34 [пров.]", f"{g:.2f}", f"{c:.2f}", tol_ok(c, t - .1, t + .1))
    for ci, cname in enumerate(B.CITIES):
        sh = B.CONF_SHARES.get(cname, B.CONF_SHARES["default"])
        g, c = both(lambda X: [np.mean(np.array(X["CONF"])[X["city"] == ci] == nm) for nm in ("православие", "ислам", "неверующий")])
        add(T, f"православные / ислам / неверующие, {cname}", " / ".join(f"{100 * v:.0f}" for v in sh[:3]), "ВЦИОМ 2025 + [допущение]",
            " / ".join(f"{100 * v:.0f}" for v in g), " / ".join(f"{100 * v:.0f}" for v in c), tol_ok(max(abs(a - b) for a, b in zip(c, sh[:3])), 0, .03))
    for y, lab, t in ((True, "20–24", .09), (False, "25–30", .17)):
        g, c = both(lambda X: np.mean(X["REL_LVL"][(X["young"] == y) & np.isin(np.array(X["CONF"]), ["православие", "другое / вне конфессии"])] == 3))
        add(T, f"практикуют регулярно (среди верующих, не ислам), {lab}", pc(t), "ВЦИОМ 2025 [ист., непров.]", pc(g), pc(c), tol_ok(c, t - .03, t + .03))
    g, c = both(lambda X: (np.mean(X["PATERNAL"][X["sex"] == 0]), np.mean(X["PATERNAL"][X["sex"] == 1])))
    add(T, "«глава семьи — мужчина», м / ж", "≈ 23 / 15% (ВЦИОМ, все возрасты); 15% у 18–24", "ВЦИОМ 2023 [пров.]",
        f"{100 * g[0]:.0f} / {100 * g[1]:.0f}", f"{100 * c[0]:.0f} / {100 * c[1]:.0f}")
    g, c = both(lambda X: (np.mean(X["BREADW"][X["sex"] == 0]), np.mean(X["BREADW"][X["sex"] == 1])))
    add(T, "«кормить семью должен мужчина», м / ж", "55 / 45%", "ВЦИОМ 2017 [ист., непров.]",
        f"{100 * g[0]:.0f} / {100 * g[1]:.0f}", f"{100 * c[0]:.0f} / {100 * c[1]:.0f}", tol_ok(abs(c[0] - .55) + abs(c[1] - .45), 0, .04))
    g, c = both(lambda X: (X["INF"][X["sex"] == 0].mean(), X["INF"][X["sex"] == 1].mean()))
    add(T, "изменял(а) в прошлом, все 20–30: м / ж", "в ячейках возраста ж > м на 2 п. п.",
        "ПОМЕТКА (критик 2, п. 8): в сумме перевес женщин перебивает возрастной состав — мужчины старше, а с возрастом доля растёт; "
        "формулировка «до 34 лет чаще изменяют женщины» верна внутри возраста, но не в целом по выборке",
        f"{100 * g[0]:.1f} / {100 * g[1]:.1f}", f"{100 * c[0]:.1f} / {100 * c[1]:.1f}")

    # новые поля с нулевым весом (критик 2, п. 4; design.md, 13.2)
    EXT_LAB = {"DEFENS": "оборона в ссорах", "JEAL_FEEL": "ревность как чувство", "CONTROL": "контроль партнёра",
               "LIE": "склонность приврать в мелочах"}
    for kk, lab in EXT_LAB.items():
        t = np.diff(np.concatenate([[0], B.EXT_CUTS[kk], [1]]))
        g, c = both(lambda X: [np.mean(X[kk + "_F"] == L) for L in range(4)])
        add(T, f"{lab}: почти никогда / редко / иногда / часто", " / ".join(f"{100 * v:.0f}" for v in t), "[допущение], вес в исходе 0",
            " / ".join(f"{100 * v:.0f}" for v in g), " / ".join(f"{100 * v:.0f}" for v in c),
            tol_ok(max(abs(a - b) for a, b in zip(c, t)), 0, .03))
    for kk, src, lab in (("DEFENS", "N", "оборона ↔ нейротизм"), ("DEFENS", "HOST", "оборона ↔ враждебность"),
                         ("JEAL_FEEL", "ANX", "ревность-чувство ↔ тревожность"), ("CONTROL", "ANX", "контроль ↔ тревожность"),
                         ("JEAL_FEEL", "CONTROL", "ревность-чувство ↔ контроль (общий фактор, критик 3, п. 2)"),
                         ("JEAL_FEEL", "JEAL", "ревность-чувство ↔ «тайно проверял телефон» (критик 3, п. 2)"),
                         ("CONTROL", "JEAL", "контроль ↔ «тайно проверял телефон» (критик 3, п. 2)"),
                         ("LIE", "A", "приврать ↔ доброжелательность")):
        tgt = B.ext_implied_r(kk, src)
        g, c = both(lambda X: np.corrcoef(X[kk], X[src].astype(float))[0, 1])
        add(T, f"r латентных: {lab}", f"{tgt:+.2f}", "[допущение] (критик 2, п. 4; критик 3, п. 2)", f"{g:+.2f}", f"{c:+.2f}",
            tol_ok(c, tgt - .03, tgt + .03))
    g, c = both(lambda X: np.mean(X["JEAL_FEEL_F"][X["JEAL"]] <= 1))
    add(T, "из тайно проверявших телефон ревнуют «редко» или «почти никогда»", "заметно меньше 55% (доля у всех)",
        "критик 3, п. 2: согласованность с прежним признаком [допущение]", pc(g), pc(c), tol_ok(c, 0, .40))
    for kk, lab in (("WD", "уход от разговора"),):
        g, c = both(lambda X: np.mean(B.freq_of(X[kk]) == 0))
        add(T, f"{lab}: «почти никогда» (нижняя категория переименована, как и у враждебности)", "10%", "base-rates, разд. 2: нулевой частоты нет ни у кого",
            pc(g), pc(c), tol_ok(c, .07, .13))

    # корреляции и SD
    R = B.corr_matrix()
    iu = np.triu_indices(len(B.LATENT), 1)
    stat = {}
    for X, lab in ((P, "g"), (C, "c")):
        Z = np.column_stack([X[k] for k in B.LATENT])
        E = np.corrcoef(Z.T)
        n_ = Z.shape[0]
        se = (1 - R[iu] ** 2) / np.sqrt(n_ - 1)
        stat[lab] = (np.abs(E - R)[iu].max(), np.mean(np.abs(E - R)[iu] > 1.96 * se), Z.std(0).min())
    g_dev, g_out, g_sd = stat["g"]
    c_dev, c_out, c_sd = stat["c"]
    add(T, "макс. |r выборочная − заданная| по 300 парам латентных", "калибровка ≤ 0,04 (≈3,5 SE); на n = 100 max ≈ 0,3 — случайность", "design.md 2.5.2 (поправка 5)",
        f"{g_dev:.3f}", f"{c_dev:.3f}", tol_ok(c_dev, 0, .04))
    add(T, "доля корреляций вне ±1,96 SE от заданной", "≈ 5%", "design.md 2.5.2 (поправка 5)", pc(g_out), pc(c_out), tol_ok(g_out, 0, .10))
    add(T, "мин. SD латентной черты", "≥ 0,9", "Bisbee 2024 [пров.]", f"{g_sd:.2f}", f"{c_sd:.2f}", tol_ok(g_sd, .9, 9))
    add(T, "мин. собственное число корреляционной матрицы", "> 0", "—", f"{B.min_eig():.3f}", "—", tol_ok(B.min_eig(), 1e-9, 9))

    # самоотчёт
    T2 = "Самоотчёт"
    for k in ("ANX", "AVO", "HOST", "N", "COMM", "SPEND"):
        g = np.corrcoef(P[k], S[k])[0, 1]
        c = np.corrcoef(C[k], CS[k])[0, 1]
        sh_g = (S[k] - P[k]).mean() * B.SR_DIR[k]
        add(T2, f"r «правда — самоотчёт», {k}; сдвиг к желательному", "r ≈ 0,75–0,8; сдвиг ≈ 0,4–0,5 SD", "критик п. 2 [допущение]",
            f"{g:.2f}; {sh_g:+.2f}", f"{c:.2f}; {(CS[k] - C[k]).mean() * B.SR_DIR[k]:+.2f}", tol_ok(c, .72, .83))
    g = S["INF"].sum() / max(P["INF"].sum(), 1)
    c = CS["INF"].sum() / C["INF"].sum()
    add(T2, "признают измену (из изменявших)", "35%", "Whisman & Snyder 2007 + [допущение]", pc(g), pc(c), tol_ok(c, .32, .38))
    g = S["JEAL"].sum() / max(P["JEAL"].sum(), 1)
    add(T2, "признают тайную проверку телефона", "50%", "[допущение]", pc(g), pc(CS["JEAL"].sum() / C["JEAL"].sum()))
    g, c = (S["DRINK_LVL"] < P["DRINK_LVL"]).mean(), (CS["DRINK_LVL"] < C["DRINK_LVL"]).mean()
    add(T2, "занижают частоту алкоголя (все люди)", "≈ 18–20% всех (у пьющих ~40%)", "Esser 2022 [пров.]", pc(g), pc(c))
    add(T2, "признают рискованное питьё", "0%", "правило 3.2", pc(S["RISKY"].mean()), "0.0%")
    g = S["DEBT_PROB"].sum() / max(P["DEBT_PROB"].sum(), 1)
    add(T2, "признают проблемный долг", "60%", "[допущение]", pc(g), pc(CS["DEBT_PROB"].sum() / C["DEBT_PROB"].sum()))
    for kk, lab in EXT_LAB.items():
        g = (S[kk + "_F"] - P[kk + "_F"]).mean()
        c = (CS[kk + "_F"] - C[kk + "_F"]).mean()
        gr = spearmanr(S[kk + "_F"], P[kk + "_F"]).correlation
        cr = spearmanr(CS[kk + "_F"], C[kk + "_F"]).correlation
        add(T2, f"{lab}: сдвиг самоотчёта в ступенях; ранговая r с «правдой»",
            "к «реже»; контроль и враньё — сильнее" if kk in ("CONTROL", "LIE") else "к «реже», как у черт",
            "правило 13.2 [допущение]", f"{g:+.2f}; {gr:.2f}", f"{c:+.2f}; {cr:.2f}", tol_ok(c, -1.5, -.05))

    # пары
    pj = B.load(os.path.join(B.PRIV, "pairs.json"))
    pairs = pj["pairs"]
    idx = {pid: i for i, pid in enumerate(P["ids"])}
    m = np.array([idx[p["man"]] for p in pairs])
    w = np.array([idx[p["woman"]] for p in pairs])
    typ = np.array([p["type"] for p in pairs])
    part = np.array([p["part"] for p in pairs])
    stage = np.array([B.STAGES.index(p["stage"]) for p in pairs])
    dur = np.array([p["duration_months"] for p in pairs], float)
    U = np.array([p["U_pair_specific"] for p in pairs])
    model = B.load(os.path.join(B.PRIV, "model.json"))
    cal = model["calibration"]
    T3 = "Пары"
    add(T3, "всего пар", "150–200", "задача", f"{len(pairs)}", "—", tol_ok(len(pairs), 150, 200))
    add(T3, "настоящих / дополнительных", "50 / 100–150", "4.2–4.3", f"{(typ == 'real').sum()} / {(typ == 'alt').sum()}", f"50 / {cal['alt_per_batch_mean']:.0f} на 100 чел.")
    deg = np.bincount(np.concatenate([m, w]), minlength=100)
    add(T3, "пар на человека: мин / среднее / макс", "≈ 3–4, без человека вне пар", "4.3", f"{deg.min()} / {deg.mean():.1f} / {deg.max()}", "—", tol_ok(deg.min(), 1, 99))
    for pt in ("work", "holdout"):
        mk = part == pt
        ppl = len(np.unique(np.concatenate([m[mk], w[mk]])))
        add(T3, f"часть {pt}: людей / пар (настоящих + доп.)", "60/40 по людям (Ярославль 50/50)", "раздел 7",
            f"{ppl} / {mk.sum()} ({(mk & (typ == 'real')).sum()} + {(mk & (typ == 'alt')).sum()})", "—")
    pp_work = set(np.concatenate([m[part == 'work'], w[part == 'work']]))
    pp_hold = set(np.concatenate([m[part == 'holdout'], w[part == 'holdout']]))
    add(T3, "людей в обеих частях", "0", "раздел 7", f"{len(pp_work & pp_hold)}", "0", tol_ok(len(pp_work & pp_hold), 0, 0))
    for ci, cname in enumerate(B.CITIES):
        mk = P["city"][m] == ci
        add(T3, f"пар в городе {cname}: work / holdout", "ожидание из калибровки — пропорционально людям", "критик п. 5",
            f"{(mk & (part == 'work')).sum()} / {(mk & (part == 'holdout')).sum()}", "—")
    rr = B.pair_corrs(P, m[typ == "real"], w[typ == "real"])
    ra = B.pair_corrs(P, m[typ == "alt"], w[typ == "alt"])
    for kk, lab in (("REL", "религиозность"), ("EDU", "образование"), ("TRAD", "традиционализм"), ("VIEWS", "оси взглядов (ср.)"),
                    ("KIDS", "желаемое число детей"), ("DRINK", "алкоголь"), ("SMOKE", "никотин"), ("PERS", "личность (ср. по 7)")):
        tgt = B.MATCH_TARGET.get(kk, .05)
        add(T3, f"r внутри пары: {lab} — настоящие / доп.", f"{tgt:.2f} / ≈ {tgt / 2:.2f}", "4.2 (Luo & Klohnen; [допущение])",
            f"{rr[kk]:.2f} / {ra[kk]:.2f}", f"{cal['real_corr'][kk]:.2f} / {cal['alt_corr'][kk]:.2f}")
    add(T3, "ислам: оба мусульмане среди пар с мусульманином", "85%", "[допущение]", pc(rr["ISL_MATCH"]), pc(cal["real_corr"]["ISL_MATCH"]))
    add(T3, "разница возрастов м − ж: среднее (SD), настоящие", "+2 (2,5)", "[допущение]", f"{rr['AGE_MEAN']:+.1f} ({rr['AGE_SD']:.1f})",
        f"{cal['real_corr']['AGE_MEAN']:+.1f} ({cal['real_corr']['AGE_SD']:.1f})")
    for s in range(3):
        add(T3, f"стадия «{B.STAGES[s]}», настоящие", ("31", "21", "48")[s] + "% (смесь по возрастам)", "РПН-2022 табл. 5 + [допущение]",
            pc(np.mean(stage[typ == "real"] == s)), pc(cal["stage_mix_real"][B.STAGES[s]]))
    hs = np.array([p["housework_share_on_woman"] for p in pairs if p["stage"] == "в браке"], float)
    add(T3, "быт «в основном на женщине» (> 0,65) среди пар в браке", "≈ 29%", "ВЦИОМ 2023 [пров.] (поправка 9а)", pc(np.mean(hs > .65)), "—")
    F = B.mis_flags(P, m, w)
    for kk, lab in (("kids_hard", "дети: жёсткое"), ("kids_soft", "дети: мягкое"), ("drink", "пьянство"), ("rel", "религиозность"), ("money", "деньги")):
        add(T3, f"несовпадение «{lab}»: настоящие / доп.", "доп. после отсева ≈ настоящие (критик п. 4)", "4.3",
            f"{pc(F[kk][typ == 'real'].mean())} / {pc(F[kk][typ == 'alt'].mean())}",
            f"{pc(cal['mismatch_rates_real'][kk])} / {pc(cal['mismatch_rates_alt'][kk])}")

    # исходы
    oj = B.load(os.path.join(B.PRIV, "outcome.json"))["outcomes"]
    assert [o["pair_id"] for o in oj] == [p["pair_id"] for p in pairs]
    pt = np.array([o["p_together_3y"] for o in oj])
    pb = 1 - pt
    broke = np.array([not o["together_3y"] for o in oj])
    lk = np.array([o["risk_logit_skeleton"] for o in oj])
    T4 = "Исход"
    tg = {"встречаются": .50, "живут вместе": .30, "в браке": .15}
    add(T4, "доля распадов за 3 года, все пары: ожидаемая / выпавшая", "≈ 0,28–0,30 (смесь стадий)", "5.3 [допущение]",
        f"{pb.mean():.3f} / {broke.mean():.3f} ({broke.sum()} из {len(broke)})", f"{cal['calib_breakup_real']:.3f} (настоящие)")
    for s in range(3):
        mk = stage == s
        add(T4, f"распад, «{B.STAGES[s]}»: ожидаемый / выпавший", f"{tg[B.STAGES[s]]:.2f}", "5.3 [допущение]",
            f"{pb[mk].mean():.3f} / {broke[mk].mean():.3f} (n={mk.sum()})", f"{cal['calib_breakup_by_stage_real'][B.STAGES[s]]:.3f}")
    for t in ("real", "alt"):
        mk = typ == t
        add(T4, f"распад, {'настоящие' if t == 'real' else 'дополнительные'}: ожидаемый / выпавший", "—", "—",
            f"{pb[mk].mean():.3f} / {broke[mk].mean():.3f} (n={mk.sum()})",
            f"{cal['calib_breakup_real'] if t == 'real' else cal['alt_breakup']:.3f}")
    for p_ in ("work", "holdout"):
        mk = part == p_
        add(T4, f"распад, часть {p_}: ожидаемый / выпавший", "—", "—", f"{pb[mk].mean():.3f} / {broke[mk].mean():.3f} ({broke[mk].sum()} из {mk.sum()})", "—")
    qs = np.quantile(pt, [.05, .25, .5, .75, .95])
    add(T4, "P(вместе через 3 года): 5 / 25 / 50 / 75 / 95-й перцентили", "широкий разброс, без крайностей", "принцип 3",
        " / ".join(f"{v:.2f}" for v in qs), "—")
    mid = np.mean((pt >= .2) & (pt <= .8))
    add(T4, "P(вместе) в [0,2; 0,8] — абсолютно", "справка: у пар в браке базовый риск 15%, они почти все выше 0,8", "принцип 3", pc(mid), "—")
    for s in range(3):
        mk = stage == s
        add(T4, f"P(вместе) в [0,2; 0,8], «{B.STAGES[s]}»", "—", "—", pc(np.mean((pt[mk] >= .2) & (pt[mk] <= .8))), "—")
    lp_full = np.log(pb / (1 - pb))
    rel = lp_full - np.array([np.median(lp_full[stage == s]) for s in stage])
    q2 = np.mean(np.abs(rel) <= np.log(2))
    q3 = np.mean(np.abs(rel) <= np.log(3))
    add(T4, "качество относительно стадии: шансы распада в пределах ×/÷3 от медианы стадии («среднее»)", "большинство (≥ 50%)", "принцип 3 (поправка 6)",
        pc(q3), "—", tol_ok(q3, .5, 1))
    add(T4, "то же, в пределах ×/÷2", "справка", "—", pc(q2), "—")
    add(T4, "SD логита распада внутри стадии", "≈ 1,3–1,5 (U + скелет)", "5.1", f"{np.mean([lp_full[stage == s].std() for s in range(3)]):.2f}", "—")
    add(T4, "крайние: шансы распада выше ×4 / ниже ÷4 медианы стадии", "мало", "принцип 3",
        f"{pc(np.mean(rel > np.log(4)))} / {pc(np.mean(rel < -np.log(4)))}", "—")
    rs_ = lk - np.median(lk)
    add(T4, "риск по скелету: доля пар в пределах ×/÷2 от медианы", "большинство", "принцип 3", pc(np.mean(np.abs(rs_) <= np.log(2))), "—")
    for s in range(3):
        mk = stage == s
        q = np.quantile(pt[mk], [.1, .5, .9])
        add(T4, f"P(вместе), «{B.STAGES[s]}»: 10 / 50 / 90-й", "—", "—", " / ".join(f"{v:.2f}" for v in q), "—")
    csi = np.array([o["satisfaction_csi4"] for o in oj if o["satisfaction_csi4"] is not None], float)
    add(T4, "CSI-4 у оставшихся вместе: M (SD)", "≈ 16 (4,7), потолок 21", "methods.md 4.1 [пересказ]", f"{csi.mean():.1f} ({csi.std():.1f})", "—")
    add(T4, "дистресс CSI-4 < 13,5 у оставшихся", "≈ 25–30% (следует из M и SD)", "—", pc(np.mean(csi < 13.5)), "—")
    months = np.array([o["breakup_month"] for o in oj if o["breakup_month"] is not None])
    add(T4, "месяц распада: медиана (IQR)", "1–36", "5.6", f"{np.median(months):.0f} ({np.quantile(months, .25):.0f}–{np.quantile(months, .75):.0f})", "—")
    exp_sat = np.array([o["satisfaction_expected_csi4"] for o in oj])
    add(T4, "r(ожидаемая удовлетворённость, P(вместе))", "положительная, умеренная", "5.5", f"{np.corrcoef(exp_sat, pt)[0, 1]:.2f}", "—")

    # объяснимая доля разброса — на выборке и на калибровке
    T5 = "Объяснимая доля"
    k, gamma = model["k"], model["gamma"]
    spec = B.load(os.path.join(B.PRIV, "outcome-spec.json"))
    IND, MIS, SIM, _ = B.components(P, m, w, spec, model["sim_mu"], model["sim_sd"])
    L = B.center_by(k * (IND + MIS + SIM) + U + gamma * np.log(dur / 12), stage)
    tot = L.var() + PI2_3
    v = lambda x: B.center_by(x, stage).var() / tot
    sh = cal["shares"]
    add(T5, "скелеты двоих (IND + MIS + SIM)", "≈ 0,13–0,20", "Joel 2020: 12% по самоотчёту к концу", f"{v(k * (IND + MIS + SIM)):.3f}", f"{sh['skeleton']:.3f}")
    # доли по семействам — закрыто (критик 2, п. 1): в private/report-private.json
    private["family_shares_sample"] = {"IND": round(float(v(k * IND)), 4), "MIS": round(float(v(k * MIS)), 4), "SIM": round(float(v(k * SIM)), 5)}
    private["family_shares_calibration"] = {kk: sh[kk] for kk in ("IND", "MIS", "SIM")}
    add(T5, "специфичное для пары U", "≈ 0,2", "Joel 2017, 2020", f"{v(U):.3f}", f"{sh['U']:.3f}")
    add(T5, "чистая случайность (жребий V)", "≈ 0,6", "Joel 2020", f"{PI2_3 / tot:.3f}", f"{sh['noise_V']:.3f}")
    from blindlib import center_by
    bm = B.load(os.path.join(B.PRIV, "benchmarks.json"))
    ls = np.array(bm["selfreport_formula"])
    lsc = center_by(ls, stage)
    r2s = np.cov(lsc, L)[0, 1] ** 2 / (lsc.var() * tot)
    add(T5, "R² формулы по самоотчёту (правило выбора k)", "0,10 ± 0,02", "Joel 2020, 12% (критик п. 8)", f"{r2s:.3f}", f"{sh['R2_selfreport_formula']:.3f}", tol_ok(sh["R2_selfreport_formula"], .08, .12))
    add(T5, "k (общий множитель сжатия)", "внутри [0,5; 1,5]", "5.4", "—", f"{model['k']:.3f}", tol_ok(model["k"], .5, 1.5))
    au = cal["auc"]
    private["family_auc_calibration"] = {kk: au[kk] for kk in ("oracle_IND_only", "oracle_MIS_only", "selfreport_MIS_only")}
    for kk, lab in (("oracle_skeleton", "оракул по скелету"), ("oracle_skeleton_plus_U", "оракул: скелет + U"),
                    ("selfreport_formula", "потолок самоотчёта")):
        add(T5, f"AUC {lab}, с расслоением по стадии", "—", "калибровка, 10 000 чел.", "см. «Мощность»", f"{au[kk]:.3f}")
    for kk, gg in cal["k_grid"].items():
        add(T5, f"сетка k = {kk}: доля скелета / R² самоотчёта / AUC оракула / AUC самоотчёта", "отчёт сеткой (критик п. 8)", "калибровка",
            "—", f"{gg['shares']['skeleton']:.3f} / {gg['shares']['R2_selfreport_formula']:.3f} / {gg['auc']['oracle_skeleton']:.3f} / {gg['auc']['selfreport_formula']:.3f}")
    add(T5, "ансамбль 30 формул: Spearman с центральной (мин / медиана)", "—", "критик п. 3", "—",
        f"{cal['ensemble_spearman_with_central']['min']:.3f} / {cal['ensemble_spearman_with_central']['median']:.3f}")
    es = B.load(os.path.join(B.PRIV, "outcome-ensemble-structural.json"))
    assert es["meta"]["outcome_sha256"] == B.sha256(os.path.join(B.PRIV, "outcome.json"))
    assert es["pair_ids"] == [p["pair_id"] for p in pairs]
    add(T5, f"ансамбль другого устройства ({len(es['variants'])} вариантов: несовпадения ×2–4, эффект партнёра, выпадение семейства, "
        "взаимодействия, в том числе сильные — критик 3, п. 3)",
        "правка принимается, только если выигрывает в каждом варианте", "критик 2, п. 1; design.md 13.3",
        "числа закрыты (private/)", f"{len(es['variants'])} вариантов")
    private["structural_agreement"] = es["agreement"]

    # пометка: избегание ↔ удовлетворённость (критик 2, п. 7) — число закрыто
    oj_sat = np.array([o["satisfaction_expected_csi4"] for o in oj])
    private["avoidance_vs_expected_csi4"] = {"man": round(float(np.corrcoef(P["AVO"][m], oj_sat)[0, 1]), 3),
                                             "woman": round(float(np.corrcoef(P["AVO"][w], oj_sat)[0, 1]), 3)}
    add(T5, "избегание ↔ удовлетворённость (CSI-4)", "≈ −0,44 [пересказ, непров.]", "ПОМЕТКА (критик 2, п. 7)",
        "слабее ориентира; влияет только на вспомогательную метрику; число в private/", "—")

    # мощность (критик п. 1): что можно различить на 100 людях
    T6 = "Мощность"
    rb = np.random.default_rng(99)
    ens = np.array(B.load(os.path.join(B.PRIV, "outcome-ensemble.json"))["risk_logit_skeleton"])
    smis = np.array(bm["selfreport_MIS"])
    for p_ in ("work", "holdout"):
        mk = part == p_
        for nm, x in (("формула по самоотчёту (потолок)", ls),):
            xs = x[mk]
            rho = wspear(xs, lk[mk], np.ones(mk.sum()))
            bs = person_boot(m[mk], w[mk], lambda wt: wspear(xs, lk[mk], wt), rb, 1000)
            ens_rho = [spearmanr(xs, e[mk]).correlation for e in ens]
            add(T6, f"{p_}: Spearman с риском по скелету — {nm}", "главная метрика", "критик п. 1",
                f"{rho:.2f} [{np.nanpercentile(bs, 2.5):.2f}; {np.nanpercentile(bs, 97.5):.2f}]; ансамбль {min(ens_rho):.2f}–{max(ens_rho):.2f}", "—")
            a1 = wauc_strat(broke[mk], xs, np.ones(mk.sum()), stage[mk])
            ba = person_boot(m[mk], w[mk], lambda wt: wauc_strat(broke[mk], xs, wt, stage[mk]), rb, 1000)
            redraw = [B.auc_strat(np.random.default_rng(j).random(mk.sum()) < pb[mk], xs, stage[mk]) for j in range(400)]
            add(T6, f"{p_}: AUC по одному жребию — {nm}", "вспомогательная", "критик п. 1",
                f"{a1:.2f} [{np.nanpercentile(ba, 2.5):.2f}; {np.nanpercentile(ba, 97.5):.2f}]; по 400 перетяжкам V: {np.nanmean(redraw):.2f} ± {np.nanstd(redraw):.2f}", "—")
        xs = smis[mk]   # «только несовпадения по самоотчёту» — закрыто (критик 2, п. 1)
        bs = person_boot(m[mk], w[mk], lambda wt: wspear(xs, lk[mk], wt), rb, 1000)
        private.setdefault("power_mis_only_selfreport", {})[p_] = {
            "spearman": round(float(wspear(xs, lk[mk], np.ones(mk.sum()))), 3),
            "boot95": [round(float(np.nanpercentile(bs, 2.5)), 3), round(float(np.nanpercentile(bs, 97.5)), 3)]}
        esr = np.array(es["risk_logit_skeleton"])
        private.setdefault("power_selfreport_vs_structural", {})[p_] = {
            nm_: round(float(spearmanr(ls[mk], e[mk]).correlation), 3) for nm_, e in zip(es["variants"], esr)}
    lt = B.load(os.path.join(B.PRIV, "leak-threshold.json"))["thresholds"]
    add(T6, "порог утечки (holdout): Spearman / AUC", "потолок + верх. граница бутстрэпа", "критик п. 2",
        f"{lt['holdout']['MAIN_leak_threshold_spearman']:.2f} / {lt['holdout']['leak_threshold_auc']:.2f}", "—")

    # выборка против ожидания генератора (критик 2, п. 5): z = (выборка − калибровка) / SE на n выборки
    young, old = P["young"], ~P["young"]
    nonisl = ~P["ISLAM"]
    cy, co = C["young"], ~C["young"]
    share_flag("не пьют, 20–24 (без мусульман)", P["DRINK_LVL"][young & nonisl] == 0, np.mean(C["DRINK_LVL"][cy & ~C["ISLAM"]] == 0), +1)
    share_flag("не пьют, 25–30 (без мусульман)", P["DRINK_LVL"][old & nonisl] == 0, np.mean(C["DRINK_LVL"][co & ~C["ISLAM"]] == 0), +1)
    for s_, lab in ((0, "м"), (1, "ж")):
        dk = (P["sex"] == s_) & (P["DRINK_LVL"] > 0)
        cdk = (C["sex"] == s_) & (C["DRINK_LVL"] > 0)
        share_flag(f"еженедельно и чаще среди пьющих, {lab}", P["DRINK_LVL"][dk] == 3, np.mean(C["DRINK_LVL"][cdk] == 3), -1)
    share_flag("надёжная привязанность", P["style"] == "надёжный", np.mean(C["style"] == "надёжный"), +1)
    share_flag("изменял(а) в прошлом, 20–24", P["INF"][young], C["INF"][cy].mean(), -1)
    share_flag("изменял(а) в прошлом, 25–30", P["INF"][old], C["INF"][co].mean(), -1)
    mean_flag("тревожность ECR-R, M", B.ecr_anx(P["ANX"]), B.ecr_anx(C["ANX"]).mean(), -1)
    mean_flag("избегание ECR-R, M", B.ecr_avo(P["AVO"]), B.ecr_avo(C["AVO"]).mean(), -1)
    share_flag("родители расстались до 15 лет", P["PDIV"], C["PDIV"].mean(), -1)
    share_flag("враждебность «часто»", B.freq_of(P["HOST"]) == 3, np.mean(B.freq_of(C["HOST"]) == 3), -1)
    share_flag("рискованное питьё, м", P["RISKY"][P["sex"] == 0], C["RISKY"][C["sex"] == 0].mean(), -1)
    share_flag("проблемный долг", P["DEBT_PROB"], C["DEBT_PROB"].mean(), -1)
    share_flag("тайно проверял телефон", P["JEAL"], C["JEAL"].mean(), -1)
    for ci, cname in enumerate(B.CITIES):
        share_flag(f"ислам, {cname}", np.array(P["CONF"])[P["city"] == ci] == "ислам", np.mean(np.array(C["CONF"])[C["city"] == ci] == "ислам"))
    for s_, y, lab in ((1, False, "ж 25–30"), (0, False, "м 25–30"), (1, True, "ж 20–24"), (0, True, "м 20–24")):
        sel = (P["sex"] == s_) & (P["young"] == y) & ~np.isnan(P["KIDS_N"])
        csel = (C["sex"] == s_) & (C["young"] == y) & ~np.isnan(C["KIDS_N"])
        mean_flag(f"желаемое число детей, {lab}, среднее", P["KIDS_N"][sel], C["KIDS_N"][csel].mean())
    am, aw = P["age"][P["sex"] == 0], P["age"][P["sex"] == 1]
    sflag("средний возраст м − ж", am.mean() - aw.mean(),
          C["age"][C["sex"] == 0].mean() - C["age"][C["sex"] == 1].mean(),
          np.sqrt(am.var(ddof=1) / len(am) + aw.var(ddof=1) / len(aw)), None, len(P["age"]))
    E_ = np.corrcoef(np.column_stack([P[kk] for kk in B.LATENT]).T)
    iu_ = np.triu_indices(len(B.LATENT), 1)
    zc = (E_ - R)[iu_] / ((1 - R[iu_] ** 2) / np.sqrt(len(P["sex"]) - 1))
    sflag("макс. модуль z отклонения корреляции латентных (из 300; ожидание ≈ 3,0)", float(np.abs(zc).max()), 3.0, 1.0)
    srows[-1] = srows[-1][:4] + (float(np.abs(zc).max()) - 3.0,) + (None,)
    from scipy.stats import binomtest
    dirs = [r[5] for r in srows if r[5] is not None]
    n_h = sum(d == "да" for d in dirs)
    sign_p = binomtest(n_h, len(dirs), .5).pvalue if dirs else 1.0

    # вывод
    lines = ["# Слепая выборка: отчёт генерации", "",
             "Сгенерировано `research/blind/report.py` (не править руками). Отчёт агрегатный: ни id, ни коэффициентов формулы исхода.",
             "«Выборка» — 100 человек и их 180 пар. «Калибровка» — отдельная популяция 10 000 человек со своим зерном:",
             "на ней видно, попадает ли генератор в доли. На 100 людях отклонения в несколько п. п. — ожидаемая случайность",
             "(SE доли 30% при n = 100 — 4,6 п. п.; при n = 50 — 6,5 п. п.). Колонка «сходится» — по калибровке (для скелета) и по выборке",
             "(для числа пар).", "",
             f"Хеши: people.json `{B.sha256(os.path.join(B.ROOT, 'people.json'))[:16]}`, selfreport.json "
             f"`{B.sha256(os.path.join(B.ROOT, 'selfreport.json'))[:16]}`, private/pairs.json `{B.sha256(os.path.join(B.PRIV, 'pairs.json'))[:16]}`, "
             f"private/outcome.json `{B.sha256(os.path.join(B.PRIV, 'outcome.json'))[:16]}`, private/outcome-spec.json `{model['outcome_spec_sha256'][:16]}`. "
             f"private/outcome-ensemble-structural.json `{B.sha256(os.path.join(B.PRIV, 'outcome-ensemble-structural.json'))[:16]}`. "
             f"Версии: numpy {B.lib_versions()['numpy']}, scipy {B.lib_versions()['scipy']} (закреплены, проверяются при запуске). "
             "Повторный запуск всего конвейера (generate → calibrate → pairs → outcome → ensemble_structural → report → "
             "prep_inputs → seal) даёт побайтно те же файлы (проверено 2026-10-28, в том числе с нуля на чистой копии).", ""]
    for tbl in dict.fromkeys(r[0] for r in rows):
        lines += [f"## {tbl}", "", "| Показатель | Задумано | Источник | Выборка | Калибровка | Сходится |", "|---|---|---|---|---|---|"]
        for r in rows:
            if r[0] == tbl:
                lines.append("| " + " | ".join(str(x) if x is not None else "" for x in r[1:]) + " |")
        lines.append("")
    lines += ["## Выборка против ожидания генератора", "",
              "Ожидание — доля или среднее на калибровочной популяции (10 000 человек). z = (выборка − ожидание) / SE при n выборки.",
              "|z| > 2 — флаг «выборка вне ±2 SE» (раздел «Не сошлось»). «В здоровую сторону» — отклонение к меньшему риску;",
              "знаковый тест по всем показателям с направлением — внизу таблицы (критик 2, п. 5).", "",
              "| Показатель | n | Ожидание | Выборка | z | В здоровую сторону |", "|---|---|---|---|---|---|"]
    fmt = lambda x: f"{x:.3f}" if abs(x) < 10 else f"{x:.2f}"
    for r in srows:
        lines.append(f"| {r[0]} | {r[1] if r[1] is not None else ''} | {fmt(r[2])} | {fmt(r[3])} | {r[4]:+.2f} | {r[5] or '—'} |")
    lines += ["", f"Знаковый тест: в здоровую сторону {n_h} из {len(dirs)} показателей с направлением, p = {sign_p:.3f} (двусторонний).", ""]
    misses = [r for r in rows if r[6] == "НЕТ"]
    s_miss = [r for r in srows if abs(r[4]) > 2]
    lines += ["## Не сошлось", ""]
    lines += [f"- {r[0]}: {r[1]} — задумано {r[2]}, выборка {r[4]}, калибровка {r[5]}" for r in misses]
    lines += [f"- Выборка вне ±2 SE: {r[0]} — ожидание {fmt(r[2])}, выборка {fmt(r[3])}, z = {r[4]:+.2f}" for r in s_miss]
    if dirs and sign_p < .05:
        lines.append(f"- Выборка сдвинута в одну сторону: в здоровую {n_h} из {len(dirs)} показателей (знаковый тест p = {sign_p:.3f}). "
                     "Каждое отклонение по отдельности может быть в пределах 2 SE; для следующих партий объявлен сбалансированный жребий (design.md, 13.4)")
    if not misses and not s_miss and not (dirs and sign_p < .05):
        lines.append("- ничего")
    lines.append("")
    misses = misses + s_miss
    B.dump({"note": "ЗАКРЫТО: агрегаты, которых нет в generation-report.md (доли и AUC по семействам, согласие "
                    "вариантов устройства формулы). Владельцу теста не показывать.", **private},
           os.path.join(B.PRIV, "report-private.json"))
    path = os.path.join(B.ROOT, "generation-report.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("generation-report.md записан; не сошлось:", len(misses))
    for r in misses:
        print("  НЕТ:", r[0], r[1], "|", r[2], "|", r[4], "|", r[5])
    print(f"  знаковый тест: в здоровую {n_h} из {len(dirs)}, p = {sign_p:.3f}")


if __name__ == "__main__":
    main()
