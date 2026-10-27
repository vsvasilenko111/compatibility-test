"""Исполнитель LLM-ролей слепой выборки (design.md, 6, 13.1, 16).

  python3 research/blind/run_roles.py --pilot                 # люди из pilot/pilot.json
  python3 research/blind/run_roles.py --ids q7kd ern9         # конкретные люди
  python3 research/blind/run_roles.py --all                   # все 100 (только после порога 16.7)
  ... --roles A,B,C,D   (по умолчанию все; C всегда идёт вместе с A и B)
  ... --no-call          # только кеш: упасть, если какой-то вызов не закеширован
  ... --dry-run          # показать задания первого человека и выйти

Роли (design.md, 6): A — досье по «правде» (inputs/truth), B — самоописание по самоотчёту (inputs/self), отдельным
вызовом; C — восстановитель 12 полей по одному тексту, брак → автор переписывает, после 3 попыток «текст неверен»;
D — ответы на тест по самоописанию (пачки по 9–10, порядок вопросов и полюсов случаен с зерном, 5 важных сфер).

Каждый вызов — отдельный процесс `claude -p` из пустого временного каталога вне проекта, без инструментов, MCP,
настроек пользователя и сохранения сессии, со своим системным промптом (16.1). Сырой поток stream-json —
в raw/<роль>/<id>/<ключ>.jsonl (первая строка — заявка исполнителя). Ответ с выдуманным чтением файла или вызовом
инструмента бракуется (raw_rejected/) и перезапрашивается. Кеш по ключу (роль, модель, effort, промпты, попытка):
повторный запуск модель не вызывает. Не больше 4 процессов claude одновременно. Чтение и запись в private/, sealed/,
people.json, selfreport.json запрещены (guard).
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import glob
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.realpath(os.path.join(ROOT, "..", ".."))
FORBIDDEN = [os.path.join(ROOT, x) for x in ("private", "sealed", "people.json", "selfreport.json")]
BANK = os.path.join(PROJECT, "src", "questions", "bank.json")
MODELS = os.path.join(ROOT, "prompts", "models.json")
RAW = os.path.join(ROOT, "raw")
RAW_REJ = os.path.join(ROOT, "raw_rejected")
TEXTS = os.path.join(ROOT, "texts")
ANSWERS = os.path.join(ROOT, "answers")
MASTER_SEED = 20261028
ANSWERER_ORDER_INDEX = 12      # blindlib.SEED_NAMES[12] == "answerer_order" (design.md, 8.1, № 13)
MAX_PROCS = 4
MAX_ATTEMPTS = 3               # переписываний текста по браку C (design.md, 6)
MAX_FAB = 3                    # перезапросов из-за выдуманных инструментов / неразборчивого ответа
CALL_TIMEOUT = 900
N_BATCHES = 16                 # 153 вопроса → 9 пачек по 10 и 7 по 9 (16.4)
ROLE_KEYS = {"A": "A_dossier_author", "B": "B_selfdesc_author", "C": "C_restorer", "D": "D_answerer"}

# Сферы, из которых выбираются 5 важных (src/questions/spheres.ts, PRIORITY_SPHERES: все, кроме блока зрелости)
PRIORITY_SPHERES = [
    ("humor", "Юмор"), ("contact", "Общение и внимание"), ("leisure", "Досуг и увлечения"),
    ("loyalty", "Надёжность и поддержка"), ("honesty", "Честность и границы"), ("values", "Ценности"),
    ("conflicts", "Конфликты"), ("kids", "Дети и семья"), ("home", "Быт и дом"), ("living", "Где и как жить"),
    ("career", "Работа и амбиции"), ("budget", "Деньги"), ("intimacy", "Близость"),
    ("space", "Верность и личное пространство"), ("relatives", "Родственники"),
    ("roles", "Роли мужчины и женщины"), ("love", "Проявления любви"), ("habits", "Привычки и здоровье"),
]
PRIORITY_TOP = 5
BLOCK_TAG = {"friendship": "Партнёр как друг", "relationship": "О вас как паре", "maturity": "О вас и ваших чувствах"}


# ---------------------------------------------------------------- guard: никакого private/ и sealed/
def guard(path):
    rp = os.path.realpath(path)
    for f in FORBIDDEN:
        rf = os.path.realpath(f)
        if rp == rf or rp.startswith(rf + os.sep):
            raise SystemExit(f"запрещённый путь: {path} (design.md, 13.1)")
    return rp


def read_json(path):
    guard(path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_file(path, data):
    guard(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=1))
    os.replace(tmp, path)


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- проверка текста на выдуманные инструменты
def _load_ct():
    spec = importlib.util.spec_from_file_location("check_transcripts", os.path.join(ROOT, "check_transcripts.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CT = _load_ct()
FAB_EXTRA = [re.compile(p, re.I) for p in (
    r"<\s*/?\s*(tool|function|invoke|antml|parameter)", r"```\s*(bash|sh|shell|zsh|python|console)",
    r"\b(Read|Bash|Grep|Glob|WebFetch)\s*\(", r"tool_use|function_call|tool_result",
    r"(чита|откры|загружа|просматрива|прочита|откро|прочт)\w*\s+(этот\s+|нужный\s+)?(файл|документ|папк|каталог)",
    r"(посмотрю|загляну|проверю)\s+в\s+(файл|папк|каталог)")]


def fabricated(text):
    hits = [p for p, rx in CT.RX if rx.search(text)] + [rx.pattern for rx in FAB_EXTRA if rx.search(text)]
    return hits


# ---------------------------------------------------------------- вызов claude
SEM = threading.Semaphore(MAX_PROCS)
STATS_LOCK = threading.Lock()
STATS = {"calls": 0, "cached": 0, "rejected_fabricated": 0, "rejected_unparsable": 0, "api_errors": 0,
         "cost_usd": 0.0, "call_seconds": 0.0}
NO_CALL = False


def bump(k, v=1):
    with STATS_LOCK:
        STATS[k] += v


def child_env():
    env = {k: v for k, v in os.environ.items()
           if not (k.startswith("CLAUDE_CODE_") or k in ("CLAUDECODE", "CLAUDE_EFFORT", "CLAUDE_PID"))}
    return env


def parse_stream(path):
    events = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("{"):
                try:
                    events.append(json.loads(line))
                except ValueError:
                    pass
    res = [e for e in events if e.get("type") == "result"]
    if not res or res[-1].get("is_error") or res[-1].get("subtype") != "success":
        return None
    return {"text": res[-1].get("result", ""), "cost": res[-1].get("total_cost_usd", 0.0),
            "duration_ms": res[-1].get("duration_ms"), "num_turns": res[-1].get("num_turns")}


class Model:
    def __init__(self):
        m = read_json(MODELS)["roles"]
        self.cfg = {r: (m[k]["model"], m[k]["effort"]) for r, k in ROLE_KEYS.items()}


MODEL = None


def call(role, pid, kind, system, prompt, tag):
    """Один вызов роли. Возвращает (текст, путь сырого файла, из_кеша). Кеш — raw/ и raw_rejected/."""
    model, effort = MODEL.cfg[role]
    key = sha(json.dumps([role, model, effort, system, prompt, tag], ensure_ascii=False))[:20]
    name = f"{kind}-{key}.jsonl"
    path = os.path.join(RAW, role, pid, name)
    rej = os.path.join(RAW_REJ, role, pid, name)
    for p in (path, rej):
        if os.path.exists(p):
            r = parse_stream(guard(p))
            if r is not None:
                bump("cached")
                return r["text"], p, True
    if NO_CALL:
        raise SystemExit(f"--no-call: нет в кеше {role}/{pid}/{name}")
    flags = ["--model", model, "--effort", effort, "--tools", "", "--strict-mcp-config",
             "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project", "--no-session-persistence",
             "--output-format", "stream-json", "--verbose"]
    header = {"type": "runner_request", "role": role, "ordered_model": model, "ordered_effort": effort,
              "system_prompt_sha256": sha(system), "prompt_sha256": sha(prompt), "tag": tag, "flags": flags,
              "runner": "run_roles.py", "design": "design.md, 16.1"}
    last_err = None
    for attempt in range(4):
        with SEM:
            cwd = tempfile.mkdtemp(prefix="blindrole-")
            if os.path.realpath(cwd).startswith(PROJECT + os.sep):
                raise SystemExit("временный каталог внутри проекта")
            t0 = time.time()
            header["started"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            try:
                r = subprocess.run(["claude", "-p", prompt] + flags + ["--system-prompt", system], cwd=cwd,
                                   capture_output=True, text=True, timeout=CALL_TIMEOUT, stdin=subprocess.DEVNULL,
                                   env=child_env())
                out, err = r.stdout, r.stderr
            except subprocess.TimeoutExpired as e:
                out, err = (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or ""), "timeout"
            finally:
                try:
                    os.rmdir(cwd)
                except OSError:
                    pass
            bump("call_seconds", time.time() - t0)
        bump("calls")
        tmp = path + ".part"
        write_file(tmp, json.dumps(header, ensure_ascii=False) + "\n" + out)
        parsed = parse_stream(tmp)
        if parsed is not None:
            bump("cost_usd", parsed["cost"] or 0.0)
            os.replace(tmp, path)
            return parsed["text"], path, False
        bump("api_errors")
        errdir = os.path.join(RAW_REJ, "_errors", role, pid)
        os.makedirs(errdir, exist_ok=True)
        os.replace(tmp, os.path.join(errdir, f"{kind}-{key}-{int(time.time())}.jsonl"))
        last_err = (err or "")[-500:] + " | " + out[-500:]
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"{role}/{pid}/{kind}: вызов не удался: {last_err}")


def unreject(path):
    """Ответ из raw_rejected/ теперь принят (например, после правки разбора) — вернуть в raw/."""
    if not path.startswith(RAW_REJ):
        return path
    dst = os.path.join(RAW, os.path.relpath(path, RAW_REJ))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    os.replace(path, dst)
    return dst


def reject(path):
    """Перенести принятый было сырой поток в raw_rejected/ (ответ забракован по содержанию)."""
    if path.startswith(RAW_REJ):
        return
    dst = os.path.join(RAW_REJ, os.path.relpath(path, RAW))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    os.replace(path, dst)


def ask(role, pid, kind, system, prompt, tag, validate=None):
    """Вызов с перезапросом: ответ с выдуманным инструментом или не прошедший validate бракуется (до MAX_FAB)."""
    for k in range(MAX_FAB):
        text, path, cached = call(role, pid, kind, system, prompt, [tag, k])
        hits = fabricated(text)
        if hits:
            if not path.startswith(RAW_REJ):
                bump("rejected_fabricated")
            reject(path)
            continue
        if validate is not None:
            try:
                val = validate(text)
            except ValueError as e:
                if not path.startswith(RAW_REJ):
                    bump("rejected_unparsable")
                reject(path)
                continue
            return val, unreject(path)
        return text.strip(), unreject(path)
    raise RuntimeError(f"{role}/{pid}/{kind}: {MAX_FAB} ответа подряд забракованы")


def extract_json(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    i, j = t.find("{"), t.rfind("}")
    if i < 0 or j < i:
        raise ValueError("нет JSON")
    return json.loads(t[i:j + 1])


# ---------------------------------------------------------------- задания ролям (design.md, 6; 16)
COMMON_SYS = ("У тебя нет доступа к файлам, папкам, инструментам и интернету — всё нужное есть в задании. "
              "Не описывай свои действия и не упоминай файлы, анкеты, записи, данные или поля — пиши только то, "
              "что просят.")

SYS_A = ("Ты пишешь документальные досье об обычных людях по сведениям о них. Зачем нужно досье, ты не знаешь "
         "и не гадаешь. " + COMMON_SYS)
TASK_A = """Ниже — сведения об одном человеке. Напиши о нём (о ней) досье в третьем лице: 350–600 слов, связный текст без списков и заголовков, с конкретными бытовыми подробностями — работа, привычки, как ведёт себя в ссорах, с деньгами, с алкоголем, что думает о детях, вере, ролях в семье, как проводит время.

