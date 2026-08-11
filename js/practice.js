/**
 * Practice quiz engine + result screen (Phase 2)
 */

import {
  getState,
  selectPracticeQuestions,
  persistQuestionAttempt,
  persistSessionSummary,
  setLastSessionResult,
  getLastSessionResult,
  getDueReviewQuestions,
  resolveQuestionsByReviewItems,
  setTargetPreview,
  getBankStats,
} from './state.js';
import { putItem } from './db.js';
import {
  createSession,
  startQuestionTimer,
  getCurrentQuestion,
  setSelectedAnswer,
  recordAnswer,
  buildAttemptList,
  getPassageText,
  choiceLetter,
} from './session.js';
import { ERROR_REASONS, PRACTICE_MODES } from './config.js';
import { escapeHtml, formatTimer } from './utils.js';
import { navigate } from './router.js';
import { showToast } from './toast.js';
import { summarizeAttempts } from './scoring.js';
import { renderAiTutorPanel, bindAiTutorPanel, addVocabCandidate } from './ai/ai-tutor-ui.js';
import { build327TargetSet, collectRecentWrongIds, collectRecentAnsweredIds } from './recommendation.js';
import { normalizeSkill } from './mastery.js';
import { showConfirmModal } from './ui/modal.js';

let activeSession = null;
let engineCleanup = null;

export function getActivePracticeSession() {
  return activeSession;
}

async function confirmLeave(message) {
  return showConfirmModal({
    title: '학습 종료',
    message,
    confirmLabel: '종료',
    cancelLabel: '계속',
    danger: true,
  });
}

