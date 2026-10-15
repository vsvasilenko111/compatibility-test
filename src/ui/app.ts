import { CodecError, decode, encode } from '../codec/codec';
import { BANK_VERSION, CURRENT_IDS, MANIFEST, QUESTIONS } from '../questions';
import { classifyInvite, inviteUrl, parseHash, resultUrl, type Route } from '../router';
import { compare } from '../scoring/compare';
import { browserStorage, createStore, type Progress } from '../storage';
import { criticalCount } from './answer-logic';
import { resumeFor } from './flow';
import { finishScreen } from './screens/finish';
import { introScreen } from './screens/intro';
import { messageScreen } from './screens/message';
import { questionScreen } from './screens/question';
import { resultScreen } from './screens/result';

function codecMessage(e: unknown): string {
  if (e instanceof CodecError && e.kind === 'corrupt') return 'Ссылка повреждена — попросите прислать её заново.';
  if (e instanceof CodecError) return 'Ссылка от более новой версии теста — обновите страницу.';
  return 'Что-то пошло не так. Попробуйте открыть ссылку ещё раз.';
}

export function startApp(root: HTMLElement): void {
  const store = createStore(browserStorage());
  const base = location.href.split('#')[0];

  const show = (node: Node) => {
    root.replaceChildren(node);
    window.scrollTo(0, 0);
  };

  function route(r: Route) {
    if (r.kind === 'result') return showResult(r.a, r.b);
    if (r.kind === 'invite') return showInvite(r.a);
    return showIntro(null);
  }

  function showInvite(code: string) {
    if (classifyInvite(code, store.loadOwnCode()) === 'own') {
      return show(messageScreen('Это ваша ссылка', 'Отправьте её партнёру — он пройдёт тест и увидит результат.', inviteUrl(base, code)));
    }
    const done = store.loadResultFor(code);
    if (done) {
      return show(messageScreen('Вы уже прошли тест по этой ссылке', 'Можно открыть результат или пройти тест заново.', null, [
        { label: 'Посмотреть результат', primary: true, onClick: () => { location.hash = `a=${code}&b=${done}`; } },
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
    const resumable = resumeFor(saved, inviterCode, QUESTIONS.length);
    const own = store.loadOwnCode();
    show(introScreen({
      inviterName: inviter ? inviter.name : null,
      total: QUESTIONS.length,
      resumeAt: resumable ? Math.min(resumable.index, QUESTIONS.length - 1) + 1 : null,
      storageAvailable: store.available,
      ownUrl: own ? inviteUrl(base, own) : null,
      onStart: (name) => runTest({ name, index: 0, responses: {}, inviterCode }),
      onResume: () => { if (resumable) runTest(resumable); },
    }));
  }

  function runTest(p: Progress) {
    store.saveProgress(p);
    if (p.index >= QUESTIONS.length) return finish(p);
    const q = QUESTIONS[p.index];
    show(questionScreen({
      question: q,
      index: p.index,
      total: QUESTIONS.length,
      response: p.responses[q.id],
      criticalUsed: criticalCount(p.responses, q.id),
      onBack: p.index > 0 ? () => runTest({ ...p, index: p.index - 1 }) : null,
      onSubmit: (r) => runTest({ ...p, index: p.index + 1, responses: { ...p.responses, [q.id]: r } }),
    }));
  }

  function finish(p: Progress) {
    const code = encode({ name: p.name, bankVersion: BANK_VERSION, responses: p.responses }, CURRENT_IDS);
    store.clearProgress();
    if (p.inviterCode) {
      store.saveResultFor(p.inviterCode, code);
      location.hash = `a=${p.inviterCode}&b=${code}`; // hashchange откроет результат
      return;
    }
    store.saveOwnCode(code);
    show(finishScreen(inviteUrl(base, code)));
  }

  function showResult(a: string, b: string) {
    try {
      const pa = decode(a, MANIFEST);
      const pb = decode(b, MANIFEST);
      show(resultScreen(pa, pb, compare(QUESTIONS, pa, pb), resultUrl(base, a, b)));
    } catch (e) {
      show(messageScreen('Не получилось открыть результат', codecMessage(e)));
    }
  }

  window.addEventListener('hashchange', () => route(parseHash(location.hash)));
  route(parseHash(location.hash));
}
