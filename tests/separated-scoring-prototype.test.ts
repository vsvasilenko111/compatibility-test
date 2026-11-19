import { describe, expect, it } from 'vitest';
import type { Profile, Question } from '../src/types';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { compare } from '../src/scoring/compare';
import { relationshipWeight, friendshipWeight } from '../src/questions/spheres';
import bankJson from '../research/blind/target-v20/v28-implementation/candidate-bank-v28.json';
import { separatedScore } from '../research/blind/target-v20/scoring-v2-prototype/model';

const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, block: 'relationship', sphere: 'habits', text: id, left: 'L', right: 'R', topic: id, optional: false, options: ['1','2','3','4','5'], ...extra });
const p = (values: Record<string, number>): Profile => ({ name: 'saved', bankVersion: 28, responses: Object.fromEntries(Object.entries(values).map(([id,n]) => [id, answerFor(OPTION_VALUES[n-1])])) });
const goal = q('goal', { uncertainOptions: [3], relationshipRule: {kind:'goal_direction',levels:[1,.75,.5,.25,0]} });
const close = q('close', { block:'maturity', sphere:'attachment', relationshipRule:{kind:'closeness_cross',sourceId:'response',sourceLevels:[0,0,0,0,1],sphere:'conflicts'} });
const response = q('response', {block:'maturity'});

describe('research separated scoring', () => {
  it('partitions eligible questions once, with typed rules taking precedence over source block/behavior', () => {
    const qs = [q('preference'), q('action',{behaviorLevels:[1,.75,.5,.25,0]}), goal, close, response, q('excluded',{scored:false}), q('source',{relationshipRule:{kind:'input_only'}})];
    const a=p(Object.fromEntries(qs.map(x=>[x.id,1]))), result=separatedScore(qs,a,a);
    expect(Object.fromEntries(Object.entries(result.domains).map(([key,d])=>[key,d.questionIds]))).toEqual({preferences:['preference'],orientation:['goal'],actions:['action'],reactions:['close']});
    const ids=Object.values(result.domains).flatMap(d=>d.questionIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.referencePercent).toBe(compare(qs,a,a,relationshipWeight,friendshipWeight).relationship.percent);
    expect(result).not.toHaveProperty('overallPercent');
  });
  it('retains input-only source answers, directional tolerance, and original profile priorities', () => {
    const qs=[q('sport',{relationshipRule:{kind:'input_only'}}),q('accept',{cross:{id:'sport',level:[1,.75,.5,.25,0]}}),q('money',{sphere:'budget'})];
    const a=p({sport:1,accept:5,money:1}), b=p({sport:5,accept:1,money:5});
    a.priorities={habits:'top'}; b.priorities={budget:'top'};
    const before=JSON.stringify([qs,a,b]);
    const actual=separatedScore(qs,a,b);
    expect(actual.domains.preferences.percent).toBe(compare(qs,a,b,relationshipWeight,friendshipWeight).relationship.percent);
    expect(actual.domains.preferences.percent).toBeCloseTo(Math.sqrt((1.5/2.5)*(.5/3.5))*100);
    expect(actual.domains.preferences.comparableCount).toBe(2);
    expect(separatedScore(qs,b,a).domains).toEqual(actual.domains);
    expect(JSON.stringify([qs,a,b])).toBe(before);
  });
  it('preserves the cross-direction geometric mean and a missing source as unknown', () => {
    const qs=[close,response], a=p({close:3,response:1}), b=p({close:1,response:5});
    expect(separatedScore(qs,a,b).domains.reactions.percent).toBeCloseTo(Math.sqrt(.5)*100);
    delete a.responses.response;
    expect(separatedScore(qs,a,b).domains.reactions).toEqual({percent:null,questionIds:['close'],comparableCount:0,uncertainIds:['close']});
    a.responses.response='skipped';
    expect(separatedScore(qs,a,b).domains.reactions.percent).toBeNull();
  });
  it('keeps an agreed pause distinct from closure without judging closeness needs alone', () => {
    const qs=[close,response];
    const needy=p({close:5,response:4});
    expect(separatedScore(qs,needy,needy).domains.reactions.percent).toBe(100);
    const closed=p({close:5,response:5});
    expect(separatedScore(qs,closed,closed).domains.reactions.percent).toBe(0);
    const untroubled=p({close:1,response:5});
    expect(separatedScore(qs,untroubled,untroubled).domains.reactions.percent).toBe(100);
  });
  it('separates adverse shared actions from aligned preferences and short-term goals from action quality', () => {
    const qs=[q('plan'),q('act',{behaviorLevels:[1,.75,.5,.25,0]}),goal];
    const a=p({plan:1,act:5,goal:5}), result=separatedScore(qs,a,a);
    expect(result.domains.preferences.percent).toBe(100);
    expect(result.domains.actions.percent).toBe(0);
    expect(result.domains.orientation.percent).toBe(0);
    expect(result.domains.actions.questionIds).toEqual(['act']);
    a.responses.goal=answerFor(5);
    expect(separatedScore(qs,a,a).domains.orientation).toEqual({percent:null,questionIds:['goal'],comparableCount:0,uncertainIds:['goal']});
  });
  it('treats missing own answers as unknown and empty domains as null', () => {
    const r=separatedScore([q('missing')],p({}),p({missing:1}));
    expect(r.domains.preferences.uncertainIds).toEqual(['missing']);
    expect(r.domains.actions).toEqual({percent:null,questionIds:[],comparableCount:0,uncertainIds:[]});
  });
  it('uses production weighting and private goal/reaction rules for the complete bank without mutation', () => {
    const qs=bankJson.questions as Question[], a=p(Object.fromEntries(qs.map((x,i)=>[x.id,1+i%5]))), b=p(Object.fromEntries(qs.map((x,i)=>[x.id,5-i%5])));
    a.priorities={conflicts:'top',budget:'top'}; b.priorities={habits:'top',kids:'top'};
    const before=JSON.stringify([qs,a,b]), result=separatedScore(qs,a,b);
    expect(result.referencePercent).toBe(compare(qs,a,b,relationshipWeight,friendshipWeight).relationship.percent);
    for (const d of Object.values(result.domains)) expect(d.percent).toBe(compare(qs.filter(x=>d.questionIds.includes(x.id)),a,b,relationshipWeight,friendshipWeight).relationship.percent);
    expect(JSON.stringify([qs,a,b])).toBe(before);
    expect(qs).toHaveLength(123);
    expect(qs.some(x=>x.firm)).toBe(false);
  });
});