function speakLearningAudio(text, btn) {
  if (!text || !window.speechSynthesis) {
    showToast('이 브라우저에서는 음성 읽기를 지원하지 않습니다. Transcript로 학습해 주세요.', 'warning');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  if (btn) {
    btn.disabled = true;
    u.onend = () => {
      btn.disabled = false;
    };
    u.onerror = () => {
      btn.disabled = false;
      showToast('음성 재생에 실패했습니다. Transcript를 확인해 주세요.', 'warning');
    };
  }
  window.speechSynthesis.speak(u);
}

export function renderPractice() {
  const stats = getBankStats();
  const sections = [
    { id: 'listening', title: 'Listening', emoji: '🎧' },
    { id: 'vocabulary', title: 'Vocabulary', emoji: '📗' },
    { id: 'grammar', title: 'Grammar', emoji: '🧩' },
    { id: 'reading', title: 'Reading', emoji: '📖' },
  ];
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Practice</p>
          <h1>✏️ 문제훈련</h1>
          <p class="muted page-lead">채점 · 해설 · 오답복습까지 연결되는 학습 엔진입니다.</p>
        </div>
      </header>

      <section class="card">
        <h2>⚡ 빠른훈련</h2>
        <div class="btn-row wrap section-actions">
          <button type="button" class="btn btn-secondary" data-quiz-count="5">5문제</button>
          <button type="button" class="btn btn-secondary" data-quiz-count="10">10문제</button>
          <button type="button" class="btn btn-secondary" data-quiz-count="20">20문제</button>
        </div>
      </section>

      <section class="card">
        <h2>🗂️ 유형훈련</h2>
        <div class="quick-grid">
          ${sections
            .map((s) => {
              const n = stats.bySection?.[s.id] || 0;
              const scarce = n < 5 && (s.id === 'reading' || s.id === 'listening');
              return `
            <button type="button" class="quick-action ${scarce ? 'is-scarce' : ''}" data-quiz-section="${s.id}">
              <span class="qa-title">${s.emoji} ${s.title}</span>
              <span class="qa-desc">${n}문항${scarce ? ' · Pack 필요' : ''}</span>
            </button>`;
            })
            .join('')}
        </div>
      </section>

      <section class="card target-card">
        <p class="eyebrow accent-text">Core Feature</p>
        <h2>🎯 327 Target</h2>
        <p class="card-copy">취약 Skill · 최근 오답 · 327 핵심 문항을 우선 구성합니다. (${stats.target327 || 0}문항 보유)</p>
        <ul class="bullet-list">
          <li>Knowledge Map 취약점 반영</li>
          <li>최근 오답 유형 우선</li>
          <li>문제 부족 시 graceful fallback</li>
        </ul>
        <div class="section-actions">
          <button type="button" class="btn btn-primary" data-target327="1">🎯 327 Target 시작</button>
        </div>
      </section>
    </section>
  `;
}

export function bindPractice(root) {
  root.querySelectorAll('[data-quiz-count]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('practice-quiz', {
        count: btn.getAttribute('data-quiz-count'),
        mode: PRACTICE_MODES.practice,
      });
    });
  });
  root.querySelectorAll('[data-quiz-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('practice-quiz', {
        count: '5',
        section: btn.getAttribute('data-quiz-section'),
        mode: PRACTICE_MODES.practice,
      });
    });
  });
  root.querySelector('[data-target327]')?.addEventListener('click', () => {
    navigate('target-preview');
  });
}

function buildTargetComposition(count = 12) {
  const state = getState();
  const questions = build327TargetSet(
    state.questionBank || [],
    {
      knowledgeMap: state.knowledgeMap,
      recentWrongIds: collectRecentWrongIds(state.learningRecords),
      recentAnsweredIds: collectRecentAnsweredIds(state.learningRecords),
    },
    count
  );
  const groups = {};
  questions.forEach((q) => {
    const skill =
      normalizeSkill(q.section, (q.skills && q.skills[0]) || q.type) || q.type || 'general';
    const key = `${q.section} · ${skill}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  const preview = {
    count: questions.length,
    groups,
    questionIds: questions.map((q) => q.id),
    reason: '최근 취약 영역과 327 핵심 문제를 중심으로 구성했습니다.',
  };
  setTargetPreview(preview);
  return preview;
}

export function renderTargetPreview() {
  const preview = buildTargetComposition(12);
  if (!preview.count) {
    return `<section class="page"><div class="empty-state card">
      <p class="empty-title">구성할 문제가 부족합니다.</p>
      <button type="button" class="btn btn-secondary" data-nav="practice">문제훈련으로</button>
    </div></section>`;
  }
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">327 Target</p>
          <h1>327 집중훈련</h1>
        </div>
      </header>
      <section class="card target-card">
        <h2>이번 세트</h2>
        <ul class="bullet-list">
          ${Object.entries(preview.groups)
            .map(([k, n]) => `<li>${escapeHtml(k)} ${n}</li>`)
            .join('')}
        </ul>
        <p><strong>총 ${preview.count}문제</strong></p>
        <p class="muted">선정 이유: ${escapeHtml(preview.reason)}</p>
        <button type="button" class="btn btn-primary" id="start-target">훈련 시작</button>
      </section>
    </section>`;
}

export function bindTargetPreview(root) {
  root.querySelector('[data-nav="practice"]')?.addEventListener('click', () => navigate('practice'));
  root.querySelector('#start-target')?.addEventListener('click', () => {
    const preview = getState().targetPreview;
    navigate('practice-quiz', {
      mode: PRACTICE_MODES.target327,
      target327: '1',
      count: String(preview?.count || 12),
      ids: (preview?.questionIds || []).join(','),
    });
  });
}

function resolveQuestionsFromParams(params) {
  if (params.aiPractice === '1') {
    try {
      const raw = sessionStorage.getItem('tepscrew:aiPracticeQuestion');
      if (raw) {
        const q = JSON.parse(raw);
        return {
          questions: [q],
          mode: PRACTICE_MODES.practice,
          title: 'AI 생성 연습문제',
        };
      }
    } catch {
      /* fallthrough */
    }
  }

  if (params.mode === PRACTICE_MODES.review || params.review === '1') {
    const due = getDueReviewQuestions();
    const ids = (params.ids || '').split(',').filter(Boolean);
    let items = due;
    if (ids.length) {
      const set = new Set(ids);
      items = getState().reviewQueue.filter((r) => set.has(r.refId));
    }
    const qs = resolveQuestionsByReviewItems(items);
    if (qs.length) return { questions: qs, mode: PRACTICE_MODES.review, title: '오답 복습' };
  }

  const count = Number(params.count) || 5;
  const section = params.section || null;
  const target327 = params.target327 === '1' || params.mode === PRACTICE_MODES.target327;
  const mode =
    params.mode === PRACTICE_MODES.diagnosis
      ? PRACTICE_MODES.diagnosis
      : target327
        ? PRACTICE_MODES.target327
        : PRACTICE_MODES.practice;

  const idList = (params.ids || '').split(',').filter(Boolean);
  const questions = selectPracticeQuestions({
    count,
    section,
    target327,
    questionIds: idList.length ? idList : null,
  });
  const title =
    mode === PRACTICE_MODES.target327
      ? '327 Target'
      : mode === PRACTICE_MODES.diagnosis
        ? 'Quick Diagnosis'
        : section
          ? `${section} 훈련`
          : '문제훈련';
  return { questions, mode, title };
}

export function renderPracticeQuiz(params = {}) {
  const { questions, mode, title } = resolveQuestionsFromParams(params);
  if (!questions.length) {
    return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">풀 수 있는 문제가 없습니다.</p>
          <p class="muted">문제은행이 비어 있거나 복습 대기 문제가 없습니다.</p>
          <button type="button" class="btn btn-secondary" data-nav="practice">문제훈련으로</button>
        </div>
      </section>`;
  }

  activeSession = createSession({ mode, questions, title });
  startQuestionTimer(activeSession);

  return `
    <section class="page quiz-page practice-engine" data-engine="practice">
      <header class="quiz-header card">
        <div>
          <p class="eyebrow" id="quiz-section">—</p>
          <h1 id="quiz-title">${escapeHtml(title)}</h1>
        </div>
        <div class="quiz-meta">
          <span id="quiz-progress">1 / ${questions.length}</span>
          <span class="timer" id="quiz-timer" aria-live="off">00:00</span>
        </div>
      </header>

      <article class="card quiz-body" id="quiz-body"></article>

      <div class="quiz-sticky-footer" id="quiz-actions"></div>
      <p class="muted small center" id="quiz-demo-note" hidden>Demo 문제 기반 학습입니다. 실제 TEPS 기출이 아닙니다.</p>
    </section>
  `;
}

