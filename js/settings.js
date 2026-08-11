/**
 * Settings + content bank + AI + backup (Phase 3)
 */

import {
  getState,
  updateSettings,
  createBackupPayload,
  restoreBackupPayload,
  resetAllUserData,
  importValidQuestions,
  getBankStats,
} from './state.js';
import { clearAiKeys } from './storage.js';
import { escapeHtml, downloadJson, readFileAsText } from './utils.js';
import { showToast } from './toast.js';
import { validateQuestionBank } from './validator.js';
import { testAiConnection, getAiStatus } from './ai/ai-service.js';
import { AI_CONFIG } from './ai/ai-config.js';
import { showConfirmModal, setLoading } from './ui/modal.js';
import { navigate } from './router.js';
import { difficultyLabel } from './content/packs.js';

export function renderSettings() {
  const state = getState();
  const { settings } = state;
  const ai = settings.ai || {};
  const stats = getBankStats();
  const packs = state.contentPacks || [];
  const provider = ai.provider || 'claude';
  const currentKey = ai.keys?.[provider] || ai.apiKey || '';

  return `
    <section class="page settings-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Preferences</p>
          <h1>⚙️ 설정</h1>
        </div>
        <span class="badge badge-soft">${escapeHtml(getAiStatus(settings).label)}</span>
      </header>

      <form id="settings-form" class="stack-lg">
        <section class="card">
          <h2>🎯 학습 설정</h2>
          <p class="muted small">앱의 주요 콘텐츠는 TEPS 327 목표에 최적화되어 있습니다.</p>
          <div class="form-grid">
            <label class="field">
              <span>목표점수</span>
              <input type="number" name="targetScore" min="1" max="990" value="${escapeHtml(
                settings.targetScore
              )}" />
              <span class="field-hint">기본값 327</span>
            </label>
            <label class="field">
              <span>하루 학습시간 (분)</span>
              <input type="number" name="dailyStudyMinutes" min="5" max="300" value="${escapeHtml(
                settings.dailyStudyMinutes
              )}" />
            </label>
            <fieldset class="field">
              <legend>해설 표시 방식</legend>
              <label class="radio-row"><input type="radio" name="explanationMode" value="immediate" ${
                settings.explanationMode === 'immediate' ? 'checked' : ''
              } /> 즉시</label>
              <label class="radio-row"><input type="radio" name="explanationMode" value="manual" ${
                settings.explanationMode === 'manual' ? 'checked' : ''
              } /> 직접 선택</label>
              <label class="radio-row"><input type="radio" name="explanationMode" value="after-set" ${
                settings.explanationMode === 'after-set' ? 'checked' : ''
              } /> 세트 종료 후</label>
            </fieldset>
          </div>
          <button type="submit" class="btn btn-primary">학습 설정 저장</button>
        </section>

        <section class="card">
          <h2>📦 문제은행</h2>
          <div class="stats-grid">
            <div><strong>총 ${stats.total}문항</strong></div>
            <div>327 핵심 ${stats.target327}문항</div>
          </div>
          <ul class="bullet-list">
            ${['listening', 'vocabulary', 'grammar', 'reading']
              .map((s) => {
                const n = stats.bySection[s] || 0;
                const note =
                  n < 5 && (s === 'reading' || s === 'listening')
                    ? ' · 추가 Pack이 필요합니다'
                    : '';
                return `<li>${escapeHtml(s)}: ${n}${note}</li>`;
              })
              .join('')}
          </ul>
          <p class="muted small">난도 · Level2 ${stats.byDifficulty[2] || 0} / Level3 ${
            stats.byDifficulty[3] || 0
          } / Level4 ${stats.byDifficulty[4] || 0}
          (${difficultyLabel(2)}/${difficultyLabel(3)}/${difficultyLabel(4)})</p>
          ${packs
            .map(
              (p) => `
            <article class="chip-card" style="margin-top:12px">
              <strong>${escapeHtml(p.title || p.id)}</strong>
              <p>${escapeHtml(p.questionCount || 0)}문항 · 상태: 사용 중</p>
            </article>`
            )
            .join('') || '<p class="muted">설치된 Pack이 아직 없습니다.</p>'}
        </section>

        <section class="card">
          <h2>✨ AI 설정</h2>
          <p class="callout">AI 기능은 선택사항입니다. AI를 연결하지 않아도 텝스크루의 기본 학습 기능을 모두 사용할 수 있습니다.</p>
          <p class="callout">API Key는 이 브라우저의 로컬 저장소(또는 이번 세션)에 저장됩니다. 공용 PC에서는 API Key를 저장하지 마세요.</p>
          <div class="form-grid">
            <label class="switch-row">
              <span>AI 기능</span>
              <input type="checkbox" name="aiEnabled" ${ai.enabled ? 'checked' : ''} />
              <span class="switch-text">${ai.enabled ? 'ON' : 'OFF'}</span>
            </label>
            <label class="field">
              <span>Provider</span>
              <select name="aiProvider" id="ai-provider">
                <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                <option value="claude" ${provider === 'claude' ? 'selected' : ''}>Claude</option>
                <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Gemini</option>
              </select>
            </label>
            <label class="field">
              <span>Model (비워두면 기본값)</span>
              <input type="text" name="aiModel" value="${escapeHtml(
                ai.model || ''
              )}" placeholder="${escapeHtml(
                AI_CONFIG.providers[provider]?.defaultModel || ''
              )}" />
            </label>
            <label class="field">
              <span>API Key</span>
              <div class="btn-row">
                <input type="password" name="aiApiKey" id="ai-api-key" value="${escapeHtml(
                  currentKey
                )}" autocomplete="off" style="flex:1" />
                <button type="button" class="btn btn-ghost" id="toggle-key">표시</button>
              </div>
            </label>
            <fieldset class="field">
              <legend>Key 저장 방식</legend>
              <label class="radio-row"><input type="radio" name="keyStorage" value="local" ${
                ai.keyStorage !== 'session' ? 'checked' : ''
              } /> 이 브라우저에 저장</label>
              <label class="radio-row"><input type="radio" name="keyStorage" value="session" ${
                ai.keyStorage === 'session' ? 'checked' : ''
              } /> 이번 세션에서만 사용</label>
            </fieldset>
          </div>
          <div class="btn-row wrap">
            <button type="button" class="btn btn-secondary" id="ai-save-btn">AI 설정 저장</button>
            <button type="button" class="btn btn-primary" id="ai-test-btn">연결 테스트</button>
            <button type="button" class="btn btn-danger" id="ai-clear-btn">API Key 삭제</button>
          </div>
          <p class="muted small" id="ai-test-result"></p>
        </section>
      </form>

      <section class="card">
        <h2>💾 데이터 관리</h2>
        <p class="muted small">학습기록과 설정을 백업합니다. 보안을 위해 AI API Key는 백업에 포함되지 않습니다.</p>
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" id="backup-export">학습 데이터 백업</button>
          <label class="btn btn-secondary file-btn">
            백업 불러오기
            <input type="file" id="backup-import" accept="application/json,.json" hidden />
          </label>
          <label class="btn btn-secondary file-btn">
            문제은행 가져오기
            <input type="file" id="bank-import" accept="application/json,.json" hidden />
          </label>
          <button type="button" class="btn btn-danger" id="data-reset">전체 데이터 초기화</button>
        </div>
        <div id="import-result" class="import-result" hidden></div>
      </section>

      <section class="card">
        <h2>❓ 도움말</h2>
        <ul class="bullet-list">
          <li>자세한 TEPS 이해·준비법·앱 순서는 <button type="button" class="linkish" data-nav="guide">가이드</button> 탭을 보세요.</li>
          <li>홈의 오늘 학습 → 문제풀이 → 오답복습 순으로 루틴을 만드세요.</li>
          <li>Mini TEPS로 위치를, 327 Target으로 약점을 보완하세요.</li>
          <li>AI·백업은 위 설정에서 관리합니다.</li>
        </ul>
      </section>
    </section>
  `;
}

