/**
 * Load foundation curriculum (manifest + lesson files).
 */

import { fetchJson } from '../utils.js';

const MANIFEST_PATH = './data/foundation/manifest.json';

export async function loadFoundationContent() {
  const manifest = await fetchJson(MANIFEST_PATH);
  const metas = manifest.lessons || [];
  const lessons = [];

  for (const meta of metas) {
    const file = meta.file || `./data/foundation/lessons/${meta.id}.json`;
    const body = await fetchJson(file);
    lessons.push({
      ...meta,
      ...body,
      id: body.id || meta.id,
      order: body.order ?? meta.order,
      title: body.title || meta.title,
      category: body.category || meta.category,
      estimatedMinutes: body.estimatedMinutes ?? meta.estimatedMinutes ?? 12,
      checks: Array.isArray(body.checks) ? body.checks : [],
    });
  }

  lessons.sort((a, b) => (a.order || 0) - (b.order || 0));

  return {
    version: manifest.version || 1,
    demo: false,
    categories: manifest.categories || [],
    lessons,
  };
}

export function getNextFoundationLesson(lessons = [], foundationProgress = {}) {
  const sorted = [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
  const incomplete = sorted.filter((l) => foundationProgress[l.id]?.status !== 'completed');
  if (!incomplete.length) return sorted[sorted.length - 1] || null;

  // Prefer in-progress with low accuracy, else first incomplete by order
  const inProgress = incomplete
    .map((l) => ({ lesson: l, p: foundationProgress[l.id] }))
    .filter((x) => x.p?.status === 'in_progress');
  if (inProgress.length) {
    inProgress.sort(
      (a, b) => (a.p.bestAccuracy ?? a.p.accuracy ?? 100) - (b.p.bestAccuracy ?? b.p.accuracy ?? 100)
    );
    return inProgress[0].lesson;
  }
  return incomplete[0];
}

export function collectFoundationWrongChecks(lessons = [], foundationProgress = {}) {
  const items = [];
  lessons.forEach((lesson) => {
    const wrongIds = foundationProgress[lesson.id]?.wrongCheckIds || [];
    wrongIds.forEach((cid) => {
      const check = (lesson.checks || []).find((c) => c.id === cid);
      if (check) items.push({ lessonId: lesson.id, lessonTitle: lesson.title, check });
    });
  });
  return items;
}