function renderExplanation(question, settings) {
  const ex = question.explanation || {};
  const mode = settings.explanationMode || 'manual';
  if (mode === 'after-set') return '';

  const vocab = normalizeVocabList(question.vocabulary);
  const collocations = asStringList(question.collocations);
  const synonyms = asStringList(question.synonyms);
  const confusable = asStringList(question.confusableWords);
  const sourceLabel =
    question.source === 'demo'
      ? 'Demo 학습문항'
      : question.source === 'ai-practice'
        ? 'AI 생성 연습문제'
        : 'TEPS Crew Practice';

  const body = `
    <div class="explain-panel" id="explain-panel">
      <p class="muted small">${escapeHtml(sourceLabel)}${
        question.targetScoreBand === '327-target' ? ' · <span class="badge badge-soft">327 핵심</span>' : ''
      }</p>
      <div class="explain-block">
        <h3>핵심 풀이</h3>
        <p>${escapeHtml(ex.summary || '해설 요약이 없습니다.')}</p>
      </div>
      <div class="explain-block">
        <h3>정답 근거</h3>
        <p>${escapeHtml(ex.evidence || '근거 정보가 없습니다.')}</p>
      </div>
      <details class="explain-details" ${mode === 'immediate' ? 'open' : ''}>
        <summary>선택지별 분석</summary>
        <ul class="choice-analysis">
          ${(ex.choiceAnalysis || question.choices || [])
            .map(
              (text, i) =>
                `<li><strong>${choiceLetter(i)}</strong> ${escapeHtml(
                  typeof text === 'string' ? text : ''
                )}</li>`
            )
            .join('')}
        </ul>
      </details>
      ${
        collocations.length
          ? `<details class="explain-details"><summary>함께 외울 표현</summary>
              <ul class="vocab-mini-list">${collocations
                .map((c) => `<li>${escapeHtml(c)}</li>`)
                .join('')}</ul></details>`
          : ''
      }
      ${
        synonyms.length
          ? `<details class="explain-details"><summary>유의어</summary>
              <ul class="vocab-mini-list">${synonyms
                .map((c) => `<li>${escapeHtml(c)}</li>`)
                .join('')}</ul></details>`
          : ''
      }
      ${
        confusable.length
          ? `<details class="explain-details"><summary>헷갈리는 표현</summary>
              <ul class="vocab-mini-list">${confusable
                .map((c) => `<li>${escapeHtml(c)}</li>`)
                .join('')}</ul></details>`
          : ''
      }
      ${
        vocab.length
          ? `<details class="explain-details" open><summary>핵심 어휘</summary>
              <ul class="vocab-mini-list">
                ${vocab
                  .map(
                    (v) => `
                  <li>
                    <strong>${escapeHtml(v.word)}</strong>${
                      v.meaning ? ` — ${escapeHtml(v.meaning)}` : ''
                    }
                    <button type="button" class="btn btn-ghost btn-mini" data-add-vocab="${escapeHtml(
                      v.word
                    )}" data-meaning="${escapeHtml(v.meaning || '')}">내 단어장에 추가</button>
                  </li>`
                  )
                  .join('')}
              </ul></details>`
          : ''
      }
      ${
        collocations[0]
          ? `<div class="empty-inline">
              <p>이 표현을 복습에 추가할까요? <strong>${escapeHtml(collocations[0])}</strong></p>
              <button type="button" class="btn btn-secondary" data-add-vocab="${escapeHtml(
                collocations[0]
              )}" data-meaning="">복습에 추가</button>
            </div>`
          : ''
      }
    </div>`;
  return body;
}

