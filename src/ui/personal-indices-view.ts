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
    index.mixed ? h('p', { class: 'personal-index-mixed-explanation' }, 'В разных ситуациях выбраны разные подходы. Среднее не показывает всю картину — ниже приведены выбранные ответы.') : null,
    index.evidence.length ? h('ul', {}, ...index.evidence.map(item => h('li', { 'data-question-id': item.questionId },
      h('p', { class: 'personal-index-topic' }, item.topic),
      h('p', { class: 'personal-index-question' }, item.question),
      h('p', { class: 'personal-index-answer' }, `${item.option}. ${item.answer}`))))
      : h('p', {}, 'Нет учтённых ответов для этого индекса.'),
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
      h('p', { class: 'personal-index-group-note' }, 'Выше — больше прояснения и возвращения к разговору в выбранных ситуациях.'),
      h('div', { class: 'personal-index-grid' }, ...resources.map(card))) : null,
    strengths.length || attention.length ? h('aside', { class: 'personal-index-highlights', 'aria-label': 'Опоры и зоны внимания' },
      highlights(strengths, 'На что можно опереться', 'strength'),
      highlights(attention, 'Зоны внимания', 'attention')) : null,
    preferences.length ? h('section', { class: 'personal-index-group', 'data-index-group': 'preferences', 'aria-label': 'Предпочтения в отношениях' },
      h('h2', {}, 'Предпочтения в отношениях'),
      h('p', { class: 'personal-index-group-note' }, 'Предпочтения на разных полюсах не лучше и не хуже друг друга.'),
      h('div', { class: 'personal-index-grid' }, ...preferences.map(card))) : null,
    h('details', { class: 'personal-index-method' },
      h('summary', {}, 'Как читать и как рассчитаны шкалы'),
      h('p', {}, 'Вариантам ответов заранее назначены значения от 0 до 100. Индекс — их среднее с одинаковым весом для каждой ситуации; число на экране округлено. Выбранные ответы можно раскрыть под шкалой.'),
      h('p', {}, 'Числовая сфера появляется только при наличии хотя бы семи разных учтённых ситуаций в одной области. Пропуски, неизвестные ответы и недоступные вопросы исключаются из среднего.'),
      h('p', {}, 'Это предварительные сводные показатели выбранных ситуаций. Участие в жизни близких объединяет разные формы участия, а не измеряет единую черту личности. Некоторые вопросы входят в несколько индексов: общего балла из этих шкал нет.'),
      h('p', {}, 'В опоры попадают до двух полностью заполненных ресурсных сфер от 75, в зоны внимания — до двух ниже 50. Предпочтения в эти списки не входят.'),
      h('p', {}, 'Это не стандартизированный психологический тест и не сравнение с другими людьми. Шкалы не измеряют общую зрелость, качество отношений или сексуальность. Совместимость с партнёром рассчитывается отдельно.')));
}

export function personalIndicesSection(questions: Question[], profile: Profile): HTMLElement | null {
  return personalIndicesView(personalIndices(questions, profile));
}
