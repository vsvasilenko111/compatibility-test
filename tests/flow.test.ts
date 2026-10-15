import { describe, it, expect } from 'vitest';
import { resumeFor } from '../src/ui/flow';
import type { Progress } from '../src/storage';

const saved: Progress = { name: 'Аня', index: 3, inviterCode: 'old', responses: { 'kids-01': 'skipped' } };

describe('resumeFor', () => {
  it('нет сохранённого → null', () => {
    expect(resumeFor(null, 'x', 10)).toBeNull();
  });
  it('другой пригласивший: те же ответы, новый inviterCode', () => {
    expect(resumeFor(saved, 'new', 10)).toEqual({ ...saved, inviterCode: 'new' });
    expect(resumeFor(saved, null, 10)).toEqual({ ...saved, inviterCode: null });
  });
  it('индекс ограничивается [0, total]', () => {
    expect(resumeFor({ ...saved, index: -4 }, null, 10)?.index).toBe(0);
    expect(resumeFor({ ...saved, index: 99 }, null, 10)?.index).toBe(10);
  });
});
