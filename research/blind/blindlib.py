"""Общий код слепой выборки (research/blind/design.md).

Здесь: зёрна, жребий скелета, слой самоотчёта, признаки пар, формула исхода, предыстория пары.
Банк вопросов теста этот код не читает и ни от чего в нём не зависит.
Численные коэффициенты исхода здесь НЕ записаны: они в private/outcome-spec.json (см. design.md, 5.2).
"""
import hashlib
import json
import os
import string

import numpy as np
from scipy.optimize import brentq, linear_sum_assignment
from scipy.special import expit
from scipy.stats import norm

ROOT = os.path.dirname(os.path.abspath(__file__))
PRIV = os.path.join(ROOT, "private")

MASTER_SEED = 20261028
# Порядок фиксирован (design.md, 8.1). Новые имена — только в конец.
SEED_NAMES = [
    "skeleton", "selfreport", "person_ids", "match_noise", "real_stage", "split",
    "alt_select", "alt_stage", "breakup_V", "sat_time", "calibration", "ensemble",
    "answerer_order", "reference", "pair_ids", "bootstrap",
    "skeleton_ext", "selfreport_ext",   # ответ критику 2: новые поля с нулевым весом (после всех прежних)
]

# Версии, на которых проверен детерминизм (ответ критику 2, п. 9). Потоки Generator могут смениться между версиями.
PINNED_VERSIONS = {"numpy": "2.0.2", "scipy": "1.13.1"}


def lib_versions():
    import scipy
    return {"numpy": np.__version__, "scipy": scipy.__version__}


def check_versions():
    """Падает, если numpy/scipy не те, на которых проверен детерминизм.
    Обойти (осознанно, с записью в журнал): BLIND_ALLOW_VERSION_MISMATCH=1."""
    got = lib_versions()
    if got != PINNED_VERSIONS and os.environ.get("BLIND_ALLOW_VERSION_MISMATCH") != "1":
        raise SystemExit(f"версии библиотек {got} не совпадают с закреплёнными {PINNED_VERSIONS}; "
                         "жребий может не воспроизвестись (design.md, 13.6)")
    return got


def seed_tree(ss=None):
    ss = ss or np.random.SeedSequence(MASTER_SEED)
    return dict(zip(SEED_NAMES, ss.spawn(len(SEED_NAMES))))


def rng_of(tree, name):
    return np.random.default_rng(tree[name])


# ---------------------------------------------------------------- состав
CITIES = ["Москва", "Казань", "Ярославль"]
CITY_QUOTA = [40, 30, 30]              # на 100 человек, пополам м/ж (design.md, 2.1, поправка 1)
AGES = np.arange(20, 31)
_base = np.where(AGES <= 24, 1.1, 1.0)
_tilt = np.linspace(-1, 1, len(AGES))
# мужчины в парах старше: у мужчин вес сдвинут к старшим возрастам, у женщин — к младшим [допущение]
AGE_W = {0: _base * (1 + .45 * _tilt), 1: _base * (1 - .45 * _tilt)}
AGE_W = {k: v / v.sum() for k, v in AGE_W.items()}

# ---------------------------------------------------------------- латентные черты
LATENT = ["N", "ANX", "AVO", "HOST", "WD", "COMM", "C", "A", "E", "O", "LS", "TRAD", "REL",
          "SPEND", "DRINK", "EDU", "ETA", "SMOKE", "KIDS", "V1", "V2", "V3", "V4", "V5", "V6"]
CORR = [
    ("ANX", "AVO", .41), ("N", "ANX", .45), ("N", "AVO", .20), ("AVO", "COMM", -.35),
    ("N", "HOST", .35), ("A", "HOST", -.40), ("A", "ETA", .20), ("C", "COMM", .20),
    ("C", "SPEND", -.30), ("C", "ETA", .20), ("HOST", "DRINK", .20), ("WD", "AVO", .30),
    ("WD", "HOST", .20), ("LS", "N", -.45), ("REL", "TRAD", .50), ("REL", "DRINK", -.20),
    ("EDU", "C", .15), ("SMOKE", "DRINK", .25), ("KIDS", "TRAD", .30), ("KIDS", "REL", .25),
] + [("TRAD", f"V{i}", .10) for i in range(1, 7)]
VIEW_LABELS = {
    "V1": ("досуг дома", "досуг вне дома"),
    "V2": ("узкий круг общения", "широкий круг общения"),
    "V3": ("город", "природа, дача"),
    "V4": ("карьера важнее", "баланс важнее"),
    "V5": ("тратить на вещи", "тратить на впечатления"),
    "V6": ("укоренённость на месте", "готовность к переезду"),
}


def corr_matrix():
    ix = {n: i for i, n in enumerate(LATENT)}
    R = np.eye(len(LATENT))
    for a, b, r in CORR:
        R[ix[a], ix[b]] = R[ix[b], ix[a]] = r
    return R


def min_eig():
    return float(np.linalg.eigvalsh(corr_matrix()).min())


