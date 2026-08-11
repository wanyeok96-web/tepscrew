/**
 * Mini TEPS / Full TEPS mock engine (Phase 2)
 */

import {
  getState,
  buildMiniQuestions,
  getFullTePSStatus,
  getQuestionPool,
  saveMockResult,
  setLastSessionResult,
  getLastSessionResult,
  persistSessionSummary,
  persistQuestionAttempt,
  estimateTepsScore,
  updateProfile,
} from './state.js';
import {
  createSession,
  startQuestionTimer,
  getCurrentQuestion,
  setSelectedAnswer,
  unansweredCount,
  getPassageText,
  choiceLetter,
  saveMockSessionSnapshot,
  loadMockSessionSnapshot,
  clearMockSessionSnapshot,
  buildAttemptList,
} from './session.js';
import { TEPS_CONFIG, PRACTICE_MODES } from './config.js';
import { computeGapPriorities, summarizeAttempts } from './scoring.js';
import { buildBalancedSet } from './recommendation.js';
import { escapeHtml, formatTimer, uid } from './utils.js';
import { navigate } from './router.js';
import { showToast } from './toast.js';

let mockSession = null;
let mockCleanup = null;

export function renderMock() {
  const full = getFullTePSStatus();
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Assessment</p>
          <h1>📝 모의고사</h1>
          <p class="muted page-lead">현재 위치를 확인하고 목표까지의 Gap을 측정합니다.</p>
        </div>
      </header>

      <div class="area-grid">
        <article class="card">
          <h2>⚡ Mini TEPS</h2>
          <p class="card-copy">빠른 현재 상태 확인용 짧은 진단입니다.</p>
          <ul class="bullet-list">
            <li>가능 시 약 ${TEPS_CONFIG.mini.preferredTotal}문항 / ${TEPS_CONFIG.mini.durationMinutes}분</li>
            <li>문제은행 규모에 따라 문항 수 자동 조정</li>
            <li>시험 중 해설·정답 표시 없음</li>
          </ul>
          <div class="section-actions">
            <button type="button" class="btn btn-primary" data-mock="mini">시작하기</button>
          </div>
        </article>

        <article class="card">
          <h2>🏁 Full TEPS</h2>
          <p class="card-copy">실전형 모의고사 엔진 구조입니다.</p>
          <ul class="meta-list">
            <li><strong>${TEPS_CONFIG.full.totalQuestions}문항</strong></li>
            <li><strong>${TEPS_CONFIG.full.durationMinutes}분</strong></li>
            <li>실전형 · 중간 해설 없음</li>
          </ul>
          ${
            full.ok
              ? `<div class="section-actions"><button type="button" class="btn btn-secondary" data-mock="full">시작하기</button></div>`
              : `<p class="callout">📦 현재 Full TEPS를 구성할 문제은행이 부족합니다.</p>
                 <ul class="bullet-list">${Object.entries(full.missing)
                   .map(
                     ([s, m]) =>
                       `<li>${escapeHtml(s)}: 필요 ${m.need} · 보유 ${m.have} · 부족 ${m.lack}</li>`
                   )
                   .join('')}</ul>
                 <p class="muted small">전체 필요 ${full.totalNeed} · 현재 보유 ${full.totalHave}</p>`
          }
        </article>
      </div>
    </section>
  `;
}

export function bindMock(root) {
  root.querySelectorAll('[data-mock]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('mock-guide', { type: btn.getAttribute('data-mock') });
    });
  });
}

export function renderMockGuide(params = {}) {
  const type = params.type === 'full' ? 'full' : 'mini';
  const isFull = type === 'full';
  const full = getFullTePSStatus();
  const resume = loadMockSessionSnapshot();
  const resumeMode = isFull ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;

  return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="mock">← 모의고사</button>
        <div>
          <p class="eyebrow">시험 안내</p>
          <h1>${isFull ? 'Full TEPS' : 'Mini TEPS'}</h1>
        </div>
      </header>
      <section class="card">
        <h2>시작 전 안내</h2>
        ${
          isFull
            ? `<ul class="bullet-list">
                <li>총 ${TEPS_CONFIG.full.totalQuestions}문항 / ${TEPS_CONFIG.full.durationMinutes}분</li>
                <li>시험 중 정답·해설·오답 원인을 표시하지 않습니다.</li>
                <li>음원이 없는 Listening은 학습용 Transcript로 제공될 수 있습니다.</li>
              </ul>
              ${
                full.ok
                  ? ''
                  : `<div class="empty-inline"><p>현재 Full TEPS를 구성할 문제은행이 부족합니다. 문제은행 Import 후 이용하세요.</p></div>`
              }`
            : `<ul class="bullet-list">
                <li>영역 균형 샘플로 현재 상태를 추정합니다.</li>
                <li>결과는 <strong>학습용 추정치</strong>이며 공식 TEPS 성적이 아닙니다.</li>
                <li>Demo 문항만 있을 경우 신뢰도가 낮게 표시됩니다.</li>
              </ul>`
        }
        <div class="btn-row wrap">
          ${
            !isFull || full.ok
              ? `<button type="button" class="btn btn-primary" id="mock-start">${
                  isFull ? 'Full TEPS 시작' : 'Mini TEPS 시작'
                }</button>`
              : ''
          }
          ${
            resume && resume.mode === resumeMode
              ? `<button type="button" class="btn btn-secondary" id="mock-resume">이어하기</button>`
              : ''
          }
        </div>
      </section>
    </section>
  `;
}

