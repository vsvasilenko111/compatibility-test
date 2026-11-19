import {describe,it,expect} from 'vitest';
import frozenBank from '../research/blind/target-v20/score-resolution/candidate-bank-v27.json';
import {answerFor,OPTION_VALUES} from '../src/answer';
import type {Profile,Question} from '../src/types';
import {resources} from '../src/scoring/resources';
import {sportInputView} from '../research/blind/target-v20/iterations/I010-sport-source-input/candidate';
import {reactivityView,relationshipScore} from '../research/blind/target-v20/iterations/I011-reactivity-representation/candidate';
const bank = frozenBank as { questions: Question[] };
const original:Question[]=bank.questions;
const attach=original.filter(q=>q.id==='attach-01');
function p(values:Record<string,number>):Profile{return {name:'test',bankVersion:27,responses:Object.fromEntries(Object.entries(values).map(([id,n])=>[id,answerFor(OPTION_VALUES[n-1])]))};}
describe('I011 private nonclinical emotional tension resource representation',()=>{
 it('retains all 123 words, options and IDs; only attach and sports metadata change before the unchanged goal parent',()=>{
  const before=JSON.stringify(original);const view=reactivityView(sportInputView(original));expect(view).toHaveLength(123);
  for(let i=0;i<view.length;i++){
   const q=original[i];expect(view[i]).toEqual(q.id==='attach-01'?{...q,block:'friendship',sphere:'conflicts',scored:true,behaviorLevels:[1,.7,.5,.3,0]}:q.id==='life-01'?{...q,scored:false}:q);
   expect(view[i].id).toBe(q.id);expect(view[i].text).toBe(q.text);expect(view[i].options).toEqual(q.options);
  }
  expect(JSON.stringify(original)).toBe(before);expect(view.find(q=>q.id==='attach-03')).toEqual(original.find(q=>q.id==='attach-03'));expect(view.find(q=>q.id==='attach-01')?.cross).toBeUndefined();
 });
 it('maximal shared emotional reaction yields component index 0; calm yields 100, neither is probability or a judgment',()=>{
  expect(relationshipScore(attach,p({'attach-01':5}),p({'attach-01':5}))).toBe(0);
  expect(relationshipScore(attach,p({'attach-01':1}),p({'attach-01':1}))).toBe(100);
 });
 it('uses exactly the existing 1-response.value/10 resource direction for every ordinal option',()=>{
  const levels=reactivityView(attach)[0].behaviorLevels!;expect(levels).toEqual([1,.7,.5,.3,0]);
  for(let n=1;n<=5;n++)expect(relationshipScore(attach,p({'attach-01':n}),p({'attach-01':n}))).toBeCloseTo(100*(1-OPTION_VALUES[n-1]/10));
 });
 it('is symmetric and does not depend on a withdrawal response or invent a missing answer',()=>{
  const a=p({'attach-01':2,'attach-03':1}),b=p({'attach-01':4,'attach-03':5});
  expect(relationshipScore(attach,a,b)).toBeCloseTo(100*Math.sqrt(.7*.3));expect(relationshipScore(attach,b,a)).toBe(relationshipScore(attach,a,b));
  expect(relationshipScore(attach,p({'attach-01':2}),p({'attach-01':4}))).toBe(relationshipScore(attach,a,b));expect(relationshipScore(attach,p({}),b)).toBeNull();
 });
 it('keeps goal direction and unknown goal excluded using the unchanged I008 parent',()=>{
  const goals=original.filter(q=>q.id==='relationship-goal-01');expect(relationshipScore(goals,p({'relationship-goal-01':3}),p({'relationship-goal-01':1}))).toBeNull();
  expect(relationshipScore(goals,p({'relationship-goal-01':1}),p({'relationship-goal-01':1}))).toBe(100);expect(relationshipScore(goals,p({'relationship-goal-01':5}),p({'relationship-goal-01':5}))).toBe(0);
 });
 it('keeps sports source answers mandatory for the original cross; product resources and history stay original',()=>{
  const sports=original.filter(q=>['life-01','life-02'].includes(q.id));expect(relationshipScore(sports,p({'life-01':1,'life-02':5}),p({'life-01':5,'life-02':1}))).toBe(0);
  expect(relationshipScore(sports,p({'life-02':1}),p({'life-01':5,'life-02':1}))).toBeNull();
  const a=p({'attach-01':2,'attach-03':1}),b=p({'attach-01':4,'attach-03':5});const before=resources(original,a,b);const responses=JSON.stringify([a,b]);relationshipScore(original,a,b);expect(resources(original,a,b)).toEqual(before);expect(JSON.stringify([a,b])).toBe(responses);
  for(const q of original.filter(q=>q.block==='maturity'&&q.id!=='attach-01'))expect(reactivityView(original).find(x=>x.id===q.id)).toBe(q);
 });
});