# доли (design.md, 2.3)
EDU_SHARES = {  # школа, СПО, высшее
    "Москва": (.08, .32, .60),
    "Казань": (.10, .38, .52), "Ярославль": (.13, .45, .42),
}
CONF_SHARES = {  # православные, ислам, неверующие, колеблются, другое
    "default": (.58, .05, .22, .09, .06), "Казань": (.42, .30, .16, .07, .05),
}
KIDS_P = {  # 0..5+ без «не знаю»; РПН-2022 табл. 33
    1: np.array([2.4, 23.1, 48.5, 18.9, 3.0, 1.9]), 0: np.array([3.5, 23.1, 45.9, 18.2, 3.0, 2.5]),
}
KIDS_DK = {1: .022, 0: .037}
KIDS_MEAN_T = {(1, True): 1.89, (0, True): 1.84, (1, False): 2.03, (0, False): 1.92}  # РПН-2022 табл. 34
DRINK_LEVELS = ["не пьёт", "реже раза в месяц", "ежемесячно", "еженедельно и чаще"]
FREQ = ["почти никогда", "редко", "иногда", "часто"]  # нижняя — «почти никогда» (base-rates, разд. 2; критик 2, п. 4)
FREQ_CUTS = norm.ppf([.10, .50, .85])
REL_LEVELS = ["нет", "по традиции", "верующий, практикует редко", "практикует регулярно"]
CONF_NAMES = ["православие", "ислам", "неверующий", "колеблется", "другое / вне конфессии"]
SMOKE_NAMES = ["нет", "сигареты", "вейп", "сигареты и вейп", "нагреваемый табак"]
SMOKE_P = {True: (.60, .12, .14, .12, .02), False: (.57, .17, .11, .07, .08)}  # young?
WORK_NAMES = ["учится", "работает", "учится и работает", "не работает"]
WORK_P = {True: (.35, .35, .22, .08), False: (.03, .85, .04, .08)}  # 20–22?
KWHEN = ["в ближайшие 3 года", "через 3–6 лет", "позже", "не знаю"]
KWHEN_P = {True: (.10, .35, .30, .25), False: (.35, .35, .10, .20)}
HOUSE_IDEAL = ["поровну", "в основном женщина", "в основном мужчина"]

# цели логистических жребиев: (пол 0=м 1=ж, молодой 20–24)
JEAL_T = {(0, True): .40, (1, True): .50, (0, False): .33, (1, False): .43}
INF_SURVEY_ADMIT = .75   # доля признания в анонимном веб-опросе ВЦИОМ [допущение]
INF_T = {(0, True): .113 / INF_SURVEY_ADMIT, (1, True): .133 / INF_SURVEY_ADMIT,
         (0, False): .21 / INF_SURVEY_ADMIT, (1, False): .23 / INF_SURVEY_ADMIT}
RISKY_T = {0: .07, 1: .015}
DEBT_ANY_T = {True: .25, False: .40}
DEBT_PROB_T = .06