function asStringList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? x : x?.word || x?.phrase || ''))
    .filter(Boolean);
}

function normalizeVocabList(vocabulary) {
  if (!Array.isArray(vocabulary)) return [];
  return vocabulary
    .map((v) => {
      if (typeof v === 'string') return { word: v, meaning: '' };
      if (v && typeof v === 'object') return { word: v.word || v.term || '', meaning: v.meaning || '' };
      return null;
    })
    .filter((v) => v && v.word);
}

function renderErrorReasonPicker() {
  return `
    <div class="error-reason card-soft" id="error-reason-box">
      <p class="field-label">왜 틀렸다고 생각하나요? <span class="muted">(선택)</span></p>
      <div class="reason-grid" role="group" aria-label="오답 원인">
        ${ERROR_REASONS.map(
          (r) =>
            `<button type="button" class="reason-chip" data-reason="${escapeHtml(r.id)}">${escapeHtml(
              r.label
            )}</button>`
        ).join('')}
      </div>
    </div>`;
}

function paintQuestion(root) {
  const session = activeSession;
  const q = getCurrentQuestion(session);
  if (!q) return;

  const settings = getState().settings;
  const answerState = session.answers[q.id] || {};
  const submitted = !!answerState.submitted;
  const sectionLabel = (q.section || 'reading').replace(/^./, (c) => c.toUpperCase());
  const passage = getPassageText(q);
  const isListening = q.section === 'listening';

  root.querySelector('#quiz-section').textContent = `${sectionLabel} · Question ${
    session.currentIndex + 1
  }`;
  root.querySelector('#quiz-progress').textContent = `${session.currentIndex + 1} / ${
    session.questions.length
  }`;
  root.querySelector('#quiz-demo-note').hidden = !(
    q.source === 'demo' || getState().content.reading?.demo
  );

  const body = root.querySelector('#quiz-body');
  const canTts = isListening && passage && typeof window.speechSynthesis !== 'undefined';
  body.innerHTML = `
    ${
      isListening
        ? `<div class="listening-toolbar">
            <p class="badge badge-soft">학습용 Transcript · 실제 TEPS 음원이 아닙니다</p>
            ${
              canTts
                ? `<button type="button" class="btn btn-secondary btn-mini" id="tts-play">학습용 음성 듣기</button>`
                : ''
            }
          </div>`
        : ''
    }
    <div class="passage reading-prose ${passage ? '' : 'is-empty'}">${
      passage ? escapeHtml(passage).replace(/\n/g, '<br>') : '<span class="muted">지문 없음</span>'
    }</div>
    <h2 class="quiz-question">${escapeHtml(q.question)}</h2>
    <div class="choice-list" id="quiz-choices" role="radiogroup" aria-label="선택지">
      ${q.choices
        .map((c, i) => {
          let cls = 'choice-btn';
          let extra = '';
          if (submitted) {
            if (i === q.answer) {
              cls += ' is-correct';
              extra = '<span class="choice-status">정답</span>';
            }
            if (answerState.selectedAnswer === i && i !== q.answer) {
              cls += ' is-wrong';
              extra = '<span class="choice-status">내 선택</span>';
            } else if (answerState.selectedAnswer === i) {
              extra = '<span class="choice-status">내 선택 · 정답</span>';
            }
          } else if (answerState.selectedAnswer === i) {
            cls += ' is-selected';
          }
          return `
            <button type="button" class="${cls}" role="radio"
              aria-checked="${answerState.selectedAnswer === i}"
              data-choice="${i}" ${submitted ? 'disabled' : ''}>
              <span class="choice-key">${choiceLetter(i)}</span>
              <span class="choice-text">${escapeHtml(c)}</span>
              ${extra}
            </button>`;
        })
        .join('')}
    </div>
    <div id="result-banner" class="result-banner" ${submitted ? '' : 'hidden'}></div>
    <div id="after-submit">${
      submitted
        ? `${renderResultBanner(answerState, q)}
           ${renderExplanation(q, settings)}
           ${answerState.correct ? '' : renderErrorReasonPicker()}
           ${renderAiTutorPanel(q)}`
        : ''
    }</div>
  `;

  if (submitted && answerState.errorReason) {
    body
      .querySelector(`[data-reason="${answerState.errorReason}"]`)
      ?.classList.add('is-active');
  }

  body.querySelector('#tts-play')?.addEventListener('click', (e) => {
    speakLearningAudio(passage, e.currentTarget);
  });

  if (submitted) {
    bindAiTutorPanel(root, { question: q, attempt: answerState });
    body.querySelectorAll('[data-add-vocab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await addVocabCandidate(
            btn.getAttribute('data-add-vocab'),
            btn.getAttribute('data-meaning') || '',
            q.id
          );
        } catch (err) {
          showToast(err.message || '추가 실패', 'error');
        }
      });
    });
  }

  const actions = root.querySelector('#quiz-actions');
  const isLast = session.currentIndex >= session.questions.length - 1;
  actions.innerHTML = `
    <button type="button" class="btn btn-ghost" id="quiz-exit">나가기</button>
    ${
      submitted
        ? `<button type="button" class="btn btn-primary" id="quiz-next">${
            isLast ? '결과 보기' : '다음 문제'
          }</button>`
        : `<button type="button" class="btn btn-primary" id="quiz-submit" ${
            answerState.selectedAnswer == null ? 'disabled' : ''
          }>답안 제출</button>`
    }
  `;

  bindQuestionInteractions(root);
}

