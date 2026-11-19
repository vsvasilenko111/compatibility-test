import type { Profile, Question } from '../../types';
import { PRIORITY_SPHERES } from '../../questions/spheres';
import { h } from '../dom';
import { personSummaryCard } from '../person-summary-view';
import { personAnalysisSection } from '../person-analysis-view';
import { personalIndicesSection } from '../personal-indices-view';
import { shareBlock } from '../share';

/** The caller checks completion; this screen presents one person's answers without a comparison. */
export function personalResultScreen(profile: Profile, questions: Question[], inviteUrl: string, onPartnerHere: () => void): HTMLElement {
  const priorities = PRIORITY_SPHERES.filter(sphere => profile.priorities?.[sphere.id] === 'top');
  return h('section', { class: 'screen personal-result' },
    h('header', { class: 'personal-cover' },
      h('p', { class: 'eyebrow' }, 'По вашим ответам'),
      h('h1', {}, profile.name ? `Личный результат: ${profile.name}` : 'Личный результат'),
      h('p', { class: 'personal-cover-description' }, 'Предпочтения, диалог и контакт — в выбранных вами ситуациях.')),
    personalIndicesSection(questions, profile),
    personAnalysisSection(questions, profile),
    h('details', { class: 'personal-topic-answers person-summaries' },
      h('summary', {}, 'Ответы по темам'),
      personSummaryCard(questions, profile)),
    h('section', { class: 'personal-priorities' },
      h('h3', { class: 'eyebrow' }, 'Выбранные важные сферы'),
      h('ul', {}, ...priorities.map(sphere => h('li', {}, sphere.label)))),
    h('div', { class: 'block personal-invite' },
      h('h3', {}, 'Пригласить партнёра'),
      h('p', {}, 'Совместимость появится, когда вы оба полностью пройдёте тест. В общем результате будут видны ответы обоих участников и краткие описания по ним.'),
      h('p', { class: 'hint' }, 'Если партнёр уже прошёл тест сам, пусть откроет ссылку на эту анкету на том же устройстве — сохранённые ответы не придётся вводить заново.'),
      shareBlock(inviteUrl, 'Тест совместимости')),
    h('section', { class: 'personal-partner-here', 'aria-label': 'Партнёр рядом?' },
      h('h3', {}, 'Партнёр рядом?'),
      h('p', { class: 'hint' }, 'Он может пройти тест прямо здесь, на этом устройстве.'),
      h('button', { type: 'button', class: 'secondary', onclick: () => onPartnerHere() }, 'Пройти тест партнёру здесь')),
    h('p', { class: 'personal-home' }, h('a', { href: '#' }, 'На главную')));
}
