// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startApp} from '../src/ui/app';
import {BANK_VERSION,CURRENT_IDS,CURRENT_FIRM,QUESTIONS,MANIFEST,FIRM} from '../src/questions';
import * as v39 from '../research/blind/target-v20/legacy-questions-v39';
import {answerFor} from '../src/answer';
import {decode,encode} from '../src/codec/codec';
import {createStore} from '../src/storage';
import {parseHash} from '../src/router';
import type {Profile} from '../src/types';

let root:HTMLElement;
let listeners:ReturnType<typeof vi.spyOn>;
const priorities={kids:'top',budget:'top',conflicts:'top',home:'top',loyalty:'top'} as const;
const full=(name='Новая'):Profile=>({name,bankVersion:BANK_VERSION,priorities,
 responses:Object.fromEntries(QUESTIONS.map(q=>[q.id,answerFor(q.uncertainOptions?.includes(3)?0:5)]))});
const currentCode=(p:Profile)=>encode({...p,bankVersion:BANK_VERSION},CURRENT_IDS,CURRENT_FIRM);
const obsolete=()=>encode({name:'Старая',bankVersion:2,responses:Object.fromEntries(MANIFEST[2].map(id=>[id,answerFor(5)]))},MANIFEST[2],FIRM[2]);
const compatible=(name='Ранее'):Profile=>({name,bankVersion:39,priorities,responses:Object.fromEntries(v39.CURRENT_IDS.map(id=>[id,answerFor(5)]))});
const oldCode=(p:Profile)=>encode(p,v39.CURRENT_IDS,v39.CURRENT_FIRM);
function start(hash=''){history.replaceState(null,'','/?release=example#'+hash);startApp(root)}
beforeEach(()=>{localStorage.clear();root=document.createElement('main');document.body.replaceChildren(root);vi.spyOn(window,'scrollTo').mockImplementation(()=>{});listeners=vi.spyOn(window,'addEventListener')});
afterEach(()=>{for(const[type,listener]of listeners.mock.calls)if(type==='hashchange')window.removeEventListener(type,listener as EventListener);vi.restoreAllMocks();localStorage.clear();history.replaceState(null,'','/')});

describe('sharing the current questionnaire instead of a saved obsolete link',()=>{
 it('does not advertise an incompatible saved questionnaire as the current partner link',()=>{
  const old=obsolete();createStore(localStorage).saveOwnCode(old);start();
  expect(root.querySelector('.share input')).toBeNull();
  expect(root.querySelector<HTMLAnchorElement>('a[href*="#p."]')?.hash).toBe('#p.'+old);
  expect(createStore(localStorage).loadOwnCode()).toBe(old);
 });
 it('copies the profile currently open, preserving a different device owner',async()=>{
  const old=obsolete(),fresh=currentCode(full());createStore(localStorage).saveOwnCode(old);
  const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  start('p.'+fresh);const share=root.querySelector('.personal-invite .share')!;
  const url=share.querySelector<HTMLInputElement>('input')!.value;
  expect(parseHash(new URL(url).hash)).toMatchObject({kind:'invite',a:fresh});
  [...share.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Скопировать')!.click();
  await vi.waitFor(()=>expect(writeText).toHaveBeenCalledWith(url));
  expect(createStore(localStorage).loadOwnCode()).toBe(old);
 });
 it('re-encodes a complete compatible saved profile for sharing without erasing original answers',()=>{
  const p=compatible(),saved=oldCode(p);createStore(localStorage).saveOwnCode(saved);start();
  const route=parseHash(new URL(root.querySelector<HTMLInputElement>('.share input')!.value).hash);
  expect(route).toMatchObject({kind:'invite',a:currentCode(p)});
  if(route.kind!=='invite')throw Error('Expected invite');
  const decoded=decode(route.a,MANIFEST,FIRM);expect(decoded.bankVersion).toBe(BANK_VERSION);
  for(const id of CURRENT_IDS)expect(decoded.responses[id]).toEqual(p.responses[id]);
  expect(createStore(localStorage).loadOwnCode()).toBe(saved);
 });
 it('offers updating an obsolete own invitation rather than another copy of it',()=>{
  const old=obsolete();createStore(localStorage).saveOwnCode(old);start('i.'+old);
  expect(root.querySelector('.share input')).toBeNull();
  expect(root.textContent).toContain('Пройти обновлённый тест');
 });
 it('does not tell a person with an obsolete saved profile that they completed the current invitation',()=>{
  createStore(localStorage).saveOwnCode(obsolete());start('i.'+currentCode(full()));
  expect(root.querySelector('.intro')).not.toBeNull();
  expect(root.textContent).not.toContain('Вы уже прошли тест');
 });
 it('shares compatible complete personal and paired results using the current bank',()=>{
  const a=compatible('Первый'),b=compatible('Второй');start('p.'+oldCode(a));
  expect(parseHash(new URL(root.querySelector<HTMLInputElement>('.personal-invite input')!.value).hash)).toMatchObject({kind:'invite',a:currentCode(a)});
  const listener=listeners.mock.calls.find(([name])=>name==='hashchange')![1] as EventListener;
  history.replaceState(null,'','/?release=example#r.'+oldCode(a)+'.'+oldCode(b));listener(new HashChangeEvent('hashchange'));
  const url=root.querySelector<HTMLInputElement>('.result-share input')!.value;
  expect(new URL(url).searchParams.get('release')).toBe('example');
  expect(parseHash(new URL(url).hash)).toMatchObject({kind:'result',a:currentCode(a),b:currentCode(b)});
 });
});