function renderResultBanner(answerState, q) {
  if (answerState.correct) {
    return `<div class="result-banner is-correct" role="status">정답입니다 ✓</div>`;
  }
  return `<div class="result-banner is-wrong" role="status">아쉽습니다. 정답은 ${choiceLetter(
    q.answer
  )}입니다.</div>`;
}

function bindQuestionInteractions(root) {
  const session = activeSession;
  const q = getCurrentQuestion(session);
  if (!q) return;
  const answerState = session.answers[q.id] || {};
  const submitted = !!answerState.submitted;

  if (!submitted) {
    root.querySelectorAll('#quiz-choices .choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSelectedAnswer(session, q.id, Number(btn.dataset.choice));
        paintQuestion(root);
      });
    });
  } else {
    root.querySelectorAll('[data-reason]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reason = btn.getAttribute('data-reason');
        session.answers[q.id].errorReason = reason;
        root.querySelectorAll('[data-reason]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });
  }

  root.querySelector('#quiz-submit')?.addEventListener('click', async () => {
    const selected = session.answers[q.id]?.selectedAnswer;
    if (selected == null) return;
    const correct = selected === q.answer;
    const recorded = recordAnswer(session, q.id, {
      selectedAnswer: selected,
      correct,
      correctAnswer: q.answer,
      submitted: true,
      section: q.section,
      type: q.type,
      skills: skillsSafe(q),
    });
    try {
      await persistQuestionAttempt({
        session,
        question: q,
        selectedAnswer: selected,
        correct,
        responseTime: recorded.responseTime,
        errorReason: null,
      });
    } catch (err) {
      showToast(err.message || '기록 저장에 실패했습니다.', 'warning');
    }
    paintQuestion(root);
  });

  root.querySelector('#quiz-next')?.addEventListener('click', async () => {
    const a = session.answers[q.id];
    if (a && !a.correct && a.errorReason) {
      try {
        const rec = getState().learningRecords.find(
          (r) => r.sessionId === session.sessionId && r.questionId === q.id
        );
        if (rec) {
          await putItem('learningRecords', { ...rec, errorReason: a.errorReason });
          rec.errorReason = a.errorReason;
        }
      } catch {
        /* non-blocking */
      }
    }

    if (session.currentIndex >= session.questions.length - 1) {
      await finishPracticeSession(root);
      return;
    }
    session.currentIndex += 1;
    startQuestionTimer(session);
    paintQuestion(root);
  });

  root.querySelector('#quiz-exit')?.addEventListener('click', async () => {
    const ok = await confirmLeave(
      session.mode?.includes('Mock')
        ? '시험을 종료하면 현재 답안이 제출되지 않을 수 있습니다. 종료할까요?'
        : '현재 학습을 종료할까요?'
    );
    if (ok) {
      cleanupEngine();
      navigate(session.mode === PRACTICE_MODES.review ? 'review' : 'practice');
    }
  });
}

function skillsSafe(q) {
  return Array.isArray(q.skills) ? q.skills : q.type ? [q.type] : [];
}

async function finishPracticeSession() {
  const session = activeSession;
  if (!session) return;

  // Update error reasons onto records is best-effort; session keeps them
  const attempts = buildAttemptList(session).map((a) => {
    const saved = session.answers[a.questionId];
    return { ...a, errorReason: saved?.errorReason || a.errorReason };
  });

  try {
    await persistSessionSummary(session);
  } catch (err) {
    showToast(err.message || '세션 요약 저장 실패', 'warning');
  }

  const answered = attempts.filter((a) => a.correct != null);
  const correctCount = answered.filter((a) => a.correct).length;
  const totalTime = answered.reduce((s, a) => s + (a.responseTime || 0), 0);
  const { bySection, skillStats } = summarizeAttempts(answered);
  const skillList = Object.values(skillStats).filter((s) => s.total);
  const weakSkills = skillList
    .filter((s) => s.correct / s.total < 0.67)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 4);
  const improvedSkills = skillList
    .filter((s) => s.correct / s.total >= 0.67)
    .sort((a, b) => b.correct / b.total - a.correct / a.total)
    .slice(0, 4);

  const result = {
    kind: 'practice',
    sessionId: session.sessionId,
    mode: session.mode,
    title: session.title,
    questions: session.questions,
    attempts: answered,
    totalQuestions: session.questions.length,
    correctCount,
    accuracy: session.questions.length
      ? Math.round((correctCount / session.questions.length) * 1000) / 10
      : 0,
    totalTime,
    avgTime: answered.length ? Math.round(totalTime / answered.length) : 0,
    bySection,
    weakSkills,
    improvedSkills,
    isTarget327: session.mode === PRACTICE_MODES.target327,
    demo:
      session.questions.every((q) => q.source === 'demo') ||
      getState().content.reading?.demo,
  };

  setLastSessionResult(result);
  cleanupEngine();
  navigate('practice-result');
}