export function bindMockGuide(root, params = {}) {
  const type = params.type === 'full' ? 'full' : params.type || 'mini';
  root.querySelector('[data-nav="mock"]')?.addEventListener('click', () => navigate('mock'));
  root.querySelector('#mock-start')?.addEventListener('click', () => {
    mockSession = null;
    navigate('mock-exam', { type });
  });
  root.querySelector('#mock-resume')?.addEventListener('click', () => {
    navigate('mock-exam', { type, resume: '1' });
  });
}

function createMockSession(type) {
  const mode = type === 'full' ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;
  const pool = getQuestionPool();

  if (type === 'full') {
    const status = getFullTePSStatus();
    if (!status.ok) return { error: 'insufficient', status };
    const questions = buildBalancedSet(pool, TEPS_CONFIG.full.sections, {
      knowledgeMap: getState().knowledgeMap,
    });
    return {
      session: createSession({
        mode,
        questions,
        title: 'Full TEPS',
        meta: { type: 'full' },
      }),
    };
  }

  const built = buildMiniQuestions();
  if (!built.questions.length) {
    return { error: 'empty' };
  }

  const sectionsPresent = new Set(built.questions.map((q) => q.section));
  const partial =
    !sectionsPresent.has('reading') ||
    !sectionsPresent.has('listening') ||
    built.questions.length < TEPS_CONFIG.mini.preferredTotal;

  return {
    session: createSession({
      mode,
      questions: built.questions,
      title: partial ? 'Mini TEPS (부분 진단)' : 'Mini TEPS',
      meta: {
        type: 'mini',
        partialDiagnosis: partial,
        sectionsPresent: [...sectionsPresent],
        ...built.meta,
      },
    }),
  };
}

