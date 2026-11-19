/** Offline design hypothesis: cross sources supply exposure, without a second similarity grade. */
import type {Profile,Question} from '../../../../../src/types';
import {compare} from '../../../../../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../../../../../src/questions/spheres';
export function scoringView(questions:Question[]):Question[]{
 const sources=new Set(questions.flatMap(q=>q.cross?[q.cross.id]:[]));
 return questions.map(q=>sources.has(q.id)?{...q,scored:false}:q);
}
export function relationshipScore(questions:Question[],a:Profile,b:Profile):number|null{
 return compare(scoringView(questions),a,b,relationshipWeight,friendshipWeight).relationship.percent;
}