export function bindPracticeQuiz(root) {
  root.querySelector('[data-nav="practice"]')?.addEventListener('click', () =>
    navigate('practice')
  );
  if (!root.querySelector('.practice-engine')) return;

  let seconds = 0;
  const timerEl = root.querySelector('#quiz-timer');
  const timer = setInterval(() => {
    seconds += 1;
    // update visually every 1s but aria-live=off to avoid spam
    if (timerEl) timerEl.textContent = formatTimer(seconds);
  }, 1000);

  const onKey = (e) => {
    if (!activeSession) return;
    const q = getCurrentQuestion(activeSession);
    if (!q) return;
    const submitted = activeSession.answers[q.id]?.submitted;
    if (submitted) return;
    if (['1', '2', '3', '4'].includes(e.key)) {
      setSelectedAnswer(activeSession, q.id, Number(e.key) - 1);
      paintQuestion(root);
    }
  };
  document.addEventListener('keydown', onKey);

  engineCleanup = () => {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
  };
  root._quizCleanup = engineCleanup;

  // Leave guard via hashchange handled in scripts if needed
  paintQuestion(root);
}

function cleanupEngine() {
  if (typeof engineCleanup === 'function') engineCleanup();
  engineCleanup = null;
  activeSession = null;
}

export function renderPracticeResult() {
  const result = getLastSessionResult();
  if (!result || result.kind === 'mock') {
    return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">표시할 결과가 없습니다.</p>
          <button type="button" class="btn btn-primary" data-nav="practice">문제훈련으로</button>
        </div>
      </section>`;
  }

  const sectionRows = Object.entries(result.bySection || {})
    .filter(([, s]) => s.total > 0)
    .map(
      ([section, s]) => `
      <div class="level-row">
        <span>${escapeHtml(section)}</span>
        <div class="bar thin"><div class="bar-fill" style="width:${
          s.total ? Math.round((s.correct / s.total) * 100) : 0
        }%"></div></div>
        <strong>${s.correct}/${s.total}</strong>
      </div>`
    )
    .join('');

  const wrongIds = result.attempts.filter((a) => !a.correct).map((a) => a.questionId);

  const minutes = Math.max(1, Math.round((result.totalTime || 0) / 60));

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">${result.isTarget327 ? '327 Target 결과' : 'Result'}</p>
          <h1>${
            result.isTarget327
              ? '327 Target 결과'
              : `${escapeHtml(result.totalQuestions)}문제 완료`
          }</h1>
          ${result.demo ? '<span class="badge badge-demo">Demo 문제 기반 학습 결과</span>' : ''}
          <p class="muted">약 ${minutes}분 · 정답률 ${result.accuracy}%</p>
        </div>
      </header>

      <section class="card">
        <div class="score-grid">
          <div class="score-cell">
            <span class="label">정답</span>
            <strong class="score-value">${result.correctCount} / ${result.totalQuestions}</strong>
          </div>
          <div class="score-cell accent-cell">
            <span class="label">정답률</span>
            <strong class="score-value accent-text">${result.accuracy}%</strong>
          </div>
          <div class="score-cell">
            <span class="label">평균 풀이시간</span>
            <strong class="score-value">${result.avgTime}초</strong>
          </div>
        </div>
      </section>

      ${
        result.isTarget327
          ? `<section class="card">
              <h2>이번에 보완한 영역</h2>
              ${
                result.improvedSkills?.length
                  ? `<ul class="bullet-list">${result.improvedSkills
                      .map(
                        (s) =>
                          `<li>${escapeHtml(s.skill)} (${s.correct}/${s.total})</li>`
                      )
                      .join('')}</ul>`
                  : '<p class="muted">이번 세트에서 확실히 보완된 Skill이 아직 없습니다.</p>'
              }
              <h2 style="margin-top:1rem">계속 보완 필요</h2>
              ${
                result.weakSkills?.length
                  ? `<ul class="bullet-list">${result.weakSkills
                      .map(
                        (s) =>
                          `<li>${escapeHtml(s.skill)} (${s.correct}/${s.total})</li>`
                      )
                      .join('')}</ul>`
                  : '<p class="muted">두드러진 취약 Skill이 없습니다.</p>'
              }
            </section>`
          : `<section class="card">
              <h2>취약 Skill</h2>
              ${
                result.weakSkills?.length
                  ? `<ul class="bullet-list">${result.weakSkills
                      .map(
                        (s) =>
                          `<li>${escapeHtml(s.section)} · ${escapeHtml(s.skill)} (${s.correct}/${
                            s.total
                          })</li>`
                      )
                      .join('')}</ul>`
                  : '<p class="muted">두드러진 취약 Skill이 없습니다.</p>'
              }
            </section>`
      }

      <section class="card">
        <h2>영역별</h2>
        <div class="level-list">${sectionRows || '<p class="muted">영역 데이터 없음</p>'}</div>
      </section>

      ${
        getState().settings?.explanationMode === 'after-set'
          ? renderAfterSetExplanations(result)
          : ''
      }

      <section class="card">
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" data-nav="review">오답 확인</button>
          ${
            wrongIds.length
              ? `<button type="button" class="btn btn-primary" id="retry-wrong">틀린 문제 다시 풀기</button>`
              : ''
          }
          <button type="button" class="btn btn-secondary" data-nav="practice-quiz" data-count="${
            result.totalQuestions
          }">새로운 문제 풀기</button>
          <button type="button" class="btn btn-ghost" data-nav="practice">문제훈련으로 돌아가기</button>
        </div>
      </section>
    </section>
  `;
}

