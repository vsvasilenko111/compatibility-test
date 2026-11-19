/** Research-only anxious-withdrawal interaction hypothesis; no clinical validity claim. */
import type {Profile,Question} from '../../../../../src/types';
import {compare} from '../../../../../src/scoring/compare';
import {relationshipWeight,friendshipWeight} from '../../../../../src/questions/spheres';
export function scoringView(questions:Question[]):Question[]{return questions.map(q=>{
 if(q.id!=='attach-01')return q;
 if(q.behaviorLevels||q.formats||q.cross)throw Error('Unexpected incompatible attach-01 metadata');
 return {...q,block:'friendship',sphere:'conflicts',scored:true,cross:{id:'attach-03',level:[0,0,0,0,1]}};
});}
export function relationshipScore(questions:Question[],a:Profile,b:Profile):number|null{
 return compare(scoringView(questions),a,b,relationshipWeight,friendshipWeight).relationship.percent;
}
