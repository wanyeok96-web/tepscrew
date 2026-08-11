/**
 * Learning-oriented TEPS score estimation (NOT official TEPS conversion)
 */

import { TEPS_CONFIG, SECTION_WEIGHTS } from './config.js';
import { STAGE_META, clamp } from './utils.js';
import { skillsFromQuestion, normalizeSkill } from './mastery.js';

const SECTIONS = ['listening', 'vocabulary', 'grammar', 'reading'];

export function summarizeAttempts(attempts = []) {
  const bySection = Object.fromEntries(
    SECTIONS.map((s) => [s, { total: 0, correct: 0, time: 0 }])
  );
  const skillStats = {};

  attempts.forEach((a) => {
    const section = a.section || 'reading';
    if (!bySection[section]) {
      bySection[section] = { total: 0, correct: 0, time: 0 };
    }
    bySection[section].total += 1;
    bySection[section].correct += a.correct ? 1 : 0;
    bySection[section].time += a.responseTime || 0;

    const skills = a.skills?.length
      ? a.skills
      : skillsFromQuestion({ section, type: a.questionType, skills: a.skills });
    skills.forEach((sk) => {
      const id = normalizeSkill(section, sk) || sk;
      const key = `${section}:${id}`;
      if (!skillStats[key]) {
        skillStats[key] = { section, skill: id, total: 0, correct: 0 };
      }
      skillStats[key].total += 1;
      skillStats[key].correct += a.correct ? 1 : 0;
    });
  });

  return { bySection, skillStats };
}

/**
 * Estimate section score from accuracy + mild difficulty/band adjustment.
 * Returns null when data insufficient for that section.
 */
function estimateSectionScore(section, stats, questionsMeta = []) {
  if (!stats || stats.total < 1) return null;
  const max = TEPS_CONFIG.sectionMaxScores[section] || 60;
  let weightedCorrect = 0;
  let weightSum = 0;

  if (questionsMeta.length) {
    questionsMeta.forEach((q) => {
      const attempt = q.attempt;
      if (!attempt) return;
      const diff = clamp(q.difficulty || 3, 1, 5);
      const bandBoost = q.targetScoreBand === '327-target' ? 1.08 : 1;
      const w = (0.85 + diff * 0.05) * bandBoost;
      weightSum += w;
      if (attempt.correct) weightedCorrect += w;
    });
  }

  const acc =
    weightSum > 0 ? weightedCorrect / weightSum : stats.correct / stats.total;

  // Mild regression toward middle with tiny samples
  const n = stats.total;
  const prior = 0.45;
  const blended = (acc * n + prior * 2) / (n + 2);
  return Math.round(clamp(blended * max, 0, max));
}

export function getScoreConfidence({ totalQuestions, demoRatio = 1, sectionsCovered = 0 }) {
  if (totalQuestions < 8 || sectionsCovered < 3 || demoRatio > 0.85) {
    return {
      level: 'low',
      label: '낮음',
      message:
        '현재 문제은행이 적거나 Demo 문항 비중이 높아 학습용 추정치로만 활용하세요.',
    };
  }
  if (totalQuestions < 40 || sectionsCovered < 4) {
    return {
      level: 'medium',
      label: '보통',
      message: '연습 결과 기반의 학습용 추정치입니다. 공식 TEPS 성적이 아닙니다.',
    };
  }
  return {
    level: 'high',
    label: '높음',
    message: '연습 결과 기반의 학습용 추정치입니다. 공식 TEPS 성적이 아닙니다.',
  };
}

/**
 * @returns {{
 *   score: number|null,
 *   scores: object,
 *   accuracyBySection: object,
 *   confidence: object,
 *   canEstimate: boolean,
 *   reason?: string
 * }}
 */
