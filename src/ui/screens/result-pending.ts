import type {Profile} from '../../types';
import type {FillOffer} from './result';
import {h} from '../dom';
import {plural} from '../plural';
import {shareBlock} from '../share';

/** Admission view: never presents a partial compatibility score or individual portrait. */
export function resultPendingScreen(a:Profile,b:Profile,fill:FillOffer[],url:string,personal:{name:string;url:string}[]=[]):HTMLElement {
  return h('section',{class:'screen result-pending'},
    h('h1',{},'Сначала завершите тест вдвоём'),
    h('p',{class:'poster-names'},`${a.name||'Первый'} × ${b.name||'Второй'}`),
    h('p',{},'Общий результат с совместимостью и описаниями обоих участников появится, когда оба ответят на все вопросы и выберут важные сферы. Если в вопросе есть вариант «не знаю», он тоже считается ответом.'),
    personal.length ? h('div',{class:'personal-results-ready'},
      h('p',{},'У завершивших тест уже доступен личный результат — ждать партнёра для этого не нужно.'),
      ...personal.map(person=>h('p',{},h('a',{href:person.url,class:'personal-result-link'},`Личный результат: ${person.name}`)))) : null,
    h('div',{class:'notes'},...fill.map(person=>h('div',{class:'note soft'},
      h('div',{class:'note-label'},person.name),
      h('p',{},[
        person.count?`Осталось ${plural(person.count,['вопрос','вопроса','вопросов'])}`:'Все вопросы заполнены',
        person.priorities?'нужно выбрать важные сферы':null,
      ].filter(Boolean).join('; ')+'.'),
      h('button',{type:'button',class:'primary','data-fill-person':person.name,onclick:()=>person.onFill()},`Продолжить тест: ${person.name}`)))),
    h('p',{class:'hint'},'Сохранённые ответы перенесены. Каждый участник дополняет свою анкету; заново проходить остальные вопросы не нужно.'),
    h('h3',{},'Передать ссылку участнику'),
    shareBlock(url,'Завершить тест совместимости'));
}
