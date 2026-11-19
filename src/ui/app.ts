import { CodecError, decode, encode } from '../codec/codec';
import { BANK_VERSION, CURRENT_FIRM, CURRENT_IDS, FIRM, MANIFEST, COMPATIBLE_SINCE, QUESTIONS } from '../questions';
import { friendshipWeight, relationshipWeight } from '../questions/spheres';
import { classifyInvite, inviteUrl, personalHash, personalUrl, parseHash, resultHash, resultUrl, type Route } from '../router';
import { currentShareCode } from './share-profile';
import { compare } from '../scoring/compare';
import { browserStorage, createStore, type Progress } from '../storage';
import { firstUnanswered, unansweredIds, resumeFor } from './flow';
import { personalResultScreen } from './screens/personal-result';
import { introScreen } from './screens/intro';
import { messageScreen } from './screens/message';
import { prioritiesScreen } from './screens/priorities';
import { questionScreen } from './screens/question';
import { resultScreen } from './screens/result';
import { resultPendingScreen } from './screens/result-pending';

/** Быстрый режим — первые 5 вопросов для проверки анкеты. Общий результат требует полного прохождения обоими. */
const QUICK_COUNT = 5;
const QUICK_BY_QUERY = new URLSearchParams(location.search).has('quick');

const PAST_LEAD = 'Следующие вопросы — о том, как прошлое влияет на настоящее. Партнёр увидит ваши ответы.';

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
    if (r.kind === 'result') return showResult(r.a, r.b, r.open ?? []);
    if (r.kind === 'personal') return showPersonal(r.a);
    if (r.kind === 'invite') return showInvite(r.a);
    return showIntro(null);
  }

  function showInvite(code: string) {
    const storedOwn=store.loadOwnCode();
    const shareOwn=storedOwn?currentShareCode(storedOwn):null;
    const shared=currentShareCode(code);
    if (classifyInvite(code, storedOwn) === 'own' || shared!==null && shared===shareOwn) {
      if(!shareOwn)return showPersonal(code);
      return show(messageScreen('Это ваша ссылка', 'Отправьте её партнёру — он пройдёт тест и увидит результат. Если партнёр рядом, он может пройти тест прямо здесь.', inviteUrl(base, shareOwn, quick), [
        { label: 'Пройти тест партнёру здесь', onClick: () => introFor(shareOwn) },
        { label: 'На главную', onClick: () => { location.hash = ''; } },
      ]));
    }
    const done = store.loadResultFor(code);
    if (done) {
      return show(messageScreen('Вы уже прошли тест по этой ссылке', 'Можно открыть результат или пройти тест заново.', null, [
        { label: 'Посмотреть результат', primary: true, onClick: () => { location.hash = resultHash(code, done, quick); } },
        { label: 'Пройти заново', onClick: () => introFor(code) },
      ]));
    }
    // Оба прошли тест по общей ссылке: открывший чужое приглашение уже имеет свои ответы — проходить заново не нужно.
    const own = shareOwn;
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
      const inviter = decode(code, MANIFEST, FIRM);
      showIntro({ code, name: inviter.name });
    } catch (e) {
      show(messageScreen('Не получилось открыть ссылку', codecMessage(e)));
    }
  }

  function showIntro(inviter: { code: string; name: string } | null) {
    const inviterCode = inviter?.code ?? null;
    const stored = store.loadProgress();
    const saved = stored && (stored.bankVersion ?? 0) >= COMPATIBLE_SINCE ? stored : null;
    // Дозаполнение продолжается с тем же партнёром, с какой бы страницы его ни открыли.
    const resumable = saved?.only ? { ...saved, index: firstUnanswered(saved.only, saved.responses) } : resumeFor(saved, inviterCode, ASKED_IDS);
    const resumeList = resumable?.only ?? ASKED_IDS;
    const own = store.loadOwnCode();
    const shareOwn=own?currentShareCode(own):null;
    show(introScreen({
      inviterName: inviter ? inviter.name : null,
      total: ASKED.length,
      // Дозаполнение только важных сфер — вопросов нет, продолжать «с вопроса» нечего: продолжаем с первого шага.
      resumeAt: resumable ? Math.max(1, Math.min(resumable.index, resumeList.length - 1) + 1) : null,
      storageAvailable: store.available,
      ownUrl: shareOwn ? inviteUrl(base, shareOwn, quick) : null,
      ownResultUrl: own ? personalUrl(base, own, quick) : null,
      history: store.loadHistory().map((r) => ({ names: r.names, at: r.at, url: `#${resultHash(r.a, r.b, quick)}`, forget: () => store.forgetResult(r.a, r.b) })),
      onStart: (name) => runTest({ name, index: 0, responses: {}, inviterCode }),
      onResume: () => { if (resumable) runTest(resumable); },
    }));
  }

  function runTest(p: Progress): void {
    store.saveProgress({ ...p, bankVersion: BANK_VERSION });
    const list = p.only ? QUESTIONS.filter((q) => p.only!.includes(q.id)) : ASKED;
    if (p.index >= list.length) {
      const gap = firstUnanswered(list.map((q) => q.id), p.responses);
      if (gap < list.length) return runTest({ ...p, index: gap });
      return p.priorities ? finish(p) : choosePriorities(p, list.length);
    }
    const q = list[p.index];
    show(questionScreen({
      question: q,
      index: p.index,
      total: list.length,
      response: p.responses[q.id],
      lead: q.sphere === 'past' && list[p.index - 1]?.sphere !== 'past' ? PAST_LEAD : undefined,
      onBack: p.index > 0 ? () => runTest({ ...p, index: p.index - 1 }) : null,
      onSubmit: (r) => runTest({ ...p, index: p.index + 1, responses: { ...p.responses, [q.id]: r } }),
    }));
  }

  /** После вопросов — выбор важных сфер; «Назад» возвращает к последнему вопросу. */
  function choosePriorities(p: Progress, count: number) {
    show(prioritiesScreen({
      questions: QUESTIONS,
      onBack: count > 0 ? () => runTest({ ...p, index: count - 1 }) : null,
      onDone: (priorities) => finish({ ...p, priorities }),
    }));
  }

  function finish(p: Progress) {
    const code = encode({ name: p.name, bankVersion: BANK_VERSION, responses: p.responses, priorities: p.priorities }, CURRENT_IDS, CURRENT_FIRM);
    store.clearProgress();
    // Дозаполнил или перепрошёл свою старую ссылку — новая ссылка заменяет прежнюю «вашу ссылку».
    if (p.ownCode !== undefined && p.ownCode === store.loadOwnCode()) store.saveOwnCode(code);
    if (p.inviterCode) {
      // New device: retain this participant's own result. Shared device: keep its existing owner.
      if (!store.loadOwnCode()) store.saveOwnCode(code);
      store.saveResultFor(p.inviterCode, code);
      location.hash = p.selfFirst ? resultHash(code, p.inviterCode, quick) : resultHash(p.inviterCode, code, quick); // hashchange откроет результат
      return;
    }
    if (!p.ownCode || !store.loadOwnCode() || p.ownCode === store.loadOwnCode()) store.saveOwnCode(code);
    const target = personalHash(code, quick);
    if (location.hash === '#' + target) return showPersonal(code);
    location.hash = target;
  }

  function showPersonal(code: string) {
    try {
      const profile = decode(code, MANIFEST, FIRM);
      if (profile.bankVersion < COMPATIBLE_SINCE) {
        return show(messageScreen('Тест обновился', 'Для личного результата нужно пройти текущую версию: смысл старых вопросов изменился.', null, [{
          label: 'Пройти обновлённый тест', primary: true,
          onClick: () => runTest({name:profile.name,index:0,responses:{},inviterCode:null,ownCode:code}),
        }]));
      }
      const only = unansweredIds(CURRENT_IDS, profile.responses);
      if (only.length || !profile.priorities) {
        return show(messageScreen('Завершите свой тест', 'Личный результат доступен без партнёра. Сохранённые ответы перенесены — осталось заполнить новые вопросы или выбрать важные сферы.', null, [{
          label: 'Продолжить мой тест', primary: true,
          onClick: () => runTest({name:profile.name,index:0,responses:profile.responses,priorities:profile.priorities,inviterCode:null,only,ownCode:code}),
        }]));
      }
      const shareCode=currentShareCode(code)!;
      show(personalResultScreen(profile, QUESTIONS, inviteUrl(base, shareCode, quick), () => introFor(shareCode)));
    } catch (e) {
      show(messageScreen('Не получилось открыть личный результат', codecMessage(e)));
    }
  }

  function showResult(a: string, b: string, open: string[]) {
    try {
      const pa = decode(a, MANIFEST, FIRM);
      const pb = decode(b, MANIFEST, FIRM);
      // Ответы друг друга видны сразу: согласие на раскрытие считается данным. Метки согласия в старых ссылках просто сохраняются.
      // Кто проходил прежнюю версию теста с другим смыслом вопросов — проходит обновлённый заново: такие ответы не сравнить.
      const outdated = ([[pa, a, b], [pb, b, a]] as const).filter(([p]) => p.bankVersion < COMPATIBLE_SINCE);
      if (outdated.length) {
        return show(messageScreen('Тест обновился', 'Вопросы и варианты ответа изменились, поэтому прежние ответы с новыми честно не сравнить. Пройдите тест заново — это займёт столько же времени.', null, [
          ...outdated.map(([p, own, other]) => ({
            label: `${p.name || (p === pa ? 'Первый' : 'Второй')}: пройти обновлённый тест`,
            primary: true,
            onClick: () => runTest({ name: p.name, index: 0, responses: {}, inviterCode: other, ownCode: own, selfFirst: p === pa }),
          })),
          { label: 'На главную', onClick: () => { location.hash = ''; } },
        ]));
      }
      store.rememberResult({ a, b, names: `${pa.name || 'Первый'} × ${pb.name || 'Второй'}`, at: Date.now() });
      // Ссылка от прежней версии теста: можно ответить только на новые вопросы — остальные ответы переносятся.
      // Ссылка до выбора важных сфер — их тоже можно выбрать, не отвечая заново.
      const fill = ([[pa, a, b], [pb, b, a]] as const).flatMap(([p, own, other]) => {
        const only = unansweredIds(CURRENT_IDS, p.responses);
        return only.length || !p.priorities ? [{
          name: p.name || (p === pa ? 'Первый' : 'Второй'),
          count: only.length,
          priorities: !p.priorities,
          onFill: () => runTest({ name: p.name, index: 0, responses: p.responses, inviterCode: other, only, ownCode: own, selfFirst: p === pa, priorities: p.priorities }),
        }] : [];
      });
      if (fill.length) {
        const personal = ([[pa,a],[pb,b]] as const)
          .filter(([p]) => !unansweredIds(CURRENT_IDS,p.responses).length && p.priorities)
          .map(([p,code]) => ({name:p.name || (p===pa?'Первый':'Второй'),url:personalUrl(base,code,quick)}));
        return show(resultPendingScreen(pa, pb, fill, resultUrl(base, a, b, quick, open), personal));
      }
      const shareA=currentShareCode(a)!,shareB=currentShareCode(b)!;
      show(resultScreen(pa, pb, compare(QUESTIONS, pa, pb, relationshipWeight, friendshipWeight), resultUrl(base, shareA, shareB, quick, open), QUESTIONS, fill, [personalUrl(base,shareA,quick),personalUrl(base,shareB,quick)]));
    } catch (e) {
      show(messageScreen('Не получилось открыть результат', codecMessage(e)));
    }
  }

  window.addEventListener('hashchange', () => route(parseHash(location.hash)));
  route(parseHash(location.hash));
}
