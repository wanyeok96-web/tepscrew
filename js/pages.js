/**
 * Remaining page renderers — Foundation, Lesson, TEPS, My TEPS
 * Practice / Review / Mock / Vocabulary are in dedicated modules.
 */

import {
  getState,
  getScoreSummary,
} from './state.js';
import { escapeHtml, formatRelativeTime, KNOWLEDGE_MAP_TEMPLATE } from './utils.js';
import { navigate } from './router.js';
import { levelFromMastery, sectionMasteryAverage } from './scoring.js';

export {
  renderPractice,
  bindPractice,
  renderPracticeQuiz,
  bindPracticeQuiz,
  renderPracticeResult,
  bindPracticeResult,
  renderTargetPreview,
  bindTargetPreview,
  destroyPracticeEngine,
} from './practice.js';

export {
  renderReview,
  bindReview,
} from './review.js';

export {
  renderVocabulary,
  bindVocabulary,
} from './vocabulary.js';

export {
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
  destroyMockEngine,
} from './mock.js';

export {
  renderFoundation,
  bindFoundation,
  renderLesson,
  bindLesson,
  renderLessonQuiz,
  bindLessonQuiz,
} from './foundation.js';

export function renderTeps(params = {}) {
  const { profile, knowledgeMap, questionBank } = getState();
  const counts = {
    listening: questionBank.filter((q) => q.section === 'listening').length,
    vocabulary: questionBank.filter((q) => q.section === 'vocabulary').length,
    grammar: questionBank.filter((q) => q.section === 'grammar').length,
    reading: questionBank.filter((q) => q.section === 'reading').length,
  };

  const areas = [
    {
      id: 'listening',
      title: '🎧 Listening',
      desc:
        counts.listening < 5
          ? `현재 문제은행 ${counts.listening}문항. 추가 Pack이 필요합니다.`
          : '응답·대화·담화 유형을 체계적으로 훈련합니다.',
      avg: sectionMasteryAverage(knowledgeMap, 'listening'),
      scarce: counts.listening < 5,
    },
    {
      id: 'vocabulary',
      title: '📗 Vocabulary',
      desc: `Collocation · Context · Phrasal Verb 등 (${counts.vocabulary}문항)`,
      avg: sectionMasteryAverage(knowledgeMap, 'vocabulary'),
      route: 'vocabulary',
    },
    {
      id: 'grammar',
      title: '🧩 Grammar',
      desc: `수일치·관계사·시제 등 핵심 문법 (${counts.grammar}문항)`,
      avg: sectionMasteryAverage(knowledgeMap, 'grammar'),
    },
    {
      id: 'reading',
      title: '📖 Reading',
      desc:
        counts.reading < 5
          ? `현재 Reading Pack ${counts.reading}문항. 추가 Pack이 필요합니다.`
          : '요지·추론·빈칸·일관성 유형을 연습합니다.',
      avg: sectionMasteryAverage(knowledgeMap, 'reading'),
      scarce: counts.reading < 5,
    },
  ];

  const focus = params.area || '';
  const grammarSkills = (knowledgeMap?.sections?.grammar || [])
    .slice()
    .sort((a, b) => (a.mastery || 0) - (b.mastery || 0))
    .slice(0, 8);

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">TEPS Areas</p>
          <h1>📘 TEPS 학습</h1>
          <p class="muted page-lead">네 영역을 균형 있게 올리며 목표 점수에 접근합니다.</p>
        </div>
      </header>
      <div class="area-grid">
        ${areas
          .map((a) => {
            const lv = levelFromMastery(a.avg);
            return `
          <article class="card area-card ${focus === a.id ? 'is-focused' : ''} ${
              a.scarce ? 'is-scarce' : ''
            }">
            <h2>${escapeHtml(a.title)}</h2>
            <p>${escapeHtml(a.desc)}</p>
            <div class="area-meta">
              <span>${escapeHtml(lv.label)} · ${Math.round(a.avg)}%</span>
              <span class="muted">Lv.${escapeHtml(profile.level?.[a.id] || lv.level)}</span>
            </div>
            <div class="bar thin"><div class="bar-fill" style="width:${Math.round(
              a.avg
            )}%"></div></div>
            <button type="button" class="btn btn-primary" data-area-start="${escapeHtml(
              a.route || a.id
            )}" ${a.scarce && a.id !== 'vocabulary' ? '' : ''}>학습 시작</button>
          </article>`;
          })
          .join('')}
      </div>

      <section class="card">
        <h2>🧩 Grammar Skill</h2>
        <p class="muted small">숙련도는 최근 정답률·반복 성공·풀이기록을 바탕으로 계산됩니다. 공식 TEPS 평가가 아닙니다.</p>
        <ul class="knowledge-list">
          ${grammarSkills
            .map(
              (item) => `
            <li>
              <div class="knowledge-label">
                <span>${escapeHtml(item.label)}</span>
                <span class="muted">${escapeHtml(item.mastery || 0)}%</span>
              </div>
              <div class="bar thin"><div class="bar-fill" style="width:${escapeHtml(
                item.mastery || 0
              )}%"></div></div>
              <button type="button" class="btn btn-ghost btn-mini" data-practice-skill="grammar" data-skill="${escapeHtml(
                item.id
              )}">연습 시작</button>
            </li>`
            )
            .join('')}
        </ul>
      </section>
    </section>
  `;
}

export function bindTeps(root) {
  root.querySelectorAll('[data-area-start]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-area-start');
      if (target === 'vocabulary') {
        navigate('vocabulary');
        return;
      }
      navigate('practice-quiz', { section: target, count: '5', mode: 'practice' });
    });
  });
  root.querySelectorAll('[data-practice-skill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('practice-quiz', {
        section: btn.getAttribute('data-practice-skill'),
        count: '5',
        mode: 'practice',
      });
    });
  });
}

export function renderMyTeps() {
  const state = getState();
  const summary = getScoreSummary();
  const map = state.knowledgeMap;
  const mocks = state.mockTests.filter((m) => m.type !== 'diagnosis');
  const scores = mocks
    .filter((m) => typeof m.score === 'number')
    .map((m) => m.score)
    .slice(0, 8)
    .reverse();

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Progress</p>
          <h1>📊 My TEPS</h1>
        </div>
      </header>

      <section class="card">
        <p class="eyebrow">학습용 추정 · 공식 TEPS 성적 아님</p>
        <div class="score-grid">
          <div class="score-cell">
            <span class="label">목표점수</span>
            <strong class="score-value accent-text">${escapeHtml(summary.target)}</strong>
          </div>
          <div class="score-cell">
            <span class="label">최근 예상점수</span>
            <strong class="score-value">${
              summary.estimated == null ? '—' : escapeHtml(summary.estimated)
            }</strong>
            ${
              summary.confidence
                ? `<p class="muted small">신뢰도: ${escapeHtml(
                    summary.confidence === 'low'
                      ? '낮음'
                      : summary.confidence === 'medium'
                        ? '보통'
                        : summary.confidence === 'high'
                          ? '높음'
                          : summary.confidence
                  )}</p>`
                : ''
            }
          </div>
          <div class="score-cell">
            <span class="label">최고점수</span>
            <strong class="score-value">${
              summary.highest == null ? '—' : escapeHtml(summary.highest)
            }</strong>
          </div>
          <div class="score-cell">
            <span class="label">목표까지 Gap</span>
            <strong class="score-value">${
              summary.gap == null ? '—' : `${escapeHtml(summary.gap)}점`
            }</strong>
          </div>
        </div>
        ${
          summary.estimated == null
            ? `<div class="empty-inline">
                <p>아직 예상점수가 없습니다. Mini TEPS로 현재 상태를 확인해보세요.</p>
                <button type="button" class="btn btn-primary" data-nav="mock">모의고사로 이동</button>
              </div>`
            : ''
        }
      </section>

      ${
        scores.length >= 2
          ? `<section class="card">
              <h2>점수 변화</h2>
              <p class="score-flow">${scores.map((s) => escapeHtml(s)).join(' → ')}</p>
              ${renderSparkline(scores)}
              <p class="muted small">연습 결과 기반 학습용 추정치 흐름입니다.</p>
            </section>`
          : ''
      }

      <section class="card">
        <h2>영역별 성취도</h2>
        <div class="level-list">
          ${['listening', 'vocabulary', 'grammar', 'reading']
            .map((key) => {
              const avg = sectionMasteryAverage(map, key);
              const lv = levelFromMastery(avg);
              return `
            <div class="level-row">
              <span>${escapeHtml(key)}</span>
              <div class="bar thin"><div class="bar-fill" style="width:${Math.round(
                avg
              )}%"></div></div>
              <strong>${escapeHtml(lv.label)}</strong>
            </div>`;
            })
            .join('')}
        </div>
      </section>

      <section class="card">
        <h2>최근 모의고사 기록</h2>
        ${
          mocks.length === 0
            ? `<div class="empty-state">
                <p class="empty-title">아직 모의고사 기록이 없습니다.</p>
                <p class="muted">Mini TEPS를 풀면 현재 상태를 확인할 수 있습니다.</p>
              </div>`
            : `<ul class="record-list">${mocks
                .slice(0, 5)
                .map(
                  (m) => `<li>
                  <div><strong>${escapeHtml(m.title || m.type)}</strong>
                  <p class="muted">${escapeHtml(formatRelativeTime(m.createdAt))}
                  ${m.scoreConfidence ? ` · 신뢰도 ${escapeHtml(m.scoreConfidence)}` : ''}</p></div>
                  <strong>${m.score != null ? escapeHtml(m.score) : '데이터 부족'}</strong>
                </li>`
                )
                .join('')}</ul>`
        }
      </section>

      <section class="card">
        <h2>Knowledge Map</h2>
        ${renderKnowledgeMap(map)}
      </section>
    </section>
  `;
}

