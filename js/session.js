/**
 * Shared quiz / mock session helpers
 */

import { uid } from './utils.js';
import { PRACTICE_MODES } from './config.js';

export function createSession({ mode, questions, title = '', meta = {} }) {
  const sessionId = uid('sess');
  const now = new Date().toISOString();
  return {
    sessionId,
    mode: mode || PRACTICE_MODES.practice,
    title,
    startedAt: now,
    finishedAt: null,
    currentIndex: 0,
    questions: questions.map((q) => ({ ...q })),
    answers: {}, // questionId -> { selectedAnswer, correct, responseTime, errorReason, submittedAt }
    questionStartedAt: Date.now(),
    meta,
  };
}

export function startQuestionTimer(session) {
  session.questionStartedAt = Date.now();
  return session;
}

export function getCurrentQuestion(session) {
  if (!session?.questions?.length) return null;
  return session.questions[session.currentIndex] || null;
}

export function recordAnswer(session, questionId, payload) {
  const responseTime = Math.max(
    1,
    Math.round((Date.now() - (session.questionStartedAt || Date.now())) / 1000)
  );
  session.answers[questionId] = {
    questionId,
    responseTime,
    ...payload,
    createdAt: new Date().toISOString(),
  };
  return session.answers[questionId];
}

export function setSelectedAnswer(session, questionId, selectedAnswer) {
  const prev = session.answers[questionId] || { questionId };
  session.answers[questionId] = {
    ...prev,
    selectedAnswer,
    submitted: prev.submitted || false,
  };
  return session.answers[questionId];
}

export function buildAttemptList(session) {
  return session.questions.map((q) => {
    const a = session.answers[q.id] || {};
    return {
      questionId: q.id,
      section: q.section,
      type: q.type,
      questionType: q.type,
      skills: q.skills || [],
      selectedAnswer: a.selectedAnswer ?? null,
      correctAnswer: q.answer,
      correct: a.correct ?? null,
      responseTime: a.responseTime || 0,
      confidence: a.confidence ?? null,
      errorReason: a.errorReason ?? null,
      mode: session.mode,
      createdAt: a.createdAt || null,
    };
  });
}

export function sessionSummary(session) {
  const attempts = buildAttemptList(session).filter((a) => a.correct != null);
  const correctCount = attempts.filter((a) => a.correct).length;
  const totalTime = attempts.reduce((s, a) => s + (a.responseTime || 0), 0);
  return {
    sessionId: session.sessionId,
    mode: session.mode,
    totalQuestions: session.questions.length,
    answeredCount: attempts.length,
    correctCount,
    accuracy: session.questions.length
      ? Math.round((correctCount / session.questions.length) * 1000) / 10
      : 0,
    totalTime,
    avgTime: attempts.length ? Math.round(totalTime / attempts.length) : 0,
  };
}

export function unansweredCount(session) {
  return session.questions.filter((q) => {
    const a = session.answers[q.id];
    return a?.selectedAnswer == null;
  }).length;
}

/** Persist mock-in-progress for resume (sessionStorage) */
const MOCK_KEY = 'tepscrew:activeMockSession';

export function saveMockSessionSnapshot(session) {
  try {
    sessionStorage.setItem(
      MOCK_KEY,
      JSON.stringify({
        ...session,
        // Date.now number is fine
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function loadMockSessionSnapshot() {
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearMockSessionSnapshot() {
  try {
    sessionStorage.removeItem(MOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function getPassageText(question) {
  if (question?.transcript) return question.transcript;
  return question?.passage || '';
}

export function choiceLetter(index) {
  return String.fromCharCode(65 + Number(index));
}
