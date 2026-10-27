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
  it('уровень — среднее двоих: 0+3 → получается, «отпускать» 3+3 → в целом (свой порог 0,65), 7+7 → зона роста', () => {
    const a = p({ 'regul-01': 0, 'regul-07': 0, 'conflicts-02': 0, 'regul-02': 3, 'regul-06': 3, 'attach-01': 7, 'attach-03': 7, 'reflect-03': 7 });
    const b = p({ 'regul-01': 3, 'regul-07': 3, 'conflicts-02': 3, 'regul-02': 3, 'regul-06': 3, 'attach-01': 7, 'attach-03': 7, 'reflect-03': 7 });
    expect(resources(QS, a, b)!.map((r) => [r.key, r.level])).toEqual([['argue', 'strong'], ['cool', 'ok'], ['support', 'grow']]);
  });
  it('«отпускать после ссоры»: 0+0 → получается, 5+5 → зона роста (пороги 0,85 и 0,65)', () => {
    const level = (v: number) => resources(QS, p({ 'regul-02': v, 'regul-06': v }), p({ 'regul-02': v, 'regul-06': v }))!.find((r) => r.key === 'cool')!.level;
    expect([level(0), level(5)]).toEqual(['strong', 'grow']);
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
