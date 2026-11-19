import { describe, expect, it } from 'vitest';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile, Question } from '../src/types';
import type { SphereWeight } from '../src/scoring/compare';
import { relationshipScore } from '../research/blind/target-v20/interaction-balance/candidate';
const q=(id:string,sphere='kids',extra:Partial<Question>={}):Question=>({id,sphere,block:'relationship',text:id,topic:id,left:'',right:'',optional:false,...extra});
const action=q('action','budget',{behaviorLevels:[1,.75,.5,.25,0]});
const p=(values:Record<string,number>,priorities?:Profile['priorities']):Profile=>({name:'',bankVersion:26,priorities,responses:Object.fromEntries(Object.entries(values).map(([id,v])=>[id,answerFor(OPTION_VALUES[v-1])]))});
const score=(qs:Question[],a:Profile,b:Profile,w:SphereWeight=()=>1)=>relationshipScore(qs,a,b,w);
describe('fixed equal preference and existing behavior aggregation',()=>{
 it('prevents preference item count diluting harmful behavior',()=>{
  const qs=[q('p1'),q('p2'),q('p3'),action];
  expect(score(qs,p({p1:1,p2:1,p3:1,action:5}),p({p1:1,p2:1,p3:1,action:5}))).toBe(50);
 });
 it('retains behavior direction even when both choose the same harmful action',()=>{
  expect(score([q('p'),action],p({p:1,action:5}),p({p:1,action:5}))).toBe(50);
  expect(score([q('p'),action],p({p:1,action:1}),p({p:1,action:1}))).toBe(100);
 });
 it('uses existing geometric partner behavior semantics',()=>{
  expect(score([q('p'),action],p({p:1,action:1}),p({p:1,action:3}))).toBeCloseTo(85.355339059);
 });
 it('retains ordinary five step similarity inside preference domain',()=>{
  for(const [option,want] of [[1,100],[2,87.5],[3,75],[4,62.5],[5,50]])
   expect(score([q('p'),action],p({p:1,action:1}),p({p:option,action:1}))).toBe(want);
 });
 it('retains base weights and each own priority denominator',()=>{
  const qs=[q('p1'),q('p2','budget'),action];
  expect(score(qs,p({p1:1,p2:1,action:1},{kids:'top'}),p({p1:1,p2:5,action:1},{budget:'top'}))).toBeCloseTo(71.6506350946);
  expect(score(qs,p({p1:1,p2:1,action:1}),p({p1:1,p2:5,action:1}),s=>s==='kids'?2:1)).toBeCloseTo(83.3333333333);
 });
 it('keeps complete profiles for excluded cross source answers',()=>{
  const cross=q('tolerance','kids',{cross:{id:'habit',level:[0,.25,.5,.75,1]}});
  expect(score([cross,q('habit','kids',{scored:false}),action],p({tolerance:5,habit:1,action:1}),p({tolerance:1,habit:3,action:1}))).toBeCloseTo(85.355339059);
 });
 it('retains format and uncertain answer semantics',()=>{
  const format=q('f','kids',{formats:[{accepted:['a','b'],preferred:'a'},{accepted:['a','b'],preferred:'b'}]});
  expect(score([format,action],p({f:1,action:1}),p({f:2,action:1}))).toBe(87.5);
  expect(score([q('u','kids',{uncertainOptions:[3]}),action],p({u:3,action:1}),p({u:1,action:1}))).toBeNull();
 });
 it('rejects an empty domain without changing equal halves or falling back',()=>{
  expect(score([action],p({action:1}),p({action:1}))).toBeNull();
  expect(score([q('p')],p({p:1}),p({p:1}))).toBeNull();
  expect(score([q('m','kids',{block:'maturity'}),q('s','kids',{scored:false}),action],p({m:1,s:1,action:1}),p({m:1,s:1,action:1}))).toBeNull();
 });
 it('is symmetric and leaves input answers intact',()=>{
  const a=p({p:1,action:1},{kids:'top'}),b=p({p:5,action:3},{budget:'top'}),before=JSON.stringify([a,b]);
  expect(score([q('p'),action],a,b)).toBeCloseTo(score([q('p'),action],b,a)!);
  expect(JSON.stringify([a,b])).toBe(before);
 });
});
