/**
 * localStorage helpers for settings and lightweight preferences
 */

const SETTINGS_KEY = 'tepscrew:settings';
const PROFILE_KEY = 'tepscrew:profile';
const META_KEY = 'tepscrew:meta';
const AI_SESSION_KEY = 'tepscrew:aiSessionKeys';

export const DEFAULT_SETTINGS = {
  targetScore: 327,
  dailyStudyMinutes: 30,
  explanationMode: 'manual',
  welcomeSeen: false,
  ai: {
    enabled: false,
    provider: 'claude',
    model: '',
    apiKey: '',
    keyStorage: 'local', // local | session
    keys: {
      openai: '',
      claude: '',
      gemini: '',
    },
  },
};

export const DEFAULT_PROFILE = {
  diagnosisCompleted: false,
  currentStage: 'foundation',
  estimatedScore: null,
  highestScore: null,
  level: {
    listening: 1,
    vocabulary: 1,
    grammar: 1,
    reading: 1,
  },
  demoMode: false,
  scoreConfidence: null,
};

function safeParse(raw, fallback) {
  try {
    if (!raw) return structuredClone(fallback);
    return deepMerge(structuredClone(fallback), JSON.parse(raw));
  } catch {
    return structuredClone(fallback);
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  Object.keys(patch).forEach((k) => {
    if (
      patch[k] &&
      typeof patch[k] === 'object' &&
      !Array.isArray(patch[k]) &&
      base[k] &&
      typeof base[k] === 'object'
    ) {
      base[k] = deepMerge(base[k], patch[k]);
    } else if (patch[k] !== undefined) {
      base[k] = patch[k];
    }
  });
  return base;
}

function loadSessionKeys() {
  try {
    return JSON.parse(sessionStorage.getItem(AI_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSessionKeys(keys) {
  try {
    sessionStorage.setItem(AI_SESSION_KEY, JSON.stringify(keys || {}));
  } catch {
    /* ignore */
  }
}

export function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const settings = safeParse(raw, DEFAULT_SETTINGS);
  settings.ai = deepMerge(structuredClone(DEFAULT_SETTINGS.ai), settings.ai || {});

  // Migrate legacy single apiKey into provider key slot
  if (settings.ai.apiKey && settings.ai.provider && !settings.ai.keys?.[settings.ai.provider]) {
    settings.ai.keys = settings.ai.keys || {};
    settings.ai.keys[settings.ai.provider] = settings.ai.apiKey;
  }

  if (settings.ai.keyStorage === 'session') {
    const sessionKeys = loadSessionKeys();
    settings.ai.keys = { ...settings.ai.keys, ...sessionKeys };
    const p = settings.ai.provider;
    settings.ai.apiKey = settings.ai.keys[p] || '';
  } else {
    settings.ai.apiKey = settings.ai.keys?.[settings.ai.provider] || settings.ai.apiKey || '';
  }

  if (typeof settings.targetScore !== 'number' || settings.targetScore < 1) {
    settings.targetScore = 327;
  }
  if (typeof settings.dailyStudyMinutes !== 'number') {
    settings.dailyStudyMinutes = 30;
  }
  return settings;
}

export function saveSettings(settings) {
  const next = deepMerge(structuredClone(DEFAULT_SETTINGS), settings || {});
  next.ai = deepMerge(structuredClone(DEFAULT_SETTINGS.ai), settings?.ai || {});

  const provider = next.ai.provider || 'claude';
  next.ai.keys = next.ai.keys || { openai: '', claude: '', gemini: '' };

  // Keep current provider key synced with apiKey field
  if (typeof next.ai.apiKey === 'string') {
    next.ai.keys[provider] = next.ai.apiKey;
  }

  if (next.ai.keyStorage === 'session') {
    saveSessionKeys(next.ai.keys);
    // Do not persist secrets in localStorage
    const localCopy = deepMerge(structuredClone(next), {});
    localCopy.ai.keys = { openai: '', claude: '', gemini: '' };
    localCopy.ai.apiKey = '';
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(localCopy));
  } else {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearAiKeys(settings) {
  const next = loadSettings();
  const merged = {
    ...next,
    ...settings,
    ai: {
      ...next.ai,
      ...(settings?.ai || {}),
      apiKey: '',
      keys: { openai: '', claude: '', gemini: '' },
      enabled: false,
    },
  };
  try {
    sessionStorage.removeItem(AI_SESSION_KEY);
  } catch {
    /* ignore */
  }
  return saveSettings(merged);
}

export function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  const profile = safeParse(raw, DEFAULT_PROFILE);
  profile.level = { ...DEFAULT_PROFILE.level, ...(profile.level || {}) };
  return profile;
}

export function saveProfile(profile) {
  const next = {
    ...DEFAULT_PROFILE,
    ...profile,
    level: { ...DEFAULT_PROFILE.level, ...(profile.level || {}) },
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  return meta;
}

export function clearLocalStorageData() {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(META_KEY);
  try {
    sessionStorage.removeItem(AI_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
