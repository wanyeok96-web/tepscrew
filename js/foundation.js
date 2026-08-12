/**
 * Foundation hub / lesson / mini-quiz / review
 */

import {
  getState,
  addLearningRecord,
  saveFoundationProgress,
} from './state.js';
import { escapeHtml } from './utils.js';
import { navigate } from './router.js';
import { showToast } from './toast.js';
import {
  getNextFoundationLesson,
  collectFoundationWrongChecks,
} from './content/foundation-loader.js';

const STATUS_LABEL = {
  completed: '완료',
  in_progress: '학습 중',
  recommended: '추천',
  not_started: '미학습',
};

const PASS_SCORE = 70;

function lessonStatus(lesson, progress) {
  if (progress?.status === 'completed') return 'completed';
  if (progress?.status === 'in_progress') return 'in_progress';
  if (lesson.status === 'recommended') return 'recommended';
  return progress?.status || lesson.status || 'not_started';
}

function getLesson(id) {
  return (getState().content.foundation?.lessons || []).find((l) => l.id === id);
}

function categoryProgress(lessons, foundationProgress, categoryId) {
  const subset = lessons.filter((l) => l.category === categoryId);
  const done = subset.filter((l) => foundationProgress[l.id]?.status === 'completed').length;
  return { total: subset.length, done };
}

export function renderFoundation(params = {}) {
  const { content, foundationProgress } = getState();
  const data = content.foundation;
  if (!data) {
    return `<section class="page"><div class="empty-state"><p>기초학습 데이터를 불러오지 못했습니다.</p></div></section>`;
  }

  const lessons = data.lessons || [];
  const filter = params.category || 'all';
  const completed = lessons.filter((l) => foundationProgress[l.id]?.status === 'completed').length;
  const pct = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const categories = data.categories || [];
  const next = getNextFoundationLesson(lessons, foundationProgress);
  const wrongItems = collectFoundationWrongChecks(lessons, foundationProgress);
  const filtered =
    filter === 'all' ? lessons : lessons.filter((l) => l.category === filter);

  return `
    <section class="page foundation-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Foundation</p>
          <h1>🧱 기초학습</h1>
          <p class="muted page-lead">배우기 → 미니 퀴즈 → 오답 복습으로 영어 기본기를 쌓습니다.</p>
        </div>
      </header>

      <section class="card">
        <div class="card-header-row">
          <h2>📊 전체 진행률</h2>
          <span class="accent-text">${completed}/${lessons.length} · ${pct}%</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p class="muted small">학습용 기초 코스입니다. 공식 TEPS 기출이 아닙니다.</p>
      </section>

      ${
        next
          ? `<section class="card foundation-next">
              <p class="eyebrow">다음에 할 Lesson</p>
              <h2>${escapeHtml(next.title)}</h2>
              <p class="muted">약 ${escapeHtml(next.estimatedMinutes || 12)}분 · Lesson ${String(
                next.order
              ).padStart(2, '0')}</p>
              <div class="btn-row wrap">
                <button type="button" class="btn btn-primary" data-nav="lesson" data-id="${escapeHtml(
                  next.id
                )}">이어서 학습</button>
                <button type="button" class="btn btn-secondary" data-nav="lesson-quiz" data-id="${escapeHtml(
                  next.id
                )}">미니 퀴즈</button>
              </div>
            </section>`
          : ''
      }

      <section class="foundation-filters" aria-label="기초 영역 필터">
        <button type="button" class="filter-chip ${
          filter === 'all' ? 'is-active' : ''
        }" data-filter="all">전체</button>
        ${categories
          .map((c) => {
            const cp = categoryProgress(lessons, foundationProgress, c.id);
            return `<button type="button" class="filter-chip ${
              filter === c.id ? 'is-active' : ''
            }" data-filter="${escapeHtml(c.id)}">${escapeHtml(c.title)}
              <span class="muted">${cp.done}/${cp.total}</span></button>`;
          })
          .join('')}
      </section>

      ${
        wrongItems.length
          ? `<section class="card">
              <h2>🔁 기초 오답 복습</h2>
              <p class="muted">틀린 확인문제 ${wrongItems.length}문항</p>
              <button type="button" class="btn btn-secondary" id="foundation-review-start">오답 다시 풀기</button>
            </section>`
          : ''
      }

      <section class="card">
        <h2>📚 Lesson 목록</h2>
        <ul class="lesson-list">
          ${
            filtered.length
              ? filtered
                  .map((lesson) => {
                    const progress = foundationProgress[lesson.id];
                    const status = lessonStatus(lesson, progress);
                    const acc =
                      progress?.bestAccuracy ?? progress?.accuracy ?? null;
                    return `
              <li>
                <button type="button" class="lesson-row" data-lesson="${escapeHtml(lesson.id)}">
                  <span class="lesson-num">${String(lesson.order).padStart(2, '0')}</span>
                  <span class="lesson-body">
                    <strong>${escapeHtml(lesson.title)}</strong>
                    <span class="muted">약 ${escapeHtml(lesson.estimatedMinutes || 10)}분${
                      acc != null ? ` · 최고 ${escapeHtml(acc)}%` : ''
                    }</span>
                  </span>
                  <span class="status-pill status-${status}">${STATUS_LABEL[status]}</span>
                </button>
              </li>`;
                  })
                  .join('')
              : '<li class="muted">이 영역에 Lesson이 없습니다.</li>'
          }
        </ul>
      </section>
    </section>
  `;
}

