/**
 * Home dashboard — learning-first visual composition
 */

import { getState, getTodayPlan, getScoreSummary, updateSettings } from './state.js';
import { escapeHtml, formatRelativeTime } from './utils.js';
import { navigate } from './router.js';
import { getAiStatus, generateAiStudyComment } from './ai/ai-service.js';
import { showToast } from './toast.js';
import { setLoading } from './ui/modal.js';

function renderProgressBar(estimated, target) {
  if (estimated == null) {
    return `
      <div class="progress-track empty" role="img" aria-label="예상점수 없음">
        <div class="progress-markers">
          <span>0</span>
          <span class="marker-target">${escapeHtml(target)}</span>
        </div>
      </div>
    `;
  }

  const pct = Math.min(100, Math.round((estimated / target) * 100));
  return `
    <div class="progress-track" role="progressbar" aria-valuenow="${estimated}" aria-valuemin="0" aria-valuemax="${target}" aria-label="목표 진행률">
      <div class="progress-fill" style="width:${pct}%"></div>
      <div class="progress-markers">
        <span>0</span>
        <span class="current-mark" style="left:${pct}%">${estimated}</span>
        <span class="marker-target">${escapeHtml(target)}</span>
      </div>
    </div>
  `;
}

function lastContinueItem(records) {
  return records.find(
    (r) =>
      r.recordType === 'session' ||
      r.type === 'foundation' ||
      r.mode === 'practice' ||
      r.mode === 'target327'
  );
}

