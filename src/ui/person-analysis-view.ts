import { personAnalysis } from '../scoring/person-analysis';
import type { PersonEvidence } from '../scoring/person-summary';
import type { Profile, Question } from '../types';
import { h } from './dom';

/** Findings are shown only when supported by at least two distinct source answers. */
export function personAnalysisView(analysis: ReturnType<typeof personAnalysis>): HTMLElement {
  const insights = analysis.insights.map(insight => ({ ...insight,
    evidence: [...new Map(insight.evidence.map(item => [item.questionId, item])).values()],
  })).filter(insight => insight.evidence.length >= 2);
  const source = (item: PersonEvidence) => h('li', { 'data-question-id': item.questionId },
    h('p', { class: 'person-insight-topic' }, item.topic),
    h('p', { class: 'person-insight-question' }, item.question),
    h('p', { class: 'person-insight-answer' }, `${item.option}. ${item.answer}`));
  return h('section', { class: 'person-analysis', 'aria-label': 'Личный разбор по ответам' },
    ...insights.map(insight => h('article', { class: 'person-insight', 'data-insight': insight.key, 'data-theme': insight.theme },
      h('h2', {}, insight.title),
      h('p', { class: 'person-insight-text' }, insight.text),
      insight.implication ? h('p', { class: 'person-insight-implication' }, insight.implication) : null,
      h('details', { class: 'person-insight-evidence' },
        h('summary', {}, 'На каких ответах основано'),
        h('ul', {}, ...insight.evidence.map(source))))),
    insights.length ? null : h('p', { class: 'hint person-analysis-empty' }, 'Пока недостаточно связанных ответов для личного разбора.'));
}

/** Uses only the supplied participant's answers and question metadata. */
export function personAnalysisSection(questions: Question[], profile: Profile): HTMLElement {
  return personAnalysisView(personAnalysis(questions, profile));
}
