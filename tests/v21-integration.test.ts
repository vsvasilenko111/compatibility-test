// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { decode, encode } from '../src/codec/codec';
import { BANK_VERSION, CURRENT_FIRM, CURRENT_IDS, FIRM, MANIFEST, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v21';
import { compare } from '../src/scoring/compare';
import { resumeFor, unansweredIds } from '../src/ui/flow';
import { resultScreen } from '../src/ui/screens/result';
import { divergences } from '../src/ui/answers-view';
import type { Profile } from '../src/types';

const replacements = ['kids-timing-01', 'relationship-format-01', 'living-plan-01', 'conflict-response-01', 'conflict-repair-01', 'personal-purchase-01'];
const oldOnly = ['kids-08', 'space-08', 'living-03', 'conflicts-02', 'conflicts-03', 'budget-02', 'reflect-02'];
const profile = (overrides: Record<string, number> = {}): Profile => ({
  name: 'Аня', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(CURRENT_IDS.map(id => [id, answerFor(overrides[id] ?? 0)])),
});

describe('v21 integration and historical links', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('still decodes every answer and historical firm bit in v%i', version => {
    const ids = MANIFEST[version], firm = FIRM[version] ?? [];
    expect(ids).toBeDefined();
    const old: Profile = { name: 'Старое имя', bankVersion: version,
      responses: Object.fromEntries(ids.map((id, i) => [id, {
        ...answerFor(OPTION_VALUES[i % OPTION_VALUES.length]), ...(firm.includes(id) ? { firm: true } : {}),
      }])) };
    expect(decode(encode(old, ids, firm), MANIFEST, FIRM)).toEqual(old);
  });

  it('resumes a complete v20 profile at a replacement and removes orphan answers only on the new link', () => {
    const old: Profile = { name: 'Аня', bankVersion: 20,
      responses: Object.fromEntries(MANIFEST[20].map((id, i) => [id, answerFor(OPTION_VALUES[i % 5])])) };
    const restored = decode(encode(old, MANIFEST[20], FIRM[20] ?? []), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(CURRENT_IDS.filter(id => replacements.includes(id)));
    const resumed = resumeFor({ name: old.name, responses: restored.responses, index: 137, inviterCode: null }, null, CURRENT_IDS)!;
    expect(CURRENT_IDS[resumed.index]).toBe(CURRENT_IDS.find(id => replacements.includes(id)));
    for (const id of oldOnly) expect(restored.responses[id]).toEqual(old.responses[id]);
    const upgraded = { ...restored, bankVersion: BANK_VERSION, responses: {
      ...restored.responses, ...Object.fromEntries(replacements.map(id => [id, answerFor(3)])),
    } };
    const newLink = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(Object.keys(newLink.responses)).toEqual(CURRENT_IDS);
    expect(unansweredIds(CURRENT_IDS, newLink.responses)).toEqual([]);
    for (const id of oldOnly) expect(newLink.responses[id]).toBeUndefined();
    expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, newLink, newLink));
  });

  it('renders undecided goals as uncertainty and omits them from agreement and support', () => {
    const id = 'relationship-goal-01', q = QUESTIONS.find(q => q.id === id)!;
    const a = profile({ [id]: 5 }), b = profile();
    const result = compare([q], a, b);
    const root = resultScreen(a, b, result, '#result', [q]);
    expect(root.querySelector('.score.main .num')?.textContent).toBe('—');
    const note = [...root.querySelectorAll('.plans .note')].find(n => n.querySelector('.note-label')?.textContent === 'Пока не определились');
    expect(note?.textContent).toContain(q.topic);
    expect(root.querySelector('.plans .note.support')).toBeNull();
    expect(result.relationship.spheres).toEqual([]);
  });

  it.each([
    ['relationship-format-01', 0, 5],
    ['relationship-goal-01', 0, 5],
  ])('does not present compatible or uncertain answers as opinion disagreement: %s', (id, va, vb) => {
    const q = QUESTIONS.find(q => q.id === id)!;
    expect(divergences([q], profile({ [id]: va }), profile({ [id]: vb }))).toEqual([]);
  });

  it('does not describe different conflict actions as opposite opinions', () => {
    const id = 'conflict-response-01', q = QUESTIONS.find(q => q.id === id)!;
    const groups = divergences([q], profile({ [id]: 0 }), profile({ [id]: 10 }));
    expect(groups.filter(g => g.title === 'Противоположные мнения').flatMap(g => g.rows)).toEqual([]);
  });

  it.each([
    ['conflict-response-01', 10, 10, 'стоит обсудить поведение'],
    ['conflict-response-01', 0, 3, 'конструктивный подход'],
    ['relationship-format-01', 0, 5, 'приемлемый формат есть'],
    ['relationship-format-01', 0, 10, 'общего формата нет'],
  ])('renders semantic detail for %s answers %i/%i', (id, va, vb, label) => {
    const q = QUESTIONS.find(q => q.id === id)!;
    const a = profile({ [id]: va as number }), b = profile({ [id]: vb as number });
    const root = resultScreen(a, b, compare([q], a, b), '#result');
    root.querySelector<HTMLButtonElement>('.tile')!.click();
    expect(root.querySelector('.sphere-detail .lvl')?.textContent).toBe(label);
  });
});