export function renderDashboard() {
  const state = getState();
  const summary = getScoreSummary();
  const plan = getTodayPlan();
  const records = state.learningRecords.slice(0, 8);
  const hasScore = summary.estimated != null;
  const dueReview = (state.reviewQueue || []).filter(
    (r) => r.status !== 'mastered' && (!r.nextReview || new Date(r.nextReview) <= new Date())
  ).length;
  const cont = lastContinueItem(records);
  const showWelcome = !state.settings?.welcomeSeen;
  const ai = getAiStatus(state.settings);

  const confLabel =
    summary.confidence === 'low'
      ? '낮음'
      : summary.confidence === 'medium'
        ? '보통'
        : summary.confidence === 'high'
          ? '높음'
          : null;

  if (showWelcome) {
    return `
      <section class="page home-page home-welcome">
        <section class="home-hero" aria-labelledby="welcome-brand">
          <div class="home-hero-glow" aria-hidden="true"></div>
          <p class="home-kicker">🎯 TEPS 327 Target Learning</p>
          <p class="home-brand-mark" aria-hidden="true">327</p>
          <h1 id="welcome-brand" class="home-brand">TEPS Crew</h1>
          <p class="home-brand-ko">텝스크루</p>
          <p class="home-lede">
            영어 공백이 길어도 괜찮습니다.<br />
            기초부터 쌓아 <strong>TEPS ${escapeHtml(summary.target)}점</strong>까지 같이 갑니다.
          </p>
          <div class="home-cta-row">
            <button type="button" class="btn btn-primary btn-lg" data-nav="diagnosis">🚀 빠른 진단 시작</button>
            <button type="button" class="btn btn-secondary btn-lg" id="welcome-dismiss">👀 먼저 둘러보기</button>
          </div>
          <p class="home-footnote">🔐 로그인 없음 · ✨ AI는 선택 · ✅ 지금 바로 학습 가능</p>
        </section>
      </section>
    `;
  }

  return `
    <section class="page home-page home-ready">
      <section class="home-status" aria-labelledby="goal-heading">
        <div class="home-status-top">
          <div>
            <p class="home-kicker">☀️ 오늘의 TEPS Crew</p>
            <h1 class="home-title-inline">
              <span class="home-title-brand">TEPS Crew</span>
              <span class="home-title-sep" aria-hidden="true">·</span>
              <span id="goal-heading">🎯 ${escapeHtml(summary.target)} 목표</span>
            </h1>
            <p class="muted home-sub">학습용 추정으로 위치만 확인합니다 · ${escapeHtml(ai.label)}</p>
          </div>
          <div class="stage-badge" title="${escapeHtml(summary.stage.description)}">
            <span class="stage-label">📍 ${escapeHtml(summary.stage.label)}</span>
            <span class="stage-desc">${escapeHtml(summary.stage.description)}</span>
          </div>
        </div>

        <div class="home-scoreboard">
          <div class="home-score-main">
            <span class="label">📈 학습용 예상점수</span>
            ${
              hasScore
                ? `<strong class="score-value display-num">${escapeHtml(summary.estimated)}</strong>
                   ${
                     confLabel
                       ? `<p class="muted small">신뢰도 ${escapeHtml(confLabel)}</p>`
                       : ''
                   }`
                : `<strong class="score-value empty-score display-num">—</strong>
                   <p class="empty-hint">아직 기록이 없습니다</p>`
            }
          </div>
          <div class="home-score-side">
            <div>
              <span class="label">🎯 Gap</span>
              <strong class="score-value">${hasScore ? `${escapeHtml(summary.gap)}` : '—'}</strong>
            </div>
            <div>
              <span class="label">🔁 오늘 복습</span>
              <strong class="score-value">${dueReview}</strong>
            </div>
          </div>
        </div>

        ${renderProgressBar(summary.estimated, summary.target)}

        ${
          !hasScore
            ? `<div class="home-inline-cta">
                <p>첫 진단으로 시작점을 정하면 Today 추천이 열립니다.</p>
                <div class="home-cta-row">
                  <button type="button" class="btn btn-primary" data-nav="diagnosis">🚀 빠른 진단</button>
                  <button type="button" class="btn btn-secondary" data-nav="practice">✏️ 문제훈련</button>
                </div>
              </div>`
            : ''
        }
      </section>

      ${
        cont
          ? `<section class="home-continue">
              <div>
                <p class="home-kicker">▶️ 이어서 학습하기</p>
                <h2>${escapeHtml(cont.title || cont.mode || cont.type)}</h2>
                <p class="muted">${escapeHtml(formatRelativeTime(cont.createdAt))}${
                  cont.detail ? ` · ${escapeHtml(cont.detail)}` : ''
                }</p>
              </div>
              <button type="button" class="btn btn-primary" data-nav="${
                cont.type === 'foundation' || cont.mode === 'lesson' ? 'foundation' : 'practice'
              }">이어하기</button>
            </section>`
          : ''
      }

      <section class="home-today" aria-labelledby="today-heading">
        <div class="home-today-head">
          <div>
            <h2 id="today-heading">📅 오늘 무엇을 할까</h2>
            <p class="muted">약 ${escapeHtml(plan.totalMinutes)}분 · 규칙 기반 추천</p>
          </div>
        </div>
        <ol class="home-plan-list">
          ${plan.items
            .map(
              (item, idx) => `
            <li>
              <button type="button" class="home-plan-item" data-nav="${escapeHtml(item.route)}"
                ${
                  item.params
                    ? `data-params="${encodeURIComponent(JSON.stringify(item.params))}"`
                    : ''
                }>
                <span class="home-plan-index" aria-hidden="true">${idx + 1}</span>
                <span class="home-plan-body">
                  <span class="plan-title">${escapeHtml(item.title)}</span>
                  <span class="plan-detail">${escapeHtml(item.detail)}</span>
                  ${
                    item.reason
                      ? `<span class="plan-reason">${escapeHtml(item.reason)}</span>`
                      : ''
                  }
                </span>
                <span class="plan-time">약 ${escapeHtml(item.minutes)}분</span>
              </button>
            </li>`
            )
            .join('')}
        </ol>
        <button type="button" class="btn btn-primary btn-lg btn-block home-today-start"
          data-nav="${escapeHtml(plan.items[0]?.route || 'foundation')}"
          ${
            plan.items[0]?.params
              ? `data-params="${encodeURIComponent(JSON.stringify(plan.items[0].params))}"`
              : ''
          }>🚀 오늘 학습 시작</button>
        ${
          ai.on
            ? `<button type="button" class="btn btn-ghost btn-block" id="ai-home-comment">✨ AI 학습 분석 보기</button>
               <p class="muted small ai-home-note" id="ai-home-result"></p>`
            : ''
        }
      </section>

      <section class="home-launch">
        <h2 class="sr-only">빠른 시작</h2>
        <div class="home-launch-grid">
          <button type="button" class="home-launch-item" data-nav="vocabulary" data-params="${encodeURIComponent(
            JSON.stringify({ tab: 'review' })
          )}">
            <span class="home-launch-label">📗 단어</span>
            <span class="home-launch-desc">5분 복습</span>
          </button>
          <button type="button" class="home-launch-item" data-nav="practice-quiz" data-params="${encodeURIComponent(
            JSON.stringify({ count: '10', mode: 'practice', section: 'vocabulary' })
          )}">
            <span class="home-launch-label">✏️ 연습</span>
            <span class="home-launch-desc">어휘·문법</span>
          </button>
          <button type="button" class="home-launch-item" data-nav="review">
            <span class="home-launch-label">🔁 오답</span>
            <span class="home-launch-desc">${dueReview}건</span>
          </button>
          <button type="button" class="home-launch-item home-launch-accent" data-nav="target-preview">
            <span class="home-launch-label">🎯 327</span>
            <span class="home-launch-desc">Target</span>
          </button>
        </div>
      </section>

      <section class="home-recent">
        <h2>🕘 최근 학습</h2>
        ${
          records.length === 0
            ? `<p class="muted">아직 기록이 없습니다. 오늘 학습을 시작해 보세요.</p>`
            : `<ul class="record-list">
                ${records
                  .slice(0, 5)
                  .map(
                    (r) => `
                  <li>
                    <div>
                      <strong>${escapeHtml(r.title || r.type || r.mode)}</strong>
                      <p class="muted">${escapeHtml(r.detail || r.recordType || '')}</p>
                    </div>
                    <time datetime="${escapeHtml(r.createdAt)}">${escapeHtml(
                      formatRelativeTime(r.createdAt)
                    )}</time>
                  </li>`
                  )
                  .join('')}
              </ul>`
        }
      </section>
    </section>
  `;
}

