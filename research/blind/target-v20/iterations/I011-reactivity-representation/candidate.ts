/** Offline nonclinical hypothesis about projected long-term wellbeing against synthetic gold only.
 * Existing emotional-tension answers are a current resource signal, not moral quality, fitness,
 * diagnosis, probability, or a claim that anxiety causes every relationship outcome.
 * Never supply this private behaviorLevels view to product UI or product resource reporting.
 */
import type {Profile,Question} from '../../../../../src/types';
import {sportInputView} from '../I010-sport-source-input/candidate';
import {relationshipScore as goalScore} from '../I008-goal-alignment/candidate';
export function reactivityView(questions:Question[]):Question[]{return questions.map(q=>{
 if(q.id!=='attach-01')return q;
 if(q.behaviorLevels||q.formats||q.cross)throw Error('Expected original attach-01, not a prior experimental view');
 return {...q,block:'friendship',sphere:'conflicts',scored:true,behaviorLevels:[1,.7,.5,.3,0]};
});}
export function relationshipScore(questions:Question[],a:Profile,b:Profile):number|null{
 // Start from original bank: I006 withdrawal cross is intentionally absent. Return only main index.
 return goalScore(reactivityView(sportInputView(questions)),a,b);
}
