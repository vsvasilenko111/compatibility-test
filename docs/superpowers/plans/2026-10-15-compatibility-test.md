# Тест совместимости «Отношения и дружба» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Статический сайт: человек проходит тест, отправляет ссылку, второй проходит тот же тест и видит совместимость в отношениях и в дружбе.

**Architecture:** Vite + TypeScript без UI-фреймворка, сервера нет. Чистые модули `scoring` (подсчёт), `codec` (ответы ⇄ ссылка), `questions` (банк + манифест версий), `storage` (прогресс в `localStorage`) тестируются Vitest. Над ними тонкий слой `ui`: экраны на DOM и маршрутизация по `location.hash`.

**Tech Stack:** Node 20, TypeScript 5.6, Vite 5.4, Vitest 2.1, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-15-compatibility-test-design.md`

**Объём этого плана:** этапы 1, 2 и 4 спецификации: движок, интерфейс и публикация на **банке-заглушке из 12 вопросов**. Полный банк (≈116 вопросов, этап 3) — отдельный контентный шаг после этого плана. Он меняет только `src/questions/bank.json` и `manifest.json`, а проверяется тестом из Task 5.

## Global Constraints

- Шкала ответа 0–10; диапазон по умолчанию `±2` от своего ответа, обрезанный до 0..10.
- Важность: 4 уровня, веса `0 / 1 / 10 / 50`; не больше **12** «критично» на тест.
- `fit = max(0, 1 − d/3)`; итог `√(S_A·S_B)·100`; `Σw = 0` у одного → его `S = 1`; у обоих → `null` («не принципиально»).
- Сила: только при `(a−5)(b−5) > 0`; `k = (|a−5|+|b−5|)/2`; `убеждённость = 1 − (1 − k/5)²`; `близость = max(0, 1 − |a−b|/4)`; `сила = убеждённость·близость·min(fitA, fitB)`.
- 🔴: `w = 50` и `fit = 0`, показываются все. 🌟: `сила ≥ 0,8`, у обоих `w ≥ 10`. 🟢: `0,5 ≤ сила < 0,8`, у обоих `w ≥ 10`. 🟠: `w ≥ 10` и `fit < 1`, не 🔴. Топ-5 в каждом блоке, кроме 🔴.
- «Дружба» считается только по `block === 'friendship'`; «Отношения» — по всем вопросам.
- Вопрос, пропущенный (или отсутствующий) хотя бы у одного, исключается для обоих.
- Код: 14 бит на вопрос; ответ `15` = пропущен; заголовок `формат(1) · банк(1) · тип(1) · длина имени(1) · имя(≤40 байт)`; CRC-16; XOR-гамма; base64url; длина кода ≤ **340** символов при 116 вопросах.
- Конкретные ответы партнёра в интерфейсе не показываются никогда — только `topic`.
- Все тексты интерфейса на русском; вёрстка сначала для телефона (ширина от 360 px).

## Review Focus

1. **Имя из кириллицы или эмодзи** — обрезается до 40 байт по границе символа, ссылка не длиннее 340 символов, имя декодируется без «битых» символов (Task 4).
2. **Ссылка, искажённая мессенджером** (точка или скобка в конце, перенос строки, `%0A`) — мусорные символы отбрасываются; обрезанная ссылка даёт «Ссылка повреждена», а не падение (Task 4, Task 7).
3. **Человек открыл свою же ссылку** — видит «Это ваша ссылка — отправьте её партнёру», а не начинает тест сам с собой (Task 7).
4. **Один пропустил деликатный вопрос** — вопрос исключается для обоих, процент не проседает (Task 3).
5. **Коды от разных версий банка** — сравнение по пересечению `id`, без ошибки (Task 3, Task 4).

---

## Структура файлов

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
.github/workflows/deploy.yml
src/
  types.ts                  — общие типы и константы
  scoring/primitives.ts     — weight, fit, strength
  scoring/compare.ts        — compare(): проценты, сферы, флаги, награды
  codec/bits.ts             — BitWriter / BitReader
  codec/crc16.ts            — CRC-16/CCITT-FALSE
  codec/base64url.ts        — base64url
  codec/codec.ts            — encode / decode / seal / CodecError
  questions/spheres.ts      — список сфер с блоками и подписями
  questions/bank.json       — банк вопросов (порядок = порядок показа)
  questions/manifest.json   — версия банка → упорядоченный список id
  questions/validate.ts     — validateBank()
  questions/index.ts        — QUESTIONS, BANK_VERSION, MANIFEST, CURRENT_IDS
  storage.ts                — createStore(), browserStorage()
  router.ts                 — parseHash, inviteUrl, resultUrl, classifyInvite
  ui/answer-logic.ts        — черновик ответа, диапазон, лимит «критично»
  ui/plural.ts              — русские окончания
  ui/verdict.ts             — итоговая фраза результата
  ui/dom.ts                 — хелпер h()
  ui/share.ts               — блок «Поделиться / Скопировать»
  ui/screens/intro.ts, question.ts, finish.ts, result.ts, message.ts
  ui/app.ts                 — контроллер экранов
  main.ts, styles.css
tests/                      — *.test.ts на каждый чистый модуль
```

---

### Task 1: Каркас проекта и общие типы

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/types.ts`, `src/main.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Produces (`src/types.ts`): `Block`, `Question`, `ImportanceLevel`, `IMPORTANCE_WEIGHTS`, `IMPORTANCE_LABELS`, `MAX_CRITICAL`, `Answer`, `Response`, `Profile` — точные определения ниже.

- [ ] **Step 1: Создать конфигурацию**

`package.json`:
```json
{
  "name": "compatibility-test",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: { environment: 'node' },
});
```

`index.html`:
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Тест совместимости</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
```

`src/main.ts` (временно, заменяется в Task 8):
```ts
document.getElementById('app')!.textContent = 'Тест совместимости';
```

- [ ] **Step 2: Установить зависимости**

Run: `npm install -D vite@5.4.10 vitest@2.1.4 typescript@5.6.3`
Expected: `added N packages`, без ошибок.

- [ ] **Step 3: Написать падающий тест**

`tests/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { IMPORTANCE_WEIGHTS, IMPORTANCE_LABELS, MAX_CRITICAL } from '../src/types';

describe('types', () => {
  it('веса важности 0/1/10/50 и 4 подписи', () => {
    expect(IMPORTANCE_WEIGHTS).toEqual([0, 1, 10, 50]);
    expect(IMPORTANCE_LABELS).toHaveLength(4);
    expect(MAX_CRITICAL).toBe(12);
  });
});
```

- [ ] **Step 4: Убедиться, что тест падает**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — `Failed to resolve import "../src/types"`.

- [ ] **Step 5: Написать `src/types.ts`**

```ts
export type Block = 'friendship' | 'relationship';

export interface Question {
  id: string;
  block: Block;
  sphere: string;
  text: string;
  left: string;
  right: string;
  topic: string;
  optional: boolean;
}

export type ImportanceLevel = 0 | 1 | 2 | 3;
export const IMPORTANCE_WEIGHTS = [0, 1, 10, 50] as const;
export const IMPORTANCE_LABELS = ['Не важно', 'Немного', 'Очень', 'Критично'] as const;
export const MAX_CRITICAL = 12;

export interface Answer {
  value: number; // 0..10
  lo: number; // 0..10, lo <= hi
  hi: number;
  importance: ImportanceLevel;
}

export type Response = Answer | 'skipped';

export interface Profile {
  name: string;
  bankVersion: number;
  responses: Record<string, Response>;
}
```

- [ ] **Step 6: Прогнать тесты и сборку**

Run: `npm test && npm run build`
Expected: `1 passed`; сборка создаёт `dist/index.html` без ошибок TypeScript.

- [ ] **Step 7: Commit**

```bash
git branch -M main
git add -A
git commit -m "chore: каркас Vite + TypeScript + Vitest, общие типы"
```

---

### Task 2: Примитивы подсчёта — weight, fit, strength

**Files:**
- Create: `src/scoring/primitives.ts`
- Test: `tests/primitives.test.ts`

**Interfaces:**
- Consumes: `Answer`, `IMPORTANCE_WEIGHTS` из `src/types.ts`.
- Produces: `weight(a: Answer): number`, `fit(own: Answer, otherValue: number): number`, `strength(a: Answer, b: Answer): number`.

- [ ] **Step 1: Написать падающие тесты**

`tests/primitives.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fit, strength, weight } from '../src/scoring/primitives';
import type { Answer, ImportanceLevel } from '../src/types';

const ans = (value: number, lo = 0, hi = 10, importance: ImportanceLevel = 2): Answer => ({
  value, lo, hi, importance,
});

describe('weight', () => {
  it('переводит уровень в вес 0/1/10/50', () => {
    expect([0, 1, 2, 3].map((i) => weight(ans(5, 0, 10, i as ImportanceLevel)))).toEqual([0, 1, 10, 50]);
  });
});

describe('fit', () => {
  const own = ans(2, 0, 4);
  it.each([
    [0, 1], [4, 1], [5, 2 / 3], [6, 1 / 3], [7, 0], [10, 0],
  ])('ответ %i при диапазоне [0,4] → %f', (other, expected) => {
    expect(fit(own, other)).toBeCloseTo(expected, 5);
  });
  it('штраф симметричен слева от диапазона', () => {
    expect(fit(ans(8, 6, 10), 5)).toBeCloseTo(2 / 3, 5);
  });
});

