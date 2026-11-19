import { describe, expect, it } from 'vitest';
import bank from '../src/questions/bank.json';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile, Question } from '../src/types';
import { compare } from '../src/scoring/compare';
import { relationshipWeight, friendshipWeight } from '../src/questions/spheres';
import { semanticRelationship } from '../src/scoring/semantic-relationship';

const questions = bank.questions as Question[];
const answer = (option: number) => answerFor(OPTION_VALUES[option - 1]);
const p = (options: Record<string, number>): Profile => ({ name: 'fixture', bankVersion: 28,
  responses: Object.fromEntries(Object.entries(options).map(([id, n]) => [id, answer(n)])) });
// Explicit complete bank fixture: tolerant stance option 1, constructive phone response option 4,
// known child/goal choices, and no shared-risk option. This does not optimize against results.
const favorable = (): Profile => p(Object.fromEntries(questions.map(q => [q.id, q.id === 'space-07' ? 4 : 1])));
const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, block: 'relationship', sphere: 'habits',
  topic: id, text: id, left: '', right: '', optional: false, ...extra });
const action = q('action', { behaviorLevels: [1, .75, .5, .25, 0] });
const base = [q('plan'), action];

describe('semantic relationship v1 fixed engineering interpretation', () => {
  it('gives complete favorable answers exactly 100 and retains the raw control', () => {
    const a = favorable(); const before = JSON.stringify([questions, a]);
    expect(semanticRelationship(questions, a, a)).toEqual({ version: 'semantic-v1', percent: 100, rawPercent: 100,
      components: { plans: 100, actions: 100, orientation: 100, reactions: 100 },
      factors: { orientation: 1, reactions: 1 }, caps: [], unknownIds: [], provisional: false });
    expect(JSON.stringify([questions, a])).toBe(before);
  });
  it('keeps aligned plans at 100 while adverse actual actions reduce the main index below 50', () => {
    const a = favorable();
    for (const [id, option] of Object.entries({ 'space-07': 1, 'conflict-response-01': 5, 'conflict-repair-01': 5,
      'intimacy-03': 5, 'conflicts-10': 5, 'relatives-08': 5 })) a.responses[id] = answer(option);
    const result = semanticRelationship(questions, a, a);
    expect(result.components.plans).toBe(100);
    expect(result.components.actions).toBeLessThan(25);
    expect(result.percent).toBeLessThanOrEqual(50);
    expect(result.caps).toEqual([]);
  });
  it('treats constructive immediate responses and agreed pauses equally', () => {
    const a = favorable(), b = favorable();
    for (const id of ['conflict-response-01', 'conflict-repair-01']) b.responses[id] = answer(2);
    expect(semanticRelationship(questions, a, b).percent).toBe(100);
  });
  it('makes an ordinary one-step preference change small and further distance monotonic', () => {
    const a = favorable(), b = favorable();
    const ordinary = questions.find(x => x.sphere === 'humor')!;
    b.responses[ordinary.id] = answer(2); const near = semanticRelationship(questions, a, b).percent!;
    b.responses[ordinary.id] = answer(3); const farther = semanticRelationship(questions, a, b).percent!;
    expect(near).toBeLessThan(100); expect(near).toBeGreaterThan(99);
    expect(farther).toBeLessThan(near); expect(farther).toBeGreaterThan(98);
  });
  it('caps known categorical child and format conflicts once, with exact choice evidence', () => {
    const a = favorable(), b = favorable();
    b.responses['kids-02'] = answer(3); b.responses['relationship-format-01'] = answer(5);
    const result = semanticRelationship(questions, a, b);
    expect(result.percent).toBe(50);
    expect(result.caps).toEqual([
      { id: 'kids-02', topic: 'сколько общих детей', reason: 'split', optionA: 1, optionB: 3, limit: 50 },
      { id: 'relationship-format-01', topic: 'моногамия', reason: 'formats', optionA: 1, optionB: 5, limit: 50 },
    ]);
    delete b.responses['kids-02']; b.responses['relationship-format-01'] = answer(2);
    expect(semanticRelationship(questions, a, b).caps).toEqual([]);
  });
  it('keeps uncertain choices unknown and never derives a cap from uncertain split data', () => {
    const qs = [...base, q('uncertain', { split: 2, uncertainOptions: [3] })];
    const result = semanticRelationship(qs, p({plan:1,action:1,uncertain:1}), p({plan:1,action:1,uncertain:3}));
    expect(result.percent).toBe(100); expect(result.caps).toEqual([]);
    expect(result.unknownIds).toEqual(['uncertain']); expect(result.provisional).toBe(true);
  });
  it('uses neutral unknown orientation/reaction factors instead of zero and reports all assigned unknowns', () => {
    const a = favorable(), b = favorable(); b.responses['relationship-goal-01'] = answer(3);
    delete b.responses['attach-03']; delete b.responses['kids-02']; b.responses['conflict-repair-01'] = 'skipped';
    const result = semanticRelationship(questions, a, b);
    expect(result.percent).toBe(100);
    expect(result.components).toEqual({plans:100,actions:100,orientation:null,reactions:null});
    expect(result.factors).toEqual({orientation:1,reactions:1});
    expect(result.unknownIds).toEqual(questions.filter(x => ['kids-02','conflict-repair-01','relationship-goal-01','attach-01'].includes(x.id)).map(x=>x.id));
    expect(result.provisional).toBe(true); expect(result.caps).toEqual([]);
  });
  it('requires calculable plans and actions and does not invent zero for either missing domain', () => {
    const cases: Record<string, number>[] = [{plan:1}, {action:1}, {}];
    for (const options of cases) {
      const result = semanticRelationship(base, p(options), p(options));
      expect(result.percent).toBeNull(); expect(result.provisional).toBe(true);
    }
  });
  it('applies the long-term orientation factor to shared short-term goals without reclassifying action quality', () => {
    const a = favorable(); a.responses['relationship-goal-01'] = answer(5);
    const result = semanticRelationship(questions, a, a);
    expect(result.percent).toBe(50); expect(result.components).toEqual({plans:100,actions:100,orientation:0,reactions:100});
    expect(result.factors.orientation).toBe(.5); expect(result.caps).toEqual([]);
  });
  it('preserves shared-risk preference semantics without assigning a new action or categorical cap', () => {
    const qs = [...base, q('risk', {sharedRisk:5})], a = p({plan:1,action:1,risk:5});
    const result = semanticRelationship(qs,a,a);
    expect(result.components.plans).toBeCloseTo(67.5); expect(result.components.actions).toBe(100);
    expect(result.percent).toBeCloseTo(Math.sqrt(6750)); expect(result.caps).toEqual([]);
  });
  it('preserves full cross sources, production weights and each persons own priorities', () => {
    const qs = [q('sport',{relationshipRule:{kind:'input_only'}}),q('accept',{cross:{id:'sport',level:[1,.75,.5,.25,0]}}),q('money',{sphere:'budget'}),action];
    const a=p({sport:1,accept:5,money:1,action:1}),b=p({sport:5,accept:1,money:5,action:1});
    a.priorities={habits:'top'}; b.priorities={budget:'top'};
    const result = semanticRelationship(qs,a,b);
    expect(result.components.plans).toBeCloseTo(Math.sqrt((1.5/2.5)*(.5/3.5))*100);
    expect(semanticRelationship(qs,b,a)).toEqual(result);
    expect(result.rawPercent).toBe(compare(qs,a,b,relationshipWeight,friendshipWeight).relationship.percent);
    delete a.responses.sport;
    expect(semanticRelationship(qs,a,b).unknownIds).toEqual(['accept']);
  });
  it('keeps typed closeness direction and source input outside the action component', () => {
    const close=q('close',{block:'maturity',relationshipRule:{kind:'closeness_cross',sourceId:'response',sourceLevels:[0,0,0,0,1],sphere:'conflicts'}});
    const qs=[...base,close,q('response',{block:'maturity'})];
    const a=p({plan:1,action:1,close:3,response:1}), b=p({plan:1,action:1,close:1,response:5});
    const result=semanticRelationship(qs,a,b);
    expect(result.components.reactions).toBeCloseTo(Math.sqrt(.5)*100);
    expect(result.components.actions).toBe(100);
    expect(result.percent).toBeCloseTo(80+20*Math.sqrt(.5));
  });
});