function renderAfterSetExplanations(result) {
  const wrong = result.attempts.filter((a) => !a.correct);
  if (!wrong.length) return '';
  const qmap = new Map(result.questions.map((q) => [q.id, q]));
  return `
    <section class="card">
      <h2>세트 해설 (오답)</h2>
      ${wrong
        .map((a) => {
          const q = qmap.get(a.questionId);
          if (!q) return '';
          return `<article class="explain-block">
            <h3>${escapeHtml(q.id)}</h3>
            <p>${escapeHtml(q.explanation?.summary || '')}</p>
            <p class="muted">${escapeHtml(q.explanation?.evidence || '')}</p>
          </article>`;
        })
        .join('')}
    </section>`;
}

export function bindPracticeResult(root) {
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-nav');
      const params = {};
      if (btn.dataset.count) params.count = btn.dataset.count;
      navigate(page, params);
    });
  });
  root.querySelector('#retry-wrong')?.addEventListener('click', () => {
    const result = getLastSessionResult();
    const wrongIds = result.attempts.filter((a) => !a.correct).map((a) => a.questionId);
    navigate('practice-quiz', {
      mode: PRACTICE_MODES.review,
      review: '1',
      ids: wrongIds.join(','),
    });
  });
}

export function destroyPracticeEngine() {
  cleanupEngine();
}