export function bindSettings(root) {
  const form = root.querySelector('#settings-form');
  const switchText = root.querySelector('.switch-text');
  const aiEnabled = root.querySelector('[name="aiEnabled"]');
  const providerSelect = root.querySelector('#ai-provider');
  const keyInput = root.querySelector('#ai-api-key');

  aiEnabled?.addEventListener('change', () => {
    if (switchText) switchText.textContent = aiEnabled.checked ? 'ON' : 'OFF';
  });

  providerSelect?.addEventListener('change', () => {
    const settings = getState().settings;
    const p = providerSelect.value;
    const nextKey = settings.ai?.keys?.[p] || '';
    if (keyInput) keyInput.value = nextKey;
    showToast(`${p}용 API Key를 확인해 주세요.`, 'info');
  });

  root.querySelector('#toggle-key')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!keyInput) return;
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    btn.textContent = show ? '숨기기' : '표시';
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    updateSettings({
      targetScore: Number(fd.get('targetScore')) || 327,
      dailyStudyMinutes: Number(fd.get('dailyStudyMinutes')) || 30,
      explanationMode: String(fd.get('explanationMode') || 'manual'),
    });
    showToast('설정이 저장되었습니다.', 'success');
  });

  const collectAi = () => {
    const fd = new FormData(form);
    const provider = String(fd.get('aiProvider') || 'claude');
    const apiKey = String(fd.get('aiApiKey') || '');
    const current = getState().settings;
    const keys = { ...(current.ai?.keys || {}) };
    keys[provider] = apiKey;
    return {
      enabled: fd.get('aiEnabled') === 'on',
      provider,
      model: String(fd.get('aiModel') || ''),
      apiKey,
      keyStorage: String(fd.get('keyStorage') || 'local'),
      keys,
    };
  };

  root.querySelector('#ai-save-btn')?.addEventListener('click', () => {
    updateSettings({ ai: collectAi() });
    showToast('AI 설정이 저장되었습니다.', 'success');
  });

  root.querySelector('#ai-test-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const resultEl = root.querySelector('#ai-test-result');
    updateSettings({ ai: collectAi() });
    setLoading(btn, true, '테스트 중…');
    try {
      const res = await testAiConnection(getState().settings);
      if (resultEl) resultEl.textContent = res.message;
      showToast(res.message, 'success');
    } catch (err) {
      if (resultEl) resultEl.textContent = err.message;
      showToast(err.message || '연결 실패', 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  root.querySelector('#ai-clear-btn')?.addEventListener('click', async () => {
    const ok = await showConfirmModal({
      title: 'API Key 삭제',
      message: '저장된 AI API Key를 삭제할까요? 학습 데이터는 유지됩니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    const next = clearAiKeys();
    updateSettings(next);
    if (keyInput) keyInput.value = '';
    showToast('API Key를 삭제했습니다.', 'success');
  });

  root.querySelector('#backup-export')?.addEventListener('click', async () => {
    try {
      const payload = await createBackupPayload();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`tepscrew-backup-${stamp}.json`, payload);
      showToast('백업 파일을 저장했습니다.', 'success');
    } catch (err) {
      showToast(err.message || '백업에 실패했습니다.', 'error');
    }
  });

  root.querySelector('#backup-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const payload = JSON.parse(text);
      await restoreBackupPayload(payload);
      showToast('백업 파일을 불러왔습니다.', 'success');
      location.hash = '#settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      showToast(err.message || '파일 형식이 올바르지 않습니다.', 'error');
    } finally {
      e.target.value = '';
    }
  });

  root.querySelector('#bank-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const resultBox = root.querySelector('#import-result');
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = validateQuestionBank(text);
      resultBox.hidden = false;
      resultBox.innerHTML = `
        <h3>${escapeHtml(result.packName)}</h3>
        <p>${result.total}문항 발견 · 정상 ${result.valid} · 오류 ${result.invalid}</p>
        ${
          result.errors.length
            ? `<ul class="error-list">${result.errors
                .slice(0, 12)
                .map(
                  (err) =>
                    `<li><code>${escapeHtml(err.id)}</code> — ${escapeHtml(err.message)}</li>`
                )
                .join('')}</ul>`
            : '<p class="success-text">모든 문항이 유효합니다.</p>'
        }
        <div class="btn-row">
          ${
            result.valid
              ? `<button type="button" class="btn btn-primary" id="import-valid-only">정상 문항만 추가 (${result.valid})</button>`
              : ''
          }
        </div>
      `;

      resultBox.querySelector('#import-valid-only')?.addEventListener('click', async () => {
        const res = await importValidQuestions(result.validQuestions, {
          source: 'imported',
        });
        showToast(
          `문제 ${res.added}개가 추가되었습니다.${
            res.conflicts ? ` (충돌 ${res.conflicts}건 건너뜀)` : ''
          }`,
          'success'
        );
      });
    } catch (err) {
      showToast(err.message || '파일 형식이 올바르지 않습니다.', 'error');
    } finally {
      e.target.value = '';
    }
  });

  root.querySelector('#data-reset')?.addEventListener('click', async () => {
    const ok = await showConfirmModal({
      title: '전체 데이터 초기화',
      message: '모든 학습 기록, 설정, 오답, 모의고사 데이터가 삭제됩니다. 계속할까요?',
      confirmLabel: '초기화',
      danger: true,
    });
    if (!ok) return;
    try {
      await resetAllUserData();
      showToast('전체 데이터가 초기화되었습니다.', 'success');
      location.hash = '#home';
    } catch (err) {
      showToast(err.message || '초기화에 실패했습니다.', 'error');
    }
  });

  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.getAttribute('data-nav') || 'home'));
  });
}
