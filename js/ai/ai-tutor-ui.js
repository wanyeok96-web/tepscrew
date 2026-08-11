/**
 * AI Tutor panel UI helpers
 */

import { getState, addCustomVocabularyEntry } from '../state.js';
import {
  getAiStatus,
  buildQuestionTutorContext,
  askAiTutor,
  generateSimilarQuestion,
  generateMiniLesson,
} from './ai-service.js';
import { AI_QUICK_ACTIONS } from './ai-config.js';
import { escapeHtml } from '../utils.js';
import { showToast } from '../toast.js';
import { setLoading } from '../ui/modal.js';
import { navigate } from '../router.js';

export function renderAiTutorPanel(question) {
  const status = getAiStatus(getState().settings);
  if (!status.on) {
    return `
      <div class="ai-panel ai-off card-soft">
        <p class="muted">AI를 연결하면 개인 맞춤 설명을 받을 수 있습니다. (설정 → AI)</p>
      </div>`;
  }

  return `
    <div class="ai-panel card-soft" id="ai-tutor-panel" data-qid="${escapeHtml(question.id)}">
      <div class="card-header-row">
        <h3>✨ AI Tutor · ${escapeHtml(status.label.replace('AI · ', ''))}</h3>
        <button type="button" class="btn btn-primary" id="ai-tutor-open">✨ AI Tutor</button>
      </div>
      <div class="ai-quick" id="ai-quick-actions" hidden>
        ${AI_QUICK_ACTIONS.map(
          (a) =>
            `<button type="button" class="chip-btn" data-ai-action="${escapeHtml(a.id)}">${escapeHtml(
              a.label
            )}</button>`
        ).join('')}
      </div>
      <div class="ai-thread" id="ai-thread" hidden></div>
      <form id="ai-chat-form" class="ai-chat-form" hidden>
        <label class="field">
          <span class="sr-only">AI에게 질문</span>
          <input type="text" name="message" placeholder="예: 왜 B는 안 돼?" autocomplete="off" />
        </label>
        <button type="submit" class="btn btn-secondary">보내기</button>
      </form>
      <p class="muted small" id="ai-status-line"></p>
    </div>`;
}

export function bindAiTutorPanel(root, { question, attempt }) {
  const panel = root.querySelector('#ai-tutor-panel');
  if (!panel) return;

  const settings = getState().settings;
  const context = buildQuestionTutorContext({
    question,
    attempt,
    knowledgeMap: getState().knowledgeMap,
    targetScore: settings.targetScore || 327,
  });

  const history = [];
  const thread = panel.querySelector('#ai-thread');
  const form = panel.querySelector('#ai-chat-form');
  const quick = panel.querySelector('#ai-quick-actions');
  const statusLine = panel.querySelector('#ai-status-line');

  const append = (role, text) => {
    thread.hidden = false;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    div.innerHTML = `<strong>${role === 'user' ? '나' : 'Tutor'}</strong><p></p>`;
    div.querySelector('p').textContent = text;
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
  };

  const run = async (userMessage, action = 'chat', btn = null) => {
    setLoading(btn, true, '생성 중…');
    statusLine.textContent = 'AI 응답을 기다리는 중…';
    try {
      if (action === 'similar') {
        const q = await generateSimilarQuestion({ settings, context });
        statusLine.textContent = '';
        showToast('AI 생성 연습문제를 준비했습니다.', 'success');
        // Launch temporary practice with single AI question
        sessionStorage.setItem(
          'tepscrew:aiPracticeQuestion',
          JSON.stringify(q)
        );
        navigate('practice-quiz', { mode: 'practice', aiPractice: '1', count: '1' });
        return;
      }
      if (action === 'minilesson') {
        const res = await generateMiniLesson({ settings, context });
        append('assistant', res.text);
        history.push({ role: 'assistant', content: res.text });
        statusLine.textContent = res.cached ? '캐시된 설명' : '';
        return;
      }

      history.push({ role: 'user', content: userMessage });
      append('user', userMessage);
      const res = await askAiTutor({
        settings,
        context,
        userMessage,
        history: history.slice(0, -1),
        action,
        useCache: action !== 'chat',
        questionId: question.id,
      });
      history.push({ role: 'assistant', content: res.text });
      append('assistant', res.text);
      statusLine.textContent = res.cached ? '캐시된 설명' : '';
    } catch (err) {
      statusLine.textContent = '';
      showToast(err.message || 'AI 요청에 실패했습니다.', 'error');
    } finally {
      setLoading(btn, false);
    }
  };

  panel.querySelector('#ai-tutor-open')?.addEventListener('click', async (e) => {
    quick.hidden = false;
    form.hidden = false;
    const btn = e.currentTarget;
    await run(
      '이 문제를 학습자가 이해할 수 있게 설명해 주세요. 정답 반복만 하지 말고, 오답 선택 이유와 풀이 사고를 중심으로 설명해 주세요.',
      'explain',
      btn
    );
  });

  quick?.querySelectorAll('[data-ai-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-ai-action');
      const action = AI_QUICK_ACTIONS.find((a) => a.id === id);
      if (!action) return;
      if (action.prompt === 'SIMILAR_QUESTION') {
        await run('', 'similar', btn);
        return;
      }
      if (action.prompt === 'MINI_LESSON') {
        await run('', 'minilesson', btn);
        return;
      }
      await run(action.prompt, id, btn);
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('[name="message"]');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    await run(msg, 'chat', form.querySelector('button'));
  });
}

export async function offerAddVocabFromQuestion(question) {
  const list = [];
  (question.vocabulary || []).forEach((v) => {
    if (typeof v === 'string') list.push({ word: v, meaning: '' });
    else if (v?.word) list.push({ word: v.word, meaning: v.meaning || '' });
  });
  (question.collocations || []).forEach((c) => {
    if (typeof c === 'string') list.push({ word: c, meaning: '' });
  });
  return list;
}

export async function addVocabCandidate(word, meaning, questionId) {
  await addCustomVocabularyEntry({
    word,
    meaning,
    sourceQuestionIds: questionId ? [questionId] : [],
  });
  showToast(`「${word}」를 내 단어장에 추가했습니다.`, 'success');
}
