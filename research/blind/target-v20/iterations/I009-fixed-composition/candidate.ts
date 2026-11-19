/** Exact fixed composition; scalar research output only. */
import type {Profile,Question} from '../../../../../src/types';
import {scoringView} from '../I006-closeness-cross/candidate';
import {relationshipScore as goalScore} from '../I008-goal-alignment/candidate';
export function relationshipScore(q:Question[],a:Profile,b:Profile):number|null{return goalScore(scoringView(q),a,b);}
