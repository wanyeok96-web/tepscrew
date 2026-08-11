/**
 * Unified AI service — optional enhancement layer
 */

import { AI_CONFIG, AI_TUTOR_SYSTEM } from './ai-config.js';
import { generateText as openaiGenerate } from './providers/openai.js';
import { generateText as claudeGenerate } from './providers/anthropic.js';
import { generateText as geminiGenerate } from './providers/gemini.js';
import { getItem, putItem } from '../db.js';
import { uid } from '../utils.js';
import { validateQuestion } from '../validator.js';

function resolveAiSettings(settings) {
  const ai = settings?.ai || {};
  const provider = ai.provider || AI_CONFIG.defaultProvider;
  const cfg = AI_CONFIG.providers[provider] || AI_CONFIG.providers.claude;
  const keys = ai.keys || {};
  const apiKey = keys[provider] || ai.apiKey || '';
  const model = ai.model || cfg.defaultModel;
  return {
    enabled: !!ai.enabled,
    provider,
    apiKey,
    model,
    cfg,
  };
}

export function getAiStatus(settings) {
  const resolved = resolveAiSettings(settings);
  if (!resolved.enabled) return { label: 'AI OFF', on: false, provider: null };
  return {
    label: `AI · ${resolved.cfg.label}`,
    on: true,
    provider: resolved.provider,
  };
}

export async function testAiConnection(settings) {
  const { enabled, provider, apiKey, model, cfg } = resolveAiSettings(settings);
  if (!enabled) throw new Error('AI 기능이 OFF 상태입니다.');
  if (!apiKey) throw new Error('API Key를 입력해 주세요.');

  try {
    const result = await callProvider({
      provider,
      apiKey,
      model,
      system: 'You are a connection test assistant.',
      messages: [{ role: 'user', content: cfg.testPrompt }],
      temperature: 0,
      maxTokens: 32,
    });
    return {
      ok: true,
      message: `${cfg.label} 연결에 성공했습니다.`,
      sample: result.text.slice(0, 80),
    };
  } catch (err) {
    if (isCorsError(err)) {
      throw new Error(
        `${cfg.label} 연결에 실패했습니다. 브라우저 CORS 또는 네트워크 제한일 수 있습니다. API Key와 Provider 설정을 확인해 주세요.`
      );
    }
    throw new Error(
      `${cfg.label} 연결에 실패했습니다. API Key와 Provider 설정을 확인해 주세요. (${err.message})`
    );
  }
}

function isCorsError(err) {
  const msg = String(err?.message || err || '');
  return (
    err?.name === 'TypeError' ||
    /Failed to fetch|NetworkError|CORS|Load failed/i.test(msg)
  );
}

async function callProvider(opts) {
  const map = {
    openai: openaiGenerate,
    claude: claudeGenerate,
    gemini: geminiGenerate,
  };
  const fn = map[opts.provider];
  if (!fn) throw new Error('지원하지 않는 Provider입니다.');
  return fn(opts);
}

function cacheKey({ provider, model, questionId, action }) {
  return `ai:${provider}:${model}:${questionId || 'na'}:${action}`;
}

async function readCache(key) {
  try {
    const item = await getItem('aiCache', key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) return null;
    return item.response;
  } catch {
    return null;
  }
}

async function writeCache(key, response) {
  try {
    await putItem('aiCache', {
      id: key,
      response,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + AI_CONFIG.cacheTtlMs,
    });
  } catch {
    /* ignore cache failures */
  }
}

export function buildQuestionTutorContext({ question, attempt, knowledgeMap, targetScore = 327 }) {
  const skills = question?.skills || [];
  const relatedMastery = [];
  skills.forEach((sk) => {
    const section = question.section;
    const item = knowledgeMap?.sections?.[section]?.find((x) => x.id === sk || x.label === sk);
    if (item) relatedMastery.push({ skill: item.id, mastery: item.mastery });
  });

  return {
    targetScore,
    question: {
      id: question.id,
      section: question.section,
      type: question.type,
      difficulty: question.difficulty,
      targetScoreBand: question.targetScoreBand,
      skills,
      passage: question.passage || question.transcript || '',
      question: question.question,
      choices: question.choices,
      answer: question.answer,
      explanation: question.explanation,
      vocabulary: question.vocabulary,
      collocations: question.collocations,
      synonyms: question.synonyms,
      confusableWords: question.confusableWords,
      source: question.source,
    },
    learner: {
      selectedAnswer: attempt?.selectedAnswer ?? null,
      correct: attempt?.correct ?? null,
      errorReason: attempt?.errorReason ?? null,
      relatedMastery,
    },
  };
}

