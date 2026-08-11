/**
 * TEPS Crew — Phase 3 Final app bootstrap
 */

import { initAppState, getState, setPage } from './js/state.js';
import { startRouter, getNavItems, navigate } from './js/router.js';
import { showToast } from './js/toast.js';
import { renderDashboard, bindDashboard } from './js/dashboard.js';
import { renderSettings, bindSettings } from './js/settings.js';
import {
  renderFoundation,
  bindFoundation,
  renderLesson,
  bindLesson,
  renderTeps,
  bindTeps,
  renderVocabulary,
  bindVocabulary,
  renderPractice,
  bindPractice,
  renderPracticeQuiz,
  bindPracticeQuiz,
  renderPracticeResult,
  bindPracticeResult,
  renderTargetPreview,
  bindTargetPreview,
  destroyPracticeEngine,
  renderMock,
  bindMock,
  renderMockGuide,
  bindMockGuide,
  renderMockExam,
  bindMockExam,
  renderMockResult,
  bindMockResult,
  renderDiagnosis,
  bindDiagnosis,
  renderReview,
  bindReview,
  renderMyTeps,
  bindMyTeps,
  renderNotFound,
  bindNotFound,
} from './js/pages.js';
import { renderGuide, bindGuide } from './js/guide.js';
import { getAiStatus } from './js/ai/ai-service.js';

let currentCleanup = null;

function renderNav(activePage) {
  const items = getNavItems();
  const side = document.getElementById('side-nav');
  const bottom = document.getElementById('bottom-nav');

  const primaryBottom = new Set(['home', 'foundation', 'practice', 'review', 'my-teps']);
  const practicePages = new Set(['practice', 'practice-quiz', 'practice-result', 'target-preview']);
  const mockPages = new Set(['mock', 'mock-guide', 'mock-exam', 'mock-result', 'diagnosis']);

  side.innerHTML = items
    .map((item) => {
      const active =
        activePage === item.id ||
        (item.id === 'foundation' && activePage === 'lesson') ||
        (item.id === 'teps' && activePage === 'vocabulary') ||
        (item.id === 'practice' && practicePages.has(activePage)) ||
        (item.id === 'mock' && mockPages.has(activePage));
      return `
      <a class="nav-link ${active ? 'is-active' : ''}" href="${item.href}" data-nav-id="${item.id}" ${
        active ? 'aria-current="page"' : ''
      }>
        <span class="nav-emoji" aria-hidden="true">${item.emoji || ''}</span>
        <span class="nav-label">${item.label}</span>
      </a>`;
    })
    .join('');

  const bottomItems = items.filter((i) => primaryBottom.has(i.id));
  bottom.innerHTML = bottomItems
    .map((item) => {
      const active =
        activePage === item.id ||
        (item.id === 'foundation' && activePage === 'lesson') ||
        (item.id === 'practice' && practicePages.has(activePage));
      return `
      <a class="bottom-link ${active ? 'is-active' : ''}" href="${item.href}" ${
        active ? 'aria-current="page"' : ''
      }>
        <span class="nav-emoji" aria-hidden="true">${item.emoji || ''}</span>
        <span>${item.label}</span>
      </a>`;
    })
    .join('');
}

function updateTopTarget() {
  const el = document.querySelector('.topbar-target');
  const target = getState().settings?.targetScore ?? 327;
  const ai = getAiStatus(getState().settings);
  if (el) el.textContent = `목표 ${target} · ${ai.label}`;
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.hidden = true;
}

function setupChrome() {
  const toggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');

  toggle?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const open = !sidebar.classList.contains('is-open');
    sidebar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
  });

  backdrop?.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('.side-nav, .bottom-nav').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link) closeMobileSidebar();
    });
  });
}

function renderPage(route) {
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch {
      /* ignore */
    }
    currentCleanup = null;
  }

  if (route.page !== 'practice-quiz') destroyPracticeEngine();

  const main = document.getElementById('main-content');
  setPage(route.page, route.params);
  renderNav(route.page);
  updateTopTarget();

  const map = {
    home: [renderDashboard, bindDashboard],
    guide: [renderGuide, bindGuide],
    foundation: [renderFoundation, bindFoundation],
    lesson: [() => renderLesson(route.params), bindLesson],
    teps: [() => renderTeps(route.params), bindTeps],
    vocabulary: [
      () => renderVocabulary(route.params),
      (root) => bindVocabulary(root, route.params),
    ],
    practice: [renderPractice, bindPractice],
    'practice-quiz': [() => renderPracticeQuiz(route.params), bindPracticeQuiz],
    'practice-result': [renderPracticeResult, bindPracticeResult],
    'target-preview': [renderTargetPreview, bindTargetPreview],
    mock: [renderMock, bindMock],
    'mock-guide': [
      () => renderMockGuide(route.params),
      (root) => bindMockGuide(root, route.params),
    ],
    'mock-exam': [() => renderMockExam(route.params), bindMockExam],
    'mock-result': [renderMockResult, bindMockResult],
    diagnosis: [renderDiagnosis, bindDiagnosis],
    review: [() => renderReview(route.params), bindReview],
    'my-teps': [renderMyTeps, bindMyTeps],
    settings: [renderSettings, bindSettings],
    'not-found': [renderNotFound, bindNotFound],
  };

  const pair = map[route.page] || map['not-found'];
  const [render, bind] = pair;

  try {
    main.innerHTML = render();
    bind?.(main);
    const quizRoot = main.querySelector('.quiz-page');
    if (quizRoot) {
      currentCleanup = () => {
        quizRoot._quizCleanup?.();
        quizRoot._quizKeyCleanup?.();
      };
    }
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error(err);
    main.innerHTML = `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">화면을 표시하는 중 문제가 발생했습니다.</p>
          <p class="muted">${String(err.message || err)}</p>
          <button type="button" class="btn btn-primary" id="go-home">홈으로</button>
        </div>
      </section>`;
    main.querySelector('#go-home')?.addEventListener('click', () => navigate('home'));
    showToast('화면 렌더링 중 오류가 발생했습니다.', 'error');
  }
}

async function boot() {
  const statusEl = document.getElementById('boot-status');
  const setBoot = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  setupChrome();
  setBoot('학습 데이터를 불러오는 중…');

  try {
    const initPromise = initAppState();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('초기화 시간이 초과되었습니다.')), 15000);
    });
    await Promise.race([initPromise, timeoutPromise]);
  } catch (err) {
    console.error(err);
    showToast(
      '일부 저장소를 초기화하지 못했습니다. 기본 기능은 계속 사용할 수 있습니다.',
      'warning'
    );
    if (!getState().content?.foundation) {
      document.getElementById('main-content').innerHTML = `
        <section class="page">
          <div class="empty-state card">
            <p class="empty-title">앱을 시작할 수 없습니다.</p>
            <p class="muted">같은 폴더의 index.html / app.bundle.js / style.css 가 함께 있는지 확인해 주세요.</p>
            <p class="muted">${String(err.message || err)}</p>
          </div>
        </section>`;
      return;
    }
  }

  startRouter(renderPage);
}

boot();
