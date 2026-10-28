import { describe, it, expect } from 'vitest';
import { resources } from '../src/scoring/resources';
import { answerFor } from '../src/answer';
import type { Profile, Question } from '../src/types';

const q = (id: string, block: Question['block'] = 'maturity'): Question => ({ id, block, sphere: 'regulation', text: 't', left: 'l', right: 'r', topic: id, optional: true });
const QS = [q('conflicts-02', 'friendship'), q('conflicts-03', 'friendship'), q('attach-01'), q('attach-03'), q('reflect-03')];
const p = (vals: Record<string, number | 'skipped'>): Profile => ({
  name: '', bankVersion: 9,
  responses: Object.fromEntries(Object.entries(vals).map(([id, v]) => [id, v === 'skipped' ? 'skipped' : answerFor(v)])),
});

describe('ресурсы пары', () => {
  it('уровень — среднее двоих: 0+3 → получается, 5+5 → в целом, 7+7 → зона роста', () => {
    const a = p({ 'conflicts-02': 0, 'conflicts-03': 5, 'attach-01': 7, 'attach-03': 7, 'reflect-03': 7 });
    const b = p({ 'conflicts-02': 3, 'conflicts-03': 5, 'attach-01': 7, 'attach-03': 7, 'reflect-03': 7 });
    expect(resources(QS, a, b)!.map((r) => [r.key, r.level])).toEqual([['argue', 'strong'], ['cool', 'ok'], ['support', 'grow']]);
  });
  it('«отпускать после ссоры» с v16 — по conflicts-03 и общим порогам: 0+0 → получается, 7+7 → зона роста', () => {
    const level = (v: number) => resources(QS, p({ 'conflicts-03': v, 'attach-01': 0 }), p({ 'conflicts-03': v, 'attach-01': 0 }))!.find((r) => r.key === 'cool')!.level;
    expect([level(0), level(7)]).toEqual(['strong', 'grow']);
  });
  it('измерение без ответов у одного из двоих пропускается', () => {
    const a = p({ 'conflicts-02': 1, 'conflicts-03': 'skipped', 'attach-03': 1 });
    const b = p({ 'conflicts-02': 1, 'conflicts-03': 3, 'attach-03': 1 });
    expect(resources(QS, a, b)!.map((r) => r.key)).toEqual(['argue', 'support']);
  });
  it('без ответов на вопросы об эмоциях (старая ссылка) — null, даже если есть вопрос о ссорах', () => {
    expect(resources(QS, p({ 'conflicts-02': 1 }), p({ 'conflicts-02': 2, 'conflicts-03': 3 }))).toBeNull();
  });
});
