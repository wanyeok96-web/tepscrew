/**
 * Skill normalization, mastery, review scheduling
 */

import { clamp } from './utils.js';
import { VOCAB_KNOWN_INTERVALS } from './config.js';
import { canonicalizeSkill } from './content/skill-taxonomy.js';

export function normalizeSkill(section, skill) {
  return canonicalizeSkill(section, skill);
}

export function skillsFromQuestion(question) {
  const section = question?.section || 'reading';
  const raw = [];
  if (Array.isArray(question?.skills)) raw.push(...question.skills);
  if (question?.type) raw.push(question.type);
  const seen = new Set();
  const out = [];
  raw.forEach((s) => {
    const n = normalizeSkill(section, s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
}

export function addDays(isoOrDate, days) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isDue(iso) {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
}

/**
 * Review schedule for wrong questions
 * @param {{ consecutiveCorrect?: number, correct: boolean, mastery?: number }} input
 */
export function calculateNextReview(input) {
  const { correct, consecutiveCorrect = 0, mastery = 20 } = input;
  const now = new Date().toISOString();

  if (!correct) {
    return {
      nextReview: addDays(now, 1),
      consecutiveCorrect: 0,
      mastery: clamp(mastery - 12, 0, 100),
      status: 'learning',
      wrongBump: 1,
    };
  }

  const streak = consecutiveCorrect + 1;
  let days = 1;
  if (streak === 1) days = 3;
  else if (streak === 2) days = 7;
  else if (streak >= 3) days = 14;

  const nextMastery = clamp(mastery + 18 + Math.min(streak, 3) * 4, 0, 100);
  const mastered = streak >= 3 && nextMastery >= 80;

  return {
    nextReview: mastered ? addDays(now, 30) : addDays(now, days),
    consecutiveCorrect: streak,
    mastery: nextMastery,
    status: mastered ? 'mastered' : 'learning',
    wrongBump: 0,
  };
}

export function createQuestionReviewItem(question, existing = null) {
  const now = new Date().toISOString();
  const skills = skillsFromQuestion(question);
  const base = existing || {
    id: `question-${question.id}`,
    type: 'question',
    refId: question.id,
    section: question.section,
    skill: skills[0] || question.type || '',
    wrongCount: 0,
    reviewCount: 0,
    consecutiveCorrect: 0,
    mastery: 20,
    status: 'learning',
    createdAt: now,
  };

  return {
    ...base,
    section: question.section || base.section,
    skill: skills[0] || base.skill,
    lastAttempt: now,
    updatedAt: now,
  };
}

export function applyReviewAttempt(item, { correct }) {
  const calc = calculateNextReview({
    correct,
    consecutiveCorrect: item.consecutiveCorrect || 0,
    mastery: item.mastery ?? 20,
  });

  return {
    ...item,
    wrongCount: (item.wrongCount || 0) + (correct ? 0 : calc.wrongBump),
    reviewCount: (item.reviewCount || 0) + 1,
    consecutiveCorrect: calc.consecutiveCorrect,
    mastery: calc.mastery,
    status: calc.status,
    nextReview: calc.nextReview,
    lastAttempt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Soft mastery update from recent performance (0–100)
 * Avoids huge jumps with sparse data.
 */
export function computeSkillMasteryDelta({ correct, attemptsForSkill = 0 }) {
  if (attemptsForSkill < 1) {
    return correct ? 8 : -4;
  }
  if (attemptsForSkill < 4) {
    return correct ? 6 : -5;
  }
  return correct ? 4 : -6;
}

export function applyKnowledgeMapUpdate(map, section, skillId, delta) {
  if (!map?.sections?.[section]) return map;
  const items = map.sections[section];
  const target = items.find((i) => i.id === skillId);
  if (!target) return map;
  const prev = target.mastery || 0;
  // Cap single-step change
  const stepped = clamp(delta, -10, 10);
  target.mastery = clamp(prev + stepped, 0, 100);
  map.updatedAt = new Date().toISOString();
  return map;
}

/** Vocabulary spaced repetition */
export function applyVocabResult(existing, result) {
  const now = new Date().toISOString();
  const item = {
    known: 0,
    unsure: 0,
    unknown: 0,
    familiarity: 0,
    streak: 0,
    status: 'learning',
    ...existing,
    id: existing?.id,
    lastResult: result,
    lastReviewedAt: now,
    updatedAt: now,
  };

  if (result === 'known') item.known += 1;
  if (result === 'unsure') item.unsure += 1;
  if (result === 'unknown') item.unknown += 1;

  if (result === 'unknown') {
    item.streak = 0;
    item.familiarity = clamp((item.familiarity || 0) - 15, 0, 100);
    item.nextReview = addDays(now, 0); // due today / next open
    item.status = 'learning';
  } else if (result === 'unsure') {
    item.streak = 0;
    item.familiarity = clamp((item.familiarity || 0) + 5, 0, 100);
    item.nextReview = addDays(now, item.familiarity < 40 ? 1 : 3);
    item.status = 'learning';
  } else {
    item.streak = (item.streak || 0) + 1;
    const idx = Math.min(item.streak - 1, VOCAB_KNOWN_INTERVALS.length - 1);
    const days = VOCAB_KNOWN_INTERVALS[Math.max(0, idx)];
    item.familiarity = clamp((item.familiarity || 0) + 12 + item.streak * 2, 0, 100);
    item.nextReview = addDays(now, days);
    if (item.streak >= 4 && item.familiarity >= 85) {
      item.status = 'mastered';
      item.nextReview = addDays(now, 30);
    } else {
      item.status = 'learning';
    }
  }

  return item;
}

export function weaknessRatio(vocabItem) {
  const k = vocabItem.known || 0;
  const u = (vocabItem.unsure || 0) + (vocabItem.unknown || 0);
  const total = k + u;
  if (!total) return 0;
  return u / total;
}
