import { describe, expect, it } from 'vitest';
import * as v31 from '../research/blind/target-v20/legacy-questions-v31';
import * as v36 from '../research/blind/target-v20/legacy-questions-v36';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v37';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const removed = ['love-words-01-r32', 'love-care-01-r32'];
const oldProfile = (bank: typeof v31): Profile => ({ name: 'Аня', bankVersion: bank.BANK_VERSION,
  responses: Object.fromEntries(bank.CURRENT_IDS.map((id, index) => [id, answerFor(OPTION_VALUES[index % 5])])) });

describe('v37 restores the approved words-or-actions question', () => {
  it('restores the exact complete v31 roles-01 object at the words position and preserves all 117 other questions', () => {
    expect(BANK_VERSION).toBe(37);
    expect(QUESTIONS).toHaveLength(118);
    expect(QUESTIONS.find(q => q.id === 'roles-01')).toEqual(v31.QUESTIONS.find(q => q.id === 'roles-01'));
    expect(CURRENT_IDS).toEqual(v36.CURRENT_IDS.filter(id => id !== removed[1]).map(id => id === removed[0] ? 'roles-01' : id));
    expect(QUESTIONS.some(q => removed.includes(q.id))).toBe(false);
    const unchanged = QUESTIONS.filter(q => q.id !== 'roles-01');
    expect(unchanged).toHaveLength(117);
    expect(unchanged).toEqual(v36.QUESTIONS.filter(q => !removed.includes(q.id)));
    expect(CURRENT_IDS).toContain('budget-arrangement-r36'); expect(CURRENT_IDS).toContain('life-13-r32');
  });
  it('preserves raw v36 importance responses and asks only roles-01; re-encoding the completed current profile drops the two withdrawn IDs', () => {
    const old = oldProfile(v36);
    const restored = decode(encode(old, v36.CURRENT_IDS, v36.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    for (const id of removed) expect(restored.responses[id]).toEqual(old.responses[id]);
    expect(restored.responses).not.toHaveProperty('roles-01');
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(['roles-01']);
    const filled: Profile = { ...restored, bankVersion: BANK_VERSION, responses: { ...restored.responses, 'roles-01': answerFor(7) } };
    const current = decode(encode(filled, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(Object.keys(current.responses)).toHaveLength(118);
    expect(current.responses['roles-01']).toEqual(answerFor(7));
    for (const id of removed) expect(current.responses).not.toHaveProperty(id);
    for (const id of CURRENT_IDS.filter(id => id !== 'roles-01')) expect(current.responses[id]).toEqual(restored.responses[id]);
    expect(unansweredIds(CURRENT_IDS, current.responses)).toEqual([]);
  });
  it('keeps v31 roles-01 answers unchanged and does not ask that question again', () => {
    const old = oldProfile(v31);
    const restored = decode(encode(old, v31.CURRENT_IDS, v31.CURRENT_FIRM), MANIFEST, FIRM);
    expect(restored).toEqual(old);
    expect(restored.responses['roles-01']).toEqual(old.responses['roles-01']);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).not.toContain('roles-01');
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(['budget-arrangement-r36', 'life-13-r32', 'feedback-01-r32']);
  });
  it('preserves all historical manifests through v36 and the frozen v31/v36 bank order', () => {
    const historical = Object.fromEntries(Object.entries(MANIFEST).filter(([version]) => Number(version) <= 36));
    let hash = 2166136261;
    for (const character of JSON.stringify(historical)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    expect(hash >>> 0).toBe(3351632503);
    expect(MANIFEST[31]).toEqual(v31.QUESTIONS.map(q => q.id));
    expect(MANIFEST[36]).toEqual(v36.QUESTIONS.map(q => q.id));
    for (const version of Object.keys(v36.FIRM)) expect(FIRM[Number(version)]).toEqual(v36.FIRM[Number(version)]);
  });
});
