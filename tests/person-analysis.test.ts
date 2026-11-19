import { describe, expect, it } from 'vitest';
import bank from '../src/questions/bank.json';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile, Question } from '../src/types';
import { personAnalysis } from '../src/scoring/person-analysis';
const questions = bank.questions as Question[];
const profile = (choices: Record<string,number>): Profile => ({name:'Анна',bankVersion:31,responses:Object.fromEntries(Object.entries(choices).map(([id,n])=>[id,answerFor(OPTION_VALUES[n-1])]))});
const finding = (choices: Record<string,number>, theme: string) => personAnalysis(questions,profile(choices)).insights.find(i=>i.theme===theme)!;
const rich = {'conflict-response-01':2,'conflict-repair-01':5,'regul-08':1,'loyalty-05':5,'attach-03':5,'reflect-03':4,'budget-arrangement-r36':5,'budget-10-r22':1,'budget-06-r22':5,'relationship-goal-01':1,'kids-02':1,'kids-timing-01-r22':1,'life-08-r22':1,'space-04':3,'relatives-02':2,'roles-05-r22':3};
describe('linked personal analysis',()=>{
 it('grounds historical money analysis in ownership and funding without assuming two earners',()=>{
  const source=questions.find(q=>q.sphere==='budget')!;
  const ownership:Question={...source,id:'budget-01-r34',text:'Кому принадлежат деньги при любом числе работающих?',options:['Все деньги общие, даже если зарабатывает один','Почти все общие','Часть общая','Только на быт','Общего бюджета нет']};
  const funding:Question & {answerKind:'categorical'}={...source,id:'budget-funding-model-r35',text:'Кто оплачивает все обычные расходы, включая личные?',scored:false,answerKind:'categorical',options:['Всё оплачиваю я; партнёр может не зарабатывать','Всё оплачивает партнёр; я могу не зарабатывать','Оба участвуем по договорённости','Роли в оплате могут меняться']};
  const result=personAnalysis([ownership,funding],profile({'budget-01-r34':1,'budget-funding-model-r35':1})).insights[0];
  expect(result.evidence.map(e=>e.questionId)).toEqual([ownership.id,funding.id]);
  expect(result.text).toContain(ownership.options![0]);expect(result.text).toContain(funding.options![0]);
  expect(result.text).toMatch(/обычн.*личн/);expect(result.text).not.toMatch(/оба зарабатывают|доходы обоих|одинаков.*доход/);
  for(let n=1;n<=4;n++){
   const current=personAnalysis([ownership,funding],profile({'budget-01-r34':1,'budget-funding-model-r35':n})).insights[0];
   expect(current.evidence[1]).toMatchObject({questionId:funding.id,option:n,answer:funding.options![n-1]});
   expect(current.text).toContain(funding.options![n-1]);
   expect(current.text).not.toMatch(/зрелост|лучше|хуже|мужчина|женщина/);
  }
  expect(personAnalysis([ownership,funding],profile({'budget-01-r34':1,'budget-08-funding-r34':4})).insights).toEqual([]);
  const fourth=profile({'budget-01-r34':1});fourth.responses[funding.id]=answerFor(7);
  expect(personAnalysis([ownership,funding],fourth).insights[0].text).toContain('Роли в оплате могут меняться');
  expect(personAnalysis([ownership,funding],profile({'budget-01':1,'budget-08-r22':1})).insights).toEqual([]);
  const oldPool:Question={...ownership,id:'budget-01'};
  const oldFunding:Question={...funding,id:'budget-08-r22',text:'При одинаковом доходе кто оплачивает базовые расходы?'};
  const old=personAnalysis([oldPool,oldFunding],profile({'budget-01':1,'budget-08-r22':1})).insights[0];
  expect(old.evidence.map(e=>e.questionId)).toEqual(['budget-01','budget-08-r22']);
  expect(old.text).toMatch(/одинаков.*доход/);expect(old.text).toMatch(/базов/);
  expect(old.text).not.toMatch(/все обычные расходы|включая личные/);
  const withdrawn:Question={...source,id:'budget-08-funding-r34',text:'Прежний вопрос об оплате обычных и личных расходов',options:['Мужчина оплачивает всё','Мужчина больше','Поровну','Женщина больше','Женщина оплачивает всё']};
  const historical=personAnalysis([ownership,withdrawn],profile({'budget-01-r34':1,'budget-08-funding-r34':5})).insights[0];
  expect(historical.evidence[1]).toMatchObject({questionId:withdrawn.id,option:5,answer:'Женщина оплачивает всё'});
  expect(historical.text).toContain('В прежнем вопросе');expect(historical.text).toContain('прежнюю формулировку');
 });
 it('uses each arrangement as an unordered exact choice with separate information or decisions',()=>{
  const arrangement=questions.find(q=>q.id==='budget-arrangement-r36')!;
  expect(arrangement).toBeDefined();
  const old:Question={...arrangement,id:'budget-01-r34',options:['Old all shared','b','c','d','Old no pool']};
  for(let n=1;n<=5;n++) {
   const p=profile({[arrangement.id]:n,'budget-10-r22':1,[old.id]:5,'budget-funding-model-r35':1});
   const i=personAnalysis([...questions,old],p).insights[0];
   expect(i.evidence.map(e=>e.questionId)).toEqual([arrangement.id,'budget-10-r22']);
   expect(i.text).toContain(arrangement.options![n-1]);
   expect(i.text).not.toMatch(/Old|Личные деньги в такой модели|Объединение средств здесь|мужчина|женщина|не зарабатывает|лучше|хуже/);
   expect(personAnalysis(questions,profile({[arrangement.id]:n,'budget-06-r22':3})).insights[0].evidence.map(e=>e.questionId)).toEqual([arrangement.id,'budget-06-r22']);
   expect(personAnalysis(questions,profile({[arrangement.id]:n})).insights).toEqual([]);
  }
  expect(finding({[arrangement.id]:5,'budget-10-r22':1},'money').text).toContain('доход второго, если он есть, остаётся у него');
 });
 it('distinguishes de-escalation, repair after another apology and making own apology',()=>{
  const i=finding(rich,'discussion');
  expect(i.text).toMatch(/пауз/); expect(i.text).toMatch(/после извинения партнёра/); expect(i.text).toMatch(/собственн|свою резкость/);
  expect(i.text).not.toMatch(/противореч|лицемер|не умеете|незрел/);
  const pause=finding({'conflict-response-01':2,'conflict-repair-01':2},'discussion');
  expect(pause.text).toMatch(/возврат|вернуться/); expect(pause.text).not.toMatch(/избега|наказ|разрыв/);
 });
 it('connects desired listening with a request that may remain invisible, without granting giving skills',()=>{
  const i=finding(rich,'support'); expect(i.text).toMatch(/выслуш/);expect(i.text).toMatch(/не прос|не сообщает|не сообщаете|неозвуч/);
  expect(i.text).not.toMatch(/умеете слушать|поддерживаете|не нуждает|тревож|привязанност/);
  expect(i.evidence.map(e=>e.questionId)).toContain('reflect-03');
  expect(finding({'loyalty-05':5,'attach-03':1},'support').text).not.toBe(i.text);
 });
 it('does not invent a contrast when both support signals are direct or a change of tone when no apology is chosen',()=>{
  const direct=finding({'loyalty-05':5,'attach-03':1,'reflect-03':1},'support');
  expect(direct.text).not.toMatch(/напротив|различаются/);
  expect(finding({'loyalty-05':5,'attach-03':1,'reflect-03':3},'support').text).not.toMatch(/также выбираете косвенный/);
  expect(finding({'relationship-goal-01':2,'kids-02':3},'plans').text).toMatch(/скорее/);
  const none=finding({'conflict-response-01':1,'conflict-repair-01':1,'regul-08':5},'discussion');
  expect(none.text).not.toMatch(/изменение тона/);
 });
 it('distinguishes explicit hurt delivered as a joke from an indirect reminder',()=>{
  const joke=finding({'loyalty-05':5,'attach-03':1,'reflect-03':2},'support');
  expect(joke.text).toMatch(/прям|слов/);expect(joke.text).toMatch(/шут/);
  expect(joke.text).not.toMatch(/косвенный сигнал|для догадки/);
  const hint=finding({'loyalty-05':5,'attach-03':1,'reflect-03':3},'support');
  expect(hint.text).toMatch(/косвенный|напомин/);
 });
 it('mentions calming time only when a pause is actually selected',()=>{
  const direct=finding({'conflict-response-01':1,'conflict-repair-01':1},'discussion');
  expect(direct.text).not.toMatch(/время на успокоение/);
  expect(finding({'conflict-response-01':2,'conflict-repair-01':1},'discussion').text).toMatch(/время на успокоение/);
 });
 it('names weekly shared activity precisely when holidays are together',()=>{
  expect(finding({'life-08-r22':3,'space-04':1},'leisure').text).toMatch(/раз в неделю или реже/);
  expect(finding({'life-08-r22':3,'space-04':1},'leisure').text).not.toMatch(/Частое общее увлечение вам не требуется/);
 });
 it('separates pooling, information and conditional decision rights',()=>{
  const i=finding(rich,'money');expect(i.text).toMatch(/доход второго, если он есть, остаётся у него/i);expect(i.text).toMatch(/информац/);expect(i.text).toMatch(/общи.*деньг/i);
  expect(i.text).not.toMatch(/каждый платит|за себя|парол|доступ к счет|контролируете|скуп/);
 });
 it('allows lasting child-free relationships and keeps current uncertainty distinct from future plans',()=>{
  const childfree=finding(rich,'plans');expect(childfree.text).toMatch(/долгосроч/);expect(childfree.text).toMatch(/без.*дет|детей/);expect(childfree.text).not.toMatch(/не готовы|несерьёз|передума/);
  const unknown=finding({'relationship-goal-01':3,'kids-02':4,'kids-timing-01-r22':2},'plans');
  expect(unknown.evidence.map(e=>e.questionId)).not.toContain('relationship-goal-01');expect(unknown.text).not.toMatch(/сейчас.*хотите.*долгосроч/);
  expect(personAnalysis(questions,profile({'relationship-goal-01':3,'kids-02':4})).insights).toEqual([]);
 });
 it('retains opposing child timing even when the current relationship goal is known',()=>{
  for (const choices of [
   {'relationship-goal-01':1,'kids-02':1,'kids-timing-01-r22':3},
   {'relationship-goal-01':1,'kids-02':4,'kids-timing-01-r22':1},
  ]) {
   const i=finding(choices,'plans');
   expect(i.evidence.map(e=>e.questionId)).toEqual(['relationship-goal-01','kids-02','kids-timing-01-r22']);
   expect(i.text).toMatch(/числе детей/);expect(i.text).toMatch(/срок/);
   expect(i.text).not.toMatch(/передума|непоследователь|противоречив|на самом деле/);
  }
  const i=finding({'relationship-goal-01':1,'kids-02':1,'kids-timing-01-r22':3},'plans');
  expect(i.text).toMatch(/не хотите общих детей/);expect(i.text).toMatch(/три-пять лет/);
 });
 it('connects shared activities and separate holidays without typing the participant',()=>{
  const i=finding(rich,'leisure');expect(i.text).toMatch(/регуляр|част/);expect(i.text).toMatch(/отдельн|раздельн/);expect(i.text).not.toMatch(/интроверт|зависим|противореч/);
 });
 it('separates relatives input from decision process without assigning a gendered role to the person',()=>{
  expect(finding(rich,'boundaries').text).toMatch(/совет/);expect(finding(rich,'boundaries').text).toMatch(/соглас/);
  const p=profile({'relatives-02':2,'roles-05-r22':1});p.name='Анна';const a=personAnalysis(questions,p).insights;p.name='Иван';expect(personAnalysis(questions,p).insights).toEqual(a);
  expect(a[0].text).not.toMatch(/вы решаете|ваше последнее слово|вам подчин/);
 });
 it('never imputes missing choices and requires two distinct answered exact metadata sources',()=>{
  for(const id of Object.keys(rich)) expect(personAnalysis(questions,profile({[id]:rich[id as keyof typeof rich]})).insights).toEqual([]);
  const p=profile(rich); const original=JSON.stringify([questions,p]);
  for(const i of personAnalysis(questions,p).insights){expect(new Set(i.evidence.map(e=>e.questionId)).size).toBeGreaterThanOrEqual(2);for(const e of i.evidence){const q=questions.find(q=>q.id===e.questionId)!;expect(e.question).toBe(q.text);expect(e.answer).toBe(q.options![e.option-1]);}}
  expect(JSON.stringify([questions,p])).toBe(original); expect(personAnalysis([],p).insights).toEqual([]);
  p.responses['attach-03']='skipped';p.responses['loyalty-05']=answerFor(NaN);expect(personAnalysis(questions,p).insights.some(i=>i.theme==='support')).toBe(false);
 });
 it('excludes history and unknown IDs and never aliases old expense data',()=>{
  const p=profile({'loyalty-05':5,'trauma-05':1,'trauma-06-r22':5,'attach-01':5,'invented':1,'budget-09':5});
  expect(personAnalysis(questions,p).insights).toEqual([]);
  const noOptions=questions.map(q=>q.id==='attach-03'?{...q,options:undefined}:q);
  expect(personAnalysis(noOptions,profile({'loyalty-05':5,'attach-03':1})).insights).toEqual([]);
 });
 it('uses priorities only to reorder at most six independent themes',()=>{
  const p=profile(rich), first=personAnalysis(questions,p);p.priorities={budget:'top',conflicts:'low'};const next=personAnalysis(questions,p);
  expect(next.insights[0].theme).toBe('money');expect(next.insights).toHaveLength(6);expect(new Set(next.insights.map(i=>i.theme)).size).toBe(6);
  expect([...next.insights].sort((a,b)=>a.theme.localeCompare(b.theme))).toEqual([...first.insights].sort((a,b)=>a.theme.localeCompare(b.theme)));
 });
 it('connects frequent novelty to whether the new wish is actually voiced',()=>{
  const hidden=finding({'intimacy-01-r29':5,'intimacy-03':5},'intimacy');
  expect(hidden.text).toMatch(/част/);expect(hidden.text).toMatch(/неозвуч|не сообщ/);
  expect(hidden.text).not.toMatch(/либидо|ориентац|совместим|риск|темперамент/);
  const direct=finding({'intimacy-01-r29':1,'intimacy-03':2},'intimacy');
  expect(direct.text).toMatch(/редко|почти не/);expect(direct.text).toMatch(/если.*желани|когда.*желани/);
  expect(direct.text).toMatch(/время|момент|слов/);expect(direct.text).not.toMatch(/противореч/);
 });
 it('selects a prioritized intimacy finding within the six-finding limit',()=>{
  const p=profile({...rich,'intimacy-01-r29':4,'intimacy-03':3});p.priorities={intimacy:'top'};
  const result=personAnalysis(questions,p);expect(result.insights).toHaveLength(6);expect(result.insights[0].theme).toBe('intimacy');
  p.priorities={};const unprioritized=personAnalysis(questions,p);expect(unprioritized.insights).toHaveLength(6);
  expect(result.insights[0]).toEqual(finding({'intimacy-01-r29':4,'intimacy-03':3},'intimacy'));
 });
 it('requires both exact current intimacy sources, without substituting an older novelty ID',()=>{
  for(const choices of [{'intimacy-01-r29':5},{'intimacy-03':1},{'intimacy-01':5,'intimacy-03':1}] as Record<string,number>[])
   expect(personAnalysis(questions,profile(choices)).insights).toEqual([]);
  expect(personAnalysis(questions.filter(q=>q.id!=='intimacy-01-r29'),profile({'intimacy-01-r29':5,'intimacy-03':1})).insights).toEqual([]);
 });
 it('keeps hostile metadata and names as plain unexecuted evidence data',()=>{
  const p=profile({'loyalty-05':5,'attach-03':5});p.name='<img src=x onerror=alert(1)>';
  const qs=questions.map(q=>q.id==='loyalty-05'?{...q,text:'<script>evil()</script>',options:q.options!.map(()=>'<b>source</b>')}:q);
  const result=personAnalysis(qs,p);expect(result.name).toBe(p.name);expect(result.insights[0].evidence[0].question).toBe('<script>evil()</script>');expect(result.insights[0].text).not.toContain('<b>');
 });
});
