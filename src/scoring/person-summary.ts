import { optionIndex } from '../answer';
import type { Profile, Question } from '../types';

export type PersonTraitKey = 'plans' | 'money' | 'discussion' | 'support' | 'boundaries' | 'leisure';
export type PersonTraitStatus = 'clear' | 'mixed' | 'uncertain';
export interface PersonEvidence {
  questionId: string;
  topic: string;
  question: string;
  /** Selected option, numbered 1–5. */
  option: number;
  answer: string;
}
export interface PersonTrait {
  key: PersonTraitKey;
  title: string;
  text: string;
  status: PersonTraitStatus;
  evidence: PersonEvidence[];
}
export interface PersonSummary { name: string; traits: PersonTrait[] }

/** A bounded description of selected questionnaire answers, never a personality assessment. */
export function personSummary(questions: Question[], profile: Profile): PersonSummary {
  const metadata = new Map(questions.map(q => [q.id, q]));
  const selected = (id: string): PersonEvidence | undefined => {
    const q = metadata.get(id), response = profile.responses[id];
    if (!q || q.block === 'maturity' || !q.options || !response || response === 'skipped'
      || !Number.isFinite(response.value) || response.value < 0 || response.value > 10) return;
    const option = optionIndex(response.value) + 1;
    const answer = q.options[option - 1];
    if (!answer) return;
    return { questionId: id, topic: q.topic, question: q.text, option, answer };
  };
  const traits: PersonTrait[] = [];
  const add = (key: PersonTraitKey, title: string, sources: (PersonEvidence | undefined)[], text: string, mixed = false) => {
    const evidence = sources.filter((e): e is PersonEvidence => !!e);
    if (!evidence.length) return;
    const uncertain = evidence.some(e => metadata.get(e.questionId)?.uncertainOptions?.includes(e.option));
    traits.push({ key, title, text, status: mixed ? 'mixed' : uncertain ? 'uncertain' : 'clear', evidence });
  };
  const quote = (e: PersonEvidence | undefined, prefix: string) => e ? `${prefix}: «${e.answer}»` : '';
  const sentence = (parts: string[]) => parts.filter(Boolean).join('; ') + '.';

  const goal = selected('relationship-goal-01'), kids = selected('kids-02'), timing = selected('kids-timing-01-r22');
  // Opposing answers stay visible; no inferred explanation or forced reconciliation.
  const opposingKids = !!kids && !!timing && ((kids.option === 1 && timing.option > 1)
    || (kids.option >= 3 && timing.option === 1));
  const plans = [goal && sentence([quote(goal, 'Сейчас об отношениях')]),
    (kids || timing) && sentence([quote(kids, 'Об общих детях'), quote(timing, 'О сроках')])].filter(Boolean).join(' ');
  add('plans', 'Планы', [goal, kids, timing], plans, opposingKids);

  const arrangement = selected('budget-arrangement-r36');
  const budget = arrangement ? undefined : selected('budget-01-r34') ?? selected('budget-01');
  const funding = arrangement ? undefined : selected('budget-funding-model-r35') ?? selected('budget-08-funding-r34') ?? selected('budget-08-r22');
  const fundingPrefix = funding?.questionId === 'budget-08-r22'
    ? 'В прежнем вопросе об оплате базовых расходов при одинаковом доходе партнёров'
    : funding?.questionId === 'budget-08-funding-r34'
      ? 'В прежнем вопросе об оплате всех обычных расходов пары, включая личные расходы каждого'
      : 'В прежнем вопросе об оплате всех обычных расходов пары, включая личные расходы каждого';
  // Old and current IDs are separate contexts. An old response never supplies a new question.
  const spending = selected('budget-09-r31') ?? selected('budget-09');
  const spendingPrefix = spending?.questionId === 'budget-09'
    ? `В вопросе «${spending.topic}» выбран ответ` : 'В сценарии крупной покупки без свободных денег';
  const money = [arrangement && sentence([quote(arrangement, 'О распределении денег в паре')]),
    budget && sentence([quote(budget, 'В прежнем вопросе о бюджете пары')]),
    funding && sentence([quote(funding, fundingPrefix)]),
    spending && sentence([quote(spending, spendingPrefix)])].filter(Boolean).join(' ');
  add('money', 'Деньги', [arrangement, budget, funding, spending], money);

  const response = selected('conflict-response-01'), repair = selected('conflict-repair-01');
  const differingActions = !!response && !!repair && ((response.option <= 2 && repair.option >= 4)
    || (repair.option <= 2 && response.option >= 4));
  const discussion = [response && sentence([quote(response, 'В сценарии спора')]),
    repair && sentence([quote(repair, 'В сценарии после ссоры')])].filter(Boolean).join(' ');
  add('discussion', 'Обсуждение разногласий', [response, repair], discussion, differingActions);

  const support = selected('loyalty-05');
  add('support', 'Нужная поддержка', [support], support ? sentence([quote(support, 'После ссоры с начальником в первую очередь нужно')]) : '');
  const boundaries = selected('space-07');
  add('boundaries', 'Личные границы', [boundaries], boundaries ? sentence([quote(boundaries, 'В сценарии с телефоном партнёра выбран ответ')]) : '');
  const leisure = selected('life-08-r22');
  add('leisure', 'Общее увлечение', [leisure], leisure ? sentence([quote(leisure, 'Заниматься общим увлечением хочется')]) : '');

  return { name: profile.name, traits };
}
