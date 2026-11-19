// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/questions';
import { answerFor } from '../src/answer';
import { compare, type SphereItem } from '../src/scoring/compare';
import { resultScreen } from '../src/ui/screens/result';
import { sphereDetail } from '../src/ui/result-view';
import type { Profile, Question } from '../src/types';

const q = (id: string, extra: Record<string, unknown> = {}): Question => ({ id, text: id, topic: id,
  block: 'relationship', sphere: 'values', optional: false, left: 'a', right: 'b',
  options: ['A', 'B', 'Не знаю', 'D', 'E'], ...extra } as Question);
const goals = q('goals', { uncertainOptions: [3], relationshipRule: { kind: 'goal_direction', levels: [1, .75, .5, .25, 0] } });
const sport = q('sport', { block: 'friendship', sphere: 'life', relationshipRule: { kind: 'input_only' } });
const anxiety = q('attach-01', { block: 'maturity', sphere: 'attachment', relationshipRule:
  { kind: 'closeness_cross', sourceId: 'attach-03', sourceLevels: [0, 0, 0, 0, 1], sphere: 'conflicts' } });
const profile = (values: Record<string, number>): Profile => ({ name: 'A', bankVersion: 28,
  responses: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, answerFor(value)])) });
function render(qs: Question[], a: Profile, b: Profile) { return resultScreen(a, b, compare(qs, a, b), 'https://example.com', qs); }
const headings = (root: HTMLElement) => [...root.querySelectorAll('.answer-group h4')].map(x => x.textContent);

describe('I010 result semantics', () => {
  it('labels low goal direction and interaction without moral or similarity judgments in the actual map', () => {
    const a = profile({ goals: 10 });
    const result = compare([goals], a, a);
    result.relationship.spheres = [{ sphere: 'values', percent: 0, items: [
      { id: 'g', topic: 'Планы', match: 0, kind: 'goals' } as SphereItem,
      { id: 'i', topic: 'Контакт', match: 0, kind: 'interaction' } as SphereItem] }];
    const root = resultScreen(a, a, result, 'https://example.com', [goals]);
    root.querySelector<HTMLButtonElement>('.tile')!.click();
    const text = root.querySelector('.sphere-detail')!.textContent!;
    expect(text).toContain('нет общего долгосрочного ориентира');
    expect(text).toContain('стоит обсудить дистанцию и контакт');
    expect(text).not.toMatch(/поведение|противоположно/);
  });
  it('distinguishes stronger goal direction and compatible reactions', () => {
    const items = [{ id: 'g', topic: 'G', match: .75, kind: 'goals' }, { id: 'i', topic: 'I', match: 1, kind: 'interaction' }] as SphereItem[];
    expect(sphereDetail(items).map(x => x.label)).toEqual(['есть настрой на длительные отношения', 'реакции сочетаются']);
  });
  it('keeps sports answers visible without a false source mismatch', () => {
    const root = render([sport], profile({ sport: 0 }), profile({ sport: 10 }));
    expect(headings(root)).toEqual([]);
    expect(root.querySelector('.answers details')!.textContent).toContain('Все ответы — 1');
    expect(root.querySelector('.answers details')!.textContent).toContain('sport');
  });
  it('uses full profiles for coupling even when the source question is not selected', () => {
    const root = render([anxiety], profile({ 'attach-01': 10, 'attach-03': 10 }), profile({ 'attach-01': 10, 'attach-03': 0 }));
    expect(headings(root)).toEqual(['Сочетания реакций — 2']);
    const source = QUESTIONS.find(q => q.id === 'attach-03')!;
    const group = root.querySelector('.answer-group')!;
    expect(group.textContent).toContain(source.text);
    expect(group.textContent).toContain(source.options![4]);
    expect(group.textContent).toContain(source.options![0]);
    expect(root.querySelector('.answer-group .answer.far')).toBeNull();
    expect(render([anxiety], profile({ 'attach-01': 10, 'attach-03': 0 }), profile({ 'attach-01': 10, 'attach-03': 0 })).querySelector('.answer-group')).toBeNull();
  });
  it('shows original source answers once in the interaction group while retaining other maturity differences', () => {
    const source = q('attach-03', { block: 'maturity', sphere: 'attachment', text: 'Как вы отвечаете на трудный момент?',
      options: ['Открыто говорю', 'B', 'C', 'D', 'Замыкаюсь'] });
    const other = q('other-emotion', { block: 'maturity', sphere: 'reflection' });
    const root = render([anxiety, source, other],
      profile({ 'attach-01': 10, 'attach-03': 10, 'other-emotion': 0 }),
      profile({ 'attach-01': 10, 'attach-03': 0, 'other-emotion': 10 }));
    expect(headings(root)).toEqual(['Сочетания реакций — 2', 'Противоположные мнения — 1']);
    const group = root.querySelector('.answer-group')!;
    expect([...group.querySelectorAll('.answer-q')].map(x => x.textContent)).toEqual([anxiety.text, source.text]);
    expect(group.textContent).toContain('Открыто говорю');
    expect(group.textContent).toContain('Замыкаюсь');
    expect(group.querySelector('.answer.far')).toBeNull();
    expect(root.querySelectorAll('.answer-group')[1].textContent).not.toContain(source.text);
  });
  it('groups only actual differing goal choices requiring discussion; equal short-term and unknown are not disagreements', () => {
    expect(headings(render([goals], profile({ goals: 0 }), profile({ goals: 10 })))).toEqual(['Планы на длительные отношения — 1']);
    expect(headings(render([goals], profile({ goals: 10 }), profile({ goals: 10 })))).toEqual([]);
    const root = render([goals], profile({ goals: 5 }), profile({ goals: 10 }));
    expect(headings(root)).toEqual([]);
    expect(root.querySelector('.plans')!.textContent).toContain('Пока не определились');
  });
  it('preserves ordinary maturity answer differences when there is no main-only rule', () => {
    const ordinary = q('past', { block: 'maturity', sphere: 'past' });
    expect(headings(render([ordinary], profile({ past: 0 }), profile({ past: 10 })))).toEqual(['Противоположные мнения — 1']);
  });
  it('explains context, acceptance and the one interaction without saying every emotion is excluded', () => {
    const text = render([goals], profile({ goals: 10 }), profile({ goals: 10 })).textContent!;
    expect(text).toContain('совместимость в длительных отношениях');
    expect(text).toContain('не оценка человека');
    expect(text).toContain('Спорт учитывается через приемлемость привычки партнёра');
    expect(text).toContain('Одно сочетание реакций');
    expect(text).not.toContain('Вопросы об эмоциях и прошлом опыте на проценты не влияют');
  });
});
