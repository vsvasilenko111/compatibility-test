import {describe,it,expect} from 'vitest';
import frozenBank from '../research/blind/target-v20/score-resolution/candidate-bank-v27.json';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {compare,PRIORITY_FACTOR} from '../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../src/questions/spheres';
import type {Profile,Question} from '../src/types';
import {relationshipScore} from '../research/blind/target-v20/iterations/I008-goal-alignment/candidate';
const bank = frozenBank as { questions: Question[] };
const goal = bank.questions.find(q=>q.id==='relationship-goal-01')!;
function profile(n:number,other=1,priorities:Profile['priorities']={}):Profile{return {name:'test',bankVersion:27,responses:{[goal.id]:answerFor(OPTION_VALUES[n-1]),preference:answerFor(OPTION_VALUES[other-1])},priorities};}
const score=(a:number,b:number)=>relationshipScore([goal],profile(a),profile(b));
describe('I008 research long-term direction component, never a judgment of people',()=>{
 it('both explicitly wanting long-term score 100; both not wanting it score 0 in this horizon component',()=>{expect(score(1,1)).toBe(100);expect(score(5,5)).toBe(0);});
 it('uncertain goal is excluded before numeric direction, including mixed uncertain answers',()=>{expect(score(3,3)).toBeNull();expect(score(1,3)).toBeNull();});
 it('one quarter-direction and one full-direction aggregate to 50 through existing geometric mean',()=>{expect(score(4,1)).toBe(50);expect(score(1,4)).toBe(50);expect(score(2,2)).toBe(75);});
 it('existing ordinary preference scoring remains unchanged',()=>{const q={...goal,id:'preference',uncertainOptions:undefined};expect(relationshipScore([q],profile(1,5),profile(5,5))).toBe(compare([q],profile(1,5),profile(5,5),relationshipWeight,friendshipWeight).relationship.percent);});
 it('moving a defined goal away from long-term never increases the horizon component',()=>{for(const other of [1,2,4,5]){const vals=[1,2,4,5].map(n=>score(n,other)!);for(let i=1;i<vals.length;i++)expect(vals[i]).toBeLessThanOrEqual(vals[i-1]);}});
 it('retains own priorities, coefficients, all original bank metadata and 123 meanings',()=>{
  const before=JSON.stringify(bank),q:Question={...goal,id:'preference',sphere:'money',uncertainOptions:undefined};
  const qs=[goal,q],a=profile(1,1,{loyalty:'top'}),b=profile(4,5,{money:'top'});
  const g=relationshipWeight('loyalty'),m=relationshipWeight('money');
  const sa=(3*g*.25+m*0)/(3*g+m),sb=(g*1+3*m*0)/(g+3*m);
  expect(relationshipScore(qs,a,b)).toBeCloseTo(Math.sqrt(sa*sb)*100,12);
  expect(PRIORITY_FACTOR).toEqual({top:3,low:1});expect(g).toBe(1);
  relationshipScore(bank.questions,a,b);expect(JSON.stringify(bank)).toBe(before);expect(bank.questions).toHaveLength(123);
  expect(goal.uncertainOptions).toEqual([3]);expect(goal.behaviorLevels).toBeUndefined();
 });
});