def make_frame(n_batches, rng):
    """Пол, город, возраст. Батч = 100 человек с квотами городов."""
    sex, city, batch = [], [], []
    for b in range(n_batches):
        for c, q in enumerate(CITY_QUOTA):
            sex += [0] * (q // 2) + [1] * (q // 2)
            city += [c] * q
            batch += [b] * q
    sex = np.array(sex)
    n = len(sex)
    u = rng.random(n)
    age = np.where(sex == 0, AGES[np.searchsorted(np.cumsum(AGE_W[0]), u, side="right").clip(0, 10)],
                   AGES[np.searchsorted(np.cumsum(AGE_W[1]), u, side="right").clip(0, 10)])
    return {"sex": sex, "city": np.array(city), "batch": np.array(batch), "age": age}


def _solve(x, target, slope=1.0):
    return brentq(lambda a: expit(a + slope * x).mean() - target, -30, 30)


def derive(frame, rng, icpt=None):
    """Скелет: латентные z по гауссовой копуле, затем категории и бинарные события.
    icpt=None — подобрать пороги/интерсепты на этой (опорной) популяции и вернуть их."""
    solve = icpt is None
    icpt = {} if solve else icpt
    sex, age, city = frame["sex"], frame["age"], frame["city"]
    n = len(sex)
    young = age <= 24
    L = np.linalg.cholesky(corr_matrix())
    Z = rng.standard_normal((n, len(LATENT))) @ L.T
    P = {k: Z[:, i].copy() for i, k in enumerate(LATENT)}
    P.update(sex=sex, age=age, city=city, young=young)

    # родительская семья (Andersson et al. 2017)
    u1, u2, u3 = rng.random(n), rng.random(n), rng.random(n)
    born_single = u1 < .13
    pdiv = (~born_single) & (u2 < .42)
    step = np.where(pdiv, u3 < .37, born_single & (u3 < .25))
    P.update(BORN_SINGLE=born_single, PDIV=pdiv, STEP=step)
    P["ANX"] = P["ANX"] + .10 * pdiv
    P["COMM"] = P["COMM"] - .10 * pdiv
    P["TRAD"] = P["TRAD"] + .25 * (sex == 0)

    # образование, работа, доход
    cname = np.array(CITIES)[city]
    uE = norm.cdf(P["EDU"])
    edu = np.empty(n, dtype=object)
    for c in CITIES:
        m = cname == c
        s, spo, _ = EDU_SHARES[c]
        edu[m] = np.where(uE[m] < s, "школа", np.where(uE[m] < s + spo, "СПО", "высшее"))
    P["edu"] = edu
    young22 = age <= 22
    uw = rng.random(n)
    work = np.empty(n, dtype=object)
    for flag in (True, False):
        m = young22 == flag
        cum = np.cumsum(WORK_P[flag])
        work[m] = np.array(WORK_NAMES)[np.searchsorted(cum, uw[m] * cum[-1], side="right").clip(0, 3)]
    P["work"] = work
    agez = (age - 25) / 3.16
    inc = .3 * P["EDU"] + .2 * agez + np.sqrt(.87) * rng.standard_normal(n)
    P["income_q"] = 1 + np.searchsorted(norm.ppf([.2, .4, .6, .8]), inc)

    # религия: ислам — от города (этничность), остальное — по латентной REL
    ui, ur = rng.random(n), rng.random(n)
    conf = np.empty(n, dtype=object)
    rel = np.zeros(n, dtype=int)
    uR = norm.cdf(P["REL"])
    for i in range(n):
        orth, isl, nb, wav, oth = CONF_SHARES.get(cname[i], CONF_SHARES["default"])
        p3 = .09 if young[i] else .17
        if ui[i] < isl:
            conf[i] = "ислам"
            up, p3 = uR[i], min(.4, 1.5 * p3)
        else:
            rest = 1 - isl
            a_nb, a_wav = nb / rest, (nb + wav) / rest
            if uR[i] < a_nb:
                conf[i] = "неверующий"
                continue
            if uR[i] < a_wav:
                conf[i] = "колеблется"
                rel[i] = int((uR[i] - a_nb) / (a_wav - a_nb) >= .5)
                continue
            conf[i] = "другое / вне конфессии" if ur[i] < oth / (oth + orth) else "православие"
            up = (uR[i] - a_wav) / (1 - a_wav)
        rel[i] = 3 if up > 1 - p3 else (2 if up > 1 - p3 - .35 else 1)
    P["CONF"], P["REL_LVL"] = conf, rel
    P["ISLAM"], P["ORTH"] = conf == "ислам", conf == "православие"

    # алкоголь
    nd = np.where(young, .54, .61) + np.where(sex == 1, .05, -.05)
    nd = np.where(P["ISLAM"], np.minimum(.9, 1.4 * nd), nd)
    uD = norm.cdf(P["DRINK"])
    q = (uD - nd) / (1 - nd)
    c1 = np.where(sex == 0, .15, .39)
    c2 = np.where(sex == 0, .65, .87)
    lvl = np.where(uD < nd, 0, np.where(q < c1, 1, np.where(q < c2, 2, 3)))
    P["DRINK_LVL"] = lvl
    urisk = rng.random(n)
    if solve:
        for s in (0, 1):
            icpt[f"risky_p_{s}"] = min(1.0, RISKY_T[s] / (lvl[sex == s] == 3).mean())
    prisk = np.where(sex == 0, icpt["risky_p_0"], icpt["risky_p_1"])
    P["RISKY"] = (lvl == 3) & (urisk < prisk)

    # никотин
    us, us2 = norm.cdf(P["SMOKE"]), rng.random(n)
    smoke = np.empty(n, dtype=object)
    for i in range(n):
        p = SMOKE_P[bool(young[i])]
        if us[i] < p[0]:
            smoke[i] = "нет"
        else:
            cum = np.cumsum(p[1:]) / sum(p[1:])
            smoke[i] = SMOKE_NAMES[1 + int(np.searchsorted(cum, us2[i], side="right").clip(0, 3))]
    P["smoke"] = smoke

    # логистические события по ячейкам пол × возраст
    def cellwise(key, x, targets, slope):
        out = np.zeros(n, dtype=bool)
        u = rng.random(n)
        for (s, y), t in targets.items():
            m = (sex == s) & (young == y)
            k = f"{key}_{s}_{int(y)}"
            if solve:
                icpt[k] = _solve(x[m], t, slope)
            out[m] = u[m] < expit(icpt[k] + slope * x[m])
        return out

    P["JEAL"] = cellwise("jeal", P["ANX"], JEAL_T, .6)
    P["INF"] = cellwise("inf", P["AVO"], INF_T, .35)

    # долги
    ud, ud2 = rng.random(n), rng.random(n)
    dany = np.zeros(n, dtype=bool)
    for y, t in DEBT_ANY_T.items():
        m = young == y
        k = f"debtany_{int(y)}"
        if solve:
            icpt[k] = _solve(P["SPEND"][m], t, .8)
        dany[m] = ud[m] < expit(icpt[k] + .8 * P["SPEND"][m])
    lpd = .5 * P["SPEND"] - .2 * P["C"]
    if solve:
        icpt["debtprob"] = brentq(lambda a: (dany * expit(a + lpd)).mean() - DEBT_PROB_T, -30, 30)
    P["DEBT_ANY"] = dany
    P["DEBT_PROB"] = dany & (ud2 < expit(icpt["debtprob"] + lpd))

    # дети: форма — РПН-2022 табл. 33, среднее по полу и возрасту — табл. 34 (сдвиг латентной подбирается)
    ukd = rng.random(n)
    kids = np.full(n, np.nan)

    def kids_val(x, s):
        cum = np.cumsum(KIDS_P[s]) / KIDS_P[s].sum()
        return np.searchsorted(cum, norm.cdf(x), side="right").clip(0, 5).astype(float)

    for (s, y), t in KIDS_MEAN_T.items():
        m = (sex == s) & (young == y)
        key = f"kids_shift_{s}_{int(y)}"
        if solve:
            icpt[key] = brentq(lambda d: kids_val(P["KIDS"][m] + d, s).mean() - t, -2, 2)
        kids[m] = kids_val(P["KIDS"][m] + icpt[key], s)
    for s in (0, 1):
        kids[(sex == s) & (ukd < KIDS_DK[s])] = np.nan
    P["KIDS_N"] = kids
    ukw = rng.random(n)
    kw = np.empty(n, dtype=object)
    for flag in (True, False):
        m = young == flag
        cum = np.cumsum(KWHEN_P[flag])
        kw[m] = np.array(KWHEN)[np.searchsorted(cum, ukw[m], side="right").clip(0, 3)]
    P["kids_when"] = kw

    # взгляды на роли
    bw = .6 * P["TRAD"] + .8 * rng.standard_normal(n)
    hh = .5 * P["TRAD"] + np.sqrt(.75) * rng.standard_normal(n)
    uh = rng.random(n)
    if solve:
        for s, t in ((0, .55), (1, .45)):
            icpt[f"bw_cut_{s}"] = float(np.quantile(bw[sex == s], 1 - t))
        icpt["house_cut"] = float(np.quantile(hh, 1 - .17))
    P["BREADW"] = bw > np.where(sex == 0, icpt["bw_cut_0"], icpt["bw_cut_1"])
    P["PATERNAL"] = P["TRAD"] > 1.0
    P["house_ideal"] = np.where(hh > icpt["house_cut"], HOUSE_IDEAL[1],
                                np.where(uh < .07 / .83, HOUSE_IDEAL[2], HOUSE_IDEAL[0]))
    return P, icpt


# ---------------------------------------------------------------- шкалы для текста
def ecr_anx(z):
    return np.clip(3.64 + 1.33 * z, 1, 7)


def ecr_avo(z):
    return np.clip(2.93 + 1.18 * z, 1, 7)


def att_style(zanx, zavo, cut=.6):
    a, v = zanx >= cut, zavo >= cut
    return np.where(~a & ~v, "надёжный", np.where(a & v, "тревожно-избегающий",
                                                   np.where(a, "тревожный", "избегающий")))


def freq_of(z):
    return np.searchsorted(FREQ_CUTS, z)


def five(z):
    return np.round(np.clip(3 + .7 * z, 1, 5), 1)


# ---------------------------------------------------------------- самоотчёт (design.md, 3.2)
SR_DIR = {"N": -1, "ANX": -1, "AVO": -1, "HOST": -1, "WD": -1, "SPEND": -1,
          "COMM": 1, "C": 1, "A": 1, "LS": 1}
SR_BASE, SR_ETA, SR_TRAIT, SR_EPS = .35, .20, .15, .70
INF_TEST_ADMIT, JEAL_ADMIT, DEBT_ADMIT = .35, .50, .60


def selfreport(P, rng):
    n = len(P["sex"])
    eta = P["ETA"]
    d_base = np.maximum(0, SR_BASE + SR_ETA * eta)
    S = {}
    for k, s in SR_DIR.items():
        x = P[k]
        d = np.maximum(0, SR_BASE + SR_ETA * eta + SR_TRAIT * np.maximum(0, -s * x))
        S[k] = x + s * d + SR_EPS * rng.standard_normal(n)
    S["TRAD"] = P["TRAD"] + .15 * rng.standard_normal(n)
    for v in VIEW_LABELS:
        S[v] = P[v] + .30 * rng.standard_normal(n)
    lvl = P["DRINK_LVL"].copy()
    u1, u2 = rng.random(n), rng.random(n)
    lvl = lvl - (u1 < .35 + .15 * d_base)
    lvl = lvl - (P["RISKY"] & (u2 < .5))
    S["DRINK_LVL"] = np.maximum(0, lvl)
    S["RISKY"] = np.zeros(n, dtype=bool)
    S["INF"] = P["INF"] & (rng.random(n) < INF_TEST_ADMIT)
    S["JEAL"] = P["JEAL"] & (rng.random(n) < JEAL_ADMIT)
    S["DEBT_PROB"] = P["DEBT_PROB"] & (rng.random(n) < DEBT_ADMIT)
    S["DEBT_ANY"] = P["DEBT_ANY"].copy()
    hf = freq_of(S["HOST"])
    often_true = freq_of(P["HOST"]) == 3
    hf = hf - ((hf == 3) & often_true & (rng.random(n) < .5))
    S["HOST_FREQ"] = hf
    S["WD_FREQ"] = freq_of(S["WD"])
    for k in ("PDIV", "BORN_SINGLE", "STEP", "KIDS_N", "REL_LVL", "ISLAM", "ORTH", "CONF",
              "sex", "age", "city", "edu", "work", "income_q", "smoke", "kids_when",
              "BREADW", "PATERNAL", "house_ideal"):
        S[k] = P[k]
    S["d_base"] = d_base
    return S


# ---------------------------------------------------------------- новые поля с нулевым весом (критик 2, п. 4)
# Жребий — отдельными зёрнами «skeleton_ext» / «selfreport_ext» ПОСЛЕ всех прежних: прежние значения не меняются.
# В исходе не участвуют (вес 0). Связи и доли — [допущение]; см. design.md, 13.2.
EXT_LAT = ["DEFENS", "JEAL_FEEL", "CONTROL", "LIE"]
EXT_LOAD = {  # латентная = Σ нагрузка·источник + остаток (итоговая SD ≈ 1)
    "DEFENS": {"N": .30, "HOST": .30},     # оборона в ссорах: от нейротизма и враждебности
    # критик 3, п. 2: ревность и контроль — общий фактор «ревность-контроль» (EXT_COMMON) и связь с прежним бинарным
    # признаком «тайно проверял телефон» (JEAL, центрирован). r(ревность, контроль) ≈ 0,44; r(ревность, проверка) ≈ 0,48
    "JEAL_FEEL": {"ANX": .30, "JEAL": .40, "EXT_COMMON": .45},   # ревность как чувство
    "CONTROL": {"ANX": .25, "JEAL": .25, "EXT_COMMON": .45},     # контроль (требует телефон, ограничивает общение)
    "LIE": {"A": -.20},                    # склонность приврать партнёру в мелочах
}
# Центрирование бинарного JEAL и его корреляция с ANX — измерены на калибровочной популяции (10 000 человек):
# доля 0,40, r(JEAL, ANX) = 0,27. Нужны только для того, чтобы итоговая SD латентной была ≈ 1.
JEAL_P, JEAL_ANX_R = .40, .27
EXT_CUTS = {  # доли «почти никогда / редко / иногда / часто»
    "DEFENS": (.10, .45, .80),             # 10 / 35 / 35 / 20
    "JEAL_FEEL": (.15, .55, .85),          # 15 / 40 / 30 / 15
    "CONTROL": (.55, .85, .95),            # 55 / 30 / 10 / 5
    "LIE": (.25, .65, .90),                # 25 / 40 / 25 / 10
}
EXT_SR_DROP = {"DEFENS": 0.0, "JEAL_FEEL": 0.0, "CONTROL": .5, "LIE": .5}  # доп. −1 ступень (если ступень ≥ 1)


def ext_freq(k, z):
    return np.searchsorted(norm.ppf(EXT_CUTS[k]), z)


def _ext_src_cov(a, b):
    """Ковариация источников новых полей: латентные черты, центрированный JEAL, общий фактор EXT_COMMON."""
    if a == b:
        return 1.0
    ix = {k: i for i, k in enumerate(LATENT)}
    if a in ix and b in ix:
        return float(corr_matrix()[ix[a], ix[b]])
    if {a, b} == {"JEAL", "ANX"}:
        return JEAL_ANX_R
    return 0.0   # EXT_COMMON независим от всего; JEAL связан только с ANX


def ext_implied_r(k, other):
    """Заданная (ожидаемая) корреляция латентной k с источником или с другой новой латентной."""
    ld = EXT_LOAD[k]
    if other in EXT_LOAD:
        lo = EXT_LOAD[other]
        return sum(ld[a] * lo[b] * _ext_src_cov(a, b) for a in ld for b in lo)
    return sum(ld[a] * _ext_src_cov(a, other) for a in ld)


def derive_ext(P, rng):
    """Добавляет к скелету поля EXT_LAT (z и категорию «_F»). Ничего прежнего не трогает.
    Порядок жребия в потоке skeleton_ext: остатки DEFENS, JEAL_FEEL, CONTROL, LIE (как в редакции 3), затем общий
    фактор EXT_COMMON (критик 3, п. 2) — поэтому DEFENS и LIE не изменились."""
    n = len(P["sex"])
    ix = {k: i for i, k in enumerate(LATENT)}
    eps = {k: rng.standard_normal(n) for k in EXT_LAT}
    src = {"JEAL": (P["JEAL"].astype(float) - JEAL_P) / np.sqrt(JEAL_P * (1 - JEAL_P)),
           "EXT_COMMON": rng.standard_normal(n)}
    for k in EXT_LAT:
        ld = EXT_LOAD[k]
        var = sum(ld[a] * ld[b] * _ext_src_cov(a, b) for a in ld for b in ld)
        P[k] = sum(ld[x] * (P[x] if x in ix else src[x]) for x in ld) + np.sqrt(1 - var) * eps[k]
        P[k + "_F"] = ext_freq(k, P[k])
    return P


def selfreport_ext(P, S, rng):
    """Самоотчёт по новым полям: тот же сдвиг к желательному полюсу, что и у черт (3.2), плюс для контроля
    и вранья ещё −1 ступень с вероятностью 0,5. Желательный полюс у всех — «реже»."""
    n = len(P["sex"])
    eta = P["ETA"]
    for k in EXT_LAT:
        x = P[k]
        d = np.maximum(0, SR_BASE + SR_ETA * eta + SR_TRAIT * np.maximum(0, x))
        S[k] = x - d + SR_EPS * rng.standard_normal(n)
        f = ext_freq(k, S[k])
        f = f - ((f >= 1) & (rng.random(n) < EXT_SR_DROP[k]))
        S[k + "_F"] = f
    return S


# ---------------------------------------------------------------- признаки для подбора пар
MATCH_DIMS = ["REL", "EDU", "TRAD", "VIEWS", "KIDS", "DRINK", "SMOKE"]  # личность не подбирается (поправка 3)
PERS = ["N", "ANX", "AVO", "HOST", "A", "C", "COMM"]
MATCH_TARGET = {"REL": .60, "EDU": .50, "TRAD": .45, "VIEWS": .25, "KIDS": .30,
                "DRINK": .35, "SMOKE": .25}
ISLAM_MATCH_T = .85
AGE_SD_T = 2.5
AGE_WIN = (-3, 8)


def kids_num(P):
    k = P["KIDS_N"].copy()
    k[np.isnan(k)] = 2.0
    return k


def score_matrix(P, mi, wi, a, nu):
    """score(m, w) = -Σ a_k|Δ| - a_isl·[ислам≠] - a_age·(Δвозр-2)² + ν; недопустимые = -inf."""
    def d(x):
        return np.abs(x[mi][:, None] - x[wi][None, :])
    S = -a["REL"] * d(P["REL"]) - a["EDU"] * d(P["EDU"]) - a["TRAD"] * d(P["TRAD"])
    S -= a["VIEWS"] * sum(d(P[v]) for v in VIEW_LABELS) / 6
    S -= a["KIDS"] * d(kids_num(P)) - 0
    S -= a["DRINK"] * d(P["DRINK"]) + a["SMOKE"] * d(P["SMOKE"])
    S -= a["ISL"] * (P["ISLAM"][mi][:, None] != P["ISLAM"][wi][None, :])
    dage = P["age"][mi][:, None] - P["age"][wi][None, :]
    S -= a["AGE"] * (dage - 2.0) ** 2
    S = S + nu
    ok = (dage >= AGE_WIN[0]) & (dage <= AGE_WIN[1])
    return S, ok


def match_city(P, mi, wi, a, nu):
    S, ok = score_matrix(P, mi, wi, a, nu)
    r, c = linear_sum_assignment(-np.where(ok, S, S - 1e3))
    return [(mi[i], wi[j], bool(ok[i, j])) for i, j in zip(r, c)], S, ok


def pair_corrs(P, m, w):
    def r(x):
        return float(np.corrcoef(x[m], x[w])[0, 1])
    out = {"REL": r(P["REL"]), "EDU": r(P["EDU"]), "TRAD": r(P["TRAD"]),
           "VIEWS": float(np.mean([r(P[v]) for v in VIEW_LABELS])), "KIDS": r(kids_num(P)),
           "DRINK": r(P["DRINK"]), "SMOKE": r(P["SMOKE"]),
           "PERS": float(np.mean([r(P[t]) for t in PERS])),
           "REL_LVL": r(P["REL_LVL"].astype(float)), "DRINK_LVL": r(P["DRINK_LVL"].astype(float))}
    anym = P["ISLAM"][m] | P["ISLAM"][w]
    out["ISL_MATCH"] = float((P["ISLAM"][m] & P["ISLAM"][w])[anym].mean()) if anym.any() else float("nan")
    dage = P["age"][m] - P["age"][w]
    out["AGE_MEAN"], out["AGE_SD"] = float(dage.mean()), float(dage.std())
    return out


# ---------------------------------------------------------------- стадия пары (design.md, 4.4)
STAGES = ["встречаются", "живут вместе", "в браке"]
STAGE_P = [(24, (.40, .29, .31)), (27, (.30, .18, .52)), (99, (.22, .16, .62))]
DUR_MAX = (24, 48, 72)


def draw_stage(P, m, w, u):
    abar = (P["age"][m] + P["age"][w]) / 2
    st = np.zeros(len(m), dtype=int)
    for i in range(len(m)):
        p = next(pp for lim, pp in STAGE_P if abar[i] < lim)
        p = np.array(p, dtype=float)
        if P["REL_LVL"][m[i]] == 3 and P["REL_LVL"][w[i]] == 3:
            p[0] += p[1] * .5
            p[1] *= .5
        st[i] = int(np.searchsorted(np.cumsum(p), u[i], side="right").clip(0, 2))
    return st


def house_share(P, m, w, z):
    """Доля быта на женщине (только для живущих вместе); в самоотчёт и тексты не идёт."""
    t = (P["TRAD"][m] + P["TRAD"][w]) / 2
    return np.clip(.55 + .10 * t + .15 * z, .05, .95)


# ---------------------------------------------------------------- формула исхода
def view_from(D):
    return D


def ind(D, i, c):
    return (c["COMM"] * -D["COMM"][i] + c["HOST"] * D["HOST"][i] + c["AVO"] * D["AVO"][i]
            + c["ANX"] * D["ANX"][i] + c["N"] * D["N"][i] + c["RISKY"] * D["RISKY"][i]
            + c["DEBT_PROB"] * D["DEBT_PROB"][i] + c["INF"] * D["INF"][i] + c["PDIV"] * D["PDIV"][i])


def mis_flags(D, m, w):
    km, kw = D["KIDS_N"][m], D["KIDS_N"][w]
    known = ~np.isnan(km) & ~np.isnan(kw)
    hard = known & (((km == 0) & (kw >= 1)) | ((kw == 0) & (km >= 1)))
    soft = known & ~hard & (km >= 1) & (kw >= 1) & (np.abs(km - kw) >= 2)
    heavy = lambda i: (D["DRINK_LVL"][i] == 3) | D["RISKY"][i]
    light = lambda i: D["DRINK_LVL"][i] <= 1
    drink = (heavy(m) & light(w)) | (heavy(w) & light(m))
    rm, rw = D["REL_LVL"][m], D["REL_LVL"][w]
    cross = (D["ISLAM"][m] & D["ORTH"][w]) | (D["ORTH"][m] & D["ISLAM"][w])
    rel = (np.abs(rm - rw) >= 2) | (cross & (np.maximum(rm, rw) >= 2))
    money = np.abs(D["SPEND"][m] - D["SPEND"][w]) > 1.5
    return {"kids_hard": hard, "kids_soft": soft, "drink": drink, "rel": rel, "money": money}


def sim_raw(D, m, w):
    keys = ["TRAD"] + list(VIEW_LABELS)
    return -np.mean([np.abs(D[k][m] - D[k][w]) for k in keys], axis=0)


def components(D, m, w, spec, sim_mu, sim_sd, which="break"):
    c = spec["ind"] if which == "break" else spec["ind_sat"]
    mc = spec["mis"] if which == "break" else {k: v * spec["mis_sat_mult"] for k, v in spec["mis"].items()}
    IND = ind(D, m, c) + ind(D, w, c)
    F = mis_flags(D, m, w)
    MIS = sum(mc[k] * F[k] for k in F)
    SIM = (sim_raw(D, m, w) - sim_mu) / sim_sd
    return IND, MIS, spec["beta_sim"] * SIM, F


def lin_pred(D, m, w, spec, sim_mu, sim_sd, which="break"):
    a, b, s, _ = components(D, m, w, spec, sim_mu, sim_sd, which)
    return a + b + s


def p3(alpha, stage, dur, klin, U, gamma):
    return expit(alpha[stage] + gamma * np.log(dur / 12.0) + klin + U)


def survival(alpha, stage, dur, klin, U, gamma):
    """Вероятность, что пара дожила до начала наблюдения (стаж dur мес.), по той же формуле:
    шаги по 6 мес., риск шага — из 3-летнего риска при стаже t."""
    dur = np.asarray(dur, dtype=float)
    logS = np.zeros(np.broadcast(dur, U).shape)
    for j in range(12):
        t = 6.0 * j
        active = t < dur
        length = np.clip(dur - t, 0, 6)
        p = expit(alpha[stage] + gamma * np.log(max(t + 3, 3) / 12.0) + klin + U)
        logS += np.where(active, (length / 36.0) * np.log1p(-p), 0.0)
    return np.exp(logS)


def prehistory_real(alpha, stage, klin, gamma, sigU, R):
    """Настоящая пара не выкидывается: стаж и U перетягиваются, пока пара не «доживёт».
    R = (dur_u, U_z, coin) формы (n, T) — заранее вытянутые числа (общие случайные числа)."""
    du, uz, coin = R
    dmax = np.array(DUR_MAX)[stage][:, None]
    dur = 6 + np.floor(du * (dmax - 5))
    U = sigU * uz
    S = survival(alpha, stage[:, None], dur, klin[:, None], U, gamma)
    ok = coin < S
    first = np.where(ok.any(1), ok.argmax(1), ok.shape[1] - 1)
    idx = np.arange(len(stage))
    return dur[idx, first], U[idx, first], first, ok.any(1)


# ---------------------------------------------------------------- разбиение и дополнительные пары
HOLDOUT_SHARE = {"Ярославль": .5}   # малый город — 50/50 (design.md, 7); прочие 40%
HOLDOUT_DEFAULT = .4


def split_real(P, real_m, real_w, stage, rng):
    """Настоящие пары как единицы: страты город × стадия. Возвращает 'work'/'holdout' на пару."""
    part = np.empty(len(real_m), dtype=object)
    cities = P["city"][real_m]
    for c in np.unique(cities):
        idx = np.where(cities == c)[0]
        h = HOLDOUT_SHARE.get(CITIES[c], HOLDOUT_DEFAULT)
        order = np.concatenate([rng.permutation(idx[stage[idx] == s]) for s in range(3)])
        off = rng.random()
        for j, i in enumerate(order):
            part[i] = "holdout" if np.floor((j + 1) * h + off) > np.floor(j * h + off) else "work"
    return part


ALT_BAND = (20, 100)  # поправка 4: отсекаем только неправдоподобные 20% (у каждого из двоих)


def alt_candidates(groups, real_set, person_part, band=None):
    """groups: [(mi, wi, S, ok)] на город. Полоса ALT_BAND (сейчас 20–100-й перцентиль, то есть только нижняя
    граница — поправка 4) считается по ВСЕМУ городу до разбиения (у каждого из двоих); кандидат — только
    внутри одной части."""
    cand = []
    for mi, wi, S, ok in groups:
        bl, bh = band or ALT_BAND
        lo_m = np.array([np.percentile(S[i, ok[i]], bl) if ok[i].any() else np.inf for i in range(len(mi))])
        hi_m = np.array([np.percentile(S[i, ok[i]], bh) if ok[i].any() else -np.inf for i in range(len(mi))])
        lo_w = np.array([np.percentile(S[ok[:, j], j], bl) if ok[:, j].any() else np.inf for j in range(len(wi))])
        hi_w = np.array([np.percentile(S[ok[:, j], j], bh) if ok[:, j].any() else -np.inf for j in range(len(wi))])
        for i in range(len(mi)):
            for j in range(len(wi)):
                m, w = mi[i], wi[j]
                if not ok[i, j] or (m, w) in real_set or person_part[m] != person_part[w]:
                    continue
                s = S[i, j]
                if lo_m[i] <= s <= hi_m[i] and lo_w[j] <= s <= hi_w[j]:
                    cand.append((m, w, s))
    return cand


def alt_select(P, cand, tau, cap, target, rng_sel, rng_st=None, model=None, D=None):
    """Взвешенный жребий без возвращения (трюк Гумбеля, вес exp(score/τ)).
    Если задана модель — для каждой пары тянется стадия, стаж и U, и в выборку попадает только
    пара, «дожившая» до начала наблюдения по той же формуле (design.md, 4.3)."""
    if not cand:
        return []
    m = np.array([c[0] for c in cand])
    w = np.array([c[1] for c in cand])
    s = np.array([c[2] for c in cand])
    key = s / tau + rng_sel.gumbel(size=len(s))
    order = np.argsort(-key)
    if model is not None:
        klin = model["k"] * lin_pred(D, m, w, model["spec"], model["sim_mu"], model["sim_sd"])
    deg = {}
    out = []
    for o in order:
        a, b = m[o], w[o]
        if deg.get(a, 0) >= cap or deg.get(b, 0) >= cap:
            continue
        rec = {"m": int(a), "w": int(b), "score": float(s[o])}
        if model is not None:
            u = rng_st.random(4)
            zU, zh = rng_st.standard_normal(2)
            st = int(draw_stage(P, np.array([a]), np.array([b]), u[:1])[0])
            dur = float(6 + np.floor(u[1] * (DUR_MAX[st] - 5)))
            U = model["sigU"] * zU
            Sv = float(survival(model["alpha"], st, dur, klin[o], U, model["gamma"]))
            rec.update(stage=st, dur=dur, U=float(U), surv=Sv, house_z=float(zh))
            if u[2] >= Sv:
                continue
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
        out.append(rec)
        if len(out) >= target:
            break
    return out


def auc(y, x):
    """AUC через ранги (x — риск распада)."""
    from scipy.stats import rankdata
    y = np.asarray(y, bool)
    n1, n0 = y.sum(), (~y).sum()
    if n1 == 0 or n0 == 0:
        return np.nan
    r = rankdata(x)
    return (r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def auc_strat(y, x, stage):
    """Среднее AUC внутри стадий, веса — число пар с обоими исходами."""
    vals, wts = [], []
    for s in np.unique(stage):
        mk = stage == s
        a = auc(y[mk], x[mk])
        if not np.isnan(a):
            vals.append(a)
            wts.append(mk.sum())
    return float(np.average(vals, weights=wts)) if vals else np.nan


def center_by(x, g):
    x = np.asarray(x, float).copy()
    for s in np.unique(g):
        x[g == s] -= x[g == s].mean()
    return x


# ---------------------------------------------------------------- разное
def opaque_ids(rng, n, length, prefix_letters=True):
    alpha = string.ascii_lowercase + string.digits
    out, seen = [], set()
    while len(out) < n:
        s = "".join(rng.choice(list(alpha), size=length))
        if prefix_letters and not s[0].isalpha():
            continue
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def dump(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, default=_conv)
        f.write("\n")


def _conv(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- JSON человека ↔ массивы
def person_records(P, ids):
    n = len(ids)
    recs = []
    for i in range(n):
        kn = P["KIDS_N"][i]
        recs.append({
            "id": ids[i],
            "sex": "м" if P["sex"][i] == 0 else "ж",
            "age": int(P["age"][i]),
            "city": CITIES[P["city"][i]],
            "education": P["edu"][i], "work": P["work"][i], "income_quintile_in_city": int(P["income_q"][i]),
            "attachment": {"anxiety_ecr_1_7": round(float(ecr_anx(P["ANX"][i])), 2),
                           "avoidance_ecr_1_7": round(float(ecr_avo(P["AVO"][i])), 2),
                           "style": str(att_style(P["ANX"][i], P["AVO"][i]))},
            "big5_1_5": {"neuroticism": float(five(P["N"][i])), "agreeableness": float(five(P["A"][i])),
                         "conscientiousness": float(five(P["C"][i])), "extraversion": float(five(P["E"][i])),
                         "openness": float(five(P["O"][i]))},
            "conflict": {"hostility_criticism_contempt": FREQ[int(freq_of(P["HOST"][i]))],
                         "withdrawal_stonewalling": FREQ[int(freq_of(P["WD"][i]))]},
            "long_term_orientation_1_7": round(float(np.clip(4.8 + 1.2 * P["COMM"][i], 1, 7)), 1),
            "life_satisfaction_1_10": int(np.clip(round(6.5 + 1.8 * P["LS"][i]), 1, 10)),
            "secretly_checked_partner_phone_ever": bool(P["JEAL"][i]),
            **ext_record(P, i),
            "alcohol": {"frequency": DRINK_LEVELS[int(P["DRINK_LVL"][i])], "risky_audit8plus": bool(P["RISKY"][i])},
            "nicotine": P["smoke"][i],
            "money": {"has_consumer_debt": bool(P["DEBT_ANY"][i]), "problem_debt": bool(P["DEBT_PROB"][i]),
                      "saves_nothing": bool(P["SPEND"][i] > .5)},
            "cheated_in_past_relationship": bool(P["INF"][i]),
            "parents": {"born_outside_union": bool(P["BORN_SINGLE"][i]),
                        "parents_separated_before_15": bool(P["PDIV"][i]),
                        "step_parent": bool(P["STEP"][i])},
            "kids": {"wanted": "не знаю" if np.isnan(kn) else ("5+" if kn >= 5 else int(kn)),
                     "first_child_when": P["kids_when"][i]},
            "religion": {"confession": P["CONF"][i], "religiosity": REL_LEVELS[int(P["REL_LVL"][i])]},
            "roles": {"man_is_head_of_family": bool(P["PATERNAL"][i]), "man_must_provide": bool(P["BREADW"][i]),
                      "housework_should_be": P["house_ideal"][i]},
            "views_z": {f"{VIEW_LABELS[v][0]} ↔ {VIEW_LABELS[v][1]}": round(float(P[v][i]), 2) for v in VIEW_LABELS},
            "z": {k: round(float(P[k][i]), 4) for k in LATENT + [x for x in EXT_LAT if x in P]},
        })
    return recs


def ext_record(X, i):
    """Новые поля (вес 0) в словах; одинаково для «правды» и самоотчёта."""
    if "DEFENS_F" not in X:
        return {}
    return {
        "conflict_defensiveness": FREQ[int(X["DEFENS_F"][i])],
        "jealousy_feeling": FREQ[int(X["JEAL_FEEL_F"][i])],
        "controlling_partner": FREQ[int(X["CONTROL_F"][i])],
        "lies_to_partner_small_things": FREQ[int(X["LIE_F"][i])],
    }


def arrays_from_people(recs):
    """Обратно в массивы (для pairs.py / outcome.py)."""
    n = len(recs)
    P = {k: np.array([r["z"][k] for r in recs]) for k in LATENT}
    P["sex"] = np.array([0 if r["sex"] == "м" else 1 for r in recs])
    P["age"] = np.array([r["age"] for r in recs])
    P["city"] = np.array([CITIES.index(r["city"]) for r in recs])
    P["DRINK_LVL"] = np.array([DRINK_LEVELS.index(r["alcohol"]["frequency"]) for r in recs])
    P["RISKY"] = np.array([r["alcohol"]["risky_audit8plus"] for r in recs])
    P["DEBT_ANY"] = np.array([r["money"]["has_consumer_debt"] for r in recs])
    P["DEBT_PROB"] = np.array([r["money"]["problem_debt"] for r in recs])
    P["INF"] = np.array([r["cheated_in_past_relationship"] for r in recs])
    P["JEAL"] = np.array([r["secretly_checked_partner_phone_ever"] for r in recs])
    P["PDIV"] = np.array([r["parents"]["parents_separated_before_15"] for r in recs])
    P["BORN_SINGLE"] = np.array([r["parents"]["born_outside_union"] for r in recs])
    P["STEP"] = np.array([r["parents"]["step_parent"] for r in recs])
    P["KIDS_N"] = np.array([np.nan if r["kids"]["wanted"] == "не знаю" else (5.0 if r["kids"]["wanted"] == "5+" else float(r["kids"]["wanted"])) for r in recs])
    P["REL_LVL"] = np.array([REL_LEVELS.index(r["religion"]["religiosity"]) for r in recs])
    P["CONF"] = np.array([r["religion"]["confession"] for r in recs], dtype=object)
    P["ISLAM"] = P["CONF"] == "ислам"
    P["ORTH"] = P["CONF"] == "православие"
    P["ids"] = [r["id"] for r in recs]
    return P