export function estimateTepsScore(attempts, questions = []) {
  const { bySection } = summarizeAttempts(attempts);
  const totalQuestions = attempts.length;
  const demoCount = questions.filter((q) => q.source === 'demo').length;
  const demoRatio = totalQuestions ? demoCount / totalQuestions : 1;

  const scores = {};
  const accuracyBySection = {};
  let covered = 0;

  SECTIONS.forEach((section) => {
    const st = bySection[section] || { total: 0, correct: 0 };
    accuracyBySection[section] = st.total
      ? Math.round((st.correct / st.total) * 1000) / 10
      : null;

    const meta = questions
      .filter((q) => q.section === section)
      .map((q) => ({
        difficulty: q.difficulty,
        targetScoreBand: q.targetScoreBand,
        attempt: attempts.find((a) => a.questionId === q.id),
      }))
      .filter((m) => m.attempt);

    const est = estimateSectionScore(section, st, meta);
    scores[section] = est;
    if (est != null && st.total >= 1) covered += 1;
  });

  const confidence = getScoreConfidence({
    totalQuestions,
    demoRatio,
    sectionsCovered: covered,
  });

  // Require at least 2 sections & 4 items; otherwise no numeric score
  if (totalQuestions < 4 || covered < 2) {
    return {
      score: null,
      scores,
      accuracyBySection,
      confidence: {
        level: 'low',
        label: '낮음',
        message: '측정 데이터가 부족합니다. 더 풀면 학습용 추정치를 제공할 수 있습니다.',
      },
      canEstimate: false,
      reason: 'insufficient_data',
    };
  }

  // If confidence is low due to demo-only, still allow numeric but label carefully
  const parts = SECTIONS.map((s) => scores[s]).filter((v) => v != null);
  if (!parts.length) {
    return {
      score: null,
      scores,
      accuracyBySection,
      confidence,
      canEstimate: false,
      reason: 'no_section_scores',
    };
  }

  // Fill missing sections with cautious mid-low prior (not claimed as measured)
  let total = 0;
  SECTIONS.forEach((s) => {
    if (scores[s] != null) total += scores[s];
    else {
      const max = TEPS_CONFIG.sectionMaxScores[s];
      total += Math.round(max * 0.4);
    }
  });

  return {
    score: clamp(total, 0, TEPS_CONFIG.totalMaxScore),
    scores,
    accuracyBySection,
    confidence,
    canEstimate: true,
    demoHeavy: demoRatio > 0.7,
  };
}

export function determineStage({ estimatedScore, targetScore = 327, recentMocks = [] }) {
  const valid = recentMocks.filter((m) => typeof m.score === 'number');

  if (estimatedScore == null && !valid.length) {
    return STAGE_META.foundation;
  }

  const score = estimatedScore ?? valid[0]?.score ?? null;
  if (score == null) return STAGE_META.foundation;

  // Safe Zone: last 3+ valid mocks all >= target
  if (valid.length >= 3) {
    const last3 = valid.slice(0, 3);
    if (last3.every((m) => m.score >= targetScore)) {
      return STAGE_META.safezone;
    }
  }

  if (score >= targetScore) return STAGE_META.target327;
  if (score >= targetScore - 30) return STAGE_META.near327;
  if (score >= targetScore - 80) return STAGE_META.buildup;
  return STAGE_META.foundation;
}

export function computeGapPriorities({ accuracyBySection, knowledgeMap, attempts = [] }) {
  const weakSkills = [];
  const { skillStats } = summarizeAttempts(attempts);

  Object.values(skillStats).forEach((s) => {
    if (s.total < 1) return;
    const acc = s.correct / s.total;
    const weight = SECTION_WEIGHTS[s.section] || 0.6;
    const priority = (1 - acc) * weight;
    weakSkills.push({
      section: s.section,
      skill: s.skill,
      accuracy: Math.round(acc * 100),
      priority,
      source: 'attempts',
    });
  });

  if (knowledgeMap?.sections) {
    Object.entries(knowledgeMap.sections).forEach(([section, items]) => {
      (items || []).forEach((item) => {
        if ((item.mastery ?? 0) > 45) return;
        const weight = SECTION_WEIGHTS[section] || 0.6;
        const priority = ((100 - (item.mastery || 0)) / 100) * weight * 0.85;
        weakSkills.push({
          section,
          skill: item.id,
          label: item.label,
          mastery: item.mastery || 0,
          priority,
          source: 'knowledgeMap',
        });
      });
    });
  }

  // Merge by section:skill
  const merged = new Map();
  weakSkills.forEach((w) => {
    const key = `${w.section}:${w.skill}`;
    const prev = merged.get(key);
    if (!prev || w.priority > prev.priority) merged.set(key, w);
  });

  const ranked = [...merged.values()].sort((a, b) => b.priority - a.priority);

  const sectionAcc = SECTIONS.map((section) => {
    const acc = accuracyBySection?.[section];
    const weight = SECTION_WEIGHTS[section] || 0.6;
    const weakness = acc == null ? 0.55 : 1 - acc / 100;
    return {
      section,
      accuracy: acc,
      priorityScore: weakness * weight,
      level: priorityLabel(weakness * weight),
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    topSkills: ranked.slice(0, 5),
    sectionPriorities: sectionAcc,
  };
}

function priorityLabel(score) {
  if (score >= 0.7) return '최우선';
  if (score >= 0.5) return '높음';
  if (score >= 0.3) return '보통';
  return '낮음';
}

export function levelFromMastery(avg) {
  if (avg == null || Number.isNaN(avg)) return { level: 1, label: '기초' };
  if (avg < 30) return { level: 1, label: '기초' };
  if (avg < 60) return { level: 2, label: '성장' };
  return { level: 3, label: '안정' };
}

export function sectionMasteryAverage(knowledgeMap, section) {
  const items = knowledgeMap?.sections?.[section] || [];
  if (!items.length) return 0;
  return items.reduce((s, i) => s + (i.mastery || 0), 0) / items.length;
}

export { SECTIONS };
