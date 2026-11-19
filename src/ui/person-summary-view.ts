import { personSummary, type PersonEvidence } from '../scoring/person-summary';
import type { Profile, Question } from '../types';
import { h } from './dom';

/** Current question IDs have explicit option meanings; legacy answers stay literal. */
const compactChoices: Record<string, { label: string; options?: readonly string[] }> = {
  'relationship-goal-01': { label: '' },
  'kids-02': { label: 'Дети' },
  'kids-timing-01-r22': { label: 'Срок' },
  'budget-arrangement-r36': { label: 'Бюджет' },
  'budget-09-r31': { label: 'Крупная покупка', options: [
    'сначала накоплю', 'рассрочка без переплаты до 3 месяцев', 'рассрочка без переплаты на любой срок',
    'кредит с переплатой при небольшом платеже', 'кредит сразу, переплата не смущает',
  ] },
  'conflict-response-01': { label: 'В споре', options: [
    'скажу, что задело, и вернусь к сути', 'попрошу паузу и согласую время разговора',
    'буду спорить резче, без оскорблений', 'отвечу упрёком или обидной репликой', 'перейду на крик и оскорбления',
  ] },
  'conflict-repair-01': { label: 'После извинения', options: [
    'скажу об обиде и спокойно обсудим', 'попрошу время и согласую возвращение к разговору',
    'начну разговор после паузы', 'буду ждать нового шага партнёра', 'продолжу упрекать или наказывать молчанием',
  ] },
  'loyalty-05': { label: 'Нужна поддержка после ссоры с начальником' },
  'space-07': { label: 'Телефон партнёра', options: [
    'загляну и промолчу', 'загляну, потом признаюсь', 'попрошу показать переписку',
    'спрошу, с кем переписывается; смотреть не буду', 'не буду смотреть или спрашивать — это личное',
  ] },
  'life-08-r22': { label: '' },
};

function compactFact(source: PersonEvidence): string {
  const known = compactChoices[source.questionId];
  if (!known) return `В прежнем вопросе: «${source.answer}»`;
  const answer = known.options?.[source.option - 1] ?? source.answer;
  return known.label ? `${known.label}: ${answer}` : answer;
}

/** A description grounded only in this person's answers to the supplied questions. */
export function personSummaryCard(questions: Question[], profile: Profile, fallbackName = 'Вы'): HTMLElement {
  const summary = personSummary(questions, profile);
  const traits = summary.traits.filter(trait => trait.evidence.length > 0);
  const evidence = [...new Map(traits.flatMap(trait => trait.evidence).map(item => [item.questionId, item])).values()];
  return h('article', { class: 'person-summary-card' },
    h('h4', {}, `По ответам: ${summary.name || fallbackName}`),
    traits.length ? h('dl', { class: 'person-summary-traits' }, ...traits.map(trait =>
      h('div', { class: 'person-summary-trait', 'data-trait': trait.key, 'data-status': trait.status },
        h('dt', {}, trait.title),
        h('dd', {}, ...trait.evidence.map(source => h('span', { class: 'person-summary-fact' }, `${compactFact(source)}.`))))))
      : h('p', { class: 'hint person-summary-empty' }, 'Пока недостаточно ответов для краткого описания.'),
    evidence.length ? h('details', { class: 'person-summary-evidence' },
      h('summary', {}, 'На каких ответах основано'),
      h('ul', {}, ...evidence.map(item => h('li', { 'data-question-id': item.questionId },
        h('p', { class: 'person-summary-question' }, item.question),
        h('p', { class: 'person-summary-answer' }, `${item.option}. ${item.answer}`))))) : null);
}

/** Named descriptions use only the supplied questions and each person's own answers. */
export function personSummarySection(questions: Question[] | undefined, a: Profile, b: Profile, personalUrls?: [string, string]): HTMLElement | null {
  if (!questions?.length) return null;
  const card = (profile: Profile, fallbackName: string, url: string | undefined) => {
    const element = personSummaryCard(questions, profile, fallbackName);
    if (url) element.append(h('p', {}, h('a', { href: url }, 'Личный результат')));
    return element;
  };
  return h('details', { class: 'person-summaries' },
    h('summary', {}, 'Личные результаты'),
    h('div', { class: 'person-summary-grid' }, card(a, 'Первый', personalUrls?.[0]), card(b, 'Второй', personalUrls?.[1])));
}
