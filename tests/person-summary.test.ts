import { describe, expect, it } from 'vitest';
import bank from '../src/questions/bank.json';
import historicalBank35 from '../research/blind/target-v20/sphere-explorer-v1/baseline-bank-v35.json';
import { answerFor, OPTION_VALUES } from '../src/answer';
import type { Profile, Question } from '../src/types';
import { personSummary } from '../src/scoring/person-summary';

const questions = bank.questions as Question[];
const profile = (choices: Record<string, number>, name = 'Анна'): Profile => ({ name, bankVersion: 31,
  responses: Object.fromEntries(Object.entries(choices).map(([id, option]) => [id, answerFor(OPTION_VALUES[option - 1])])) });
const trait = (choices: Record<string, number>, key: string) => personSummary(questions, profile(choices)).traits.find(t => t.key === key)!;

describe('answer-grounded person portraits', () => {
  it('keeps historical money ownership separate from funding all ordinary personal and shared expenses', () => {
    const source = questions.find(q => q.sphere === 'budget')!;
    const ownership: Question = { ...source, id: 'budget-01-r34', text: 'Кому принадлежат деньги независимо от числа работающих?', options: ['Все деньги общие, даже если зарабатывает один', 'Почти все общие', 'Часть общая', 'Только на быт', 'Общего бюджета нет'] };
    const funding: Question & { answerKind: 'categorical' } = { ...source, id: 'budget-funding-model-r35', text: 'Кто оплачивает все обычные расходы, включая личные?', scored: false, answerKind: 'categorical', options: ['Всё оплачиваю я; партнёр может не зарабатывать', 'Всё оплачивает партнёр; я могу не зарабатывать', 'Оба участвуем по договорённости', 'Роли в оплате могут меняться'] };
    const result = personSummary([ownership, funding], profile({ 'budget-01-r34': 1, 'budget-funding-model-r35': 1 })).traits[0];
    expect(result.evidence.map(e => e.questionId)).toEqual([ownership.id, funding.id]);
    expect(result.text).toContain(ownership.options![0]);
    expect(result.text).toContain(funding.options![0]);
    expect(result.text).toMatch(/обычн.*личн/);
    expect(result.text).not.toMatch(/оба зарабатывают|доходы обоих|одинаков.*доход/);
    for (let n = 1; n <= 4; n++) {
      const option = personSummary([ownership, funding], profile({ 'budget-01-r34': 1, 'budget-funding-model-r35': n })).traits[0];
      expect(option.evidence[1]).toMatchObject({ questionId: funding.id, option: n, answer: funding.options![n - 1] });
      expect(option.text).toContain(funding.options![n - 1]);
    }
    expect(personSummary([funding], profile({ 'budget-08-funding-r34': 4 })).traits).toEqual([]);
    const fourth = profile({ 'budget-funding-model-r35': 1 });
    fourth.responses[funding.id] = answerFor(7);
    expect(personSummary([funding], fourth).traits[0].text).toContain('Роли в оплате могут меняться');
    expect(personSummary([ownership, funding], profile({ 'budget-01': 1, 'budget-08-r22': 1 })).traits).toEqual([]);
    const withHistorical = [ownership, funding, { ...ownership, id: 'budget-01' }, { ...funding, id: 'budget-08-r22' }];
    const both = personSummary(withHistorical, profile({ 'budget-01-r34': 1, 'budget-funding-model-r35': 1, 'budget-01': 5, 'budget-08-r22': 5 })).traits[0];
    expect(both.evidence.map(e => e.questionId)).toEqual([ownership.id, funding.id]);
    expect(both.evidence.map(e => e.option)).toEqual([1, 1]);
    const oldOnly = personSummary(withHistorical.slice(2, 3), profile({ 'budget-01': 5 })).traits[0];
    expect(oldOnly.evidence[0]).toMatchObject({ questionId: 'budget-01', option: 5, answer: 'Общего бюджета нет' });
  });
  it('quotes all current categorical arrangements, preserving optional second income and current precedence', () => {
    const arrangement = questions.find(q => q.id === 'budget-arrangement-r36')!;
    expect(arrangement).toBeDefined();
    const historical: Question = { ...arrangement, id: 'budget-01-r34', options: ['Old all shared', 'b', 'c', 'd', 'Old separate'] };
    for (let option = 1; option <= 5; option++) {
      const result = personSummary([...questions, historical], profile({ [arrangement.id]: option, [historical.id]: 5 })).traits[0];
      expect(result.evidence.map(e => e.questionId)).toEqual([arrangement.id]);
      expect(result.evidence[0].answer).toBe(arrangement.options![option - 1]);
      expect(result.text).toContain(arrangement.options![option - 1]);
      expect(result.text).not.toMatch(/Old|лучше|хуже|мужчина|женщина|не зарабатывает/);
    }
    expect(trait({ [arrangement.id]: 5 }, 'money').text).toContain('доход второго, если он есть, остаётся у него');
    expect(personSummary(questions, profile({ 'budget-01-r34': 5, 'budget-funding-model-r35': 1 })).traits).toEqual([]);
  });
  it('reads the frozen v35 ownership and funding sources only when explicitly supplied as history', () => {
    const ids = ['budget-01-r34', 'budget-funding-model-r35'];
    const history = (historicalBank35.questions as Question[]).filter(q => ids.includes(q.id));
    expect(history).toHaveLength(2);
    const p = profile({ [ids[0]]: 5, [ids[1]]: 2 });
    expect(personSummary(questions, p).traits).toEqual([]);
    const result = personSummary(history, p).traits[0];
    expect(result.evidence.map(e => e.questionId)).toEqual(ids);
    for (const source of result.evidence) {
      expect(source.answer).toBe(history.find(q => q.id === source.questionId)!.options![source.option - 1]);
      expect(result.text).toContain(source.answer);
    }
    expect(result.text).toContain('В прежнем вопросе');
  });
  it('reads historical funding only from supplied historical metadata in its equal-income basic-cost context', () => {
    const source = questions.find(q => q.sphere === 'budget')!;
    const old: Question = { ...source, id: 'budget-08-r22', text: 'При одинаковом доходе кто платит за базовые расходы?', options: ['Мужчина всё', 'Мужчина больше', 'Поровну', 'Женщина больше', 'Женщина всё'] };
    const result = personSummary([old], profile({ 'budget-08-r22': 1 })).traits[0];
    expect(result.evidence[0].questionId).toBe(old.id);
    expect(result.text).toContain('Мужчина всё');
    expect(result.text).toMatch(/одинаков.*доход/);
    expect(result.text).toMatch(/базов/);
    expect(result.text).not.toMatch(/личные расходы|все обычные/);
  });
  it('quotes the withdrawn gendered funding question only as supplied historical evidence', () => {
    const source = questions.find(q => q.sphere === 'budget')!;
    const old: Question = { ...source, id: 'budget-08-funding-r34', text: 'Прежний вопрос об оплате обычных расходов, включая личные', options: ['Мужчина оплачивает всё', 'Мужчина больше', 'Поровну', 'Женщина больше', 'Женщина оплачивает всё'] };
    const result = personSummary([old], profile({ [old.id]: 5 })).traits[0];
    expect(result.evidence[0]).toMatchObject({ questionId: old.id, option: 5, answer: 'Женщина оплачивает всё' });
    expect(result.text).toContain('В прежнем вопросе');
    expect(result.text).toContain('Женщина оплачивает всё');
  });
  it('uses only this person’s choices and exact supplied source metadata without mutation', () => {
    const own = profile({ 'loyalty-05': 4 }, '<Анна>');
    const before = JSON.stringify([questions, own]);
    const result = personSummary(questions, own);
    expect(result.name).toBe('<Анна>');
    expect(result.traits).toHaveLength(1);
    expect(result.traits[0]).toMatchObject({key:'support',status:'clear',evidence:[{
      questionId:'loyalty-05',topic:'советы или сочувствие',
      question:'Вы рассказываете партнёру о ссоре с начальником. Что вам нужно в первую очередь?',
      option:4,answer:'Скорее чтобы выслушали',
    }]});
    expect(result.traits[0].text).toContain('Скорее чтобы выслушали');
    expect(trait({'loyalty-05':1}, 'support').text).toContain('Совет, что делать');
    expect(JSON.stringify([questions, own])).toBe(before);
  });
  it('does not invent facts from absent, skipped, unrecognized or excluded personal-history answers', () => {
    const p = profile(Object.fromEntries(questions.filter(q=>q.block==='maturity').map(q=>[q.id,1])));
    p.responses['loyalty-05'] = 'skipped';
    p.responses['invented'] = answerFor(0);
    expect(personSummary(questions, p).traits).toEqual([]);
    expect(personSummary([], profile({'budget-09':1,'budget-09-r31':5})).traits).toEqual([]);
    const withoutOptions = questions.map(q=>q.id==='loyalty-05'?{...q, options:undefined}:q);
    expect(personSummary(withoutOptions,profile({'loyalty-05':1})).traits).toEqual([]);
  });
  it('keeps the unknown relationship goal neutral and preserves tentative child wording', () => {
    const result = trait({'relationship-goal-01':3, 'kids-02':2}, 'plans');
    expect(result.status).toBe('uncertain');
    expect(result.text).toContain('Пока не знаю, хочу ли отношений надолго');
    expect(result.text).toContain('Скорее не хочу');
    expect(result.text).not.toMatch(/не готов|избега|несерьёз|не хочет отношений/);
  });
  it.each([{kids:1,timing:2},{kids:4,timing:1}])('preserves opposing strong child choices as mixed: %j', ({kids,timing}) => {
    const result = trait({'relationship-goal-01':2,'kids-02':kids,'kids-timing-01-r22':timing},'plans');
    expect(result.status).toBe('mixed');
    expect(result.evidence.map(e=>e.questionId)).toEqual(['relationship-goal-01','kids-02','kids-timing-01-r22']);
    for (const evidence of result.evidence) expect(result.text).toContain(evidence.answer);
    expect(result.text).not.toMatch(/передума|на самом деле|потому что/);
    expect(result.text.match(/[.!?](?:\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });
  it('does not add judgments to proportional contributions or the purchase scenario', () => {
    const result = trait({'budget-arrangement-r36':3,'budget-09-r31':4},'money');
    expect(result.text).toContain('пропорционально своим доходам');
    expect(result.text).toContain('Возьму кредит с переплатой, если платёж небольшой');
    expect(result.text).not.toMatch(/каждый платит|за себя|щедр|бедн|богат|безответствен/);
  });
  it('uses old budget answers only with their exact metadata and never rephrases them as new scenarios', () => {
    const old: Question = {...questions.find(q=>q.id==='budget-09-r31')!,id:'budget-09',topic:'старый вопрос',text:'Старый контекст?',options:['Старый первый','Старый второй','Старый третий','Старый четвёртый','Старый пятый']};
    const p = profile({'budget-09':2,'budget-09-r31':5});
    expect(personSummary(questions,p).traits[0].evidence[0].questionId).toBe('budget-09-r31');
    const result = personSummary([old],p).traits[0];
    expect(result.evidence).toEqual([{questionId:'budget-09',topic:'старый вопрос',question:'Старый контекст?',option:2,answer:'Старый второй'}]);
    expect(result.text).toContain('Старый второй');
    expect(result.text).not.toMatch(/кредит|месячн|поездк/);
    expect(personSummary(questions,profile({'budget-09':2})).traits).toEqual([]);
  });
  it('keeps agreed pauses constructive and differing conflict actions contextual', () => {
    const pause = trait({'conflict-response-01':2,'conflict-repair-01':2},'discussion');
    expect(pause.status).toBe('clear');
    expect(pause.text).toContain('договорюсь, когда вернёмся к разговору');
    expect(pause.text).not.toMatch(/избега|незрел|не умеет/);
    const mixed = trait({'conflict-response-01':1,'conflict-repair-01':5},'discussion');
    expect(mixed.status).toBe('mixed');
    expect(mixed.text).toContain('Скажу, что меня задела фраза');
    expect(mixed.text).toContain('Продолжу упрекать партнёра или наказывать молчанием');
  });
  it('describes support needs, hypothetical phone choice and desired shared activities without personality claims', () => {
    const result = personSummary(questions,profile({'loyalty-05':5,'space-07':1,'life-08-r22':5}));
    expect(result.traits.map(t=>t.key)).toEqual(['support','boundaries','leisure']);
    expect(result.traits[0].text).toMatch(/нуж|нужно/);
    expect(result.traits[1].text).toMatch(/сценари/);
    expect(result.traits[2].text).toMatch(/хоч|увлечени/);
    expect(result.traits.map(t=>t.text).join(' ')).not.toMatch(/умеет слушать|поддерживает|следил|проверял|ревнив|интроверт|зависим/);
  });
  it('uses exact options for every current-bank choice and keeps six themes bounded', () => {
    const ids = ['relationship-goal-01','kids-02','kids-timing-01-r22','budget-arrangement-r36','budget-09-r31','conflict-response-01','conflict-repair-01','loyalty-05','space-07','life-08-r22'];
    for(let n=1;n<=5;n++) {
      const result = personSummary(questions,profile(Object.fromEntries(ids.map(id=>[id,n]))));
      expect(result.traits.map(t=>t.key)).toEqual(['plans','money','discussion','support','boundaries','leisure']);
      for(const t of result.traits) for(const e of t.evidence) expect(e.answer).toBe(questions.find(q=>q.id===e.questionId)!.options![n-1]);
    }
  });
});