export function renderMockExam(params = {}) {
  const type = params.type === 'full' ? 'full' : 'mini';
  const mode = type === 'full' ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;

  if (params.resume === '1') {
    const snap = loadMockSessionSnapshot();
    if (snap?.questions?.length && snap.mode === mode) {
      mockSession = snap;
    }
  }

  if (!mockSession || mockSession.mode !== mode) {
    const created = createMockSession(type);
    if (created.error === 'insufficient') {
      return `<section class="page"><div class="empty-state card">
        <p class="empty-title">Full TEPS 문제은행 부족</p>
        <p class="muted">필요한 영역별 문항을 채운 뒤 다시 시도해 주세요.</p>
        <button type="button" class="btn btn-secondary" data-nav="mock">모의고사로</button>
      </div></section>`;
    }
    if (created.error || !created.session?.questions?.length) {
      return `<section class="page"><div class="empty-state card">
        <p class="empty-title">시험을 구성할 문제가 부족합니다.</p>
        <p class="muted">최소 ${TEPS_CONFIG.mini.minQuestions}문항 이상을 권장합니다. (현재 Demo 문항 추가 예정 구조)</p>
        <button type="button" class="btn btn-secondary" data-nav="mock">모의고사로</button>
      </div></section>`;
    }
    mockSession = created.session;
    try {
      if (sessionStorage.getItem('tepscrew:diagnosisFlag') === '1') {
        mockSession.title = 'Quick Diagnosis';
        mockSession.meta = { ...(mockSession.meta || {}), type: 'diagnosis' };
      }
    } catch {
      /* ignore */
    }
    startQuestionTimer(mockSession);
    saveMockSessionSnapshot(mockSession);
  }

  // Allow mini even with fewer than min if we have some questions (graceful)
  const total = mockSession.questions.length;
  const duration =
    type === 'full' ? TEPS_CONFIG.full.durationMinutes : TEPS_CONFIG.mini.durationMinutes;

  return `
    <section class="page quiz-page mock-engine" data-engine="mock" data-type="${type}">
      <header class="quiz-header card">
        <div>
          <p class="eyebrow">${escapeHtml(mockSession.title)}</p>
          <h1 id="mock-section-label">시험 진행</h1>
          <p class="muted small">권장 ${duration}분 · 정답/해설 비표시 · 학습용</p>
        </div>
        <div class="quiz-meta">
          <span id="mock-progress">1 / ${total}</span>
          <span class="timer" id="mock-timer" aria-live="off">00:00</span>
        </div>
      </header>

      <button type="button" class="btn btn-secondary btn-block" id="toggle-nav" aria-expanded="false">
        문제 번호 (Answer Sheet)
      </button>
      <div class="mock-nav card" id="mock-nav" hidden></div>

      <article class="card quiz-body" id="mock-body"></article>

      <div class="quiz-sticky-footer mock-footer">
        <button type="button" class="btn btn-ghost" id="mock-exit">나가기</button>
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" id="mock-prev">이전</button>
          <button type="button" class="btn btn-secondary" id="mock-next">다음</button>
          <button type="button" class="btn btn-primary" id="mock-submit-all">제출</button>
        </div>
      </div>
    </section>
  `;
}

function paintMock(root) {
  const session = mockSession;
  const q = getCurrentQuestion(session);
  if (!q) return;

  const sectionLabel = (q.section || '').replace(/^./, (c) => c.toUpperCase());
  root.querySelector('#mock-section-label').textContent = sectionLabel || '시험 진행';
  root.querySelector('#mock-progress').textContent = `${session.currentIndex + 1} / ${
    session.questions.length
  }`;

  const selected = session.answers[q.id]?.selectedAnswer;
  const passage = getPassageText(q);

  root.querySelector('#mock-body').innerHTML = `
    ${
      q.section === 'listening'
        ? `<div class="listening-toolbar">
            <p class="badge badge-soft">학습용 Transcript · 실제 TEPS 음원이 아닙니다</p>
            ${
              passage && typeof window.speechSynthesis !== 'undefined'
                ? `<button type="button" class="btn btn-secondary btn-mini" id="mock-tts">학습용 음성 듣기</button>`
                : ''
            }
          </div>`
        : ''
    }
    <div class="passage reading-prose ${passage ? '' : 'is-empty'}">${
      passage ? escapeHtml(passage).replace(/\n/g, '<br>') : '<span class="muted">지문 없음</span>'
    }</div>
    <h2 class="quiz-question">${escapeHtml(q.question)}</h2>
    <div class="choice-list" role="radiogroup" aria-label="선택지">
      ${q.choices
        .map(
          (c, i) => `
        <button type="button" class="choice-btn ${selected === i ? 'is-selected' : ''}"
          role="radio" aria-checked="${selected === i}" data-choice="${i}">
          <span class="choice-key">${choiceLetter(i)}</span>
          <span>${escapeHtml(c)}</span>
        </button>`
        )
        .join('')}
    </div>
  `;

  paintNav(root);

  root.querySelector('#mock-tts')?.addEventListener('click', (e) => {
    if (!passage || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(passage);
    u.lang = 'en-US';
    u.rate = 0.92;
    const btn = e.currentTarget;
    btn.disabled = true;
    u.onend = () => {
      btn.disabled = false;
    };
    u.onerror = () => {
      btn.disabled = false;
    };
    window.speechSynthesis.speak(u);
  });

  root.querySelectorAll('#mock-body .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = Number(btn.dataset.choice);
      // track per-question time on first select after open
      const prev = session.answers[q.id];
      const responseTime = Math.max(
        1,
        Math.round((Date.now() - (session.questionStartedAt || Date.now())) / 1000)
      );
      setSelectedAnswer(session, q.id, choice);
      session.answers[q.id] = {
        ...session.answers[q.id],
        responseTime: prev?.responseTime || responseTime,
        section: q.section,
        type: q.type,
      };
      saveMockSessionSnapshot(session);
      paintMock(root);
    });
  });
}

