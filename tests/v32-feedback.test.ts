import {describe,it,expect} from 'vitest';
import * as v31 from '../research/blind/target-v20/legacy-questions-v31';
import {QUESTIONS,CURRENT_IDS,CURRENT_FIRM,BANK_VERSION,MANIFEST,FIRM} from '../research/blind/target-v20/legacy-questions-v33';
import {answerFor,OPTION_VALUES} from '../src/answer';
import {encode,decode} from '../src/codec/codec';
import {unansweredIds} from '../src/ui/flow';
import {compare} from '../src/scoring/compare';
import {semanticRelationship} from '../src/scoring/semantic-relationship';
import type {Profile} from '../src/types';
import released from '../src/questions/released.json';

const added=['life-13-r32','love-words-01-r32','love-care-01-r32','feedback-01-r32'];
const removed=['kids-01-r29','life-13-r22','roles-01','honesty-01'];
const question=(id:string)=>QUESTIONS.find(q=>q.id===id)!;
const profile=(responses:Record<string,number>,bankVersion=BANK_VERSION):Profile=>({name:'Аня',bankVersion,responses:Object.fromEntries(Object.entries(responses).map(([id,value])=>[id,answerFor(value)]))});
const vapeItem=(a:Profile,b:Profile)=>compare([question('home-09')],a,b).relationship.spheres.flatMap(s=>s.items).find(q=>q.id==='home-09');

