/** Research-only view; product question objects and scoring remain untouched. */
import type {Profile,Question} from '../../../../../src/types';
import {compare} from '../../../../../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../../../../../src/questions/spheres';
export const ACTION_IDS=['reflect-01','regul-08','reflect-03'];
export function scoringView(questions:Question[]):Question[]{return questions.map(q=>ACTION_IDS.includes(q.id)?{...q,block:"friendship",sphere:"conflicts",behaviorLevels:[1,.7,.5,.3,0]}:q);}
export function relationshipScore(questions:Question[],a:Profile,b:Profile):number|null{
 return compare(scoringView(questions),a,b,relationshipWeight,friendshipWeight).relationship.percent;
}
