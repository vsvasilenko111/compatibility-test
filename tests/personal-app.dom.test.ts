// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startApp} from '../src/ui/app';
import {BANK_VERSION,CURRENT_IDS,CURRENT_FIRM,QUESTIONS} from '../src/questions';
import * as v30 from '../research/blind/target-v20/legacy-questions-v30';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {encode} from '../src/codec/codec';
import {createStore} from '../src/storage';

let root:HTMLElement;
let listeners:ReturnType<typeof vi.spyOn>;
const full=(name:string)=>({name,bankVersion:BANK_VERSION,
 responses:Object.fromEntries(QUESTIONS.map(q=>[q.id,answerFor(OPTION_VALUES[q.uncertainOptions?.includes(3)?0:2])])),
 priorities:{kids:'top',budget:'top',conflicts:'top',home:'top',loyalty:'top'} as const});
const code=(p:ReturnType<typeof full>)=>encode(p,CURRENT_IDS,CURRENT_FIRM);
const start=(hash='')=>{history.replaceState(null,'','/#'+hash);startApp(root);};
beforeEach(()=>{localStorage.clear();history.replaceState(null,'','/');root=document.createElement('main');document.body.replaceChildren(root);
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});listeners=vi.spyOn(window,'addEventListener');});
afterEach(()=>{for(const [type,listener] of listeners.mock.calls)if(type==='hashchange')window.removeEventListener('hashchange',listener as EventListener);
 vi.restoreAllMocks();localStorage.clear();history.replaceState(null,'','/');});

describe('personal results without a partner',()=>{
 it('opens one complete personal report without pair scores or pair history',()=>{
  start('p.'+code(full('Аня')));
  expect(root.querySelector('.personal-result')).not.toBeNull();
  expect(root.querySelectorAll('.person-summary-card')).toHaveLength(1);
  expect(root.querySelector('.score')).toBeNull();expect(createStore(localStorage).loadHistory()).toEqual([]);
 });
 it('shows a saved personal result link on home and reopens it',()=>{
  const own=code(full('Аня'));createStore(localStorage).saveOwnCode(own);start();
  const link=[...root.querySelectorAll<HTMLAnchorElement>('a')].find(a=>a.textContent==='Мой результат')!;
  expect(link).toBeDefined();expect(link.hash).toBe('#p.'+own);
 });
 it('after finishing alone navigates directly to personal report and saves own code',async()=>{
  const person=full('Аня');const store=createStore(localStorage);
  store.saveProgress({name:person.name,index:CURRENT_IDS.length,responses:person.responses,priorities:person.priorities,inviterCode:null,bankVersion:BANK_VERSION});
  start();[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.startsWith('Продолжить'))!.click();
  await vi.waitFor(()=>expect(root.querySelector('.personal-result')).not.toBeNull());
  expect(location.hash.startsWith('#p.')).toBe(true);expect(store.loadOwnCode()).toBe(code(person));
  expect(root.querySelectorAll('.person-summary-card')).toHaveLength(1);expect(root.querySelector('.score')).toBeNull();
 });
 it('an old personal report asks only missing contexts and preserves old responses',()=>{
  const responses=Object.fromEntries(v30.CURRENT_IDS.map(id=>[id,answerFor(OPTION_VALUES[1])]));
  const old=encode({name:'Аня',bankVersion:30,responses,priorities:full('Аня').priorities},v30.CURRENT_IDS,v30.CURRENT_FIRM);
  start('p.'+old);expect(root.querySelector('.personal-result')).toBeNull();expect(root.querySelector('.score')).toBeNull();
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Продолжить'))!.click();
  const saved=createStore(localStorage).loadProgress()!;expect(saved.responses).toEqual(responses);
  expect(saved.only).toEqual(['budget-arrangement-r36','life-13-r32','feedback-01-r32','budget-09-r31','loyalty-03-r31']);expect(saved.inviterCode).toBeNull();
 });
 it('saves invitee own code on a new device while keeping the paired result',async()=>{
  const a=full('Аня'),b=full('Борис');const store=createStore(localStorage);
  store.saveProgress({name:b.name,index:CURRENT_IDS.length,responses:b.responses,priorities:b.priorities,inviterCode:code(a),bankVersion:BANK_VERSION});
  start('i.'+code(a));[...root.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.startsWith('Продолжить'))!.click();
  await vi.waitFor(()=>expect(root.querySelector('.score.main')).not.toBeNull());
  expect(store.loadOwnCode()).toBe(code(b));
 });
 it('preserves the first person own code when a partner finishes on the shared device',async()=>{
  const a=full('Аня'),b=full('Борис');const store=createStore(localStorage);store.saveOwnCode(code(a));
  store.saveProgress({name:b.name,index:CURRENT_IDS.length,responses:b.responses,priorities:b.priorities,inviterCode:code(a),bankVersion:BANK_VERSION});
  start('p.'+code(a));[...root.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='Пройти тест партнёру здесь')!.click();
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.startsWith('Продолжить'))!.click();
  await vi.waitFor(()=>expect(root.querySelector('.score.main')).not.toBeNull());expect(store.loadOwnCode()).toBe(code(a));
 });
 it('offers the complete person a personal report while the other old questionnaire is pending',async()=>{
  const a=full('Аня');const old=encode({name:'Борис',bankVersion:30,
   responses:Object.fromEntries(v30.CURRENT_IDS.map(id=>[id,answerFor(OPTION_VALUES[1])])),priorities:a.priorities},v30.CURRENT_IDS,v30.CURRENT_FIRM);
  start('r.'+code(a)+'.'+old);expect(root.querySelector('.result-pending')).not.toBeNull();
  const links=root.querySelectorAll<HTMLAnchorElement>('.personal-results-ready a');
  expect(links).toHaveLength(1);expect(links[0].textContent).toContain('Аня');links[0].click();
  await vi.waitFor(()=>expect(root.querySelector('.personal-result')).not.toBeNull());
  expect(root.querySelectorAll('.person-summary-card')).toHaveLength(1);expect(root.querySelector('.score')).toBeNull();
 });
 it('opens either personal report from a complete pair without replacing the device owner',async()=>{
  const a=full('Аня'),b=full('Борис');const store=createStore(localStorage);store.saveOwnCode(code(a));
  start('r.'+code(a)+'.'+code(b));const links=root.querySelectorAll<HTMLAnchorElement>('.person-summary-card a');
  expect(links).toHaveLength(2);links[1].click();
  await vi.waitFor(()=>expect(root.querySelector('.personal-result')).not.toBeNull());
  expect(root.querySelector('.personal-result h1')!.textContent).toBe('Личный результат: Борис');
  expect(root.querySelector('.personal-result')!.textContent).toContain('Борис');expect(store.loadOwnCode()).toBe(code(a));
 });
});
