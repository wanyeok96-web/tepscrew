/**
 * Hash-based SPA router
 */

const ROUTES = {
  home: { page: 'home', title: '홈' },
  guide: { page: 'guide', title: 'TEPS 가이드' },
  foundation: { page: 'foundation', title: '기초학습' },
  lesson: { page: 'lesson', title: 'Lesson' },
  'lesson-quiz': { page: 'lesson-quiz', title: '기초 미니 퀴즈' },
  teps: { page: 'teps', title: 'TEPS 학습' },
  vocabulary: { page: 'vocabulary', title: 'Vocabulary' },
  practice: { page: 'practice', title: '문제훈련' },
  'practice-quiz': { page: 'practice-quiz', title: '문제풀이' },
  'practice-result': { page: 'practice-result', title: '풀이 결과' },
  'target-preview': { page: 'target-preview', title: '327 Target' },
  mock: { page: 'mock', title: '모의고사' },
  'mock-guide': { page: 'mock-guide', title: '모의고사 안내' },
  'mock-exam': { page: 'mock-exam', title: '모의고사 진행' },
  'mock-result': { page: 'mock-result', title: '모의고사 결과' },
  diagnosis: { page: 'diagnosis', title: 'Quick Diagnosis' },
  review: { page: 'review', title: '오답·복습' },
  'my-teps': { page: 'my-teps', title: 'My TEPS' },
  settings: { page: 'settings', title: '설정' },
};

export function parseHash() {
  const raw = (location.hash || '#home').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart || 'home';
  const params = {};

  queryPart.split('&').forEach((pair) => {
    if (!pair) return;
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  });

  // support #lesson/F-001
  const segments = path.split('/').filter(Boolean);
  const base = segments[0] || 'home';
  if (segments[1]) params.id = segments[1];

  const route = ROUTES[base];
  if (!route) {
    return { page: 'not-found', title: '페이지 없음', params, path: base };
  }

  return { ...route, params, path: base };
}

export function navigate(path, params = {}) {
  const query = Object.entries(params)
    .filter(([k, v]) => v != null && k !== 'id')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  let hash = `#${path}`;
  if (params.id) hash = `#${path}/${params.id}`;
  if (query) hash += `?${query}`;
  location.hash = hash;
}

export function startRouter(onChange) {
  const handle = () => {
    const route = parseHash();
    onChange(route);
  };

  window.addEventListener('hashchange', handle);
  handle();

  return () => window.removeEventListener('hashchange', handle);
}

export function getNavItems() {
  return [
    { id: 'home', label: '홈', emoji: '🏠', icon: 'home', href: '#home' },
    { id: 'guide', label: '가이드', emoji: '🗺️', icon: 'guide', href: '#guide' },
    { id: 'foundation', label: '기초학습', emoji: '🧱', icon: 'foundation', href: '#foundation' },
    { id: 'teps', label: 'TEPS 학습', emoji: '📘', icon: 'teps', href: '#teps' },
    { id: 'practice', label: '문제훈련', emoji: '✏️', icon: 'practice', href: '#practice' },
    { id: 'mock', label: '모의고사', emoji: '📝', icon: 'mock', href: '#mock' },
    { id: 'review', label: '오답·복습', emoji: '🔁', icon: 'review', href: '#review' },
    { id: 'my-teps', label: 'My TEPS', emoji: '📊', icon: 'chart', href: '#my-teps' },
    { id: 'settings', label: '설정', emoji: '⚙️', icon: 'settings', href: '#settings' },
  ];
}

export { ROUTES };
