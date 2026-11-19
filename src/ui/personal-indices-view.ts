import { MIN_PERSONAL_INDEX_SOURCES, personalIndices, type PersonalIndex } from '../scoring/personal-indices';
import type { Profile, Question } from '../types';
import { h } from './dom';

/** Answer indices describe these scenarios only; preference directions carry no verdict. */
export function personalIndicesView(indices: ReturnType<typeof personalIndices>): HTMLElement | null {
  // Guard the presentation as well as the model: small or duplicated source sets
  // must never turn back into numerical personal spheres.
  const eligible = (index: PersonalIndex): index is PersonalIndex & { score: number } => index.total >= MIN_PERSONAL_INDEX_SOURCES && index.answered >= MIN_PERSONAL_INDEX_SOURCES
    && index.score !== null && Number.isFinite(index.score)
    && new Set(index.evidence.map(item => item.questionId)).size >= MIN_PERSONAL_INDEX_SOURCES;
  const resources = indices.resources.filter(eligible);
  const preferences = indices.preferences.filter(eligible);
  if (!resources.length && !preferences.length) return null;
  const covered = new Map(resources.filter(index => index.answered === index.total).map(index => [index.key, index]));
  const strengths = indices.strengths.filter(key => covered.has(key));
  const attention = indices.attention.filter(key => covered.has(key));
  const rounded = (score: number) => String(Math.round(score));
  const card = (index: PersonalIndex & { score: number }) => h('article', {
    class: `personal-index-card${index.kind === 'resource' && attention.includes(index.key) ? ' personal-index-attention' : ''}`,
    'data-index': index.key, 'data-kind': index.kind,
  },
  h('div', { class: 'personal-index-heading' },
    h('h3', {}, index.title),
    h('p', { class: 'personal-index-value', 'aria-hidden': 'true' },
      rounded(index.score), h('span', {}, ' / 100'))),
  h('div', { class: 'personal-index-track', role: 'meter',
      'aria-label': index.title, 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-valuenow': String(index.score), 'aria-valuetext': `${rounded(index.score)} из 100`,
    }, h('span', { class: 'personal-index-fill', style: `width: ${index.score}%` })),
  h('div', { class: 'personal-index-poles' },
    h('span', {}, `0 · ${index.lowLabel}`), h('span', {}, `${index.highLabel} · 100`)),
  h('p', { class: 'personal-index-count' }, `Ситуаций: ${index.answered} из ${index.total}`),
  index.mixed ? h('p', { class: 'personal-index-mixed' }, 'Зависит от ситуации') : null,
  h('details', { class: 'personal-index-evidence' },
    h('summary', {}, 'Ответы, на которых основана шкала'),
    h('p', { class: 'personal-index-explanation' }, index.explanation),
    index.mixed ? h('p', { class: 'personal-index-mixed-explanation' }, 'В одних ситуациях вы выбираете один подход, в других — другой. Посмотрите ответы ниже: среднее число не передаёт этих различий.') : null,
    index.evidence.length ? h('ul', {}, ...index.evidence.map(item => h('li', { 'data-question-id': item.questionId },
      h('p', { class: 'personal-index-topic' }, item.topic),
      h('p', { class: 'personal-index-question' }, item.question),
      h('p', { class: 'personal-index-answer' }, `${item.option}. ${item.answer}`))))
      : h('p', {}, 'Для этой шкалы пока нет ответов, которые можно учесть.'),
    index.missingIds.length ? h('p', { class: 'personal-index-missing' }, `Не учтено ситуаций: ${index.missingIds.length}. Пропущенный ответ или недоступный вопрос не равен нулю.`) : null));

  const highlights = (keys: string[], title: string, kind: 'strength' | 'attention') => keys.length
    ? h('div', { class: 'personal-index-highlight', 'data-highlight': kind }, h('h3', {}, title),
      h('ul', {}, ...keys.map(key => {
        const index = covered.get(key)!;
        return h('li', {}, index.title);
      }))) : null;

  return h('section', { class: 'personal-indices', 'aria-label': 'Индексы по вашим ответам' },
    h('div', { class: 'personal-indices-intro' },
      h('h2', {}, 'Профиль по ответам')),
    resources.length ? h('section', { class: 'personal-index-group', 'data-index-group': 'resources', 'aria-label': 'Диалог и контакт' },
      h('h2', {}, 'Диалог и контакт'),
      h('p', { class: 'personal-index-group-note' }, 'Чем выше число, тем ближе выбранные ответы к прояснению ситуации, обсуждению трудностей и восстановлению разговора.'),
      h('div', { class: 'personal-index-grid' }, ...resources.map(card))) : null,
    strengths.length || attention.length ? h('aside', { class: 'personal-index-highlights', 'aria-label': 'Опоры и зоны внимания' },
      highlights(strengths, 'На что можно опереться', 'strength'),
      highlights(attention, 'Зоны внимания', 'attention')) : null,
    preferences.length ? h('section', { class: 'personal-index-group', 'data-index-group': 'preferences', 'aria-label': 'Предпочтения в отношениях' },
      h('h2', {}, 'Предпочтения в отношениях'),
      h('p', { class: 'personal-index-group-note' }, 'Ориентируйтесь на подписи у 0 и 100: они показывают, какой вариант вам ближе. Например, больше времени вдвоём или больше личного пространства. Число описывает ваши ответы, а не качество отношений.'),
      h('div', { class: 'personal-index-grid' }, ...preferences.map(card))) : null,
    h('details', { class: 'personal-index-method' },
      h('summary', {}, 'Как читать эти числа'),
      h('p', {}, 'Каждому варианту ответа соответствует значение от 0 до 100. Число над шкалой — среднее по вашим ответам; все учтённые вопросы имеют одинаковый вес. На экране оно округлено. Раскройте ответы под шкалой, чтобы увидеть, из чего оно получилось.'),
      h('p', {}, 'Шкала появляется, когда для расчёта есть ответы как минимум по семи разным ситуациям. Пропуски и ответы, которые нельзя однозначно учесть, в среднее не входят и не заменяются нулём.'),
      h('p', {}, 'Шкалы кратко описывают ответы на конкретные вопросы. Например, участие в жизни близких включает разные решения: встречи, помощь деньгами, совместное проживание. По одному числу нельзя судить о характере в целом. Некоторые вопросы входят сразу в две шкалы, поэтому общего балла из этих шкал нет.'),
      h('p', {}, 'В блок «На что можно опереться» попадают до двух полностью заполненных шкал диалога и контакта со значением от 75. В «Зонах внимания» — до двух со значением ниже 50. Шкалы предпочтений в этих списках не участвуют.'),
      h('p', {}, 'Это не стандартизированный психологический тест. Числа не показывают ваше место среди других людей и не оценивают зрелость, качество отношений или сексуальность. Для сравнения с партнёром есть отдельный результат совместимости.')));
}

export function personalIndicesSection(questions: Question[], profile: Profile): HTMLElement | null {
  return personalIndicesView(personalIndices(questions, profile));
}