describe('v32 feedback changes',()=>{
  it('changes only the requested questions and keeps sport and the partner-vape scenario intact',()=>{
    expect(released.manifests['32']).toBeTruthy();expect(released.bank['32']).toBeTruthy();
    expect(BANK_VERSION).toBe(33);expect(MANIFEST[33]).toEqual(CURRENT_IDS);expect(QUESTIONS).toHaveLength(120);
    expect(CURRENT_IDS).toEqual(QUESTIONS.map(q=>q.id));expect(new Set(CURRENT_IDS).size).toBe(120);
    expect(CURRENT_IDS.filter(id=>!v31.CURRENT_IDS.includes(id))).toEqual(added);
    expect(v31.CURRENT_IDS.filter(id=>!CURRENT_IDS.includes(id))).toEqual(removed);
    expect(QUESTIONS.filter(q=>!added.includes(q.id)&&q.id!=='home-09'))
      .toEqual(v31.QUESTIONS.filter(q=>!removed.includes(q.id)&&q.id!=='home-09'));
    const {cross:oldCross,...oldHome}=v31.QUESTIONS.find(q=>q.id==='home-09')!;
    const {cross:newCross,...newHome}=question('home-09');
    expect(newHome).toEqual(oldHome);expect(newCross).toEqual({id:'life-13-r32',level:[0,2/30,6.5/30,14.5/30,25/30]});
    expect(oldCross?.id).toBe('life-13-r22');
    expect(question('life-01')).toEqual(v31.QUESTIONS.find(q=>q.id==='life-01'));
    expect(QUESTIONS.some(q=>q.id==='kids-01-r29')).toBe(false);
  });
  it('asks about vape frequency during the last 30 days without scoring self-use directly',()=>{
    const vape=question('life-13-r32');expect(vape).toBeDefined();
    expect(vape.text).toMatch(/30/);expect(vape.text).toMatch(/дн|день/);expect(vape.text).toMatch(/вейп/i);
    expect(vape.options).toEqual(['0 дней','1–3 дня','4–9 дней','10–19 дней','20–30 дней']);
    expect(vape.scored).toBe(false);
  });
  it('allows both words and practical care to be very important independently',()=>{
    const words=question('love-words-01-r32'),care=question('love-care-01-r32');
    for(const q of [words,care]){
      expect(q).toBeDefined();expect(q.sphere).toBe('love');
      expect(q.options).toEqual(['Очень важно','Скорее важно','Умеренно важно','Скорее неважно','Совсем неважно']);
    }
    expect(words.text).toMatch(/слов|комплимент|сообщени/i);expect(care.text).toMatch(/забот|дел|помо/i);
    const p=profile({'love-words-01-r32':0,'love-care-01-r32':0});
    const restored=decode(encode(p,CURRENT_IDS,CURRENT_FIRM),MANIFEST,FIRM);
    expect(restored.responses['love-words-01-r32']).toEqual(answerFor(0));
    expect(restored.responses['love-care-01-r32']).toEqual(answerFor(0));
    const result=compare([words,care],p,p).relationship;
    expect(result.percent).toBe(100);expect(result.talkZones).toEqual([]);
    expect(result.spheres.flatMap(s=>s.items).map(q=>q.id)).toEqual(['love-words-01-r32','love-care-01-r32']);
  });
  it('asks for preferred criticism and support balance as a fresh topic',()=>{
    const feedback=question('feedback-01-r32');expect(feedback).toBeDefined();
    expect(feedback.topic).not.toBe(v31.QUESTIONS.find(q=>q.id==='honesty-01')!.topic);
    expect(feedback.text+' '+feedback.options?.join(' ')).toMatch(/критик|замечани|недостатк/i);
    expect(feedback.text+' '+feedback.options?.join(' ')).toMatch(/поддерж|похвал/i);
    expect(feedback.options).toHaveLength(5);
  });
  it('decodes v31 answers without renaming them and asks only the four fresh items',()=>{
    const old:Profile={name:'Миша',bankVersion:31,responses:Object.fromEntries(v31.CURRENT_IDS.map((id,i)=>[id,answerFor(OPTION_VALUES[i%5])]))};
    const decoded=decode(encode(old,v31.CURRENT_IDS,v31.CURRENT_FIRM),MANIFEST,FIRM);
    expect(decoded).toEqual(old);expect(MANIFEST[31]).toEqual(v31.CURRENT_IDS);expect(FIRM[31]).toEqual(v31.CURRENT_FIRM);
    expect(unansweredIds(CURRENT_IDS,decoded.responses)).toEqual(added);
    for(const id of removed)expect(decoded.responses[id]).toEqual(old.responses[id]);
    for(const id of added)expect(decoded.responses).not.toHaveProperty(id);
    const filled:Profile={...decoded,bankVersion:BANK_VERSION,responses:{...decoded.responses,...Object.fromEntries(added.map((id,i)=>[id,answerFor(OPTION_VALUES[i])]))}};
    const current=decode(encode(filled,CURRENT_IDS,CURRENT_FIRM),MANIFEST,FIRM);
    expect(Object.keys(current.responses)).toHaveLength(120);expect(unansweredIds(CURRENT_IDS,current.responses)).toEqual([]);
    for(const id of removed)expect(current.responses).not.toHaveProperty(id);
    for(const id of CURRENT_IDS)expect(current.responses[id]).toEqual(filled.responses[id]);
    expect(semanticRelationship(QUESTIONS,current,current)).toEqual(semanticRelationship(QUESTIONS,filled,filled));
  });
  it('uses the other person’s current frequency and gives rare use a nonzero effect',()=>{
    for(const [value,level] of [[0,0],[3,2/30],[5,6.5/30],[7,14.5/30],[10,25/30]]){
      const a=profile({'home-09':10,'life-13-r32':0});
      const b=profile({'home-09':0,'life-13-r32':value});
      expect(vapeItem(a,b)?.match).toBeCloseTo(1-level,12);
      expect(vapeItem(b,a)?.match).toBeCloseTo(1-level,12);
    }
    // Both accept vaping: frequency alone does not lower their compatibility.
    expect(vapeItem(profile({'home-09':0,'life-13-r32':0}),profile({'home-09':0,'life-13-r32':10}))?.match).toBe(1);
    const nonusers=profile({'home-09':10,'life-13-r32':0,'life-13-r22':10});
    expect(vapeItem(nonusers,nonusers)?.match).toBe(1);
    const missing=profile({'home-09':10,'life-13-r22':10});
    expect(vapeItem(missing,missing)).toBeUndefined();
  });
});
