// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startApp} from '../src/ui/app';
import {BANK_VERSION,CURRENT_IDS,CURRENT_FIRM,QUESTIONS} from '../src/questions';
import * as v30 from '../research/blind/target-v20/legacy-questions-v30';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {encode} from '../src/codec/codec';
import {resultHash} from '../src/router';
import {createStore} from '../src/storage';
import type {Profile} from '../src/types';

let root:HTMLElement;
let listenerSpy:ReturnType<typeof vi.spyOn>;
const complete=(name:string):Profile=>({name,bankVersion:BANK_VERSION,
  responses:Object.fromEntries(QUESTIONS.map(q=>[q.id,answerFor(OPTION_VALUES[q.uncertainOptions?.includes(3)?0:2])])),
  priorities:{kids:'top',budget:'top',conflicts:'top',home:'top',loyalty:'top'}});
const code=(p:Profile)=>encode(p,CURRENT_IDS,CURRENT_FIRM);
function open(a:string,b:string,quick=false){history.replaceState(null,'','#'+resultHash(a,b,quick));startApp(root);}

beforeEach(()=>{localStorage.clear();history.replaceState(null,'','/');root=document.createElement('main');document.body.replaceChildren(root);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});listenerSpy=vi.spyOn(window,'addEventListener');});
afterEach(()=>{for(const call of listenerSpy.mock.calls){const [type,listener]=call;if(type==='hashchange')window.removeEventListener(type as 'hashchange',listener as EventListener);}
  vi.restoreAllMocks();history.replaceState(null,'','/');localStorage.clear();});

describe('both questionnaires must be complete before pair results',()=>{
  it('tells the invited participant before starting that answers and descriptions are shared',()=>{
    history.replaceState(null,'','#i.'+code(complete('Аня')));startApp(root);
    expect(root.textContent).toContain('В общем результате будут видны ответы обоих участников и краткие описания по ним');
    expect(root.querySelector('.score')).toBeNull();expect(root.querySelector('.person-summaries')).toBeNull();
  });
  it('shows both portraits and compatibility once both current questionnaires and priorities are complete',()=>{
    open(code(complete('Аня')),code(complete('Борис')));
    expect(root.querySelector('.score.main')).not.toBeNull();expect(root.querySelectorAll('.person-summary-card')).toHaveLength(2);
    expect(root.querySelector('.result-pending')).toBeNull();
  });
  it('withholds score and portraits for an old incomplete context and resumes only missing answers',()=>{
    const old:Profile={name:'Борис',bankVersion:30,responses:Object.fromEntries(v30.CURRENT_IDS.map(id=>[id,answerFor(OPTION_VALUES[1])])),priorities:complete('Борис').priorities};
    open(code(complete('Аня')),encode(old,v30.CURRENT_IDS,v30.CURRENT_FIRM));
    expect(root.querySelector('.result-pending')).not.toBeNull();expect(root.querySelector('.score')).toBeNull();expect(root.querySelector('.person-summaries')).toBeNull();
    expect(root.textContent).toContain('Борис');expect(root.textContent).toContain('Осталось 5 вопросов.');
    const button=root.querySelector<HTMLButtonElement>('[data-fill-person="Борис"]')!;expect(button).not.toBeNull();button.click();
    const progress=createStore(localStorage).loadProgress()!;expect(progress.responses).toEqual(old.responses);
    expect(progress.only).toEqual(['budget-arrangement-r36','life-13-r32','feedback-01-r32','budget-09-r31','loyalty-03-r31']);
    expect(root.textContent).toContain(QUESTIONS.find(q=>q.id==='budget-arrangement-r36')!.text);
  });
  it('requires the priority step even when all questions have answers, without asking them again',()=>{
    const b=complete('Борис');delete b.priorities;
    open(code(complete('Аня')),code(b));
    expect(root.querySelector('.result-pending')).not.toBeNull();expect(root.querySelector('.score')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-fill-person="Борис"]')!.click();
    const progress=createStore(localStorage).loadProgress()!;expect(progress.only).toEqual([]);expect(progress.responses).toEqual(b.responses);
    expect(root.textContent).toContain('важн');
  });
  it('accepts explicit uncertainty as answered rather than forcing certainty before results',()=>{
    const a=complete('Аня'),b=complete('Борис');a.responses['relationship-goal-01']=answerFor(OPTION_VALUES[2]);
    open(code(a),code(b));
    expect(root.querySelector('.result-pending')).toBeNull();expect(root.querySelector('.score.main')).not.toBeNull();
    expect(root.querySelector('.person-summaries')).not.toBeNull();
  });
  it('does not let a quick-mode link bypass completion of both full questionnaires',()=>{
    const partial=complete('Борис');
    for(const id of CURRENT_IDS.slice(5))delete partial.responses[id];
    open(code(complete('Аня')),code(partial),true);
    expect(root.querySelector('.result-pending')).not.toBeNull();expect(root.querySelector('.score')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-fill-person="Борис"]')!.click();
    expect(createStore(localStorage).loadProgress()!.only).toHaveLength(CURRENT_IDS.length-5);
  });
});
