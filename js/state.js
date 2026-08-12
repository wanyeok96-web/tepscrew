/**
 * Application state — Phase 2 learning engine hooks
 */

import { loadSettings, saveSettings, loadProfile, saveProfile, clearLocalStorageData } from './storage.js';
import {
  initDB,
  getItem,
  putItem,
  getAllItems,
  addItem,
  clearAllStores,
  exportAllData,
  importStoreData,
  countItems,
} from './db.js';
import {
  createDefaultKnowledgeMap,
  fetchJson,
  uid,
  STAGE_META,
} from './utils.js';
import {
  applyVocabResult,
  createQuestionReviewItem,
  applyReviewAttempt,
  skillsFromQuestion,
  applyKnowledgeMapUpdate,
  computeSkillMasteryDelta,
  normalizeSkill,
  isDue,
} from './mastery.js';
import {
  determineStage,
  estimateTepsScore,
  levelFromMastery,
  sectionMasteryAverage,
  SECTIONS,
} from './scoring.js';
import {
  buildTodayPlan,
  buildPracticeSet,
  build327TargetSet,
  buildBalancedSet,
  planMiniTePSCounts,
  planFullTePSFeasibility,
  collectRecentWrongIds,
  collectRecentAnsweredIds,
  classifyVocabLists,
} from './recommendation.js';
import { TEPS_CONFIG } from './config.js';
import { loadAllBuiltinPacks, computeBankStats } from './content/packs.js';
import { ensureTaxonomyInMap } from './content/skill-taxonomy.js';
import { loadFoundationContent } from './content/foundation-loader.js';

