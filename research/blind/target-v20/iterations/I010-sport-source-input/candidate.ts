import type {Profile,Question} from '../../../../../src/types';
import {scoringView} from '../I006-closeness-cross/candidate';
import {relationshipScore as goalScore} from '../I008-goal-alignment/candidate';
export function sportInputView(q:Question[]):Question[]{return q.map(item=>['life-01','life-01-r25'].includes(item.id)?{...item,scored:false}:item);}
export function relationshipScore(q:Question[],a:Profile,b:Profile):number|null{return goalScore(scoringView(sportInputView(q)),a,b);}