Правила:
- Это обычный человек, а не лучшая версия себя. Не смягчай и не оправдывай трудное: если он часто критикует и язвит в ссорах, замолкает, ревнует, контролирует, привирает, тайком смотрел чужой телефон, изменял, пьёт, не откладывает денег, сидит в долгах — это должно прямо и узнаваемо прозвучать через поступки и ситуации.
- Противоречия в сведениях не сглаживай и не объясняй: у живых людей они бывают. Покажи обе стороны.
- Каждое сведение должно быть понятно читателю, но без анкетных слов («уровень», «выше среднего», «шкала»). Передавай степень точно: «очень высокая» — бросается в глаза, «средняя» — ни то ни другое, «почти никогда» — не то же, что «никогда».
- Возраст, город, конфессию и сколько детей хочет — назови так, как в сведениях. Ничего не добавляй, что им противоречит.
- Сейчас он (она) в отношениях — скажи об этом одной фразой, без подробностей о партнёре и об этих отношениях.
- Пиши только сам текст досье.
{feedback}
Сведения:
{record}"""

SYS_B = ("Ты пишешь рассказы людей о себе от первого лица — так, как человек сам себя видит и подаёт. " + COMMON_SYS)
TASK_B = """Ниже — то, как один человек видит и подаёт себя. Напиши от его (её) лица рассказ о себе — так, как он рассказал бы о себе новому знакомому за долгим разговором: первое лицо, 300–550 слов, живая речь без списков и заголовков.

