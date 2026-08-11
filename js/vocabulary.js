/**
 * Vocabulary learning UI — skill browser + SRS + custom wordbook
 */

import { getState, saveVocabResult, getVocabLists } from './state.js';
import { escapeHtml } from './utils.js';
import { navigate } from './router.js';
import { showToast } from './toast.js';
import { groupQuestionsBySkill } from './content/packs.js';
import { canonicalizeSkill, SKILL_TAXONOMY } from './content/skill-taxonomy.js';
import { getAiStatus, askAiTutor } from './ai/ai-service.js';
import { setLoading } from './ui/modal.js';

function listForTab(tab, lists) {
  if (tab === 'new') return lists.new.map((w) => ({ word: w, mastery: null }));
  if (tab === 'weak') return lists.weak;
  return lists.review.length
    ? lists.review
    : lists.new.slice(0, 5).map((w) => ({ word: w, mastery: null }));
}

function skillGroupsFromBank(questionBank) {
  const raw = groupQuestionsBySkill(questionBank || [], 'vocabulary');
  const map = {};
  Object.entries(raw).forEach(([skill, qs]) => {
    const id = canonicalizeSkill('vocabulary', skill) || skill;
    if (!map[id]) map[id] = [];
    map[id].push(...qs);
  });
  const labels = Object.fromEntries(
    (SKILL_TAXONOMY.vocabulary || []).map((s) => [s.id, s.label])
  );
  return Object.entries(map)
    .map(([id, qs]) => ({
      id,
      label: labels[id] || id,
      count: qs.length,
    }))
    .sort((a, b) => b.count - a.count);
}

