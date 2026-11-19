import {describe,it,expect} from 'vitest';
import {QUESTIONS,CURRENT_IDS,CURRENT_FIRM,BANK_VERSION,MANIFEST,FIRM,COMPATIBLE_SINCE} from '../research/blind/target-v20/legacy-questions-v29';
import * as old from '../research/blind/target-v20/legacy-questions-v28';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {encode,decode} from '../src/codec/codec';
import {unansweredIds,resumeFor} from '../src/ui/flow';
import {semanticRelationship} from '../src/scoring/semantic-relationship';
import type {Profile} from '../src/types';

describe('v29 feedback wording and continuity',()=>{
  it('keeps untouched questions and historical manifests, with two explicit context replacements and one retirement',()=>{
    expect(BANK_VERSION).toBe(29);expect(COMPATIBLE_SINCE).toBe(18);expect(QUESTIONS).toHaveLength(122);
    expect(MANIFEST[28]).toEqual(old.CURRENT_IDS);
    const changed=new Set(['budget-01','kids-01','intimacy-01','values-02']);
    expect(QUESTIONS.filter(q=>!['budget-01','kids-01-r29','intimacy-01-r29'].includes(q.id)))
      .toEqual(old.QUESTIONS.filter(q=>!changed.has(q.id)));
    const budget=QUESTIONS.find(q=>q.id==='budget-01')!;
    expect(budget.options?.slice(0,4)).toEqual(old.QUESTIONS.find(q=>q.id==='budget-01')!.options?.slice(0,4));
    expect(budget.options?.[4]).toBe('Общего бюджета нет');expect(budget.right).toBe(budget.options?.[4]);
    expect(QUESTIONS.find(q=>q.id==='kids-01-r29')?.text).toContain('два года в отношениях и живёте вместе');
    expect(QUESTIONS.find(q=>q.id==='intimacy-01-r29')?.text).toContain('чего у вас вместе ещё не было');
  });

  it('preserves old answers without silently using them for the two clarified contexts',()=>{
    const original:Profile={name:'Аня',bankVersion:28,responses:Object.fromEntries(old.CURRENT_IDS.map((id,i)=>[id,answerFor(OPTION_VALUES[i%5])])),priorities:{kids:'top',budget:'top',home:'top',conflicts:'top',intimacy:'top'}};
    const restored=decode(encode(original,old.CURRENT_IDS,old.CURRENT_FIRM),MANIFEST,FIRM);
    expect(restored).toEqual(original);
    const missing=['kids-01-r29','intimacy-01-r29'];expect(unansweredIds(CURRENT_IDS,restored.responses)).toEqual(missing);
    expect(resumeFor({name:original.name,responses:original.responses,index:90,inviterCode:null},null,CURRENT_IDS)?.index).toBe(CURRENT_IDS.indexOf(missing[0]));
    expect(semanticRelationship(QUESTIONS,restored,restored).unknownIds).toEqual(expect.arrayContaining(missing));
    const filled:Profile={...restored,bankVersion:BANK_VERSION,responses:{...restored.responses,'kids-01-r29':answerFor(OPTION_VALUES[0]),'intimacy-01-r29':answerFor(OPTION_VALUES[3])}};
    const current=decode(encode(filled,CURRENT_IDS,CURRENT_FIRM),MANIFEST,FIRM);
    expect(Object.keys(current.responses)).toHaveLength(122);expect(unansweredIds(CURRENT_IDS,current.responses)).toEqual([]);
    expect(current.responses).not.toHaveProperty('values-02');expect(current.responses).not.toHaveProperty('kids-01');
    expect(semanticRelationship(QUESTIONS,current,current)).toEqual(semanticRelationship(QUESTIONS,filled,filled));
    expect(original.responses).toHaveProperty('kids-01');
  });
});