Правила:
- Это обычный человек, а не лучшая версия себя. Он говорит о себе ровно то, что в сведениях, — не лучше и не хуже. Приукрашивать сверх сведений нельзя: если там есть трудное (бывает резок в ссорах, замолкает, ревнует, курит, есть кредит, не откладывает), он это говорит — своими словами, как сам это понимает.
- Противоречия в сведениях не сглаживай: люди бывают непоследовательны в рассказе о себе.
- Не придумывай того, чего нет в сведениях. Если сведение «нет», не утверждай обратного.
- Передавай степень своими словами, без анкетных слов («уровень», «выше среднего», «шкала»). Возраст, город, веру и сколько детей хочет — назови так, как в сведениях.
- Не говори о нынешнем партнёре, ваших отношениях и вашем быте — только о себе.
- Пиши только сам рассказ.
{feedback}
Сведения:
{record}"""

FEEDBACK = ("\nПрошлый вариант текста читатель понял неверно в таких сведениях: {fields}. Напиши текст заново так, "
            "чтобы они читались однозначно.\n")

SYS_C = "Ты внимательно читаешь текст о человеке и заполняешь по нему короткую анкету. " + COMMON_SYS + \
        " Ответ — только JSON."

ORD5 = ["очень низкая", "ниже среднего", "средняя", "выше среднего", "очень высокая"]
FREQ4 = ["почти никогда", "редко", "иногда", "часто"]
ALC4 = ["не пьёт", "реже раза в месяц", "ежемесячно", "еженедельно и чаще"]
KIDS = ["0", "1", "2", "3", "4", "5+", "не знаю"]
CONF = ["православие", "ислам", "неверующий", "колеблется", "другое / вне конфессии"]
YN = ["да", "нет"]


def _g(*keys):
    def get(rec):
        for k in keys:
            if isinstance(k, tuple):
                for kk in k:
                    if kk in rec:
                        rec = rec[kk]
                        break
                else:
                    return None
            else:
                rec = rec.get(k) if isinstance(rec, dict) else None
        return None if rec is None else str(rec)
    return get


# (ключ, вопрос для C, вид, уровни, эталон по truth, эталон по self)
FIELDS = [
    ("тревожность", "Тревожность в отношениях (боится, что бросят, нуждается в подтверждениях)", "ord", ORD5,
     _g("привязанность", "тревожность в отношениях"), _g("привязанность", "тревожность в отношениях")),
    ("избегание", "Избегание близости (держит дистанцию, неуютно от сильной близости)", "ord", ORD5,
     _g("привязанность", "избегание близости"), _g("привязанность", "избегание близости")),
    ("неустойчивость", "Эмоциональная неустойчивость (тревожится, легко расстраивается, перепады настроения)", "ord",
     ORD5, _g("черты", "эмоциональная неустойчивость"), _g("черты", "эмоциональная неустойчивость")),
    ("враждебность", "Как часто в ссорах критикует, язвит, проявляет презрение или враждебность", "ord", FREQ4,
     _g("ссоры", "критика, презрение, враждебность"), _g("ссоры", "критика, презрение, враждебность")),
    ("уход", "Как часто в ссорах уходит от разговора, замолкает", "ord", FREQ4,
     _g("ссоры", "уход от разговора, молчание"), _g("ссоры", "уход от разговора, молчание")),
    ("ревность", "Как часто испытывает ревность", "ord", FREQ4,
     _g("ревность и контроль", "ревность как чувство"), _g("ревность и контроль", "ревность как чувство")),
    ("алкоголь", "Как часто пьёт алкоголь", "ord", ALC4,
     _g("алкоголь", "как часто пьёт"), _g("алкоголь", "как часто пьёт (по его/её словам)")),
    ("рискованное_питьё", "Пьёт помногу, рискованно (напивается, проблемы из-за алкоголя)", "yn", YN,
     _g("алкоголь", "рискованное питьё"), lambda rec: "нет"),
    ("измены", "Изменял(а) в прошлых отношениях", "yn", YN,
     _g("изменял(а) в прошлых отношениях"), _g("признаёт измену в прошлых отношениях")),
    ("дети", "Сколько детей хочет", "kids", KIDS, _g("дети", "сколько хочет"), _g("дети", "сколько хочет")),
    ("конфессия", "Вера, конфессия", "nom", CONF, _g("вера", "конфессия"), _g("вера", "конфессия")),
    ("долг", "Есть проблемный долг (просрочки, микрозаймы, долг больше трёх месячных доходов)", "yn", YN,
     _g("деньги", "проблемный долг (просрочки, МФО, долг больше трёх доходов)"),
     _g("деньги", "признаёт проблемный долг")),
]
CRITICAL = {"измены", "рискованное_питьё", "конфессия"}

TASK_C = """Прочитай текст о человеке и заполни анкету. Для каждого пункта выбери ровно одно значение из списка, написав его точно как в списке. Если прямо не сказано — выбери самое вероятное по тексту; для пунктов «да/нет» — «нет», если в тексте на это нет указаний.

