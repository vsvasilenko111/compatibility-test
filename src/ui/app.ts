import { CodecError, decode, encode } from '../codec/codec';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../questions';
import { relationshipWeight } from '../questions/spheres';
import { classifyInvite, inviteUrl, parseHash, resultHash, resultUrl, type Route } from '../router';
import { compare } from '../scoring/compare';
import { browserStorage, createStore, type Progress } from '../storage';
import { firstUnanswered, resumeFor } from './flow';
import { finishScreen } from './screens/finish';
import { introScreen } from './screens/intro';
import { messageScreen } from './screens/message';
import { questionScreen } from './screens/question';
import { resultScreen } from './screens/result';

/** Быстрый режим (`#q…` или `?quick`) — первые 5 вопросов для проверки подсчёта (в них есть оба блока). Кодируется всё как обычно. */
const QUICK_COUNT = 5;
const QUICK_BY_QUERY = new URLSearchParams(location.search).has('quick');

const PAST_LEAD = 'Следующие вопросы — о том, как прошлое влияет на настоящее. Отвечайте только на те, на которые хочется: любой можно пропустить, и партнёр не узнает, что вы что-то пропустили.';

/** Публичный адрес для ссылок-приглашений: на хостинге Artifact страница не видит свой адрес, поэтому он вшивается при сборке. */
const PUBLIC_BASE: string | undefined = import.meta.env.VITE_PUBLIC_URL;

function codecMessage(e: unknown): string {
  if (e instanceof CodecError && e.kind === 'corrupt') return 'Ссылка повреждена — попросите прислать её заново.';
  if (e instanceof CodecError) return 'Ссылка от более новой версии теста — обновите страницу.';
  return 'Что-то пошло не так. Попробуйте открыть ссылку ещё раз.';
}

export function startApp(root: HTMLElement): void {
  const store = createStore(browserStorage());
  const base = PUBLIC_BASE || location.href.split('#')[0];
  let quick = QUICK_BY_QUERY;
  let ASKED = QUESTIONS;
  let ASKED_IDS = CURRENT_IDS;

  const show = (node: Node) => {
    root.replaceChildren(node);
    window.scrollTo(0, 0);
  };

  function route(r: Route) {
    quick = r.quick || QUICK_BY_QUERY;
    ASKED = quick ? QUESTIONS.slice(0, QUICK_COUNT) : QUESTIONS;
    ASKED_IDS = ASKED.map((q) => q.id);
    if (r.kind === 'result') return showResult(r.a, r.b);
    if (r.kind === 'invite') return showInvite(r.a);
    return showIntro(null);
  }

  function showInvite(code: string) {
    if (classifyInvite(code, store.loadOwnCode()) === 'own') {
      return show(messageScreen('Это ваша ссылка', 'Отправьте её партнёру — он пройдёт тест и увидит результат.', inviteUrl(base, code, quick)));
    }
    const done = store.loadResultFor(code);
    if (done) {
      return show(messageScreen('Вы уже прошли тест по этой ссылке', 'Можно открыть результат или пройти тест заново.', null, [
        { label: 'Посмотреть результат', primary: true, onClick: () => { location.hash = resultHash(code, done, quick); } },
        { label: 'Пройти заново', onClick: () => introFor(code) },
      ]));
    }
    // Оба прошли тест по общей ссылке: открывший чужое приглашение уже имеет свои ответы — проходить заново не нужно.
    const own = store.loadOwnCode();
    if (own) {
      return show(messageScreen('Вы уже прошли тест', 'Можно сразу посмотреть общий результат с вашими ответами или пройти тест заново.', null, [
        { label: 'Посмотреть результат', primary: true, onClick: () => { store.saveResultFor(code, own); location.hash = resultHash(code, own, quick); } },
        { label: 'Пройти заново', onClick: () => introFor(code) },
      ]));
    }
    introFor(code);
  }

  function introFor(code: string) {
    try {
      const inviter = decode(code, MANIFEST);
      showIntro({ code, name: inviter.name });
    } catch (e) {
      show(messageScreen('Не получилось открыть ссылку', codecMessage(e)));
    }
  }

  function showIntro(inviter: { code: string; name: string } | null) {
    const inviterCode = inviter?.code ?? null;
    const saved = store.loadProgress();
    const resumable = resumeFor(saved, inviterCode, ASKED_IDS);
    const own = store.loadOwnCode();
    show(introScreen({
      inviterName: inviter ? inviter.name : null,
      total: ASKED.length,
      resumeAt: resumable ? Math.min(resumable.index, ASKED.length - 1) + 1 : null,
      storageAvailable: store.available,
      ownUrl: own ? inviteUrl(base, own, quick) : null,
      onStart: (name) => runTest({ name, index: 0, responses: {}, inviterCode }),
      onResume: () => { if (resumable) runTest(resumable); },
    }));
  }

  function runTest(p: Progress): void {
    store.saveProgress(p);
    if (p.index >= ASKED.length) {
      const gap = firstUnanswered(ASKED_IDS, p.responses);
      return gap < ASKED.length ? runTest({ ...p, index: gap }) : finish(p);
    }
    const q = ASKED[p.index];
    show(questionScreen({
      question: q,
      index: p.index,
      total: ASKED.length,
      response: p.responses[q.id],
      lead: q.sphere === 'past' && ASKED[p.index - 1]?.sphere !== 'past' ? PAST_LEAD : undefined,
      onBack: p.index > 0 ? () => runTest({ ...p, index: p.index - 1 }) : null,
      onSubmit: (r) => runTest({ ...p, index: p.index + 1, responses: { ...p.responses, [q.id]: r } }),
    }));
  }

  function finish(p: Progress) {
    const code = encode({ name: p.name, bankVersion: BANK_VERSION, responses: p.responses }, CURRENT_IDS);
    store.clearProgress();
    if (p.inviterCode) {
      store.saveResultFor(p.inviterCode, code);
      location.hash = resultHash(p.inviterCode, code, quick); // hashchange откроет результат
      return;
    }
    store.saveOwnCode(code);
    show(finishScreen(inviteUrl(base, code, quick)));
  }

  function showResult(a: string, b: string) {
    try {
      const pa = decode(a, MANIFEST);
      const pb = decode(b, MANIFEST);
      show(resultScreen(pa, pb, compare(QUESTIONS, pa, pb, relationshipWeight), resultUrl(base, a, b, quick)));
    } catch (e) {
      show(messageScreen('Не получилось открыть результат', codecMessage(e)));
    }
  }

  window.addEventListener('hashchange', () => route(parseHash(location.hash)));
  route(parseHash(location.hash));
}