function paintNav(root) {
  const nav = root.querySelector('#mock-nav');
  if (!nav) return;
  nav.innerHTML = `
    <div class="nav-grid" role="navigation" aria-label="문제 번호">
      ${mockSession.questions
        .map((q, i) => {
          const answered = mockSession.answers[q.id]?.selectedAnswer != null;
          const current = i === mockSession.currentIndex;
          return `<button type="button" class="nav-dot ${answered ? 'is-answered' : ''} ${
            current ? 'is-current' : ''
          }" data-goto="${i}" aria-label="문제 ${i + 1}${answered ? ' 응답됨' : ' 미응답'}${
            current ? ' 현재' : ''
          }">${i + 1}</button>`;
        })
        .join('')}
    </div>
  `;
  nav.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mockSession.currentIndex = Number(btn.dataset.goto);
      startQuestionTimer(mockSession);
      saveMockSessionSnapshot(mockSession);
      paintMock(root);
    });
  });
}

export function bindMockExam(root) {
  root.querySelector('[data-nav="mock"]')?.addEventListener('click', () => navigate('mock'));
  if (!root.querySelector('.mock-engine') || !mockSession) return;

  let seconds = 0;
  const timerEl = root.querySelector('#mock-timer');
  const timer = setInterval(() => {
    seconds += 1;
    if (timerEl) timerEl.textContent = formatTimer(seconds);
  }, 1000);

  mockCleanup = () => clearInterval(timer);
  root._quizCleanup = mockCleanup;

  root.querySelector('#toggle-nav')?.addEventListener('click', () => {
    const nav = root.querySelector('#mock-nav');
    const btn = root.querySelector('#toggle-nav');
    const open = nav.hidden;
    nav.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  root.querySelector('#mock-prev')?.addEventListener('click', () => {
    if (mockSession.currentIndex > 0) {
      mockSession.currentIndex -= 1;
      startQuestionTimer(mockSession);
      saveMockSessionSnapshot(mockSession);
      paintMock(root);
    }
  });

  root.querySelector('#mock-next')?.addEventListener('click', () => {
    if (mockSession.currentIndex < mockSession.questions.length - 1) {
      mockSession.currentIndex += 1;
      startQuestionTimer(mockSession);
      saveMockSessionSnapshot(mockSession);
      paintMock(root);
    }
  });

  root.querySelector('#mock-exit')?.addEventListener('click', () => {
    if (
      window.confirm(
        '시험을 종료하면 현재 답안이 제출되지 않을 수 있습니다. 종료할까요?'
      )
    ) {
      destroyMockEngine();
      navigate('mock');
    }
  });

  root.querySelector('#mock-submit-all')?.addEventListener('click', async () => {
    const left = unansweredCount(mockSession);
    if (left > 0) {
      const ok = window.confirm(`미응답 문제가 ${left}개 있습니다. 그래도 제출할까요?`);
      if (!ok) return;
    }
    await finalizeMock(seconds);
  });

  paintMock(root);
}

async function finalizeMock(elapsedSeconds = 0) {
  const session = mockSession;
  if (!session) return;

  // Grade
  session.questions.forEach((q) => {
    const a = session.answers[q.id];
    if (!a || a.selectedAnswer == null) {
      session.answers[q.id] = {
        questionId: q.id,
        selectedAnswer: null,
        correct: false,
        responseTime: a?.responseTime || 0,
        submitted: true,
        section: q.section,
        type: q.type,
      };
      return;
    }
    a.correct = a.selectedAnswer === q.answer;
    a.correctAnswer = q.answer;
    a.submitted = true;
  });

  const attempts = buildAttemptList(session).map((a) => ({
    ...a,
    correct: a.selectedAnswer != null ? a.selectedAnswer === a.correctAnswer : false,
  }));

  // Persist question records + review for wrongs (mock mode)
  for (const q of session.questions) {
    const a = session.answers[q.id];
    if (a?.selectedAnswer == null) continue;
    try {
      await persistQuestionAttempt({
        session,
        question: q,
        selectedAnswer: a.selectedAnswer,
        correct: a.correct,
        responseTime: a.responseTime || 0,
      });
    } catch {
      /* continue */
    }
  }

  const estimation = estimateTepsScore(attempts, session.questions);
  const summary = await persistSessionSummary(session, {
    title: session.title,
    score: estimation.score,
  });

  const { bySection } = summarizeAttempts(attempts);
  const gapInfo = computeGapPriorities({
    accuracyBySection: estimation.accuracyBySection,
    knowledgeMap: getState().knowledgeMap,
    attempts,
  });

  const target = getState().settings?.targetScore ?? 327;

  let isDiagnosis = false;
  try {
    isDiagnosis = sessionStorage.getItem('tepscrew:diagnosisFlag') === '1';
  } catch {
    isDiagnosis = session.meta?.type === 'diagnosis';
  }

  const isPartial = !!session.meta?.partialDiagnosis;
  const allowScore = !isDiagnosis && !isPartial && estimation.canEstimate;

  const mockRecord = {
    id: uid('mock'),
    type: isDiagnosis ? 'diagnosis' : session.meta?.type || 'mini',
    title: isDiagnosis ? 'Quick Diagnosis' : session.title,
    createdAt: new Date().toISOString(),
    sessionId: session.sessionId,
    totalQuestions: session.questions.length,
    correctCount: attempts.filter((a) => a.correct).length,
    accuracy: summary.accuracy,
    score: allowScore ? estimation.score : null,
    scoreConfidence: estimation.confidence?.level || 'low',
    confidenceLabel: estimation.confidence?.label || '낮음',
    confidenceMessage: isDiagnosis
      ? '진단 결과는 학습 시작 위치를 정하기 위한 참고용입니다. 공식 TEPS 점수가 아닙니다.'
      : isPartial
        ? '이번 Mini TEPS는 Vocabulary / Grammar 중심 부분 진단입니다. 전체 TEPS 예상점수는 산출하지 않습니다.'
        : estimation.confidence?.message || '',
    scores: estimation.scores,
    accuracyBySection: estimation.accuracyBySection,
    weaknesses: gapInfo.topSkills.slice(0, 5).map((w) => `${w.section}-${w.skill}`),
    targetGap:
      allowScore && estimation.score != null
        ? Math.max(0, target - estimation.score)
        : null,
    elapsedSeconds,
    demoHeavy: estimation.demoHeavy || session.questions.every((q) => q.source === 'demo'),
    partialDiagnosis: isPartial,
    gapInfo,
    bySection,
  };

  try {
    await saveMockResult(mockRecord);
  } catch (err) {
    showToast(err.message || '모의고사 저장 실패', 'warning');
  }

  let resultPayload = { kind: 'mock', ...mockRecord, attempts, questions: session.questions };
  try {
    resultPayload = (await maybeAttachDiagnosis(resultPayload)) || resultPayload;
  } catch {
    /* ignore */
  }
  setLastSessionResult(resultPayload);
  clearMockSessionSnapshot();
  destroyMockEngine();
  navigate('mock-result');
}

export function renderMockResult() {
  const result = getLastSessionResult();
  if (!result || result.kind !== 'mock') {
    return `<section class="page"><div class="empty-state card">
      <p class="empty-title">모의고사 결과가 없습니다.</p>
      <button type="button" class="btn btn-primary" data-nav="mock">모의고사로</button>
    </div></section>`;
  }

  const target = getState().settings?.targetScore ?? 327;
  const sectionHtml = Object.entries(result.bySection || {})
    .filter(([, s]) => s.total > 0)
    .map(([section, s]) => {
      const acc = Math.round((s.correct / s.total) * 100);
      const avgTime = s.total ? Math.round(s.time / s.total) : 0;
      return `<div class="section-result">
        <div class="card-header-row">
          <strong>${escapeHtml(section)}</strong>
          <span>${s.correct}/${s.total} · ${acc}%</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${acc}%"></div></div>
        <p class="muted small">평균 ${avgTime}초</p>
      </div>`;
    })
    .join('');

  const slowest = Object.entries(result.bySection || {})
    .filter(([, s]) => s.total)
    .sort((a, b) => b[1].time / b[1].total - a[1].time / a[1].total)[0];

  const tops = result.gapInfo?.topSkills || [];

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">${escapeHtml(result.title || 'Mock')} 결과</p>
          <h1>${result.type === 'diagnosis' ? '진단 결과' : '결과 분석'}</h1>
          ${
            result.demoHeavy
              ? '<span class="badge badge-demo">Demo 문제 기반 학습 결과</span>'
              : ''
          }
        </div>
      </header>

      ${
        result.type === 'diagnosis' && result.diagnosis
          ? `<section class="card">
              <h2>추천 시작 단계</h2>
              <p class="score-flow">${escapeHtml(result.diagnosis.recommendedStart)}</p>
              <ul class="bullet-list">
                ${Object.entries(result.diagnosis.levels || {})
                  .map(
                    ([k, v]) =>
                      `<li><strong>${escapeHtml(k)}</strong> — ${escapeHtml(v)}</li>`
                  )
                  .join('')}
              </ul>
              <p class="callout">정확한 TEPS 점수를 산출하지 않습니다. Today Plan과 Foundation 우선순위에 반영됩니다.</p>
              <div class="btn-row wrap">
                <button type="button" class="btn btn-primary" data-nav="foundation">기초학습 시작</button>
                <button type="button" class="btn btn-secondary" data-nav="home">홈으로</button>
              </div>
            </section>`
          : ''
      }

      <section class="card">
        <p class="eyebrow">학습용 추정 · 공식 TEPS 성적 아님</p>
        <div class="score-grid">
          <div class="score-cell accent-cell">
            <span class="label">예상 TEPS</span>
            <strong class="score-value accent-text">${
              result.score == null ? '측정 데이터 부족' : escapeHtml(result.score)
            }</strong>
            ${
              result.score != null
                ? `<p class="muted small">신뢰도: ${escapeHtml(
                    result.confidenceLabel || '낮음'
                  )}</p>`
                : ''
            }
          </div>
          <div class="score-cell">
            <span class="label">정답률</span>
            <strong class="score-value">${escapeHtml(result.accuracy)}%</strong>
            <p class="muted small">${result.correctCount}/${result.totalQuestions}</p>
          </div>
          <div class="score-cell">
            <span class="label">목표 / Gap</span>
            <strong class="score-value">${escapeHtml(target)}${
              result.targetGap != null ? ` / ${result.targetGap}` : ' / —'
            }</strong>
          </div>
        </div>
        <p class="callout">${escapeHtml(
          result.confidenceMessage ||
            '연습 결과 기반의 학습용 추정치입니다. 공식 TEPS 성적이 아닙니다.'
        )}</p>
      </section>

      <section class="card">
        <h2>영역별 결과</h2>
        <div class="stack-lg">${sectionHtml}</div>
        ${
          slowest
            ? `<p class="muted">가장 시간이 오래 걸린 영역: <strong>${escapeHtml(
                slowest[0]
              )}</strong></p>`
            : ''
        }
      </section>

      <section class="card gap-card">
        <h2>327 Gap Analysis</h2>
        <div class="score-grid">
          <div class="score-cell"><span class="label">예상</span><strong class="score-value">${
            result.score ?? '—'
          }</strong></div>
          <div class="score-cell accent-cell"><span class="label">목표</span><strong class="score-value accent-text">${escapeHtml(
            target
          )}</strong></div>
          <div class="score-cell"><span class="label">Gap</span><strong class="score-value">${
            result.targetGap ?? '—'
          }</strong></div>
        </div>
        <h3>우선 보완 영역</h3>
        <ol class="priority-list">
          ${
            tops.length
              ? tops
                  .slice(0, 3)
                  .map(
                    (t, i) =>
                      `<li><strong>${i + 1}. ${escapeHtml(t.section)} — ${escapeHtml(
                        t.label || t.skill
                      )}</strong>
                      <span class="priority-tag">${escapeHtml(
                        result.gapInfo.sectionPriorities?.find((s) => s.section === t.section)
                          ?.level || '높음'
                      )}</span></li>`
                  )
                  .join('')
              : '<li class="muted">아직 우선순위 데이터가 부족합니다.</li>'
          }
        </ol>
        <h3>327을 향한 다음 학습</h3>
        <ul class="bullet-list">
          ${tops
            .slice(0, 3)
            .map(
              (t) =>
                `<li>${escapeHtml(t.section)} · ${escapeHtml(t.label || t.skill)} 집중 훈련</li>`
            )
            .join('') || '<li>327 Target 훈련으로 취약점을 보완하세요.</li>'}
        </ul>
        <button type="button" class="btn btn-primary" data-nav="practice-quiz" data-target327="1">327 집중훈련 시작</button>
      </section>

      <div class="btn-row wrap">
        <button type="button" class="btn btn-secondary" data-nav="my-teps">My TEPS</button>
        <button type="button" class="btn btn-ghost" data-nav="home">홈으로</button>
      </div>
    </section>
  `;
}