function renderSparkline(scores) {
  if (scores.length < 2) return '';
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const w = 280;
  const h = 64;
  const pts = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * w;
      const y = h - ((s - min) / (max - min || 1)) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="100%" height="64" aria-hidden="true">
    <polyline fill="none" stroke="currentColor" stroke-width="2.5" points="${pts}" />
  </svg>`;
}

function renderKnowledgeMap(map) {
  if (!map?.sections) {
    return `<div class="empty-state"><p class="empty-title">Knowledge Map을 불러오지 못했습니다.</p></div>`;
  }

  const sectionTitles = {
    grammar: 'Grammar',
    reading: 'Reading',
    listening: 'Listening',
    vocabulary: 'Vocabulary',
  };

  return Object.entries(map.sections)
    .map(([section, items]) => {
      const fallback = KNOWLEDGE_MAP_TEMPLATE[section] || [];
      const list = items?.length ? items : fallback.map((i) => ({ ...i, mastery: 0 }));
      return `
      <div class="knowledge-section">
        <h3>${escapeHtml(sectionTitles[section] || section)}</h3>
        <ul class="knowledge-list">
          ${list
            .map(
              (item) => `
            <li>
              <div class="knowledge-label">
                <span>${escapeHtml(item.label)}</span>
                <span class="muted">${escapeHtml(item.mastery || 0)}%</span>
              </div>
              <div class="bar thin" role="progressbar" aria-valuenow="${escapeHtml(
                item.mastery || 0
              )}" aria-valuemin="0" aria-valuemax="100">
                <div class="bar-fill" style="width:${escapeHtml(item.mastery || 0)}%"></div>
              </div>
            </li>`
            )
            .join('')}
        </ul>
      </div>`;
    })
    .join('');
}

export function bindMyTeps(root) {
  root.querySelector('[data-nav="mock"]')?.addEventListener('click', () => navigate('mock'));
}

export function renderNotFound() {
  return `
    <section class="page">
      <div class="empty-state card">
        <p class="empty-title">페이지를 찾을 수 없습니다.</p>
        <p class="muted">메뉴에서 다시 선택해 주세요.</p>
        <button type="button" class="btn btn-primary" data-nav="home">홈으로</button>
      </div>
    </section>
  `;
}

export function bindNotFound(root) {
  root.querySelector('[data-nav="home"]')?.addEventListener('click', () => navigate('home'));
}
