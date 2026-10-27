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
  4. в любом тексте — похожее на команду оболочки или чтение файла (cat/ls/head/grep/open(...)/*.json).
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
        for k, v in obj.items():
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
