import {describe,it,expect} from 'vitest';
import {personalIndices,MIN_PERSONAL_INDEX_SOURCES} from '../src/scoring/personal-indices';
import {QUESTIONS} from '../src/questions';
import {answerFor,OPTION_VALUES} from '../src/answer';
import type {Profile,Question} from '../src/types';
const dialogue=['reflect-03','attach-03','intimacy-03','conflict-response-01','reflect-01','conflict-repair-01','regul-08'];
const shared=['life-08-r22','space-10','space-04','space-06','roles-06','living-06','leisure-06'];
const closeCircle=['relatives-01-r22','relatives-06','relatives-07','relatives-08','budget-05','leisure-06','loyalty-04-r22'];
const profile=(choices:Record<string,number>={}):Profile=>({name:'Аня',bankVersion:31,responses:Object.fromEntries([...dialogue,...shared].map(id=>[id,answerFor(OPTION_VALUES[(choices[id]??1)-1])]))});
describe('broad personal spheres need seven real supported questions',()=>{
 it('keeps the two original composites and adds only one seven-source preference',()=>{
  const r=personalIndices(QUESTIONS,profile());expect(r.version).toBe('personal-indices-v3');expect(MIN_PERSONAL_INDEX_SOURCES).toBe(7);
  expect(r.resources.map(x=>x.key)).toEqual(['dialogue']);expect(r.preferences.map(x=>x.key)).toEqual(['shared_life','close_circle']);
  for(const x of [r.resources[0],r.preferences[0]]){expect(x.total).toBe(7);expect(x.answered).toBe(7);expect(new Set(x.evidence.map(e=>e.questionId)).size).toBe(7);}
  expect(r.resources[0].evidence.map(e=>e.questionId)).toEqual(dialogue);expect(r.preferences[0].evidence.map(e=>e.questionId)).toEqual(shared);
  expect(r.preferences[1].total).toBe(7);expect(r.preferences[1].answered).toBe(1);expect(r.preferences[1].score).toBeNull();
 });
 it('uses seven equal weights and correct direction for personal home space',()=>{
  const r=personalIndices(QUESTIONS,profile({'reflect-03':2,'attach-03':4,'intimacy-03':3,'conflict-response-01':2,'reflect-01':2,'conflict-repair-01':4,'regul-08':4,'life-08-r22':1,'space-10':4,'space-04':5,'space-06':4,'roles-06':2,'living-06':1,'leisure-06':2}));
  expect(r.resources[0].score).toBeCloseTo(425/7,12);expect(r.preferences[0].score).toBeCloseTo(300/7,12);
  expect(r.preferences[0].evidence.find(e=>e.questionId==='living-06')?.points).toBe(0);
  expect(personalIndices(QUESTIONS,profile({'living-06':5})).preferences[0].score).toBe(100);
 });
 it('six answers never produce any numeric sphere, including preferences',()=>{
  const p=profile();delete p.responses['reflect-03'];delete p.responses['living-06'];
  const r=personalIndices(QUESTIONS,p);for(const x of [r.resources[0],r.preferences[0]]){expect(x.answered).toBe(6);expect(x.score).toBeNull();}
  expect(r.strengths).toEqual([]);expect(r.attention).toEqual([]);
 });
 it('missing metadata and unknown choices do not fill the seventh position',()=>{
  const qs:Question[]=QUESTIONS.map(q=>q.id==='reflect-03'?{...q,uncertainOptions:[1]}:q).filter(q=>q.id!=='space-10');
  const r=personalIndices(qs,profile());expect(r.resources[0].score).toBeNull();expect(r.resources[0].missingIds).toContain('reflect-03');
  expect(r.preferences[0].score).toBeNull();expect(r.preferences[0].missingIds).toContain('space-10');
 });
 it('neutral styles are never strengths/weaknesses and unrelated answers cannot change indices',()=>{
  const a=profile(Object.fromEntries(shared.map(id=>[id,id==='living-06'?1:5])));const r=personalIndices(QUESTIONS,a);
  expect(r.resources[0].score).toBe(100);expect(r.preferences[0].score).toBe(0);expect(r.strengths).toEqual(['dialogue']);expect(r.attention).toEqual([]);
  const changed={...a,responses:{...a.responses,'budget-01':answerFor(10),'intimacy-01-r29':answerFor(10),'trauma-05':answerFor(10)}};expect(personalIndices(QUESTIONS,changed)).toEqual(r);
 });
 it('keeps exact current evidence belonging to the supplied person',()=>{
  const r=personalIndices(QUESTIONS,profile({'reflect-03':2}));const e=r.resources[0].evidence.find(e=>e.questionId==='reflect-03')!;
  expect(e.option).toBe(2);expect(e.points).toBe(100);expect(e.answer).toBe(QUESTIONS.find(q=>q.id==='reflect-03')!.options![1]);expect(e.question).toBe(QUESTIONS.find(q=>q.id==='reflect-03')!.text);
 });
});

