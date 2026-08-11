import { SKILL_TAXONOMY } from './content/skill-taxonomy.js';
import { getEmbeddedJson } from './content/embedded.js';

/**
 * Shared utilities
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatDate(iso);
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export const STAGE_META = {
  foundation: {
    id: 'foundation',
    label: 'Foundation',
    description: 'TEPS 실전 전에 영어 기본기를 다시 만드는 단계입니다.',
  },
  buildup: {
    id: 'buildup',
    label: 'Build-up',
    description: '기초와 TEPS 유형훈련을 함께 진행하는 단계입니다.',
  },
  near327: {
    id: 'near327',
    label: 'Near 327',
    description: '목표점수에 가까워졌습니다. 취약 영역을 집중적으로 보완하세요.',
  },
  target327: {
    id: 'target327',
    label: 'Target 327',
    description: '목표점수에 도달했습니다.',
  },
  safezone: {
    id: 'safezone',
    label: 'Safe Zone',
    description: '최근 평가에서 안정적으로 목표점수를 넘고 있습니다.',
  },
};

export function resolveStage(profile, targetScore = 327) {
  const stageKey = profile?.currentStage || 'foundation';
  if (STAGE_META[stageKey]) return STAGE_META[stageKey];

  const score = profile?.estimatedScore;
  if (score == null) return STAGE_META.foundation;
  if (score >= targetScore + 20) return STAGE_META.safezone;
  if (score >= targetScore) return STAGE_META.target327;
  if (score >= targetScore - 30) return STAGE_META.near327;
  if (score >= targetScore - 80) return STAGE_META.buildup;
  return STAGE_META.foundation;
}

export const KNOWLEDGE_MAP_TEMPLATE = SKILL_TAXONOMY;

export function createDefaultKnowledgeMap() {
  const map = { id: 'default', updatedAt: new Date().toISOString(), sections: {} };
  Object.entries(KNOWLEDGE_MAP_TEMPLATE).forEach(([section, items]) => {
    map.sections[section] = items.map((item) => ({
      ...item,
      mastery: 0,
    }));
  });
  return map;
}

export async function fetchJson(path) {
  const embedded = getEmbeddedJson(path);
  if (embedded !== undefined) {
    try {
      return structuredClone(embedded);
    } catch {
      return JSON.parse(JSON.stringify(embedded));
    }
  }

  // file:// cannot fetch local JSON — embedded data is required
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    throw new Error(`내장 데이터를 찾을 수 없습니다: ${path}`);
  }

  const res = await fetch(path);
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${path}`);
  return res.json();
}
