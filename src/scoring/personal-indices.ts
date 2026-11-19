import { optionIndex } from '../answer';
import type { Profile, Question } from '../types';
import type { PersonEvidence } from './person-summary';
export interface IndexEvidence extends PersonEvidence { points: number }
export interface PersonalIndex {
  key: string; title: string; kind: 'resource' | 'preference'; score: number | null;
  lowLabel: string; highLabel: string; explanation: string; answered: number; total: number;
  evidence: IndexEvidence[]; missingIds: string[]; mixed: boolean;
}
export interface PersonalIndices {
  version: 'personal-indices-v3'; resources: PersonalIndex[]; preferences: PersonalIndex[];
  strengths: string[]; attention: string[];
}
interface Scale {
  key: string; title: string; kind: 'resource' | 'preference';
  lowLabel: string; highLabel: string; explanation: string;
  sources: [string, readonly number[]][];
}

// Defined before profile examples. These mappings do not use population data,
// compatibility rules, importance, labels, gender, or inferred personality.
export const MIN_PERSONAL_INDEX_SOURCES = 7;
const scales: Scale[] = [
  {key:'dialogue',title:'Диалог и восстановление контакта',kind:'resource',
    lowLabel:'Оставлять сложное без обсуждения',highLabel:'Прояснять и возвращаться к разговору',
    explanation:'Семь ситуаций: просьба о поддержке, выражение обиды и желания, реакция в споре, повторяющееся разногласие, ответ на извинение и собственное извинение. Это сводный индекс выбранных способов вести диалог, не оценка личности.',
    sources:[['reflect-03',[1,1,.5,0,0]],['attach-03',[1,.75,.5,.25,0]],['intimacy-03',[1,1,.5,.25,0]],['conflict-response-01',[1,1,.5,.25,0]],['reflect-01',[1,1,.5,.25,0]],['conflict-repair-01',[1,1,.75,.25,0]],['regul-08',[1,.75,.5,.25,0]]]},
  {key:'shared_life',title:'Совместный образ жизни',kind:'preference',
    lowLabel:'Больше личного времени и пространства',highLabel:'Больше общих занятий и времени',
    explanation:'Семь контекстов общего и отдельного времени: увлечения, друзья, поездки, вечер в одиночестве, свидания, место дома и участие в хобби партнёра. Последний вопрос также касается готовности подстроиться; это широкий профиль выбора в ситуациях, не мера привязанности или общительности. Оба полюса равноценны.',
    sources:[['life-08-r22',[1,.75,.5,.25,0]],['space-10',[1,.75,.5,.25,0]],['space-04',[1,.75,.5,.25,0]],['space-06',[1,.75,.5,.25,0]],['roles-06',[1,.75,.5,.25,0]],['living-06',[0,.25,.5,.75,1]],['leisure-06',[1,.75,.5,.25,0]]]},
  {key:'close_circle',title:'Участие в жизни близких',kind:'preference',
    lowLabel:'Меньше участия в перечисленных делах',highLabel:'Больше участия в перечисленных делах',
    explanation:'Составной профиль семи конкретных решений: визиты к родителям, семейный Новый год, совместное проживание с родителем, встречи с друзьями партнёра, помощь родителям деньгами и временем, участие в хобби партнёра. Здесь соединяются время, деньги и место дома; это не единая доказанная черта, не оценка доброты и не способность поддерживать. Возможности и обстоятельства тоже влияют на выбор. Помощь родителю иначе, без проживания вместе, даёт ноль только за проживание. Встречи с друзьями оцениваются только по собственному участию: три варианта без посещений равны. Вопрос о хобби также входит в шкалу совместного времени, поэтому индексы частично пересекаются и не складываются в общий балл.',
    sources:[['relatives-01-r22',[1,.75,.5,.25,0]],['relatives-06',[1,.75,.5,.25,0]],['relatives-07',[1,.75,.5,0,0]],['relatives-08',[1,.5,0,0,0]],['budget-05',[1,.75,.5,.25,0]],['leisure-06',[1,.75,.5,.25,0]],['loyalty-04-r22',[1,.75,.5,.25,0]]]},
];

/** Transparent indices of selected answers, not validated traits or probabilities. */
export function personalIndices(questions: Question[], profile: Profile): PersonalIndices {
  const metadata = new Map(questions.map(q => [q.id,q]));
  const indices = scales.map((scale): PersonalIndex => {
    const evidence: IndexEvidence[] = [];
    const missingIds: string[] = [];
    for (const [id, levels] of scale.sources) {
      const q = metadata.get(id), response = profile.responses[id];
      if (!q?.options || !response || response === 'skipped' || !Number.isFinite(response.value)
        || response.value < 0 || response.value > 10) { missingIds.push(id); continue; }
      const option = optionIndex(response.value) + 1;
      const answer = q.options[option - 1];
      if (!answer || q.uncertainOptions?.includes(option)) { missingIds.push(id); continue; }
      evidence.push({questionId:id,topic:q.topic,question:q.text,option,answer,points:levels[option - 1] * 100});
    }
    const answered = new Set(evidence.map(item => item.questionId)).size;
    const score = answered >= MIN_PERSONAL_INDEX_SOURCES && new Set(scale.sources.map(([id]) => id)).size >= MIN_PERSONAL_INDEX_SOURCES
      ? evidence.reduce((sum,e) => sum + e.points,0) / answered : null;
    const points = evidence.map(e => e.points);
    return {key:scale.key,title:scale.title,kind:scale.kind,score,
      lowLabel:scale.lowLabel,highLabel:scale.highLabel,explanation:scale.explanation,
      answered,total:scale.sources.length,evidence,missingIds,
      mixed:answered >= 2 && Math.max(...points) - Math.min(...points) >= 75};
  });
  const resources = indices.filter(i => i.kind === 'resource');
  const preferences = indices.filter(i => i.kind === 'preference');
  // Only fully covered eligible resources support a summary.
  const covered = resources.filter(i => i.score !== null && i.answered === i.total);
  const strengths = covered.filter(i => i.score! >= 75).sort((a,b) => b.score! - a.score!).slice(0,2).map(i => i.key);
  const attention = covered.filter(i => i.score! < 50).sort((a,b) => a.score! - b.score!).slice(0,2).map(i => i.key);
  return {version:'personal-indices-v3',resources,preferences,strengths,attention};
}
