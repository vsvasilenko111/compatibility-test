"""Проверка транскриптов LLM-ролей после запуска (ответ критику 2, п. 3; критик 3, п. 5; design.md, 13.1, 15.5).

  python3 research/blind/check_transcripts.py <файл или каталог> [...]
  python3 research/blind/check_transcripts.py --allow-text <файл> ...   — разрешить текстовый транскрипт (не рекомендуется)

Транскрипт — СЫРОЙ JSON API (.json — запрос и ответ или список сообщений; .jsonl — по объекту на строку), а не пересказ.
Нарушение (код выхода 1, партия текстов этой роли бракуется и переписывается):
  1. файл не разбирается как JSON (пересказ проверить нельзя) — если не задан --allow-text;
  2. в запросе передан непустой список инструментов (`tools`), или в любом месте есть блок вызова инструмента
     или его результата — по ТИПУ блока, независимо от имени инструмента (tool_use, server_tool_use, mcp_tool_use,
     *_tool_result, tool_calls, function_call);
  3. в любом тексте — следы обращения к закрытому: пути private/, sealed/, inputs/, имена people.json, selfreport.json,
     pairs.json, outcome*.json, model.json и др.;
  4. в любом тексте — похожее на команду оболочки или чтение файла (cat/ls/head/grep/open(...)/*.json);
  5. поток `claude -p --output-format stream-json --verbose` (design.md, 16.3): первой строкой — заявка исполнителя
     (type=runner_request, ordered_model); событие system/init ровно одно, в нём tools = [], mcp_servers = [],
     model = заказанной, cwd вне проекта; модель каждого ответа и modelUsage итога — заказанная; итог без ошибки,
     num_turns = 1. Поля cwd/original_cwd события init на шаблоны п. 3 не проверяются (временный каталог macOS
     лежит под /private/var/...).
"""
import json
import os
import re
import sys

SECRET = [r"research/blind", r"\bprivate/", r"\bsealed/", r"\binputs/(truth|self)", r"people\.json",
          r"selfreport\.json", r"pairs\.json", r"outcome[\w-]*\.json", r"model\.json", r"leak-threshold",
          r"benchmarks\.json", r"holdout-", r"report-private"]
SHELL = [r"(^|[\s`$;|&(])(cat|ls|head|tail|less|more|grep|rg|find|sed|awk|python3?|node|jq|cp|mv)\s+[-\w./*~]",
         r"\bopen\s*\(", r"\*\.json\b", r"\bfs\.read", r"\bsubprocess\b", r"\bos\.(listdir|walk|system)\b"]
RX = [(p, re.compile(p)) for p in SECRET] + [(p, re.compile(p, re.M)) for p in SHELL]
TOOL_BLOCK = re.compile(r"(^|_)tool_(use|result)$|^(tool_use|server_tool_use|mcp_tool_use|tool_result|function_call)$")
TOOL_KEYS = {"tool_calls", "function_call", "tool_use", "tool_result"}
PROJECT = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
INIT_PATH_KEYS = {"cwd", "original_cwd", "additional_directories"}


def files(args):
    for a in args:
        if os.path.isdir(a):
            for root, _, fs in os.walk(a):
                for f in sorted(fs):
                    yield os.path.join(root, f)
        else:
            yield a


def walk(obj, where, out):
    """Структурная проверка JSON: блоки инструментов по типу, непустые `tools`; тексты — на шаблоны."""
    if isinstance(obj, dict):
        t = obj.get("type")
        if isinstance(t, str) and TOOL_BLOCK.search(t):
            out.append(f"{where}: блок инструмента type={t!r}")
        is_init = t == "system" and obj.get("subtype") == "init"
        for k, v in obj.items():
            if is_init and k in INIT_PATH_KEYS:
                continue  # пути проверяет check_stream (вне проекта)
            if k == "tools" and v:
                out.append(f"{where}.tools: в запросе переданы инструменты")
            elif k in TOOL_KEYS and v:
                out.append(f"{where}.{k}: вызов инструмента")
            walk(v, f"{where}.{k}", out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, f"{where}[{i}]", out)
    elif isinstance(obj, str):
        for p, rx in RX:
            if rx.search(obj):
                out.append(f"{where}: {p}")
                break


