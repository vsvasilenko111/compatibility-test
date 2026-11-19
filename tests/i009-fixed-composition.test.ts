import {describe,it,expect} from 'vitest';
import frozenBank from '../research/blind/target-v20/score-resolution/candidate-bank-v27.json';
import {answerFor,OPTION_VALUES} from '../src/answer';
import type {Profile,Question} from '../src/types';
import {relationshipScore} from '../research/blind/target-v20/iterations/I009-fixed-composition/candidate';
const bank = frozenBank as { questions: Question[] };
const qs:Question[]=bank.questions.filter((q:Question)=>['relationship-goal-01','attach-01','attach-03'].includes(q.id));
function p(goal:number,attitude:number,withdrawal:number):Profile{return {name:'test',bankVersion:27,responses:Object.fromEntries([['relationship-goal-01',goal],['attach-01',attitude],['attach-03',withdrawal]].map(([id,n])=>[id,answerFor(OPTION_VALUES[Number(n)-1])]))};}
describe('I009 exact composition of the two frozen research scalar components',()=>{
 it('combines own directional means with hand-derived geometric aggregate',()=>{expect(relationshipScore(qs,p(2,3,1),p(2,1,5))).toBeCloseTo(Math.sqrt(.625*.875)*100,12);});
 it('excludes unknown goals before numeric grading',()=>{expect(relationshipScore(qs,p(3,1,1),p(3,1,1))).toBe(100);});
 it('both no-long-term goals contribute zero only to the horizon component',()=>{expect(relationshipScore(qs,p(5,1,1),p(5,1,1))).toBe(50);});
 it('full long-term direction with neutral closeness scores 100',()=>{expect(relationshipScore(qs,p(1,1,1),p(1,1,1))).toBe(100);});
 it('does not mutate raw bank questions',()=>{const before=JSON.stringify(bank);relationshipScore(bank.questions,p(2,3,1),p(2,1,5));expect(JSON.stringify(bank)).toBe(before);expect(bank.questions).toHaveLength(123);});
});
