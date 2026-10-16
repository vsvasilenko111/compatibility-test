import { describe, it, expect } from 'vitest';
import { resources } from '../src/scoring/resources';
import { answerFor } from '../src/answer';
import type { Profile, Question } from '../src/types';

const q = (id: string, block: Question['block'] = 'maturity'): Question => ({ id, block, sphere: 'regulation', text: 't', left: 'l', right: 'r', topic: id, optional: true });
const QS = [q('conflicts-02', 'friendship'), q('regul-01'), q('regul-07'), q('regul-02'), q('regul-06'), q('attach-01'), q('attach-03'), q('reflect-03')];
const p = (vals: Record<string, number | 'skipped'>): Profile => ({
  name: '', bankVersion: 9,
  responses: Object.fromEntries(Object.entries(vals).map(([id, v]) => [id, v === 'skipped' ? 'skipped' : answerFor(v)])),
});

describe('ресурсы пары', () => {
  it('уровень — среднее двоих: 0+2 → получается, 4+6 → в целом, 8+6 → зона роста', () => {
    const a = p({ 'regul-01': 0, 'regul-07': 0, 'conflicts-02': 0, 'regul-02': 4, 'regul-06': 4, 'attach-01': 8, 'attach-03': 8, 'reflect-03': 8 });
    const b = p({ 'regul-01': 2, 'regul-07': 2, 'conflicts-02': 2, 'regul-02': 6, 'regul-06': 6, 'attach-01': 6, 'attach-03': 6, 'reflect-03': 6 });
    expect(resources(QS, a, b)!.map((r) => [r.key, r.level])).toEqual([['argue', 'strong'], ['cool', 'ok'], ['support', 'grow']]);
  });
  it('измерение без ответов у одного из двоих пропускается', () => {
    const a = p({ 'regul-01': 1, 'regul-02': 'skipped', 'regul-06': 'skipped' });
    const b = p({ 'regul-01': 1, 'regul-02': 3 });
    expect(resources(QS, a, b)!.map((r) => r.key)).toEqual(['argue']);
  });
  it('без ответов на вопросы об эмоциях (старая ссылка) — null, даже если есть вопрос о ссорах', () => {
    expect(resources(QS, p({ 'conflicts-02': 1 }), p({ 'conflicts-02': 2, 'regul-01': 3 }))).toBeNull();
  });
});