export function renderVocabulary(params = {}) {
  const tab = params.tab || 'skills';
  const lists = getVocabLists();
  const state = getState();
  const skills = skillGroupsFromBank(state.questionBank);
  const custom = Object.values(state.customVocabulary || {}).sort((a, b) =>
    (a.word || '').localeCompare(b.word || '')
  );
  const detailId = params.wordId || '';
  const detail = detailId ? state.customVocabulary?.[detailId] : null;

  if (tab === 'detail' && detail) {
    return renderWordDetail(detail);
  }

  const queue = ['review', 'new', 'weak'].includes(tab) ? listForTab(tab, lists) : [];

  return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="teps">← TEPS 학습</button>
        <div>
          <p class="eyebrow">Vocabulary</p>
          <h1>📗 단어 학습</h1>
          <p class="muted page-lead">문제은행 Skill 기준으로 분류합니다. 공식 TEPS 기출이 아닙니다.</p>
        </div>
      </header>

      <div class="segmented" role="tablist" aria-label="단어 학습 모드">
        <button type="button" class="seg-btn ${
          tab === 'skills' ? 'is-active' : ''
        }" data-vocab-tab="skills">🗂️ 유형</button>
        <button type="button" class="seg-btn ${
          tab === 'review' ? 'is-active' : ''
        }" data-vocab-tab="review">🔁 오늘 복습 (${lists.review.length})</button>
        <button type="button" class="seg-btn ${
          tab === 'new' ? 'is-active' : ''
        }" data-vocab-tab="new">✨ 새 단어 (${lists.new.length})</button>
        <button type="button" class="seg-btn ${
          tab === 'weak' ? 'is-active' : ''
        }" data-vocab-tab="weak">⚠️ 취약 (${lists.weak.length})</button>
        <button type="button" class="seg-btn ${
          tab === 'mine' ? 'is-active' : ''
        }" data-vocab-tab="mine">📒 내 단어장 (${custom.length})</button>
      </div>

      ${
        tab === 'skills'
          ? `<section class="card">
              <h2>Vocabulary Skill</h2>
              ${
                skills.length
                  ? `<ul class="knowledge-list">
                      ${skills
                        .map(
                          (s) => `
                        <li>
                          <div class="knowledge-label">
                            <span>${escapeHtml(s.label)}</span>
                            <span class="muted">${s.count}문항</span>
                          </div>
                          <button type="button" class="btn btn-ghost btn-mini" data-practice-skill="${escapeHtml(
                            s.id
                          )}">연습 시작</button>
                        </li>`
                        )
                        .join('')}
                    </ul>`
                  : '<p class="muted">Vocabulary 문제가 아직 없습니다.</p>'
              }
            </section>`
          : ''
      }

      ${
        tab === 'mine'
          ? `<section class="card">
              <h2>내 단어장</h2>
              ${
                custom.length
                  ? `<ul class="knowledge-list">
                      ${custom
                        .map(
                          (w) => `
                        <li>
                          <div class="knowledge-label">
                            <span><strong>${escapeHtml(w.word)}</strong>${
                              w.meaning ? ` — ${escapeHtml(w.meaning)}` : ''
                            }</span>
                          </div>
                          <button type="button" class="btn btn-ghost btn-mini" data-word-detail="${escapeHtml(
                            w.id
                          )}">상세</button>
                        </li>`
                        )
                        .join('')}
                    </ul>`
                  : '<p class="muted">문제 해설에서 「내 단어장에 추가」로 단어를 모을 수 있습니다.</p>'
              }
            </section>`
          : ''
      }

      ${
        ['review', 'new', 'weak'].includes(tab)
          ? `<div id="vocab-stage" class="vocab-stage" data-tab="${escapeHtml(tab)}">
              ${
                queue.length
                  ? renderVocabCard(queue[0].word, 0, queue.length, queue[0].mastery)
                  : renderEmpty(tab)
              }
            </div>`
          : ''
      }
    </section>
  `;
}

function renderWordDetail(word) {
  const aiOn = getAiStatus(getState().settings).on;
  const sources = word.sourceQuestionIds || [];
  return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-vocab-tab="mine">← 내 단어장</button>
        <div>
          <p class="eyebrow">Word Detail</p>
          <h1>${escapeHtml(word.word)}</h1>
          <p class="muted">${escapeHtml(word.meaning || '뜻이 아직 없습니다.')}</p>
        </div>
      </header>
      <section class="card">
        <p><strong>학습 상태</strong> · ${escapeHtml(word.status || 'saved')}</p>
        ${
          sources.length
            ? `<p class="muted small">출처 문제: ${sources.map((id) => escapeHtml(id)).join(', ')}</p>`
            : ''
        }
        ${
          (word.examples || []).length
            ? `<h3>예문</h3><ul class="example-list">${(word.examples || [])
                .map((ex) => `<li>${escapeHtml(ex)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          (word.collocations || []).length
            ? `<h3>함께 외울 표현</h3><ul class="vocab-mini-list">${(word.collocations || [])
                .map((c) => `<li>${escapeHtml(c)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          aiOn
            ? `<button type="button" class="btn btn-primary" id="ai-word-explain" data-word="${escapeHtml(
                word.word
              )}" data-meaning="${escapeHtml(word.meaning || '')}">AI에게 설명 듣기</button>
               <div id="ai-word-result" class="ai-thread" hidden></div>`
            : '<p class="muted small">AI를 연결하면 이 표현에 대한 추가 설명을 들을 수 있습니다.</p>'
        }
      </section>
    </section>`;
}

function renderEmpty(tab) {
  const msg = {
    review: ['오늘 복습할 단어가 없습니다.', '새 단어를 학습하거나 나중에 다시 확인하세요.'],
    new: ['모든 단어를 한 번 이상 학습했습니다.', '취약 단어나 복습 탭을 확인해 보세요.'],
    weak: ['취약 단어가 없습니다.', '「몰라요」「헷갈려요」결과가 쌓이면 이곳에 표시됩니다.'],
  }[tab] || ['표시할 단어가 없습니다.', ''];

  return `<div class="empty-state card">
    <p class="empty-title">${msg[0]}</p>
    <p class="muted">${msg[1]}</p>
  </div>`;
}

function renderVocabCard(word, index, total, mastery) {
  return `
    <article class="card vocab-card" data-word-id="${escapeHtml(word.id)}" data-index="${index}">
      <div class="card-header-row">
        <span class="muted">${index + 1} / ${total}</span>
        ${
          mastery
            ? `<span class="status-pill">${escapeHtml(mastery.status || 'learning')} · fam ${escapeHtml(
                mastery.familiarity || 0
              )}</span>`
            : '<span class="status-pill">신규</span>'
        }
      </div>
      <h2 class="vocab-word">${escapeHtml(word.word)}</h2>
      <p class="vocab-meaning">${escapeHtml(word.meaning)}</p>
      <ul class="example-list">
        ${(word.examples || []).map((ex) => `<li>${escapeHtml(ex)}</li>`).join('')}
      </ul>
      <div class="vocab-actions" role="group" aria-label="학습 결과">
        <button type="button" class="btn btn-success" data-vocab-result="known">알아요</button>
        <button type="button" class="btn btn-warning" data-vocab-result="unsure">헷갈려요</button>
        <button type="button" class="btn btn-danger-soft" data-vocab-result="unknown">몰라요</button>
      </div>
    </article>
  `;
}

export function bindVocabulary(root, params = {}) {
  const tab = params.tab || 'skills';

  root.querySelector('[data-nav="teps"]')?.addEventListener('click', () => navigate('teps'));

  root.querySelectorAll('[data-vocab-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('vocabulary', { tab: btn.getAttribute('data-vocab-tab') });
    });
  });

  root.querySelectorAll('[data-practice-skill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('practice-quiz', {
        section: 'vocabulary',
        count: '5',
        mode: 'practice',
      });
    });
  });

  root.querySelectorAll('[data-word-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('vocabulary', {
        tab: 'detail',
        wordId: btn.getAttribute('data-word-detail'),
      });
    });
  });

  root.querySelector('#ai-word-explain')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const word = btn.getAttribute('data-word');
    const meaning = btn.getAttribute('data-meaning') || '';
    const box = root.querySelector('#ai-word-result');
    setLoading(btn, true, '설명 중…');
    try {
      const res = await askAiTutor({
        settings: getState().settings,
        context: {
          section: 'vocabulary',
          question: `Explain the expression "${word}"${meaning ? ` (${meaning})` : ''} for a TEPS 327 adult learner.`,
          answer: meaning,
          explanation: '',
          targetScore: getState().settings?.targetScore || 327,
        },
        userMessage: `"${word}"를 TEPS 학습자에게 짧고 명확하게 설명해 주세요. 예문 1~2개 포함.`,
        action: 'word-explain',
        useCache: true,
        questionId: `vocab:${word}`,
      });
      if (box) {
        box.hidden = false;
        box.innerHTML = `<div class="ai-msg ai-msg-assistant"><strong>Tutor</strong><p></p></div>`;
        box.querySelector('p').textContent = res.text;
      }
    } catch (err) {
      showToast(err.message || 'AI 설명에 실패했습니다.', 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  if (!['review', 'new', 'weak'].includes(tab)) return;

  const lists = getVocabLists();
  let queue = listForTab(tab, lists);
  let index = 0;
  const stage = root.querySelector('#vocab-stage');
  if (!stage) return;

  const bindCard = () => {
    stage.querySelectorAll('[data-vocab-result]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const result = btn.getAttribute('data-vocab-result');
        const card = stage.querySelector('.vocab-card');
        const wordId = card?.getAttribute('data-word-id');
        const item = queue[index];
        if (!item?.word) return;
        try {
          await saveVocabResult(item.word.id || wordId, result);
          index += 1;
          if (index >= queue.length) {
            stage.innerHTML = `<div class="empty-state card">
              <p class="empty-title">이 세션의 단어를 모두 확인했습니다.</p>
              <button type="button" class="btn btn-secondary" data-vocab-tab="${escapeHtml(
                tab
              )}">목록으로</button>
            </div>`;
            stage.querySelector('[data-vocab-tab]')?.addEventListener('click', () => {
              navigate('vocabulary', { tab });
            });
            showToast('단어 학습을 기록했습니다.', 'success');
            return;
          }
          const next = queue[index];
          stage.innerHTML = renderVocabCard(next.word, index, queue.length, next.mastery);
          bindCard();
        } catch (err) {
          showToast(err.message || '저장 실패', 'error');
        }
      });
    });
  };

  bindCard();
}
