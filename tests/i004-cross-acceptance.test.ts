import frozenBank from '../research/blind/target-v20/v26-rollback/candidate-bank-v26.json';
import {describe,it,expect} from 'vitest';
import type {Profile,Question} from '../src/types';
import {answerFor} from '../src/answer';
import {compare} from '../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../src/questions/spheres';
import {scoringView,relationshipScore} from '../research/blind/target-v20/iterations/I004-cross-acceptance/candidate';
const bank=frozenBank.questions as Question[];
const sport=bank.filter(q=>['life-01','life-02'].includes(q.id));
const person=(habit:number,tolerance:number):Profile=>({name:'a',bankVersion:26,responses:{'life-01':answerFor(habit),'life-02':answerFor(tolerance)}});
describe('I004 cross source acceptance hypothesis, offline only',()=>{
 it('removes raw sport similarity when both accept the actual difference',()=>{
  const a=person(0,0),b=person(10,0);
  expect(compare(sport,a,b,relationshipWeight,friendshipWeight).relationship.percent).toBe(50);
  expect(relationshipScore(sport,a,b)).toBe(100);
 });
 it('retains directional intolerance to the actual nontraining exposure',()=>{
  // life-01 first option is active (exposure 0), last is nontraining (exposure 1).
  const a=person(10,0),b=person(10,10);
  expect(relationshipScore(sport,a,b)).toBe(0);
  expect(relationshipScore(sport,person(0,0),person(10,10))).toBe(100);
 });
 it('reads unscored source responses and refuses missing source answers',()=>{
  const a=person(10,0),b=person(10,10);
  expect(scoringView(sport).find(q=>q.id==='life-01')!.scored).toBe(false);
  expect(relationshipScore(sport,a,b)).toBe(0);
  delete a.responses['life-01'];expect(relationshipScore(sport,a,b)).toBeNull();
 });
 it('applies the rule generically to every cross source including a new ID',()=>{
  const qs=[{...sport[0],id:'novel-source'},{...sport[1],cross:{...sport[1].cross!,id:'novel-source'}}];
  expect(scoringView(qs)[0].scored).toBe(false);
 });
 it('preserves all 125 original objects, meanings, metadata and the three already unscored inputs',()=>{
  const before=JSON.stringify(bank),view=scoringView(bank),sources=new Set(bank.flatMap(q=>q.cross?[q.cross.id]:[]));
  expect(view).toHaveLength(125);expect(sources.size).toBe(5);
  expect(bank.filter((q,i)=>q.scored!==false&&view[i].scored===false).map(q=>q.id)).toEqual(['life-01','leisure-11']);
  view.forEach((q,i)=>{if(sources.has(q.id))expect(q).toEqual({...bank[i],scored:false});else expect(q).toBe(bank[i]);});
  expect(JSON.stringify(bank)).toBe(before);
 });
 it('keeps raw answers and priorities untouched and swaps symmetrically',()=>{
  const a={...person(10,0),priorities:{lifestyle:'top' as const}},b=person(0,10),before=JSON.stringify([a,b]);
  expect(relationshipScore(sport,a,b)).toBeCloseTo(relationshipScore(sport,b,a)!);
  expect(JSON.stringify([a,b])).toBe(before);
 });
});
