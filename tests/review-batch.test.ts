import { describe, it, expect } from 'vitest';
import { BANK_VERSION, QUESTIONS, CURRENT_IDS, CURRENT_FIRM, MANIFEST, FIRM } from '../research/blind/target-v20/legacy-questions-v21';
import { compare } from '../src/scoring/compare';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { unansweredIds } from '../src/ui/flow';
import { verdict } from '../src/ui/verdict';
import { sphereDetail } from '../src/ui/result-view';
import { bankPrint } from '../src/questions/fingerprint';
import type { Profile } from '../src/types';

const ids = ['kids-timing-01','relationship-format-01','living-plan-01','conflict-response-01','conflict-repair-01','personal-purchase-01'];
const person = (overrides: Record<string,number> = {}): Profile => ({ name: '', bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(OPTION_VALUES[(overrides[q.id] ?? 1)-1])])),
});
function single(id: string, a: number, b: number) {
  const q = QUESTIONS.find(q => q.id === id);
  expect(q, id).toBeDefined();
  return compare([q!],person({[id]:a}),person({[id]:b})).relationship;
}

describe('reviewed question batch', () => {
  it('releases one coherent bank with six replacement questions and one merged duplicate', () => {
    expect(BANK_VERSION).toBe(21);
    expect(QUESTIONS).toHaveLength(136);
    for (const id of ids) expect(CURRENT_IDS).toContain(id);
    for (const id of ['kids-08','space-08','living-03','conflicts-02','conflicts-03','budget-02','reflect-02']) expect(CURRENT_IDS).not.toContain(id);
    for (const q of QUESTIONS) { expect(q.options).toHaveLength(5); expect(q.optional).toBe(false); }
  });
  it('does not reward a second person adopting shouting or punitive silence', () => {
    for (const id of ['conflict-response-01','conflict-repair-01']) {
      const one = single(id,1,5), both=single(id,5,5);
      expect(both.percent).toBeLessThanOrEqual(one.percent!);
      expect(both.percent).toBe(0);
      expect(both.superMatches).toEqual([]);
      expect(sphereDetail(both.spheres[0].items)[0].label).toBe('стоит обсудить поведение');
      expect(both.talkZones.map(x=>x.id)).toContain(id);
      expect(single(id,1,2).percent).toBe(100);
    }
  });
  it('compares acceptable formats, not willingness to discuss the topic', () => {
    expect(single('relationship-format-01',1,2).percent).toBe(100);
    expect(single('relationship-format-01',1,3).percent).toBe(100);
    const incompatible=single('relationship-format-01',1,5);
    expect(incompatible.percent).toBe(0);
    expect(sphereDetail(incompatible.spheres[0].items)[0].label).toBe('общего формата нет');
    expect(single('relationship-format-01',2,4).percent).toBe(75);
  });
  it('keeps uncertainty as an answer without inventing goal agreement', () => {
    const id='relationship-goal-01';
    const result=single(id,3,3);
    expect(result.percent).toBeNull();
    expect(result.uncertain?.map(q=>q.id)).toEqual([id]);
    const all=compare(QUESTIONS,person({[id]:3}),person({[id]:3}));
    expect(verdict(all)).toMatch(/определ|неяс|обсуд/);
  });
  it('puts no children first without treating it as a small timing difference', () => {
    const q=QUESTIONS.find(q=>q.id==='kids-timing-01')!;
    expect(q).toBeDefined();
    expect(q.options![0]).toBe('Детей не хочу');
    expect(single(q.id,1,2).percent).toBeLessThanOrEqual(35);
    expect(single(q.id,1,5).percent).toBe(0);
    expect(single(q.id,2,3).percent).toBe(75);
  });
  it('retains v20 answers and asks only for changed meanings', () => {
    const old: Profile={name:'Аня',bankVersion:20,responses:Object.fromEntries(MANIFEST[20].map(id=>[id,answerFor(7)]))};
    const restored=decode(encode(old,MANIFEST[20],FIRM[20]??[]),MANIFEST,FIRM);
    expect(unansweredIds(CURRENT_IDS,restored.responses).sort()).toEqual([...ids].sort());
    const upgraded={...restored,bankVersion:BANK_VERSION,responses:{...restored.responses,...Object.fromEntries(ids.map(id=>[id,answerFor(3)]))}};
    const decoded=decode(encode(upgraded,CURRENT_IDS,CURRENT_FIRM),MANIFEST,FIRM);
    expect(unansweredIds(CURRENT_IDS,decoded.responses)).toEqual([]);
    expect(decoded.responses['kids-02']).toEqual(restored.responses['kids-02']);
  });
  it('fingerprints new scoring metadata as part of the release', () => {
    const changed=QUESTIONS.map(q=>q.id==='conflict-response-01'?{...q,behaviorLevels:[1,1,.75,.25,0]}:q);
    expect(bankPrint(changed,BANK_VERSION)).not.toBe(bankPrint(QUESTIONS,BANK_VERSION));
  });
  it('uses action levels for resource feedback instead of elapsed resentment', () => {
    const good=compare(QUESTIONS,person({'conflict-response-01':2,'conflict-repair-01':2}),person({'conflict-response-01':2,'conflict-repair-01':2}));
    expect(good.resources?.find(r=>r.key==='argue')?.level).toBe('strong');
    expect(good.resources?.find(r=>r.key==='cool')?.level).toBe('strong');
    const bad=compare(QUESTIONS,person({'conflict-repair-01':5}),person({'conflict-repair-01':5}));
    expect(bad.resources?.find(r=>r.key==='cool')?.level).toBe('grow');
  });
});