describe('strength — эталонная таблица спецификации (fit = 1)', () => {
  it.each([
    [10, 10, 1.0], [9, 9, 0.96], [8, 8, 0.84], [10, 9, 0.7425], [9, 8, 0.6825],
    [7, 7, 0.64], [8, 7, 0.5625], [10, 8, 0.48], [9, 7, 0.42], [6, 6, 0.36],
    [0, 0, 1.0], [2, 2, 0.84],
  ])('%i и %i → %f', (a, b, expected) => {
    expect(strength(ans(a), ans(b))).toBeCloseTo(expected, 4);
  });

  it.each([[5, 5], [2, 8], [0, 10], [5, 9], [4, 6]])('%i и %i → 0 (центр или разные стороны)', (a, b) => {
    expect(strength(ans(a), ans(b))).toBe(0);
  });

  it('умножается на меньший fit', () => {
    // b=8 вне диапазона a [10,10] на 2 деления → fitA = 1/3
    expect(strength(ans(10, 10, 10), ans(8))).toBeCloseTo(0.48 / 3, 4);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/primitives.test.ts`
Expected: FAIL — `Failed to resolve import "../src/scoring/primitives"`.

- [ ] **Step 3: Реализовать `src/scoring/primitives.ts`**

```ts
import { IMPORTANCE_WEIGHTS, type Answer } from '../types';

export function weight(a: Answer): number {
  return IMPORTANCE_WEIGHTS[a.importance];
}

/** Насколько ответ другого (otherValue) попадает в мой приемлемый диапазон: 1 внутри, −1/3 за каждое деление снаружи. */
export function fit(own: Answer, otherValue: number): number {
  const d = Math.max(0, own.lo - otherValue, otherValue - own.hi);
  return Math.max(0, 1 - d / 3);
}

/** Сила совпадения для наград. На процент совместимости не влияет. */
export function strength(a: Answer, b: Answer): number {
  if ((a.value - 5) * (b.value - 5) <= 0) return 0;
  const k = (Math.abs(a.value - 5) + Math.abs(b.value - 5)) / 2;
  const conviction = 1 - (1 - k / 5) ** 2;
  const closeness = Math.max(0, 1 - Math.abs(a.value - b.value) / 4);
  return conviction * closeness * Math.min(fit(a, b.value), fit(b, a.value));
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/primitives.test.ts`
Expected: PASS, все кейсы.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/primitives.ts tests/primitives.test.ts
git commit -m "feat(scoring): fit, strength и веса важности"
```

---

### Task 3: compare — проценты, сферы, флаги и награды

**Files:**
- Create: `src/scoring/compare.ts`
- Test: `tests/compare.test.ts`

**Interfaces:**
- Consumes: `fit`, `strength`, `weight` (Task 2); `Question`, `Profile`, `Answer` (Task 1).
- Produces:
  ```ts
  interface ItemRef { id: string; topic: string; sphere: string }
  interface SphereScore { sphere: string; percent: number | null }
  interface ModeResult {
    percent: number | null; spheres: SphereScore[];
    redFlags: ItemRef[]; superMatches: ItemRef[]; strongMatches: ItemRef[]; talkZones: ItemRef[];
    superCount: number; flexibleCount: number;
  }
  interface CompareResult { relationship: ModeResult; friendship: ModeResult }
  const TOP_N = 5
  function compare(questions: Question[], a: Profile, b: Profile): CompareResult
  ```
  `percent` — число 0..100 без округления.

- [ ] **Step 1: Написать падающие тесты**

`tests/compare.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { compare } from '../src/scoring/compare';
import type { Answer, ImportanceLevel, Profile, Question } from '../src/types';

const q = (id: string, block: Question['block'], sphere: string): Question => ({
  id, block, sphere, text: id, left: 'L', right: 'R', topic: `topic-${id}`, optional: false,
});
const ans = (value: number, lo: number, hi: number, importance: ImportanceLevel): Answer => ({
  value, lo, hi, importance,
});
const profile = (responses: Profile['responses']): Profile => ({ name: '', bankVersion: 1, responses });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

const QS = [
  q('kids', 'relationship', 'kids'),
  q('money', 'friendship', 'money'),
  q('conf', 'friendship', 'conflicts'),
  q('home', 'relationship', 'home'),
  q('space', 'relationship', 'space'),
];
const anya = () => profile({
  kids: ans(10, 9, 10, 3), money: ans(2, 0, 4, 2), conf: ans(9, 7, 10, 2),
  home: ans(4, 2, 6, 1), space: ans(8, 7, 10, 2),
});
const misha = () => profile({
  kids: ans(9, 5, 10, 2), money: ans(8, 0, 10, 1), conf: ans(3, 0, 10, 2),
  home: ans(6, 4, 8, 1), space: ans(8, 6, 10, 1),
});

describe('compare — пример Ани и Миши', () => {
  const r = compare(QS, anya(), misha());

  it('отношения = √(61/81 · 1) ≈ 86,78%', () => {
    expect(r.relationship.percent).toBeCloseTo(86.78, 1);
  });
  it('дружба считается только по блоку friendship → 0%', () => {
    expect(r.friendship.percent).toBeCloseTo(0, 5);
    expect(r.friendship.spheres.map((s) => s.sphere)).toEqual(['money', 'conflicts']);
  });
  it('зоны для разговора — деньги и ссоры, флагов нет', () => {
    expect(ids(r.relationship.talkZones)).toEqual(['money', 'conf']);
    expect(r.relationship.redFlags).toEqual([]);
  });
  it('дети 10/9 при важности 50 и 10 → сильное совпадение', () => {
    expect(ids(r.relationship.strongMatches)).toEqual(['kids']);
    expect(r.relationship.superMatches).toEqual([]);
    expect(r.relationship.superCount).toBe(0);
  });
  it('жильё 4/6 — оба гибкие', () => {
    expect(r.relationship.flexibleCount).toBe(1);
  });
  it('ItemRef несёт topic и сферу, а не ответы', () => {
    expect(r.relationship.talkZones[0]).toEqual({ id: 'money', topic: 'topic-money', sphere: 'money' });
  });
});

describe('compare — граничные случаи', () => {
  it('критичное расхождение → красный флаг и ≈36,85%', () => {
    const m = misha();
    m.responses.kids = ans(0, 0, 10, 2);
    const r = compare(QS, anya(), m);
    expect(ids(r.relationship.redFlags)).toEqual(['kids']);
    expect(r.relationship.percent).toBeCloseTo(36.85, 1);
    expect(ids(r.relationship.talkZones)).not.toContain('kids');
  });

  it('пропущенный одним вопрос исключается для обоих', () => {
    const m = misha();
    m.responses.money = 'skipped';
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(92.69, 1);
  });

  it('вопрос, которого нет в коде другого (старая версия банка), исключается', () => {
    const m = misha();
    delete m.responses.space;
    expect(compare(QS, anya(), m).relationship.percent).toBeCloseTo(84.75, 1);
  });

  it('у обоих все веса 0 → null, и у сфер тоже null', () => {
    const zero = profile(Object.fromEntries(QS.map((x) => [x.id, ans(5, 0, 10, 0)])));
    const r = compare(QS, zero, zero);
    expect(r.relationship.percent).toBeNull();
    expect(r.relationship.spheres.every((s) => s.percent === null)).toBe(true);
  });

  it('у одного все веса 0 → его S = 1', () => {
    const zero = profile(Object.fromEntries(QS.map((x) => [x.id, ans(5, 0, 10, 0)])));
    expect(compare(QS, zero, misha()).relationship.percent).toBeCloseTo(100, 5);
  });

  it('супер-совпадения: считаются все, показываются топ-5 по силе·весу', () => {
    const qs = Array.from({ length: 7 }, (_, i) => q(`h${i}`, 'friendship', i % 2 ? 'humor' : 'leisure'));
    const a = profile(Object.fromEntries(qs.map((x, i) => [x.id, ans(i < 2 ? 10 : 9, 0, 10, 2)])));
    const r = compare(qs, a, a);
    expect(r.friendship.superCount).toBe(7);
    expect(r.friendship.superMatches).toHaveLength(5);
    expect(ids(r.friendship.superMatches).slice(0, 2)).toEqual(['h0', 'h1']);
  });
});
```

Проверка ожидаемых чисел:
- база: `S_A = (50+0+0+1+10)/81 = 61/81`, `S_B = 23/23`, `√0,7531 = 0,8678`;
- флаг: `S_A = 11/81`, `√0,1358 = 0,3685`;
- пропуск денег: `S_A = 61/71`, `√0,8592 = 0,9269`;
- без `space`: `S_A = 51/71`, `√0,7183 = 0,8475`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/compare.test.ts`
Expected: FAIL — `Failed to resolve import "../src/scoring/compare"`.

- [ ] **Step 3: Реализовать `src/scoring/compare.ts`**

```ts
import type { Answer, Profile, Question } from '../types';
import { fit, strength, weight } from './primitives';

export interface ItemRef { id: string; topic: string; sphere: string }
export interface SphereScore { sphere: string; percent: number | null }
export interface ModeResult {
  percent: number | null;
  spheres: SphereScore[];
  redFlags: ItemRef[];
  superMatches: ItemRef[];
  strongMatches: ItemRef[];
  talkZones: ItemRef[];
  superCount: number;
  flexibleCount: number;
}
export interface CompareResult { relationship: ModeResult; friendship: ModeResult }

export const TOP_N = 5;
const CRITICAL = 50;
const CARES = 10;

interface Pair {
  q: Question; a: Answer; b: Answer;
  wA: number; wB: number; fitA: number; fitB: number; s: number;
}

function pairs(questions: Question[], pa: Profile, pb: Profile): Pair[] {
  const out: Pair[] = [];
  for (const q of questions) {
    const a = pa.responses[q.id];
    const b = pb.responses[q.id];
    if (!a || !b || a === 'skipped' || b === 'skipped') continue;
    out.push({
      q, a, b, wA: weight(a), wB: weight(b),
      fitA: fit(a, b.value), fitB: fit(b, a.value), s: strength(a, b),
    });
  }
  return out;
}

function percent(ps: Pair[]): number | null {
  let numA = 0, sumA = 0, numB = 0, sumB = 0;
  for (const p of ps) {
    numA += p.wA * p.fitA; sumA += p.wA;
    numB += p.wB * p.fitB; sumB += p.wB;
  }
  if (sumA === 0 && sumB === 0) return null;
  const sA = sumA === 0 ? 1 : numA / sumA;
  const sB = sumB === 0 ? 1 : numB / sumB;
  return Math.sqrt(sA * sB) * 100;
}

const ref = (p: Pair): ItemRef => ({ id: p.q.id, topic: p.q.topic, sphere: p.q.sphere });
const desc = (key: (p: Pair) => number) => (x: Pair, y: Pair) => key(y) - key(x);
const isRed = (p: Pair) => (p.wA === CRITICAL && p.fitA === 0) || (p.wB === CRITICAL && p.fitB === 0);
const bothCare = (p: Pair) => p.wA >= CARES && p.wB >= CARES;
const award = (p: Pair) => p.s * (p.wA + p.wB);

function mode(ps: Pair[]): ModeResult {
  const supers = ps.filter((p) => bothCare(p) && p.s >= 0.8).sort(desc(award));
  const strongs = ps.filter((p) => bothCare(p) && p.s >= 0.5 && p.s < 0.8).sort(desc(award));
  const talks = ps
    .filter((p) => !isRed(p) && ((p.wA >= CARES && p.fitA < 1) || (p.wB >= CARES && p.fitB < 1)))
    .sort(desc((p) => p.wA * (1 - p.fitA) + p.wB * (1 - p.fitB)));
  const reds = ps.filter(isRed).sort(desc((p) => p.wA + p.wB));
  const flexible = ps.filter(
    (p) => Math.abs(p.a.value - 5) <= 1 && Math.abs(p.b.value - 5) <= 1 && p.fitA === 1 && p.fitB === 1,
  );
  const sphereIds = [...new Set(ps.map((p) => p.q.sphere))];

  return {
    percent: percent(ps),
    spheres: sphereIds.map((sphere) => ({ sphere, percent: percent(ps.filter((p) => p.q.sphere === sphere)) })),
    redFlags: reds.map(ref),
    superMatches: supers.slice(0, TOP_N).map(ref),
    strongMatches: strongs.slice(0, TOP_N).map(ref),
    talkZones: talks.slice(0, TOP_N).map(ref),
    superCount: supers.length,
    flexibleCount: flexible.length,
  };
}

export function compare(questions: Question[], a: Profile, b: Profile): CompareResult {
  const all = pairs(questions, a, b);
  return {
    relationship: mode(all),
    friendship: mode(all.filter((p) => p.q.block === 'friendship')),
  };
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/compare.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/compare.ts tests/compare.test.ts
git commit -m "feat(scoring): compare — проценты, сферы, флаги и награды"
```

---

### Task 4: Кодек ссылки

**Files:**
- Create: `src/codec/bits.ts`, `src/codec/crc16.ts`, `src/codec/base64url.ts`, `src/codec/codec.ts`
- Test: `tests/codec-parts.test.ts`, `tests/codec.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Response`, `ImportanceLevel` (Task 1).
- Produces:
  ```ts
  type Manifest = Record<number, string[]>
  type CodecErrorKind = 'corrupt' | 'unsupported-format' | 'unknown-bank'
  class CodecError extends Error { kind: CodecErrorKind }
  const MAX_NAME_BYTES = 40
  function truncateName(name: string): string
  function encode(profile: Profile, ids: string[]): string
  function decode(code: string, manifest: Manifest): Profile   // бросает CodecError
  function seal(body: Uint8Array): string                       // CRC + XOR + base64url
  ```
  Неотвеченные и пропущенные вопросы после декодирования имеют значение `'skipped'`.

- [ ] **Step 1: Написать падающие тесты на составные части**

`tests/codec-parts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { BitReader, BitWriter } from '../src/codec/bits';
import { crc16 } from '../src/codec/crc16';
import { fromBase64Url, toBase64Url } from '../src/codec/base64url';

describe('bits', () => {
  it('записывает и читает поля произвольной ширины', () => {
    const w = new BitWriter();
    w.write(10, 4); w.write(3, 2); w.write(255, 8); w.write(1, 1);
    const r = new BitReader(w.finish());
    expect([r.read(4), r.read(2), r.read(8), r.read(1)]).toEqual([10, 3, 255, 1]);
  });
  it('чтение за пределами данных бросает RangeError', () => {
    expect(() => new BitReader(new Uint8Array([1])).read(9)).toThrow(RangeError);
  });
});

describe('crc16', () => {
  it('CCITT-FALSE: "123456789" → 0x29B1', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });
});

describe('base64url', () => {
  it('прямой и обратный проход без + / =', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const s = toBase64Url(bytes);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });
  it('недопустимые символы → ошибка', () => {
    expect(() => fromBase64Url('ab+c')).toThrow();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/codec-parts.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать составные части**

`src/codec/bits.ts`:
```ts
export class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private n = 0;

  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >> i) & 1);
      if (++this.n === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.n = 0;
      }
    }
  }

  writeBytes(data: Uint8Array): void {
    for (const b of data) this.write(b, 8);
  }

  finish(): Uint8Array {
    if (this.n > 0) {
      this.bytes.push(this.cur << (8 - this.n));
      this.cur = 0;
      this.n = 0;
    }
    return Uint8Array.from(this.bytes);
  }
}

export class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}

  read(bits: number): number {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3];
      if (byte === undefined) throw new RangeError('BitReader: данные закончились');
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }

  readBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.read(8);
    return out;
  }
}
```

`src/codec/crc16.ts`:
```ts
/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF. */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}
```

`src/codec/base64url.ts`:
```ts
export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('base64url: недопустимые символы');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
```

- [ ] **Step 4: Прогнать тесты частей**

Run: `npx vitest run tests/codec-parts.test.ts`
Expected: PASS.

- [ ] **Step 5: Написать падающие тесты кодека**

`tests/codec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CodecError, decode, encode, seal, truncateName } from '../src/codec/codec';
import type { ImportanceLevel, Profile } from '../src/types';

const IDS = Array.from({ length: 116 }, (_, i) => `q${i}`);
const MANIFEST = { 1: IDS };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function randomProfile(seed: number, name = 'Аня'): Profile {
  const r = rng(seed);
  const responses: Profile['responses'] = {};
  for (const id of IDS) {
    if (r() < 0.05) { responses[id] = 'skipped'; continue; }
    const value = Math.floor(r() * 11);
    const lo = Math.floor(r() * (value + 1));
    const hi = value + Math.floor(r() * (11 - value));
    responses[id] = { value, lo, hi, importance: Math.floor(r() * 4) as ImportanceLevel };
  }
  return { name, bankVersion: 1, responses };
}

const kindOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof CodecError ? e.kind : 'other'; }
  return 'no-error';
};

describe('codec', () => {
  it('прямой и обратный проход на 20 случайных профилях', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = randomProfile(seed);
      expect(decode(encode(p, IDS), MANIFEST)).toEqual(p);
    }
  });

  it('116 вопросов и длинное кириллическое имя → не длиннее 340 символов', () => {
    const code = encode(randomProfile(7, 'Александра-Анастасия'), IDS);
    expect(code.length).toBeLessThanOrEqual(340);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('имя из эмодзи обрезается до 40 байт по границе символа', () => {
    expect(truncateName('🌸'.repeat(15))).toBe('🌸'.repeat(10));
    const p = randomProfile(3, '🌸'.repeat(15));
    expect(decode(encode(p, IDS), MANIFEST).name).toBe('🌸'.repeat(10));
  });

  it('неотвеченные вопросы декодируются как skipped', () => {
    const p: Profile = { name: '', bankVersion: 1, responses: { q0: { value: 3, lo: 1, hi: 5, importance: 2 } } };
    const d = decode(encode(p, IDS), MANIFEST);
    expect(d.responses.q0).toEqual({ value: 3, lo: 1, hi: 5, importance: 2 });
    expect(d.responses.q1).toBe('skipped');
  });

  it('замена любого символа (кроме последнего) ловится как corrupt', () => {
    const code = encode(randomProfile(11), IDS);
    for (let i = 0; i < code.length - 1; i++) {
      const swapped = code[i] === 'A' ? 'B' : 'A';
      const broken = code.slice(0, i) + swapped + code.slice(i + 1);
      expect(kindOf(() => decode(broken, MANIFEST))).toBe('corrupt');
    }
  });

  it('обрезанная ссылка, пустая строка и мусор → corrupt', () => {
    const code = encode(randomProfile(5), IDS);
    expect(kindOf(() => decode(code.slice(0, 100), MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('hello', MANIFEST))).toBe('corrupt');
    expect(kindOf(() => decode('ab+c', MANIFEST))).toBe('corrupt');
  });

  it('неизвестная версия формата → unsupported-format', () => {
    expect(kindOf(() => decode(seal(Uint8Array.from([2, 1, 0, 0])), MANIFEST))).toBe('unsupported-format');
  });

  it('неизвестная версия банка → unknown-bank', () => {
    const p = { ...randomProfile(2), bankVersion: 9 };
    expect(kindOf(() => decode(encode(p, IDS), MANIFEST))).toBe('unknown-bank');
  });

  it('код старой версии банка декодируется по её списку id', () => {
    const oldIds = IDS.slice(0, 10);
    const p: Profile = { name: 'Миша', bankVersion: 1, responses: { q3: { value: 8, lo: 6, hi: 10, importance: 3 } } };
    const d = decode(encode(p, oldIds), { 1: oldIds, 2: ['new-1', ...IDS] });
    expect(d.bankVersion).toBe(1);
    expect(d.responses.q3).toEqual({ value: 8, lo: 6, hi: 10, importance: 3 });
    expect(Object.keys(d.responses)).toHaveLength(10);
  });
});
```

- [ ] **Step 6: Убедиться, что тесты падают**

Run: `npx vitest run tests/codec.test.ts`
Expected: FAIL — `Failed to resolve import "../src/codec/codec"`.

- [ ] **Step 7: Реализовать `src/codec/codec.ts`**

```ts
import type { Answer, ImportanceLevel, Profile } from '../types';
import { fromBase64Url, toBase64Url } from './base64url';
import { BitReader, BitWriter } from './bits';
import { crc16 } from './crc16';

export const FORMAT_VERSION = 1;
export const TEST_TYPE_RELATIONSHIP = 0;
export const MAX_NAME_BYTES = 40;
const SKIPPED = 15;

export type Manifest = Record<number, string[]>;
export type CodecErrorKind = 'corrupt' | 'unsupported-format' | 'unknown-bank';

export class CodecError extends Error {
  constructor(public readonly kind: CodecErrorKind) {
    super(kind);
    this.name = 'CodecError';
  }
}

const encoder = new TextEncoder();

/** Обрезает имя до MAX_NAME_BYTES байт UTF-8, не разрывая символы. */
export function truncateName(name: string): string {
  let out = '';
  for (const ch of Array.from(name.trim())) {
    if (encoder.encode(out + ch).length > MAX_NAME_BYTES) break;
    out += ch;
  }
  return out;
}

/** Фиксированная гамма xorshift32: скрывает содержимое, но не защищает его. */
function xorStream(bytes: Uint8Array): Uint8Array {
  let x = 0x9e3779b9;
  return bytes.map((b) => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return b ^ (x & 0xff);
  });
}

export function seal(body: Uint8Array): string {
  const crc = crc16(body);
  const full = new Uint8Array(body.length + 2);
  full.set(body);
  full[body.length] = crc >> 8;
  full[body.length + 1] = crc & 0xff;
  return toBase64Url(xorStream(full));
}

export function encode(profile: Profile, ids: string[]): string {
  const name = encoder.encode(truncateName(profile.name));
  const w = new BitWriter();
  w.write(FORMAT_VERSION, 8);
  w.write(profile.bankVersion, 8);
  w.write(TEST_TYPE_RELATIONSHIP, 8);
  w.write(name.length, 8);
  w.writeBytes(name);
  for (const id of ids) {
    const r = profile.responses[id];
    if (!r || r === 'skipped') {
      w.write(SKIPPED, 4); w.write(0, 4); w.write(0, 4); w.write(0, 2);
    } else {
      w.write(r.value, 4); w.write(r.lo, 4); w.write(r.hi, 4); w.write(r.importance, 2);
    }
  }
  return seal(w.finish());
}

export function decode(code: string, manifest: Manifest): Profile {
  let full: Uint8Array;
  try {
    full = xorStream(fromBase64Url(code));
  } catch {
    throw new CodecError('corrupt');
  }
  if (full.length < 6) throw new CodecError('corrupt');
  const body = full.subarray(0, full.length - 2);
  const crc = (full[full.length - 2] << 8) | full[full.length - 1];
  if (crc16(body) !== crc) throw new CodecError('corrupt');

  try {
    const r = new BitReader(body);
    if (r.read(8) !== FORMAT_VERSION) throw new CodecError('unsupported-format');
    const bankVersion = r.read(8);
    r.read(8); // тип теста — зарезервирован под «Друзья»
    const name = new TextDecoder().decode(r.readBytes(r.read(8)));
    const ids = manifest[bankVersion];
    if (!ids) throw new CodecError('unknown-bank');

    const responses: Profile['responses'] = {};
    for (const id of ids) {
      const value = r.read(4), lo = r.read(4), hi = r.read(4), importance = r.read(2);
      if (value === SKIPPED) { responses[id] = 'skipped'; continue; }
      if (value > 10 || lo > 10 || hi > 10 || lo > hi) throw new CodecError('corrupt');
      const answer: Answer = { value, lo, hi, importance: importance as ImportanceLevel };
      responses[id] = answer;
    }
    return { name, bankVersion, responses };
  } catch (e) {
    if (e instanceof CodecError) throw e;
    throw new CodecError('corrupt');
  }
}
```

- [ ] **Step 8: Прогнать тесты**

Run: `npx vitest run tests/codec.test.ts tests/codec-parts.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/codec tests/codec.test.ts tests/codec-parts.test.ts
git commit -m "feat(codec): ответы ⇄ короткая ссылка с CRC и версией банка"
```

---

### Task 5: Банк вопросов — сферы, заглушка, манифест, валидация

**Files:**
- Create: `src/questions/spheres.ts`, `src/questions/bank.json`, `src/questions/manifest.json`, `src/questions/validate.ts`, `src/questions/index.ts`
- Test: `tests/bank.test.ts`

**Interfaces:**
- Consumes: `Question`, `Block` (Task 1); `Manifest` (Task 4).
- Produces:
  ```ts
  interface SphereInfo { id: string; block: Block; label: string }
  const SPHERES: SphereInfo[]
  function validateBank(questions: Question[], ids: string[]): string[]   // пустой массив = ок
  const QUESTIONS: Question[]; const BANK_VERSION: number; const MANIFEST: Manifest; const CURRENT_IDS: string[]
  ```

- [ ] **Step 1: Написать падающие тесты**

`tests/bank.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../src/questions';
import { SPHERES } from '../src/questions/spheres';
import { validateBank } from '../src/questions/validate';
import type { Question } from '../src/types';

const q = (id: string, sphere: string, block: Question['block'] = 'friendship'): Question => ({
  id, block, sphere, text: 't', left: 'l', right: 'r', topic: 'topic', optional: false,
});

describe('банк вопросов', () => {
  it('настоящий банк проходит валидацию', () => {
    expect(validateBank(QUESTIONS, CURRENT_IDS)).toEqual([]);
  });
  it('манифест содержит текущую версию', () => {
    expect(MANIFEST[BANK_VERSION]).toBe(CURRENT_IDS);
  });
  it('в банке есть оба блока', () => {
    expect(new Set(QUESTIONS.map((x) => x.block))).toEqual(new Set(['friendship', 'relationship']));
  });
  it('сфер 17: 8 дружбы и 9 отношений', () => {
    expect(SPHERES.filter((s) => s.block === 'friendship')).toHaveLength(8);
    expect(SPHERES.filter((s) => s.block === 'relationship')).toHaveLength(9);
  });
});

describe('validateBank ловит ошибки', () => {
  const ok = [q('a', 'humor'), q('b', 'money')];
  it('дубликат id', () => {
    const bank = [q('a', 'humor'), q('a', 'money')];
    expect(validateBank(bank, ['a', 'a']).join()).toMatch(/дубликат id: a/);
  });
  it('пустое поле', () => {
    const bank = [{ ...q('a', 'humor'), topic: ' ' }];
    expect(validateBank(bank, ['a']).join()).toMatch(/пустое поле topic/);
  });
  it('неизвестная сфера и не тот блок', () => {
    expect(validateBank([q('a', 'nope')], ['a']).join()).toMatch(/неизвестная сфера/);
    expect(validateBank([q('a', 'kids', 'friendship')], ['a']).join()).toMatch(/относится к блоку relationship/);
  });
  it('два вопроса одной сферы подряд', () => {
    expect(validateBank([q('a', 'humor'), q('b', 'humor')], ['a', 'b']).join()).toMatch(/подряд/);
  });
  it('манифест не совпадает с порядком', () => {
    expect(validateBank(ok, ['b', 'a']).join()).toMatch(/манифест/);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/bank.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Создать `src/questions/spheres.ts`**

```ts
import type { Block } from '../types';

export interface SphereInfo { id: string; block: Block; label: string }

export const SPHERES: SphereInfo[] = [
  { id: 'humor', block: 'friendship', label: 'Юмор и вайб' },
  { id: 'leisure', block: 'friendship', label: 'Досуг' },
  { id: 'rhythm', block: 'friendship', label: 'Ритм общения' },
  { id: 'loyalty', block: 'friendship', label: 'Лояльность и поддержка' },
  { id: 'honesty', block: 'friendship', label: 'Честность и границы' },
  { id: 'money', block: 'friendship', label: 'Деньги между людьми' },
  { id: 'values', block: 'friendship', label: 'Ценности и мировоззрение' },
  { id: 'conflicts', block: 'friendship', label: 'Конфликты' },
  { id: 'kids', block: 'relationship', label: 'Дети и семья' },
  { id: 'home', block: 'relationship', label: 'Быт и дом' },
  { id: 'living', block: 'relationship', label: 'Где и как жить' },
  { id: 'career', block: 'relationship', label: 'Карьера и амбиции' },
  { id: 'budget', block: 'relationship', label: 'Семейный бюджет' },
  { id: 'intimacy', block: 'relationship', label: 'Близость' },
  { id: 'space', block: 'relationship', label: 'Ревность и личное пространство' },
  { id: 'relatives', block: 'relationship', label: 'Родственники и окружение' },
  { id: 'roles', block: 'relationship', label: 'Роли и языки любви' },
];
```

- [ ] **Step 4: Создать банк-заглушку `src/questions/bank.json`**

```json
{
  "version": 1,
  "questions": [
    { "id": "humor-01", "block": "friendship", "sphere": "humor", "text": "Близкий человек пошутил над вами при компании — смешно, но немного обидно", "left": "Посмеюсь вместе со всеми", "right": "Потом скажу, что так не надо", "topic": "шутки на грани", "optional": false },
    { "id": "kids-01", "block": "relationship", "sphere": "kids", "text": "Через пять лет вы скорее видите себя…", "left": "Без детей, со свободой и своими планами", "right": "С ребёнком, даже если планы подвинутся", "topic": "планы на детей", "optional": false },
    { "id": "money-01", "block": "friendship", "sphere": "money", "text": "Вам неожиданно пришли 50 000 ₽", "left": "Отложу всё до копейки", "right": "Потрачу на впечатления", "topic": "отношение к неожиданным деньгам", "optional": false },
    { "id": "home-01", "block": "relationship", "sphere": "home", "text": "Выходной, дома беспорядок, а погода отличная", "left": "Гулять, уберёмся когда-нибудь", "right": "Сначала порядок, потом прогулка", "topic": "порядок в доме", "optional": false },
    { "id": "conflicts-01", "block": "friendship", "sphere": "conflicts", "text": "После ссоры с близким человеком вам нужно…", "left": "Обсудить всё прямо сейчас", "right": "Побыть одному и остыть", "topic": "как выходить из ссоры", "optional": false },
    { "id": "living-01", "block": "relationship", "sphere": "living", "text": "Предлагают одинаковую зарплату в двух местах", "left": "Мегаполис, где всё под рукой", "right": "Тихий город у моря", "topic": "где жить", "optional": false },
    { "id": "rhythm-01", "block": "friendship", "sphere": "rhythm", "text": "Близкий человек три дня не отвечал, а потом написал как ни в чём не бывало", "left": "Мне важно знать, что случилось", "right": "Нормально, у всех бывает", "topic": "ритм общения", "optional": false },
    { "id": "career-01", "block": "relationship", "sphere": "career", "text": "Партнёру предложили работу мечты в другой стране", "left": "Поеду не раздумывая", "right": "Попрошу отказаться", "topic": "переезд ради карьеры партнёра", "optional": false },
    { "id": "loyalty-01", "block": "friendship", "sphere": "loyalty", "text": "Близкий человек явно неправ в споре с кем-то третьим", "left": "Скажу при всех, что тот неправ", "right": "Поддержу при всех, разберёмся наедине", "topic": "поддержка, когда близкий неправ", "optional": false },
    { "id": "intimacy-01", "block": "relationship", "sphere": "intimacy", "text": "В интимной жизни вам ближе…", "left": "Привычное и проверенное", "right": "Пробовать новое", "topic": "новизна в интимной жизни", "optional": true },
    { "id": "values-01", "block": "friendship", "sphere": "values", "text": "Высокая зарплата в компании, чьи ценности вам не близки", "left": "Соглашусь — работа есть работа", "right": "Откажусь, даже если придётся ужаться", "topic": "деньги и принципы", "optional": false },
    { "id": "space-01", "block": "relationship", "sphere": "space", "text": "Партнёр просит доступ к вашему телефону", "left": "Пожалуйста, мне нечего скрывать", "right": "Телефон — моё личное пространство", "topic": "личное пространство и телефоны", "optional": false }
  ]
}
```

`src/questions/manifest.json`:
```json
{
  "1": ["humor-01", "kids-01", "money-01", "home-01", "conflicts-01", "living-01", "rhythm-01", "career-01", "loyalty-01", "intimacy-01", "values-01", "space-01"]
}
```

- [ ] **Step 5: Создать `src/questions/validate.ts`**

```ts
import type { Question } from '../types';
import { SPHERES } from './spheres';

export function validateBank(questions: Question[], ids: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const sphereBlock = new Map(SPHERES.map((s) => [s.id, s.block]));

  questions.forEach((q, i) => {
    const label = q.id || `#${i}`;
    if (seen.has(q.id)) errors.push(`дубликат id: ${q.id}`);
    seen.add(q.id);
    for (const field of ['id', 'text', 'left', 'right', 'topic'] as const) {
      if (!q[field]?.trim()) errors.push(`${label}: пустое поле ${field}`);
    }
    const block = sphereBlock.get(q.sphere);
    if (!block) errors.push(`${label}: неизвестная сфера ${q.sphere}`);
    else if (block !== q.block) errors.push(`${label}: сфера ${q.sphere} относится к блоку ${block}`);
    if (i > 0 && questions[i - 1].sphere === q.sphere) errors.push(`${label}: два вопроса сферы ${q.sphere} подряд`);
  });

  if (ids.join('\n') !== questions.map((q) => q.id).join('\n')) {
    errors.push('манифест текущей версии не совпадает с порядком банка');
  }
  return errors;
}
```

- [ ] **Step 6: Создать `src/questions/index.ts`**

```ts
import type { Manifest } from '../codec/codec';
import type { Question } from '../types';
import bank from './bank.json';
import manifestJson from './manifest.json';

export const BANK_VERSION: number = bank.version;
export const QUESTIONS = bank.questions as Question[];
export const MANIFEST: Manifest = Object.fromEntries(
  Object.entries(manifestJson as Record<string, string[]>).map(([v, ids]) => [Number(v), ids]),
);
export const CURRENT_IDS: string[] = MANIFEST[BANK_VERSION];
```

- [ ] **Step 7: Прогнать тесты и проверку типов**

Run: `npx vitest run tests/bank.test.ts && npx tsc`
Expected: PASS; `tsc` без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/questions tests/bank.test.ts
git commit -m "feat(questions): сферы, банк-заглушка из 12 вопросов, манифест и валидация"
```

---

### Task 6: Хранилище прогресса

**Files:**
- Create: `src/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `Response` (Task 1).
- Produces:
  ```ts
  interface Progress { name: string; index: number; responses: Record<string, Response>; inviterCode: string | null }
  interface Store {
    readonly available: boolean;
    loadProgress(): Progress | null; saveProgress(p: Progress): void; clearProgress(): void;
    loadOwnCode(): string | null; saveOwnCode(code: string): void;
  }
  function createStore(storage: Storage | null): Store
  function browserStorage(): Storage | null
  ```

- [ ] **Step 1: Написать падающие тесты**

`tests/storage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createStore, type Progress } from '../src/storage';

class MemoryStorage implements Storage {
  [key: string]: any; // индексная сигнатура из интерфейса Storage — иначе tsc не соберёт тесты
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

class ThrowingStorage extends MemoryStorage {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const progress: Progress = {
  name: 'Аня', index: 3, inviterCode: null,
  responses: { 'kids-01': { value: 9, lo: 7, hi: 10, importance: 3 }, 'intimacy-01': 'skipped' },
};

describe('storage', () => {
  it('сохраняет и восстанавливает прогресс', () => {
    const store = createStore(new MemoryStorage());
    expect(store.available).toBe(true);
    expect(store.loadProgress()).toBeNull();
    store.saveProgress(progress);
    expect(store.loadProgress()).toEqual(progress);
    store.clearProgress();
    expect(store.loadProgress()).toBeNull();
  });

  it('сохраняет собственный код', () => {
    const store = createStore(new MemoryStorage());
    store.saveOwnCode('abc');
    expect(store.loadOwnCode()).toBe('abc');
  });

  it('повреждённый JSON → null, без исключения', () => {
    const s = new MemoryStorage();
    s.setItem('compat:v1:progress', '{oops');
    expect(createStore(s).loadProgress()).toBeNull();
    s.setItem('compat:v1:progress', '{"name":1}');
    expect(createStore(s).loadProgress()).toBeNull();
  });

  it('недоступное хранилище: available=false, методы не бросают', () => {
    for (const store of [createStore(null), createStore(new ThrowingStorage())]) {
      expect(store.available).toBe(false);
      expect(() => store.saveProgress(progress)).not.toThrow();
      expect(store.loadProgress()).toBeNull();
      expect(store.loadOwnCode()).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — `Failed to resolve import "../src/storage"`.

- [ ] **Step 3: Реализовать `src/storage.ts`**

```ts
import type { Response } from './types';

export interface Progress {
  name: string;
  index: number;
  responses: Record<string, Response>;
  inviterCode: string | null;
}

export interface Store {
  readonly available: boolean;
  loadProgress(): Progress | null;
  saveProgress(p: Progress): void;
  clearProgress(): void;
  loadOwnCode(): string | null;
  saveOwnCode(code: string): void;
}

const PROGRESS_KEY = 'compat:v1:progress';
const OWN_CODE_KEY = 'compat:v1:own-code';
const PROBE_KEY = 'compat:probe';

function isProgress(p: unknown): p is Progress {
  if (typeof p !== 'object' || p === null) return false;
  const x = p as Record<string, unknown>;
  return typeof x.name === 'string'
    && typeof x.index === 'number'
    && typeof x.responses === 'object' && x.responses !== null
    && (x.inviterCode === null || typeof x.inviterCode === 'string');
}

function probe(s: Storage): boolean {
  try {
    s.setItem(PROBE_KEY, '1');
    s.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createStore(storage: Storage | null): Store {
  const get = (k: string): string | null => {
    try { return storage?.getItem(k) ?? null; } catch { return null; }
  };
  const set = (k: string, v: string): void => {
    try { storage?.setItem(k, v); } catch { /* хранилище недоступно — работаем без сохранения */ }
  };
  const remove = (k: string): void => {
    try { storage?.removeItem(k); } catch { /* то же */ }
  };

  return {
    available: storage !== null && probe(storage),
    loadProgress() {
      const raw = get(PROGRESS_KEY);
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isProgress(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    saveProgress: (p) => set(PROGRESS_KEY, JSON.stringify(p)),
    clearProgress: () => remove(PROGRESS_KEY),
    loadOwnCode: () => get(OWN_CODE_KEY),
    saveOwnCode: (code) => set(OWN_CODE_KEY, code),
  };
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts tests/storage.test.ts
git commit -m "feat(storage): прогресс и свой код в localStorage с запасным режимом"
```

---

### Task 7: Чистая логика интерфейса — маршруты, черновик ответа, окончания, вердикт

**Files:**
- Create: `src/router.ts`, `src/ui/answer-logic.ts`, `src/ui/plural.ts`, `src/ui/verdict.ts`
- Test: `tests/router.test.ts`, `tests/answer-logic.test.ts`, `tests/plural.test.ts`, `tests/verdict.test.ts`

**Interfaces:**
- Consumes: `Answer`, `Response`, `ImportanceLevel`, `MAX_CRITICAL` (Task 1); `CompareResult`, `ModeResult` (Task 3).
- Produces:
  ```ts
  // router.ts
  type Route = { kind: 'start' } | { kind: 'invite'; a: string } | { kind: 'result'; a: string; b: string }
  function parseHash(hash: string): Route
  function inviteUrl(base: string, a: string): string
  function resultUrl(base: string, a: string, b: string): string
  function classifyInvite(code: string, ownCode: string | null): 'own' | 'foreign'
  // ui/answer-logic.ts
  interface Draft { value: number | null; lo: number; hi: number; importance: ImportanceLevel | null }
  const DEFAULT_SPREAD = 2
  function emptyDraft(): Draft
  function draftFrom(r: Response | undefined): Draft
  function setValue(d: Draft, value: number): Draft
  function tapRange(d: Draft, cell: number): Draft
  function setImportance(d: Draft, importance: ImportanceLevel): Draft
  function toAnswer(d: Draft): Answer | null
  function criticalCount(responses: Record<string, Response>, exceptId: string): number
  function canChooseCritical(usedElsewhere: number): boolean
  // ui/plural.ts
  function plural(n: number, forms: [string, string, string]): string   // возвращает "n слово"
  // ui/verdict.ts
  function verdict(r: CompareResult): string
  ```

- [ ] **Step 1: Написать падающие тесты**

`tests/router.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifyInvite, inviteUrl, parseHash, resultUrl } from '../src/router';

describe('router', () => {
  it.each([
    ['', { kind: 'start' }],
    ['#', { kind: 'start' }],
    ['#b=xyz', { kind: 'start' }],
    ['#a=abc', { kind: 'invite', a: 'abc' }],
    ['#a=abc&b=d_e-f', { kind: 'result', a: 'abc', b: 'd_e-f' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('отбрасывает мусор от мессенджеров: точку, скобку, перенос строки', () => {
    expect(parseHash('#a=abc).')).toEqual({ kind: 'invite', a: 'abc' });
    expect(parseHash('#a=ab%0Acd')).toEqual({ kind: 'invite', a: 'abcd' });
    expect(parseHash('#a=abc&b=def%20')).toEqual({ kind: 'result', a: 'abc', b: 'def' });
  });

  it('строит ссылки, которые парсятся обратно', () => {
    const base = 'https://example.github.io/compat/';
    expect(parseHash(new URL(inviteUrl(base, 'A1')).hash)).toEqual({ kind: 'invite', a: 'A1' });
    expect(parseHash(new URL(resultUrl(base, 'A1', 'B2')).hash)).toEqual({ kind: 'result', a: 'A1', b: 'B2' });
  });

  it('своя ссылка распознаётся', () => {
    expect(classifyInvite('abc', 'abc')).toBe('own');
    expect(classifyInvite('abc', 'xyz')).toBe('foreign');
    expect(classifyInvite('abc', null)).toBe('foreign');
  });
});
```

`tests/answer-logic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  canChooseCritical, criticalCount, draftFrom, emptyDraft, setImportance, setValue, tapRange, toAnswer,
} from '../src/ui/answer-logic';
import type { Response } from '../src/types';

describe('answer-logic', () => {
  it('выбор ответа ставит диапазон ±2 с обрезкой', () => {
    expect(setValue(emptyDraft(), 5)).toMatchObject({ value: 5, lo: 3, hi: 7 });
    expect(setValue(emptyDraft(), 1)).toMatchObject({ value: 1, lo: 0, hi: 3 });
    expect(setValue(emptyDraft(), 10)).toMatchObject({ value: 10, lo: 8, hi: 10 });
  });

  it('тап левее ответа двигает lo, правее — hi, по ответу — сжимает до точки', () => {
    const d = setValue(emptyDraft(), 5);
    expect(tapRange(d, 1)).toMatchObject({ lo: 1, hi: 7 });
    expect(tapRange(d, 9)).toMatchObject({ lo: 3, hi: 9 });
    expect(tapRange(d, 5)).toMatchObject({ lo: 5, hi: 5 });
  });

  it('тап по диапазону без ответа ничего не меняет', () => {
    expect(tapRange(emptyDraft(), 3)).toEqual(emptyDraft());
  });

  it('ответ готов только при выбранных значении и важности', () => {
    const d = setValue(emptyDraft(), 7);
    expect(toAnswer(d)).toBeNull();
    expect(toAnswer(setImportance(emptyDraft(), 2))).toBeNull();
    expect(toAnswer(setImportance(d, 2))).toEqual({ value: 7, lo: 5, hi: 9, importance: 2 });
  });

  it('черновик восстанавливается из сохранённого ответа; skipped → пустой', () => {
    expect(draftFrom({ value: 2, lo: 0, hi: 4, importance: 1 })).toEqual({ value: 2, lo: 0, hi: 4, importance: 1 });
    expect(draftFrom('skipped')).toEqual(emptyDraft());
    expect(draftFrom(undefined)).toEqual(emptyDraft());
  });

  it('считает «критично» без текущего вопроса и держит лимит 12', () => {
    const responses: Record<string, Response> = {
      a: { value: 1, lo: 0, hi: 2, importance: 3 },
      b: { value: 1, lo: 0, hi: 2, importance: 3 },
      c: { value: 1, lo: 0, hi: 2, importance: 2 },
      d: 'skipped',
    };
    expect(criticalCount(responses, 'x')).toBe(2);
    expect(criticalCount(responses, 'a')).toBe(1);
    expect(canChooseCritical(11)).toBe(true);
    expect(canChooseCritical(12)).toBe(false);
  });
});
```

`tests/plural.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { plural } from '../src/ui/plural';

const MIN: [string, string, string] = ['минута', 'минуты', 'минут'];

describe('plural', () => {
  it.each([
    [1, '1 минута'], [2, '2 минуты'], [5, '5 минут'], [11, '11 минут'], [14, '14 минут'],
    [21, '21 минута'], [22, '22 минуты'], [45, '45 минут'], [111, '111 минут'],
  ])('%i', (n, expected) => {
    expect(plural(n, MIN)).toBe(expected);
  });
});
```

`tests/verdict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { verdict } from '../src/ui/verdict';
import type { CompareResult, ModeResult } from '../src/scoring/compare';

const mode = (percent: number | null, reds = 0): ModeResult => ({
  percent, spheres: [], superMatches: [], strongMatches: [], talkZones: [], superCount: 0, flexibleCount: 0,
  redFlags: Array.from({ length: reds }, (_, i) => ({ id: `r${i}`, topic: 't', sphere: 's' })),
});
const r = (rel: number | null, fr: number | null, reds = 0): CompareResult => ({
  relationship: mode(rel, reds), friendship: mode(fr),
});

describe('verdict', () => {
  it('красные флаги важнее процентов', () => {
    expect(verdict(r(90, 90, 1))).toMatch(/красных флагов/);
  });
  it('высоко и там и там', () => {
    expect(verdict(r(80, 85))).toBe('Вы совпадаете и как пара, и как друзья.');
  });
  it('дружба заметно выше отношений', () => {
    expect(verdict(r(55, 85))).toMatch(/легко вместе/);
  });
  it('средний результат', () => {
    expect(verdict(r(65, 70))).toMatch(/Хорошая основа/);
  });
  it('низкий результат', () => {
    expect(verdict(r(40, 45))).toMatch(/во многом разные/);
  });
  it('null трактуется как «не мешает»', () => {
    expect(verdict(r(null, null))).toBe('Вы совпадаете и как пара, и как друзья.');
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/router.test.ts tests/answer-logic.test.ts tests/plural.test.ts tests/verdict.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать модули**

`src/router.ts`:
```ts
export type Route =
  | { kind: 'start' }
  | { kind: 'invite'; a: string }
  | { kind: 'result'; a: string; b: string };

/** Мессенджеры добавляют к ссылке точки, скобки и переносы — оставляем только алфавит base64url. */
const clean = (s: string | null) => (s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const a = clean(params.get('a'));
  const b = clean(params.get('b'));
  if (a && b) return { kind: 'result', a, b };
  if (a) return { kind: 'invite', a };
  return { kind: 'start' };
}

export const inviteUrl = (base: string, a: string) => `${base}#a=${a}`;
export const resultUrl = (base: string, a: string, b: string) => `${base}#a=${a}&b=${b}`;

export function classifyInvite(code: string, ownCode: string | null): 'own' | 'foreign' {
  return ownCode !== null && code === ownCode ? 'own' : 'foreign';
}
```

`src/ui/answer-logic.ts`:
```ts
import { MAX_CRITICAL, type Answer, type ImportanceLevel, type Response } from '../types';

export interface Draft {
  value: number | null;
  lo: number;
  hi: number;
  importance: ImportanceLevel | null;
}

export const DEFAULT_SPREAD = 2;

export const emptyDraft = (): Draft => ({ value: null, lo: 0, hi: 10, importance: null });

export function draftFrom(r: Response | undefined): Draft {
  if (!r || r === 'skipped') return emptyDraft();
  return { value: r.value, lo: r.lo, hi: r.hi, importance: r.importance };
}

export function setValue(d: Draft, value: number): Draft {
  return {
    ...d,
    value,
    lo: Math.max(0, value - DEFAULT_SPREAD),
    hi: Math.min(10, value + DEFAULT_SPREAD),
  };
}

/** Тап левее своего ответа — новая нижняя граница, правее — верхняя, по ответу — диапазон сжимается до точки. */
export function tapRange(d: Draft, cell: number): Draft {
  if (d.value === null) return d;
  if (cell < d.value) return { ...d, lo: cell };
  if (cell > d.value) return { ...d, hi: cell };
  return { ...d, lo: d.value, hi: d.value };
}

export const setImportance = (d: Draft, importance: ImportanceLevel): Draft => ({ ...d, importance });

export function toAnswer(d: Draft): Answer | null {
  if (d.value === null || d.importance === null) return null;
  return { value: d.value, lo: d.lo, hi: d.hi, importance: d.importance };
}

export function criticalCount(responses: Record<string, Response>, exceptId: string): number {
  return Object.entries(responses).filter(
    ([id, r]) => id !== exceptId && r !== 'skipped' && r.importance === 3,
  ).length;
}

export const canChooseCritical = (usedElsewhere: number) => usedElsewhere < MAX_CRITICAL;
```

`src/ui/plural.ts`:
```ts
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${n} ${word}`;
}
```

`src/ui/verdict.ts`:
```ts
import type { CompareResult } from '../scoring/compare';

export function verdict(r: CompareResult): string {
  const rel = r.relationship.percent ?? 100;
  const fr = r.friendship.percent ?? 100;
  if (r.relationship.redFlags.length > 0) return 'Есть принципиальные расхождения — начните разговор с красных флагов.';
  if (rel >= 75 && fr >= 75) return 'Вы совпадаете и как пара, и как друзья.';
  if (fr - rel >= 15) return 'Вам легко вместе, но во взглядах на отношения есть что обсудить.';
  if (rel >= 60) return 'Хорошая основа — несколько тем стоит обсудить.';
  return 'Вы во многом разные — результат подскажет, с чего начать разговор.';
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/router.test.ts tests/answer-logic.test.ts tests/plural.test.ts tests/verdict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/router.ts src/ui/answer-logic.ts src/ui/plural.ts src/ui/verdict.ts tests/router.test.ts tests/answer-logic.test.ts tests/plural.test.ts tests/verdict.test.ts
git commit -m "feat(ui): маршруты, черновик ответа, окончания и итоговая фраза"
```

---

### Task 8: Экраны и контроллер приложения

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/share.ts`, `src/ui/screens/intro.ts`, `src/ui/screens/question.ts`, `src/ui/screens/finish.ts`, `src/ui/screens/result.ts`, `src/ui/screens/message.ts`, `src/ui/app.ts`, `src/styles.css`
- Modify: `src/main.ts` (полностью заменить)

**Interfaces:**
- Consumes: всё из Task 1–7 по именам, перечисленным там.
- Produces: `startApp(root: HTMLElement): void`.

Экраны — тонкий слой над протестированной логикой. Проверка: сборка проходит, затем ручной сценарий из Step 11.

- [ ] **Step 1: `src/ui/dom.ts`**

```ts
type Attr = string | boolean | ((e: Event) => void);
type Child = Node | string | null | false;

/** Создаёт элемент: on*-атрибуты становятся обработчиками, true — пустым атрибутом, false — пропускается. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Attr> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
```

- [ ] **Step 2: `src/ui/share.ts`**

```ts
import { h } from './dom';

export function shareBlock(url: string, title: string): HTMLElement {
  const input = h('input', { type: 'text', readonly: true, value: url, class: 'link', 'aria-label': 'Ссылка' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Скопировано';
    } catch {
      input.select();
      status.textContent = 'Выделите ссылку и скопируйте вручную';
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // меню закрыли — ничего не делаем
    }
  };

  return h('div', { class: 'share' },
    input,
    h('div', { class: 'nav' },
      'share' in navigator ? h('button', { type: 'button', class: 'primary', onclick: share }, 'Поделиться') : null,
      h('button', { type: 'button', class: 'secondary', onclick: copy }, 'Скопировать'),
    ),
    status,
  );
}
```

- [ ] **Step 3: `src/ui/screens/message.ts`**

```ts
import { h } from '../dom';
import { shareBlock } from '../share';

export function messageScreen(title: string, text: string, url: string | null = null): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, title),
    h('p', {}, text),
    url ? shareBlock(url, 'Тест совместимости') : null,
    h('button', { type: 'button', class: 'secondary', onclick: () => { location.hash = ''; } }, 'На главную'),
  );
}
```

- [ ] **Step 4: `src/ui/screens/intro.ts`**

```ts
import { h } from '../dom';
import { plural } from '../plural';
import { shareBlock } from '../share';

export interface IntroProps {
  inviterName: string | null; // null — не приглашение; '' — приглашение без имени
  total: number;
  resumeAt: number | null; // номер вопроса, с которого продолжить (с 1)
  storageAvailable: boolean;
  ownUrl: string | null;
  onStart(name: string): void;
  onResume(): void;
}

export function introScreen(p: IntroProps): HTMLElement {
  const title = p.inviterName === null
    ? 'Тест совместимости'
    : p.inviterName ? `${p.inviterName} приглашает вас проверить совместимость` : 'Вас пригласили проверить совместимость';
  const minutes = Math.max(1, Math.round((p.total * 23) / 60));
  const input = h('input', { type: 'text', maxlength: '20', placeholder: 'Ваше имя (необязательно)', autocomplete: 'given-name' });

  return h('section', { class: 'screen intro' },
    h('h1', {}, title),
    h('p', {}, `${plural(p.total, ['вопрос', 'вопроса', 'вопросов'])}, около ${plural(minutes, ['минуты', 'минут', 'минут'])}. Вы узнаете совместимость в отношениях и в дружбе.`),
    h('p', {}, 'Конкретные ответы партнёр не увидит — только общий результат. Отвечайте честно, а не «как правильно».'),
    p.storageAvailable ? null : h('p', { class: 'warn' }, 'Браузер не сохраняет прогресс — пройдите тест за один раз.'),
    p.resumeAt !== null
      ? h('button', { type: 'button', class: 'primary', onclick: () => p.onResume() }, `Продолжить с вопроса ${p.resumeAt}`)
      : null,
    input,
    h('button', { type: 'button', class: p.resumeAt !== null ? 'secondary' : 'primary', onclick: () => p.onStart(input.value.trim()) },
      p.resumeAt !== null ? 'Начать заново' : 'Начать'),
    p.ownUrl && p.inviterName === null
      ? h('div', { class: 'block' }, h('h3', {}, 'Ваша ссылка для партнёра'), shareBlock(p.ownUrl, 'Тест совместимости'))
      : null,
  );
}
```

Примечание: «около N минуты/минут» — после «около» нужен родительный падеж, поэтому формы `['минуты', 'минут', 'минут']` (около 1 минуты, около 5 минут, около 21 минуты).

- [ ] **Step 5: `src/ui/screens/question.ts`**

```ts
import { IMPORTANCE_LABELS, MAX_CRITICAL, type ImportanceLevel, type Question, type Response } from '../../types';
import { canChooseCritical, draftFrom, setImportance, setValue, tapRange, toAnswer } from '../answer-logic';
import { h } from '../dom';

export interface QuestionProps {
  question: Question;
  index: number;
  total: number;
  response: Response | undefined;
  criticalUsed: number; // «критично» на других вопросах
  onBack: (() => void) | null;
  onSubmit(r: Response): void;
}

export function questionScreen(p: QuestionProps): HTMLElement {
  let d = draftFrom(p.response);
  const root = h('section', { class: 'screen question' });

  const scale = (cls: string, isOn: (i: number) => boolean, onTap: (i: number) => void) =>
    h('div', { class: `scale ${cls}`, role: 'group' },
      ...Array.from({ length: 11 }, (_, i) =>
        h('button', {
          type: 'button',
          class: isOn(i) ? 'cell on' : 'cell',
          'aria-pressed': isOn(i) ? 'true' : 'false',
          onclick: () => { onTap(i); draw(); },
        }, String(i))));

  function draw() {
    const q = p.question;
    const critBlocked = !canChooseCritical(p.criticalUsed) && d.importance !== 3;
    const answer = toAnswer(d);
    const hasValue = d.value !== null;

    root.replaceChildren(
      h('div', { class: 'progress' },
        h('div', { class: 'bar', style: `width:${(p.index / p.total) * 100}%` }),
        h('span', {}, `${p.index + 1} / ${p.total}`)),
      h('h2', {}, q.text),
      h('div', { class: 'poles' }, h('span', {}, `0 — ${q.left}`), h('span', {}, `10 — ${q.right}`)),
      h('p', { class: 'label' }, 'Мой ответ'),
      scale('mine', (i) => i === d.value, (i) => { d = setValue(d, i); }),
      hasValue ? h('p', { class: 'label' }, 'Приемлемо для партнёра') : null,
      hasValue ? scale('range', (i) => i >= d.lo && i <= d.hi, (i) => { d = tapRange(d, i); }) : null,
      hasValue ? h('p', { class: 'hint' }, 'Нажмите левее или правее своего ответа, чтобы сдвинуть границу') : null,
      h('p', { class: 'label' }, 'Насколько это важно'),
      h('div', { class: 'importance' },
        ...IMPORTANCE_LABELS.map((label, i) =>
          h('button', {
            type: 'button',
            class: d.importance === i ? 'imp on' : 'imp',
            disabled: i === 3 && critBlocked,
            onclick: () => { d = setImportance(d, i as ImportanceLevel); draw(); },
          }, label))),
      h('p', { class: 'hint' },
        `Критично: ${p.criticalUsed + (d.importance === 3 ? 1 : 0)} из ${MAX_CRITICAL}`
          + (critBlocked ? ' — снимите «критично» с другого вопроса' : '')),
      h('div', { class: 'nav' },
        p.onBack ? h('button', { type: 'button', class: 'secondary', onclick: p.onBack }, 'Назад') : null,
        q.optional ? h('button', { type: 'button', class: 'secondary', onclick: () => p.onSubmit('skipped') }, 'Пропустить') : null,
        h('button', {
          type: 'button', class: 'primary', disabled: !answer,
          onclick: () => { if (answer) p.onSubmit(answer); },
        }, 'Дальше')),
    );
  }

  draw();
  return root;
}
```

- [ ] **Step 6: `src/ui/screens/finish.ts`**

```ts
import { h } from '../dom';
import { shareBlock } from '../share';

export function finishScreen(url: string): HTMLElement {
  return h('section', { class: 'screen' },
    h('h1', {}, 'Готово!'),
    h('p', {}, 'Отправьте ссылку партнёру. Он пройдёт тест, сразу увидит результат и сможет отправить его вам.'),
    shareBlock(url, 'Тест совместимости'),
  );
}
```

Формулировка «Он пройдёт» относится к слову «партнёр» (грамматический род), это допустимо.

- [ ] **Step 7: `src/ui/screens/result.ts`**

```ts
import { SPHERES } from '../../questions/spheres';
import type { CompareResult, ItemRef, ModeResult } from '../../scoring/compare';
import type { Profile } from '../../types';
import { h } from '../dom';
import { shareBlock } from '../share';
import { verdict } from '../verdict';

const fmt = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`);

function list(title: string, items: ItemRef[], cls: string): HTMLElement | null {
  if (!items.length) return null;
  return h('div', { class: `block ${cls}` }, h('h3', {}, title), h('ul', {}, ...items.map((i) => h('li', {}, i.topic))));
}

function modeSection(title: string, m: ModeResult): HTMLElement {
  const rows = SPHERES.flatMap((s) => {
    const sc = m.spheres.find((x) => x.sphere === s.id);
    if (!sc) return [];
    return [h('li', { class: 'sphere' },
      h('span', {}, s.label),
      h('span', { class: 'pct' }, sc.percent === null ? 'не принципиально' : fmt(sc.percent)))];
  });

  return h('section', { class: 'mode' },
    h('h2', {}, title, ' ', h('span', { class: 'big' }, fmt(m.percent))),
    m.superCount ? h('p', { class: 'badge' }, `🌟 Супер-совпадений: ${m.superCount}`) : null,
    list('🔴 Красные флаги', m.redFlags, 'red'),
    list('🌟 Супер-совпадения', m.superMatches, 'super'),
    list('🟢 Сильные совпадения', m.strongMatches, 'strong'),
    list('🟠 Стоит обсудить', m.talkZones, 'talk'),
    m.flexibleCount ? h('p', { class: 'hint' }, `⚪ Вопросов, где вы оба гибкие: ${m.flexibleCount}`) : null,
    h('h3', {}, 'По сферам'),
    h('ul', { class: 'spheres' }, ...rows),
  );
}

export function resultScreen(a: Profile, b: Profile, result: CompareResult, shareUrl: string): HTMLElement {
  return h('section', { class: 'screen result' },
    h('p', { class: 'names' }, `${a.name || 'Первый'} и ${b.name || 'Второй'}`),
    h('p', { class: 'verdict' }, verdict(result)),
    modeSection('💞 Отношения', result.relationship),
    modeSection('👯 Дружба', result.friendship),
    h('h3', {}, 'Отправить результат партнёру'),
    shareBlock(shareUrl, 'Наш результат совместимости'),
  );
}
```

- [ ] **Step 8: `src/ui/app.ts`**

```ts
import { CodecError, decode, encode } from '../codec/codec';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../questions';
import { classifyInvite, inviteUrl, parseHash, resultUrl, type Route } from '../router';
import { compare } from '../scoring/compare';
import { browserStorage, createStore, type Progress } from '../storage';
import { criticalCount } from './answer-logic';
import { finishScreen } from './screens/finish';
import { introScreen } from './screens/intro';
import { messageScreen } from './screens/message';
import { questionScreen } from './screens/question';
import { resultScreen } from './screens/result';

function codecMessage(e: unknown): string {
  if (e instanceof CodecError && e.kind === 'corrupt') return 'Ссылка повреждена — попросите прислать её заново.';
  if (e instanceof CodecError) return 'Ссылка от более новой версии теста — обновите страницу.';
  return 'Что-то пошло не так. Попробуйте открыть ссылку ещё раз.';
}

export function startApp(root: HTMLElement): void {
  const store = createStore(browserStorage());
  const base = location.href.split('#')[0];

  const show = (node: Node) => {
    root.replaceChildren(node);
    window.scrollTo(0, 0);
  };

  function route(r: Route) {
    if (r.kind === 'result') return showResult(r.a, r.b);
    if (r.kind === 'invite') return showInvite(r.a);
    return showIntro(null);
  }

  function showInvite(code: string) {
    if (classifyInvite(code, store.loadOwnCode()) === 'own') {
      return show(messageScreen('Это ваша ссылка', 'Отправьте её партнёру — он пройдёт тест и увидит результат.', inviteUrl(base, code)));
    }
    try {
      const inviter = decode(code, MANIFEST);
      showIntro({ code, name: inviter.name });
    } catch (e) {
      show(messageScreen('Не получилось открыть ссылку', codecMessage(e)));
    }
  }

  function showIntro(inviter: { code: string; name: string } | null) {
    const inviterCode = inviter?.code ?? null;
    const saved = store.loadProgress();
    const resumable = saved && saved.inviterCode === inviterCode ? saved : null;
    const own = store.loadOwnCode();
    show(introScreen({
      inviterName: inviter ? inviter.name : null,
      total: QUESTIONS.length,
      resumeAt: resumable ? Math.min(resumable.index, QUESTIONS.length - 1) + 1 : null,
      storageAvailable: store.available,
      ownUrl: own ? inviteUrl(base, own) : null,
      onStart: (name) => runTest({ name, index: 0, responses: {}, inviterCode }),
      onResume: () => { if (resumable) runTest(resumable); },
    }));
  }

  function runTest(p: Progress) {
    store.saveProgress(p);
    if (p.index >= QUESTIONS.length) return finish(p);
    const q = QUESTIONS[p.index];
    show(questionScreen({
      question: q,
      index: p.index,
      total: QUESTIONS.length,
      response: p.responses[q.id],
      criticalUsed: criticalCount(p.responses, q.id),
      onBack: p.index > 0 ? () => runTest({ ...p, index: p.index - 1 }) : null,
      onSubmit: (r) => runTest({ ...p, index: p.index + 1, responses: { ...p.responses, [q.id]: r } }),
    }));
  }

  function finish(p: Progress) {
    const code = encode({ name: p.name, bankVersion: BANK_VERSION, responses: p.responses }, CURRENT_IDS);
    store.saveOwnCode(code);
    store.clearProgress();
    if (p.inviterCode) {
      location.hash = `a=${p.inviterCode}&b=${code}`; // hashchange откроет результат
      return;
    }
    show(finishScreen(inviteUrl(base, code)));
  }

  function showResult(a: string, b: string) {
    try {
      const pa = decode(a, MANIFEST);
      const pb = decode(b, MANIFEST);
      show(resultScreen(pa, pb, compare(QUESTIONS, pa, pb), resultUrl(base, a, b)));
    } catch (e) {
      show(messageScreen('Не получилось открыть результат', codecMessage(e)));
    }
  }

  window.addEventListener('hashchange', () => route(parseHash(location.hash)));
  route(parseHash(location.hash));
}
```

- [ ] **Step 9: `src/main.ts` и `src/styles.css`**

`src/main.ts`:
```ts
import './styles.css';
import { startApp } from './ui/app';

startApp(document.getElementById('app')!);
```

`src/styles.css`:
```css
:root {
  --bg: #fdf8f6;
  --fg: #2b2326;
  --muted: #7a6d72;
  --accent: #d6456b;
  --accent-fg: #ffffff;
  --cell: #f1e6e9;
  --range: #f7c9d6;
  --card: #ffffff;
  --red: #c62828;
  --green: #2e7d32;
  --orange: #e67e22;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1d1719;
    --fg: #f3eaed;
    --muted: #a99ca1;
    --accent: #ff6f91;
    --accent-fg: #1d1719;
    --cell: #34292d;
    --range: #6b2f42;
    --card: #271f22;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
#app { max-width: 560px; margin: 0 auto; padding: 16px; }
.screen { display: flex; flex-direction: column; gap: 12px; }
h1 { font-size: 1.6rem; margin: 8px 0; }
h2 { font-size: 1.25rem; margin: 4px 0; }
h3 { font-size: 1rem; margin: 12px 0 4px; }
button, input { font: inherit; }
button {
  border: 0; border-radius: 12px; padding: 12px 16px; cursor: pointer;
  background: var(--cell); color: var(--fg);
}
button.primary { background: var(--accent); color: var(--accent-fg); font-weight: 600; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
input[type='text'] {
  width: 100%; padding: 12px; border-radius: 12px;
  border: 1px solid var(--cell); background: var(--card); color: var(--fg);
}
.progress { position: relative; height: 28px; background: var(--cell); border-radius: 14px; overflow: hidden; }
.progress .bar { position: absolute; inset: 0 auto 0 0; background: var(--range); }
.progress span { position: relative; display: block; text-align: center; line-height: 28px; font-size: 0.85rem; }
.poles { display: flex; justify-content: space-between; gap: 12px; font-size: 0.9rem; color: var(--muted); }
.poles span:last-child { text-align: right; }
.label { margin: 8px 0 0; font-weight: 600; }
.hint { margin: 0; font-size: 0.85rem; color: var(--muted); }
.warn { color: var(--orange); }
.scale { display: grid; grid-template-columns: repeat(11, 1fr); gap: 3px; }
.scale .cell { padding: 10px 0; border-radius: 8px; font-size: 0.9rem; min-width: 0; }
.scale.mine .cell.on { background: var(--accent); color: var(--accent-fg); }
.scale.range .cell.on { background: var(--range); }
.importance { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.importance .imp.on { background: var(--accent); color: var(--accent-fg); }
.nav { display: flex; gap: 8px; flex-wrap: wrap; }
.nav .primary { margin-left: auto; }
.share { display: flex; flex-direction: column; gap: 8px; }
.block { background: var(--card); border-radius: 12px; padding: 4px 14px 10px; }
.block ul { margin: 0; padding-left: 18px; }
.block.red h3 { color: var(--red); }
.block.super h3, .block.strong h3 { color: var(--green); }
.block.talk h3 { color: var(--orange); }
.mode { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.big { color: var(--accent); }
.names { color: var(--muted); margin: 0; }
.verdict { font-size: 1.1rem; font-weight: 600; }
.badge { margin: 0; }
.spheres { list-style: none; margin: 0; padding: 0; }
.spheres .sphere { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--cell); }
.spheres .pct { font-weight: 600; }
```

- [ ] **Step 10: Проверить типы, тесты и сборку**

Run: `npm test && npm run build`
Expected: все тесты PASS; `tsc` без ошибок; `dist/` создан.

- [ ] **Step 11: Ручная проверка сценария**

Run: `npm run dev` и открыть адрес из вывода (обычно `http://localhost:5173/`), окно шириной 375 px.

Сценарий (каждый пункт — ожидаемое поведение):
1. Вступление: «12 вопросов, около 5 минут», поле имени. Ввести «Аня» → «Начать».
2. «Дальше» неактивна, пока не выбраны ответ и важность. После выбора ответа 5 появляется диапазон 3–7; тап по 1 → диапазон 1–7.
3. На вопросе «Близость» есть «Пропустить». «Назад» возвращает к прошлому вопросу с сохранёнными ответами.
4. Перезагрузить страницу на 6-м вопросе → «Продолжить с вопроса 6» → открывается 6-й вопрос.
5. Пройти до конца → «Готово!» и ссылка `…#a=…`. Скопировать её.
6. Открыть скопированную ссылку в этой же вкладке → «Это ваша ссылка».
7. Открыть ссылку в приватном окне → «Аня приглашает вас…» → пройти как «Миша» → сразу экран результата с 💞 и 👯, вердиктом, блоками и сферами. Конкретных ответов Ани на экране нет.
8. Скопировать ссылку результата, открыть в третьем окне → тот же результат.
9. Удалить из ссылки 20 символов в середине → «Ссылка повреждена — попросите прислать её заново».
10. Поставить «Критично» на 12 вопросах (временно уменьшить `MAX_CRITICAL` до 2 в `src/types.ts` для проверки, потом вернуть 12) → кнопка «Критично» неактивна с подсказкой.

- [ ] **Step 12: Commit**

```bash
git add src index.html
git commit -m "feat(ui): экраны теста, результата и приглашения"
```

---

### Task 9: Публикация на GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run build` (Task 1–8).
- Produces: workflow, который на push в `main` тестирует, собирает и публикует `dist/`.

- [ ] **Step 1: `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: `README.md`**

````markdown
# Тест совместимости «Отношения и дружба»

Каждый проходит тест сам, отправляет ссылку — второй проходит тот же тест и видит совместимость
в отношениях и в дружбе. Сервера нет: ответы зашиты в ссылку.

## Команды

```bash
npm install
npm run dev     # локальный сервер
npm test        # тесты
npm run build   # сборка в dist/
```

## Вопросы

- Банк: `src/questions/bank.json` (порядок в файле = порядок показа).
- Манифест: `src/questions/manifest.json` — для каждой версии банка упорядоченный список `id`.
- `id` опубликованного вопроса менять нельзя: по нему связываются ответы в ссылках.
- Изменили состав или порядок вопросов → увеличьте `version` в `bank.json` и добавьте в манифест
  новую запись, **не удаляя старые** (иначе старые ссылки перестанут открываться).
- `npm test` проверяет банк: уникальность `id`, поля, сферы, нет двух вопросов одной сферы подряд.

Дизайн: `docs/superpowers/specs/2026-10-15-compatibility-test-design.md`.
````

- [ ] **Step 3: Проверить локально, что сборка из чистого состояния проходит**

Run: `rm -rf node_modules dist && npm ci && npm test && npm run build`
Expected: все тесты PASS, `dist/index.html` создан.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: публикация на GitHub Pages, README"
```

- [ ] **Step 5: Публикация — только с подтверждения пользователя**

Создание репозитория на GitHub и push — внешнее действие. Спросить пользователя, создавать ли репозиторий (имя, публичный или приватный). После согласия:
```bash
gh repo create compatibility-test --public --source . --push
gh api -X POST repos/{owner}/compatibility-test/pages -f build_type=workflow
```
Expected: workflow `Deploy to GitHub Pages` зелёный; сайт открывается по `https://<owner>.github.io/compatibility-test/`. Затем пройти пункт 7 ручного сценария вдвоём на двух телефонах через Telegram.
