/**
 * Review page — Phase 2
 */

import {
  getState,
  getDueReviewQuestions,
  getWrongReviewQuestions,
  getMasteredReviews,
  getVocabLists,
  resolveQuestionsByReviewItems,
} from './state.js';
import { escapeHtml } from './utils.js';
import { navigate } from './router.js';
import { PRACTICE_MODES } from './config.js';

function dueVocabItems() {
  const { review, weak } = getVocabLists();
  return review;
}

export function renderReview(params = {}) {
  const tab = params.tab || 'today';
  const dueQ = getDueReviewQuestions();
  const dueV = dueVocabItems();
  const wrong = getWrongReviewQuestions();
  const mastered = getMasteredReviews();
  const vocabLists = getVocabLists();
  const km = getState().knowledgeMap;
  const weakConcepts = [];
  if (km?.sections) {
    Object.entries(km.sections).forEach(([section, items]) => {
      (items || []).forEach((item) => {
        if ((item.mastery || 0) <= 35) {
          weakConcepts.push({ section, ...item });
        }
      });
    });
  }
  weakConcepts.sort((a, b) => (a.mastery || 0) - (b.mastery || 0));

  const filter = params.section || 'all';

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Review</p>
          <h1>🔁 오답·복습</h1>
        </div>
      </header>

      <div class="segmented" role="tablist" aria-label="복습 탭">
        ${[
          ['today', '📅 오늘 복습'],
          ['wrong', '❌ 오답 문제'],
          ['weak-vocab', '⚠️ 취약 단어'],
          ['weak-concept', '🧩 취약 개념'],
          ['mastered', '✅ Mastered'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="seg-btn ${
                tab === id ? 'is-active' : ''
              }" data-review-tab="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`
          )
          .join('')}
      </div>

      ${
        tab === 'today'
          ? `<section class="card">
              <div class="card-header-row">
                <h2>오늘 복습</h2>
                <button type="button" class="btn btn-primary" id="start-today-review"
                  ${dueQ.length + dueV.length ? '' : 'disabled'}>오늘 복습 시작</button>
              </div>
              ${renderTodayPanel(dueQ, dueV)}
            </section>`
          : ''
      }

      ${
        tab === 'wrong'
          ? `<section class="card">
              <div class="card-header-row">
                <h2>오답 문제</h2>
              </div>
              <div class="filter-row" role="group" aria-label="영역 필터">
                ${['all', 'listening', 'vocabulary', 'grammar', 'reading']
                  .map(
                    (s) =>
                      `<button type="button" class="chip-btn ${
                        filter === s ? 'is-active' : ''
                      }" data-section-filter="${s}">${s === 'all' ? '전체' : s}</button>`
                  )
                  .join('')}
              </div>
              ${renderWrongList(
                filter === 'all' ? wrong : wrong.filter((w) => w.section === filter)
              )}
            </section>`
          : ''
      }

      ${
        tab === 'weak-vocab'
          ? `<section class="card">
              <h2>취약 단어</h2>
              ${renderWeakVocab(vocabLists.weak)}
            </section>`
          : ''
      }

      ${
        tab === 'weak-concept'
          ? `<section class="card">
              <h2>취약 개념</h2>
              ${
                weakConcepts.length
                  ? `<ul class="knowledge-list">${weakConcepts
                      .slice(0, 16)
                      .map(
                        (c) => `<li>
                        <div class="knowledge-label">
                          <span>${escapeHtml(c.section)} · ${escapeHtml(c.label)}</span>
                          <span class="muted">${escapeHtml(c.mastery || 0)}%</span>
                        </div>
                        <div class="bar thin"><div class="bar-fill" style="width:${escapeHtml(
                          c.mastery || 0
                        )}%"></div></div>
                      </li>`
                      )
                      .join('')}</ul>`
                  : `<div class="empty-state">
                      <p class="empty-title">표시할 취약 개념이 없습니다.</p>
                      <p class="muted">문제를 풀면 Knowledge Map이 채워집니다.</p>
                    </div>`
              }
            </section>`
          : ''
      }

      ${
        tab === 'mastered'
          ? `<section class="card">
              <h2>Mastered</h2>
              ${renderMastered(mastered, vocabLists.mastered)}
            </section>`
          : ''
      }
    </section>
  `;
}