const state = {
  ready: false,
  currentPage: 'home',
  routeParams: {},
  settings: null,
  profile: null,
  knowledgeMap: null,
  content: {
    foundation: null,
    vocabulary: null,
    grammar: null,
    reading: null,
    listening: null,
    guide: null,
  },
  learningRecords: [],
  reviewQueue: [],
  mockTests: [],
  foundationProgress: {},
  vocabMastery: {},
  customVocabulary: {},
  contentPacks: [],
  questionBank: [],
  bankStats: null,
  lastSessionResult: null,
  targetPreview: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(reason = 'update') {
  listeners.forEach((fn) => {
    try {
      fn(state, reason);
    } catch {
      /* keep app alive */
    }
  });
}

export function setPage(page, params = {}) {
  state.currentPage = page;
  state.routeParams = params;
  notify('route');
}

export function updateSettings(partial) {
  state.settings = saveSettings({ ...state.settings, ...partial });
  notify('settings');
  return state.settings;
}

export function updateProfile(partial) {
  state.profile = saveProfile({ ...state.profile, ...partial });
  notify('profile');
  return state.profile;
}

export async function ensureKnowledgeMap() {
  let map = await getItem('knowledgeMap', 'default');
  if (!map) {
    map = createDefaultKnowledgeMap();
  }
  map = ensureTaxonomyInMap(map);
  await putItem('knowledgeMap', map);
  state.knowledgeMap = map;
  return map;
}

export async function updateKnowledgeMastery(section, skillId, mastery) {
  const map = await ensureKnowledgeMap();
  const items = map.sections[section] || [];
  const target = items.find((i) => i.id === skillId);
  if (target) {
    target.mastery = Math.max(0, Math.min(100, mastery));
    map.updatedAt = new Date().toISOString();
    await putItem('knowledgeMap', map);
    state.knowledgeMap = map;
    notify('knowledgeMap');
  }
  return map;
}

async function bumpKnowledgeFromAttempt(question, correct) {
  const map = await ensureKnowledgeMap();
  const skills = skillsFromQuestion(question);
  const section = question.section;
  const related = state.learningRecords.filter(
    (r) =>
      r.recordType === 'question' &&
      r.section === section &&
      (r.skills || []).some((s) => skills.includes(normalizeSkill(section, s) || s))
  );

  skills.forEach((skill) => {
    const attemptsForSkill = related.filter((r) =>
      (r.skills || []).map((s) => normalizeSkill(section, s) || s).includes(skill)
    ).length;
    const delta = computeSkillMasteryDelta({ correct, attemptsForSkill });
    applyKnowledgeMapUpdate(map, section, skill, delta);
  });

  await putItem('knowledgeMap', map);
  state.knowledgeMap = map;
  notify('knowledgeMap');
  return map;
}

export async function addLearningRecord(record) {
  const item = {
    id: uid('lr'),
    createdAt: new Date().toISOString(),
    ...record,
  };
  await addItem('learningRecords', item);
  state.learningRecords = [item, ...state.learningRecords].slice(0, 500);
  notify('learningRecords');
  return item;
}

export async function refreshLearningRecords() {
  const items = await getAllItems('learningRecords');
  state.learningRecords = items.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  return state.learningRecords;
}

export async function saveFoundationProgress(lessonId, progress) {
  const prev = state.foundationProgress[lessonId] || {};
  const item = {
    ...prev,
    ...progress,
    id: lessonId,
    updatedAt: new Date().toISOString(),
  };
  await putItem('foundationProgress', item);
  state.foundationProgress[lessonId] = item;
  notify('foundationProgress');
  return item;
}

export async function saveVocabResult(wordId, result) {
  const existing = state.vocabMastery[wordId] || { id: wordId };
  const next = applyVocabResult(existing, result);
  await putItem('vocabulary', next);
  state.vocabMastery[wordId] = next;

  // Keep reviewQueue vocab item in sync
  await putItem('reviewQueue', {
    id: `vocab-${wordId}`,
    type: 'vocabulary',
    refId: wordId,
    status: next.status === 'mastered' ? 'mastered' : 'learning',
    mastery: next.familiarity || 0,
    nextReview: next.nextReview,
    lastAttempt: next.lastReviewedAt,
    updatedAt: next.updatedAt,
    createdAt: existing.createdAt || next.updatedAt,
  });

  // Refresh review cache
  const allReview = await getAllItems('reviewQueue');
  state.reviewQueue = allReview;

  await addLearningRecord({
    recordType: 'vocabulary',
    type: 'vocabulary',
    title: '단어 학습',
    detail: `${wordId} · ${result}`,
    refId: wordId,
    result,
  });

  notify('vocabulary');
  return next;
}

export function getTodayPlan() {
  return buildTodayPlan(state);
}

export function getScoreSummary() {
  const target = state.settings?.targetScore ?? 327;
  const estimated = state.profile?.estimatedScore ?? null;
  const highest = state.profile?.highestScore ?? null;
  const gap = estimated == null ? null : Math.max(0, target - estimated);
  const stageMeta =
    STAGE_META[state.profile?.currentStage] ||
    determineStage({
      estimatedScore: estimated,
      targetScore: target,
      recentMocks: state.mockTests,
    });
  const confidence = state.profile?.scoreConfidence || null;
  return { target, estimated, highest, gap, stage: stageMeta, confidence };
}

export function getQuestionPool() {
  if (state.questionBank?.length) return state.questionBank;
  return [
    ...(state.content.grammar?.questions || []).map((q) => ({ ...q, source: 'demo' })),
    ...(state.content.reading?.questions || []).map((q) => ({ ...q, source: 'demo' })),
    ...(state.content.listening?.questions || []).map((q) => ({ ...q, source: 'demo' })),
  ];
}

function practiceContext() {
  return {
    knowledgeMap: state.knowledgeMap,
    recentWrongIds: collectRecentWrongIds(state.learningRecords),
    recentAnsweredIds: collectRecentAnsweredIds(state.learningRecords),
  };
}

export function selectPracticeQuestions({
  count = 5,
  section = null,
  target327 = false,
  questionIds = null,
} = {}) {
  const pool = getQuestionPool();
  if (Array.isArray(questionIds) && questionIds.length) {
    const map = new Map(pool.map((q) => [q.id, q]));
    return questionIds.map((id) => map.get(id)).filter(Boolean);
  }
  if (target327) {
    return build327TargetSet(pool, practiceContext(), count);
  }
  return buildPracticeSet({
    questions: pool,
    count,
    section,
    ...practiceContext(),
  });
}

export function buildMiniQuestions() {
  const pool = getQuestionPool();
  const planned = planMiniTePSCounts(pool);
  if (planned.plan) {
    return {
      questions: buildBalancedSet(pool, planned.plan, practiceContext()),
      meta: planned,
    };
  }
  return { questions: planned.questions, meta: planned };
}

export function getFullTePSStatus() {
  return planFullTePSFeasibility(getQuestionPool());
}

export async function upsertQuestionReview(question, { correct, mode }) {
  const id = `question-${question.id}`;
  const existing = await getItem('reviewQueue', id);
  let item = createQuestionReviewItem(question, existing);

  if (mode === 'review' || existing) {
    item = applyReviewAttempt(item, { correct });
  } else if (!correct) {
    // First wrong — enqueue
    item.wrongCount = (item.wrongCount || 0) + 1;
    item.mastery = 20;
    item.status = 'learning';
    item.consecutiveCorrect = 0;
    item.nextReview = new Date(Date.now() + 86400000).toISOString();
    item.lastAttempt = new Date().toISOString();
    item.updatedAt = item.lastAttempt;
  } else if (!existing) {
    // Correct on first practice — do not add to review queue
    return null;
  } else {
    item = applyReviewAttempt(item, { correct: true });
  }

  // If correct on practice and not already in queue, skip
  if (!existing && correct) return null;

  await putItem('reviewQueue', item);
  const idx = state.reviewQueue.findIndex((r) => r.id === item.id);
  if (idx >= 0) state.reviewQueue[idx] = item;
  else state.reviewQueue.push(item);
  notify('reviewQueue');
  return item;
}

/**
 * Persist one answered question + side effects
 */
export async function persistQuestionAttempt({
  session,
  question,
  selectedAnswer,
  correct,
  responseTime,
  errorReason = null,
  confidence = null,
}) {
  const skills = skillsFromQuestion(question);
  const record = {
    recordType: 'question',
    type: session.mode || 'practice',
    title: question.id,
    questionId: question.id,
    section: question.section,
    questionType: question.type,
    skills,
    correct,
    selectedAnswer,
    correctAnswer: question.answer,
    responseTime,
    errorReason,
    confidence,
    mode: session.mode,
    sessionId: session.sessionId,
    detail: `${question.section} · ${correct ? '정답' : '오답'}`,
  };

  await addLearningRecord(record);
  await upsertQuestionReview(question, { correct, mode: session.mode });
  await bumpKnowledgeFromAttempt(question, correct);

  return record;
}

export async function persistSessionSummary(session, summaryExtra = {}) {
  const attempts = Object.values(session.answers || {}).filter((a) => a.submitted);
  const correctCount = attempts.filter((a) => a.correct).length;
  const totalTime = attempts.reduce((s, a) => s + (a.responseTime || 0), 0);
  const summary = {
    recordType: 'session',
    type: session.mode,
    title: session.title || session.mode,
    sessionId: session.sessionId,
    mode: session.mode,
    totalQuestions: session.questions.length,
    correctCount,
    accuracy: session.questions.length
      ? Math.round((correctCount / session.questions.length) * 1000) / 10
      : 0,
    totalTime,
    detail: `${correctCount}/${session.questions.length}`,
    ...summaryExtra,
  };
  await addLearningRecord(summary);
  return summary;
}

export function setLastSessionResult(result) {
  state.lastSessionResult = result;
  notify('sessionResult');
}

export function getLastSessionResult() {
  return state.lastSessionResult;
}

export async function saveMockResult(mockRecord) {
  await putItem('mockTests', mockRecord);
  state.mockTests = [mockRecord, ...state.mockTests.filter((m) => m.id !== mockRecord.id)];
  notify('mockTests');

  // Update profile scores carefully
  const target = state.settings?.targetScore ?? 327;
  const nextProfile = { ...state.profile };

  if (typeof mockRecord.score === 'number') {
    nextProfile.estimatedScore = mockRecord.score;
    nextProfile.highestScore =
      nextProfile.highestScore == null
        ? mockRecord.score
        : Math.max(nextProfile.highestScore, mockRecord.score);
    nextProfile.scoreConfidence = mockRecord.scoreConfidence || null;
  }

  if (mockRecord.type === 'diagnosis') {
    nextProfile.diagnosisCompleted = true;
    nextProfile.diagnosis = mockRecord.diagnosis || null;
  }

  // Section levels from knowledge map
  const levels = {};
  SECTIONS.forEach((section) => {
    const avg = sectionMasteryAverage(state.knowledgeMap, section);
    const lv = levelFromMastery(avg);
    levels[section] = lv.level;
  });
  nextProfile.level = { ...nextProfile.level, ...levels };

  const stage = determineStage({
    estimatedScore: nextProfile.estimatedScore,
    targetScore: target,
    recentMocks: [mockRecord, ...state.mockTests],
  });
  nextProfile.currentStage = stage.id;

  updateProfile(nextProfile);
  return mockRecord;
}

export async function refreshProfileStage() {
  const stage = determineStage({
    estimatedScore: state.profile?.estimatedScore,
    targetScore: state.settings?.targetScore ?? 327,
    recentMocks: state.mockTests,
  });
  if (state.profile?.currentStage !== stage.id) {
    updateProfile({ currentStage: stage.id });
  }
  return stage;
}

export function getVocabLists() {
  const words = state.content?.vocabulary?.words || [];
  return classifyVocabLists(words, state.vocabMastery);
}

export function getDueReviewQuestions() {
  return state.reviewQueue.filter(
    (r) => r.type === 'question' && r.status !== 'mastered' && isDue(r.nextReview)
  );
}

export function getWrongReviewQuestions() {
  return state.reviewQueue.filter((r) => r.type === 'question' && (r.wrongCount || 0) > 0);
}

export function getMasteredReviews() {
  return state.reviewQueue.filter((r) => r.status === 'mastered');
}

export function resolveQuestionsByReviewItems(items) {
  const pool = new Map(getQuestionPool().map((q) => [q.id, q]));
  return items.map((i) => pool.get(i.refId)).filter(Boolean);
}

export { estimateTepsScore, TEPS_CONFIG, computeBankStats };

/**
 * Seed builtin packs + lightweight demo fillers for scarce sections.
 * Never silently overwrite non-demo questions on ID conflict.
 */
async function ensureQuestionBankSeeded() {
  const existing = await getAllItems('questionBank');
  const byId = new Map(existing.map((q) => [q.id, q]));
  const packRecords = await getAllItems('contentPacks');
  const installed = new Set(packRecords.map((p) => p.id));

  const { loaded } = await loadAllBuiltinPacks();
  for (const entry of loaded) {
    if (!entry.pack?.questions?.length) continue;
    const packId = entry.pack.id;
    const already = installed.has(packId);
    let added = 0;
    let skippedConflict = 0;

    for (const q of entry.pack.questions) {
      const prev = byId.get(q.id);
      if (prev) {
        // Upgrade demo → pack content when same id was demo; skip other conflicts
        if (prev.source === 'demo' || prev.source === packId) {
          const next = { ...q, source: packId, packId };
          await putItem('questionBank', next);
          byId.set(q.id, next);
          added += 1;
        } else {
          skippedConflict += 1;
        }
        continue;
      }
      const next = { ...q, source: packId, packId };
      await putItem('questionBank', next);
      byId.set(q.id, next);
      added += 1;
    }

    await putItem('contentPacks', {
      id: packId,
      title: entry.pack.title,
      version: entry.pack.version,
      source: packId,
      questionCount: entry.pack.questions.length,
      installedAt: already
        ? packRecords.find((p) => p.id === packId)?.installedAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      validationOk: entry.validation?.ok !== false,
      skippedConflict,
      added,
    });
  }

  // Keep limited demo fillers for Reading/Listening if bank lacks them
  const demoPacks = [
    ...(state.content.reading?.questions || []).map((q) => ({ ...q, source: 'demo' })),
    ...(state.content.listening?.questions || []).map((q) => ({ ...q, source: 'demo' })),
    ...(state.content.grammar?.questions || []).map((q) => ({ ...q, source: 'demo' })),
  ];
  for (const q of demoPacks) {
    if (byId.has(q.id)) continue;
    await putItem('questionBank', q);
    byId.set(q.id, q);
  }

  state.questionBank = [...byId.values()];
  state.contentPacks = await getAllItems('contentPacks');
  state.bankStats = computeBankStats(state.questionBank);
  return state.questionBank;
}

async function loadContent() {
  const [foundation, vocabulary, grammar, reading, listening, guide] = await Promise.all([
    loadFoundationContent(),
    fetchJson('./data/vocabulary.json'),
    fetchJson('./data/grammar.json'),
    fetchJson('./data/reading.json'),
    fetchJson('./data/listening.json'),
    fetchJson('./data/guide.json'),
  ]);
  state.content = { foundation, vocabulary, grammar, reading, listening, guide };
}

async function loadProgressCaches() {
  const [records, review, mocks, progress, vocab, customVocab] = await Promise.all([
    getAllItems('learningRecords'),
    getAllItems('reviewQueue'),
    getAllItems('mockTests'),
    getAllItems('foundationProgress'),
    getAllItems('vocabulary'),
    getAllItems('customVocabulary'),
  ]);

  state.learningRecords = records.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  state.reviewQueue = review;
  state.mockTests = mocks.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  state.foundationProgress = Object.fromEntries(progress.map((p) => [p.id, p]));
  state.vocabMastery = Object.fromEntries(vocab.map((v) => [v.id, v]));
  state.customVocabulary = Object.fromEntries(customVocab.map((v) => [v.id, v]));
}

export async function initAppState() {
  state.settings = loadSettings();
  state.profile = loadProfile();

  try {
    await initDB();
    await loadContent();
    await ensureKnowledgeMap();
    await ensureQuestionBankSeeded();
    await loadProgressCaches();
    await refreshProfileStage();
  } catch (err) {
    console.error(err);
    if (!state.content.foundation) {
      try {
        await loadContent();
      } catch {
        /* handled by UI */
      }
    }
    throw err;
  }

  state.ready = true;
  notify('ready');
  return state;
}

export function getBankStats() {
  state.bankStats = computeBankStats(getQuestionPool());
  return state.bankStats;
}

export async function addCustomVocabularyEntry(entry) {
  const word = String(entry.word || '').trim();
  if (!word) throw new Error('단어가 비어 있습니다.');
  const id = entry.id || `cv-${word.toLowerCase().replace(/\s+/g, '-')}`;
  const existing = state.customVocabulary[id] || (await getItem('customVocabulary', id));
  const sources = new Set([...(existing?.sourceQuestionIds || []), ...(entry.sourceQuestionIds || [])]);
  const next = {
    id,
    word,
    meaning: entry.meaning || existing?.meaning || '',
    examples: entry.examples || existing?.examples || [],
    collocations: entry.collocations || existing?.collocations || [],
    confusableWords: entry.confusableWords || existing?.confusableWords || [],
    sourceQuestionIds: [...sources],
    status: existing?.status || 'learning',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putItem('customVocabulary', next);
  state.customVocabulary[id] = next;
  notify('customVocabulary');
  return next;
}

export function setTargetPreview(preview) {
  state.targetPreview = preview;
  notify('targetPreview');
}

function stripAiSecrets(settings) {
  if (!settings) return settings;
  const clone = JSON.parse(JSON.stringify(settings));
  if (clone.ai) {
    clone.ai.apiKey = '';
    clone.ai.keys = { openai: '', claude: '', gemini: '' };
  }
  return clone;
}

export async function createBackupPayload() {
  const idb = await exportAllData();
  return {
    app: 'tepscrew',
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: stripAiSecrets(state.settings),
    profile: state.profile,
    learningRecords: idb.learningRecords,
    reviewQueue: idb.reviewQueue,
    mockTests: idb.mockTests,
    knowledgeMap: idb.knowledgeMap,
    foundationProgress: idb.foundationProgress,
    vocabulary: idb.vocabulary,
    customVocabulary: idb.customVocabulary || [],
    contentPacks: idb.contentPacks || [],
    // questionBank included for restore integrity of imported items
    questionBank: idb.questionBank,
    note: 'AI API Key는 보안을 위해 백업에 포함되지 않습니다.',
  };
}

export async function restoreBackupPayload(payload) {
  if (!payload || payload.app !== 'tepscrew') {
    throw new Error('텝스크루 백업 파일이 아닙니다.');
  }

  if (payload.settings) {
    const cleaned = stripAiSecrets(payload.settings);
    cleaned.ai = { ...(state.settings?.ai || {}), ...(cleaned.ai || {}), apiKey: '', keys: { openai: '', claude: '', gemini: '' } };
    state.settings = saveSettings(cleaned);
  }
  if (payload.profile) state.profile = saveProfile(payload.profile);

  const map = [
    ['learningRecords', payload.learningRecords],
    ['reviewQueue', payload.reviewQueue],
    ['mockTests', payload.mockTests],
    ['knowledgeMap', payload.knowledgeMap],
    ['foundationProgress', payload.foundationProgress],
    ['vocabulary', payload.vocabulary],
    ['customVocabulary', payload.customVocabulary],
    ['contentPacks', payload.contentPacks],
    ['questionBank', payload.questionBank],
  ];

  for (const [store, items] of map) {
    if (Array.isArray(items)) {
      await importStoreData(store, items, { clearFirst: true });
    }
  }

  await loadProgressCaches();
  await ensureKnowledgeMap();
  await ensureQuestionBankSeeded();
  await refreshProfileStage();
  notify('restore');
}

export async function resetAllUserData() {
  await clearAllStores();
  clearLocalStorageData();
  state.settings = loadSettings();
  state.profile = loadProfile();
  state.lastSessionResult = null;
  await ensureKnowledgeMap();
  await ensureQuestionBankSeeded();
  await loadProgressCaches();
  notify('reset');
}

export async function importValidQuestions(questions, meta = {}) {
  let added = 0;
  let conflicts = 0;
  for (const q of questions) {
    const existing = await getItem('questionBank', q.id);
    if (existing && existing.source && existing.source !== 'demo' && existing.source !== meta.source) {
      conflicts += 1;
      continue;
    }
    await putItem('questionBank', {
      ...q,
      source: meta.source || q.source || 'imported',
      importedAt: new Date().toISOString(),
    });
    added += 1;
  }
  state.questionBank = await getAllItems('questionBank');
  state.bankStats = computeBankStats(state.questionBank);
  notify('questionBank');
  return { added, conflicts };
}

export function getQuestionsBySection(section) {
  return getQuestionPool().filter((q) => q.section === section);
}

/** @deprecated prefer selectPracticeQuestions */
export function getDemoQuestions(count = 5, section = null) {
  return selectPracticeQuestions({ count, section });
}