Анкета:
{fields}

Ответ — только JSON-объект с ключами: {keys}.

Текст:
«{text}»"""


def task_c(text):
    lines = [f"- {k}: {q}. Значения: {' / '.join(lv)}" for k, q, _, lv, _, _ in FIELDS]
    return TASK_C.format(fields="\n".join(lines), keys=", ".join(k for k, *_ in FIELDS), text=text)


def norm_level(v, levels):
    """Точное значение или однозначное вхождение («вне конфессии» → «другое / вне конфессии»)."""
    v = str(v).strip().strip("«»\"'.").lower()
    if v in levels:
        return v
    hit = [lv for lv in levels if v and (v in lv or lv in v)]
    if len(hit) == 1:
        return hit[0]
    raise ValueError(f"значение {v!r} не из списка {levels}")


def validate_c(text):
    obj = extract_json(text)
    return {k: norm_level(obj.get(k, ""), lv) for k, _, _, lv, _, _ in FIELDS}


def compare(restored, rec, which):
    """design.md, 6 и 16.5. Возвращает (брак?, промахи, подробности)."""
    misses, detail = [], {}
    for k, _, kind, lv, gt, gs in FIELDS:
        ref = (gt if which == "truth" else gs)(rec)
        got = restored[k]
        if ref is None:
            raise SystemExit(f"нет эталона для поля {k}")
        if kind == "ord":
            miss = abs(lv.index(ref) - lv.index(got)) > 1
        elif kind == "kids":
            if "не знаю" in (ref, got):
                miss = ref != got
            else:
                miss = abs(KIDS.index(ref) - KIDS.index(got)) > 1
        else:
            miss = ref != got
        detail[k] = {"эталон": ref, "восстановлено": got, "мимо": miss}
        if miss:
            misses.append(k)
    crit = [k for k in misses if k in CRITICAL]
    zero = (detail["дети"]["эталон"] == "0") != (detail["дети"]["восстановлено"] == "0")
    bad = len(misses) >= 2 or bool(crit) or zero
    return bad, misses, detail


SYS_D = ("Ты отвечаешь на вопросы теста от лица человека, который рассказал о себе (его рассказ — в задании). "
         "Ты и есть этот человек: отвечай от первого лица так, как он сам о себе думает, — а не так, как правильно, "
         "красиво или как его видят со стороны. Это обычный человек, а не лучшая версия себя; противоречия в его "
         "рассказе не сглаживай. " + COMMON_SYS + " Ответ — только JSON.")
TASK_D = """Мой рассказ о себе:
«{selfdesc}»

