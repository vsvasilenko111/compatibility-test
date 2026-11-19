import frozenBank from '../research/blind/target-v20/v26-rollback/candidate-bank-v26.json';
import {describe,it,expect} from 'vitest';
import type {Profile,Question} from '../src/types';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {compare} from '../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../src/questions/spheres';
import {scoringView,relationshipScore,ACTION_IDS} from '../research/blind/target-v20/iterations/I003-existing-actions/candidate';
const bank = frozenBank.questions as Question[];
const profile=(value=0,priorities:Profile['priorities']={}):Profile=>({name:'a',bankVersion:26,priorities,responses:Object.fromEntries(bank.map(q=>[q.id,answerFor(value)]))});
describe('I003 existing resource actions, research only',()=>{
 it('exposes the missing action signal excluded by actual baseline compare',()=>{
  const qs=bank.filter(q=>ACTION_IDS.includes(q.id));const a=profile();
  expect(compare(qs,a,a,relationshipWeight,friendshipWeight).relationship.percent).toBeNull();
  expect(relationshipScore(qs,a,a)).toBe(100);
 });
 it('uses exactly the established resource grade for every existing option',()=>{
  for(const q of scoringView(bank).filter(q=>ACTION_IDS.includes(q.id))) OPTION_VALUES.forEach((v,i)=>expect(q.behaviorLevels![i]).toBeCloseTo(1-v/10));
 });
 it('does not reward shared poor behavior and gives no conviction bonus',()=>{
  const qs=bank.filter(q=>ACTION_IDS.includes(q.id));const good=profile(0),poor=profile(10);
  expect(relationshipScore(qs,poor,poor)).toBe(0);expect(relationshipScore(qs,good,poor)).toBe(0);
  const result=compare(scoringView(qs),good,good,relationshipWeight,friendshipWeight);
  expect(result.relationship.superCount).toBe(0);expect(result.relationship.strongMatches).toHaveLength(0);
 });
 it('keeps anxiety, attachment, help and history excluded from the relationship grade',()=>{
  const qs=bank.filter(q=>q.block==='maturity'&&!ACTION_IDS.includes(q.id));
  expect(relationshipScore(qs,profile(),profile())).toBeNull();
 });
 it('preserves each persons priorities and directionality under swapping',()=>{
  const a=profile(0,{conflicts:'top'}),b=profile(10);b.responses['reflect-01']=answerFor(0);
  const before=JSON.stringify([a,b]);const actual=relationshipScore(bank,a,b);
  expect(actual).toBe(compare(scoringView(bank),a,b,relationshipWeight,friendshipWeight).relationship.percent);
  expect(actual).toBeCloseTo(relationshipScore(bank,b,a)!);expect(JSON.stringify([a,b])).toBe(before);
  expect(actual).not.toBe(relationshipScore(bank,{...a,priorities:{}},b));
 });
 it('preserves all 125 IDs, wording, options and all other question objects',()=>{
  const before=JSON.stringify(bank),view=scoringView(bank);expect(view).toHaveLength(125);
  expect(view.map(q=>q.id)).toEqual(bank.map(q=>q.id));
  view.forEach((q,i)=>{expect(q.text).toBe(bank[i].text);expect(q.options).toEqual(bank[i].options);if(!ACTION_IDS.includes(q.id))expect(q).toBe(bank[i]);else{expect(q.sphere).toBe('conflicts');expect(q.block).toBe('friendship');}});
  expect(JSON.stringify(bank)).toBe(before);expect(relationshipWeight('conflicts')).toBe(1);
 });
});