export function bindDashboard(root) {
  root.querySelector('#welcome-dismiss')?.addEventListener('click', () => {
    updateSettings({ welcomeSeen: true });
    navigate('home');
  });

  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      const page = el.getAttribute('data-nav');
      let params = {};
      if (el.dataset.params) {
        try {
          params = JSON.parse(decodeURIComponent(el.dataset.params));
        } catch {
          params = {};
        }
      }
      if (page === 'diagnosis') updateSettings({ welcomeSeen: true });
      navigate(page, params);
    });
  });

  root.querySelector('#ai-home-comment')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const out = root.querySelector('#ai-home-result');
    const state = getState();
    const summary = {
      targetScore: state.settings.targetScore,
      estimatedScore: state.profile.estimatedScore,
      weakSkills: (
        state.knowledgeMap?.sections
          ? Object.entries(state.knowledgeMap.sections).flatMap(([section, items]) =>
              items
                .filter((i) => (i.mastery || 0) < 40)
                .map((i) => ({ section, skill: i.id, mastery: i.mastery }))
            )
          : []
      ).slice(0, 8),
      reviewDue: state.reviewQueue.filter((r) => r.status !== 'mastered').length,
      recentAccuracy: state.learningRecords
        .filter((r) => r.recordType === 'session')
        .slice(0, 3)
        .map((r) => ({ mode: r.mode, accuracy: r.accuracy })),
    };
    setLoading(btn, true, '분석 중…');
    try {
      const res = await generateAiStudyComment({ settings: state.settings, summary });
      if (out) out.textContent = res.text;
    } catch (err) {
      showToast(err.message || 'AI 분석 실패', 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}