export function bindFoundation(root) {
  root.querySelectorAll('[data-lesson]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('lesson', { id: btn.getAttribute('data-lesson') });
    });
  });

  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-nav');
      const params = {};
      if (btn.dataset.id) params.id = btn.dataset.id;
      navigate(page, params);
    });
  });

  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-filter');
      navigate('foundation', category === 'all' ? {} : { category });
    });
  });

  root.querySelector('#foundation-review-start')?.addEventListener('click', () => {
    navigate('lesson-quiz', { id: 'review' });
  });
}

export function renderLesson(params) {
  const { foundationProgress } = getState();
  const lesson = getLesson(params.id);

  if (!lesson) {
    return `
      <section class="page">
        <div class="empty-state">
          <p class="empty-title">Lesson을 찾을 수 없습니다.</p>
          <button type="button" class="btn btn-secondary" data-nav="foundation">기초학습으로</button>
        </div>
      </section>`;
  }

  const progress = foundationProgress[lesson.id];
  const checks = lesson.checks || [];

  return `
    <section class="page lesson-page" data-lesson-id="${escapeHtml(lesson.id)}">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="foundation">← 기초학습</button>
        <div>
          <p class="eyebrow">Lesson ${String(lesson.order).padStart(2, '0')}</p>
          <h1>${escapeHtml(lesson.title)}</h1>
        </div>
      </header>

      <section class="card">
        <h2>1. 학습 목표</h2>
        <ul class="bullet-list">
          ${(lesson.objectives || []).map((o) => `<li>${escapeHtml(o)}</li>`).join('')}
        </ul>
      </section>

      <section class="card">
        <h2>2. 개념 설명</h2>
        <p>${escapeHtml(lesson.concept?.summary || '')}</p>
        <ul class="bullet-list">
          ${(lesson.concept?.points || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
        </ul>
      </section>

      <section class="card">
        <h2>3. 예문</h2>
        <div class="example-stack">
          ${(lesson.examples || [])
            .map(
              (ex) => `
            <article class="example-card">
              <p class="example-en">${escapeHtml(ex.en)}</p>
              <p class="muted">${escapeHtml(ex.ko)}</p>
              ${
                ex.structure
                  ? `<span class="structure-tag">${escapeHtml(ex.structure)}</span>`
                  : ''
              }
            </article>`
            )
            .join('')}
        </div>
      </section>

      ${
        lesson.category === 'sentence' || lesson.category === 'grammar'
          ? `<section class="card">
        <h2>4. 문장 구조 보기</h2>
        <div class="structure-board" aria-label="문장 구조">
          <div class="structure-block">S<span>주어</span></div>
          <div class="structure-plus">+</div>
          <div class="structure-block">V<span>동사</span></div>
          <div class="structure-plus">+</div>
          <div class="structure-block">O / C<span>목적어·보어</span></div>
        </div>
      </section>`
          : ''
      }

      <section class="card complete-card">
        <h2>미니 퀴즈</h2>
        <p class="muted">확인문제 ${checks.length}문항 · 70% 이상이면 Lesson 완료</p>
        ${
          progress?.bestAccuracy != null
            ? `<p class="muted small">최고 기록 ${escapeHtml(progress.bestAccuracy)}%${
                progress.status === 'completed' ? ' · 완료됨' : ''
              }</p>`
            : ''
        }
        <div class="btn-row wrap">
          <button type="button" class="btn btn-primary" data-nav="lesson-quiz" data-id="${escapeHtml(
            lesson.id
          )}">미니 퀴즈 시작</button>
          <button type="button" class="btn btn-secondary" data-nav="foundation">목록으로</button>
        </div>
      </section>
    </section>
  `;
}

export function bindLesson(root) {
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-nav');
      const params = {};
      if (btn.dataset.id) params.id = btn.dataset.id;
      navigate(page, params);
    });
  });
}

function buildReviewQuiz() {
  const { content, foundationProgress } = getState();
  const items = collectFoundationWrongChecks(content.foundation?.lessons || [], foundationProgress);
  return {
    id: 'review',
    title: '기초 오답 복습',
    order: 0,
    checks: items.map((it) => ({
      ...it.check,
      _lessonId: it.lessonId,
    })),
  };
}