export async function askAiTutor({
  settings,
  context,
  userMessage,
  history = [],
  action = 'tutor',
  useCache = false,
  questionId = null,
}) {
  const resolved = resolveAiSettings(settings);
  if (!resolved.enabled) throw new Error('AI 기능이 OFF입니다.');
  if (!resolved.apiKey) throw new Error('API Key가 필요합니다.');

  const key = cacheKey({
    provider: resolved.provider,
    model: resolved.model,
    questionId,
    action,
  });

  if (useCache && !history.length && action !== 'chat') {
    const cached = await readCache(key);
    if (cached) return { text: cached, cached: true, provider: resolved.provider };
  }

  const contextJson = JSON.stringify(context, null, 0).slice(0, 12000);
  const messages = [
    {
      role: 'user',
      content: `학습 컨텍스트(JSON):\n${contextJson}\n\n요청:\n${userMessage}`,
    },
    ...history.map((h) => ({ role: h.role, content: h.content })),
  ];

  try {
    const result = await callProvider({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system: AI_TUTOR_SYSTEM,
      messages,
      temperature: AI_CONFIG.tutor.temperature,
      maxTokens: AI_CONFIG.tutor.maxTokens,
    });

    if (useCache && !history.length) await writeCache(key, result.text);
    return { text: result.text, cached: false, provider: resolved.provider, model: result.model };
  } catch (err) {
    if (isCorsError(err)) {
      throw new Error(
        'AI 요청이 브라우저 네트워크/CORS 제한으로 실패했습니다. 기본 학습 기능은 계속 사용할 수 있습니다.'
      );
    }
    throw new Error(String(err.message || err).replace(/(sk-|AIza|sk-ant-)[^\s]+/gi, '[REDACTED]'));
  }
}

export async function generateSimilarQuestion({ settings, context }) {
  const prompt = `현재 문제와 같은 section/skill을 겨냥한 학습용 유사문제 1개를 JSON만 출력하라.
스키마:
{
  "id": "AI-TMP-xxxx",
  "section": "...",
  "part": 1,
  "type": "...",
  "difficulty": 2,
  "targetScoreBand": "327-target",
  "tags": [],
  "question": "...",
  "passage": "",
  "choices": ["","","",""],
  "answer": 0,
  "explanation": {
    "summary": "",
    "evidence": "",
    "choiceAnalysis": ["","","",""]
  },
  "vocabulary": [],
  "skills": []
}
실제 TEPS 기출이라고 쓰지 말고, 학습용 연습문제여야 한다.
JSON 외 텍스트를 출력하지 마라.`;

  const result = await askAiTutor({
    settings,
    context,
    userMessage: prompt,
    action: 'similar',
    useCache: false,
    questionId: context?.question?.id,
  });

  const parsed = extractJsonObject(result.text);
  if (!parsed) {
    throw new Error('문제를 생성했지만 형식 검증에 실패했습니다. 다시 생성해 주세요.');
  }

  parsed.id = parsed.id || `AI-TMP-${uid('q').slice(-6)}`;
  parsed.source = 'ai-practice';
  const errors = validateQuestion(parsed);
  if (errors.length) {
    throw new Error('문제를 생성했지만 형식 검증에 실패했습니다. 다시 생성해 주세요.');
  }
  return parsed;
}

export async function generateMiniLesson({ settings, context }) {
  const prompt = `현재 문항의 skill을 기준으로 짧은 미니수업을 만들어라.
구성:
1. 핵심 개념
2. 쉬운 예문 2개
3. TEPS에서 어떻게 묻는지
4. 확인문제 2~3개 (정답 포함)
한국어로, 너무 길지 않게.`;
  return askAiTutor({
    settings,
    context,
    userMessage: prompt,
    action: 'minilesson',
    useCache: true,
    questionId: context?.question?.id,
  });
}

export async function generateAiStudyComment({ settings, summary }) {
  const prompt = `다음 학습 요약(JSON)을 보고 TEPS ${summary.targetScore || 327} 달성을 위한 짧은 코칭 코멘트를 3~5문장으로 작성하라. 과장된 점수 예측은 하지 마라.\n${JSON.stringify(
    summary
  )}`;
  return askAiTutor({
    settings,
    context: { summary },
    userMessage: prompt,
    action: 'home-comment',
    useCache: false,
  });
}

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export { resolveAiSettings };