Ниже {n} вопросов теста. Если вопрос о партнёре — представь, как ты поступил(а) бы или что чувствовал(а) бы в своих отношениях. По каждому вопросу выбери один вариант — его номер.

{questions}

Ответ — только JSON-объект по всем {n} вопросам, ключ — номер вопроса: {{"1": {{"ответ": 2}}, "2": {{"ответ": 5}}, ...}}. Где указано, что можно пропустить, можно ответить "ответ": "пропуск". Где указана отметка «Для меня это не обсуждается», добавь "не обсуждается": true или false."""

TASK_D_PRIO = """Мой рассказ о себе:
«{selfdesc}»

В тесте нужно выбрать {top} сфер отношений, самых важных для тебя: совпадение с партнёром в них будет весить втрое больше. Сферы:

{spheres}

Ответ — только JSON: {{"важные": [номера ровно {top} разных сфер]}}."""


def person_rng(pid):
    base = np.random.SeedSequence(MASTER_SEED).spawn(ANSWERER_ORDER_INDEX + 1)[ANSWERER_ORDER_INDEX]
    k = int(hashlib.sha256(pid.encode()).hexdigest()[:8], 16)
    return np.random.default_rng([int(base.generate_state(1)[0]), k])


def d_plan(pid, bank):
    rng = person_rng(pid)
    order = [int(i) for i in rng.permutation(len(bank))]
    rev = [bool(x) for x in rng.random(len(bank)) < 0.5]          # по индексу банка
    sphere_order = [int(i) for i in rng.permutation(len(PRIORITY_SPHERES))]
    sizes = [len(bank) // N_BATCHES + (1 if i < len(bank) % N_BATCHES else 0) for i in range(N_BATCHES)]
    batches, s = [], 0
    for z in sizes:
        batches.append(order[s:s + z])
        s += z
    return {"order": order, "reversed": rev, "batches": batches, "sphere_order": sphere_order}


def task_d(selfdesc, bank, idxs, rev):
    parts = []
    for n, i in enumerate(idxs, 1):
        q = bank[i]
        opts = list(reversed(q["options"])) if rev[i] else q["options"]
        lines = [f"Вопрос {n} [{BLOCK_TAG[q['block']]}]. {q['text']}"] + [f"  {j}) {o}" for j, o in enumerate(opts, 1)]
        if q.get("optional"):
            lines.append("  (этот вопрос можно пропустить)")
        if q.get("firm"):
            lines.append("  (под вопросом есть отметка «Для меня это не обсуждается»)")
        parts.append("\n".join(lines))
    return TASK_D.format(selfdesc=selfdesc, n=len(idxs), questions="\n\n".join(parts))


def validate_d(bank, idxs, rev):
    def v(text):
        obj = extract_json(text)
        out = {}
        for n, i in enumerate(idxs, 1):
            q = bank[i]
            a = obj.get(str(n))
            if not isinstance(a, dict) or "ответ" not in a:
                raise ValueError(f"нет ответа на {n}")
            val = a["ответ"]
            if val == "пропуск":
                if not q.get("optional"):
                    raise ValueError(f"пропуск у обязательного {n}")
                out[q["id"]] = "skipped"
                continue
            try:
                val = int(val)
            except (TypeError, ValueError):
                raise ValueError(f"ответ {n}: {val!r}")
            if not 1 <= val <= 5:
                raise ValueError(f"ответ {n} вне 1..5")
            orig = 6 - val if rev[i] else val           # обратно в номер варианта банка
            r = {"option": orig, "shown": val, "reversed": rev[i]}
            if q.get("firm"):
                f = a.get("не обсуждается", False)
                if not isinstance(f, bool):
                    raise ValueError(f"отметка {n}: {f!r}")
                r["firm"] = f
            elif a.get("не обсуждается"):
                raise ValueError(f"отметка «не обсуждается» у вопроса без неё ({n})")
            out[q["id"]] = r
        return out
    return v


def validate_prio(sphere_order):
    def v(text):
        obj = extract_json(text)
        nums = obj.get("важные")
        if not isinstance(nums, list) or len(nums) != PRIORITY_TOP:
            raise ValueError("не 5 сфер")
        try:
            nums = [int(x) for x in nums]
        except (TypeError, ValueError):
            raise ValueError("номера сфер")
        if len(set(nums)) != PRIORITY_TOP or not all(1 <= x <= len(sphere_order) for x in nums):
            raise ValueError("номера сфер вне списка или повтор")
        return [PRIORITY_SPHERES[sphere_order[x - 1]][0] for x in nums]
    return v


# ---------------------------------------------------------------- цепочки
def author_chain(role, pid, rec):
    """A (досье по truth) или B (самоописание по self) с проверкой C; до 3 попыток; «текст неверен»."""
    which = "truth" if role == "A" else "self"
    sysp, task = (SYS_A, TASK_A) if role == "A" else (SYS_B, TASK_B)
    outdir = os.path.join(TEXTS, "dossier" if role == "A" else "self")
    record = json.dumps(rec, ensure_ascii=False, indent=1)
    feedback, attempts = "", []
    for a in range(MAX_ATTEMPTS):
        prompt = task.format(record=record, feedback=feedback)
        text, raw_a = ask(role, pid, f"text{a}", sysp, prompt, ["text", a])
        restored, raw_c = ask("C", pid, f"{which}{a}", SYS_C, task_c(text), ["restore", which, a], validate_c)
        bad, misses, detail = compare(restored, rec, which)
        attempts.append({"attempt": a + 1, "text_sha256": sha(text), "words": len(text.split()), "bad": bad,
                         "misses": misses, "raw_author": os.path.relpath(raw_a, ROOT),
                         "raw_restorer": os.path.relpath(raw_c, ROOT)})
        write_file(os.path.join(TEXTS, "restore", f"{pid}.{'dossier' if role == 'A' else 'self'}.{a + 1}.json"),
                   {"text_sha256": sha(text), "bad": bad, "misses": misses, "fields": detail,
                    "raw_restorer": os.path.relpath(raw_c, ROOT)})
        if not bad:
            break
        feedback = FEEDBACK.format(fields=", ".join(misses) if misses else "дети")
    write_file(os.path.join(outdir, f"{pid}.md"), text + "\n")
    model, effort = MODEL.cfg[role]
    meta = {"id": pid, "role": role, "model": model, "effort": effort, "text_sha256": sha(text),
            "text_wrong": bad, "attempts": attempts, "restorer_model": MODEL.cfg["C"][0]}
    write_file(os.path.join(outdir, f"{pid}.json"), meta)
    return text, meta


def d_chain(pid, selfdesc, bank, ex):
    plan = d_plan(pid, bank)
    rev = plan["reversed"]
    futs = [ex.submit(ask, "D", pid, f"batch{b:02d}", SYS_D, task_d(selfdesc, bank, idxs, rev),
                      ["batch", b, sha(selfdesc)], validate_d(bank, idxs, rev))
            for b, idxs in enumerate(plan["batches"])]
    sph = "\n".join(f"{n}) {PRIORITY_SPHERES[i][1]}" for n, i in enumerate(plan["sphere_order"], 1))
    fut_p = ex.submit(ask, "D", pid, "priorities", SYS_D, TASK_D_PRIO.format(selfdesc=selfdesc, top=PRIORITY_TOP,
                                                                             spheres=sph),
                      ["priorities", sha(selfdesc)], validate_prio(plan["sphere_order"]))
    responses, raws = {}, []
    for f in futs:
        r, raw = f.result()
        responses.update(r)
        raws.append(os.path.relpath(raw, ROOT))
    prio, raw_p = fut_p.result()
    raws.append(os.path.relpath(raw_p, ROOT))
    missing = [q["id"] for q in bank if q["id"] not in responses]
    if missing:
        raise RuntimeError(f"D/{pid}: нет ответов на {missing}")
    model, effort = MODEL.cfg["D"]
    out = {"id": pid, "bank_version": BANK_VERSION, "model": model, "effort": effort,
           "selfdesc_sha256": sha(selfdesc),
           "note": "option — номер варианта банка 1..5 (1 = первый вариант, левый полюс); shown — номер, как показан D",
           "responses": {q["id"]: responses[q["id"]] for q in bank},
           "priorities": prio,
           "plan": {"seed": f"SeedSequence({MASTER_SEED}).spawn(13)[12] (answerer_order) + sha256(id)[:8]",
                    "batch_sizes": [len(b) for b in plan["batches"]], "sees_previous_answers": False,
                    "order": [bank[i]["id"] for i in plan["order"]],
                    "reversed": [bank[i]["id"] for i in range(len(bank)) if rev[i]]},
           "raw": raws}
    write_file(os.path.join(ANSWERS, f"{pid}.json"), out)
    return out


BANK_VERSION = None


def person(pid, roles, bank, ex, log):
    t0 = time.time()
    res = {"id": pid}
    truth = read_json(os.path.join(ROOT, "inputs", "truth", f"{pid}.json"))
    selfr = read_json(os.path.join(ROOT, "inputs", "self", f"{pid}.json"))
    fa = ex.submit(author_chain, "A", pid, truth) if "A" in roles else None
    if "B" in roles or "D" in roles:
        selfdesc, mb = author_chain("B", pid, selfr)
        res["self_text_wrong"] = mb["text_wrong"]
        if "D" in roles:
            d_chain(pid, selfdesc, bank, ex)
            res["answers"] = True
    if fa:
        _, ma = fa.result()
        res["dossier_text_wrong"] = ma["text_wrong"]
    res["seconds"] = round(time.time() - t0, 1)
    log(f"готово {pid}: {res}")
    return res


def write_prompts():
    tpl = {"SYS_A": SYS_A, "TASK_A": TASK_A, "SYS_B": SYS_B, "TASK_B": TASK_B, "FEEDBACK": FEEDBACK, "SYS_C": SYS_C,
           "TASK_C": TASK_C, "FIELDS_C": [[k, q, kind, lv] for k, q, kind, lv, _, _ in FIELDS], "SYS_D": SYS_D,
           "TASK_D": TASK_D, "TASK_D_PRIO": TASK_D_PRIO}
    body = {"design": "design.md, 16", "templates": tpl,
            "sha256": {k: sha(json.dumps(v, ensure_ascii=False)) for k, v in tpl.items()}}
    write_file(os.path.join(ROOT, "prompts", "roles.json"), body)


def main():
    global MODEL, NO_CALL, BANK_VERSION
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pilot", action="store_true")
    g.add_argument("--ids", nargs="+")
    g.add_argument("--all", action="store_true")
    ap.add_argument("--roles", default="A,B,C,D")
    ap.add_argument("--no-call", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    NO_CALL = args.no_call
    MODEL = Model()
    roles = set(args.roles.split(","))
    bankj = read_json(BANK)
    BANK_VERSION = bankj["version"]
    bank = bankj["questions"]
    if args.pilot:
        ids = [r["id"] for r in read_json(os.path.join(ROOT, "pilot", "pilot.json"))["pilot"]]
    elif args.ids:
        ids = args.ids
    else:
        ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, "inputs", "truth", "*.json")))
    for pid in ids:
        if not re.fullmatch(r"[a-z0-9]{4}", pid):
            raise SystemExit(f"плохой id {pid!r}")
    write_prompts()
    if args.dry_run:
        pid = ids[0]
        rec = read_json(os.path.join(ROOT, "inputs", "truth", f"{pid}.json"))
        print(TASK_A.format(record=json.dumps(rec, ensure_ascii=False, indent=1), feedback=""))
        plan = d_plan(pid, bank)
        print(task_d("<самоописание>", bank, plan["batches"][0], plan["reversed"]))
        print(task_c("<текст>"))
        return
    lock = threading.Lock()

    def log(msg):
        with lock:
            print(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

    t0 = time.time()
    log(f"люди: {ids}; роли: {sorted(roles)}; модели: {MODEL.cfg}")
    results = []
    with cf.ThreadPoolExecutor(max_workers=2 * len(ids) + 8) as ex:
        futs = {ex.submit(person, pid, roles, bank, ex, log): pid for pid in ids}
        for f in cf.as_completed(futs):
            try:
                results.append(f.result())
            except Exception as e:  # noqa: BLE001 — отчёт по человеку, прогон продолжается
                log(f"ОШИБКА {futs[f]}: {e!r}")
                results.append({"id": futs[f], "error": repr(e)})
    wall = round(time.time() - t0, 1)
    summary = {"finished": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "wall_seconds": wall,
               "ids": ids, "roles": sorted(roles), "models": MODEL.cfg, "stats": STATS, "people": results}
    os.makedirs(os.path.join(ROOT, "pilot"), exist_ok=True)
    write_file(os.path.join(ROOT, "pilot", f"run-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"), summary)
    log(json.dumps({"wall_seconds": wall, "stats": STATS}, ensure_ascii=False))
    if any("error" in r for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
