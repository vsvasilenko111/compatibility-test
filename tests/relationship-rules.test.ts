import { describe, it, expect } from 'vitest';
import { compare } from '../src/scoring/compare';
import { validateBank } from '../src/questions/validate';
import { bankPrint } from '../src/questions/fingerprint';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile, Question } from '../src/types';

const q = (id: string, extra: object = {}): Question => ({ id, block: 'relationship', sphere: 'habits', text: id, left: 'L', right: 'R', topic: id, optional: false, options: ['1','2','3','4','5'], ...extra });
const p = (answers: Record<string, number>): Profile => ({ name: '', bankVersion: 27, responses: Object.fromEntries(Object.entries(answers).map(([id,n]) => [id, answerFor(OPTION_VALUES[n-1])])) });
const goal = () => q('goal', { sphere: 'contact', block: 'friendship', uncertainOptions: [3], relationshipRule: { kind: 'goal_direction', levels: [1,.75,.5,.25,0] } });
const closeness = () => q('close', { block: 'maturity', sphere: 'attachment', relationshipRule: { kind: 'closeness_cross', sourceId: 'response', sourceLevels: [0,0,0,0,1], sphere: 'conflicts' } });
const response = () => q('response', { block: 'maturity', sphere: 'attachment' });

describe('relationship-only scoring rules', () => {
  it('same short-term goals give zero relationship component without a behavioral label or reward', () => {
    const r = compare([goal()], p({goal:5}), p({goal:5}));
    expect(r.relationship.percent).toBe(0);
    expect(r.relationship.spheres[0].items[0].kind).toBe('goals');
    expect(r.relationship.superCount).toBe(0);
    expect(r.friendship.percent).toBe(100);
  });
  it('unknown goals are excluded and reported as uncertain', () => {
    const r = compare([goal()], p({goal:3}), p({goal:1}));
    expect(r.relationship.percent).toBeNull();
    expect(r.relationship.uncertain?.map(x => x.id)).toEqual(['goal']);
  });
  it('anxiety alone is neutral; only final full closure conflicts with closeness needs', () => {
    const qs = [closeness(), response()];
    for (let n=1;n<=5;n++) {
      const r = compare(qs, p({close:5,response:n}), p({close:5,response:n}));
      expect(r.relationship.percent).toBe(n === 5 ? 0 : 100);
      expect(r.relationship.spheres[0].items[0].kind).toBe('interaction');
      expect(r.relationship.superCount).toBe(0);
    }
  });
  it('sports input is excluded but the partner acceptance cross still applies', () => {
    const qs = [q('sport', { relationshipRule: {kind:'input_only'} }), q('accept', {cross:{id:'sport',level:[1,.75,.5,.25,0]}})];
    const r = compare(qs, p({sport:1,accept:5}), p({sport:5,accept:1}));
    expect(r.relationship.percent).toBe(100);
    expect(r.relationship.spheres[0].items.map(x=>x.id)).toEqual(['accept']);
    expect(compare(qs,p({sport:1,accept:5}),p({sport:1,accept:5})).relationship.percent).toBe(0);
  });
  it('preserves all friendship and auxiliary results for the original questions, including explicit sphere weights', () => {
    const qs = [goal(), closeness(), response(), q('sport',{relationshipRule:{kind:'input_only'}})];
    const legacy = qs.map(({relationshipRule: _rule,...rest}: Question & {relationshipRule?:unknown})=>rest);
    const a=p({goal:5,close:5,response:5,sport:1}), b=p({goal:1,close:2,response:4,sport:5});
    for (const weight of [undefined, (_sphere:string)=>1]) {
      const actual=compare(qs,a,b,undefined,weight), baseline=compare(legacy,a,b,undefined,weight);
      expect(actual.friendship).toEqual(baseline.friendship);
      expect(actual.maturity).toEqual(baseline.maturity);
      expect(actual.resources).toEqual(baseline.resources);
    }
  });
  it('never mutates bank questions or profiles', () => {
    const qs=[goal(),closeness(),response()], a=p({goal:5,close:5,response:5}), b=p({goal:1,close:1,response:1});
    const original=JSON.stringify([qs,a,b]);
    compare(qs,a,b);
    expect(JSON.stringify([qs,a,b])).toBe(original);
  });
  it('retains legacy no-rule similarity, cross and behavioral APIs', () => {
    expect(compare([q('a')],p({a:5}),p({a:5})).relationship.percent).toBe(100);
    expect(compare([q('a',{behaviorLevels:[1,.75,.5,.25,0]})],p({a:5}),p({a:5})).relationship.percent).toBe(0);
    expect(compare([q('a',{scored:false})],p({a:1}),p({a:5})).relationship.percent).toBeNull();
  });
});


describe('relationship rule bank metadata', () => {
  const errors = (qs: Question[]) => validateBank(qs, qs.map(q=>q.id));
  it('validates five finite levels, known sources and spheres and exclusive rule payloads', () => {
    const badRules = [
      {kind:'goal_direction',levels:[1,0]},
      {kind:'goal_direction',levels:[1,.75,NaN,.25,0]},
      {kind:'goal_direction',levels:[1,.75,.5,.25,2]},
      {kind:'closeness_cross',sourceId:'missing',sourceLevels:[0,0,0,0,1],sphere:'conflicts'},
      {kind:'closeness_cross',sourceId:'response',sourceLevels:[0,0,0,0,1],sphere:'missing'},
      {kind:'input_only',levels:[1,1,1,1,1]},
      {kind:'unknown'},
    ];
    for (const rule of badRules) expect(errors([q('a',{relationshipRule:rule}),response()]).length).toBeGreaterThan(0);
    expect(errors([response(),goal(),closeness()])).toEqual([]);
    expect(errors([closeness(),q('gap'),q('response',{block:'maturity',sphere:'attachment',options:['a','b']})]).length).toBeGreaterThan(0);
    for (const collision of [{behaviorLevels:[1,1,1,1,1]},{cross:{id:'response',level:[0,0,0,0,1]}},{formats:Array(5).fill({accepted:['a'],preferred:'a'})}])
      expect(errors([q('a',{relationshipRule:{kind:'goal_direction',levels:[1,.75,.5,.25,0]},...collision}),response()]).length).toBeGreaterThan(0);
  });
  it('omits undefined metadata from historical fingerprints and fingerprints each new rule', () => {
    const original=q('a');
    const explicit=q('a',{relationshipRule:undefined});
    for(let v=1;v<=27;v++) expect(bankPrint([original],v)).toBe(bankPrint([explicit],v));
    expect(bankPrint([q('a',{relationshipRule:{kind:'input_only'}})],28)).not.toBe(bankPrint([original],28));
    expect(bankPrint([goal()],28)).not.toBe(bankPrint([q('goal',{...goal(),relationshipRule:{kind:'goal_direction',levels:[0,0,0,0,0]}})],28));
  });
});
