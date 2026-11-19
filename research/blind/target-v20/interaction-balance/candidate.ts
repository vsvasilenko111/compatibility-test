import {compare,type SphereWeight} from '../../../../src/scoring/compare';
import type {Profile,Question} from '../../../../src/types';

/** Existing item semantics and own priorities within each domain; fixed equal halves.
 * Full profiles are retained because cross items can read excluded habit answers.
 * Missing domains reject scoring rather than silently changing the 50/50 model.
 */
export function relationshipScore(questions:Question[],a:Profile,b:Profile,weight:SphereWeight):number|null{
 const eligible=questions.filter(q=>q.block!=='maturity'&&q.scored!==false);
 const preference=compare(eligible.filter(q=>!q.behaviorLevels),a,b,weight).relationship.percent;
 const behavior=compare(eligible.filter(q=>!!q.behaviorLevels),a,b,weight).relationship.percent;
 return preference===null||behavior===null?null:(preference+behavior)/2;
}