describe('explicit declared conditions only', () => {
  const qs=[q('children',{firm:true})], a=p({children:1}), b=p({children:5});
  it('never infers a declaration from firm metadata, answer extremes, or historical marks', () => {
    const marked=p({children:1}); (marked.responses.children as ReturnType<typeof answerFor>).firm=true;
    expect(separatedScore(qs,marked,b).conditions).toEqual({collectionStatus:'not_collected',assessmentStatus:'unknown',assessments:[]});
    expect(separatedScore(qs,a,b,{a:[],b:[]}).conditions).toEqual({collectionStatus:'collected',assessmentStatus:'all_declared_met',assessments:[]});
    expect(separatedScore(qs,a,b,{a:[]}).conditions.assessmentStatus).toBe('unknown');
  });
  it('tests the OTHER persons actual accepted option and keeps violations visible without a percentage penalty', () => {
    const input={a:[{questionId:'children',acceptedOptions:[1,2]}],b:[]};
    const result=separatedScore(qs,a,b,input);
    expect(result.conditions).toEqual({collectionStatus:'collected',assessmentStatus:'has_violations',assessments:[{owner:'a',id:'children',topic:'children',acceptedOptions:[1,2],actualOption:5,status:'violated'}]});
    expect(result.referencePercent).toBe(separatedScore(qs,a,b).referencePercent);
    expect(separatedScore(qs,a,a,input).conditions.assessmentStatus).toBe('all_declared_met');
    expect(separatedScore(qs,a,b,{b:[{questionId:'children',acceptedOptions:[1]}]}).conditions.assessments[0].status).toBe('met');
    expect(separatedScore(qs,a,b,{a:input.a}).conditions.assessmentStatus).toBe('has_violations');
    const aligned=p({children:5});
    expect(separatedScore(qs,aligned,b,input).domains.preferences.percent).toBe(100);
    expect(separatedScore(qs,aligned,b,input).conditions.assessmentStatus).toBe('has_violations');
  });
  it('keeps partial met declarations and missing answers unknown', () => {
    const req={questionId:'children',acceptedOptions:[5]};
    expect(separatedScore(qs,a,b,{a:[req]}).conditions.assessmentStatus).toBe('unknown');
    for(const target of [p({}),{...p({}),responses:{children:'skipped' as const}}]) {
      const result=separatedScore(qs,a,target,{a:[req],b:[]}).conditions;
      expect(result.assessmentStatus).toBe('unknown');
      expect(result.assessments[0]).toMatchObject({actualOption:null,status:'unknown'});
    }
  });
  it('rejects unknown IDs, empty accepted sets, duplicate requirements/options and non-options', () => {
    const invalid=[ [{questionId:'nope',acceptedOptions:[1]}], [{questionId:'children',acceptedOptions:[]}], [{questionId:'children',acceptedOptions:[1,1]}], [{questionId:'children',acceptedOptions:[0]}], [{questionId:'children',acceptedOptions:[6]}], [{questionId:'children',acceptedOptions:[1.5]}], [{questionId:'children',acceptedOptions:[NaN]}], [{questionId:'children',acceptedOptions:[1]},{questionId:'children',acceptedOptions:[2]}] ];
    for(const requirements of invalid) expect(()=>separatedScore(qs,a,b,{a:requirements})).toThrow();
  });
});
