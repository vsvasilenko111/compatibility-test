import {describe,it,expect} from 'vitest';
import type {Profile,Question} from '../src/types';
import {answerFor} from '../src/answer';
import {compare as baseline} from '../src/scoring/compare';
import {compare} from '../research/blind/target-v20/iterations/I005-minimum-fit/candidate';
const q=(id:string,sphere='humor',extra:Partial<Question>={}):Question=>({id,sphere,block:'friendship',text:id,left:'a',right:'b',topic:id,optional:false,...extra});
const person=(values:Record<string,number>,priorities:Profile['priorities']={}):Profile=>({name:'a',bankVersion:26,priorities,responses:Object.fromEntries(Object.entries(values).map(([id,v])=>[id,answerFor(v)]))});
describe('I005 frozen minimum directional fit hypothesis',()=>{
 it('uses the weaker directional cross fit: 1 and .5 give 50 rather than sqrt(.5)',()=>{
  const qs=[q('exposure','habits',{scored:false}),q('accept','habits',{cross:{id:'exposure',level:[0,.25,.5,.75,1]}})];
  const a=person({exposure:10,accept:0}),b=person({exposure:0,accept:5});
  expect(baseline(qs,a,b).relationship.percent).toBeCloseTo(Math.sqrt(.5)*100);
  expect(compare(qs,a,b).relationship.percent).toBe(50);
  expect(compare(qs,a,b).friendship.percent).toBe(50);
 });
 it('preserves individual priorities: .75 and .25 give 25',()=>{
  const qs=[q('match','humor'),q('mismatch','contact')],a=person({match:0,mismatch:0},{humor:'top'}),b=person({match:0,mismatch:10},{contact:'top'});
  expect(baseline(qs,a,b).relationship.percent).toBeCloseTo(Math.sqrt(.75*.25)*100);
  expect(compare(qs,a,b).relationship.percent).toBe(25);
 });
 it('is symmetric without changing either persons answers or priorities',()=>{
  const qs=[q('a'),q('b','contact')],a=person({a:0,b:0},{humor:'top'}),b=person({a:0,b:10},{contact:'top'}),before=JSON.stringify([a,b]);
  expect(compare(qs,a,b).relationship.percent).toBe(compare(qs,b,a).relationship.percent);expect(JSON.stringify([a,b])).toBe(before);
 });
 it('preserves perfect agreement and total opposition',()=>{
  const qs=[q('a')],a=person({a:0});expect(compare(qs,a,a).relationship.percent).toBe(100);expect(compare(qs,a,person({a:10})).relationship.percent).toBe(0);
 });
 it('does not reward shared harmful behavior',()=>{
  const qs=[q('a','humor',{behaviorLevels:[1,.75,.5,.25,0]})],bad=person({a:10});expect(compare(qs,bad,bad).relationship.percent).toBe(0);
 });
 it('preserves uncertainty, unscored, maturity and missing-answer exclusions',()=>{
  for(const qs of [[q('a','humor',{uncertainOptions:[1]})],[q('a','humor',{scored:false})],[q('a','humor',{block:'maturity'})]])expect(compare(qs,person({a:0}),person({a:0})).relationship.percent).toBeNull();
  expect(compare([q('a')],person({}),person({a:0})).relationship.percent).toBeNull();
 });
 it('keeps flags, rewards and conversation metadata identical',()=>{
  const qs=[q('a','humor',{firm:true}),q('b')],a=person({a:0,b:0}),b=person({a:10,b:0});(a.responses.a as any).firm=true;
  const old=baseline(qs,a,b),next=compare(qs,a,b);
  for(const mode of ['relationship','friendship'] as const){const {percent:op,...om}=old[mode],{percent:np,...nm}=next[mode];expect(nm).toEqual(om);}
 });
});
