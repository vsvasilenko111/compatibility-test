import {describe,it,expect} from 'vitest';
import * as v29 from '../research/blind/target-v20/legacy-questions-v29';
import * as v30 from '../research/blind/target-v20/legacy-questions-v30';
import {QUESTIONS,CURRENT_IDS,CURRENT_FIRM,BANK_VERSION,MANIFEST,FIRM} from '../research/blind/target-v20/legacy-questions-v31';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {encode,decode} from '../src/codec/codec';
import {unansweredIds} from '../src/ui/flow';
import {semanticRelationship} from '../src/scoring/semantic-relationship';
import type {Profile} from '../src/types';

describe('v30 family-plan clarification',()=>{
  it('clarifies personal family plans without replacing answers or changing calculations',()=>{
    expect(v30.BANK_VERSION).toBe(30);expect(v30.CURRENT_IDS).toEqual(v29.CURRENT_IDS);
    expect(v30.QUESTIONS.map(q=>q.id==='kids-02'?{...q,text:v29.QUESTIONS.find(x=>x.id===q.id)!.text}:q)).toEqual(v29.QUESTIONS);
    expect(v30.QUESTIONS.find(q=>q.id==='kids-02')!.text).toContain('с подходящим вам партнёром');
    for(let offset=0;offset<5;offset++){
      const p:Profile={name:'Аня',bankVersion:29,responses:Object.fromEntries(v29.CURRENT_IDS.map((id,i)=>[id,answerFor(OPTION_VALUES[(i+offset)%5])]))};
      expect(semanticRelationship(v30.QUESTIONS,p,p)).toEqual(semanticRelationship(v29.QUESTIONS,p,p));
    }
  });
});

describe('v31 feedback changes',()=>{
  it('only generalizes two contexts and removes the requested cat and jacket questions',()=>{
    expect(BANK_VERSION).toBe(31);expect(QUESTIONS).toHaveLength(120);expect(MANIFEST[30]).toEqual(v30.CURRENT_IDS);
    const changed=['budget-09','loyalty-03','home-12','conflicts-09'];
    expect(QUESTIONS.filter(q=>!['budget-09-r31','loyalty-03-r31'].includes(q.id)))
      .toEqual(v30.QUESTIONS.filter(q=>!changed.includes(q.id)));
    const expense=QUESTIONS.find(q=>q.id==='budget-09-r31')!;
    expect(expense.text).toContain('в ваш месячный доход');expect(expense.text).not.toContain('телефон');
    expect(expense.options?.[0]).toBe('Сначала накоплю нужную сумму');
    expect(expense.options?.slice(1)).toEqual(v30.QUESTIONS.find(q=>q.id==='budget-09')!.options?.slice(1));
    expect(QUESTIONS.find(q=>q.id==='loyalty-03-r31')!.text).toContain('при всех оскорбил вас');
  });
  it('keeps all old answers and asks only for the two new contexts',()=>{
    const p:Profile={name:'Миша',bankVersion:30,responses:Object.fromEntries(v30.CURRENT_IDS.map((id,i)=>[id,answerFor(OPTION_VALUES[i%5])]))};
    const decoded=decode(encode(p,v30.CURRENT_IDS,v30.CURRENT_FIRM),MANIFEST,FIRM);expect(decoded).toEqual(p);
    expect(unansweredIds(CURRENT_IDS,decoded.responses)).toEqual(['budget-09-r31','loyalty-03-r31']);
    const filled:Profile={...decoded,bankVersion:BANK_VERSION,responses:{...decoded.responses,'loyalty-03-r31':answerFor(7),'budget-09-r31':answerFor(3)}};
    const roundtrip=decode(encode(filled,CURRENT_IDS,CURRENT_FIRM),MANIFEST,FIRM);
    expect(Object.keys(roundtrip.responses)).toHaveLength(120);expect(unansweredIds(CURRENT_IDS,roundtrip.responses)).toEqual([]);
    expect(roundtrip.responses).not.toHaveProperty('home-12');expect(roundtrip.responses).not.toHaveProperty('conflicts-09');
    expect(semanticRelationship(QUESTIONS,roundtrip,roundtrip)).toEqual(semanticRelationship(QUESTIONS,filled,filled));
  });
});
