import {describe,it,expect} from 'vitest';
import frozenBank from '../research/blind/target-v20/score-resolution/candidate-bank-v27.json';
import {answerFor,OPTION_VALUES} from '../src/answer';
import type {Profile,Question} from '../src/types';
import {sportInputView,relationshipScore} from '../research/blind/target-v20/iterations/I010-sport-source-input/candidate';
const bank = frozenBank as { questions: Question[] };
const qs:Question[]=bank.questions.filter((q:Question)=>['life-01','life-02'].includes(q.id));
function p(habit:number|null,tolerance:number):Profile{return {name:'test',bankVersion:27,responses:{'life-02':answerFor(OPTION_VALUES[tolerance-1]),...(habit===null?{}:{'life-01':answerFor(OPTION_VALUES[habit-1])})}};}
describe('I010 sports habit remains a required source input without a separate similarity contribution',()=>{
 it('retains all 123 questions and changes only the sports source scored flag',()=>{const before=JSON.stringify(bank);const v=sportInputView(bank.questions);expect(v).toHaveLength(123);for(let i=0;i<v.length;i++)expect(v[i]).toEqual(v[i].id==='life-01'?{...bank.questions[i],scored:false}:bank.questions[i]);expect(JSON.stringify(bank)).toBe(before);expect(v.find(q=>q.id==='life-01')?.optional).toBe(false);});
 it('normal acceptance of different sports habits yields full fit',()=>{expect(relationshipScore(qs,p(1,1),p(5,1))).toBe(100);});
 it('opposition to an inactive partner remains penalized by the existing cross dependency',()=>{expect(relationshipScore(qs,p(1,5),p(5,1))).toBe(0);expect(relationshipScore(qs,p(1,5),p(1,1))).toBe(100);});
 it('does not invent a source response if the sports habit is missing',()=>{expect(relationshipScore(qs,p(null,1),p(5,1))).toBeNull();});
 it('recognizes the distinct saved v25 source ID without changing its answers or cross levels',()=>{const q=qs.map(q=>({...q,id:q.id==='life-01'?'life-01-r25':'life-02-r25',...(q.cross?{cross:{...q.cross,id:'life-01-r25'}}:{})}));const v=sportInputView(q);expect(v[0].scored).toBe(false);expect(v[1]).toEqual(q[1]);});
 it('does not remove alcohol or other habit similarity contributions',()=>{const v=sportInputView(bank.questions);for(const id of ['leisure-11','life-04','life-06'])expect(v.find(q=>q.id===id)).toBe(bank.questions.find((q:Question)=>q.id===id));});
});