const closeProfile=(choices:Record<string,number>={}):Profile=>({
 ...profile(),responses:{...profile().responses,...Object.fromEntries(closeCircle.map(id=>[id,answerFor(OPTION_VALUES[(choices[id]??1)-1])]))},
});
const closeIndex=(p:Profile)=>personalIndices(QUESTIONS,p).preferences.find(x=>x.key==='close_circle')!;
describe('participation in the lives of close people',()=>{
 it('averages exactly seven distinct situations with equal weights and precise mappings',()=>{
  const p=closeProfile({'relatives-01-r22':2,'relatives-06':3,'relatives-07':4,'relatives-08':2,'budget-05':4,'leisure-06':3,'loyalty-04-r22':5});
  const x=closeIndex(p);
  expect(x.title).toBe('Участие в жизни близких');expect(x.kind).toBe('preference');
  expect(x.total).toBe(7);expect(x.answered).toBe(7);expect(x.missingIds).toEqual([]);
  expect(x.evidence.map(e=>e.questionId)).toEqual(closeCircle);expect(new Set(x.evidence.map(e=>e.questionId)).size).toBe(7);
  expect(x.evidence.map(e=>e.points)).toEqual([75,50,0,50,25,50,0]);expect(x.score).toBeCloseTo(250/7,12);
  expect(shared.filter(id=>closeCircle.includes(id))).toEqual(['leisure-06']);
 });
 it('preserves each source option mapping across all five selected answers',()=>{
  const levels:Record<string,number[]>={
   'relatives-01-r22':[100,75,50,25,0],'relatives-06':[100,75,50,25,0],
   'relatives-07':[100,75,50,0,0],'relatives-08':[100,50,0,0,0],
   'budget-05':[100,75,50,25,0],'leisure-06':[100,75,50,25,0],'loyalty-04-r22':[100,75,50,25,0],
  };
  for(const [id,points] of Object.entries(levels))for(const option of [1,2,3,4,5]){
   const x=closeIndex(closeProfile({[id]:option}));const evidence=x.evidence.find(e=>e.questionId===id)!;
   expect(evidence.points).toBe(points[option-1]);expect(evidence.option).toBe(option);
   expect(evidence.answer).toBe(QUESTIONS.find(q=>q.id===id)!.options![option-1]);
  }
 });
 it('requires all seven distinct supported answers before giving a score',()=>{
  for(const missing of closeCircle){
   const p=closeProfile();delete p.responses[missing];p.responses['unknown-close-person-question']=answerFor(0);const x=closeIndex(p);
   expect(x.answered).toBe(6);expect(x.score).toBeNull();expect(x.missingIds).toContain(missing);
  }
 });
 it('excludes skipped, invalid and uncertain answers, and unavailable metadata',()=>{
  for(const response of ['skipped',answerFor(Number.NaN),answerFor(Infinity),answerFor(-1),answerFor(11)] as const){
   const p=closeProfile();p.responses['budget-05']=response;const x=closeIndex(p);
   expect(x.answered).toBe(6);expect(x.score).toBeNull();expect(x.missingIds).toContain('budget-05');
  }
  for(const qs of [
   QUESTIONS.filter(q=>q.id!=='budget-05'),
   QUESTIONS.map(q=>q.id==='budget-05'?{...q,uncertainOptions:[1]}:q),
   QUESTIONS.map(q=>q.id==='budget-05'?{...q,options:undefined}:q),
  ]){
   const x=personalIndices(qs,closeProfile()).preferences.find(x=>x.key==='close_circle')!;
   expect(x.answered).toBe(6);expect(x.score).toBeNull();expect(x.missingIds).toContain('budget-05');
  }
 });
 it('does not penalize restricting partner friendships or living separately beyond no own participation',()=>{
  for(const option of [3,4,5])expect(closeIndex(closeProfile({'relatives-08':option})).evidence.find(e=>e.questionId==='relatives-08')?.points).toBe(0);
  for(const option of [4,5])expect(closeIndex(closeProfile({'relatives-07':option})).evidence.find(e=>e.questionId==='relatives-07')?.points).toBe(0);
 });
 it('treats both poles as neutral and leaves original scores unchanged for independent sources',()=>{
  const low=personalIndices(QUESTIONS,closeProfile(Object.fromEntries(closeCircle.map(id=>[id,5]))));
  const high=personalIndices(QUESTIONS,closeProfile());
  expect(low.preferences[1].score).toBe(0);expect(high.preferences[1].score).toBe(100);
  for(const r of [low,high]){expect(r.strengths).toEqual(['dialogue']);expect(r.attention).toEqual([]);}
  const original=personalIndices(QUESTIONS,profile());
  expect(high.resources).toEqual(original.resources);expect(high.preferences[0]).toEqual(original.preferences[0]);
  const changed=closeProfile(Object.fromEntries(closeCircle.filter(id=>id!=='leisure-06').map(id=>[id,5])));
  const r=personalIndices(QUESTIONS,changed);expect(r.resources).toEqual(original.resources);expect(r.preferences[0]).toEqual(original.preferences[0]);
 });
});
