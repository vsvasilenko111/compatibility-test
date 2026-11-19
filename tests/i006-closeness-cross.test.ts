import frozenBank from '../research/blind/target-v20/v26-rollback/candidate-bank-v26.json';
import {describe,it,expect} from 'vitest';
import type {Profile,Question} from '../src/types';
import {answerFor} from '../src/answer';
import {compare} from '../src/scoring/compare';
import {scoringView,relationshipScore} from '../research/blind/target-v20/iterations/I006-closeness-cross/candidate';
const bank=frozenBank.questions as Question[],qs=bank.filter(q=>['attach-01','attach-03'].includes(q.id));
const person=(anxiety:number,withdrawal:number):Profile=>({name:'a',bankVersion:26,responses:{'attach-01':answerFor(anxiety),'attach-03':answerFor(withdrawal)}});
describe('I006 anxious withdrawal cross interaction, research hypothesis',()=>{
 it('adds an interaction excluded from the baseline maturity block',()=>{
  const a=person(0,10);expect(compare(qs,a,a).relationship.percent).toBeNull();expect(relationshipScore(qs,a,a)).toBe(100);
 });
 it('does not penalize withdrawal when neither person is anxious',()=>{
  expect(relationshipScore(qs,person(0,0),person(0,10))).toBe(100);
 });
 it('does not penalize any anxiety when both partners communicate',()=>{
  for(const sourceA of [0,3,5,7])for(const sourceB of [0,3,5,7])expect(relationshipScore(qs,person(10,sourceA),person(10,sourceB))).toBe(100);
 });
 it('detects one persons maximal anxiety against the others maximal withdrawal',()=>{
  expect(relationshipScore(qs,person(10,0),person(0,10))).toBe(0);
 });
 it('gives the hand-derived asymmetric directional result sqrt(.5*1)',()=>{
  expect(relationshipScore(qs,person(5,0),person(0,10))).toBeCloseTo(Math.sqrt(.5)*100);
 });
 it('skips missing or skipped cross sources without inventing unknown answers',()=>{
  const a=person(10,0),b=person(0,5);delete a.responses['attach-03'];expect(relationshipScore(qs,a,b)).toBeNull();a.responses['attach-03']='skipped';expect(relationshipScore(qs,a,b)).toBeNull();
 });
 it('preserves answers and symmetry and records the friendship consequence',()=>{
  const a=person(5,0),b=person(0,10),before=JSON.stringify([a,b]);expect(relationshipScore(qs,a,b)).toBe(relationshipScore(qs,b,a));expect(JSON.stringify([a,b])).toBe(before);
  expect(compare(scoringView(qs),a,b).friendship.percent).toBeCloseTo(Math.sqrt(.5)*100);
 });
 it('preserves all125original objects except the explicit attach01 scoring metadata',()=>{
  const before=JSON.stringify(bank),view=scoringView(bank);expect(view).toHaveLength(125);view.forEach((q,i)=>{if(q.id==='attach-01')expect(q).toEqual({...bank[i],block:'friendship',sphere:'conflicts',scored:true,cross:{id:'attach-03',level:[0,0,0,0,1]}});else expect(q).toBe(bank[i]);});expect(JSON.stringify(bank)).toBe(before);
  expect(view.find(q=>q.id==='attach-03')!.block).toBe('maturity');
 });
});
