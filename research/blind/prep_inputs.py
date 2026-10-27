"""Вход LLM-ролям (ответ критику 2, п. 3; design.md, 13.1): одна запись на человека, только слова и категории.

Запуск из корня проекта (после generate.py):  python3 research/blind/prep_inputs.py
Выход:
  inputs/truth/<id>.json — для автора досье (A): «правда» человека словами;
  inputs/self/<id>.json  — для автора самоописания (B): самоотчёт человека словами;
  inputs/manifest.json   — SHA-256 каждого входа и исходных файлов.
Чего во входе нет и быть не может (проверяется кодом, иначе падение): z, z_self, views_z и любых дробных чисел
(латентные черты и шкальные баллы переведены в слова), id человека, сведений о партнёре, паре, стадии, исходе.
Целые числа остаются только там, где это не латентная черта: возраст и желаемое число детей.
Вход передаётся роли ПРЯМО В ЗАДАНИИ; роль файлы проекта не открывает (design.md, 13.1).
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blindlib as B  # noqa: E402

IN = os.path.join(B.ROOT, "inputs")
FORBIDDEN_KEYS = {"z", "z_self", "views_z", "id", "partner", "pair", "stage", "outcome", "type", "part", "U"}
LEVEL = ["очень низкая", "ниже среднего", "средняя", "выше среднего", "очень высокая"]
LEVEL_CUTS = (-1.25, -.5, .5, 1.25)
INCOME = {1: "в нижней пятой части по своему городу", 2: "ниже среднего по городу", 3: "около среднего по городу",
          4: "выше среднего по городу", 5: "в верхней пятой части по своему городу"}


def level(z):
    return LEVEL[sum(z > c for c in LEVEL_CUTS)]


def view_words(key, z):
    a, b = key.split(" ↔ ")
    if z < -1:
        return f"явно: {a}"
    if z < -.33:
        return f"скорее: {a}"
    if z <= .33:
        return f"посередине между «{a}» и «{b}»"
    if z <= 1:
        return f"скорее: {b}"
    return f"явно: {b}"


def yn(x):
    return "да" if x else "нет"


def common(r):
    return {
        "пол": "мужчина" if r["sex"] == "м" else "женщина",
        "возраст": r["age"],
        "город": r["city"],
        "образование": r["education"],
        "занятость": r["work"],
        "доход": INCOME[r["income_quintile_in_city"]],
        "привязанность": {
            "тревожность в отношениях": level((r["attachment"]["anxiety_ecr_1_7"] - 3.64) / 1.33),
            "избегание близости": level((r["attachment"]["avoidance_ecr_1_7"] - 2.93) / 1.18)},
        "черты": {"эмоциональная неустойчивость": level((r["big5_1_5"]["neuroticism"] - 3) / .7),
                  "доброжелательность": level((r["big5_1_5"]["agreeableness"] - 3) / .7),
                  "организованность": level((r["big5_1_5"]["conscientiousness"] - 3) / .7)},
        "ссоры": {"критика, презрение, враждебность": r["conflict"]["hostility_criticism_contempt"],
                  "уход от разговора, молчание": r["conflict"]["withdrawal_stonewalling"],
                  "оборона, оправдания вместо разговора": r["conflict_defensiveness"]},
        "настрой на долгие отношения": level((r["long_term_orientation_1_7"] - 4.8) / 1.2),
        "удовлетворённость жизнью": level((r["life_satisfaction_1_10"] - 6.5) / 1.8),
        "ревность и контроль": {"ревность как чувство": r["jealousy_feeling"],
                                "контроль партнёра (просит показать телефон, ограничивает общение)": r["controlling_partner"]},
        "привирает партнёру в мелочах": r["lies_to_partner_small_things"],
        "никотин": r["nicotine"],
        "родители": {"родился(ась) вне брака родителей": yn(r["parents"]["born_outside_union"]),
                     "родители расстались до его/её 15 лет": yn(r["parents"]["parents_separated_before_15"]),
                     "был отчим или мачеха": yn(r["parents"]["step_parent"])},
        "дети": {"сколько хочет": r["kids"]["wanted"], "когда первый": r["kids"]["first_child_when"]},
        "вера": {"конфессия": r["religion"]["confession"], "религиозность": r["religion"]["religiosity"]},
        "роли в семье": {"глава семьи — мужчина": yn(r["roles"]["man_is_head_of_family"]),
                         "кормить семью должен мужчина": yn(r["roles"]["man_must_provide"]),
                         "быт должен делиться": r["roles"]["housework_should_be"]},
        "взгляды": {k: view_words(k, v) for k, v in r["views_z"].items()},
    }


def truth_record(r):
    out = common(r)
    out["привязанность"]["тип"] = r["attachment"]["style"]
    out["черты"].update(общительность=level((r["big5_1_5"]["extraversion"] - 3) / .7),
                        открытость_новому=level((r["big5_1_5"]["openness"] - 3) / .7))
    out["ревность и контроль"]["тайно проверял(а) телефон партнёра"] = yn(r["secretly_checked_partner_phone_ever"])
    out["алкоголь"] = {"как часто пьёт": r["alcohol"]["frequency"], "рискованное питьё": yn(r["alcohol"]["risky_audit8plus"])}
    out["деньги"] = {"есть свой кредит, кредитка или рассрочка": yn(r["money"]["has_consumer_debt"]),
                     "проблемный долг (просрочки, МФО, долг больше трёх доходов)": yn(r["money"]["problem_debt"]),
                     "ничего не откладывает": yn(r["money"]["saves_nothing"])}
    out["изменял(а) в прошлых отношениях"] = yn(r["cheated_in_past_relationship"])
    return out


def self_record(r):
    out = common(r)
    out["ревность и контроль"]["признаёт, что тайно проверял(а) телефон партнёра"] = yn(r["admits_secretly_checking_partner_phone"])
    out["алкоголь"] = {"как часто пьёт (по его/её словам)": r["alcohol"]["frequency"]}
    out["деньги"] = {"есть свой кредит, кредитка или рассрочка": yn(r["money"]["has_consumer_debt"]),
                     "признаёт проблемный долг": yn(r["money"]["admits_problem_debt"]),
                     "ничего не откладывает": yn(r["money"]["saves_nothing"])}
    out["признаёт измену в прошлых отношениях"] = yn(r["admits_cheating_in_past"])
    return out


def check(o, path="$"):
    """Никаких запрещённых ключей и дробных чисел."""
    if isinstance(o, dict):
        for k, v in o.items():
            assert k not in FORBIDDEN_KEYS, f"запрещённый ключ {path}.{k}"
            check(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            check(v, f"{path}[{i}]")
    else:
        assert not isinstance(o, float), f"дробное число во входе роли: {path} = {o}"
        assert isinstance(o, (str, int)), f"неожиданный тип {path}: {type(o)}"


def write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    B.check_versions()
    people = B.load(os.path.join(B.ROOT, "people.json"))["people"]
    selfr = B.load(os.path.join(B.ROOT, "selfreport.json"))["people"]
    assert [p["id"] for p in people] == [s["id"] for s in selfr]
    for sub in ("truth", "self"):
        shutil.rmtree(os.path.join(IN, sub), ignore_errors=True)
        os.makedirs(os.path.join(IN, sub))
    man = {"generator": "research/blind/prep_inputs.py",
           "people_sha256": B.sha256(os.path.join(B.ROOT, "people.json")),
           "selfreport_sha256": B.sha256(os.path.join(B.ROOT, "selfreport.json")),
           "note": "Вход ролям A (truth) и B (self). Владельцу теста, отвечающему D и восстановителю C не показывать.",
           "truth": {}, "self": {}}
    for p, s in zip(people, selfr):
        t, sr = truth_record(p), self_record(s)
        check(t)
        check(sr)
        for sub, rec in (("truth", t), ("self", sr)):
            path = os.path.join(IN, sub, f"{p['id']}.json")
            write(path, rec)
            man[sub][p["id"]] = B.sha256(path)
    write(os.path.join(IN, "manifest.json"), man)
    print(f"входы ролям: {len(people)} × 2; manifest sha256 {B.sha256(os.path.join(IN, 'manifest.json'))[:16]}")


if __name__ == "__main__":
    main()