def inside_project(p):
    if not isinstance(p, str) or not p:
        return False
    rp = os.path.realpath(p)
    return rp == PROJECT or rp.startswith(PROJECT + os.sep)


def check_stream(events, path, out):
    """Поток stream-json одного вызова роли (design.md, 16.3)."""
    if not isinstance(events, list) or not any(isinstance(e, dict) and e.get("type") in ("runner_request", "system")
                                               for e in events):
        return
    req = [e for e in events if isinstance(e, dict) and e.get("type") == "runner_request"]
    inits = [e for e in events if isinstance(e, dict) and e.get("type") == "system" and e.get("subtype") == "init"]
    results = [e for e in events if isinstance(e, dict) and e.get("type") == "result"]
    if len(req) != 1 or not req[0].get("ordered_model"):
        out.append(f"{path}: нет заявки исполнителя (runner_request с ordered_model) — заказанную модель не сверить")
        return
    want = req[0]["ordered_model"]
    if len(inits) != 1:
        out.append(f"{path}: событий system/init {len(inits)}, нужно ровно одно")
    for e in inits:
        if e.get("tools") != []:
            out.append(f"{path}: init.tools = {e.get('tools')!r}, нужно []")
        if e.get("mcp_servers") != []:
            out.append(f"{path}: init.mcp_servers = {e.get('mcp_servers')!r}, нужно []")
        if e.get("model") != want:
            out.append(f"{path}: init.model = {e.get('model')!r}, заказана {want!r}")
        for k in ("cwd", "original_cwd"):
            if inside_project(e.get(k)):
                out.append(f"{path}: init.{k} внутри проекта: {e.get(k)!r}")
        for d in e.get("additional_directories") or []:
            out.append(f"{path}: init.additional_directories не пуст: {d!r}")
    for e in events:
        if isinstance(e, dict) and e.get("type") == "assistant":
            m = (e.get("message") or {}).get("model")
            if m != want:
                out.append(f"{path}: ответ от модели {m!r}, заказана {want!r}")
    if len(results) != 1:
        out.append(f"{path}: итоговых событий result {len(results)}, нужно одно")
    for e in results:
        if e.get("is_error") or e.get("subtype") != "success":
            out.append(f"{path}: итог с ошибкой (subtype={e.get('subtype')!r})")
        if e.get("num_turns") != 1:
            out.append(f"{path}: num_turns = {e.get('num_turns')!r}, нужно 1")
        used = set((e.get("modelUsage") or {}).keys())
        if used != {want}:
            out.append(f"{path}: modelUsage = {sorted(used)}, заказана {want!r}")


def load_json(raw, path):
    if path.endswith(".jsonl"):
        return [json.loads(x) for x in raw.splitlines() if x.strip()]
    return json.loads(raw)


def check(path, allow_text):
    with open(path, encoding="utf-8", errors="replace") as f:
        raw = f.read()
    out = []
    try:
        obj = load_json(raw, path)
    except ValueError:
        if not allow_text:
            return [f"{path}: не сырой JSON API — пересказ транскрипта не принимается"]
        for ln, line in enumerate(raw.splitlines(), 1):
            for p, rx in RX + [(r"\btool_use\b", re.compile(r"\btool_use\b"))]:
                if rx.search(line):
                    out.append(f"{path}:{ln}: {p}")
                    break
        return out
    walk(obj, path, out)
    check_stream(obj, path, out)
    return out


def main():
    args = sys.argv[1:]
    allow_text = "--allow-text" in args
    args = [a for a in args if a != "--allow-text"]
    if not args:
        raise SystemExit(__doc__)
    hits = []
    for path in files(args):
        hits += check(path, allow_text)
    for h in hits:
        print(h)
    print("нарушений нет" if not hits else f"НАРУШЕНИЙ: {len(hits)}")
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    main()
