// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { answerFor } from '../src/answer';
import { BANK_VERSION, QUESTIONS } from '../src/questions';
import { personAnalysis } from '../src/scoring/person-analysis';
import type { Profile } from '../src/types';
import { personAnalysisSection, personAnalysisView } from '../src/ui/person-analysis-view';
import { personalResultScreen } from '../src/ui/screens/personal-result';

const profile = (name = 'Аня', value = 0): Profile => ({
  name, bankVersion: BANK_VERSION,
  responses: Object.fromEntries(QUESTIONS.map(q => [q.id, answerFor(value)])),
});

describe('deep personal analysis view', () => {
  it('presents supported findings before collapsed topic answers and preserves solo controls', () => {
    const p = profile();
    const root = personalResultScreen(p, QUESTIONS, '#i.own', () => {});
    const analysis = root.querySelector('.person-analysis')!;
    expect(root.firstElementChild?.tagName).toBe('HEADER');
    expect(root.firstElementChild?.querySelector('h1')?.textContent).toBe(`Личный результат: ${p.name}`);
    expect(root.children[1]).toBe(root.querySelector('.personal-indices'));
    expect(root.children[2]).toBe(analysis);
    const count = personAnalysis(QUESTIONS, p).insights.length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
    expect(analysis.querySelectorAll('.person-insight')).toHaveLength(count);
    const facts = root.querySelector<HTMLDetailsElement>('.personal-topic-answers')!;
    expect(facts.open).toBe(false);
    expect(facts.querySelector('summary')?.textContent).toBe('Ответы по темам');
    expect(analysis.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelectorAll('.person-summary-card')).toHaveLength(1);
    expect(root.querySelector('.score, .poster')).toBeNull();
    expect(root.textContent).not.toContain('Анкета полностью заполнена');
    expect(root.textContent).not.toContain('ждать второго участника');
    expect(root.querySelector('.share')).not.toBeNull();
  });

  it('keeps each finding grounded in its own exact answers inside closed evidence', () => {
    for (const p of [profile('Аня'), profile('Борис', 10)]) {
      const data = personAnalysis(QUESTIONS, p);
      const root = personAnalysisSection(QUESTIONS, p);
      const findings = [...root.querySelectorAll('.person-insight')];
      expect(findings.length).toBeGreaterThan(0);
      for (const [index, finding] of findings.entries()) {
        expect(finding.querySelector('h2')?.textContent).toBe(data.insights[index].title);
        expect(finding.querySelector('.person-insight-text')?.textContent).toBe(data.insights[index].text);
        const evidence = finding.querySelector<HTMLDetailsElement>('details')!;
        expect(evidence.open).toBe(false);
        expect(new Set([...evidence.querySelectorAll('li')].map(item => item.getAttribute('data-question-id'))).size).toBeGreaterThanOrEqual(2);
        for (const item of data.insights[index].evidence) {
          const row = evidence.querySelector(`[data-question-id="${item.questionId}"]`)!;
          expect(row.querySelector('.person-insight-question')?.textContent).toBe(item.question);
          expect(row.querySelector('.person-insight-answer')?.textContent).toBe(`${item.option}. ${item.answer}`);
        }
      }
    }
  });

  it('renders untrusted names and source text safely', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const qs = QUESTIONS.map(q => ({ ...q, text: unsafe, options: q.options?.map(() => unsafe) }));
    const root = personalResultScreen(profile(unsafe), qs, '#i.own', () => {});
    expect(root.querySelector('h1')?.textContent).toContain(unsafe);
    expect(root.querySelector('.person-insight-question')?.textContent).toBe(unsafe);
    expect(root.querySelector('.person-insight-answer')?.textContent).toContain(unsafe);
    expect(root.querySelector('img, script')).toBeNull();
    const data = personAnalysis(QUESTIONS, profile());
    const injected = personAnalysisView({ ...data, insights: data.insights.map(item => ({
      ...item, title: unsafe, text: unsafe, implication: unsafe,
    })) });
    expect(injected.querySelector('h2')?.textContent).toBe(unsafe);
    expect(injected.querySelector('.person-insight-text')?.textContent).toBe(unsafe);
    expect(injected.querySelector('.person-insight-implication')?.textContent).toBe(unsafe);
    expect(injected.querySelector('img, script')).toBeNull();
  });

  it('omits unsupported findings without inventing a portrait or using completion filler', () => {
    const empty = personAnalysisSection(QUESTIONS, { ...profile(), responses: {} });
    expect(empty.querySelector('.person-insight, details')).toBeNull();
    expect(empty.textContent).toMatch(/недостаточно.*ответов/i);
    const data = personAnalysis(QUESTIONS, profile());
    expect(data.insights.length).toBeGreaterThan(0);
    const first = data.insights[0];
    const malformed = { ...data, insights: [{ ...first, evidence: [first.evidence[0], first.evidence[0]] }] };
    expect(personAnalysisView(malformed).querySelector('.person-insight')).toBeNull();
  });
});