export function renderLessonQuiz(params) {
  const isReview = params.id === 'review';
  const lesson = isReview ? buildReviewQuiz() : getLesson(params.id);
  if (!lesson || !(lesson.checks || []).length) {
    return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">${isReview ? '복습할 오답이 없습니다.' : '퀴즈가 없습니다.'}</p>
          <button type="button" class="btn btn-primary" data-nav="foundation">기초학습으로</button>
        </div>
      </section>`;
  }

  return `
    <section class="page foundation-quiz-page" data-lesson-id="${escapeHtml(lesson.id)}" data-mode="${
      isReview ? 'review' : 'lesson'
    }" data-wrong-only="${params.wrongOnly === '1' ? '1' : '0'}">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="${
          isReview ? 'foundation' : 'lesson'
        }" ${isReview ? '' : `data-id="${escapeHtml(lesson.id)}"`}>← 뒤로</button>
        <div>
          <p class="eyebrow">Mini Quiz</p>
          <h1>${escapeHtml(lesson.title)}</h1>
        </div>
      </header>
      <div id="fq-root" class="card"></div>
    </section>
  `;
}

export function bindLessonQuiz(root) {
  const page = root.querySelector('.foundation-quiz-page');
  if (!page) {
    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-nav');
        const params = {};
        if (btn.dataset.id) params.id = btn.dataset.id;
        navigate(p, params);
      });
    });
    return;
  }

  const lessonId = page.dataset.lessonId;
  const mode = page.dataset.mode;
  const lesson =
    mode === 'review' ? buildReviewQuiz() : getLesson(lessonId);
  let checks = [...(lesson?.checks || [])];

  if (page.dataset.wrongOnly === '1' && mode !== 'review') {
    const wrongIds = getState().foundationProgress[lessonId]?.wrongCheckIds || [];
    const filtered = checks.filter((c) => wrongIds.includes(c.id));
    if (filtered.length) checks = filtered;
  }

  const fqRoot = root.querySelector('#fq-root');
  let index = 0;
  const results = {}; // id -> boolean
  let answered = false;

  const renderQ = () => {
    answered = false;
    if (index >= checks.length) {
      renderResult();
      return;
    }
    const q = checks[index];
    const pct = Math.round((index / checks.length) * 100);
    fqRoot.innerHTML = `
      <div class="fq-progress">
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p class="muted small">${index + 1} / ${checks.length}</p>
      </div>
      ${
        q.transcript
          ? `<details class="fq-transcript"><summary>대본 보기</summary><p>${escapeHtml(
              q.transcript
            )}</p></details>`
          : ''
      }
      <p class="check-q"><span class="q-num">Q${index + 1}</span> ${escapeHtml(q.question)}</p>
      <div class="choice-list" role="radiogroup">
        ${q.choices
          .map(
            (c, i) => `
          <button type="button" class="choice-btn" data-choice="${i}">
            <span class="choice-key">${String.fromCharCode(65 + i)}</span>
            <span>${escapeHtml(c)}</span>
          </button>`
          )
          .join('')}
      </div>
      <div class="check-feedback" id="fq-feedback" hidden></div>
      <div class="btn-row wrap" id="fq-actions" hidden>
        <button type="button" class="btn btn-primary" id="fq-next">다음</button>
      </div>
    `;

    fqRoot.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const choice = Number(btn.dataset.choice);
        const correct = choice === q.answer;
        results[q.id] = correct;
        fqRoot.querySelectorAll('.choice-btn').forEach((b) => {
          b.disabled = true;
          b.classList.remove('is-selected', 'is-correct', 'is-wrong');
        });
        btn.classList.add('is-selected', correct ? 'is-correct' : 'is-wrong');
        fqRoot.querySelector(`[data-choice="${q.answer}"]`)?.classList.add('is-correct');
        const feedback = fqRoot.querySelector('#fq-feedback');
        feedback.hidden = false;
        feedback.className = `check-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
        feedback.textContent = `${correct ? '정답입니다.' : '다시 확인해 보세요.'} ${
          q.explanation || ''
        }`;
        fqRoot.querySelector('#fq-actions').hidden = false;
      });
    });

    fqRoot.querySelector('#fq-next')?.addEventListener('click', () => {
      index += 1;
      renderQ();
    });
  };

  async function persistLessonResult(accuracy, wrongCheckIds, completed) {
    if (mode === 'review') {
      // Clear resolved wrongs from their lessons
      const byLesson = {};
      checks.forEach((c) => {
        const lid = c._lessonId;
        if (!lid) return;
        if (!byLesson[lid]) byLesson[lid] = [];
        if (results[c.id] === false) byLesson[lid].push(c.id);
      });
      const lessons = getState().content.foundation?.lessons || [];
      for (const lessonMeta of lessons) {
        const prev = getState().foundationProgress[lessonMeta.id];
        if (!prev?.wrongCheckIds?.length) continue;
        const stillWrong = (prev.wrongCheckIds || []).filter((id) => {
          const q = checks.find((c) => c.id === id);
          if (!q) return true;
          return results[id] === false;
        });
        // Also remove ones answered correctly in this review
        const nextWrong = stillWrong.filter((id) => results[id] !== true);
        await saveFoundationProgress(lessonMeta.id, {
          ...prev,
          wrongCheckIds: nextWrong,
        });
      }
      return;
    }

    const prev = getState().foundationProgress[lessonId] || {};
    const bestAccuracy = Math.max(prev.bestAccuracy ?? 0, accuracy);
    const attempts = (prev.quizAttempts || 0) + 1;
    await saveFoundationProgress(lessonId, {
      ...prev,
      status: completed ? 'completed' : 'in_progress',
      completedAt: completed ? new Date().toISOString() : prev.completedAt,
      accuracy,
      bestAccuracy,
      quizAttempts: attempts,
      wrongCheckIds,
      checkResults: results,
    });
  }

  async function renderResult() {
    const total = checks.length;
    const correctCount = Object.values(results).filter(Boolean).length;
    const accuracy = total ? Math.round((correctCount / total) * 100) : 0;
    const wrongCheckIds = checks.filter((c) => results[c.id] === false).map((c) => c.id);
    const passed = accuracy >= PASS_SCORE;
    const canComplete = mode !== 'review' && passed;

    if (mode === 'review') {
      await persistLessonResult(accuracy, wrongCheckIds, false);
    } else {
      await persistLessonResult(accuracy, wrongCheckIds, false);
    }

    await addLearningRecord({
      type: 'foundation',
      recordType: 'session',
      mode: mode === 'review' ? 'foundation-review' : 'lesson-quiz',
      title: lesson.title,
      detail: `미니 퀴즈 ${correctCount}/${total} (${accuracy}%)`,
      totalQuestions: total,
      correctCount,
      accuracy,
    });

    fqRoot.innerHTML = `
      <div class="fq-result">
        <p class="eyebrow">결과</p>
        <p class="score-value display-num">${accuracy}%</p>
        <p class="muted">${correctCount} / ${total} 정답${
          passed ? ' · 완료 기준 충족' : ` · ${PASS_SCORE}% 이상 필요`
        }</p>
        ${
          wrongCheckIds.length
            ? `<ul class="bullet-list">${wrongCheckIds
                .map((id) => {
                  const q = checks.find((c) => c.id === id);
                  return `<li>${escapeHtml(q?.question || id)}</li>`;
                })
                .join('')}</ul>`
            : '<p class="muted">틀린 문항이 없습니다.</p>'
        }
        <div class="btn-row wrap">
          ${
            wrongCheckIds.length
              ? `<button type="button" class="btn btn-secondary" id="fq-retry-wrong">오답만 다시</button>`
              : ''
          }
          ${
            canComplete
              ? `<button type="button" class="btn btn-primary" id="fq-complete">Lesson 완료</button>`
              : mode !== 'review'
                ? `<button type="button" class="btn btn-secondary" data-nav="lesson" data-id="${escapeHtml(
                    lessonId
                  )}">본문 복습</button>`
                : ''
          }
          <button type="button" class="btn btn-secondary" data-nav="foundation">기초학습 목록</button>
        </div>
      </div>
    `;

    fqRoot.querySelector('#fq-retry-wrong')?.addEventListener('click', () => {
      if (mode === 'review') {
        navigate('lesson-quiz', { id: 'review' });
        return;
      }
      navigate('lesson-quiz', { id: lessonId, wrongOnly: '1' });
    });

    fqRoot.querySelector('#fq-complete')?.addEventListener('click', async () => {
      await persistLessonResult(accuracy, wrongCheckIds, true);
      showToast('Lesson을 완료했습니다.', 'success');
      const lessons = getState().content.foundation?.lessons || [];
      const next = getNextFoundationLesson(lessons, getState().foundationProgress);
      if (next && next.id !== lessonId) {
        navigate('lesson', { id: next.id });
      } else {
        navigate('foundation');
      }
    });

    fqRoot.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pageName = btn.getAttribute('data-nav');
        const navParams = {};
        if (btn.dataset.id) navParams.id = btn.dataset.id;
        navigate(pageName, navParams);
      });
    });
  }

  root.querySelectorAll('.page-header [data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageName = btn.getAttribute('data-nav');
      const navParams = {};
      if (btn.dataset.id) navParams.id = btn.dataset.id;
      navigate(pageName, navParams);
    });
  });

  renderQ();
}
