import type {Profile,Question} from '../../../../../src/types';
import {compare} from '../../../../../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../../../../../src/questions/spheres';
export function relationshipScore(questions:Question[],a:Profile,b:Profile):number|null{
 // Numeric research horizon only. This private view must never supply product UI:
 // behaviorLevels is solely an existing numeric direction implementation, not a label for goals.
 const view=questions.map(q=>{
  if(q.id!=='relationship-goal-01')return q;
  if(q.behaviorLevels||q.formats||q.cross)throw Error('Unexpected incompatible goal metadata');
  if(JSON.stringify(q.uncertainOptions)!=='[3]')throw Error('Goal uncertainty changed');
  return {...q,behaviorLevels:[1,.75,.5,.25,0] as [number,number,number,number,number]};
 });
 return compare(view,a,b,relationshipWeight,friendshipWeight).relationship.percent;
}
