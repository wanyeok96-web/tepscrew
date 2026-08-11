/**
 * Rule-based Today Plan + practice set builders + 327 Target
 */

import { SECTION_WEIGHTS, TEPS_CONFIG } from './config.js';
import { isDue, weaknessRatio, skillsFromQuestion, normalizeSkill } from './mastery.js';
import { SECTIONS } from './scoring.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function daysSince(iso) {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function getWeakSkills(knowledgeMap, limit = 6) {
  const weak = [];
  if (!knowledgeMap?.sections) return weak;
  Object.entries(knowledgeMap.sections).forEach(([section, items]) => {
    (items || []).forEach((item) => {
      weak.push({
        section,
        skill: item.id,
        label: item.label,
        mastery: item.mastery || 0,
        score: ((100 - (item.mastery || 0)) / 100) * (SECTION_WEIGHTS[section] || 0.6),
      });
    });
  });
  return weak.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function rankQuestionsForUser(questions, ctx = {}) {
  const {
    knowledgeMap,
    recentWrongIds = new Set(),
    recentAnsweredIds = new Set(),
    preferTargetBand = false,
  } = ctx;

  const weak = getWeakSkills(knowledgeMap, 12);
  const weakSet = new Set(weak.map((w) => `${w.section}:${w.skill}`));

  return questions
    .map((q) => {
      const skills = skillsFromQuestion(q);
      let score = 0;

      skills.forEach((sk) => {
        if (weakSet.has(`${q.section}:${sk}`)) score += 3;
      });

      if (recentWrongIds.has(q.id)) score += 2.5;
      if (preferTargetBand && q.targetScoreBand === '327-target') score += 2;
      if (q.difficulty >= 2 && q.difficulty <= 3) score += 1;
      if (recentAnsweredIds.has(q.id)) score -= 2;

      // recency of section weakness weight
      score += (SECTION_WEIGHTS[q.section] || 0.5);

      return { q, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildPracticeSet(options = {}) {
  const {
    questions = [],
    count = 5,
    section = null,
    knowledgeMap = null,
    recentWrongIds = new Set(),
    recentAnsweredIds = new Set(),
    preferTargetBand = false,
    excludeIds = new Set(),
  } = options;

  let pool = questions.filter((q) => q?.id && !excludeIds.has(q.id));
  if (section) {
    const filtered = pool.filter((q) => q.section === section);
    if (filtered.length) pool = filtered;
  }

  if (!pool.length) return [];

  const ranked = rankQuestionsForUser(pool, {
    knowledgeMap,
    recentWrongIds,
    recentAnsweredIds,
    preferTargetBand,
  });

  const selected = [];
  const used = new Set();

  ranked.forEach(({ q }) => {
    if (selected.length >= count) return;
    if (used.has(q.id)) return;
    selected.push(q);
    used.add(q.id);
  });

  // Fallback fill
  if (selected.length < count) {
    shuffle(pool).forEach((q) => {
      if (selected.length >= count) return;
      if (used.has(q.id)) return;
      selected.push(q);
      used.add(q.id);
    });
  }

  return selected.slice(0, count);
}

export function build327TargetSet(questions, ctx = {}, count = 10) {
  return buildPracticeSet({
    questions,
    count,
    knowledgeMap: ctx.knowledgeMap,
    recentWrongIds: ctx.recentWrongIds,
    recentAnsweredIds: ctx.recentAnsweredIds,
    preferTargetBand: true,
  });
}

export function buildBalancedSet(questions, sectionPlan, ctx = {}) {
  const selected = [];
  const used = new Set();

  Object.entries(sectionPlan).forEach(([section, n]) => {
    if (!n) return;
    const chunk = buildPracticeSet({
      questions,
      count: n,
      section,
      excludeIds: used,
      knowledgeMap: ctx.knowledgeMap,
      recentWrongIds: ctx.recentWrongIds,
      recentAnsweredIds: ctx.recentAnsweredIds,
    });
    chunk.forEach((q) => {
      selected.push(q);
      used.add(q.id);
    });
  });

  // If short, fill from any
  const totalWanted = Object.values(sectionPlan).reduce((a, b) => a + b, 0);
  if (selected.length < totalWanted) {
    const fill = buildPracticeSet({
      questions,
      count: totalWanted - selected.length,
      excludeIds: used,
      knowledgeMap: ctx.knowledgeMap,
    });
    selected.push(...fill);
  }

  return selected;
}

/**
 * Scale Mini TEPS plan to available bank size
 */
export function planMiniTePSCounts(questions) {
  const preferred = TEPS_CONFIG.mini.sections;
  const available = Object.fromEntries(
    SECTIONS.map((s) => [s, questions.filter((q) => q.section === s).length])
  );

  const plan = {};
  let total = 0;
  SECTIONS.forEach((s) => {
    const n = Math.min(preferred[s] || 0, available[s] || 0);
    plan[s] = n;
    total += n;
  });

  // If still too few overall, take whatever exists
  if (total < TEPS_CONFIG.mini.minQuestions) {
    const leftovers = questions.slice(0, Math.min(questions.length, 10));
    return {
      plan: null,
      questions: leftovers,
      total: leftovers.length,
      scaled: true,
    };
  }

  return { plan, total, scaled: total < TEPS_CONFIG.mini.preferredTotal };
}

export function planFullTePSFeasibility(questions) {
  const need = TEPS_CONFIG.full.sections;
  const available = Object.fromEntries(
    SECTIONS.map((s) => [s, questions.filter((q) => q.section === s).length])
  );
  const missing = {};
  let ok = true;
  SECTIONS.forEach((s) => {
    const lack = (need[s] || 0) - (available[s] || 0);
    if (lack > 0) {
      ok = false;
      missing[s] = { need: need[s], have: available[s] || 0, lack };
    }
  });
  return {
    ok,
    need,
    available,
    missing,
    totalNeed: TEPS_CONFIG.full.totalQuestions,
    totalHave: questions.length,
  };
}

export function buildTodayPlan(state) {
  const minutes = state.settings?.dailyStudyMinutes || 30;
  const profile = state.profile || {};
  const reviewQueue = state.reviewQueue || [];
  const vocabMastery = state.vocabMastery || {};
  const words = state.content?.vocabulary?.words || [];
  const knowledgeMap = state.knowledgeMap;
  const records = state.learningRecords || [];
  const isNew =
    !profile.diagnosisCompleted &&
    profile.estimatedScore == null &&
    records.filter((r) => r.recordType === 'question' || r.type === 'practice').length < 3;

  const dueQuestions = reviewQueue.filter(
    (r) => r.type === 'question' && r.status !== 'mastered' && isDue(r.nextReview)
  );
  const dueVocab = words.filter((w) => {
    const m = vocabMastery[w.id];
    if (!m) return false;
    return m.status !== 'mastered' && isDue(m.nextReview);
  });
  const newVocab = words.filter((w) => !vocabMastery[w.id]);
  const weakSkills = getWeakSkills(knowledgeMap, 3);

  const items = [];
  let remaining = minutes;

  const push = (item) => {
    if (remaining <= 0) return;
    const m = Math.min(item.minutes, remaining);
    items.push({ ...item, minutes: m });
    remaining -= m;
  };

  if (isNew) {
    push({
      id: 'foundation',
      title: '기초학습',
      detail: '영어 문장의 뼈대',
      reason: '첫 사용자에게 Foundation부터 추천',
      minutes: Math.min(12, minutes),
      route: 'lesson',
      params: { id: 'F-001' },
    });
    push({
      id: 'vocab-new',
      title: '단어 학습',
      detail: `새 단어 ${Math.min(8, newVocab.length || 8)}개`,
      reason: '어휘 기반을 먼저 쌓기',
      minutes: 5,
      route: 'vocabulary',
      params: { tab: 'new' },
    });
    push({
      id: 'quick-practice',
      title: '빠른 문제훈련',
      detail: '5문제',
      reason: '짧은 Practice로 현재 감각 확인',
      minutes: 8,
      route: 'practice-quiz',
      params: { count: 5, mode: 'practice' },
    });
    if (!profile.diagnosisCompleted) {
      push({
        id: 'diagnosis',
        title: 'Quick Diagnosis',
        detail: '영역별 기초 진단',
        reason: '어느 영역부터 공부할지 판단',
        minutes: 10,
        route: 'diagnosis',
      });
    }
    return { totalMinutes: minutes, items, source: 'rule-new', isNew: true };
  }

  if (dueVocab.length) {
    push({
      id: 'vocab-due',
      title: '단어 복습',
      detail: `${dueVocab.length}개`,
      reason: `오늘 복습 예정 단어 ${dueVocab.length}개`,
      minutes: Math.min(8, 3 + Math.ceil(dueVocab.length / 3)),
      route: 'vocabulary',
      params: { tab: 'review' },
    });
  } else if (newVocab.length) {
    push({
      id: 'vocab-new',
      title: '새 단어',
      detail: `${Math.min(10, newVocab.length)}개`,
      reason: '아직 학습하지 않은 단어가 있습니다',
      minutes: 5,
      route: 'vocabulary',
      params: { tab: 'new' },
    });
  }

  if (dueQuestions.length) {
    push({
      id: 'review-due',
      title: '오답 복습',
      detail: `${dueQuestions.length}문제`,
      reason: '복습 일정이 도래한 오답',
      minutes: Math.min(10, 5 + dueQuestions.length),
      route: 'review',
      params: { start: '1' },
    });
  }

  if (weakSkills[0]) {
    const w = weakSkills[0];
    push({
      id: 'weak-skill',
      title: `${labelSection(w.section)} · ${w.label || w.skill}`,
      detail: '취약 Skill 집중',
      reason: `숙련도 ${w.mastery}%로 최근 정답률/맵 기준 우선 추천`,
      minutes: 8,
      route: 'practice-quiz',
      params: {
        count: 5,
        section: w.section,
        mode: 'practice',
      },
    });
  }

  // Always try to include reading or listening by weight if room
  if (remaining >= 6) {
    const focus =
      (weakSkills.find((w) => w.section === 'reading' || w.section === 'listening') ||
        weakSkills[0])?.section || 'reading';
    push({
      id: 'focus-practice',
      title: `${labelSection(focus)} 훈련`,
      detail: '취약 영역 Practice',
      reason: `${labelSection(focus)} 비중이 높아 우선 배치`,
      minutes: Math.min(10, remaining),
      route: 'practice-quiz',
      params: { count: 5, section: focus, mode: 'practice' },
    });
  }

  if (profile.estimatedScore == null && remaining >= 5) {
    push({
      id: 'mini',
      title: 'Mini TEPS',
      detail: '현재 상태 확인',
      reason: '아직 예상점수가 없어 진단용 Mini TEPS 추천',
      minutes: Math.min(15, remaining),
      route: 'mock-guide',
      params: { type: 'mini' },
    });
  }

  if (!items.length) {
    push({
      id: 'default-practice',
      title: '문제훈련',
      detail: '5문제',
      reason: '기본 학습 루틴',
      minutes: 10,
      route: 'practice-quiz',
      params: { count: 5 },
    });
  }

  return { totalMinutes: minutes, items, source: 'rule', isNew: false };
}

function labelSection(section) {
  const map = {
    listening: 'Listening',
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    reading: 'Reading',
  };
  return map[section] || section;
}

export function collectRecentWrongIds(records, limit = 50) {
  const ids = new Set();
  records
    .filter((r) => r.recordType === 'question' && r.correct === false)
    .slice(0, limit)
    .forEach((r) => ids.add(r.questionId));
  return ids;
}

export function collectRecentAnsweredIds(records, limit = 80) {
  const ids = new Set();
  records
    .filter((r) => r.recordType === 'question' && r.questionId)
    .slice(0, limit)
    .forEach((r) => ids.add(r.questionId));
  return ids;
}

export function classifyVocabLists(words, vocabMastery) {
  const review = [];
  const neu = [];
  const weak = [];
  const mastered = [];

  words.forEach((w) => {
    const m = vocabMastery[w.id];
    if (!m) {
      neu.push(w);
      return;
    }
    if (m.status === 'mastered') {
      mastered.push({ word: w, mastery: m });
      return;
    }
    if (isDue(m.nextReview)) review.push({ word: w, mastery: m });
    if (weaknessRatio(m) >= 0.4 || m.lastResult === 'unknown' || m.lastResult === 'unsure') {
      weak.push({ word: w, mastery: m });
    }
  });

  weak.sort((a, b) => weaknessRatio(b.mastery) - weaknessRatio(a.mastery));
  return { review, new: neu, weak, mastered };
}

export { shuffle, daysSince, normalizeSkill };
