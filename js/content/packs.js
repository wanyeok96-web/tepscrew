/**
 * Content pack loader / statistics
 */

import { fetchJson } from '../utils.js';
import { validateQuestionBank } from '../validator.js';

const MANIFEST_PATH = './data/packs/manifest.json';

export async function loadPackManifest() {
  try {
    return await fetchJson(MANIFEST_PATH);
  } catch {
    return { version: 1, packs: [] };
  }
}

export function normalizePackPayload(raw, packMeta = {}) {
  let questions = [];
  let title = packMeta.title || 'Content Pack';
  let packId = packMeta.id || 'imported-pack';

  if (Array.isArray(raw)) {
    questions = raw;
  } else if (raw && typeof raw === 'object') {
    title = raw.title || raw.name || raw.packName || title;
    packId = raw.id || packId;
    if (Array.isArray(raw.questions)) questions = raw.questions;
    else if (Array.isArray(raw.items)) questions = raw.items;
  }

  const source = packMeta.id || packId || 'tepscrew-pack';
  const stamped = questions.map((q) => ({
    ...q,
    source,
    packId: source,
  }));

  return {
    id: source,
    title,
    version: packMeta.version || raw?.version || 1,
    questions: stamped,
  };
}

export async function loadBuiltinPack(packMeta) {
  const raw = await fetchJson(packMeta.file);
  const pack = normalizePackPayload(raw, packMeta);
  const validation = validateQuestionBank({
    name: pack.title,
    questions: pack.questions,
  });
  return { pack, validation };
}

export async function loadAllBuiltinPacks() {
  const manifest = await loadPackManifest();
  const loaded = [];
  for (const meta of manifest.packs || []) {
    try {
      const result = await loadBuiltinPack(meta);
      loaded.push({ meta, ...result });
    } catch (err) {
      loaded.push({
        meta,
        pack: null,
        validation: { ok: false, errors: [{ id: '-', message: err.message }] },
        error: err.message,
      });
    }
  }
  return { manifest, loaded };
}

export function computeBankStats(questions = []) {
  const stats = {
    total: questions.length,
    bySection: {},
    byDifficulty: {},
    byBand: {},
    byType: {},
    bySource: {},
    target327: 0,
  };

  questions.forEach((q) => {
    stats.bySection[q.section] = (stats.bySection[q.section] || 0) + 1;
    const d = q.difficulty ?? 'unknown';
    stats.byDifficulty[d] = (stats.byDifficulty[d] || 0) + 1;
    const band = q.targetScoreBand || 'unspecified';
    stats.byBand[band] = (stats.byBand[band] || 0) + 1;
    const type = q.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    const src = q.source || 'unknown';
    stats.bySource[src] = (stats.bySource[src] || 0) + 1;
    if (band === '327-target') stats.target327 += 1;
  });

  return stats;
}

export function groupQuestionsBySkill(questions, section) {
  const groups = {};
  questions
    .filter((q) => !section || q.section === section)
    .forEach((q) => {
      const skills = Array.isArray(q.skills) && q.skills.length ? q.skills : [q.type || 'general'];
      skills.forEach((sk) => {
        if (!groups[sk]) groups[sk] = [];
        groups[sk].push(q);
      });
    });
  return groups;
}

export function difficultyLabel(level) {
  if (level <= 2) return '입문';
  if (level === 3) return '핵심';
  return '도전';
}