export function bindMockResult(root) {
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-nav');
      const params = {};
      if (btn.dataset.target327) {
        params.target327 = '1';
        params.count = '8';
        params.mode = 'target327';
      }
      navigate(page, params);
    });
  });
}

export function destroyMockEngine() {
  if (typeof mockCleanup === 'function') mockCleanup();
  mockCleanup = null;
  mockSession = null;
}

/** Quick Diagnosis — separate lightweight flow using practice grading style exam */
export function renderDiagnosis() {
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Quick Diagnosis</p>
          <h1>첫 진단</h1>
          <p class="muted">공식 점수 예측이 아니라, 어느 영역부터 공부할지 판단합니다.</p>
        </div>
      </header>
      <section class="card">
        <ul class="bullet-list">
          <li>가능하면 영역별 Demo 문항을 골고루 출제합니다.</li>
          <li>문항이 부족한 영역은 「데이터 부족」으로 표시합니다.</li>
          <li>결과는 Foundation / TEPS Entry 추천에 활용됩니다.</li>
        </ul>
        <button type="button" class="btn btn-primary" id="start-diagnosis">진단 시작</button>
      </section>
    </section>
  `;
}

export function bindDiagnosis(root) {
  root.querySelector('#start-diagnosis')?.addEventListener('click', () => {
    navigate('mock-exam', { type: 'mini', diagnosis: '1' });
    // Use mini engine; mark via sessionStorage flag
    try {
      sessionStorage.setItem('tepscrew:diagnosisFlag', '1');
    } catch {
      /* ignore */
    }
  });
}

// After mock finalize, if diagnosis flag, enrich profile.diagnosis
export async function maybeAttachDiagnosis(result) {
  let flag = false;
  try {
    flag = sessionStorage.getItem('tepscrew:diagnosisFlag') === '1';
    sessionStorage.removeItem('tepscrew:diagnosisFlag');
  } catch {
    flag = result?.type === 'diagnosis';
  }
  if (!flag && result?.type !== 'diagnosis') return result;

  const levels = {};
  Object.entries(result.bySection || {}).forEach(([section, s]) => {
    if (!s.total) {
      levels[section] = '데이터 부족';
      return;
    }
    const acc = s.correct / s.total;
    if (acc >= 0.7) levels[section] = '기본기 있음';
    else if (acc >= 0.4) levels[section] = '보완 필요';
    else levels[section] = '기초 부족';
  });
  ['listening', 'vocabulary', 'grammar', 'reading'].forEach((s) => {
    if (!levels[s]) levels[s] = '데이터 부족';
  });

  const diagnosis = {
    recommendedStart: 'Foundation + TEPS Entry',
    levels,
    createdAt: new Date().toISOString(),
  };

  updateProfile({
    diagnosisCompleted: true,
    diagnosis,
    currentStage: 'foundation',
  });

  const next = {
    ...result,
    type: 'diagnosis',
    title: 'Quick Diagnosis',
    diagnosis,
  };
  try {
    await saveMockResult({
      ...next,
      id: next.id || `diag-${Date.now()}`,
    });
  } catch {
    /* ignore */
  }
  return next;
}