function renderTodayPanel(dueQ, dueV) {
  if (!dueQ.length && !dueV.length) {
    return `<div class="empty-state">
      <p class="empty-title">오늘 복습할 항목이 없습니다.</p>
      <p class="muted">문제를 틀리거나 단어를 학습하면 복습 일정이 쌓입니다.</p>
      <button type="button" class="btn btn-secondary" data-nav="practice">문제훈련 가기</button>
    </div>`;
  }
  return `
    <p class="muted">문제 ${dueQ.length}개 · 단어 ${dueV.length}개</p>
    <ul class="record-list">
      ${dueQ
        .slice(0, 8)
        .map(
          (r) => `<li>
          <div>
            <strong>${escapeHtml(r.refId)}</strong>
            <p class="muted">${escapeHtml(r.section)} · ${escapeHtml(r.skill || '')}</p>
          </div>
          <span class="status-pill">문제</span>
        </li>`
        )
        .join('')}
      ${dueV
        .slice(0, 8)
        .map(
          ({ word }) => `<li>
          <div><strong>${escapeHtml(word.word)}</strong>
          <p class="muted">${escapeHtml(word.meaning)}</p></div>
          <span class="status-pill">단어</span>
        </li>`
        )
        .join('')}
    </ul>`;
}

function renderWrongList(items) {
  if (!items.length) {
    return `<div class="empty-state">
      <p class="empty-title">아직 복습할 오답이 없습니다.</p>
      <p class="muted">문제풀이 결과가 쌓이면 여기에 표시됩니다.</p>
    </div>`;
  }
  return `<ul class="record-list">
    ${items
      .slice(0, 40)
      .map(
        (r) => `<li>
        <div>
          <strong>${escapeHtml(r.refId)}</strong>
          <p class="muted">${escapeHtml(r.section)} · 오답 ${escapeHtml(
            r.wrongCount || 1
          )}회 · mastery ${escapeHtml(r.mastery || 0)}</p>
        </div>
        <button type="button" class="btn btn-secondary" data-retry="${escapeHtml(
          r.refId
        )}">다시 풀기</button>
      </li>`
      )
      .join('')}
  </ul>`;
}

function renderWeakVocab(list) {
  if (!list.length) {
    return `<div class="empty-state">
      <p class="empty-title">취약 단어가 없습니다.</p>
      <p class="muted">단어 학습에서 「몰라요」「헷갈려요」가 쌓이면 표시됩니다.</p>
      <button type="button" class="btn btn-secondary" data-nav="vocabulary">단어 학습</button>
    </div>`;
  }
  return `<ul class="record-list">
    ${list
      .slice(0, 30)
      .map(
        ({ word, mastery }) => `<li>
        <div>
          <strong>${escapeHtml(word.word)}</strong>
          <p class="muted">${escapeHtml(word.meaning)} · ${escapeHtml(
            mastery.lastResult || ''
          )}</p>
        </div>
        <span class="status-pill">${escapeHtml(mastery.status || 'learning')}</span>
      </li>`
      )
      .join('')}
  </ul>`;
}

function renderMastered(questions, vocab) {
  if (!questions.length && !vocab.length) {
    return `<div class="empty-state">
      <p class="empty-title">Mastered 항목이 없습니다.</p>
      <p class="muted">충분히 복습한 문제·단어가 여기에 모입니다.</p>
    </div>`;
  }
  return `<ul class="record-list">
    ${questions
      .map(
        (r) =>
          `<li><div><strong>${escapeHtml(r.refId)}</strong><p class="muted">문제</p></div>
          <span class="status-pill status-completed">Mastered</span></li>`
      )
      .join('')}
    ${vocab
      .map(
        ({ word }) =>
          `<li><div><strong>${escapeHtml(word.word)}</strong><p class="muted">단어</p></div>
          <span class="status-pill status-completed">Mastered</span></li>`
      )
      .join('')}
  </ul>`;
}

export function bindReview(root) {
  root.querySelectorAll('[data-review-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('review', { tab: btn.getAttribute('data-review-tab') });
    });
  });

  root.querySelectorAll('[data-section-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('review', {
        tab: 'wrong',
        section: btn.getAttribute('data-section-filter'),
      });
    });
  });

  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-nav')));
  });

  root.querySelectorAll('[data-retry]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('practice-quiz', {
        mode: PRACTICE_MODES.review,
        review: '1',
        ids: btn.getAttribute('data-retry'),
      });
    });
  });

  root.querySelector('#start-today-review')?.addEventListener('click', () => {
    const dueQ = getDueReviewQuestions();
    const qs = resolveQuestionsByReviewItems(dueQ);
    const dueV = dueVocabItems();

    if (qs.length) {
      navigate('practice-quiz', {
        mode: PRACTICE_MODES.review,
        review: '1',
        ids: qs.map((q) => q.id).join(','),
      });
      return;
    }
    if (dueV.length) {
      navigate('vocabulary', { tab: 'review' });
      return;
    }
  });
}
