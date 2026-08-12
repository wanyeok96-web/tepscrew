(() => {
  // js/storage.js
  var SETTINGS_KEY = "tepscrew:settings";
  var PROFILE_KEY = "tepscrew:profile";
  var META_KEY = "tepscrew:meta";
  var AI_SESSION_KEY = "tepscrew:aiSessionKeys";
  var DEFAULT_SETTINGS = {
    targetScore: 327,
    dailyStudyMinutes: 30,
    explanationMode: "manual",
    welcomeSeen: false,
    ai: {
      enabled: false,
      provider: "claude",
      model: "",
      apiKey: "",
      keyStorage: "local",
      // local | session
      keys: {
        openai: "",
        claude: "",
        gemini: ""
      }
    }
  };
  var DEFAULT_PROFILE = {
    diagnosisCompleted: false,
    currentStage: "foundation",
    estimatedScore: null,
    highestScore: null,
    level: {
      listening: 1,
      vocabulary: 1,
      grammar: 1,
      reading: 1
    },
    demoMode: false,
    scoreConfidence: null
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
    if (!patch || typeof patch !== "object") return base;
    Object.keys(patch).forEach((k) => {
      if (patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k]) && base[k] && typeof base[k] === "object") {
        base[k] = deepMerge(base[k], patch[k]);
      } else if (patch[k] !== void 0) {
        base[k] = patch[k];
      }
    });
    return base;
  }
  function loadSessionKeys() {
    try {
      return JSON.parse(sessionStorage.getItem(AI_SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveSessionKeys(keys) {
    try {
      sessionStorage.setItem(AI_SESSION_KEY, JSON.stringify(keys || {}));
    } catch {
    }
  }
  function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const settings = safeParse(raw, DEFAULT_SETTINGS);
    settings.ai = deepMerge(structuredClone(DEFAULT_SETTINGS.ai), settings.ai || {});
    if (settings.ai.apiKey && settings.ai.provider && !settings.ai.keys?.[settings.ai.provider]) {
      settings.ai.keys = settings.ai.keys || {};
      settings.ai.keys[settings.ai.provider] = settings.ai.apiKey;
    }
    if (settings.ai.keyStorage === "session") {
      const sessionKeys = loadSessionKeys();
      settings.ai.keys = { ...settings.ai.keys, ...sessionKeys };
      const p = settings.ai.provider;
      settings.ai.apiKey = settings.ai.keys[p] || "";
    } else {
      settings.ai.apiKey = settings.ai.keys?.[settings.ai.provider] || settings.ai.apiKey || "";
    }
    if (typeof settings.targetScore !== "number" || settings.targetScore < 1) {
      settings.targetScore = 327;
    }
    if (typeof settings.dailyStudyMinutes !== "number") {
      settings.dailyStudyMinutes = 30;
    }
    return settings;
  }
  function saveSettings(settings) {
    const next = deepMerge(structuredClone(DEFAULT_SETTINGS), settings || {});
    next.ai = deepMerge(structuredClone(DEFAULT_SETTINGS.ai), settings?.ai || {});
    const provider = next.ai.provider || "claude";
    next.ai.keys = next.ai.keys || { openai: "", claude: "", gemini: "" };
    if (typeof next.ai.apiKey === "string") {
      next.ai.keys[provider] = next.ai.apiKey;
    }
    if (next.ai.keyStorage === "session") {
      saveSessionKeys(next.ai.keys);
      const localCopy = deepMerge(structuredClone(next), {});
      localCopy.ai.keys = { openai: "", claude: "", gemini: "" };
      localCopy.ai.apiKey = "";
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(localCopy));
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
    return next;
  }
  function clearAiKeys(settings) {
    const next = loadSettings();
    const merged = {
      ...next,
      ...settings,
      ai: {
        ...next.ai,
        ...settings?.ai || {},
        apiKey: "",
        keys: { openai: "", claude: "", gemini: "" },
        enabled: false
      }
    };
    try {
      sessionStorage.removeItem(AI_SESSION_KEY);
    } catch {
    }
    return saveSettings(merged);
  }
  function loadProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    const profile = safeParse(raw, DEFAULT_PROFILE);
    profile.level = { ...DEFAULT_PROFILE.level, ...profile.level || {} };
    return profile;
  }
  function saveProfile(profile) {
    const next = {
      ...DEFAULT_PROFILE,
      ...profile,
      level: { ...DEFAULT_PROFILE.level, ...profile.level || {} }
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    return next;
  }
  function clearLocalStorageData() {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(META_KEY);
    try {
      sessionStorage.removeItem(AI_SESSION_KEY);
    } catch {
    }
  }

  // js/db.js
  var DB_NAME = "tepscrew-db";
  var DB_VERSION = 3;
  var STORES = [
    "questionBank",
    "vocabulary",
    "learningRecords",
    "reviewQueue",
    "mockTests",
    "knowledgeMap",
    "profile",
    "foundationProgress",
    "aiCache",
    "customVocabulary",
    "contentPacks"
  ];
  var dbPromise = null;
  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) {
      store.createIndex(name, keyPath, options || { unique: false });
    }
  }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 IndexedDB\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("IndexedDB\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onblocked = () => {
        console.error("IndexedDB upgrade blocked by another tab");
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;
        STORES.forEach((name) => {
          let store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: "id" });
          } else {
            store = tx.objectStore(name);
          }
          if (name === "questionBank") {
            ensureIndex(store, "section", "section");
            ensureIndex(store, "type", "type");
            ensureIndex(store, "difficulty", "difficulty");
            ensureIndex(store, "targetScoreBand", "targetScoreBand");
          }
          if (name === "learningRecords") {
            ensureIndex(store, "createdAt", "createdAt");
            ensureIndex(store, "type", "type");
            ensureIndex(store, "recordType", "recordType");
            ensureIndex(store, "sessionId", "sessionId");
            ensureIndex(store, "questionId", "questionId");
          }
          if (name === "reviewQueue") {
            ensureIndex(store, "status", "status");
            ensureIndex(store, "type", "type");
            ensureIndex(store, "nextReview", "nextReview");
          }
          if (name === "vocabulary") {
            ensureIndex(store, "status", "status");
            ensureIndex(store, "nextReview", "nextReview");
          }
          if (name === "mockTests") {
            ensureIndex(store, "type", "type");
            ensureIndex(store, "createdAt", "createdAt");
          }
          if (name === "aiCache") {
            ensureIndex(store, "expiresAt", "expiresAt");
          }
          if (name === "customVocabulary") {
            ensureIndex(store, "word", "word");
            ensureIndex(store, "status", "status");
          }
          if (name === "contentPacks") {
            ensureIndex(store, "source", "source");
          }
        });
      };
    });
    return dbPromise;
  }
  async function initDB() {
    const db = await openDB();
    return db;
  }
  function txStore(db, storeName, mode = "readonly") {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }
  async function addItem(storeName, item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const store = txStore(db, storeName, "readwrite");
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function putItem(storeName, item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const store = txStore(db, storeName, "readwrite");
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function getItem(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const store = txStore(db, storeName, "readonly");
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  async function getAllItems(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const store = txStore(db, storeName, "readonly");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const store = txStore(db, storeName, "readwrite");
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  async function clearAllStores() {
    for (const name of STORES) {
      await clearStore(name);
    }
  }
  async function exportAllData() {
    const data = {};
    for (const name of STORES) {
      data[name] = await getAllItems(name);
    }
    return data;
  }
  async function importStoreData(storeName, items, { clearFirst = false } = {}) {
    if (clearFirst) await clearStore(storeName);
    for (const item of items) {
      await putItem(storeName, item);
    }
    return items.length;
  }

  // js/content/skill-taxonomy.js
  var SKILL_TAXONOMY = {
    vocabulary: [
      { id: "context", label: "Context" },
      { id: "collocation", label: "Collocation" },
      { id: "phrasal-verb", label: "Phrasal Verb" },
      { id: "synonym", label: "Synonym" },
      { id: "word-form", label: "Word Form" },
      { id: "expression", label: "Expression" },
      { id: "idiom", label: "Idiom" }
    ],
    grammar: [
      { id: "tense", label: "\uC2DC\uC81C" },
      { id: "agreement", label: "\uC218\uC77C\uCE58" },
      { id: "relative", label: "\uAD00\uACC4\uC0AC" },
      { id: "subjunctive", label: "\uAC00\uC815\uBC95" },
      { id: "conditional", label: "\uC870\uAC74\uBB38" },
      { id: "participle", label: "\uBD84\uC0AC" },
      { id: "gerund", label: "\uB3D9\uBA85\uC0AC" },
      { id: "infinitive", label: "\uBD80\uC815\uC0AC" },
      { id: "passive", label: "\uC218\uB3D9\uD0DC" },
      { id: "comparison", label: "\uBE44\uAD50" },
      { id: "conjunction", label: "\uC811\uC18D\uC0AC" },
      { id: "pronoun", label: "\uB300\uBA85\uC0AC" },
      { id: "article", label: "\uAD00\uC0AC" },
      { id: "preposition", label: "\uC804\uCE58\uC0AC" },
      { id: "noun-clause", label: "\uBA85\uC0AC\uC808" },
      { id: "adverbial-clause", label: "\uBD80\uC0AC\uC808" },
      { id: "inversion", label: "\uB3C4\uCE58" },
      { id: "parallelism", label: "\uBCD1\uB82C\uAD6C\uC870" },
      { id: "causative", label: "\uC0AC\uC5ED" },
      { id: "sentence-structure", label: "\uBB38\uC7A5\uAD6C\uC870" },
      { id: "error-identification", label: "\uC624\uB958 \uCC3E\uAE30" }
    ],
    reading: [
      { id: "main-idea", label: "Main Idea" },
      { id: "detail", label: "Detail" },
      { id: "inference", label: "Inference" },
      { id: "blank", label: "Blank" },
      { id: "coherence", label: "Coherence" }
    ],
    listening: [
      { id: "response", label: "Response" },
      { id: "dialogue", label: "Dialogue" },
      { id: "detail", label: "Detail" },
      { id: "inference", label: "Inference" }
    ]
  };
  var SKILL_ALIASES = {
    "relative-clause": "relative",
    relativeclause: "relative",
    relatives: "relative",
    "subject-verb": "agreement",
    "subject-verb-agreement": "agreement",
    agr: "agreement",
    mainidea: "main-idea",
    "main_idea": "main-idea",
    "logical-reasoning": "inference",
    logicalreasoning: "inference",
    passives: "passive",
    toinfinitive: "infinitive",
    "to-infinitive": "infinitive",
    gerunds: "gerund",
    participles: "participle",
    subjunctives: "subjunctive",
    blankfill: "blank",
    "blank-fill": "blank",
    collocations: "collocation",
    synonyms: "synonym",
    "synonym-distinction": "synonym",
    synonymdistinction: "synonym",
    expressions: "expression",
    "colloquial-expression": "expression",
    colloquialexpression: "expression",
    colloquial: "expression",
    contexts: "context",
    responses: "response",
    dialogues: "dialogue",
    details: "detail",
    coherences: "coherence",
    inferences: "inference",
    "phrasal-verbs": "phrasal-verb",
    phrasalverb: "phrasal-verb",
    "word-forms": "word-form",
    wordform: "word-form",
    idioms: "idiom",
    "verb-noun-pattern": "collocation",
    verbnounpattern: "collocation",
    "verb-pattern": "collocation",
    "verb-form": "tense",
    verbform: "tense",
    "time-reference": "tense",
    timereference: "tense",
    "error-identification": "error-identification",
    erroridentification: "error-identification",
    "noun-clauses": "noun-clause",
    "adverbial-clauses": "adverbial-clause",
    modifier: "participle",
    structure: "sentence-structure",
    "sentence-structures": "sentence-structure",
    countability: "article",
    parallel: "parallelism",
    causatives: "causative",
    conditionals: "conditional",
    pronouns: "pronoun",
    articles: "article",
    prepositions: "preposition",
    comparisons: "comparison",
    conjunctions: "conjunction"
  };
  function canonicalizeSkill(section, skill) {
    if (!skill) return null;
    let key = String(skill).trim();
    if (!key) return null;
    key = key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-");
    const compact = key.replace(/-/g, "");
    if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
    if (SKILL_ALIASES[compact]) return SKILL_ALIASES[compact];
    return key;
  }
  function ensureTaxonomyInMap(map) {
    if (!map?.sections) return map;
    Object.entries(SKILL_TAXONOMY).forEach(([section, items]) => {
      if (!map.sections[section]) map.sections[section] = [];
      items.forEach((item) => {
        if (!map.sections[section].find((x) => x.id === item.id)) {
          map.sections[section].push({ ...item, mastery: 0 });
        }
      });
    });
    return map;
  }

  // data/vocabulary.json
  var vocabulary_default = {
    version: 1,
    demo: true,
    words: [
      {
        id: "V-001",
        word: "retain",
        meaning: "\uC720\uC9C0\uD558\uB2E4, \uBCF4\uC720\uD558\uB2E4",
        examples: ["retain information", "retain control"],
        tags: ["academic"],
        difficulty: 2
      },
      {
        id: "V-002",
        word: "enhance",
        meaning: "\uD5A5\uC0C1\uC2DC\uD0A4\uB2E4, \uAC15\uD654\uD558\uB2E4",
        examples: ["enhance performance", "enhance understanding"],
        tags: ["academic"],
        difficulty: 2
      },
      {
        id: "V-003",
        word: "comprise",
        meaning: "~\uB85C \uAD6C\uC131\uB418\uB2E4, \uD3EC\uD568\uD558\uB2E4",
        examples: ["The committee comprises five members.", "comprise a majority"],
        tags: ["academic"],
        difficulty: 3
      },
      {
        id: "V-004",
        word: "substantial",
        meaning: "\uC0C1\uB2F9\uD55C, \uC2E4\uC9C8\uC801\uC778",
        examples: ["a substantial increase", "substantial evidence"],
        tags: ["academic"],
        difficulty: 3
      },
      {
        id: "V-005",
        word: "reluctant",
        meaning: "\uB9C8\uC9C0\uBABB\uD55C, \uAEBC\uB9AC\uB294",
        examples: ["reluctant to admit", "a reluctant participant"],
        tags: ["academic"],
        difficulty: 2
      },
      {
        id: "V-006",
        word: "allocate",
        meaning: "\uD560\uB2F9\uD558\uB2E4, \uBC30\uBD84\uD558\uB2E4",
        examples: ["allocate resources", "allocate time"],
        tags: ["business"],
        difficulty: 3
      },
      {
        id: "V-007",
        word: "precede",
        meaning: "~\uBCF4\uB2E4 \uC55E\uC11C\uB2E4, \uC120\uD589\uD558\uB2E4",
        examples: ["Events that precede the meeting", "precede by a short introduction"],
        tags: ["academic"],
        difficulty: 3
      },
      {
        id: "V-008",
        word: "ambiguous",
        meaning: "\uBAA8\uD638\uD55C, \uC560\uB9E4\uD55C",
        examples: ["an ambiguous statement", "ambiguous results"],
        tags: ["academic"],
        difficulty: 3
      }
    ]
  };

  // data/grammar.json
  var grammar_default = {
    version: 1,
    demo: true,
    questions: [
      {
        id: "G-AGR-0001",
        section: "grammar",
        part: 1,
        type: "agreement",
        difficulty: 2,
        targetScoreBand: "foundation",
        tags: ["\uC218\uC77C\uCE58"],
        question: "Choose the correct verb form.",
        passage: "Neither of the proposals ____ acceptable to the board.",
        choices: ["are", "is", "were", "have been"],
        answer: 1,
        explanation: {
          summary: "Neither of + \uBCF5\uC218\uBA85\uC0AC \uB4A4\uC5D0\uB294 \uB2E8\uC218 \uB3D9\uC0AC\uAC00 \uC635\uB2C8\uB2E4.",
          evidence: "Neither of the proposals \u2192 \uB2E8\uC218 \uCDE8\uAE09",
          choiceAnalysis: [
            "are: \uBCF5\uC218 \uB3D9\uC0AC\uB85C \uC218\uC77C\uCE58 \uC624\uB958",
            "is: \uC62C\uBC14\uB978 \uB2E8\uC218 \uB3D9\uC0AC",
            "were: \uACFC\uAC70\xB7\uBCF5\uC218\uB85C \uBD80\uC801\uC808",
            "have been: \uBCF5\uC218\xB7\uC2DC\uC81C \uBAA8\uB450 \uBD80\uC801\uC808"
          ]
        },
        vocabulary: [],
        skills: ["agreement"]
      },
      {
        id: "G-PASS-0001",
        section: "grammar",
        part: 1,
        type: "passive",
        difficulty: 2,
        targetScoreBand: "foundation",
        tags: ["\uC218\uB3D9\uD0DC"],
        question: "Select the grammatically correct sentence.",
        passage: "",
        choices: [
          "The report was written by the intern yesterday.",
          "The report written by the intern yesterday.",
          "The report was writing by the intern yesterday.",
          "The report has wrote by the intern yesterday."
        ],
        answer: 0,
        explanation: {
          summary: "\uC218\uB3D9\uD0DC\uB294 be + \uACFC\uAC70\uBD84\uC0AC \uD615\uD0DC\uC785\uB2C8\uB2E4.",
          evidence: "was written = \uC218\uB3D9\uD0DC \uACFC\uAC70",
          choiceAnalysis: [
            "\uC62C\uBC14\uB978 \uC218\uB3D9\uD0DC \uACFC\uAC70\uD615",
            "\uB3D9\uC0AC\uAC00 \uC5C6\uC5B4 \uBB38\uC7A5\uC774 \uBD88\uC644\uC804",
            "was writing\uC740 \uC9C4\uD589\uD615\uC774\uBA70 by\uC640 \uC5B4\uC6B8\uB9AC\uC9C0 \uC54A\uC74C",
            "has wrote\uB294 \uACFC\uAC70\uBD84\uC0AC \uD615\uD0DC \uC624\uB958"
          ]
        },
        vocabulary: [],
        skills: ["passive"]
      },
      {
        id: "G-REL-0001",
        section: "grammar",
        part: 1,
        type: "relative",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: ["\uAD00\uACC4\uC0AC"],
        question: "Choose the word that best completes the sentence.",
        passage: "The researcher ____ findings were published last month will speak today.",
        choices: ["who", "whom", "whose", "which"],
        answer: 2,
        explanation: {
          summary: "\uC18C\uC720\uACA9\uC744 \uB098\uD0C0\uB0B4\uB294 \uAD00\uACC4\uC0AC whose\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
          evidence: "whose findings = \uADF8 \uC5F0\uAD6C\uC790\uC758 \uC5F0\uAD6C \uACB0\uACFC",
          choiceAnalysis: [
            "who: \uC8FC\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC",
            "whom: \uBAA9\uC801\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC",
            "whose: \uC18C\uC720\uACA9\uC73C\uB85C \uC62C\uBC14\uB984",
            "which: \uC0AC\uBB3C \uC120\uD589\uC0AC\uC5D0 \uC8FC\uB85C \uC0AC\uC6A9"
          ]
        },
        vocabulary: [],
        skills: ["relative"]
      }
    ]
  };

  // data/reading.json
  var reading_default = {
    version: 1,
    demo: true,
    questions: [
      {
        id: "R-INF-0001",
        section: "reading",
        part: 1,
        type: "inference",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: ["inference"],
        question: "What can be inferred from the passage?",
        passage: "For years, the city's public libraries operated primarily as quiet places for borrowing books. Recently, however, many branches have begun offering evening workshops on digital skills, job applications, and small-business planning. Attendance has grown steadily, especially among adults who returned to learning after long gaps in formal education. Librarians report that visitors now stay longer and ask more questions about practical next steps, not only about book recommendations.",
        choices: [
          "Libraries have completely stopped lending books.",
          "Adult learners are using libraries for practical skill development.",
          "Evening workshops are mainly designed for children.",
          "Librarians prefer visitors to leave quickly."
        ],
        answer: 1,
        explanation: {
          summary: "\uC131\uC778 \uD559\uC2B5\uC790\uB4E4\uC774 \uC2E4\uBB34 \uAE30\uC220 \uC6CC\uD06C\uC20D\uC744 \uC704\uD574 \uB3C4\uC11C\uAD00\uC744 \uD65C\uC6A9\uD558\uACE0 \uC788\uC74C\uC744 \uCD94\uB860\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
          evidence: "evening workshops on digital skills... Attendance has grown... adults who returned to learning",
          choiceAnalysis: [
            "\uB3C4\uC11C \uB300\uCD9C\uC774 \uC911\uB2E8\uB418\uC5C8\uB2E4\uB294 \uADFC\uAC70 \uC5C6\uC74C",
            "\uC131\uC778 \uD559\uC2B5\uC790\uC758 \uC2E4\uBB34 \uD559\uC2B5 \uD65C\uC6A9\uC744 \uC62C\uBC14\uB974\uAC8C \uCD94\uB860",
            "\uC544\uB3D9 \uB300\uC0C1\uC774\uB77C\uB294 \uC5B8\uAE09 \uC5C6\uC74C",
            "\uBC29\uBB38\uAC1D\uC774 \uC624\uB798 \uBA38\uBB38\uB2E4\uACE0 \uD588\uC73C\uBBC0\uB85C \uBC18\uB300"
          ]
        },
        vocabulary: ["attendance", "formal education"],
        skills: ["inference"]
      },
      {
        id: "R-MAIN-0001",
        section: "reading",
        part: 1,
        type: "main-idea",
        difficulty: 2,
        targetScoreBand: "build-up",
        tags: ["main-idea"],
        question: "What is the main idea of the passage?",
        passage: "Short daily review sessions often produce better long-term retention than occasional marathon study. When learners revisit material briefly over several days, the brain repeatedly retrieves information and strengthens memory traces. This approach also reduces fatigue and makes it easier to maintain a study habit.",
        choices: [
          "Marathon study is the most efficient method.",
          "Daily short review improves long-term memory.",
          "Fatigue has no effect on learning.",
          "Learners should avoid reviewing old material."
        ],
        answer: 1,
        explanation: {
          summary: "\uC9E7\uC740 \uB9E4\uC77C \uBCF5\uC2B5\uC774 \uC7A5\uAE30 \uAE30\uC5B5\uC5D0 \uB354 \uD6A8\uACFC\uC801\uC774\uB77C\uB294 \uAC83\uC774 \uC911\uC2EC \uB0B4\uC6A9\uC785\uB2C8\uB2E4.",
          evidence: "Short daily review sessions often produce better long-term retention",
          choiceAnalysis: [
            "\uC9C0\uBB38\uC740 \uB9C8\uB77C\uD1A4 \uD559\uC2B5\uBCF4\uB2E4 \uC9E7\uC740 \uBCF5\uC2B5\uC744 \uAD8C\uD568",
            "\uC911\uC2EC \uB0B4\uC6A9\uC744 \uC815\uD655\uD788 \uBC18\uC601",
            "\uD53C\uB85C\uAC00 \uD559\uC2B5\uC5D0 \uC601\uD5A5\uC774 \uC5C6\uB2E4\uACE0 \uD558\uC9C0 \uC54A\uC74C",
            "\uBCF5\uC2B5\uC744 \uD53C\uD558\uB77C\uB294 \uB0B4\uC6A9\uACFC \uBC18\uB300"
          ]
        },
        vocabulary: ["retention", "retrieve"],
        skills: ["main-idea"]
      },
      {
        id: "R-BLANK-0001",
        section: "reading",
        part: 2,
        type: "blank",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: ["blank"],
        question: "Which option best completes the blank?",
        passage: "Although the new policy aimed to simplify the application process, many applicants still found the instructions confusing. As a result, support staff spent more time answering basic questions, and the expected efficiency gains were ____.",
        choices: ["accelerated", "delayed", "celebrated", "ignored"],
        answer: 1,
        explanation: {
          summary: "\uD63C\uB780\uC73C\uB85C \uC778\uD574 \uAE30\uB300\uD588\uB358 \uD6A8\uC728 \uD5A5\uC0C1\uC774 \uC9C0\uC5F0\uB418\uC5C8\uB2E4\uB294 \uD750\uB984\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
          evidence: "still found the instructions confusing... expected efficiency gains were ____",
          choiceAnalysis: [
            "accelerated: \uD63C\uB780\uACFC \uBC18\uB300 \uACB0\uACFC",
            "delayed: \uBB38\uB9E5\uC0C1 \uAC00\uC7A5 \uC801\uC808",
            "celebrated: \uBD80\uC815\uC801 \uACB0\uACFC\uC640 \uC548 \uB9DE\uC74C",
            "ignored: \uBB38\uC7A5 \uB17C\uB9AC\uC0C1 \uC5B4\uC0C9"
          ]
        },
        vocabulary: ["efficiency"],
        skills: ["blank"]
      }
    ]
  };

  // data/listening.json
  var listening_default = {
    version: 1,
    demo: true,
    questions: [
      {
        id: "L-RESP-0001",
        section: "listening",
        part: 1,
        type: "response",
        difficulty: 2,
        targetScoreBand: "build-up",
        tags: ["response"],
        question: "Choose the best response. (Demo \u2014 script provided instead of audio)",
        passage: "[Script] A: Could you send me the revised schedule by noon?\nB: ____",
        choices: [
          "Sure, I'll email it before lunch.",
          "Yes, I already ate lunch.",
          "The meeting was canceled last week.",
          "I prefer the morning train."
        ],
        answer: 0,
        explanation: {
          summary: "\uC218\uC815 \uC77C\uC815\uC744 \uC815\uC624\uAE4C\uC9C0 \uBCF4\uB0B4\uB2EC\uB77C\uB294 \uC694\uCCAD\uC5D0 \uB300\uD55C \uC801\uC808\uD55C \uC218\uB77D \uC751\uB2F5\uC785\uB2C8\uB2E4.",
          evidence: "send me the revised schedule by noon",
          choiceAnalysis: [
            "\uC694\uCCAD\uC5D0 \uB9DE\uB294 \uC9C1\uC811\uC801 \uC218\uB77D",
            "lunch\uC640 \uAD00\uB828 \uC5C6\uB294 \uC624\uD574",
            "\uC694\uCCAD\uACFC \uBB34\uAD00\uD55C \uC815\uBCF4",
            "\uC8FC\uC81C\uC640 \uBB34\uAD00"
          ]
        },
        vocabulary: ["revised", "schedule"],
        skills: ["response"],
        audio: null
      }
    ]
  };

  // data/guide.json
  var guide_default = {
    version: 1,
    title: "TEPS \uAC00\uC774\uB4DC",
    lede: "\uC2DC\uD5D8 \uAD6C\uC870\uC640 327 \uC900\uBE44 \uD750\uB984, \uD15D\uC2A4\uD06C\uB8E8 \uC0AC\uC6A9 \uC21C\uC11C\uB97C \uD55C\uACF3\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.",
    officialUrl: "https://www.teps.or.kr/",
    officialLabel: "\uACF5\uC2DD TEPS \uC0AC\uC774\uD2B8 (\uC77C\uC815\xB7\uC811\uC218)",
    sections: [
      {
        id: "overview",
        navLabel: "TEPS \uC774\uD574",
        title: "TEPS \uC774\uD574",
        blocks: [
          {
            type: "p",
            text: "TEPS(Test of English Proficiency developed by Seoul National University)\uB294 \uB300\uD559\xB7\uCDE8\uC5C5\xB7\uC790\uAE30\uACC4\uBC1C \uB4F1\uC5D0\uC11C \uC4F0\uC774\uB294 \uC2E4\uC6A9 \uC601\uC5B4 \uB2A5\uB825 \uC2DC\uD5D8\uC785\uB2C8\uB2E4. \uC131\uC778 \uD559\uC2B5\uC790\uAC00 \u2018\uC9C0\uAE08 \uC5BC\uB9C8\uB098 \uC4F8 \uC218 \uC788\uB294\uC9C0\u2019\uB97C \uC601\uC5ED\uBCC4\uB85C \uD655\uC778\uD558\uB294 \uB370 \uB9DE\uCDB0\uC838 \uC788\uC2B5\uB2C8\uB2E4."
          },
          {
            type: "h3",
            text: "\uB124 \uAC00\uC9C0 \uC601\uC5ED"
          },
          {
            type: "ul",
            items: [
              "Listening \u2014 \uC9E7\uC740 \uC751\uB2F5\xB7\uB300\uD654\xB7\uB2F4\uD654\uC5D0\uC11C \uC0C1\uD669\uACFC \uC694\uC9C0\uB97C \uB4E3\uC2B5\uB2C8\uB2E4.",
              "Vocabulary \u2014 \uBB38\uB9E5\xB7\uC5F0\uC5B4\xB7\uAD6C\uB3D9\uC0AC \uB4F1 \u2018\uC544\uB294 \uB2E8\uC5B4\u2019\uB97C \u2018\uC4F8 \uC218 \uC788\uB294 \uB2E8\uC5B4\u2019\uB85C \uBC14\uAFC9\uB2C8\uB2E4.",
              "Grammar \u2014 \uC218\uC77C\uCE58\xB7\uAD00\uACC4\uC0AC\xB7\uC2DC\uC81C\uCC98\uB7FC \uC790\uC8FC \uB098\uC624\uB294 \uD328\uD134\uC744 \uC815\uD655\uD788 \uACE0\uB985\uB2C8\uB2E4.",
              "Reading \u2014 \uC694\uC9C0\xB7\uC138\uBD80\xB7\uCD94\uB860\xB7\uBE48\uCE78\xB7\uC77C\uAD00\uC131 \uB4F1\uC73C\uB85C \uAE00\uC744 \uBE60\uB974\uAC8C \uC77D\uC2B5\uB2C8\uB2E4."
            ]
          },
          {
            type: "p",
            text: "\uD15D\uC2A4\uD06C\uB8E8\uC758 Listening / Vocabulary / Grammar / Reading \uBA54\uB274\uB294 \uC704 \uC601\uC5ED\uACFC \uAC19\uC740 \uCD95\uC73C\uB85C \uB9DE\uCDB0 \uB450\uC5C8\uC2B5\uB2C8\uB2E4."
          },
          {
            type: "h3",
            text: "\uC65C 327 Target\uC778\uAC00"
          },
          {
            type: "p",
            text: "\uC774 \uC571\uC758 \uAE30\uBCF8 \uBAA9\uD45C\uB294 TEPS 327\uC810\uC785\uB2C8\uB2E4. \uC124\uC815\uC5D0\uC11C \uBAA9\uD45C \uC810\uC218\uB97C \uBC14\uAFC0 \uC218 \uC788\uC9C0\uB9CC, \uCF58\uD150\uCE20\xB7\uCD94\uCC9C\xB7327 Target \uD6C8\uB828\uC740 327\uC744 \uAE30\uC900\uC73C\uB85C \uC124\uACC4\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \u2018\uC644\uBCBD\uD55C \uC6D0\uC5B4\uBBFC\u2019\uC774 \uC544\uB2C8\uB77C, \uACF5\uBC31\uC774 \uAE38\uC5B4\uB3C4 \uB2E4\uC2DC \uC313\uC544 \uC62C\uB9B4 \uC218 \uC788\uB294 \uC2E4\uC9C8 \uBAA9\uD45C\uB85C \uC7A1\uC544 \uB454 \uAE30\uC900\uC810\uC785\uB2C8\uB2E4."
          },
          {
            type: "callout",
            variant: "notice",
            text: "\uC571\uC5D0 \uD45C\uC2DC\uB418\uB294 \uC608\uC0C1\uC810\uC218\uB294 \uD559\uC2B5\uC6A9 \uCD94\uC815\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uC131\uC801\uC774 \uC544\uB2C8\uBA70, \uB0B4\uC7A5 \uBB38\uD56D\uB3C4 \uD559\uC2B5\uC6A9 \uC790\uCCB4 \uC81C\uC791 \uCF58\uD150\uCE20\uC785\uB2C8\uB2E4(\uACF5\uC2DD \uAE30\uCD9C \uC544\uB2D8)."
          }
        ],
        ctas: [
          { label: "\uBE60\uB978 \uC9C4\uB2E8 \uC2DC\uC791", nav: "diagnosis", primary: true },
          { label: "\uAE30\uCD08\uD559\uC2B5\uC73C\uB85C", nav: "foundation" }
        ]
      },
      {
        id: "prep",
        navLabel: "\uC900\uBE44 \uBC29\uBC95",
        title: "\uC900\uBE44 \uBC29\uBC95",
        blocks: [
          {
            type: "p",
            text: "\uC601\uC5B4 \uACF5\uBC31\uC774 \uAE38\uB2E4\uBA74 \u2018\uCC98\uC74C\uBD80\uD130 \uBAA8\uC758\uACE0\uC0AC\u2019\uBCF4\uB2E4 \uAE30\uCD08\uB97C \uBA3C\uC800 \uD68C\uBCF5\uD558\uB294 \uD3B8\uC774 \uD6A8\uC728\uC801\uC785\uB2C8\uB2E4. \uB9CE\uC774 \uD478\uB294 \uAC83\uBCF4\uB2E4, \uD2C0\uB9B0 \uC774\uC720\uB97C \uB0A8\uAE30\uACE0 \uB2E4\uC2DC \uAEBC\uB0B4\uB294 \uCABD\uC774 327\uC5D0 \uAC00\uAE5D\uC2B5\uB2C8\uB2E4."
          },
          {
            type: "h3",
            text: "\uD559\uC2B5 \uC21C\uD658"
          },
          {
            type: "ol",
            items: [
              "\uAE30\uCD08 \uD68C\uBCF5 \u2014 \uBB38\uC7A5 \uBF08\uB300\xB7\uC790\uC8FC \uC4F0\uB294 \uC5B4\uD718\uB97C \uB2E4\uC2DC \uC5F0\uACB0\uD569\uB2C8\uB2E4.",
              "\uC601\uC5ED \uD6C8\uB828 \u2014 Vocabulary\xB7Grammar\uBD80\uD130 \uBD84\uB7C9\uC744 \uC313\uACE0 Listening\xB7Reading\uC744 \uBD99\uC785\uB2C8\uB2E4.",
              "\uC57D\uC810 \uC9D1\uC911 \u2014 \uC624\uB2F5\xB7\uBCF5\uC2B5\uACFC 327 Target\uC73C\uB85C \uB0AE\uC740 \uC219\uB828\uB3C4\uB9CC \uACE8\uB77C \uBC18\uBCF5\uD569\uB2C8\uB2E4.",
              "\uBAA8\uC758\uB85C \uC810\uAC80 \u2014 Mini TEPS\uB85C \uC704\uCE58\uB97C \uD655\uC778\uD558\uACE0, \uD544\uC694\uD558\uBA74 Full\uB85C \uC804\uCCB4 \uD750\uB984\uC744 \uBD05\uB2C8\uB2E4."
            ]
          },
          {
            type: "h3",
            text: "\uD558\uB8E8 \uB8E8\uD2F4 \uC608\uC2DC"
          },
          {
            type: "p",
            text: "\uC124\uC815 \uAE30\uBCF8\uAC12\uC740 \uD558\uB8E8 \uC57D 30\uBD84\uC785\uB2C8\uB2E4. \uC544\uB798\uCC98\uB7FC \uC9E7\uAC8C \uB098\uB220\uB3C4 \uB429\uB2C8\uB2E4."
          },
          {
            type: "ul",
            items: [
              "10\uBD84 \u2014 \uAE30\uCD08 Lesson \uB610\uB294 \uC5B4\uD718 \uBCF5\uC2B5",
              "15\uBD84 \u2014 \uBB38\uC81C\uD6C8\uB828 (\uD55C \uC601\uC5ED\uB9CC)",
              "5\uBD84 \u2014 \uC624\uB298 \uD2C0\uB9B0 \uBB38\uD56D \uC624\uB2F5 \uD655\uC778"
            ]
          },
          {
            type: "h3",
            text: "\uC601\uC5ED\uBCC4 \uD55C \uC904 \uC804\uB7B5"
          },
          {
            type: "ul",
            items: [
              "Vocabulary \u2014 \uBAA9\uB85D\uC744 \uB2E4\uC2DC \uC77D\uAE30\uBCF4\uB2E4, \uBCF4\uC9C0 \uC54A\uACE0 \uB5A0\uC62C\uB9AC\uB294 \uC778\uCD9C \uC5F0\uC2B5\uC744 \uC6B0\uC120\uD569\uB2C8\uB2E4.",
              "Grammar \u2014 \uADDC\uCE59\uC744 \uC678\uC6B0\uAE30\uBCF4\uB2E4 \u2018\uC65C \uC774 \uC120\uD0DD\uC774 \uB418\uB294\uAC00\u2019\uB97C \uBB38\uC7A5\uC73C\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.",
              "Reading \u2014 \uC804\uCCB4\uB97C \uBC88\uC5ED\uD558\uAE30\uBCF4\uB2E4 \uC694\uC9C0\xB7\uBE48\uCE78 \uC804\uD6C4 \uB17C\uB9AC\uB97C \uBA3C\uC800 \uC7A1\uC2B5\uB2C8\uB2E4.",
              "Listening \u2014 \uB300\uBCF8 \uC5C6\uC774 \uC0C1\uD669\uC744 \uC608\uCE21\uD55C \uB4A4, \uD544\uC694\uD560 \uB54C\uB9CC transcript\uB85C \uD655\uC778\uD569\uB2C8\uB2E4."
            ]
          }
        ],
        ctas: [
          { label: "\uD648\uC5D0\uC11C \uC624\uB298 \uD559\uC2B5 \uBCF4\uAE30", nav: "home", primary: true }
        ]
      },
      {
        id: "app",
        navLabel: "\uC571 \uC774\uC6A9",
        title: "\uC571 \uC774\uC6A9 \uAC00\uC774\uB4DC",
        blocks: [
          {
            type: "p",
            text: "\uB85C\uADF8\uC778 \uC5C6\uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uBC14\uB85C \uD559\uC2B5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. AI\uB294 \uC120\uD0DD \uC0AC\uD56D\uC774\uBA70, \uC5F0\uACB0\uD558\uC9C0 \uC54A\uC544\uB3C4 \uBB38\uC81C \uD480\uC774\xB7\uD574\uC124\xB7\uBCF5\uC2B5\uC774 \uB3D9\uC791\uD569\uB2C8\uB2E4."
          },
          {
            type: "h3",
            text: "\uCD94\uCC9C \uCCAB \uACBD\uB85C"
          },
          {
            type: "ol",
            items: [
              "\uBE60\uB978 \uC9C4\uB2E8(Quick Diagnosis)\uC73C\uB85C \uC2DC\uC791\uC810\uC744 \uC7A1\uC2B5\uB2C8\uB2E4.",
              "\uD648\uC758 \uC624\uB298 \uD559\uC2B5 \uCD94\uCC9C\uC744 \uB530\uB985\uB2C8\uB2E4.",
              "\uAE30\uCD08\uD559\uC2B5\uC73C\uB85C \uBB38\uC7A5\xB7\uC5B4\uD718 \uAC10\uAC01\uC744 \uD68C\uBCF5\uD569\uB2C8\uB2E4.",
              "TEPS \uD559\uC2B5\xB7\uBB38\uC81C\uD6C8\uB828\uC73C\uB85C \uC601\uC5ED\uBCC4 \uBB38\uD56D\uC744 \uD489\uB2C8\uB2E4.",
              "\uC624\uB2F5\xB7\uBCF5\uC2B5\uC5D0 \uD2C0\uB9B0 \uBB38\uD56D\uC744 \uB0A8\uAE41\uB2C8\uB2E4.",
              "Mini TEPS\uB85C \uC704\uCE58\uB97C \uC810\uAC80\uD558\uACE0, 327 Target\uC73C\uB85C \uC57D\uC810\uC744 \uBA54\uC6C1\uB2C8\uB2E4."
            ]
          },
          {
            type: "h3",
            text: "\uD0ED\uBCC4 \uC5ED\uD560"
          },
          {
            type: "ul",
            items: [
              "\uD648 \u2014 \uC608\uC0C1\uC810\uC218\xB7\uC624\uB298 \uD560 \uC77C\xB7\uC774\uC5B4\uC11C \uD559\uC2B5",
              "\uAC00\uC774\uB4DC \u2014 TEPS \uC774\uD574\xB7\uC900\uBE44\uBC95\xB7\uC774\uC6A9\uBC95 (\uC9C0\uAE08 \uBCF4\uB294 \uD654\uBA74)",
              "\uAE30\uCD08\uD559\uC2B5 \u2014 \uC601\uC5B4 \uBF08\uB300\uB97C \uB2E4\uC2DC \uC313\uB294 Lesson",
              "TEPS \uD559\uC2B5 \u2014 Listening\xB7Vocabulary\xB7Grammar\xB7Reading \uD5C8\uBE0C",
              "\uBB38\uC81C\uD6C8\uB828 \u2014 \uC720\uD615\xB7\uB09C\uC774\uB3C4\uBCC4 \uC5F0\uC2B5\uACFC 327 Target",
              "\uBAA8\uC758\uACE0\uC0AC \u2014 Mini / Full \uD559\uC2B5\uC6A9 \uC810\uAC80",
              "\uC624\uB2F5\xB7\uBCF5\uC2B5 \u2014 \uD2C0\uB9B0 \uBB38\uD56D\uACFC \uB2E8\uC5B4 \uB2E4\uC2DC \uBCF4\uAE30",
              "My TEPS \u2014 \uC219\uB828\uB3C4\xB7\uAE30\uB85D \uC694\uC57D",
              "\uC124\uC815 \u2014 \uBAA9\uD45C\xB7AI Key\xB7\uBC31\uC5C5"
            ]
          },
          {
            type: "h3",
            text: "AI \xB7 \uB370\uC774\uD130"
          },
          {
            type: "ul",
            items: [
              "AI Tutor\uB294 \uC124\uC815\uC5D0\uC11C Provider\uC640 API Key\uB97C \uB123\uC73C\uBA74 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
              "\uD559\uC2B5 \uAE30\uB85D\uC740 \uC774 \uAE30\uAE30\uC758 \uBE0C\uB77C\uC6B0\uC800(IndexedDB)\uC5D0 \uC800\uC7A5\uB429\uB2C8\uB2E4.",
              "\uAE30\uAE30 \uBCC0\uACBD\uC774\uB098 \uCD08\uAE30\uD654\uC5D0 \uB300\uBE44\uD574 \uC124\uC815\uC5D0\uC11C \uD559\uC2B5 \uB370\uC774\uD130 \uBC31\uC5C5\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4."
            ]
          },
          {
            type: "callout",
            variant: "notice",
            text: "\uC608\uC0C1\uC810\uC218\xB7\uBAA8\uC758 \uACB0\uACFC\uB294 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uC785\uB2C8\uB2E4. \uC2DC\uD5D8 \uC77C\uC815\xB7\uC811\uC218\xB7\uADDC\uC815\uC740 \uACF5\uC2DD TEPS \uC0AC\uC774\uD2B8\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694."
          }
        ],
        ctas: [
          { label: "\uBB38\uC81C\uD6C8\uB828 \uC2DC\uC791", nav: "practice", primary: true },
          { label: "\uBAA8\uC758\uACE0\uC0AC \uBCF4\uAE30", nav: "mock" }
        ]
      }
    ]
  };

  // data/packs/manifest.json
  var manifest_default = {
    version: 1,
    packs: [
      {
        id: "tepscrew-pack-001",
        title: "TEPS Crew Pack 001",
        version: 1,
        sections: ["vocabulary", "grammar"],
        questionCount: 50,
        file: "./data/packs/TEPS_Crew_Pack_001.json",
        notes: "Vocabulary 25 + Grammar 25 \xB7 TEPS 327 Target \uD559\uC2B5\uC6A9 \uC790\uCCB4 \uC81C\uC791 \uBB38\uD56D"
      },
      {
        id: "tepscrew-pack-002",
        title: "TEPS Crew Pack 002",
        version: 1,
        sections: ["reading", "listening"],
        questionCount: 22,
        file: "./data/packs/TEPS_Crew_Pack_002.json",
        notes: "Reading 12 + Listening 10 \xB7 TEPS 327 Target \uD559\uC2B5\uC6A9 \uC790\uCCB4 \uC81C\uC791 \uBB38\uD56D"
      },
      {
        id: "tepscrew-pack-kim-reading-0001",
        title: "TEPSCrew Pack kim reading 0001",
        version: 1,
        sections: ["reading"],
        questionCount: 12,
        file: "./data/packs/TEPSCrew_Pack_kim_reading_0001.json",
        notes: "\uC120\uC0DD\uB2D8 \uC81C\uC791(kim) \xB7 Reading 12 \xB7 \uD559\uC2B5\uC6A9 \uC790\uCCB4 \uC81C\uC791"
      }
    ]
  };

  // data/packs/TEPS_Crew_Pack_001.json
  var TEPS_Crew_Pack_001_default = [
    {
      id: "V-PHR-0001",
      section: "vocabulary",
      part: 1,
      type: "phrasal-verb",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["phrasal-verb", "workplace"],
      question: "Choose the option that best completes the blank.",
      passage: "A: I heard you're relocating to Busan next month.\nB: Right. The company asked me to ___ the branch office there.",
      choices: ["take over", "take off", "take up", "take in"],
      answer: 0,
      explanation: {
        summary: "\uC9C0\uC0AC(branch office)\uB97C '\uB9E1\uC544 \uC6B4\uC601\uD55C\uB2E4'\uB294 \uC758\uBBF8\uAC00 \uD544\uC694\uD558\uBBC0\uB85C \uACBD\uC601\uAD8C\xB7\uC5C5\uBB34\uB97C \uC778\uC218\uD55C\uB2E4\uB294 \uB73B\uC758 phrasal verb\uB97C \uACE0\uB978\uB2E4.",
        evidence: "The company asked me to ___ the branch office\uB77C\uB294 \uBB38\uB9E5\uC5D0\uC11C \uBAA9\uC801\uC5B4\uAC00 \uC870\uC9C1(office)\uC774\uBBC0\uB85C '\uC778\uC218\uD558\uB2E4, \uB9E1\uB2E4'\uC758 \uC758\uBBF8\uB9CC \uC131\uB9BD\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. take over\uB294 '(\uC5C5\uBB34\xB7\uC870\uC9C1\xB7\uC5ED\uD560\uC744) \uC778\uACC4\uBC1B\uC544 \uB9E1\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C branch office\uC640 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uACB0\uD569\uD55C\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). take off\uB294 '\uC774\uB959\uD558\uB2E4, (\uC637\uC744) \uBC97\uB2E4, \uD734\uAC00\uB97C \uB0B4\uB2E4'\uB85C \uC870\uC9C1\uC744 \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). take up\uC740 '(\uCDE8\uBBF8\xB7\uACF5\uAC04\xB7\uC2DC\uAC04\uC744) \uCC28\uC9C0\uD558\uB2E4, \uC2DC\uC791\uD558\uB2E4'\uB85C \uC870\uC9C1 \uC6B4\uC601\uC758 \uC758\uBBF8\uAC00 \uC5C6\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). take in\uC740 '\uC774\uD574\uD558\uB2E4, \uBC1B\uC544\uB4E4\uC774\uB2E4, (\uC637\uC744) \uC904\uC774\uB2E4'\uB85C \uBB38\uB9E5\uC5D0 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["take over a business", "take over a role", "take over from someone"],
      synonyms: ["assume control of", "run"],
      confusableWords: ["take off", "take up", "take in"],
      vocabulary: [{ word: "branch office", meaning: "\uC9C0\uC0AC, \uC9C0\uC810" }],
      skills: ["collocation", "context", "phrasal-verb"]
    },
    {
      id: "V-COL-0002",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["collocation", "organization"],
      question: "Choose the option that best completes the blank.",
      passage: "After three hours of debate, the committee finally ___ a decision on next year's budget.",
      choices: ["arrived", "concluded", "reached", "accomplished"],
      answer: 2,
      explanation: {
        summary: "decision\uACFC \uACB0\uD569\uD558\uB294 \uB3D9\uC0AC collocation\uC744 \uBB3B\uB294 \uBB38\uC81C\uB85C, '\uACB0\uB860\uC5D0 \uC774\uB974\uB2E4'\uB97C \uB73B\uD558\uB294 \uB3D9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "\uBE48\uCE78 \uB4A4\uC5D0 \uC804\uCE58\uC0AC \uC5C6\uC774 \uBAA9\uC801\uC5B4 a decision\uC774 \uBC14\uB85C \uC624\uBBC0\uB85C \uD0C0\uB3D9\uC0AC\uB85C decision\uC744 \uCDE8\uD560 \uC218 \uC788\uB294 \uB3D9\uC0AC\uC5EC\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Grammar Trap). arrive\uB294 \uC790\uB3D9\uC0AC\uC5EC\uC11C arrive at a decision\uCC98\uB7FC \uC804\uCE58\uC0AC at\uC774 \uBC18\uB4DC\uC2DC \uD544\uC694\uD558\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). conclude\uB294 conclude a meeting/an agreement\uC5D0\uB294 \uC4F0\uC774\uC9C0\uB9CC conclude a decision\uC740 \uC5B4\uC0C9\uD558\uB2E4.",
          "\uC815\uB2F5. reach a decision\uC740 '(\uB17C\uC758 \uB05D\uC5D0) \uACB0\uC815\uC744 \uB0B4\uB9AC\uB2E4'\uB77C\uB294 \uD45C\uC900 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). accomplish\uB294 goal, task, mission\uACFC \uC5B4\uC6B8\uB9AC\uBA70 decision\uACFC\uB294 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["reach a decision", "reach an agreement", "arrive at a conclusion"],
      synonyms: ["settle on", "come to"],
      confusableWords: ["arrive at", "conclude"],
      vocabulary: [{ word: "committee", meaning: "\uC704\uC6D0\uD68C" }],
      skills: ["collocation", "verb-noun-pattern"]
    },
    {
      id: "V-CTX-0003",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["context", "society"],
      question: "Choose the option that best completes the blank.",
      passage: "The witness's account ___ with the security footage, which cast serious doubt on his testimony.",
      choices: ["contrasted", "conflicted", "competed", "collided"],
      answer: 1,
      explanation: {
        summary: "'\uC9C4\uC220\uC758 \uC2E0\uBE59\uC131\uC774 \uC758\uC2EC\uBC1B\uC558\uB2E4'\uB294 \uACB0\uACFC\uC808\uC774 \uB2E8\uC11C\uC774\uBBC0\uB85C, \uB450 \uC815\uBCF4\uAC00 \uC11C\uB85C '\uBAA8\uC21C\uB41C\uB2E4'\uB294 \uB73B\uC758 \uB3D9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "which cast serious doubt on his testimony\uB294 \uC9C4\uC220\uACFC \uC601\uC0C1\uC774 \uB2E8\uC21C\uD788 \uB2E4\uB978 \uAC83\uC774 \uC544\uB2C8\uB77C \uC11C\uB85C \uC5B4\uAE0B\uB0AC\uC74C\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Partial Match). contrast with\uB294 '\uB300\uC870\uB97C \uC774\uB8E8\uB2E4'\uB85C \uCC28\uC774\uB97C \uBD80\uAC01\uD560 \uBFD0 \uBAA8\uC21C\xB7\uCDA9\uB3CC\uC758 \uC758\uBBF8\uB294 \uC57D\uD574 \uC758\uC2EC\uC758 \uADFC\uAC70\uAC00 \uB418\uAE30 \uC5B4\uB835\uB2E4.",
          "\uC815\uB2F5. conflict with\uB294 '(\uC815\uBCF4\xB7\uC9C4\uC220\uC774) \uC0C1\uCDA9\uD558\uB2E4, \uBAA8\uC21C\uB418\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uC2E0\uBE59\uC131 \uD6FC\uC190\uC774\uB77C\uB294 \uACB0\uACFC\uC640 \uC774\uC5B4\uC9C4\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). compete with\uB294 '\uACBD\uC7C1\uD558\uB2E4'\uB85C \uC0AC\uB78C\xB7\uAE30\uC5C5 \uB4F1\uC774 \uC8FC\uC5B4\uC77C \uB54C \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Context Trap). collide with\uB294 \uC8FC\uB85C \uBB3C\uB9AC\uC801 \uCDA9\uB3CC\uC744 \uC758\uBBF8\uD558\uBA70 \uC9C4\uC220\uACFC \uC601\uC0C1\uC5D0\uB294 \uC4F0\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["conflict with the evidence", "cast doubt on", "conflicting accounts"],
      synonyms: ["contradict", "clash with"],
      confusableWords: ["contrast with", "collide with"],
      vocabulary: [{ word: "account", meaning: "\uC9C4\uC220, \uC124\uBA85" }, { word: "cast doubt on", meaning: "~\uC5D0 \uC758\uBB38\uC744 \uC81C\uAE30\uD558\uB2E4" }],
      skills: ["context", "logical-reasoning", "collocation"]
    },
    {
      id: "V-PHR-0004",
      section: "vocabulary",
      part: 1,
      type: "phrasal-verb",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["phrasal-verb", "schedule"],
      question: "Choose the option that best completes the blank.",
      passage: "A: Aren't we presenting the proposal tomorrow?\nB: Didn't you hear? They ___ the meeting until next Friday.",
      choices: ["put out", "put down", "put away", "put off"],
      answer: 3,
      explanation: {
        summary: "until next Friday\uB77C\uB294 \uC2DC\uAC04 \uD45C\uD604\uC774 \uACB0\uC815\uC801 \uB2E8\uC11C\uB85C, '\uC5F0\uAE30\uD558\uB2E4'\uB97C \uB73B\uD558\uB294 phrasal verb\uB97C \uACE0\uB978\uB2E4.",
        evidence: "\uD68C\uC758\uAC00 \uB2E4\uC74C \uC8FC \uAE08\uC694\uC77C\uAE4C\uC9C0 \uBBF8\uB904\uC84C\uB2E4\uB294 \uD750\uB984\uC774\uBBC0\uB85C \uC77C\uC815 \uC5F0\uAE30\uC758 \uC758\uBBF8\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). put out\uC740 '(\uBD88\uC744) \uB044\uB2E4, \uB0B4\uB193\uB2E4'\uB85C \uC77C\uC815\uC5D0\uB294 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). put down\uC740 '\uB0B4\uB824\uB193\uB2E4, \uC801\uC5B4\uB450\uB2E4, \uC9C4\uC555\uD558\uB2E4'\uB85C \uBB38\uB9E5\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). put away\uB294 '\uCE58\uC6CC \uB450\uB2E4, \uC800\uCD95\uD558\uB2E4'\uB77C\uB294 \uB73B\uC774\uB2E4.",
          "\uC815\uB2F5. put off\uB294 '(\uC77C\uC815\uC744) \uC5F0\uAE30\uD558\uB2E4'\uB85C \uB4A4\uC758 until next Friday\uC640 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC774\uC5B4\uC9C4\uB2E4."
        ]
      },
      collocations: ["put off a meeting", "put off until later", "postpone indefinitely"],
      synonyms: ["postpone", "push back"],
      confusableWords: ["put out", "put down", "put away"],
      vocabulary: [{ word: "proposal", meaning: "\uC81C\uC548(\uC11C)" }],
      skills: ["collocation", "context", "phrasal-verb"]
    },
    {
      id: "V-COL-0005",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["collocation", "work"],
      question: "Choose the option that best completes the blank.",
      passage: "Unless we bring in additional staff, we won't be able to ___ the deadline.",
      choices: ["keep", "meet", "catch", "follow"],
      answer: 1,
      explanation: {
        summary: "deadline\uACFC \uD568\uAED8 \uC4F0\uC774\uB294 \uAE30\uBCF8 \uB3D9\uC0AC collocation\uC744 \uD655\uC778\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "\uC778\uB825\uC774 \uBD80\uC871\uD558\uBA74 '\uAE30\uD55C\uC744 \uC9C0\uD0A4\uC9C0 \uBABB\uD55C\uB2E4'\uB294 \uC758\uBBF8\uC774\uBBC0\uB85C deadline\uC758 \uC9DD\uC774 \uB418\uB294 \uB3D9\uC0AC\uB97C \uACE8\uB77C\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). keep\uC740 keep a promise/an appointment\uC5D0\uB294 \uC4F0\uC774\uC9C0\uB9CC keep the deadline\uC740 \uC790\uC5F0\uC2A4\uB7FD\uC9C0 \uC54A\uB2E4.",
          "\uC815\uB2F5. meet the deadline\uC740 '\uAE30\uD55C\uC744 \uB9DE\uCD94\uB2E4'\uB77C\uB294 \uACE0\uC815 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). catch\uB294 catch a train/a cold\uCC98\uB7FC \uC4F0\uC774\uBA70 deadline\uACFC \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). follow\uB294 follow instructions/a rule\uC5D0 \uC4F0\uC778\uB2E4."
        ]
      },
      collocations: ["meet a deadline", "miss a deadline", "extend a deadline"],
      synonyms: ["make the deadline"],
      confusableWords: ["keep a promise", "follow a rule"],
      vocabulary: [{ word: "bring in", meaning: "(\uC778\uB825\uC744) \uD22C\uC785\uD558\uB2E4, \uC601\uC785\uD558\uB2E4" }],
      skills: ["collocation", "verb-noun-pattern"]
    },
    {
      id: "V-SYN-0006",
      section: "vocabulary",
      part: 2,
      type: "synonym-distinction",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["synonym", "travel"],
      question: "Choose the option that best completes the blank.",
      passage: "Our flight was ___ for nearly three hours because of dense fog at the airport.",
      choices: ["canceled", "suspended", "delayed", "postponed"],
      answer: 2,
      explanation: {
        summary: "'\uC138 \uC2DC\uAC04 \uB3D9\uC548'\uC774\uB77C\uB294 \uC9C0\uC18D \uC2DC\uAC04 \uD45C\uD604\uC774 \uB2E8\uC11C\uC774\uBBC0\uB85C, \uC608\uC815\uBCF4\uB2E4 \uB2A6\uC5B4\uC84C\uC9C0\uB9CC \uACB0\uAD6D \uC9C4\uD589\uB41C \uC0C1\uD669\uC744 \uB098\uD0C0\uB0B4\uB294 \uB2E8\uC5B4\uB97C \uACE0\uB978\uB2E4.",
        evidence: "for nearly three hours\uB294 \uCD9C\uBC1C\uC774 \uADF8\uB9CC\uD07C \uC9C0\uCCB4\uB418\uC5C8\uC74C\uC744 \uB73B\uD558\uBA70, \uC6B4\uD56D \uC790\uCCB4\uAC00 \uC5C6\uC5B4\uC84C\uB2E4\uB294 \uC758\uBBF8\uB294 \uC544\uB2C8\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Reversal). cancel\uC740 \uC544\uC608 \uCDE8\uC18C\uB418\uC5B4 \uC9C4\uD589\uB418\uC9C0 \uC54A\uB294 \uAC83\uC774\uBBC0\uB85C '\uC138 \uC2DC\uAC04 \uB3D9\uC548'\uACFC \uD568\uAED8 \uC4F8 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5(Scope Error). suspend\uB294 \uC6B4\uD56D\xB7\uC11C\uBE44\uC2A4\uB97C \uC77C\uC2DC \uC911\uB2E8\uD558\uB294 \uC81C\uB3C4\uC801 \uC870\uCE58\uB97C \uB73B\uD574 \uAC1C\uBCC4 \uD56D\uACF5\uD3B8\uC758 \uC9C0\uC5F0\uC5D0\uB294 \uC5B4\uC0C9\uD558\uB2E4.",
          "\uC815\uB2F5. delay\uB294 '\uC608\uC815\uBCF4\uB2E4 \uB2A6\uC5B4\uC9C0\uB2E4'\uB85C for + \uAE30\uAC04\uACFC \uACB0\uD569\uD574 \uC9C0\uC5F0 \uC2DC\uAC04\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5(Context Trap). postpone\uC740 \uB2E4\uB978 \uB0A0\uC9DC\xB7\uC2DC\uC810\uC73C\uB85C \uC77C\uC815\uC744 \uB2E4\uC2DC \uC7A1\uB294 \uAC83\uC774\uB77C \uAE30\uC0C1\uC73C\uB85C \uC778\uD55C \uBA87 \uC2DC\uAC04 \uC9C0\uC5F0\uC5D0\uB294 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["be delayed for two hours", "a two-hour delay", "postpone until next week"],
      synonyms: ["hold up"],
      confusableWords: ["delay", "postpone", "cancel", "suspend"],
      vocabulary: [{ word: "dense fog", meaning: "\uC9D9\uC740 \uC548\uAC1C" }],
      skills: ["context", "synonym-distinction"]
    },
    {
      id: "V-CTX-0007",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 3,
      targetScoreBand: "280-330",
      tags: ["context", "education"],
      question: "Choose the option that best completes the blank.",
      passage: "The scholarship is ___ to students who maintain a B average or higher.",
      choices: ["restricted", "reduced", "refused", "removed"],
      answer: 0,
      explanation: {
        summary: "'~\uC778 \uD559\uC0DD\uC5D0\uAC8C\uB9CC \uD574\uB2F9\uB41C\uB2E4'\uB294 \uC790\uACA9 \uC81C\uD55C\uC758 \uC758\uBBF8\uB97C \uB9CC\uB4DC\uB294 \uB2E8\uC5B4\uB97C \uACE0\uB978\uB2E4.",
        evidence: "to students who maintain a B average\uB77C\uB294 \uC870\uAC74\uC808\uC774 \uC218\uD61C \uB300\uC0C1\uC758 \uBC94\uC704\uB97C \uD55C\uC815\uD558\uACE0 \uC788\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. be restricted to\uB294 '~\uB85C \uD55C\uC815\uB418\uB2E4, ~\uC5D0\uAC8C\uB9CC \uC8FC\uC5B4\uC9C0\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uC790\uACA9 \uC694\uAC74\uACFC \uD568\uAED8 \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Keyword Trap). reduce\uB294 \uAE08\uC561\xB7\uADDC\uBAA8\uB97C \uC904\uC774\uB294 \uAC83\uC73C\uB85C be reduced to\uB294 '~\uB85C \uC804\uB77D\uD558\uB2E4'\uB77C\uB294 \uB2E4\uB978 \uC758\uBBF8\uAC00 \uB41C\uB2E4.",
          "\uC624\uB2F5(Reversal). refuse\uB294 '\uAC70\uC808\uD558\uB2E4'\uC774\uBA70 be refused to students\uB77C\uB294 \uD615\uD0DC \uC790\uCCB4\uAC00 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Context Trap). remove\uB294 '\uC81C\uAC70\uD558\uB2E4'\uB85C \uC7A5\uD559\uAE08\uC774 \uC0AC\uB77C\uC84C\uB2E4\uB294 \uC758\uBBF8\uAC00 \uB418\uC5B4 \uC870\uAC74\uC808\uACFC \uB17C\uB9AC\uAC00 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["be restricted to", "be limited to", "maintain an average"],
      synonyms: ["be limited to", "be confined to"],
      confusableWords: ["reduce", "restrict"],
      vocabulary: [{ word: "maintain", meaning: "\uC720\uC9C0\uD558\uB2E4" }],
      skills: ["context", "collocation"]
    },
    {
      id: "V-COL-0008",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["collocation", "city"],
      question: "Choose the option that best completes the blank.",
      passage: "Several residents ___ concerns about the noise coming from the construction site.",
      choices: ["rose", "lifted", "increased", "raised"],
      answer: 3,
      explanation: {
        summary: "concerns\uB97C \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD560 \uC218 \uC788\uB294 \uD0C0\uB3D9\uC0AC\uC774\uC790 '\uBB38\uC81C\uB97C \uC81C\uAE30\uD558\uB2E4'\uB77C\uB294 \uB73B\uC758 \uB3D9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "\uBE48\uCE78 \uB4A4\uC5D0 \uBAA9\uC801\uC5B4 concerns\uAC00 \uBC14\uB85C \uC624\uBBC0\uB85C \uD0C0\uB3D9\uC0AC\uC5EC\uC57C \uD558\uBA70, \uC8FC\uBBFC\uC774 \uC6B0\uB824\uB97C \uD45C\uBA85\uD55C \uC0C1\uD669\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Grammar Trap). rose\uB294 \uC790\uB3D9\uC0AC rise\uC758 \uACFC\uAC70\uD615\uC774\uB77C \uBAA9\uC801\uC5B4 concerns\uB97C \uCDE8\uD560 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). lift\uB294 '\uB4E4\uC5B4 \uC62C\uB9AC\uB2E4, (\uC81C\uC7AC\uB97C) \uD574\uC81C\uD558\uB2E4'\uB85C concerns\uC640 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Partial Match). increase\uB294 '\uC6B0\uB824\uAC00 \uCEE4\uC9C0\uB2E4'\uB77C\uB294 \uB73B\uC740 \uB9CC\uB4E4 \uC218 \uC788\uC73C\uB098, \uC8FC\uBBFC\uC774 \uBB38\uC81C\uB97C '\uC81C\uAE30\uD588\uB2E4'\uB294 \uD589\uC704\uC758 \uC758\uBBF8\uB294 \uC5C6\uB2E4.",
          "\uC815\uB2F5. raise concerns\uB294 '\uC6B0\uB824\uB97C \uC81C\uAE30\uD558\uB2E4'\uB77C\uB294 \uD45C\uC900 collocation\uC774\uB2E4."
        ]
      },
      collocations: ["raise concerns", "raise an issue", "raise a question"],
      synonyms: ["voice", "express"],
      confusableWords: ["rise", "raise", "arise"],
      vocabulary: [{ word: "construction site", meaning: "\uACF5\uC0AC \uD604\uC7A5" }],
      skills: ["collocation", "sentence-structure"]
    },
    {
      id: "V-COQ-0009",
      section: "vocabulary",
      part: 1,
      type: "colloquial",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["colloquial", "university"],
      question: "Choose the option that best completes the blank.",
      passage: "A: How did your presentation go this morning?\nB: Not well. The moment I saw the audience, I completely ___.",
      choices: ["broke out", "blanked out", "blacked out", "burned out"],
      answer: 1,
      explanation: {
        summary: "\uBC1C\uD45C\uAC00 \uC798 \uC548 \uB410\uB2E4\uB294 \uD750\uB984\uC5D0\uC11C '\uBA38\uB9BF\uC18D\uC774 \uD558\uC598\uC84C\uB2E4'\uB294 \uAD6C\uC5B4 \uD45C\uD604\uC744 \uACE0\uB978\uB2E4.",
        evidence: "The moment I saw the audience\uB294 \uAE34\uC7A5\uC73C\uB85C \uC900\uBE44\uD55C \uB0B4\uC6A9\uC774 \uC21C\uAC04\uC801\uC73C\uB85C \uB5A0\uC624\uB974\uC9C0 \uC54A\uC558\uC74C\uC744 \uC2DC\uC0AC\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). break out\uC740 '(\uC804\uC7C1\xB7\uD654\uC7AC\uAC00) \uBC1C\uBC1C\uD558\uB2E4, \uD0C8\uCD9C\uD558\uB2E4'\uB85C \uC0AC\uB78C\uC774 \uC8FC\uC5B4\uC778 \uC774 \uBB38\uB9E5\uC5D0 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. blank out\uC740 '(\uAE34\uC7A5\uD574\uC11C) \uBA38\uB9BF\uC18D\uC774 \uD558\uC598\uC9C0\uB2E4, \uC544\uBB34 \uC0DD\uAC01\uB3C4 \uB098\uC9C0 \uC54A\uB2E4'\uB77C\uB294 \uAD6C\uC5B4 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5(Context Trap). black out\uC740 '\uC758\uC2DD\uC744 \uC783\uB2E4'\uB85C \uC2E4\uC81C \uAE30\uC808\uC744 \uB73B\uD558\uBBC0\uB85C \uC9C0\uB098\uCE58\uAC8C \uAC15\uD55C \uC758\uBBF8\uAC00 \uB41C\uB2E4.",
          "\uC624\uB2F5(Scope Error). burn out\uC740 \uC7A5\uAE30\uAC04 \uACFC\uB85C\uB85C '\uC18C\uC9C4\uB418\uB2E4'\uB77C\uB294 \uB73B\uC774\uB77C \uC21C\uAC04\uC801\uC778 \uBC18\uC751\uC744 \uB098\uD0C0\uB0B4\uC9C0 \uBABB\uD55C\uB2E4."
        ]
      },
      collocations: ["blank out during a test", "draw a blank"],
      synonyms: ["go blank", "freeze up"],
      confusableWords: ["black out", "burn out"],
      vocabulary: [{ word: "audience", meaning: "\uCCAD\uC911" }],
      skills: ["context", "colloquial-expression"]
    },
    {
      id: "V-WFM-0010",
      section: "vocabulary",
      part: 2,
      type: "word-form",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["word-form", "culture"],
      question: "Choose the option that best completes the blank.",
      passage: "Although the novel was written a century ago, its central themes remain strikingly ___.",
      choices: ["reliable", "relative", "relevant", "related"],
      answer: 2,
      explanation: {
        summary: "'\uBC31 \uB144 \uC804 \uC791\uD488\uC774\uC9C0\uB9CC \uC5EC\uC804\uD788'\uB77C\uB294 \uC591\uBCF4\uC758 \uD750\uB984\uC5D0\uC11C '\uC624\uB298\uB0A0\uC5D0\uB3C4 \uC720\uC758\uBBF8\uD55C'\uC774\uB77C\uB294 \uB73B\uC758 \uD615\uC6A9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "Although ~ a century ago\uC640 remain\uC774 \uB300\uBE44\uB97C \uC774\uB8E8\uBA70 \uD604\uC7AC\uC5D0\uB3C4 \uC758\uBBF8\uAC00 \uC788\uB2E4\uB294 \uB0B4\uC6A9\uC744 \uC694\uAD6C\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Keyword Trap). reliable\uC740 '\uBBFF\uC744 \uB9CC\uD55C'\uC73C\uB85C \uC8FC\uC81C\uC758 \uC2DC\uC758\uC131\uACFC\uB294 \uBB34\uAD00\uD558\uB2E4.",
          "\uC624\uB2F5(Keyword Trap). relative\uB294 '\uC0C1\uB300\uC801\uC778'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uBB38\uB9E5\uC774 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. relevant\uB294 '(\uD604\uC7AC \uC0C1\uD669\uACFC) \uAD00\uB828 \uC788\uB294, \uC720\uC758\uBBF8\uD55C'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uC2DC\uB300\uB97C \uB6F0\uC5B4\uB118\uB294 \uAC00\uCE58\uB77C\uB294 \uD750\uB984\uC5D0 \uB9DE\uB294\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). related\uB294 related to\uC758 \uD615\uD0DC\uB85C \uB300\uC0C1\uC774 \uBA85\uC2DC\uB418\uC5B4\uC57C \uD558\uBA70 \uB2E8\uB3C5\uC73C\uB85C\uB294 \uC758\uBBF8\uAC00 \uC644\uC131\uB418\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["remain relevant", "highly relevant to", "be related to"],
      synonyms: ["pertinent", "applicable"],
      confusableWords: ["relevant", "relative", "related", "reliable"],
      vocabulary: [{ word: "strikingly", meaning: "\uB180\uB784 \uB9CC\uD07C, \uB450\uB4DC\uB7EC\uC9C0\uAC8C" }],
      skills: ["context", "word-form"]
    },
    {
      id: "V-COL-0011",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["collocation", "science"],
      question: "Choose the option that best completes the blank.",
      passage: "The article fails to ___ a clear distinction between correlation and causation.",
      choices: ["draw", "pull", "give", "put"],
      answer: 0,
      explanation: {
        summary: "distinction\uACFC \uACB0\uD569\uD558\uB294 \uB3D9\uC0AC\uB97C \uBB3B\uB294 collocation \uBB38\uC81C\uB2E4.",
        evidence: "a clear distinction between A and B\uB77C\uB294 \uAD6C\uC870\uC5D0\uC11C '\uAD6C\uBD84\uC744 \uC9D3\uB2E4'\uB77C\uB294 \uB3D9\uC0AC\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. draw a distinction\uC740 '\uAD6C\uBD84\uC744 \uC9D3\uB2E4'\uB77C\uB294 \uAD00\uC6A9\uC801 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). pull\uC740 \uBB3C\uB9AC\uC801\uC73C\uB85C '\uB2F9\uAE30\uB2E4'\uB77C\uB294 \uB73B\uC774\uBA70 distinction\uACFC \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). give\uB294 give an example/an answer\uC5D0\uB294 \uC4F0\uC774\uC9C0\uB9CC give a distinction\uC740 \uC5B4\uC0C9\uD558\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). put\uC740 put a question\uCC98\uB7FC \uC81C\uD55C\uC801\uC73C\uB85C \uC4F0\uC774\uBA70 \uC774 \uBB38\uB9E5\uC758 \uD45C\uC900 \uD45C\uD604\uC774 \uC544\uB2C8\uB2E4."
        ]
      },
      collocations: ["draw a distinction", "draw a conclusion", "draw a comparison"],
      synonyms: ["make a distinction", "differentiate"],
      confusableWords: ["draw", "give"],
      vocabulary: [{ word: "causation", meaning: "\uC778\uACFC\uAD00\uACC4" }, { word: "correlation", meaning: "\uC0C1\uAD00\uAD00\uACC4" }],
      skills: ["collocation", "logical-reasoning"]
    },
    {
      id: "V-SYN-0012",
      section: "vocabulary",
      part: 2,
      type: "synonym-distinction",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["synonym", "economy"],
      question: "Choose the option that best completes the blank.",
      passage: "Firms that fail to ___ to shifting consumer habits rarely survive more than a decade.",
      choices: ["admit", "afford", "adopt", "adapt"],
      answer: 3,
      explanation: {
        summary: "\uC804\uCE58\uC0AC to\uC640 \uACB0\uD569\uD574 '\uBCC0\uD654\uC5D0 \uC801\uC751\uD558\uB2E4'\uB77C\uB294 \uC758\uBBF8\uB97C \uB9CC\uB4DC\uB294 \uC790\uB3D9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "\uBE48\uCE78 \uB4A4 to shifting consumer habits\uB294 \uBCC0\uD654\uD558\uB294 \uD658\uACBD\uC744 \uAC00\uB9AC\uD0A4\uBA70, \uC5EC\uAE30\uC5D0 \uB9DE\uCDB0 \uC2A4\uC2A4\uB85C\uB97C \uBC14\uAFBC\uB2E4\uB294 \uB73B\uC774 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Keyword Trap). admit\uC740 '\uC778\uC815\uD558\uB2E4, \uC785\uC7A5\uC744 \uD5C8\uAC00\uD558\uB2E4'\uB85C \uBCC0\uD654 \uB300\uC751\uC758 \uC758\uBBF8\uAC00 \uC5C6\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). afford\uB294 '~\uD560 \uC5EC\uC720\uAC00 \uC788\uB2E4'\uB85C \uB4A4\uC5D0 to\uBD80\uC815\uC0AC\uB098 \uBA85\uC0AC \uBAA9\uC801\uC5B4\uAC00 \uC624\uBA70 \uBB38\uB9E5\uC774 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Confusable Word). adopt\uB294 '(\uBC29\uCE68\uC744) \uCC44\uD0DD\uD558\uB2E4'\uB77C\uB294 \uD0C0\uB3D9\uC0AC\uB85C \uC804\uCE58\uC0AC to\uB97C \uCDE8\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. adapt to\uB294 '~\uC5D0 \uC801\uC751\uD558\uB2E4'\uB85C \uBCC0\uD654\uD558\uB294 \uC18C\uBE44 \uC2B5\uAD00\uC5D0 \uB9DE\uCDB0 \uAE30\uC5C5\uC774 \uC2A4\uC2A4\uB85C \uBCC0\uD55C\uB2E4\uB294 \uB73B\uC774 \uB41C\uB2E4."
        ]
      },
      collocations: ["adapt to change", "adopt a policy", "adapt quickly"],
      synonyms: ["adjust to", "accommodate"],
      confusableWords: ["adapt", "adopt", "adept"],
      vocabulary: [{ word: "shifting", meaning: "\uBCC0\uD654\uD558\uB294" }],
      skills: ["collocation", "synonym-distinction", "context"]
    },
    {
      id: "V-CTX-0013",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 4,
      targetScoreBand: "330-400",
      tags: ["context", "society"],
      question: "Choose the option that best completes the blank.",
      passage: "The prosecution's case rested on evidence far too ___ to convince a jury.",
      choices: ["fragile", "brittle", "flimsy", "hollow"],
      answer: 2,
      explanation: {
        summary: "evidence\uB97C \uC218\uC2DD\uD558\uBA74\uC11C '\uC124\uB4DD\uB825\uC774 \uC5C6\uACE0 \uADFC\uAC70\uAC00 \uBE48\uC57D\uD558\uB2E4'\uB294 \uB73B\uC744 \uB098\uD0C0\uB0B4\uB294 \uD615\uC6A9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "too ~ to convince a jury\uB294 \uC99D\uAC70\uC758 \uC124\uB4DD\uB825 \uBD80\uC871\uC744 \uC758\uBBF8\uD558\uBBC0\uB85C '\uBE48\uC57D\uD55C'\uC774\uB77C\uB294 \uD3C9\uAC00\uC5B4\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). fragile\uC740 \uBB3C\uAC74\uC774 '\uAE68\uC9C0\uAE30 \uC26C\uC6B4' \uC0C1\uD0DC\uB098 fragile peace\uCC98\uB7FC \uBD88\uC548\uC815\uD55C \uC0C1\uD669\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Context Trap). brittle\uC740 \uC7AC\uC9C8\uC774 '\uC27D\uAC8C \uBD80\uC11C\uC9C0\uB294'\uC774\uB77C\uB294 \uBB3C\uB9AC\uC801 \uC131\uC9C8\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC815\uB2F5. flimsy evidence\uB294 '\uADFC\uAC70\uAC00 \uBE48\uC57D\uD55C \uC99D\uAC70'\uB77C\uB294 \uACE0\uC815 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Partial Match). hollow\uB294 hollow promise\uCC98\uB7FC '\uACF5\uD5C8\uD55C'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uC8FC\uB85C \uB9D0\xB7\uC57D\uC18D\uC5D0 \uC4F0\uC778\uB2E4."
        ]
      },
      collocations: ["flimsy evidence", "flimsy excuse", "convince a jury"],
      synonyms: ["weak", "unconvincing"],
      confusableWords: ["fragile", "brittle", "flimsy"],
      vocabulary: [{ word: "prosecution", meaning: "\uAC80\uCC30 \uCE21, \uAE30\uC18C" }, { word: "rest on", meaning: "~\uC5D0 \uADFC\uAC70\uB97C \uB450\uB2E4" }],
      skills: ["collocation", "context"]
    },
    {
      id: "V-IDM-0014",
      section: "vocabulary",
      part: 1,
      type: "idiom",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["idiom", "relationships"],
      question: "Choose the option that best completes the blank.",
      passage: "A: Do you think Kevin will finally apologize?\nB: Don't ___ your breath. He's never admitted a mistake in his life.",
      choices: ["hold", "keep", "catch", "save"],
      answer: 0,
      explanation: {
        summary: "'\uAE30\uB300\uD558\uC9C0 \uB9C8\uB77C'\uB294 \uB73B\uC758 \uAD00\uC6A9 \uD45C\uD604\uC744 \uC644\uC131\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "\uB4A4 \uBB38\uC7A5 He's never admitted a mistake\uAC00 \uC0AC\uACFC \uAC00\uB2A5\uC131\uC774 \uD76C\uBC15\uD568\uC744 \uC54C\uB824 \uC8FC\uBBC0\uB85C \uBD80\uC815\uC801 \uAE30\uB300\uB97C \uB098\uD0C0\uB0B4\uB294 \uAD00\uC6A9\uAD6C\uAC00 \uC640\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. Don't hold your breath\uB294 '(\uADF8 \uC77C\uC774 \uC77C\uC5B4\uB098\uB9AC\uB77C\uACE0) \uAE30\uB300\uD558\uC9C0 \uB9C8\uB77C'\uB77C\uB294 \uAD00\uC6A9 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). keep\uC740 keep your word/keep quiet \uB4F1\uC5D0 \uC4F0\uC774\uBA70 breath\uC640 \uACB0\uD569\uD574 \uC774 \uC758\uBBF8\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). catch one's breath\uB294 '\uC228\uC744 \uACE0\uB974\uB2E4'\uB85C \uC758\uBBF8\uAC00 \uC804\uD600 \uB2E4\uB974\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). save one's breath\uB294 '\uB9D0\uD574 \uBD10\uC57C \uC18C\uC6A9\uC5C6\uC73C\uB2C8 \uB9D0\uC744 \uC544\uB07C\uB2E4'\uB85C \uC0C1\uB300\uC758 \uAE30\uB300\uB97C \uACA8\uB0E5\uD55C \uD45C\uD604\uC774 \uC544\uB2C8\uB2E4."
        ]
      },
      collocations: ["don't hold your breath", "catch one's breath", "save your breath"],
      synonyms: ["don't count on it"],
      confusableWords: ["catch one's breath", "save one's breath"],
      vocabulary: [{ word: "admit a mistake", meaning: "\uC798\uBABB\uC744 \uC778\uC815\uD558\uB2E4" }],
      skills: ["colloquial-expression", "context"]
    },
    {
      id: "V-COL-0015",
      section: "vocabulary",
      part: 1,
      type: "collocation",
      difficulty: 2,
      targetScoreBand: "200-280",
      tags: ["collocation", "daily-life"],
      question: "Choose the option that best completes the blank.",
      passage: "A: Is your father home right now?\nB: No, he stepped out to ___ a few errands.",
      choices: ["do", "make", "take", "run"],
      answer: 3,
      explanation: {
        summary: "errands\uC640 \uACB0\uD569\uD558\uB294 \uAE30\uBCF8 \uB3D9\uC0AC collocation\uC744 \uD655\uC778\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "stepped out\uC740 \uBCFC\uC77C\uC744 \uBCF4\uB7EC \uC7A0\uC2DC \uB098\uAC14\uB2E4\uB294 \uB73B\uC774\uBBC0\uB85C '\uC6A9\uBB34\uB97C \uBCF4\uB2E4'\uB77C\uB294 \uD45C\uD604\uC774 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). do\uB294 do the dishes/do homework\uC5D0 \uC4F0\uC774\uBA70 errands\uC640\uB294 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). make\uB294 make a call/make a reservation \uB4F1\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). take\uB294 take a break/take a message \uB4F1\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC815\uB2F5. run errands\uB294 '(\uC740\uD589\xB7\uC6B0\uCCB4\uAD6D \uB4F1\uC5D0\uC11C) \uC7A1\uB2E4\uD55C \uBCFC\uC77C\uC744 \uBCF4\uB2E4'\uB77C\uB294 \uACE0\uC815 \uD45C\uD604\uC774\uB2E4."
        ]
      },
      collocations: ["run errands", "step out", "run an errand for someone"],
      synonyms: ["do chores outside"],
      confusableWords: ["do", "make", "take"],
      vocabulary: [{ word: "errand", meaning: "\uC2EC\uBD80\uB984, \uBCFC\uC77C" }],
      skills: ["collocation"]
    },
    {
      id: "V-COL-0016",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["collocation", "business"],
      question: "Choose the option that best completes the blank.",
      passage: "First-quarter sales ___ short of the targets the board had set in January.",
      choices: ["declined", "fell", "dropped", "lowered"],
      answer: 1,
      explanation: {
        summary: "short of\uC640 \uD568\uAED8 '\uBAA9\uD45C\uC5D0 \uBBF8\uCE58\uC9C0 \uBABB\uD558\uB2E4'\uB77C\uB294 \uAD00\uC6A9 \uD45C\uD604\uC744 \uC644\uC131\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "short of the targets\uB77C\uB294 \uD45C\uD604\uC774 \uACB0\uC815\uC801 \uB2E8\uC11C\uB85C, \uAE30\uC900\uC5D0 \uB3C4\uB2EC\uD558\uC9C0 \uBABB\uD588\uC74C\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Partial Match). decline\uC740 '\uAC10\uC18C\uD558\uB2E4'\uB77C\uB294 \uC758\uBBF8\uB294 \uC788\uC73C\uB098 decline short of\uB77C\uB294 \uACB0\uD569\uC740 \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. fall short of\uB294 '(\uAE30\uB300\xB7\uBAA9\uD45C)\uC5D0 \uBBF8\uCE58\uC9C0 \uBABB\uD558\uB2E4'\uB77C\uB294 \uD45C\uC900 \uAD00\uC6A9\uAD6C\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). drop\uC740 \uC218\uCE58 \uD558\uB77D\uC5D0\uB294 \uC4F0\uC774\uC9C0\uB9CC short of\uC640 \uD568\uAED8 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). lower\uB294 \uD0C0\uB3D9\uC0AC\uB85C '~\uC744 \uB0AE\uCD94\uB2E4'\uB77C\uB294 \uB73B\uC774\uB77C \uC774 \uAD6C\uC870\uC5D0\uC11C \uC8FC\uC5B4 sales\uC640 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["fall short of expectations", "meet a target", "set a target"],
      synonyms: ["fail to reach"],
      confusableWords: ["fall", "lower", "drop"],
      vocabulary: [{ word: "fall short of", meaning: "~\uC5D0 \uBABB \uBBF8\uCE58\uB2E4" }],
      skills: ["collocation", "context"]
    },
    {
      id: "V-WFM-0017",
      section: "vocabulary",
      part: 2,
      type: "word-form",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["word-form", "environment"],
      question: "Choose the option that best completes the blank.",
      passage: "Replacing the old bulbs with LEDs turned out to be far more ___ in the long run.",
      choices: ["economical", "economic", "economy", "economics"],
      answer: 0,
      explanation: {
        summary: "'\uB3C8\uC774 \uB35C \uB4DC\uB294, \uACBD\uC81C\uC801\uC778'\uC774\uB77C\uB294 \uB73B\uC758 \uD615\uC6A9\uC0AC\uB97C \uD30C\uC0DD\uC5B4 \uC911\uC5D0\uC11C \uAD6C\uBD84\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "be\uB3D9\uC0AC \uB4A4 \uBCF4\uC5B4 \uC790\uB9AC\uC774\uBA70 in the long run\uC740 \uC7A5\uAE30\uC801\uC73C\uB85C \uBE44\uC6A9\uC774 \uC808\uC57D\uB41C\uB2E4\uB294 \uC758\uBBF8\uB97C \uB9CC\uB4E0\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. economical\uC740 '\uBE44\uC6A9\uC774 \uC801\uAC8C \uB4DC\uB294, \uC808\uC57D\uC774 \uB418\uB294'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uAC1C\uBCC4 \uC120\uD0DD\uC758 \uBE44\uC6A9 \uD6A8\uC728\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5(Confusable Word). economic\uC740 '\uACBD\uC81C\uC758, \uACBD\uC81C\uC640 \uAD00\uB828\uB41C'\uC73C\uB85C economic growth\uCC98\uB7FC \uAD6D\uAC00 \uACBD\uC81C\uB97C \uB2E4\uB8F0 \uB54C \uC4F4\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). economy\uB294 \uBA85\uC0AC\uB77C\uC11C more\uC758 \uC218\uC2DD\uC744 \uBC1B\uC544 \uBCF4\uC5B4\uAC00 \uB418\uAE30\uC5D0 \uBD80\uC801\uC808\uD558\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). economics\uB294 '\uACBD\uC81C\uD559'\uC774\uB77C\uB294 \uBA85\uC0AC\uB85C \uBB38\uB9E5\uACFC \uD488\uC0AC\uAC00 \uBAA8\uB450 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["economical option", "economic growth", "in the long run"],
      synonyms: ["cost-effective"],
      confusableWords: ["economic", "economical"],
      vocabulary: [{ word: "in the long run", meaning: "\uC7A5\uAE30\uC801\uC73C\uB85C \uBCF4\uBA74" }],
      skills: ["word-form", "context"]
    },
    {
      id: "V-COL-0018",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["collocation", "education"],
      question: "Choose the option that best completes the blank.",
      passage: "The proposal to shorten the semester sparked a ___ debate among faculty members.",
      choices: ["warm", "burning", "heated", "hot"],
      answer: 2,
      explanation: {
        summary: "debate\uB97C \uC218\uC2DD\uD574 '\uACA9\uB82C\uD55C \uB17C\uC7C1'\uC774\uB77C\uB294 \uC758\uBBF8\uB97C \uB9CC\uB4DC\uB294 \uD615\uC6A9\uC0AC collocation\uC744 \uACE0\uB978\uB2E4.",
        evidence: "sparked\uB294 \uB17C\uC7C1\uC774 \uCD09\uBC1C\uB418\uC5C8\uC74C\uC744 \uB73B\uD558\uBBC0\uB85C \uB17C\uC7C1\uC758 \uAC15\uB3C4\uB97C \uB098\uD0C0\uB0B4\uB294 \uD615\uC6A9\uC0AC\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). warm\uC740 warm welcome\uCC98\uB7FC \uC6B0\uD638\uC801 \uBD84\uC704\uAE30\uB97C \uB098\uD0C0\uB0B4\uC5B4 \uB17C\uC7C1\uC758 \uAC15\uB3C4\uC640 \uC5B4\uC6B8\uB9AC\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). burning\uC740 burning issue(\uCD08\uBBF8\uC758 \uAD00\uC2EC\uC0AC)\uC5D0\uB294 \uC4F0\uC774\uC9C0\uB9CC burning debate\uB294 \uC790\uC5F0\uC2A4\uB7FD\uC9C0 \uC54A\uB2E4.",
          "\uC815\uB2F5. heated debate\uB294 '\uACA9\uB860'\uC744 \uB73B\uD558\uB294 \uD45C\uC900 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Context Trap). hot\uC740 hot topic\uC5D0\uB294 \uC4F0\uC774\uB098 debate\uB97C \uC9C1\uC811 \uC218\uC2DD\uD558\uB294 \uAD00\uC6A9 \uD45C\uD604\uC73C\uB85C\uB294 \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["heated debate", "spark a debate", "burning issue"],
      synonyms: ["fierce", "intense"],
      confusableWords: ["hot", "heated"],
      vocabulary: [{ word: "faculty", meaning: "\uAD50\uC218\uC9C4" }, { word: "spark", meaning: "\uCD09\uBC1C\uD558\uB2E4" }],
      skills: ["collocation", "context"]
    },
    {
      id: "V-CTX-0019",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 4,
      targetScoreBand: "330-400",
      tags: ["context", "health"],
      question: "Choose the option that best completes the blank.",
      passage: "The medication may ___ drowsiness, so patients are advised not to drive after taking it.",
      choices: ["infect", "inflict", "impose", "induce"],
      answer: 3,
      explanation: {
        summary: "\uC57D\uC774 \uD2B9\uC815 \uC0C1\uD0DC\uB97C '\uC720\uBC1C\uD55C\uB2E4'\uB294 \uC758\uBBF8\uC758 \uB3D9\uC0AC\uB97C \uACE0\uB974\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "so patients are advised not to drive\uB294 \uC57D \uBCF5\uC6A9\uC774 \uC878\uC74C\uC744 \uC77C\uC73C\uD0A8\uB2E4\uB294 \uC778\uACFC \uAD00\uACC4\uB97C \uBCF4\uC5EC \uC900\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Keyword Trap). infect\uB294 '\uAC10\uC5FC\uC2DC\uD0A4\uB2E4'\uB85C \uBCD1\uC6D0\uCCB4\uAC00 \uC8FC\uC5B4\uC77C \uB54C \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). inflict\uB294 inflict damage on someone\uCC98\uB7FC \uD53C\uD574\uB97C '\uAC00\uD558\uB2E4'\uB77C\uB294 \uB73B\uC774\uBA70 \uC804\uCE58\uC0AC on\uC744 \uB3D9\uBC18\uD55C\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). impose\uB294 impose a fine/a rule\uCC98\uB7FC \uC81C\uC7AC\uB098 \uADDC\uC815\uC744 \uBD80\uACFC\uD560 \uB54C \uC4F4\uB2E4.",
          "\uC815\uB2F5. induce\uB294 '(\uC0DD\uB9AC\uC801 \uBC18\uC751\xB7\uC0C1\uD0DC\uB97C) \uC720\uBC1C\uD558\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uC758\uD559 \uBB38\uB9E5\uC5D0\uC11C \uC790\uC8FC \uC4F0\uC778\uB2E4."
        ]
      },
      collocations: ["induce drowsiness", "induce sleep", "impose a penalty"],
      synonyms: ["bring about", "cause"],
      confusableWords: ["induce", "inflict", "impose"],
      vocabulary: [{ word: "drowsiness", meaning: "\uC878\uC74C" }],
      skills: ["context", "collocation"]
    },
    {
      id: "V-IDM-0020",
      section: "vocabulary",
      part: 1,
      type: "idiom",
      difficulty: 3,
      targetScoreBand: "280-330",
      tags: ["idiom", "daily-life"],
      question: "Choose the option that best completes the blank.",
      passage: "A: I can't believe Tom forgot to send out the invitations.\nB: To be fair, he's had a lot ___ his plate this month.",
      choices: ["over", "on", "in", "at"],
      answer: 1,
      explanation: {
        summary: "'\uD560 \uC77C\uC774 \uB9CE\uB2E4'\uB294 \uB73B\uC758 \uAD00\uC6A9\uAD6C\uC5D0 \uB4E4\uC5B4\uAC08 \uC804\uCE58\uC0AC\uB97C \uACE0\uB974\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "To be fair\uB294 \uC0C1\uB300\uB97C \uBCC0\uD638\uD558\uB294 \uD45C\uD604\uC774\uBBC0\uB85C Tom\uC774 \uBC14\uBE74\uB2E4\uB294 \uB73B\uC758 \uAD00\uC6A9\uAD6C\uAC00 \uC774\uC5B4\uC838\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Grammar Trap). over\uB294 have something over one's head\uCC98\uB7FC \uB2E4\uB978 \uD45C\uD604\uACFC \uD63C\uB3D9\uD55C \uACB0\uACFC\uB2E4.",
          "\uC815\uB2F5. have a lot on one's plate\uB294 '\uCC98\uB9AC\uD560 \uC77C\uC774 \uB9CE\uB2E4'\uB77C\uB294 \uAD00\uC6A9 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). in\uC740 \uC811\uC2DC \uC704\uC5D0 \uB193\uC778\uB2E4\uB294 \uC774\uBBF8\uC9C0\uC640 \uB9DE\uC9C0 \uC54A\uC544 \uC774 \uAD00\uC6A9\uAD6C\uC5D0\uC11C \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). at\uC740 \uC7A5\uC18C\uC758 \uD55C \uC9C0\uC810\uC744 \uB098\uD0C0\uB0B4\uC5B4 \uC774 \uD45C\uD604\uACFC \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["have a lot on one's plate", "to be fair", "send out invitations"],
      synonyms: ["be swamped"],
      confusableWords: ["on one's plate", "over one's head"],
      vocabulary: [{ word: "to be fair", meaning: "\uACF5\uC815\uD558\uAC8C \uB9D0\uD558\uC790\uBA74" }],
      skills: ["colloquial-expression", "context"]
    },
    {
      id: "V-COL-0021",
      section: "vocabulary",
      part: 2,
      type: "collocation",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["collocation", "technology"],
      question: "Choose the option that best completes the blank.",
      passage: "The plant added a third production line to ___ the growing demand for its batteries.",
      choices: ["meet", "answer", "reply", "obey"],
      answer: 0,
      explanation: {
        summary: "demand\uC640 \uACB0\uD569\uD558\uB294 \uB3D9\uC0AC collocation\uC744 \uD655\uC778\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "\uC0DD\uC0B0 \uB77C\uC778\uC744 \uB298\uB9B0 \uBAA9\uC801\uC740 \uB298\uC5B4\uB098\uB294 \uC218\uC694\uB97C '\uCDA9\uC871\uD558\uAE30' \uC704\uD55C \uAC83\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. meet demand\uB294 '\uC218\uC694\uB97C \uCDA9\uC871\uC2DC\uD0A4\uB2E4'\uB77C\uB294 \uD45C\uC900 collocation\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). answer\uB294 answer a question/the phone\uC5D0 \uC4F0\uC774\uBA70 demand\uC640\uB294 \uC798 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). reply\uB294 \uC790\uB3D9\uC0AC\uC5EC\uC11C reply to\uC758 \uD615\uD0DC\uAC00 \uD544\uC694\uD558\uB2E4.",
          "\uC624\uB2F5(Context Trap). obey\uB294 '\uBA85\uB839\xB7\uADDC\uCE59\uC5D0 \uBCF5\uC885\uD558\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uC218\uC694\uC5D0\uB294 \uC4F0\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["meet demand", "growing demand for", "production line"],
      synonyms: ["satisfy", "keep up with"],
      confusableWords: ["meet", "answer"],
      vocabulary: [{ word: "demand for", meaning: "~\uC5D0 \uB300\uD55C \uC218\uC694" }],
      skills: ["collocation"]
    },
    {
      id: "V-CTX-0022",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 4,
      targetScoreBand: "330-400",
      tags: ["context", "communication"],
      question: "Choose the option that best completes the blank.",
      passage: "Her entire argument rests on the questionable ___ that all readers share the same cultural background.",
      choices: ["impression", "conclusion", "assumption", "assertion"],
      answer: 2,
      explanation: {
        summary: "\uB17C\uC99D\uC758 '\uD1A0\uB300'\uAC00 \uB418\uB294 \uAC83, \uC989 \uAC80\uC99D\uB418\uC9C0 \uC54A\uC740 \uC804\uC81C\uB97C \uAC00\uB9AC\uD0A4\uB294 \uBA85\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "rests on\uC740 \uB17C\uC99D\uC774 \uBB34\uC5C7 \uC704\uC5D0 \uC138\uC6CC\uC84C\uB294\uC9C0\uB97C \uB098\uD0C0\uB0B4\uBBC0\uB85C \uACB0\uB860\uC774 \uC544\uB2C8\uB77C \uCD9C\uBC1C\uC810\uC778 \uC804\uC81C\uAC00 \uB4E4\uC5B4\uAC00\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Partial Match). impression\uC740 \uAC1C\uC778\uC801 \uC778\uC0C1\uC744 \uB73B\uD574 \uB17C\uC99D\uC758 \uB17C\uB9AC\uC801 \uD1A0\uB300\uB97C \uC9C0\uCE6D\uD558\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC624\uB2F5(Reversal). conclusion\uC740 \uB17C\uC99D\uC758 \uACB0\uACFC\uC774\uBBC0\uB85C \uB17C\uC99D\uC774 \uADF8 \uC704\uC5D0 \uB193\uC778\uB2E4\uB294 rest on\uACFC \uBC29\uD5A5\uC774 \uBC18\uB300\uB2E4.",
          "\uC815\uB2F5. assumption\uC740 '(\uAC80\uC99D\uB418\uC9C0 \uC54A\uC740) \uC804\uC81C, \uAC00\uC815'\uC73C\uB85C questionable assumption that ~ \uD615\uD0DC\uB85C \uC790\uC8FC \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Scope Error). assertion\uC740 \uAC89\uC73C\uB85C \uB0B4\uC138\uC6B4 \uC8FC\uC7A5 \uC790\uCCB4\uB97C \uAC00\uB9AC\uCF1C, \uB17C\uC99D\uC758 \uBC11\uBC14\uD0D5\uC774 \uB418\uB294 \uC554\uBB35\uC801 \uC804\uC81C\uC640\uB294 \uCE35\uC704\uAC00 \uB2E4\uB974\uB2E4."
        ]
      },
      collocations: ["rest on an assumption", "questionable assumption", "underlying assumption"],
      synonyms: ["premise", "presupposition"],
      confusableWords: ["assumption", "assertion", "conclusion"],
      vocabulary: [{ word: "questionable", meaning: "\uC758\uC2EC\uC2A4\uB7EC\uC6B4" }],
      skills: ["logical-reasoning", "context"]
    },
    {
      id: "V-WFM-0023",
      section: "vocabulary",
      part: 1,
      type: "word-form",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["word-form", "relationships"],
      question: "Choose the option that best completes the blank.",
      passage: "A: I saved you a seat near the front.\nB: That was very ___ of you. Thanks a lot.",
      choices: ["considering", "considered", "considerable", "considerate"],
      answer: 3,
      explanation: {
        summary: "It/That was very ___ of you \uAD6C\uBB38\uC5D0\uC11C \uC0AC\uB78C\uC758 \uD0DC\uB3C4\uB97C \uD3C9\uAC00\uD558\uB294 \uD615\uC6A9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "of you \uC55E\uC5D0\uB294 \uC0AC\uB78C\uC758 \uC131\uD488\uC744 \uB098\uD0C0\uB0B4\uB294 \uD615\uC6A9\uC0AC\uAC00 \uC624\uBA70, \uC790\uB9AC\uB97C \uB9E1\uC544 \uC900 \uBC30\uB824\uC5D0 \uAC10\uC0AC\uD558\uB294 \uC0C1\uD669\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Grammar Trap). considering\uC740 '~\uC744 \uACE0\uB824\uD558\uBA74'\uC774\uB77C\uB294 \uC804\uCE58\uC0AC\xB7\uBD84\uC0AC \uC6A9\uBC95\uC73C\uB85C \uBCF4\uC5B4 \uC790\uB9AC\uC5D0 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Grammar Trap). considered\uB294 well-considered\uCC98\uB7FC \uC4F0\uC774\uBA70 of you \uAD6C\uBB38\uC758 \uC131\uD488 \uD615\uC6A9\uC0AC\uAC00 \uC544\uB2C8\uB2E4.",
          "\uC624\uB2F5(Confusable Word). considerable\uC740 '\uC0C1\uB2F9\uD55C(\uC591\xB7\uC815\uB3C4)'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uC0AC\uB78C\uC758 \uD0DC\uB3C4\uB97C \uB098\uD0C0\uB0B4\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. considerate\uB294 '\uC0AC\uB824 \uAE4A\uC740, \uBC30\uB824\uD558\uB294'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C That was very considerate of you \uD615\uD0DC\uB85C \uC4F0\uC778\uB2E4."
        ]
      },
      collocations: ["considerate of you", "a considerable amount", "save someone a seat"],
      synonyms: ["thoughtful", "kind"],
      confusableWords: ["considerate", "considerable"],
      vocabulary: [{ word: "considerate", meaning: "\uC0AC\uB824 \uAE4A\uC740" }],
      skills: ["word-form", "colloquial-expression"]
    },
    {
      id: "V-COL-0024",
      section: "vocabulary",
      part: 1,
      type: "collocation",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["collocation", "work"],
      question: "Choose the option that best completes the blank.",
      passage: "A: How do you manage so many freelance projects at once?\nB: Honestly, it's hard to ___ track of what I've already been paid for.",
      choices: ["take", "keep", "hold", "make"],
      answer: 1,
      explanation: {
        summary: "track of\uC640 \uACB0\uD569\uD574 '~\uC744 \uD30C\uC545\uD558\uACE0 \uC788\uB2E4'\uB294 \uB73B\uC744 \uB9CC\uB4DC\uB294 \uB3D9\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "\uC9C0\uAE09\uBC1B\uC740 \uB0B4\uC5ED\uC744 \uACC4\uC18D \uD30C\uC545\uD558\uAE30 \uC5B4\uB835\uB2E4\uB294 \uBB38\uB9E5\uC774\uBBC0\uB85C \uC9C0\uC18D\uC801\uC778 \uAD00\uB9AC\uC758 \uC758\uBBF8\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5(Collocation Trap). take\uB294 take note of\uB77C\uB294 \uB2E4\uB978 \uD45C\uD604\uACFC \uD63C\uB3D9\uD558\uAE30 \uC26C\uC6B0\uB098 track\uACFC\uB294 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. keep track of\uB294 '~\uC744 \uACC4\uC18D \uD30C\uC545\uD558\uB2E4, \uAE30\uB85D\uD574 \uB450\uB2E4'\uB77C\uB294 \uACE0\uC815 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). hold\uB294 hold a meeting/a position \uB4F1\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5(Collocation Trap). make\uB294 make progress/make a note\uC5D0 \uC4F0\uC774\uBA70 track of\uC640 \uACB0\uD569\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["keep track of", "lose track of", "at once"],
      synonyms: ["monitor", "stay on top of"],
      confusableWords: ["keep track of", "take note of"],
      vocabulary: [{ word: "keep track of", meaning: "~\uC744 \uACC4\uC18D \uD30C\uC545\uD558\uB2E4" }],
      skills: ["collocation"]
    },
    {
      id: "V-CTX-0025",
      section: "vocabulary",
      part: 2,
      type: "context",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["context", "society"],
      question: "Choose the option that best completes the blank.",
      passage: "After eight months of negotiation, the two sides finally reached a ___ that fully satisfied neither of them.",
      choices: ["compromise", "comparison", "commitment", "composition"],
      answer: 0,
      explanation: {
        summary: "'\uC5B4\uB290 \uCABD\uB3C4 \uC644\uC804\uD788 \uB9CC\uC871\uD558\uC9C0 \uBABB\uD588\uB2E4'\uB294 \uB2E8\uC11C\uB97C \uD1B5\uD574 \uC11C\uB85C \uC591\uBCF4\uD55C \uACB0\uACFC\uB97C \uB73B\uD558\uB294 \uBA85\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        evidence: "that fully satisfied neither of them\uC740 \uC591\uCE21\uC774 \uAC01\uC790 \uC77C\uBD80\uB97C \uD3EC\uAE30\uD588\uC74C\uC744 \uC2DC\uC0AC\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. compromise\uB294 '\uD0C0\uD611(\uC548)'\uC73C\uB85C \uC591\uCE21\uC774 \uC591\uBCF4\uD55C \uACB0\uACFC\uB77C\uB294 \uBB38\uB9E5\uACFC \uC815\uD655\uD788 \uC77C\uCE58\uD55C\uB2E4.",
          "\uC624\uB2F5(Keyword Trap). comparison\uC740 '\uBE44\uAD50'\uB85C \uD611\uC0C1 \uACB0\uACFC\uB97C \uAC00\uB9AC\uD0A4\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Partial Match). commitment\uB294 '\uC57D\uC18D, \uD5CC\uC2E0'\uC73C\uB85C \uC591\uCE21\uC774 \uBD88\uB9CC\uC871\uC2A4\uB7EC\uC6CC\uD55C\uB2E4\uB294 \uB2E8\uC11C\uC640 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(Keyword Trap). composition\uC740 '\uAD6C\uC131, \uC791\uBB38'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uBB38\uB9E5\uC5D0 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      collocations: ["reach a compromise", "reach an agreement", "after months of negotiation"],
      synonyms: ["settlement", "middle ground"],
      confusableWords: ["compromise", "commitment"],
      vocabulary: [{ word: "negotiation", meaning: "\uD611\uC0C1" }],
      skills: ["context", "logical-reasoning"]
    },
    {
      id: "G-TNS-0001",
      section: "grammar",
      part: 2,
      type: "tense",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["tense", "past-perfect"],
      concept: "\uACFC\uAC70\uC644\uB8CC(\uB300\uACFC\uAC70)\uC640 \uAE30\uAC04 \uD45C\uD604",
      question: "Choose the option that best completes the blank.",
      passage: "By the time the engineer arrived, the server ___ down for nearly two hours.",
      choices: ["has been", "was being", "had been", "would be"],
      answer: 2,
      explanation: {
        summary: "\uACFC\uAC70\uC758 \uD2B9\uC815 \uC2DC\uC810(arrived)\uBCF4\uB2E4 \uB354 \uC55E\uC120 \uC2DC\uC810\uBD80\uD130 \uC774\uC5B4\uC9C4 \uC0C1\uD0DC\uB97C \uB098\uD0C0\uB0B4\uB294 \uC2DC\uC81C\uB97C \uACE0\uB978\uB2E4.",
        rule: "By the time + \uACFC\uAC70\uC2DC\uC81C \uC808\uC774 \uC624\uBA74 \uC8FC\uC808\uC5D0\uB294 \uADF8\uBCF4\uB2E4 \uC55E\uC120 \uC0C1\uD669\uC744 \uB098\uD0C0\uB0B4\uB294 \uACFC\uAC70\uC644\uB8CC(had p.p.)\uB97C \uC4F4\uB2E4. for + \uAE30\uAC04\uACFC \uD568\uAED8 \uC4F0\uBA74 \uADF8 \uC2DC\uC810\uAE4C\uC9C0\uC758 \uC9C0\uC18D\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
        sentenceAnalysis: "\uC885\uC18D\uC808 the engineer arrived\uAC00 \uACFC\uAC70 \uAE30\uC900\uC810\uC774\uACE0, \uC11C\uBC84\uAC00 \uB2E4\uC6B4\uB41C \uC0C1\uD0DC\uB294 \uADF8 \uC774\uC804\uBD80\uD130 \uB450 \uC2DC\uAC04 \uAC00\uAE4C\uC774 \uACC4\uC18D\uB418\uC5C8\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. has been\uC740 \uD604\uC7AC\uC644\uB8CC\uB85C \uD604\uC7AC\uAE4C\uC9C0\uC758 \uC9C0\uC18D\uC744 \uB098\uD0C0\uB0B4\uBBC0\uB85C \uACFC\uAC70 \uAE30\uC900\uC810 arrived\uC640 \uC2DC\uC81C\uAC00 \uCDA9\uB3CC\uD55C\uB2E4.",
          "\uC624\uB2F5. was being\uC740 \uACFC\uAC70\uC9C4\uD589 \uC218\uB3D9 \uD615\uD0DC\uB85C \uC0C1\uD0DC\uC758 \uC9C0\uC18D \uAE30\uAC04(for two hours)\uC744 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uD45C\uD604\uD558\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC815\uB2F5. had been down for nearly two hours\uAC00 \uACFC\uAC70 \uC2DC\uC810 \uC774\uC804\uBD80\uD130 \uC774\uC5B4\uC9C4 \uC0C1\uD0DC\uB97C \uC815\uD655\uD788 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5. would be\uB294 \uACFC\uAC70\uC5D0\uC11C \uBCF8 \uBBF8\uB798\uB97C \uB73B\uD574 \uC774\uBBF8 \uB450 \uC2DC\uAC04 \uC9C0\uC18D\uB41C \uC0C1\uD669\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["tense", "sentence-structure"]
    },
    {
      id: "G-SVA-0002",
      section: "grammar",
      part: 2,
      type: "subject-verb-agreement",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["agreement", "education"],
      concept: "the number of + \uBCF5\uC218\uBA85\uC0AC\uC758 \uC218\uC77C\uCE58",
      question: "Choose the option that best completes the blank.",
      passage: "The number of students applying for the exchange program ___ steadily since 2019.",
      choices: ["has risen", "have risen", "are rising", "were risen"],
      answer: 0,
      explanation: {
        summary: "\uC8FC\uC5B4\uC758 \uD575\uC774 The number\uC774\uBBC0\uB85C \uB2E8\uC218 \uB3D9\uC0AC\uB97C \uC4F0\uACE0, since 2019\uC5D0 \uB9DE\uCDB0 \uD604\uC7AC\uC644\uB8CC\uB97C \uC120\uD0DD\uD55C\uB2E4.",
        rule: "the number of + \uBCF5\uC218\uBA85\uC0AC\uB294 '~\uC758 \uC218'\uB85C \uB2E8\uC218 \uCDE8\uAE09\uD558\uACE0, a number of + \uBCF5\uC218\uBA85\uC0AC\uB294 '\uB9CE\uC740 ~'\uC73C\uB85C \uBCF5\uC218 \uCDE8\uAE09\uD55C\uB2E4. since + \uACFC\uAC70 \uC2DC\uC810\uC740 \uD604\uC7AC\uC644\uB8CC\uC640 \uD568\uAED8 \uC4F4\uB2E4.",
        sentenceAnalysis: "applying for the exchange program\uC740 students\uB97C \uC218\uC2DD\uD558\uB294 \uD604\uC7AC\uBD84\uC0AC\uAD6C\uC77C \uBFD0 \uC8FC\uC5B4\uC758 \uC218\uB97C \uBC14\uAFB8\uC9C0 \uC54A\uB294\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uB2E8\uC218 \uC8FC\uC5B4 The number\uC5D0 \uB9DE\uB294 has\uC640 since 2019\uC5D0 \uC5B4\uC6B8\uB9AC\uB294 \uD604\uC7AC\uC644\uB8CC\uAC00 \uBAA8\uB450 \uCDA9\uC871\uB41C\uB2E4.",
          "\uC624\uB2F5. have\uB294 \uBCF5\uC218 \uB3D9\uC0AC\uC774\uBBC0\uB85C \uB2E8\uC218 \uC8FC\uC5B4 The number\uC640 \uC218\uC77C\uCE58\uAC00 \uC5B4\uAE0B\uB09C\uB2E4.",
          "\uC624\uB2F5. are rising\uC740 \uC218\uC77C\uCE58\uB3C4 \uB9DE\uC9C0 \uC54A\uACE0 since 2019\uC640 \uACB0\uD569\uD558\uB294 \uC2DC\uC81C\uB3C4 \uC544\uB2C8\uB2E4.",
          "\uC624\uB2F5. rise\uB294 \uC790\uB3D9\uC0AC\uC5EC\uC11C \uC218\uB3D9\uD0DC were risen \uC790\uCCB4\uAC00 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["subject-verb-agreement", "tense"]
    },
    {
      id: "G-REL-0003",
      section: "grammar",
      part: 2,
      type: "relative-clause",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["relative-clause", "university"],
      concept: "\uC18C\uC720\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC whose",
      question: "Choose the option that best completes the blank.",
      passage: "The professor ___ lecture I attended last semester has just published a new book.",
      choices: ["whom", "whose", "which", "of whom"],
      answer: 1,
      explanation: {
        summary: "\uBE48\uCE78 \uB4A4\uC5D0 \uAD00\uC0AC \uC5C6\uB294 \uBA85\uC0AC lecture\uAC00 \uBC14\uB85C \uC624\uBBC0\uB85C \uC18C\uC720 \uAD00\uACC4\uB97C \uB098\uD0C0\uB0B4\uB294 \uAD00\uACC4\uB300\uBA85\uC0AC\uAC00 \uD544\uC694\uD558\uB2E4.",
        rule: "\uC120\uD589\uC0AC\uAC00 \uC0AC\uB78C\uC774\uACE0 \uB4A4\uC5D0 \uBA85\uC0AC\uAC00 \uC774\uC5B4\uC9C0\uBA74 \uC18C\uC720\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC whose\uB97C \uC4F4\uB2E4(= the professor's lecture).",
        sentenceAnalysis: "whose lecture\uAC00 \uAD00\uACC4\uC808 \uB0B4\uBD80\uC5D0\uC11C attended\uC758 \uBAA9\uC801\uC5B4 \uC5ED\uD560\uC744 \uD558\uBA70, \uC8FC\uC808\uC758 \uB3D9\uC0AC\uB294 has published\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. whom\uC740 \uBAA9\uC801\uACA9\uC774\uB77C \uB4A4\uC5D0 \uBA85\uC0AC\uAC00 \uC544\uB2C8\uB77C \uC8FC\uC5B4+\uB3D9\uC0AC\uAC00 \uC774\uC5B4\uC838\uC57C \uD55C\uB2E4.",
          "\uC815\uB2F5. whose lecture\uB294 '\uADF8 \uAD50\uC218\uC758 \uAC15\uC758'\uB77C\uB294 \uC18C\uC720 \uAD00\uACC4\uB97C \uC815\uD655\uD788 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5. which\uB294 \uC0AC\uB78C\uC744 \uC120\uD589\uC0AC\uB85C \uBC1B\uC744 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. of whom\uC740 the lecture of whom\uCC98\uB7FC \uBA85\uC0AC \uB4A4\uC5D0 \uC640\uC57C \uD558\uBA70 \uC774 \uC5B4\uC21C\uC5D0\uC11C\uB294 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["relative-clause", "sentence-structure"]
    },
    {
      id: "G-SUB-0004",
      section: "grammar",
      part: 2,
      type: "subjunctive",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["subjunctive", "business"],
      concept: "\uC8FC\uC7A5\xB7\uC694\uAD6C\xB7\uBA85\uB839 \uB3D9\uC0AC \uB4A4\uC758 that\uC808 \uAC00\uC815\uBC95 \uD604\uC7AC",
      question: "Choose the option that best completes the blank.",
      passage: "The board insisted that the audit report ___ before the end of the quarter.",
      choices: ["is submitted", "was submitted", "will be submitted", "be submitted"],
      answer: 3,
      explanation: {
        summary: "insist\uAC00 '\uC694\uAD6C'\uC758 \uC758\uBBF8\uB85C \uC4F0\uC600\uC73C\uBBC0\uB85C that\uC808 \uB3D9\uC0AC\uB294 \uC6D0\uD615(should \uC0DD\uB7B5\uD615)\uC774\uC5B4\uC57C \uD55C\uB2E4.",
        rule: "insist, demand, suggest, require, recommend \uB4F1 \uC8FC\uC7A5\xB7\uC694\uAD6C\xB7\uC81C\uC548\xB7\uBA85\uB839 \uB3D9\uC0AC\uC758 that\uC808\uC5D0\uC11C\uB294 (should +) \uB3D9\uC0AC\uC6D0\uD615\uC744 \uC4F4\uB2E4. \uC218\uB3D9\uD0DC\uC774\uBA74 be p.p. \uD615\uD0DC\uAC00 \uB41C\uB2E4.",
        sentenceAnalysis: "the audit report\uB294 \uC81C\uCD9C\uB418\uB294 \uB300\uC0C1\uC774\uBBC0\uB85C \uC218\uB3D9\uC774\uBA70, \uC2DC\uC81C \uC77C\uCE58\uC758 \uC601\uD5A5\uC744 \uBC1B\uC9C0 \uC54A\uACE0 \uC6D0\uD615 be\uAC00 \uC720\uC9C0\uB41C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. is submitted\uB294 \uC9C1\uC124\uBC95 \uD604\uC7AC\uB85C, \uC694\uAD6C\uB97C \uB098\uD0C0\uB0B4\uB294 insist\uC758 that\uC808\uC5D0\uB294 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. was submitted\uB294 \uC2DC\uC81C \uC77C\uCE58\uB97C \uC798\uBABB \uC801\uC6A9\uD55C \uD615\uD0DC\uB2E4.",
          "\uC624\uB2F5. will be submitted\uB294 \uB2E8\uC21C \uC608\uCE21\uC744 \uB098\uD0C0\uB0B4\uC5B4 \uC694\uAD6C\uC758 \uC758\uBBF8\uB97C \uB2F4\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC815\uB2F5. be submitted\uAC00 (should) be submitted\uC5D0\uC11C should\uAC00 \uC0DD\uB7B5\uB41C \uD45C\uC900\uD615\uC774\uB2E4."
        ]
      },
      skills: ["subjunctive", "verb-form"]
    },
    {
      id: "G-PTC-0005",
      section: "grammar",
      part: 2,
      type: "participle",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["participle", "culture"],
      concept: "\uBD84\uC0AC\uAD6C\uBB38\uC758 \uB2A5\uB3D9\xB7\uC218\uB3D9 \uAD6C\uBD84",
      question: "Choose the option that best completes the blank.",
      passage: "___ in the 1920s, the theater still hosts a concert almost every weekend.",
      choices: ["Built", "Building", "Having built", "To build"],
      answer: 0,
      explanation: {
        summary: "\uC8FC\uC5B4 the theater\uAC00 '\uC9C0\uC5B4\uC9C4' \uB300\uC0C1\uC774\uBBC0\uB85C \uACFC\uAC70\uBD84\uC0AC\uB85C \uC2DC\uC791\uD558\uB294 \uBD84\uC0AC\uAD6C\uBB38\uC744 \uACE0\uB978\uB2E4.",
        rule: "\uBD84\uC0AC\uAD6C\uBB38\uC758 \uC758\uBBF8\uC0C1 \uC8FC\uC5B4\uAC00 \uD589\uC704\uC758 \uB300\uC0C1\uC774\uBA74 \uACFC\uAC70\uBD84\uC0AC(p.p.)\uB97C, \uD589\uC704\uC758 \uC8FC\uCCB4\uC774\uBA74 \uD604\uC7AC\uBD84\uC0AC(-ing)\uB97C \uC4F4\uB2E4.",
        sentenceAnalysis: "Built in the 1920s\uB294 Since it was built in the 1920s\uB97C \uC904\uC778 \uC218\uB3D9 \uBD84\uC0AC\uAD6C\uBB38\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. Built\uAC00 \uC218\uB3D9 \uAD00\uACC4\uB97C \uB098\uD0C0\uB0B4\uC5B4 '1920\uB144\uB300\uC5D0 \uC9C0\uC5B4\uC9C4'\uC774\uB77C\uB294 \uC758\uBBF8\uAC00 \uB41C\uB2E4.",
          "\uC624\uB2F5. Building\uC740 \uADF9\uC7A5\uC774 \uBB34\uC5B8\uAC00\uB97C \uC9D3\uB294\uB2E4\uB294 \uB2A5\uB3D9 \uC758\uBBF8\uAC00 \uB418\uC5B4 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. Having built\uB3C4 \uB2A5\uB3D9 \uC644\uB8CC\uD615\uC774\uBBC0\uB85C \uC8FC\uC5B4\uC640 \uC758\uBBF8 \uAD00\uACC4\uAC00 \uC5B4\uAE0B\uB09C\uB2E4.",
          "\uC624\uB2F5. To build\uB294 \uBAA9\uC801\uC744 \uB098\uD0C0\uB0B4\uB294 \uBD80\uC815\uC0AC\uB85C \uC774 \uBB38\uB9E5\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["participle", "sentence-structure"]
    },
    {
      id: "G-CMP-0006",
      section: "grammar",
      part: 2,
      type: "comparison",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["comparison", "technology"],
      concept: "\uBE44\uAD50\uAE09\uC744 \uAC15\uC870\uD558\uB294 \uBD80\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "The latest model is ___ more energy-efficient than the one it replaced.",
      choices: ["very", "too", "far", "so"],
      answer: 2,
      explanation: {
        summary: "\uBE44\uAD50\uAE09 more energy-efficient\uB97C \uAC15\uC870\uD560 \uC218 \uC788\uB294 \uBD80\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        rule: "\uBE44\uAD50\uAE09 \uAC15\uC870\uC5D0\uB294 far, much, even, still, a lot\uC744 \uC4F0\uACE0, very\uB294 \uC6D0\uAE09\uC744 \uAC15\uC870\uD55C\uB2E4.",
        sentenceAnalysis: "than the one it replaced\uAC00 \uC788\uC73C\uBBC0\uB85C \uBE44\uAD50 \uAD6C\uBB38\uC774 \uD655\uC815\uB418\uBA70, \uBE48\uCE78\uC740 \uBE44\uAD50\uAE09\uC744 \uAC15\uC870\uD558\uB294 \uC790\uB9AC\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. very\uB294 very efficient\uCC98\uB7FC \uC6D0\uAE09\uB9CC \uAC15\uC870\uD55C\uB2E4.",
          "\uC624\uB2F5. too\uB294 'too ~ to' \uAD6C\uBB38\uC5D0\uC11C \uBD80\uC815\uC801 \uC815\uB3C4\uB97C \uB098\uD0C0\uB0B4\uBA70 \uBE44\uAD50\uAE09 \uAC15\uC870\uB85C \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. far more efficient\uB294 '\uD6E8\uC52C \uB354 \uD6A8\uC728\uC801\uC778'\uC774\uB77C\uB294 \uD45C\uC900 \uAC15\uC870 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5. so\uB294 \uC6D0\uAE09\uC744 \uAC15\uC870\uD558\uAC70\uB098 so ~ that \uAD6C\uBB38\uC5D0 \uC4F0\uC778\uB2E4."
        ]
      },
      skills: ["comparison", "modifier"]
    },
    {
      id: "G-CON-0007",
      section: "grammar",
      part: 2,
      type: "conjunction",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["conjunction", "daily-life"],
      concept: "\uC591\uBCF4\uC758 \uC804\uCE58\uC0AC\uC640 \uC811\uC18D\uC0AC \uAD6C\uBD84",
      question: "Choose the option that best completes the blank.",
      passage: "___ the heavy rain, the outdoor ceremony went ahead exactly as scheduled.",
      choices: ["Although", "Despite", "However", "Nevertheless"],
      answer: 1,
      explanation: {
        summary: "\uBE48\uCE78 \uB4A4\uC5D0 \uBA85\uC0AC\uAD6C\uB9CC \uC788\uC73C\uBBC0\uB85C \uC811\uC18D\uC0AC\uAC00 \uC544\uB2C8\uB77C \uC804\uCE58\uC0AC\uB97C \uACE8\uB77C\uC57C \uD55C\uB2E4.",
        rule: "despite/in spite of + \uBA85\uC0AC(\uAD6C), although/though + \uC8FC\uC5B4 + \uB3D9\uC0AC. however\uC640 nevertheless\uB294 \uC811\uC18D\uBD80\uC0AC\uB85C \uB450 \uBB38\uC7A5\uC744 \uC787\uB294\uB2E4.",
        sentenceAnalysis: "the heavy rain\uC740 \uC808\uC774 \uC544\uB2C8\uB77C \uBA85\uC0AC\uAD6C\uC774\uBBC0\uB85C \uC804\uCE58\uC0AC\uAC00 \uD544\uC694\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. Although\uB294 \uC811\uC18D\uC0AC\uC5EC\uC11C \uB4A4\uC5D0 \uC8FC\uC5B4\uC640 \uB3D9\uC0AC\uAC00 \uC788\uC5B4\uC57C \uD55C\uB2E4.",
          "\uC815\uB2F5. Despite\uB294 \uC804\uCE58\uC0AC\uB85C \uBA85\uC0AC\uAD6C\uB97C \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD574 '~\uC5D0\uB3C4 \uBD88\uAD6C\uD558\uACE0'\uB97C \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5. However\uB294 \uC811\uC18D\uBD80\uC0AC\uB77C \uBA85\uC0AC\uAD6C\uB97C \uC774\uB04C \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. Nevertheless\uB3C4 \uC811\uC18D\uBD80\uC0AC\uC774\uBA70 \uBCF4\uD1B5 \uC55E \uBB38\uC7A5\uACFC \uC138\uBBF8\uCF5C\uB860\uC774\uB098 \uB9C8\uCE68\uD45C\uB85C \uC5F0\uACB0\uB41C\uB2E4."
        ]
      },
      skills: ["conjunction", "sentence-structure"]
    },
    {
      id: "G-GER-0008",
      section: "grammar",
      part: 1,
      type: "gerund",
      difficulty: 2,
      targetScoreBand: "200-280",
      tags: ["gerund", "workplace"],
      concept: "mind + \uB3D9\uBA85\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "A: Would you mind ___ a bit later tomorrow?\nB: Not at all. I have nothing planned in the evening.",
      choices: ["to stay", "stay", "to staying", "staying"],
      answer: 3,
      explanation: {
        summary: "mind\uB294 \uBAA9\uC801\uC5B4\uB85C \uB3D9\uBA85\uC0AC\uB9CC \uCDE8\uD558\uB294 \uB3D9\uC0AC\uC784\uC744 \uD655\uC778\uD558\uB294 \uBB38\uC81C\uB2E4.",
        rule: "mind, enjoy, avoid, finish, suggest, consider \uB4F1\uC740 \uBAA9\uC801\uC5B4\uB85C \uB3D9\uBA85\uC0AC\uB97C \uCDE8\uD55C\uB2E4.",
        sentenceAnalysis: "Would you mind -ing?\uB294 '~\uD574 \uC8FC\uC2DC\uACA0\uC5B4\uC694?'\uB77C\uB294 \uC815\uC911\uD55C \uC694\uCCAD \uD45C\uD604\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. to stay\uB294 to\uBD80\uC815\uC0AC\uB85C mind\uC758 \uBAA9\uC801\uC5B4\uAC00 \uB420 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. stay\uB294 \uB3D9\uC0AC\uC6D0\uD615\uC774\uB77C \uBAA9\uC801\uC5B4 \uC790\uB9AC\uC5D0 \uC62C \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. to staying\uC740 mind\uAC00 \uC804\uCE58\uC0AC to\uB97C \uCDE8\uD558\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uD2C0\uB9B0 \uD615\uD0DC\uB2E4.",
          "\uC815\uB2F5. staying\uC774 mind\uC758 \uBAA9\uC801\uC5B4\uB85C \uC4F0\uC778 \uC62C\uBC14\uB978 \uB3D9\uBA85\uC0AC \uD615\uD0DC\uB2E4."
        ]
      },
      skills: ["gerund", "verb-pattern"]
    },
    {
      id: "G-CDT-0009",
      section: "grammar",
      part: 2,
      type: "conditional",
      difficulty: 4,
      targetScoreBand: "330-400",
      tags: ["conditional", "daily-life"],
      concept: "\uD63C\uD569 \uAC00\uC815\uBC95",
      question: "Choose the option that best completes the blank.",
      passage: "If she ___ the earlier train, she would be sitting in the office right now.",
      choices: ["had taken", "took", "has taken", "would take"],
      answer: 0,
      explanation: {
        summary: "\uC8FC\uC808\uC774 \uD604\uC7AC \uC0AC\uC2E4\uC758 \uBC18\uB300(would be ~ right now)\uC774\uACE0 \uC870\uAC74\uC808\uC740 \uACFC\uAC70 \uC0AC\uC2E4\uC758 \uBC18\uB300\uC774\uBBC0\uB85C \uD63C\uD569 \uAC00\uC815\uBC95\uC744 \uC4F4\uB2E4.",
        rule: "\uD63C\uD569 \uAC00\uC815\uBC95\uC740 'If + \uC8FC\uC5B4 + had p.p. ~, \uC8FC\uC5B4 + would + \uB3D9\uC0AC\uC6D0\uD615'\uC758 \uD615\uD0DC\uB85C, \uACFC\uAC70\uC758 \uC77C\uC774 \uD604\uC7AC\uC5D0 \uBBF8\uCCE4\uC744 \uACB0\uACFC\uB97C \uB098\uD0C0\uB0B8\uB2E4.",
        sentenceAnalysis: "\uAE30\uCC28\uB97C \uD0C4 \uAC83\uC740 \uACFC\uAC70\uC758 \uC77C\uC774\uACE0, \uC0AC\uBB34\uC2E4\uC5D0 \uC549\uC544 \uC788\uB294 \uAC83\uC740 \uD604\uC7AC \uC2DC\uC810(right now)\uC758 \uACB0\uACFC\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. had taken\uC774 \uACFC\uAC70 \uC0AC\uC2E4\uC758 \uBC18\uB300\uB97C \uB098\uD0C0\uB0B4\uC5B4 \uD604\uC7AC \uACB0\uACFC\uB97C \uB9D0\uD558\uB294 \uC8FC\uC808\uACFC \uACB0\uD569\uD55C\uB2E4.",
          "\uC624\uB2F5. took\uC740 \uAC00\uC815\uBC95 \uACFC\uAC70 \uD615\uD0DC\uB85C, \uD604\uC7AC \uC0AC\uC2E4\uC758 \uBC18\uB300\uB97C \uAC00\uC815\uD560 \uB54C \uC4F0\uBBC0\uB85C \uACFC\uAC70 \uD589\uC704\uC640 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. has taken\uC740 \uC9C1\uC124\uBC95 \uD604\uC7AC\uC644\uB8CC\uB85C \uAC00\uC815\uBC95 \uC870\uAC74\uC808\uC5D0 \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. would take\uB294 \uC870\uAC74\uC808(if\uC808)\uC5D0 \uC4F0\uC9C0 \uC54A\uB294 \uD615\uD0DC\uB2E4."
        ]
      },
      skills: ["conditional", "tense"]
    },
    {
      id: "G-PSV-0010",
      section: "grammar",
      part: 2,
      type: "passive",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["passive", "administration"],
      concept: "\uC870\uB3D9\uC0AC + \uC218\uB3D9\uD0DC",
      question: "Choose the option that best completes the blank.",
      passage: "All applications ___ by June 30; submissions made after that date will not be reviewed.",
      choices: ["must receive", "must be receiving", "must be received", "must have received"],
      answer: 2,
      explanation: {
        summary: "\uC8FC\uC5B4 applications\uAC00 \uC811\uC218\uB418\uB294 \uB300\uC0C1\uC774\uBBC0\uB85C \uC870\uB3D9\uC0AC \uB4A4\uC5D0 \uC218\uB3D9\uD0DC\uB97C \uC368\uC57C \uD55C\uB2E4.",
        rule: "\uC870\uB3D9\uC0AC \uB4A4\uC758 \uC218\uB3D9\uD0DC\uB294 '\uC870\uB3D9\uC0AC + be + p.p.' \uD615\uD0DC\uB85C \uC4F4\uB2E4.",
        sentenceAnalysis: "\uB4A4 \uC808\uC758 will not be reviewed \uC5ED\uC2DC \uC218\uB3D9\uD0DC\uB85C, \uC9C0\uC6D0\uC11C\uAC00 \uCC98\uB9AC \uB300\uC0C1\uC784\uC744 \uD655\uC778\uD574 \uC900\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. must receive\uB294 \uB2A5\uB3D9\uD0DC\uB85C \uC9C0\uC6D0\uC11C\uAC00 \uBB34\uC5B8\uAC00\uB97C \uBC1B\uB294\uB2E4\uB294 \uC758\uBBF8\uAC00 \uB418\uC5B4 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. must be receiving\uC740 \uC9C4\uD589\uD615\uC774\uB77C \uB9C8\uAC10 \uAE30\uD55C\uACFC \uD568\uAED8 \uC4F0\uAE30\uC5D0 \uBD80\uC801\uC808\uD558\uACE0 \uD0DC\uB3C4 \uB2A5\uB3D9\uC774\uB2E4.",
          "\uC815\uB2F5. must be received\uAC00 '\uC811\uC218\uB418\uC5B4\uC57C \uD55C\uB2E4'\uB294 \uC758\uBBF8\uC758 \uC62C\uBC14\uB978 \uC870\uB3D9\uC0AC \uC218\uB3D9\uD0DC\uB2E4.",
          "\uC624\uB2F5. must have received\uB294 \uACFC\uAC70\uC5D0 \uB300\uD55C \uAC15\uD55C \uCD94\uCE21\uC744 \uB098\uD0C0\uB0B4\uB294 \uB2A5\uB3D9\uD615\uC774\uB2E4."
        ]
      },
      skills: ["passive", "verb-form"]
    },
    {
      id: "G-PRO-0011",
      section: "grammar",
      part: 2,
      type: "pronoun",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["pronoun", "organization"],
      concept: "\uC9D1\uD569\uBA85\uC0AC\uB97C \uBC1B\uB294 \uC18C\uC720\uACA9 \uB300\uBA85\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "The committee announced ___ decision only after a two-hour closed session.",
      choices: ["their", "its", "it's", "theirs"],
      answer: 1,
      explanation: {
        summary: "committee\uB97C \uD558\uB098\uC758 \uC870\uC9C1 \uB2E8\uC704\uB85C \uBCF4\uACE0 \uB2E8\uC218 \uC18C\uC720\uACA9 \uB300\uBA85\uC0AC\uB97C \uC4F4\uB2E4.",
        rule: "committee, board, team \uB4F1 \uC9D1\uD569\uBA85\uC0AC\uAC00 \uD558\uB098\uC758 \uB2E8\uC704\uB85C \uD589\uB3D9\uD560 \uB54C\uB294 \uB2E8\uC218 \uCDE8\uAE09\uD558\uBA70 \uC18C\uC720\uACA9\uC740 its\uB97C \uC4F4\uB2E4. it's\uB294 it is\uC758 \uCD95\uC57D\uD615\uC774\uB2E4.",
        sentenceAnalysis: "announced \uB4A4\uC758 \uBA85\uC0AC decision\uC744 \uC218\uC2DD\uD560 \uC18C\uC720\uACA9\uC774 \uD544\uC694\uD558\uBA70, \uC704\uC6D0\uD68C\uAC00 \uD558\uB098\uC758 \uACB0\uC815\uC744 \uBC1C\uD45C\uD588\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. their\uB294 \uBCF5\uC218 \uC18C\uC720\uACA9\uC73C\uB85C, \uC704\uC6D0\uD68C\uB97C \uD558\uB098\uC758 \uB2E8\uC704\uB85C \uBCF4\uB294 \uC774 \uBB38\uC7A5\uC5D0\uC11C\uB294 \uC5B4\uC0C9\uD558\uB2E4.",
          "\uC815\uB2F5. its\uAC00 \uB2E8\uC218 \uC9D1\uD569\uBA85\uC0AC\uB97C \uBC1B\uB294 \uC62C\uBC14\uB978 \uC18C\uC720\uACA9\uC774\uB2E4.",
          "\uC624\uB2F5. it's\uB294 it is\uC758 \uCD95\uC57D\uD615\uC774\uBBC0\uB85C \uBA85\uC0AC \uC55E \uC218\uC2DD\uC5B4\uAC00 \uB420 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. theirs\uB294 \uC18C\uC720\uB300\uBA85\uC0AC\uB77C \uB4A4\uC5D0 \uBA85\uC0AC\uB97C \uB458 \uC218 \uC5C6\uB2E4."
        ]
      },
      skills: ["pronoun", "agreement"]
    },
    {
      id: "G-ART-0012",
      section: "grammar",
      part: 2,
      type: "article",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["article", "university"],
      concept: "\uC720\uC77C\uD55C \uC9C1\uCC45\uC744 \uB098\uD0C0\uB0B4\uB294 \uBA85\uC0AC\uC758 \uBB34\uAD00\uC0AC \uC6A9\uBC95",
      question: "Choose the option that best completes the blank.",
      passage: "She was elected ___ of the student council last spring.",
      choices: ["president", "a president", "the presidents", "presidents"],
      answer: 0,
      explanation: {
        summary: "elect, appoint, name \uB4A4\uC5D0\uC11C \uC720\uC77C\uD55C \uC9C1\uCC45\uC744 \uB098\uD0C0\uB0B4\uB294 \uBA85\uC0AC\uB294 \uAD00\uC0AC \uC5C6\uC774 \uC4F4\uB2E4.",
        rule: "elect/appoint/name + \uBAA9\uC801(\uBCF4)\uC5B4\uB85C \uC4F0\uC778 \uC9C1\uCC45 \uBA85\uC0AC\uAC00 \uC870\uC9C1 \uB0B4 \uC720\uC77C\uD55C \uC790\uB9AC\uB97C \uAC00\uB9AC\uD0AC \uB54C\uB294 \uAD00\uC0AC\uB97C \uBD99\uC774\uC9C0 \uC54A\uB294\uB2E4.",
        sentenceAnalysis: "of the student council\uAC00 \uC788\uC5B4 \uD559\uC0DD\uD68C\uC5D0 \uD55C \uBA85\uBFD0\uC778 \uD68C\uC7A5\uC9C1\uC784\uC774 \uBD84\uBA85\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uBB34\uAD00\uC0AC president\uAC00 \uC720\uC77C\uD55C \uC9C1\uCC45\uC744 \uB098\uD0C0\uB0B4\uB294 \uD45C\uC900 \uC6A9\uBC95\uC774\uB2E4.",
          "\uC624\uB2F5. a president\uB294 \uC5EC\uB7EC \uBA85 \uC911 \uD558\uB098\uB77C\uB294 \uB73B\uC774 \uB418\uC5B4 \uC720\uC77C\uD55C \uC9C1\uCC45\uACFC \uC5B4\uC6B8\uB9AC\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. the presidents\uB294 \uBCF5\uC218\uD615\uC774\uB77C \uD55C \uC0AC\uB78C\uC774 \uC120\uCD9C\uB41C \uC0C1\uD669\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. presidents \uC5ED\uC2DC \uBCF5\uC218\uD615\uC774\uBBC0\uB85C \uB2E8\uC218 \uC8FC\uC5B4 She\uC640 \uC758\uBBF8\uAC00 \uCDA9\uB3CC\uD55C\uB2E4."
        ]
      },
      skills: ["article", "sentence-structure"]
    },
    {
      id: "G-PRP-0013",
      section: "grammar",
      part: 2,
      type: "preposition",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["preposition", "science"],
      concept: "\uD615\uC6A9\uC0AC\uC640 \uACB0\uD569\uD558\uB294 \uC804\uCE58\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "The new findings are entirely consistent ___ what earlier studies reported.",
      choices: ["to", "for", "on", "with"],
      answer: 3,
      explanation: {
        summary: "consistent\uAC00 \uC694\uAD6C\uD558\uB294 \uACE0\uC815 \uC804\uCE58\uC0AC\uB97C \uACE0\uB974\uB294 \uBB38\uC81C\uB2E4.",
        rule: "be consistent with\uB294 '~\uC640 \uC77C\uCE58\uD558\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uC804\uCE58\uC0AC with\uB97C \uCDE8\uD55C\uB2E4. be similar to, be responsible for\uCC98\uB7FC \uD615\uC6A9\uC0AC\uB9C8\uB2E4 \uC9DD\uC774 \uB418\uB294 \uC804\uCE58\uC0AC\uB97C \uD568\uAED8 \uC678\uC6CC\uC57C \uD55C\uB2E4.",
        sentenceAnalysis: "what earlier studies reported\uB294 \uBA85\uC0AC\uC808\uB85C \uC804\uCE58\uC0AC\uC758 \uBAA9\uC801\uC5B4 \uC5ED\uD560\uC744 \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. to\uB294 similar to, opposed to \uB4F1\uACFC \uACB0\uD569\uD558\uBA70 consistent\uC640\uB294 \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. for\uB294 responsible for, famous for \uB4F1\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC624\uB2F5. on\uC740 dependent on, based on \uB4F1\uC5D0 \uC4F0\uC778\uB2E4.",
          "\uC815\uB2F5. with\uAC00 consistent\uC640 \uACB0\uD569\uD574 '~\uC640 \uC77C\uCE58\uD558\uB294'\uC774\uB77C\uB294 \uC758\uBBF8\uB97C \uB9CC\uB4E0\uB2E4."
        ]
      },
      skills: ["preposition", "collocation"]
    },
    {
      id: "G-NCL-0014",
      section: "grammar",
      part: 2,
      type: "noun-clause",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["noun-clause", "work"],
      concept: "\uBD88\uD655\uC2E4\uC131\uC744 \uB098\uD0C0\uB0B4\uB294 \uBA85\uC0AC\uC808 \uC811\uC18D\uC0AC whether",
      question: "Choose the option that best completes the blank.",
      passage: "It is not yet clear ___ the new policy will apply to part-time employees as well.",
      choices: ["that", "what", "whether", "which"],
      answer: 2,
      explanation: {
        summary: "'~\uC778\uC9C0 \uC544\uB2CC\uC9C0'\uB77C\uB294 \uBD88\uD655\uC2E4\uD55C \uB0B4\uC6A9\uC744 \uC774\uB044\uB294 \uBA85\uC0AC\uC808 \uC811\uC18D\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        rule: "not clear, uncertain, unknown \uB4F1 \uBD88\uD655\uC2E4\uC131\uC744 \uB098\uD0C0\uB0B4\uB294 \uD45C\uD604 \uB4A4\uC5D0\uB294 whether\uC808\uC774 \uC628\uB2E4. that\uC808\uC740 \uC0AC\uC2E4\uB85C \uC804\uC81C\uB41C \uB0B4\uC6A9\uC744 \uC774\uB048\uB2E4.",
        sentenceAnalysis: "It\uC740 \uAC00\uC8FC\uC5B4\uC774\uACE0 \uBE48\uCE78 \uC774\uD558\uAC00 \uC9C4\uC8FC\uC5B4\uC778 \uBA85\uC0AC\uC808\uC774\uBA70, \uC808 \uB0B4\uBD80\uB294 the new policy will apply\uB85C \uC131\uBD84\uC774 \uBAA8\uB450 \uAC16\uCDB0\uC838 \uC788\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. that\uC740 \uB0B4\uC6A9\uC744 \uC0AC\uC2E4\uB85C \uC804\uC81C\uD558\uBBC0\uB85C '\uC544\uC9C1 \uBD88\uBD84\uBA85\uD558\uB2E4'\uB294 \uC8FC\uC808\uACFC \uB17C\uB9AC\uC801\uC73C\uB85C \uCDA9\uB3CC\uD55C\uB2E4.",
          "\uC624\uB2F5. what\uC740 \uC808 \uC548\uC5D0 \uBE60\uC9C4 \uBA85\uC0AC \uC131\uBD84\uC774 \uC788\uC5B4\uC57C \uD558\uB294\uB370 \uC774 \uC808\uC740 \uC644\uC804\uD558\uB2E4.",
          "\uC815\uB2F5. whether\uAC00 '~\uC778\uC9C0 \uC544\uB2CC\uC9C0'\uB77C\uB294 \uBD88\uD655\uC2E4\uC131\uC744 \uB098\uD0C0\uB0B4\uC5B4 not yet clear\uC640 \uB9DE\uBB3C\uB9B0\uB2E4.",
          "\uC624\uB2F5. which\uB294 \uC120\uD0DD\uC9C0\uAC00 \uC81C\uC2DC\uB41C \uC0C1\uD669\uC5D0\uC11C \uC4F0\uC774\uBA70 \uB4A4\uC5D0 \uBA85\uC0AC\uAC00 \uC624\uAC70\uB098 \uBD88\uC644\uC804\uD55C \uC808\uC774 \uC774\uC5B4\uC838\uC57C \uD55C\uB2E4."
        ]
      },
      skills: ["noun-clause", "logical-reasoning"]
    },
    {
      id: "G-INV-0015",
      section: "grammar",
      part: 2,
      type: "inversion",
      difficulty: 4,
      targetScoreBand: "330-400",
      tags: ["inversion", "literature"],
      concept: "\uBD80\uC815\uC5B4\uAD6C \uBB38\uB450 \uB3C4\uCE58",
      question: "Choose the option that best completes the blank.",
      passage: "Not until the final chapter ___ the narrator's real identity.",
      choices: ["we learn", "do we learn", "we do learn", "learn we"],
      answer: 1,
      explanation: {
        summary: "\uBD80\uC815\uC5B4\uAD6C Not until\uC774 \uBB38\uB450\uC5D0 \uC654\uC73C\uBBC0\uB85C \uC8FC\uC5B4\uC640 \uC870\uB3D9\uC0AC\uB97C \uB3C4\uCE58\uD574\uC57C \uD55C\uB2E4.",
        rule: "Not until, Never, Hardly, Little \uB4F1 \uBD80\uC815\uC5B4(\uAD6C)\uAC00 \uBB38\uC7A5 \uC55E\uC5D0 \uC624\uBA74 '\uC870\uB3D9\uC0AC + \uC8FC\uC5B4 + \uBCF8\uB3D9\uC0AC' \uC5B4\uC21C\uC73C\uB85C \uB3C4\uCE58\uD55C\uB2E4. \uC77C\uBC18\uB3D9\uC0AC\uB294 do/does/did\uB97C \uC0AC\uC6A9\uD55C\uB2E4.",
        sentenceAnalysis: "Not until the final chapter\uAC00 \uBD80\uC0AC\uAD6C\uB85C \uBB38\uB450\uC5D0 \uB098\uC654\uACE0, \uC8FC\uC5B4 we\uC640 \uBCF8\uB3D9\uC0AC learn\uC774 \uB3C4\uCE58 \uB300\uC0C1\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. we learn\uC740 \uB3C4\uCE58\uAC00 \uC801\uC6A9\uB418\uC9C0 \uC54A\uC740 \uD3C9\uC11C\uBB38 \uC5B4\uC21C\uC774\uB2E4.",
          "\uC815\uB2F5. do we learn\uC774 \uBD80\uC815\uC5B4\uAD6C \uB3C4\uCE58\uC758 \uC62C\uBC14\uB978 \uC5B4\uC21C\uC774\uB2E4.",
          "\uC624\uB2F5. we do learn\uC740 \uAC15\uC870\uD615\uC774\uC9C0\uB9CC \uC5B4\uC21C\uC774 \uB3C4\uCE58\uB418\uC9C0 \uC54A\uC558\uB2E4.",
          "\uC624\uB2F5. learn we\uB294 \uBCF8\uB3D9\uC0AC\uB97C \uC55E\uC138\uC6B4 \uD615\uD0DC\uB85C \uD604\uB300 \uC601\uC5B4\uC758 \uB3C4\uCE58 \uADDC\uCE59\uC5D0 \uC5B4\uAE0B\uB09C\uB2E4."
        ]
      },
      skills: ["inversion", "sentence-structure"]
    },
    {
      id: "G-TNS-0016",
      section: "grammar",
      part: 2,
      type: "tense",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["tense", "career"],
      concept: "\uACFC\uAC70 \uC2DC\uC810 \uAE30\uC900\uC758 \uC644\uB8CC \uC2DC\uC81C",
      question: "Choose the option that best completes the blank.",
      passage: "She ___ for the firm for six years when she was offered the directorship.",
      choices: ["has worked", "works", "is working", "had worked"],
      answer: 3,
      explanation: {
        summary: "\uC81C\uC548\uC744 \uBC1B\uC740 \uACFC\uAC70 \uC2DC\uC810\uAE4C\uC9C0\uC758 \uADFC\uBB34 \uAE30\uAC04\uC744 \uB098\uD0C0\uB0B4\uC57C \uD558\uBBC0\uB85C \uACFC\uAC70\uC644\uB8CC\uB97C \uACE0\uB978\uB2E4.",
        rule: "\uACFC\uAC70\uC758 \uC5B4\uB290 \uC2DC\uC810\uAE4C\uC9C0 \uC774\uC5B4\uC9C4 \uAE30\uAC04\uC744 \uB9D0\uD560 \uB54C\uB294 'had p.p. + for + \uAE30\uAC04'\uC744 \uC4F4\uB2E4.",
        sentenceAnalysis: "when she was offered the directorship\uC774 \uACFC\uAC70 \uAE30\uC900\uC810\uC774\uACE0, 6\uB144\uAC04\uC758 \uADFC\uBB34\uB294 \uADF8 \uC774\uC804\uBD80\uD130\uC758 \uC77C\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. has worked\uB294 \uD604\uC7AC\uAE4C\uC9C0\uC758 \uC9C0\uC18D\uC744 \uB098\uD0C0\uB0B4\uC5B4 \uACFC\uAC70 \uAE30\uC900\uC810\uACFC \uCDA9\uB3CC\uD55C\uB2E4.",
          "\uC624\uB2F5. works\uB294 \uB2E8\uC21C \uD604\uC7AC\uD615\uC73C\uB85C \uACFC\uAC70\uC758 \uC0AC\uAC74\uACFC \uC2DC\uC81C\uAC00 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. is working\uC740 \uD604\uC7AC\uC9C4\uD589\uD615\uC774\uB77C \uACFC\uAC70 \uBB38\uB9E5\uC5D0 \uC4F8 \uC218 \uC5C6\uB2E4.",
          "\uC815\uB2F5. had worked\uAC00 \uACFC\uAC70 \uC2DC\uC810 \uC774\uC804\uBD80\uD130 \uC774\uC5B4\uC9C4 6\uB144\uC758 \uADFC\uBB34\uB97C \uC815\uD655\uD788 \uB098\uD0C0\uB0B8\uB2E4."
        ]
      },
      skills: ["tense", "time-reference"]
    },
    {
      id: "G-ADV-0017",
      section: "grammar",
      part: 1,
      type: "adverbial-clause",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["conjunction", "daily-life"],
      concept: "\uC870\uAC74 \uBD80\uC0AC\uC808 \uC811\uC18D\uC0AC unless",
      question: "Choose the option that best completes the blank.",
      passage: "A: ___ you leave within the next ten minutes, you'll miss the last shuttle.\nB: Then I'd better get going right away.",
      choices: ["Unless", "If", "Although", "Whether"],
      answer: 0,
      explanation: {
        summary: "'\uC9C0\uAE08 \uB098\uAC00\uC9C0 \uC54A\uC73C\uBA74 \uB193\uCE5C\uB2E4'\uB294 \uB17C\uB9AC\uC774\uBBC0\uB85C \uBD80\uC815 \uC870\uAC74 \uC811\uC18D\uC0AC\uB97C \uACE0\uB978\uB2E4.",
        rule: "unless\uB294 'if ~ not'\uC758 \uC758\uBBF8\uB85C \uBD80\uC815 \uC870\uAC74\uC744 \uB098\uD0C0\uB0B4\uBA70, \uC808 \uC548\uC5D0 not\uC744 \uB2E4\uC2DC \uC4F0\uC9C0 \uC54A\uB294\uB2E4.",
        sentenceAnalysis: "B\uC758 \uB300\uB2F5 I'd better get going right away\uAC00 \uC11C\uB458\uB7EC\uC57C \uD55C\uB2E4\uB294 \uB73B\uC774\uBBC0\uB85C \uC870\uAC74\uC808\uC740 \uBD80\uC815\uC774\uC5B4\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. Unless you leave\uB294 '\uB5A0\uB098\uC9C0 \uC54A\uC73C\uBA74'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uB4A4 \uC808\uC758 \uACBD\uACE0\uC640 \uB17C\uB9AC\uAC00 \uB9DE\uB294\uB2E4.",
          "\uC624\uB2F5(Reversal). If\uB97C \uC4F0\uBA74 '\uC9C0\uAE08 \uB5A0\uB098\uBA74 \uB9C9\uCC28\uB97C \uB193\uCE5C\uB2E4'\uB294 \uC815\uBC18\uB300 \uC758\uBBF8\uAC00 \uB41C\uB2E4.",
          "\uC624\uB2F5. Although\uB294 \uC591\uBCF4\uB97C \uB098\uD0C0\uB0B4\uC5B4 \uC778\uACFC \uD750\uB984\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. Whether\uB294 '~\uC774\uB4E0 \uC544\uB2C8\uB4E0'\uC774\uB77C\uB294 \uB73B\uC73C\uB85C \uC870\uAC74\uC758 \uC778\uACFC \uAD00\uACC4\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD55C\uB2E4."
        ]
      },
      skills: ["conjunction", "logical-reasoning"]
    },
    {
      id: "G-SVA-0018",
      section: "grammar",
      part: 2,
      type: "subject-verb-agreement",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["agreement", "business"],
      concept: "each of + \uBCF5\uC218\uBA85\uC0AC\uC758 \uC218\uC77C\uCE58",
      question: "Choose the option that best completes the blank.",
      passage: "Each of the three proposals ___ merit, but the budget allows for only one.",
      choices: ["have", "are having", "has", "having"],
      answer: 2,
      explanation: {
        summary: "\uC8FC\uC5B4\uC758 \uD575\uC774 Each\uC774\uBBC0\uB85C \uB2E8\uC218 \uB3D9\uC0AC\uB97C \uC368\uC57C \uD55C\uB2E4.",
        rule: "each of, one of, either of + \uBCF5\uC218\uBA85\uC0AC\uB294 \uB2E8\uC218 \uCDE8\uAE09\uD55C\uB2E4. \uC804\uCE58\uC0AC\uAD6C \uC548\uC758 \uBCF5\uC218\uBA85\uC0AC\uC5D0 \uB3D9\uC0AC\uB97C \uB9DE\uCD94\uC9C0 \uC54A\uB3C4\uB85D \uC8FC\uC758\uD55C\uB2E4.",
        sentenceAnalysis: "of the three proposals\uB294 \uC804\uCE58\uC0AC\uAD6C\uC77C \uBFD0 \uC8FC\uC5B4\uAC00 \uC544\uB2C8\uBA70, \uC8FC\uC5B4\uB294 Each\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. have\uB294 \uBCF5\uC218 \uB3D9\uC0AC\uC5EC\uC11C \uB2E8\uC218 \uC8FC\uC5B4 Each\uC640 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. are having\uC740 \uC218\uC77C\uCE58\uB3C4 \uD2C0\uB9AC\uACE0, \uC0C1\uD0DC\uB97C \uB73B\uD558\uB294 have\uB294 \uC9C4\uD589\uD615\uC73C\uB85C \uC4F0\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC815\uB2F5. has\uAC00 \uB2E8\uC218 \uC8FC\uC5B4 Each\uC5D0 \uB9DE\uB294 \uB3D9\uC0AC\uB2E4.",
          "\uC624\uB2F5. having\uC740 \uC900\uB3D9\uC0AC\uC5EC\uC11C \uBB38\uC7A5\uC758 \uBCF8\uB3D9\uC0AC\uAC00 \uB420 \uC218 \uC5C6\uB2E4."
        ]
      },
      skills: ["subject-verb-agreement", "sentence-structure"]
    },
    {
      id: "G-REL-0019",
      section: "grammar",
      part: 2,
      type: "relative-clause",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["relative-clause", "science"],
      concept: "\uACC4\uC18D\uC801 \uC6A9\uBC95\uC758 \uAD00\uACC4\uB300\uBA85\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "The research center, ___ opened in 2019, now employs more than fifty scientists.",
      choices: ["that", "which", "where", "what"],
      answer: 1,
      explanation: {
        summary: "\uCF64\uB9C8\uAC00 \uC788\uB294 \uACC4\uC18D\uC801 \uC6A9\uBC95\uC774\uBA70 \uAD00\uACC4\uC808 \uC548\uC5D0 \uC8FC\uC5B4\uAC00 \uBE44\uC5B4 \uC788\uC73C\uBBC0\uB85C \uC8FC\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC which\uAC00 \uD544\uC694\uD558\uB2E4.",
        rule: "\uAD00\uACC4\uB300\uBA85\uC0AC that\uC740 \uACC4\uC18D\uC801 \uC6A9\uBC95(\uCF64\uB9C8 \uB4A4)\uC5D0 \uC4F8 \uC218 \uC5C6\uB2E4. \uC120\uD589\uC0AC\uAC00 \uC0AC\uBB3C\uC774\uACE0 \uAD00\uACC4\uC808\uC5D0 \uC8FC\uC5B4\uAC00 \uC5C6\uC73C\uBA74 which\uB97C \uC4F4\uB2E4.",
        sentenceAnalysis: "opened in 2019\uC5D0\uB294 \uC8FC\uC5B4\uAC00 \uC5C6\uC73C\uBBC0\uB85C \uC120\uD589\uC0AC The research center\uB97C \uB300\uC2E0\uD560 \uC8FC\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC\uAC00 \uB4E4\uC5B4\uAC00\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. that\uC740 \uCF64\uB9C8 \uB4A4 \uACC4\uC18D\uC801 \uC6A9\uBC95\uC73C\uB85C \uC4F8 \uC218 \uC5C6\uB2E4.",
          "\uC815\uB2F5. which\uAC00 \uC0AC\uBB3C \uC120\uD589\uC0AC\uB97C \uBC1B\uB294 \uC8FC\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC\uB85C \uC54C\uB9DE\uB2E4.",
          "\uC624\uB2F5. where\uB294 \uAD00\uACC4\uBD80\uC0AC\uC5EC\uC11C \uB4A4\uC5D0 \uC644\uC804\uD55C \uC808\uC774 \uC640\uC57C \uD558\uB294\uB370 \uC8FC\uC5B4\uAC00 \uBE44\uC5B4 \uC788\uB2E4.",
          "\uC624\uB2F5. what\uC740 \uC120\uD589\uC0AC\uB97C \uD3EC\uD568\uD558\uB294 \uAD00\uACC4\uB300\uBA85\uC0AC\uB77C \uC55E\uC5D0 \uC120\uD589\uC0AC\uAC00 \uC788\uC73C\uBA74 \uC4F8 \uC218 \uC5C6\uB2E4."
        ]
      },
      skills: ["relative-clause", "sentence-structure"]
    },
    {
      id: "G-ERR-0020",
      section: "grammar",
      part: 3,
      type: "error-identification",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["error-identification", "comparison"],
      concept: "\uBE44\uAD50\uAE09\uC758 \uC911\uBCF5 \uC0AC\uC6A9",
      question: "Identify the option that contains an awkward or grammatically incorrect expression.",
      passage: "(a) A: How did the job interview go yesterday?\n(b) B: Honestly, I think I could have prepared more better.\n(c) A: Don't be so hard on yourself. You've been busy all month.\n(d) B: Thanks. I'll hear back from them next week.",
      choices: ["(a)", "(b)", "(c)", "(d)"],
      answer: 1,
      explanation: {
        summary: "\uBE44\uAD50\uAE09\uC774 \uB450 \uBC88 \uACB9\uCCD0 \uC4F0\uC778 \uBD80\uBD84\uC744 \uCC3E\uC544\uB0B4\uB294 \uBB38\uC81C\uB2E4.",
        rule: "better\uB294 \uC774\uBBF8 well/good\uC758 \uBE44\uAD50\uAE09\uC774\uBBC0\uB85C more\uB97C \uB367\uBD99\uC77C \uC218 \uC5C6\uB2E4. \uAC15\uC870\uD558\uB824\uBA74 much better, far better\uCC98\uB7FC \uC4F4\uB2E4.",
        sentenceAnalysis: "(b)\uC758 more better\uB294 could have prepared better \uB610\uB294 could have prepared much better\uB85C \uACE0\uCCD0\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. (a)\uB294 \uACFC\uAC70 \uC2DC\uC810 yesterday\uC640 \uACFC\uAC70\uC2DC\uC81C did\uAC00 \uC77C\uCE58\uD558\uB294 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uBB38\uC7A5\uC774\uB2E4.",
          "\uC815\uB2F5. (b)\uC758 more better\uB294 \uBE44\uAD50\uAE09\uC744 \uC911\uBCF5 \uC0AC\uC6A9\uD55C \uC624\uB958\uB2E4.",
          "\uC624\uB2F5. (c)\uB294 be hard on oneself\uB77C\uB294 \uAD00\uC6A9 \uD45C\uD604\uACFC \uD604\uC7AC\uC644\uB8CC\uC9C4\uD589\uC774 \uBAA8\uB450 \uC801\uC808\uD558\uB2E4.",
          "\uC624\uB2F5. (d)\uB294 hear back from someone\uACFC \uBBF8\uB798 \uD45C\uD604 next week\uC774 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC4F0\uC600\uB2E4."
        ]
      },
      skills: ["comparison", "error-identification"]
    },
    {
      id: "G-ERR-0021",
      section: "grammar",
      part: 4,
      type: "error-identification",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["error-identification", "work"],
      concept: "\uAC00\uBAA9\uC801\uC5B4 it\uC758 \uD544\uC694\uC131",
      question: "Identify the sentence that contains an awkward or grammatically incorrect expression.",
      passage: "(a) Remote work has become standard practice in a growing number of industries. (b) Many employees say they concentrate better without the constant interruptions of an open office. (c) Others, however, find difficult to draw a line between working hours and personal time. (d) In response, several firms have introduced hybrid schedules that combine the two arrangements.",
      choices: ["(a)", "(b)", "(c)", "(d)"],
      answer: 2,
      explanation: {
        summary: "5\uD615\uC2DD \uAD6C\uC870\uC5D0\uC11C \uAC00\uBAA9\uC801\uC5B4 it\uC774 \uBE60\uC9C4 \uBB38\uC7A5\uC744 \uCC3E\uB294 \uBB38\uC81C\uB2E4.",
        rule: "find/think/make/consider + \uBAA9\uC801\uC5B4 + \uBAA9\uC801\uACA9\uBCF4\uC5B4 \uAD6C\uC870\uC5D0\uC11C \uC9C4\uBAA9\uC801\uC5B4\uAC00 to\uBD80\uC815\uC0AC\uAD6C\uC774\uBA74 \uAC00\uBAA9\uC801\uC5B4 it\uC744 \uBC18\uB4DC\uC2DC \uB123\uC5B4\uC57C \uD55C\uB2E4.",
        sentenceAnalysis: "(c)\uB294 find it difficult to draw a line ~\uC73C\uB85C \uACE0\uCCD0\uC57C \uD558\uBA70, \uD604\uC7AC\uC758 \uD615\uD0DC\uB294 difficult\uAC00 \uBAA9\uC801\uC5B4\uCC98\uB7FC \uB193\uC5EC \uAD6C\uC870\uAC00 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. (a)\uB294 \uD604\uC7AC\uC644\uB8CC has become\uACFC \uBCF4\uC5B4 standard practice\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uACB0\uD569\uD588\uB2E4.",
          "\uC624\uB2F5. (b)\uB294 say \uB4A4\uC758 that\uC808 \uC0DD\uB7B5\uACFC \uBE44\uAD50\uAE09 better\uC758 \uC0AC\uC6A9\uC774 \uBAA8\uB450 \uC801\uC808\uD558\uB2E4.",
          "\uC815\uB2F5. (c)\uB294 \uAC00\uBAA9\uC801\uC5B4 it\uC774 \uBE60\uC838 find difficult to draw\uAC00 \uB41C \uC624\uB958\uB2E4.",
          "\uC624\uB2F5. (d)\uB294 \uAD00\uACC4\uB300\uBA85\uC0AC that\uC774 \uC774\uB044\uB294 \uC808\uC774 schedules\uB97C \uC815\uD655\uD788 \uC218\uC2DD\uD55C\uB2E4."
        ]
      },
      skills: ["sentence-structure", "error-identification"]
    },
    {
      id: "G-PAR-0022",
      section: "grammar",
      part: 2,
      type: "parallelism",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["parallelism", "education"],
      concept: "\uC0C1\uAD00\uC811\uC18D\uC0AC\uC758 \uBCD1\uB82C \uAD6C\uC870",
      question: "Choose the option that best completes the blank.",
      passage: "The internship program aims not only to provide practical experience but also ___ students to professionals in the field.",
      choices: ["introducing", "introduces", "introduce", "to introduce"],
      answer: 3,
      explanation: {
        summary: "not only A but also B \uAD6C\uC870\uC5D0\uC11C A\uC640 B\uC758 \uBB38\uBC95 \uD615\uD0DC\uB97C \uC77C\uCE58\uC2DC\uCF1C\uC57C \uD55C\uB2E4.",
        rule: "not only A but also B, both A and B, either A or B \uB4F1 \uC0C1\uAD00\uC811\uC18D\uC0AC\uB294 \uC5F0\uACB0\uB418\uB294 \uB450 \uC694\uC18C\uC758 \uD488\uC0AC\uC640 \uD615\uD0DC\uB97C \uB3D9\uC77C\uD558\uAC8C \uB9DE\uCD98\uB2E4.",
        sentenceAnalysis: "not only \uB4A4\uAC00 to provide\uC774\uBBC0\uB85C but also \uB4A4\uC5D0\uB3C4 to\uBD80\uC815\uC0AC\uAC00 \uC640\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. introducing\uC740 \uB3D9\uBA85\uC0AC\xB7\uBD84\uC0AC \uD615\uD0DC\uB85C to provide\uC640 \uBCD1\uB82C\uC744 \uC774\uB8E8\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC624\uB2F5. introduces\uB294 \uC815\uB3D9\uC0AC \uD615\uD0DC\uC5EC\uC11C to\uBD80\uC815\uC0AC\uC640 \uC5F0\uACB0\uB420 \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. introduce\uB294 \uB3D9\uC0AC\uC6D0\uD615\uC73C\uB85C, to provide\uC640 \uD615\uD0DC\uAC00 \uC5B4\uAE0B\uB09C\uB2E4.",
          "\uC815\uB2F5. to introduce\uAC00 to provide\uC640 \uC815\uD655\uD55C \uBCD1\uB82C \uAD6C\uC870\uB97C \uC774\uB8EC\uB2E4."
        ]
      },
      skills: ["parallelism", "sentence-structure"]
    },
    {
      id: "G-CMP-0023",
      section: "grammar",
      part: 2,
      type: "comparison",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["comparison", "writing"],
      concept: "the \uBE44\uAD50\uAE09, the \uBE44\uAD50\uAE09 \uAD6C\uBB38\uACFC \uAC00\uC0B0\uBA85\uC0AC \uC218\uC2DD",
      question: "Choose the option that best completes the blank.",
      passage: "The more carefully you proofread, ___ errors your final draft will contain.",
      choices: ["the fewer", "the less", "fewer", "the fewest"],
      answer: 0,
      explanation: {
        summary: "'~\uD560\uC218\uB85D \uB354 \u2026\uD558\uB2E4' \uAD6C\uBB38\uC758 \uD6C4\uBC18\uBD80 \uD615\uD0DC\uC640, \uAC00\uC0B0\uBA85\uC0AC\uB97C \uC218\uC2DD\uD558\uB294 \uBE44\uAD50\uAE09\uC744 \uD568\uAED8 \uD310\uB2E8\uD55C\uB2E4.",
        rule: "'The + \uBE44\uAD50\uAE09 ~, the + \uBE44\uAD50\uAE09 ~' \uAD6C\uBB38\uC5D0\uC11C\uB294 \uB450 \uBC88\uC9F8 \uC808\uB3C4 \uBC18\uB4DC\uC2DC the\uB85C \uC2DC\uC791\uD55C\uB2E4. \uC140 \uC218 \uC788\uB294 \uBA85\uC0AC(errors)\uC5D0\uB294 fewer\uB97C, \uC140 \uC218 \uC5C6\uB294 \uBA85\uC0AC\uC5D0\uB294 less\uB97C \uC4F4\uB2E4.",
        sentenceAnalysis: "\uC55E \uC808\uC774 The more carefully\uB85C \uC2DC\uC791\uD558\uBBC0\uB85C \uB4A4 \uC808\uB3C4 the + \uBE44\uAD50\uAE09\uC73C\uB85C \uC2DC\uC791\uD574\uC57C \uD558\uBA70, errors\uB294 \uAC00\uC0B0\uBA85\uC0AC\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. the fewer errors\uAC00 \uAD6C\uBB38 \uD615\uC2DD\uACFC \uAC00\uC0B0\uBA85\uC0AC \uC218\uC2DD \uC870\uAC74\uC744 \uBAA8\uB450 \uCDA9\uC871\uD55C\uB2E4.",
          "\uC624\uB2F5. the less\uB294 \uBD88\uAC00\uC0B0\uBA85\uC0AC\uB97C \uC218\uC2DD\uD558\uBBC0\uB85C errors\uC640 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. fewer\uB294 the\uAC00 \uBE60\uC838 \uC0C1\uAD00 \uAD6C\uBB38\uC758 \uD615\uC2DD\uC774 \uAE68\uC9C4\uB2E4.",
          "\uC624\uB2F5. the fewest\uB294 \uCD5C\uC0C1\uAE09\uC774\uB77C \uC774 \uAD6C\uBB38\uC5D0 \uC4F8 \uC218 \uC5C6\uB2E4."
        ]
      },
      skills: ["comparison", "countability"]
    },
    {
      id: "G-CAU-0024",
      section: "grammar",
      part: 1,
      type: "causative",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["causative", "technology"],
      concept: "have + \uBAA9\uC801\uC5B4 + \uACFC\uAC70\uBD84\uC0AC",
      question: "Choose the option that best completes the blank.",
      passage: "A: Is your laptop working again?\nB: Yes, I had the screen ___ right after the crack appeared.",
      choices: ["repair", "repairing", "repaired", "to repair"],
      answer: 2,
      explanation: {
        summary: "\uBAA9\uC801\uC5B4 the screen\uC774 \uC218\uB9AC\uB418\uB294 \uB300\uC0C1\uC774\uBBC0\uB85C \uC0AC\uC5ED\uB3D9\uC0AC have \uB4A4\uC5D0 \uACFC\uAC70\uBD84\uC0AC\uB97C \uC4F4\uB2E4.",
        rule: "have/get + \uBAA9\uC801\uC5B4 + p.p.\uB294 '~\uC744 \u2026\uB418\uAC8C \uD558\uB2E4'\uB77C\uB294 \uB73B\uC73C\uB85C \uBAA9\uC801\uC5B4\uC640 \uBCF4\uC5B4\uAC00 \uC218\uB3D9 \uAD00\uACC4\uC77C \uB54C \uC4F4\uB2E4. \uBAA9\uC801\uC5B4\uAC00 \uD589\uC704\uC758 \uC8FC\uCCB4\uC774\uBA74 \uB3D9\uC0AC\uC6D0\uD615(have him repair)\uC744 \uC4F4\uB2E4.",
        sentenceAnalysis: "\uD654\uBA74\uC740 \uC2A4\uC2A4\uB85C \uC218\uB9AC\uD558\uB294 \uC8FC\uCCB4\uAC00 \uC544\uB2C8\uB77C \uC218\uB9AC\uB418\uB294 \uB300\uC0C1\uC774\uBBC0\uB85C \uC218\uB3D9 \uAD00\uACC4\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. repair\uB294 \uBAA9\uC801\uC5B4\uAC00 \uD589\uC704\uC758 \uC8FC\uCCB4\uC77C \uB54C \uC4F0\uB294 \uD615\uD0DC\uB85C the screen\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5. repairing\uC740 \uB2A5\uB3D9\xB7\uC9C4\uD589\uC758 \uC758\uBBF8\uAC00 \uB418\uC5B4 \uC218\uB3D9 \uAD00\uACC4\uB97C \uB098\uD0C0\uB0B4\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC815\uB2F5. repaired\uAC00 \uBAA9\uC801\uC5B4\uC640\uC758 \uC218\uB3D9 \uAD00\uACC4\uB97C \uC815\uD655\uD788 \uD45C\uD604\uD55C\uB2E4.",
          "\uC624\uB2F5. to repair\uB294 have\uC758 \uBAA9\uC801\uACA9\uBCF4\uC5B4\uB85C \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["causative", "verb-form"]
    },
    {
      id: "G-SUC-0025",
      section: "grammar",
      part: 2,
      type: "structure",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["sentence-structure", "communication"],
      concept: "such a + \uD615\uC6A9\uC0AC + \uBA85\uC0AC that \uAD6C\uBB38",
      question: "Choose the option that best completes the blank.",
      passage: "It was ___ a persuasive argument that even the harshest critics changed their minds.",
      choices: ["so", "such", "very", "too"],
      answer: 1,
      explanation: {
        summary: "\uBE48\uCE78 \uB4A4\uAC00 'a + \uD615\uC6A9\uC0AC + \uBA85\uC0AC'\uC774\uBBC0\uB85C such\uB97C \uC368\uC57C \uD55C\uB2E4.",
        rule: "such + a(n) + \uD615\uC6A9\uC0AC + \uBA85\uC0AC + that\uC808, so + \uD615\uC6A9\uC0AC + a(n) + \uBA85\uC0AC + that\uC808. \uC989 \uBA85\uC0AC\uAC00 \uD3EC\uD568\uB41C \uAD6C\uB97C \uC218\uC2DD\uD560 \uB54C\uB294 such\uB97C \uC4F4\uB2E4.",
        sentenceAnalysis: "a persuasive argument\uB77C\uB294 \uBA85\uC0AC\uAD6C \uC804\uCCB4\uB97C \uC218\uC2DD\uD558\uBA70 that\uC808\uC774 \uACB0\uACFC\uB97C \uB098\uD0C0\uB0B8\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. so\uB97C \uC4F0\uB824\uBA74 so persuasive an argument\uCC98\uB7FC \uC5B4\uC21C\uC744 \uBC14\uAFD4\uC57C \uD55C\uB2E4.",
          "\uC815\uB2F5. such a persuasive argument that ~\uC774 \uC62C\uBC14\uB978 \uD615\uC2DD\uC774\uB2E4.",
          "\uC624\uB2F5. very\uB294 that\uC808\uACFC \uACB0\uD569\uD574 \uACB0\uACFC \uAD6C\uBB38\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD55C\uB2E4.",
          "\uC624\uB2F5. too\uB294 'too ~ to' \uAD6C\uBB38\uC5D0 \uC4F0\uC774\uBA70 that\uC808 \uACB0\uACFC \uAD6C\uBB38\uACFC \uC5B4\uC6B8\uB9AC\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["sentence-structure", "conjunction"]
    }
  ];

  // data/packs/TEPS_Crew_Pack_002.json
  var TEPS_Crew_Pack_002_default = [
    {
      id: "R-BLK-0001",
      section: "reading",
      part: 1,
      type: "blank",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["blank", "learning", "cause-effect"],
      question: "Choose the option that best completes the passage.",
      passage: "Many adults who return to studying English after a long break assume that their earlier knowledge is simply gone. In fact, most of it is still stored; what has weakened is the pathway used to retrieve it. This is why a learner may fail to produce a word in conversation and yet recognize it instantly on a printed page. Recovery therefore depends less on relearning vocabulary from zero than on ___. Short, frequent attempts to recall words without looking them up restore access far more efficiently than rereading long lists.",
      choices: [
        "rebuilding the ability to recall what is already stored",
        "memorizing an entirely new set of academic words",
        "avoiding conversation until accuracy has improved",
        "replacing reading practice with listening practice"
      ],
      answer: 0,
      explanation: {
        summary: "\uBE48\uCE78 \uC55E\uB4A4\uAC00 '\uC9C0\uC2DD\uC740 \uB0A8\uC544 \uC788\uACE0 \uC778\uCD9C \uACBD\uB85C\uB9CC \uC57D\uD574\uC84C\uB2E4 \u2192 \uADF8\uB798\uC11C \uD68C\uBCF5\uC740 ___\uC5D0 \uB2EC\uB824 \uC788\uB2E4'\uB294 \uAD6C\uC870\uB2E4. \uB530\uB77C\uC11C '\uC774\uBBF8 \uC800\uC7A5\uB41C \uAC83\uC744 \uB2E4\uC2DC \uAEBC\uB0B4\uB294 \uB2A5\uB825\uC758 \uBCF5\uAD6C'\uAC00 \uB4E4\uC5B4\uAC00\uC57C \uD55C\uB2E4.",
        evidence: "most of it is still stored; what has weakened is the pathway used to retrieve it\uC640 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC758 Short, frequent attempts to recall words\uAC00 \uBE48\uCE78 \uB0B4\uC6A9\uC744 \uC55E\uB4A4\uC5D0\uC11C \uB3D9\uC2DC\uC5D0 \uC9C0\uC9C0\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. still stored(\uC800\uC7A5\uC740 \uB418\uC5B4 \uC788\uC74C) + attempts to recall(\uC778\uCD9C \uC5F0\uC2B5)\uC744 \uD55C \uBB38\uC7A5\uC73C\uB85C \uC694\uC57D\uD55C \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5. \uC9C0\uBB38\uC740 '\uC0C8 \uB2E8\uC5B4\uB97C \uC678\uC6B0\uB294 \uAC83'\uC774 \uC544\uB2C8\uB77C relearning vocabulary from zero\uB97C \uC624\uD788\uB824 \uBD80\uC815\uD558\uACE0 \uC788\uB2E4.",
          "\uC624\uB2F5. \uB300\uD654\uB97C \uD53C\uD558\uB77C\uB294 \uC870\uC5B8\uC740 \uC9C0\uBB38 \uC5B4\uB514\uC5D0\uB3C4 \uC5C6\uC73C\uBA70, \uC778\uCD9C \uC5F0\uC2B5\uC744 \uAC15\uC870\uD558\uB294 \uACB0\uB860\uACFC \uBC18\uB300 \uBC29\uD5A5\uC774\uB2E4.",
          "\uC624\uB2F5. \uC77D\uAE30\uC640 \uB4E3\uAE30\uC758 \uC6B0\uC5F4\uC740 \uB17C\uC810\uC774 \uC544\uB2C8\uB2E4. \uC9C0\uBB38\uC758 \uB300\uC870\uCD95\uC740 '\uC778\uCD9C \uC5F0\uC2B5 vs \uC218\uB3D9\uC801 \uBC18\uBCF5 \uC77D\uAE30'\uC774\uB2E4."
        ]
      },
      skills: ["blank", "context", "paraphrase"],
      vocabulary: [
        { word: "retrieve", meaning: "(\uAE30\uC5B5\uC744) \uC778\uCD9C\uD558\uB2E4, \uB418\uCC3E\uB2E4" },
        { word: "pathway", meaning: "\uACBD\uB85C, \uD1B5\uB85C" }
      ]
    },
    {
      id: "R-MAI-0002",
      section: "reading",
      part: 1,
      type: "main-idea",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["main-idea", "workplace", "research"],
      question: "What is the main idea of the passage?",
      passage: "When open-plan offices spread through the corporate world, they were promoted as engines of collaboration: remove the walls, the argument went, and ideas would circulate freely. Recent workplace research complicates that claim. After one firm moved its staff from cubicles to an open floor, face-to-face interaction fell by roughly seventy percent, while email and instant messaging rose sharply. Employees appear to have responded to the loss of privacy by retreating into headphones and digital channels. The layout did not eliminate communication so much as push it into forms that felt less exposed. Openness, in short, had been designed into the architecture but not into the behavior.",
      choices: [
        "Open-plan offices often produce the opposite of the interaction they were meant to create.",
        "Employees prefer digital communication no matter how their workplace is arranged.",
        "Cubicles have been shown to be more productive than open floors for most kinds of work.",
        "Companies adopted open-plan layouts mainly in order to reduce real estate costs."
      ],
      answer: 0,
      explanation: {
        summary: "'\uAC1C\uBC29\uD615 \uC0AC\uBB34\uC2E4\uC740 \uD611\uC5C5\uC744 \uB298\uB9B0\uB2E4'\uB294 \uD1B5\uB150\uC744 \uC81C\uC2DC\uD55C \uB4A4, \uC2E4\uC81C\uB85C\uB294 \uB300\uBA74 \uC18C\uD1B5\uC774 \uAE09\uAC10\uD558\uACE0 \uB514\uC9C0\uD138 \uC18C\uD1B5\uC73C\uB85C \uC62E\uACA8\uAC14\uB2E4\uB294 \uBC18\uC804\uC744 \uBCF4\uC5EC\uC8FC\uB294 \uAE00\uC774\uB2E4. \uC989 \uC758\uB3C4\uC640 \uACB0\uACFC\uAC00 \uC5B4\uAE0B\uB0AC\uB2E4\uB294 \uAC83\uC774 \uC694\uC9C0\uB2E4.",
        evidence: "Recent workplace research complicates that claim\uACFC face-to-face interaction fell by roughly seventy percent, \uADF8\uB9AC\uACE0 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5 designed into the architecture but not into the behavior\uAC00 \uD575\uC2EC\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. '\uD611\uC5C5\uC744 \uC704\uD574 \uB9CC\uB4E0 \uAD6C\uC870\uAC00 \uC624\uD788\uB824 \uB300\uBA74 \uC18C\uD1B5\uC744 \uC904\uC600\uB2E4'\uB294 \uC9C0\uBB38 \uC804\uCCB4\uC758 \uBC18\uC804 \uAD6C\uC870\uB97C \uADF8\uB300\uB85C \uC694\uC57D\uD55C\uB2E4.",
          "\uC624\uB2F5(\uACFC\uC789 \uC77C\uBC18\uD654). \uC9C1\uC6D0\uB4E4\uC774 \uC6D0\uB798 \uB514\uC9C0\uD138 \uC18C\uD1B5\uC744 \uC120\uD638\uD55C\uB2E4\uB294 \uB9D0\uC740 \uC5C6\uB2E4. \uC9C0\uBB38\uC740 \uD504\uB77C\uC774\uBC84\uC2DC \uC0C1\uC2E4\uC5D0 \uB300\uD55C '\uBC18\uC751'\uC73C\uB85C \uC124\uBA85\uD55C\uB2E4.",
          "\uC624\uB2F5(\uBE44\uAD50 \uD655\uB300). \uD050\uBE44\uD074\uACFC \uAC1C\uBC29\uD615\uC758 \uC0DD\uC0B0\uC131 \uC6B0\uC5F4\uC740 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uACE0, \uCE21\uC815\uB41C \uAC83\uC740 \uC0C1\uD638\uC791\uC6A9 \uBC29\uC2DD\uC758 \uBCC0\uD654\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uC784\uB300 \uBE44\uC6A9 \uC808\uAC10 \uB3D9\uAE30\uB294 \uC9C0\uBB38\uC5D0 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uB294 \uC678\uBD80 \uC9C0\uC2DD\uC774\uB2E4."
        ]
      },
      skills: ["main-idea", "summarize", "author-purpose"],
      vocabulary: [
        { word: "circulate", meaning: "(\uC815\uBCF4\xB7\uC544\uC774\uB514\uC5B4\uAC00) \uB3CC\uB2E4, \uC720\uD1B5\uB418\uB2E4" },
        { word: "complicate a claim", meaning: "\uC8FC\uC7A5\uC744 \uB2E8\uC21C\uD558\uC9C0 \uC54A\uAC8C \uB9CC\uB4E4\uB2E4, \uBC18\uBC15 \uADFC\uAC70\uB97C \uB354\uD558\uB2E4" }
      ]
    },
    {
      id: "R-DET-0003",
      section: "reading",
      part: 1,
      type: "detail",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["detail", "notice", "practical-english"],
      question: "According to the notice, which of the following is correct?",
      passage: "NOTICE - Riverside Community Center: Evening English Program\n\nRegistration for the fall term opens on September 2 and closes on September 16. Classes meet twice a week, on Tuesdays and Thursdays, from 7:30 to 9:00 p.m., beginning September 22. The full-term fee is 120,000 won; residents of the Riverside district pay 90,000 won upon presenting proof of address at the front desk. Learners who miss more than four sessions cannot receive a completion certificate, although they may continue to attend the remaining classes. Refunds are available in full until the first class meets, and at fifty percent from that point until the end of the fourth week.",
      choices: [
        "District residents pay a reduced fee if they show proof of address.",
        "Registration closes on the same day the first class meets.",
        "Learners who miss five sessions are no longer allowed to attend classes.",
        "No refund of any kind is possible once registration has closed."
      ],
      answer: 0,
      explanation: {
        summary: "\uACF5\uC9C0\uC758 \uC138\uBD80 \uC815\uBCF4\uB97C \uB300\uC870\uD558\uB294 \uBB38\uC81C\uB2E4. \uAC70\uC8FC\uBBFC \uD560\uC778 \uC870\uAC74(\uC8FC\uC18C \uC99D\uBE59 \uC81C\uC2DC)\uC774 \uBA85\uC2DC\uB418\uC5B4 \uC788\uC73C\uBBC0\uB85C \uCCAB \uBC88\uC9F8 \uC120\uD0DD\uC9C0\uAC00 \uC720\uC77C\uD558\uAC8C \uC0AC\uC2E4\uACFC \uC77C\uCE58\uD55C\uB2E4.",
        evidence: "residents of the Riverside district pay 90,000 won upon presenting proof of address\uAC00 \uC9C1\uC811\uC801\uC778 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. 120,000\uC6D0 \u2192 90,000\uC6D0 \uD560\uC778 \uC870\uAC74\uC774 proof of address\uB85C \uBA85\uC2DC\uB418\uC5B4 \uC788\uB2E4.",
          "\uC624\uB2F5(\uB0A0\uC9DC \uD63C\uB3D9). \uB4F1\uB85D \uB9C8\uAC10\uC740 9\uC6D4 16\uC77C, \uAC1C\uAC15\uC740 9\uC6D4 22\uC77C\uB85C \uC11C\uB85C \uB2E4\uB978 \uB0A0\uC9DC\uB2E4.",
          "\uC624\uB2F5(\uBC94\uC704 \uC65C\uACE1). 4\uD68C \uCD08\uACFC \uACB0\uC11D \uC2DC \uC783\uB294 \uAC83\uC740 \uC218\uB8CC\uC99D(completion certificate)\uC774\uBA70, \uC218\uC5C5 \uCC38\uC11D \uC790\uCCB4\uB294 they may continue to attend\uC73C\uB85C \uD5C8\uC6A9\uB41C\uB2E4.",
          "\uC624\uB2F5(\uC870\uAC74 \uD655\uB300). \uB4F1\uB85D \uB9C8\uAC10\uC774 \uC544\uB2C8\uB77C '\uCCAB \uC218\uC5C5'\uC744 \uAE30\uC900\uC73C\uB85C \uC804\uC561 \uD658\uBD88\uC774 \uB05D\uB098\uACE0, \uC774\uD6C4 4\uC8FC\uCC28\uAE4C\uC9C0 50% \uD658\uBD88\uC774 \uAC00\uB2A5\uD558\uB2E4."
        ]
      },
      skills: ["detail", "scanning", "fact-check"],
      vocabulary: [
        { word: "proof of address", meaning: "\uC8FC\uC18C \uC99D\uBE59 \uC11C\uB958" },
        { word: "completion certificate", meaning: "\uC218\uB8CC\uC99D" }
      ]
    },
    {
      id: "R-INF-0004",
      section: "reading",
      part: 1,
      type: "inference",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["inference", "interview", "attitude"],
      question: "What can be inferred about Hallward from the passage?",
      passage: `Reviewers of Hallward's second novel have praised its "effortless" prose, a compliment the author receives with visible discomfort. In a recent interview he mentioned, almost in passing, that the opening chapter went through nineteen drafts, and that he had discarded a full year's work before he found the voice of the narrator. He did not offer this to correct the reviewers so much as to describe his method. He added, however, that readers who assume good writing should feel easy tend to stop as soon as it stops feeling that way.`,
      choices: [
        "The apparent ease of his prose conceals a great deal of labor.",
        "He resents reviewers and considers their praise dishonest.",
        "He writes quickly and rarely finds revision necessary.",
        "He encourages new writers to publish their early drafts."
      ],
      answer: 0,
      explanation: {
        summary: "'\uD798\uB4E4\uC774\uC9C0 \uC54A\uC740 \uB4EF\uD55C \uBB38\uCCB4'\uB77C\uB294 \uCE6D\uCC2C\uC5D0 \uBD88\uD3B8\uD574\uD558\uBA74\uC11C 19\uBC88\uC758 \uCD08\uACE0\uC640 \uBC84\uB9B0 1\uB144\uCE58 \uC6D0\uACE0\uB97C \uC5B8\uAE09\uD55C\uB2E4\uB294 \uAC83\uC740, \uB9E4\uB044\uB7EC\uC6C0 \uB4A4\uC5D0 \uC5C4\uCCAD\uB09C \uB178\uB3D9\uC774 \uC228\uC5B4 \uC788\uB2E4\uB294 \uB73B\uC774\uB2E4.",
        evidence: `praised its "effortless" prose ... with visible discomfort\uC640 nineteen drafts, discarded a full year's work\uC758 \uB300\uC870\uAC00 \uCD94\uB860\uC758 \uADFC\uAC70\uB2E4.`,
        choiceAnalysis: [
          "\uC815\uB2F5. effortless\uB77C\uB294 \uAC89\uBAA8\uC2B5\uACFC nineteen drafts\uB77C\uB294 \uC2E4\uC81C \uACFC\uC815\uC758 \uB300\uBE44\uC5D0\uC11C \uBC14\uB85C \uB3C4\uCD9C\uB41C\uB2E4.",
          "\uC624\uB2F5(\uACFC\uB3C4\uD55C \uCD94\uB860). He did not offer this to correct the reviewers\uB77C\uACE0 \uBA85\uC2DC\uB418\uC5B4 \uC788\uC5B4 '\uB9AC\uBDF0\uC5B4\uB97C \uC6D0\uB9DD\uD55C\uB2E4'\uB294 \uD574\uC11D\uC740 \uC9C0\uB098\uCE58\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). 19\uBC88\uC758 \uAC1C\uACE0\uC640 1\uB144\uCE58 \uC6D0\uACE0 \uD3D0\uAE30\uB294 '\uC218\uC815\uC744 \uAC70\uC758 \uD558\uC9C0 \uC54A\uB294\uB2E4'\uC640 \uC815\uBA74\uC73C\uB85C \uCDA9\uB3CC\uD55C\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uCD08\uACE0 \uCD9C\uAC04\uC744 \uAD8C\uD55C\uB2E4\uB294 \uC5B8\uAE09\uC740 \uC5C6\uACE0, \uC624\uD788\uB824 \uC27D\uAC8C \uB290\uAEF4\uC9C0\uC9C0 \uC54A\uC744 \uB54C \uD3EC\uAE30\uD558\uB294 \uD0DC\uB3C4\uB97C \uACBD\uACC4\uD55C\uB2E4."
        ]
      },
      skills: ["inference", "attitude", "context"],
      vocabulary: [
        { word: "effortless", meaning: "\uD798\uB4E4\uC774\uC9C0 \uC54A\uC740 \uB4EF\uD55C, \uC218\uC6D4\uD574 \uBCF4\uC774\uB294" },
        { word: "in passing", meaning: "\uB9D0\uD558\uB294 \uAE40\uC5D0, \uC9C0\uB098\uAC00\uB294 \uB9D0\uB85C" },
        { word: "discard", meaning: "\uBC84\uB9AC\uB2E4, \uD3D0\uAE30\uD558\uB2E4" }
      ]
    },
    {
      id: "R-COH-0005",
      section: "reading",
      part: 1,
      type: "coherence",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["coherence", "odd-sentence", "history"],
      question: "Choose the sentence that does NOT fit in the context of the passage.",
      passage: "(a) Sleep researchers long treated the eight-hour night as the human default. (b) Historical records, however, suggest that people in pre-industrial Europe commonly slept in two segments, waking for an hour or so around midnight. (c) During that interval they prayed, talked, mended tools, or visited neighbors before returning to a second sleep. (d) Mattress technology has improved dramatically in both support and durability over the past two decades. (e) The single consolidated block we now consider natural may therefore be a fairly recent product of artificial lighting and industrial work schedules.",
      choices: ["(b)", "(c)", "(d)", "(e)"],
      answer: 2,
      explanation: {
        summary: "\uAE00\uC758 \uD750\uB984\uC740 '8\uC2DC\uAC04 \uC218\uBA74\uC740 \uAE30\uBCF8\uAC12\uC774 \uC544\uB2C8\uB2E4 \u2192 \uC0B0\uC5C5\uD654 \uC774\uC804\uC758 \uBD84\uD560 \uC218\uBA74 \u2192 \uADF8 \uC0AC\uC774 \uC2DC\uAC04\uC758 \uD65C\uB3D9 \u2192 \uADF8\uB7EC\uBBC0\uB85C \uC5F0\uC18D \uC218\uBA74\uC740 \uCD5C\uADFC\uC758 \uC0B0\uBB3C'\uC774\uB2E4. \uB9E4\uD2B8\uB9AC\uC2A4 \uAE30\uC220 \uBC1C\uC804\uC740 \uC774 \uB17C\uC9C0\uC640 \uBB34\uAD00\uD558\uB2E4.",
        evidence: "(d)\uC758 Mattress technology\uB294 \uC218\uBA74\uC758 '\uC5ED\uC0AC\uC801 \uD615\uD0DC'\uB77C\uB294 \uC8FC\uC81C\uCD95\uACFC \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC73C\uBA70, (c)\uC640 (e) \uC0AC\uC774\uC758 \uC778\uACFC \uD750\uB984\uC744 \uB04A\uB294\uB2E4.",
        choiceAnalysis: [
          "\uC624\uB2F5. (b)\uB294 however\uB85C (a)\uC758 \uD1B5\uB150\uC744 \uB4A4\uC9D1\uC73C\uBA70 \uBD84\uD560 \uC218\uBA74\uC774\uB77C\uB294 \uD575\uC2EC \uC18C\uC7AC\uB97C \uB3C4\uC785\uD55C\uB2E4.",
          "\uC624\uB2F5. (c)\uB294 (b)\uAC00 \uC5B8\uAE09\uD55C that interval(\uD55C\uBC24\uC911 \uAE68\uC5B4 \uC788\uB294 \uC2DC\uAC04)\uC744 \uAD6C\uCCB4\uD654\uD558\uB294 \uD544\uC218 \uBB38\uC7A5\uC774\uB2E4.",
          "\uC815\uB2F5. (d)\uB294 \uB9E4\uD2B8\uB9AC\uC2A4 \uC0B0\uC5C5 \uAE30\uC220\uC5D0 \uAD00\uD55C \uB0B4\uC6A9\uC73C\uB85C, \uC218\uBA74 \uC2B5\uAD00\uC758 \uC5ED\uC0AC\uC801 \uBCC0\uD654\uB77C\uB294 \uB17C\uC9C0\uC640 \uBB34\uAD00\uD55C \uC0BD\uC785 \uBB38\uC7A5\uC774\uB2E4.",
          "\uC624\uB2F5. (e)\uB294 therefore\uB85C \uC55E\uC758 \uADFC\uAC70\uB97C \uBC1B\uC544 \uACB0\uB860\uC744 \uB0B4\uB9AC\uB294 \uBB38\uC7A5\uC73C\uB85C, \uBC18\uB4DC\uC2DC \uC788\uC5B4\uC57C \uD55C\uB2E4."
        ]
      },
      skills: ["coherence", "logical-flow", "main-idea"],
      vocabulary: [
        { word: "pre-industrial", meaning: "\uC0B0\uC5C5\uD654 \uC774\uC804\uC758" },
        { word: "consolidated", meaning: "\uD558\uB098\uB85C \uD569\uCCD0\uC9C4, \uD1B5\uD569\uB41C" }
      ]
    },
    {
      id: "R-BLK-0006",
      section: "reading",
      part: 1,
      type: "blank",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["blank", "connector", "education"],
      question: "Choose the option that best completes the blank.",
      passage: "Bilingual education programs are usually evaluated after two or three years, and the results tend to look disappointing: students in bilingual classes often lag behind their peers on standardized reading tests. Longer studies tell a different story. By the sixth or seventh year, the same students typically match or surpass classmates who were taught in one language only. ___, the early gap reflects the time required to build two systems at once, not a failure of the method itself.",
      choices: ["In other words", "Nevertheless", "By contrast", "For instance"],
      answer: 0,
      explanation: {
        summary: "\uBE48\uCE78 \uBB38\uC7A5\uC740 \uC55E\uC5D0\uC11C \uC81C\uC2DC\uD55C \uC7A5\uAE30 \uC5F0\uAD6C \uACB0\uACFC\uB97C \uB2E4\uC2DC \uC815\uB9AC\xB7\uD574\uC11D\uD558\uB294 \uBB38\uC7A5\uC774\uB2E4. \uB530\uB77C\uC11C '\uBC14\uAFD4 \uB9D0\uD558\uBA74'\uC5D0 \uD574\uB2F9\uD558\uB294 \uC5F0\uACB0\uC5B4\uAC00 \uD544\uC694\uD558\uB2E4.",
        evidence: "By the sixth or seventh year ... match or surpass\uB77C\uB294 \uC0AC\uC2E4\uC744, \uB4A4 \uBB38\uC7A5\uC774 the early gap reflects the time required ... not a failure of the method\uB85C \uC7AC\uC9C4\uC220\uD558\uACE0 \uC788\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. In other words\uB294 \uC55E \uB0B4\uC6A9\uC744 \uB2E4\uB978 \uB9D0\uB85C \uC815\uB9AC\xB7\uD574\uC11D\uD560 \uB54C \uC4F0\uC774\uBA70, \uC0AC\uC2E4 \u2192 \uD574\uC11D\uC758 \uD750\uB984\uACFC \uC815\uD655\uD788 \uB9DE\uB294\uB2E4.",
          "\uC624\uB2F5(\uB17C\uB9AC \uC624\uB958). Nevertheless\uB294 \uC591\uBCF4\xB7\uC5ED\uC811\uC778\uB370, \uBE48\uCE78 \uC55E\uB4A4\uB294 \uC11C\uB85C \uCDA9\uB3CC\uD558\uC9C0 \uC54A\uACE0 \uAC19\uC740 \uBC29\uD5A5\uC774\uB2E4.",
          "\uC624\uB2F5(\uB17C\uB9AC \uC624\uB958). By contrast\uB294 \uB300\uC870 \uB300\uC0C1\uC774 \uD544\uC694\uD558\uC9C0\uB9CC, \uBE48\uCE78 \uBB38\uC7A5\uC740 \uC55E \uBB38\uC7A5\uC744 \uB4A4\uC9D1\uC9C0 \uC54A\uACE0 \uC124\uBA85\uD55C\uB2E4.",
          "\uC624\uB2F5(\uAE30\uB2A5 \uBD88\uC77C\uCE58). For instance \uB4A4\uC5D0\uB294 \uAD6C\uCCB4\uC801 \uC0AC\uB840\uAC00 \uC640\uC57C \uD558\uB294\uB370, \uC5EC\uAE30\uC11C\uB294 \uC77C\uBC18\uD654\uB41C \uD574\uC11D\uC774 \uC774\uC5B4\uC9C4\uB2E4."
        ]
      },
      skills: ["blank", "connector", "logical-flow"],
      vocabulary: [
        { word: "lag behind", meaning: "~\uBCF4\uB2E4 \uB4A4\uCC98\uC9C0\uB2E4" },
        { word: "surpass", meaning: "\uB2A5\uAC00\uD558\uB2E4, \uC55E\uC9C0\uB974\uB2E4" }
      ]
    },
    {
      id: "R-DET-0007",
      section: "reading",
      part: 1,
      type: "detail",
      difficulty: 3,
      targetScoreBand: "320-350",
      tags: ["detail", "history", "science"],
      question: "According to the passage, which of the following is correct about the Antikythera mechanism?",
      passage: "The Antikythera mechanism, recovered in 1901 from a Roman-era shipwreck off a Greek island, sat largely unexamined in a museum for decades. Only in the 1970s, when researchers applied X-ray imaging, did the scale of its complexity become clear: at least thirty bronze gears arranged to model the movements of the sun and moon and to predict eclipses. Nothing of comparable intricacy appears again in the surviving record until the astronomical clocks of fourteenth-century Europe. The device was not a navigational instrument, as some early observers had assumed, but a calendrical calculator, and its inscriptions indicate that it was made for users who could read Greek.",
      choices: [
        "Its internal structure became clear only after imaging technology was used on it.",
        "It was carried by sailors to determine their position at sea.",
        "Devices of similar complexity continued to be produced in the centuries that followed.",
        "It was uncovered during the excavation of a fourteenth-century European site."
      ],
      answer: 0,
      explanation: {
        summary: "1901\uB144\uC5D0 \uC778\uC591\uB418\uC5C8\uC9C0\uB9CC \uC218\uC2ED \uB144\uAC04 \uBC29\uCE58\uB418\uC5C8\uACE0, 1970\uB144\uB300 X\uC120 \uC601\uC0C1 \uAE30\uC220\uC774 \uC801\uC6A9\uB41C \uB4A4\uC5D0\uC57C \uB0B4\uBD80 \uAD6C\uC870\uAC00 \uBC1D\uD600\uC84C\uB2E4\uB294 \uC138\uBD80 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uB294 \uBB38\uC81C\uB2E4.",
        evidence: "Only in the 1970s, when researchers applied X-ray imaging, did the scale of its complexity become clear\uAC00 \uC9C1\uC811 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. X-ray imaging \uC801\uC6A9 \uC2DC\uC810\uACFC \uBCF5\uC7A1\uC131 \uADDC\uBA85 \uC2DC\uC810\uC774 \uC778\uACFC\uC801\uC73C\uB85C \uC5F0\uACB0\uB418\uC5B4 \uC788\uB2E4.",
          "\uC624\uB2F5(\uBA85\uC2DC\uC801 \uBD80\uC815). not a navigational instrument, as some early observers had assumed\uB77C\uACE0 \uC9C0\uBB38\uC774 \uC9C1\uC811 \uBD80\uC815\uD55C\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). Nothing of comparable intricacy appears again ... until the fourteenth century\uB294 '\uD55C\uB3D9\uC548 \uB2E8\uC808\uB418\uC5C8\uB2E4'\uB294 \uB73B\uC774\uB2E4.",
          "\uC624\uB2F5(\uC2DC\uC810 \uD63C\uB3D9). 14\uC138\uAE30\uB294 \uBE44\uC2B7\uD55C \uC815\uAD50\uD568\uC774 \uB2E4\uC2DC \uB4F1\uC7A5\uD55C \uC2DC\uAE30\uC774\uACE0, \uBC1C\uACAC\uC740 1901\uB144 \uB85C\uB9C8 \uC2DC\uB300 \uB09C\uD30C\uC120\uC5D0\uC11C \uC774\uB8E8\uC5B4\uC84C\uB2E4."
        ]
      },
      skills: ["detail", "scanning", "paraphrase"],
      vocabulary: [
        { word: "shipwreck", meaning: "\uB09C\uD30C\uC120" },
        { word: "intricacy", meaning: "\uC815\uAD50\uD568, \uBCF5\uC7A1\uD568" },
        { word: "inscription", meaning: "\uC0C8\uACA8\uC9C4 \uAE00, \uBA85\uBB38" }
      ]
    },
    {
      id: "R-MAI-0008",
      section: "reading",
      part: 1,
      type: "main-idea",
      difficulty: 4,
      targetScoreBand: "320-350",
      tags: ["main-idea", "technology", "labor"],
      question: "What is the main point of the passage?",
      passage: "Public discussion of automation usually stalls on a single question: how many jobs will disappear? The framing is convenient but misleading. Occupations are bundles of tasks, and machines rarely take the whole bundle. A radiologist's image-reading may be substantially automated while the consultation, the judgment call, and the legal responsibility remain human work. What changes, then, is not the existence of the job but its internal composition, and with it the skills that command a premium. Policies built around headcount forecasts will keep missing this, because the disruption registers inside occupations long before it shows up in employment statistics.",
      choices: [
        "Automation reshapes the internal composition of jobs rather than simply erasing them.",
        "Most forecasts greatly exaggerate the number of jobs automation will destroy.",
        "Radiology demonstrates that professional work is essentially resistant to automation.",
        "Employment statistics remain the most reliable measure of technological disruption."
      ],
      answer: 0,
      explanation: {
        summary: "'\uBA87 \uAC1C\uC758 \uC77C\uC790\uB9AC\uAC00 \uC0AC\uB77C\uC9C0\uB294\uAC00'\uB77C\uB294 \uC9C8\uBB38 \uC790\uCCB4\uAC00 \uC798\uBABB\uB41C \uD2C0\uC774\uBA70, \uC2E4\uC81C \uBCC0\uD654\uB294 \uC9C1\uC5C5\uC758 \uC18C\uBA78\uC774 \uC544\uB2C8\uB77C \uC9C1\uC5C5 \uB0B4\uBD80 \uACFC\uC5C5 \uAD6C\uC131\uC758 \uC7AC\uD3B8\uC774\uB77C\uB294 \uAC83\uC774 \uD575\uC2EC\uC774\uB2E4.",
        evidence: "What changes, then, is not the existence of the job but its internal composition\uACFC the disruption registers inside occupations\uAC00 \uC694\uC9C0\uB97C \uC9C1\uC811 \uC9C4\uC220\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. not the existence of the job but its internal composition\uC744 \uADF8\uB300\uB85C \uC694\uC57D\uD55C \uC9C4\uC220\uC774\uB2E4.",
          "\uC624\uB2F5(\uBBF8\uC138 \uC65C\uACE1). \uC9C0\uBB38\uC740 \uC608\uCE21\uCE58\uAC00 '\uACFC\uC7A5\uB418\uC5C8\uB2E4'\uAC00 \uC544\uB2C8\uB77C \uC9C8\uBB38\uC758 \uD2C0(headcount) \uC790\uCCB4\uAC00 \uC798\uBABB\uB418\uC5C8\uB2E4\uACE0 \uB9D0\uD55C\uB2E4.",
          "\uC624\uB2F5(\uACFC\uC789 \uC77C\uBC18\uD654). \uBC29\uC0AC\uC120\uACFC \uC0AC\uB840\uB294 '\uC790\uB3D9\uD654\uAC00 \uBD88\uAC00\uB2A5\uD558\uB2E4'\uAC00 \uC544\uB2C8\uB77C '\uC77C\uBD80 \uACFC\uC5C5\uB9CC \uC790\uB3D9\uD654\uB41C\uB2E4'\uB97C \uBCF4\uC5EC\uC8FC\uB294 \uC608\uC2DC\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC740 \uACE0\uC6A9 \uD1B5\uACC4\uAC00 \uBCC0\uD654\uB97C \uB4A4\uB2A6\uAC8C \uBC18\uC601\uD55C\uB2E4\uACE0 \uC9C0\uC801\uD558\uBBC0\uB85C \uC2E0\uB8B0\uB3C4\uB97C \uB192\uC774 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["main-idea", "author-purpose", "summarize"],
      vocabulary: [
        { word: "bundle of tasks", meaning: "\uC5EC\uB7EC \uACFC\uC5C5\uC758 \uBB36\uC74C" },
        { word: "command a premium", meaning: "\uC6C3\uB3C8\uC744 \uBC1B\uB2E4, \uB192\uC740 \uAC00\uCE58\uB97C \uC778\uC815\uBC1B\uB2E4" },
        { word: "headcount", meaning: "\uC778\uC6D0\uC218" }
      ]
    },
    {
      id: "R-INF-0009",
      section: "reading",
      part: 1,
      type: "inference",
      difficulty: 4,
      targetScoreBand: "327-target",
      tags: ["inference", "argument", "causation"],
      question: "What can be inferred from the passage?",
      passage: "The city's bicycle-sharing scheme reports that ridership has doubled since the fare was cut in March. Officials cite the figure as proof that price had been the main barrier to use. March, however, was also the month the riverside path opened, connecting two districts that previously had no safe route between them, and the scheme's own data show that nearly forty percent of new trips begin or end at stations along that path. No survey has yet asked riders why they started.",
      choices: [
        "The claim that the fare cut caused the increase has not yet been established.",
        "The fare reduction had no effect at all on the number of riders.",
        "Most riders would have continued using the scheme at the original fare.",
        "The riverside path was built as a response to rising demand for bicycles."
      ],
      answer: 0,
      explanation: {
        summary: "\uC694\uAE08 \uC778\uD558\uC640 \uAC19\uC740 \uB2EC\uC5D0 \uC790\uC804\uAC70 \uB3C4\uB85C \uAC1C\uD1B5\uC774\uB77C\uB294 \uB2E4\uB978 \uBCC0\uC218\uAC00 \uC788\uC5C8\uACE0, \uC774\uC6A9 \uB3D9\uAE30\uB97C \uBB3B\uB294 \uC870\uC0AC\uB3C4 \uC5C6\uC5C8\uB2E4. \uB530\uB77C\uC11C \uC778\uACFC\uAD00\uACC4\uAC00 \uC544\uC9C1 \uC785\uC99D\uB418\uC9C0 \uC54A\uC558\uB2E4\uB294 \uCD94\uB860\uB9CC \uC548\uC804\uD558\uB2E4.",
        evidence: "March, however, was also the month the riverside path opened\uC640 No survey has yet asked riders why they started\uAC00 \uC778\uACFC \uB2E8\uC815 \uBD88\uAC00\uC758 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uAD50\uB780 \uBCC0\uC218(riverside path)\uC640 \uC790\uB8CC \uBD80\uC7AC(no survey)\uB97C \uADFC\uAC70\uB85C '\uC544\uC9C1 \uC99D\uBA85\uB418\uC9C0 \uC54A\uC558\uB2E4'\uB294 \uC808\uC81C\uB41C \uCD94\uB860\uC774\uB2E4.",
          "\uC624\uB2F5(\uACFC\uB3C4\uD55C \uCD94\uB860). \uC694\uAE08 \uC778\uD558 \uD6A8\uACFC\uAC00 '\uC804\uD600 \uC5C6\uC5C8\uB2E4'\uB294 \uAC83\uB3C4 \uB611\uAC19\uC774 \uADFC\uAC70 \uC5C6\uB294 \uB2E8\uC815\uC774\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uC6D0\uB798 \uC694\uAE08\uC5D0\uC11C\uB3C4 \uACC4\uC18D \uC774\uC6A9\uD588\uC744\uC9C0\uB294 \uC870\uC0AC\uAC00 \uC5C6\uC5C8\uB2E4\uACE0 \uBA85\uC2DC\uB418\uC5B4 \uC788\uC5B4 \uC54C \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5(\uC778\uACFC \uC5ED\uC804). \uC790\uC804\uAC70 \uB3C4\uB85C\uAC00 \uC218\uC694 \uC99D\uAC00\uC758 '\uACB0\uACFC'\uB77C\uB294 \uC11C\uC220\uC740 \uC5C6\uC73C\uBA70, \uC9C0\uBB38\uC5D0\uC11C\uB294 \uC99D\uAC00\uC758 \uC7A0\uC7AC\uC801 '\uC6D0\uC778'\uC73C\uB85C \uC81C\uC2DC\uB41C\uB2E4."
        ]
      },
      skills: ["inference", "logical-flow", "critical-reading"],
      vocabulary: [
        { word: "ridership", meaning: "\uC774\uC6A9\uAC1D \uC218, \uC774\uC6A9\uB960" },
        { word: "barrier", meaning: "\uC7A5\uBCBD, \uC7A5\uC560 \uC694\uC778" }
      ]
    },
    {
      id: "R-BLK-0010",
      section: "reading",
      part: 1,
      type: "blank",
      difficulty: 4,
      targetScoreBand: "320-350",
      tags: ["blank", "culture", "abstract"],
      question: "Choose the option that best completes the blank.",
      passage: "Museums have spent two decades digitizing their collections, and the benefits are undeniable: a scholar in Seoul can now examine a manuscript held in Oxford without leaving her desk. Curators, however, have begun to notice a side effect. Because digitized items are the ones that get cited, taught, and reproduced, they steadily accumulate scholarly weight, while comparable objects left in storage drift further out of view. The archive, in this sense, ___. What began as neutral preservation quietly becomes a form of selection.",
      choices: [
        "does not merely record scholarship but helps determine its direction",
        "has grown too large for any single scholar to survey in a lifetime",
        "should be closed to the public until digitization has been completed",
        "reproduces images far more accurately than printed catalogues ever did"
      ],
      answer: 0,
      explanation: {
        summary: "\uB514\uC9C0\uD138\uD654\uB41C \uC790\uB8CC\uB9CC \uC778\uC6A9\xB7\uAD50\uC721\xB7\uC7AC\uC0DD\uC0B0\uB418\uBA74\uC11C \uD559\uBB38\uC801 \uBE44\uC911\uC744 \uC5BB\uACE0 \uB098\uBA38\uC9C0\uB294 \uC78A\uD78C\uB2E4\uB294 \uC124\uBA85\uC774\uBBC0\uB85C, \uC544\uCE74\uC774\uBE0C\uAC00 \uC5F0\uAD6C\uB97C '\uAE30\uB85D'\uD558\uB294 \uB370 \uADF8\uCE58\uC9C0 \uC54A\uACE0 \uC5F0\uAD6C\uC758 \uBC29\uD5A5\uC744 '\uACB0\uC815'\uD55C\uB2E4\uB294 \uC9C4\uC220\uC774 \uB4E4\uC5B4\uAC00\uC57C \uD55C\uB2E4.",
        evidence: "digitized items are the ones that get cited, taught, and reproduced\uC640 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5 neutral preservation quietly becomes a form of selection\uC774 \uBE48\uCE78\uC744 \uC55E\uB4A4\uB85C \uAC10\uC2FC\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. '\uBCF4\uC874'\uC774 \uC0AC\uC2E4\uC0C1 '\uC120\uBCC4'\uC774 \uB41C\uB2E4\uB294 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C \uC608\uACE0\uD558\uB294 \uD45C\uD604\uC774\uB2E4.",
          "\uC624\uB2F5(\uCD08\uC810 \uC774\uD0C8). \uC544\uCE74\uC774\uBE0C\uC758 \uADDC\uBAA8 \uBB38\uC81C\uB294 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uACE0, \uB17C\uC810\uC740 \uD06C\uAE30\uAC00 \uC544\uB2C8\uB77C \uAC00\uC2DC\uC131\uC758 \uBD88\uADE0\uD615\uC774\uB2E4.",
          "\uC624\uB2F5(\uBE44\uC57D). \uB300\uC911 \uACF5\uAC1C\uB97C \uC911\uB2E8\uD558\uB77C\uB294 \uC8FC\uC7A5\uC740 \uC9C0\uBB38\uC758 \uC5B4\uC870(\uAD00\uCC30\uACFC \uBB38\uC81C \uC81C\uAE30)\uC640\uB3C4 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uBB34\uAD00). \uBCF5\uC81C \uC815\uD655\uB3C4\uB294 \uC5EC\uAE30\uC11C \uB2E4\uB8E8\uB294 \uC7C1\uC810\uC774 \uC544\uB2C8\uBA70, \uB4A4 \uBB38\uC7A5\uC758 selection\uACFC \uC5F0\uACB0\uB418\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["blank", "logical-flow", "abstract-reasoning"],
      vocabulary: [
        { word: "digitize", meaning: "\uB514\uC9C0\uD138\uD654\uD558\uB2E4" },
        { word: "drift out of view", meaning: "\uC810\uCC28 \uC2DC\uC57C\uC5D0\uC11C \uC0AC\uB77C\uC9C0\uB2E4" },
        { word: "preservation", meaning: "\uBCF4\uC874" }
      ]
    },
    {
      id: "R-COH-0011",
      section: "reading",
      part: 1,
      type: "coherence",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["coherence", "sentence-order", "everyday"],
      question: "Read the first sentence and choose the best order for the sentences that follow.",
      passage: "Learning to cook from a recipe is not the same as learning to cook.\n\n(a) At that point the recipe stops being a script and becomes a suggestion.\n(b) A recipe tells you what to do but rarely why, so the first few attempts are mostly imitation.\n(c) Over time, though, you begin to notice patterns: why the onions go in before the garlic, why the pan has to be hot.",
      choices: ["(b) - (c) - (a)", "(c) - (b) - (a)", "(b) - (a) - (c)", "(a) - (c) - (b)"],
      answer: 0,
      explanation: {
        summary: "'\uBAA8\uBC29 \uB2E8\uACC4(b) \u2192 \uC2DC\uAC04\uC774 \uC9C0\uB098\uBA70 \uC6D0\uB9AC\uB97C \uD30C\uC545(c) \u2192 \uADF8 \uC2DC\uC810\uC5D0\uC11C \uB808\uC2DC\uD53C\uB294 \uC81C\uC548\uC774 \uB428(a)'\uC758 \uC2DC\uAC04\xB7\uB17C\uB9AC \uC21C\uC11C\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uB2E4.",
        evidence: "(c)\uC758 Over time, though\uAC00 (b)\uC758 \uCD08\uAE30 \uBAA8\uBC29 \uB2E8\uACC4\uB97C \uC804\uC81C\uB85C \uD558\uACE0, (a)\uC758 At that point\uB294 (c)\uAC00 \uB9D0\uD55C '\uC6D0\uB9AC\uB97C \uC54C\uAC8C \uB418\uB294 \uC2DC\uC810'\uC744 \uAC00\uB9AC\uD0A8\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uBAA8\uBC29 \u2192 \uD328\uD134 \uC778\uC2DD \u2192 \uB808\uC2DC\uD53C\uC758 \uC9C0\uC704 \uBCC0\uD654\uB77C\uB294 \uD750\uB984\uC774 \uC9C0\uC2DC\uC5B4 though\uC640 At that point\uB85C \uBAA8\uB450 \uC5F0\uACB0\uB41C\uB2E4.",
          "\uC624\uB2F5. (c)\uC758 though\uB294 \uC55E\uC5D0 \uBC18\uC804 \uB300\uC0C1\uC774 \uC788\uC5B4\uC57C \uD558\uBBC0\uB85C (b)\uBCF4\uB2E4 \uC55E\uC5D0 \uC62C \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. (a)\uC758 At that point\uAC00 \uAC00\uB9AC\uD0AC \uC2DC\uC810\uC774 \uC544\uC9C1 \uC81C\uC2DC\uB418\uC9C0 \uC54A\uC740 \uC0C1\uD0DC\uC5D0\uC11C (a)\uAC00 \uBA3C\uC800 \uB098\uC62C \uC218 \uC5C6\uB2E4.",
          "\uC624\uB2F5. (a)\uB85C \uC2DC\uC791\uD558\uBA74 \uCCAB \uBB38\uC7A5\uACFC \uC9C0\uC2DC \uAD00\uACC4\uAC00 \uB04A\uAE30\uACE0, \uC774\uC5B4\uC9C0\uB294 (c)-(b)\uB3C4 \uC2DC\uAC04 \uC21C\uC11C\uAC00 \uAC70\uAFB8\uB85C\uB2E4."
        ]
      },
      skills: ["coherence", "sentence-order", "cohesive-devices"],
      vocabulary: [
        { word: "imitation", meaning: "\uBAA8\uBC29, \uB530\uB77C \uD558\uAE30" },
        { word: "script", meaning: "\uB300\uBCF8, \uADF8\uB300\uB85C \uB530\uB77C\uC57C \uD558\uB294 \uC9C0\uC2DC\uBB38" }
      ]
    },
    {
      id: "R-DET-0012",
      section: "reading",
      part: 1,
      type: "detail",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["detail", "correspondence", "practical-english"],
      question: "According to the email, which of the following is correct?",
      passage: "Dear Mr. Baek,\n\nThank you for taking our placement test on July 3. Your overall result places you in Intermediate II, although your listening score fell one band below your reading score. For that reason we recommend enrolling in the standard Intermediate II class and adding the twice-weekly listening lab, which is offered at no additional cost to students enrolled in a regular class. Please note that the lab is capped at twelve participants and places are assigned on a first-come basis. Should you prefer to repeat the placement test, you may do so once, but not until sixty days have passed since your first attempt.\n\nRegards,\nJ. Moon, Academic Office",
      choices: [
        "The listening lab costs nothing extra for students in a regular class.",
        "Mr. Baek's listening score was higher than his reading score.",
        "He may take the placement test again whenever he wishes.",
        "Every Intermediate II student is guaranteed a place in the listening lab."
      ],
      answer: 0,
      explanation: {
        summary: "\uB9AC\uC2A4\uB2DD \uB7A9\uC758 \uBE44\uC6A9 \uC870\uAC74, \uC810\uC218 \uAD00\uACC4, \uC7AC\uC2DC\uD5D8 \uC870\uAC74, \uC815\uC6D0 \uC81C\uD55C\uC774 \uAC01\uAC01 \uB2E4\uB974\uAC8C \uC11C\uC220\uB418\uC5B4 \uC788\uB2E4. \uC815\uADDC\uBC18 \uC218\uAC15\uC0DD\uC5D0\uAC8C \uB7A9\uC774 \uBB34\uB8CC\uB77C\uB294 \uC810\uB9CC \uC0AC\uC2E4\uACFC \uC77C\uCE58\uD55C\uB2E4.",
        evidence: "which is offered at no additional cost to students enrolled in a regular class\uAC00 \uC9C1\uC811 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uC815\uADDC \uC218\uC5C5 \uB4F1\uB85D\uC790\uC5D0\uAC8C \uCD94\uAC00 \uBE44\uC6A9\uC774 \uC5C6\uB2E4\uB294 \uC870\uAC74\uC774 \uADF8\uB300\uB85C \uBA85\uC2DC\uB418\uC5B4 \uC788\uB2E4.",
          "\uC624\uB2F5(\uAD00\uACC4 \uC5ED\uC804). your listening score fell one band below your reading score\uC774\uBBC0\uB85C \uB9AC\uC2A4\uB2DD\uC774 \uB354 \uB0AE\uB2E4.",
          "\uC624\uB2F5(\uC870\uAC74 \uB204\uB77D). \uC7AC\uC2DC\uD5D8\uC740 1\uD68C, \uADF8\uAC83\uB3C4 \uCCAB \uC751\uC2DC \uD6C4 60\uC77C\uC774 \uC9C0\uB098\uC57C \uAC00\uB2A5\uD558\uB2E4.",
          "\uC624\uB2F5(\uACFC\uC789 \uC77C\uBC18\uD654). \uB7A9\uC740 \uC815\uC6D0 12\uBA85\uC5D0 \uC120\uCC29\uC21C(first-come basis)\uC774\uBBC0\uB85C \uBAA8\uB450\uC5D0\uAC8C \uBCF4\uC7A5\uB418\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["detail", "scanning", "fact-check"],
      vocabulary: [
        { word: "placement test", meaning: "\uB808\uBCA8 \uBC30\uCE58 \uACE0\uC0AC" },
        { word: "capped at", meaning: "~\uBA85\uC73C\uB85C \uC815\uC6D0\uC774 \uC81C\uD55C\uB41C" },
        { word: "on a first-come basis", meaning: "\uC120\uCC29\uC21C\uC73C\uB85C" }
      ]
    },
    {
      id: "L-RSP-0001",
      section: "listening",
      part: 1,
      type: "response",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["response", "conversation", "study"],
      question: "Choose the most appropriate response to complete the conversation.",
      passage: "",
      transcript: "W: I'm thinking of taking an English test in October, but I haven't studied since college.\nM: ___",
      choices: [
        "Then start with the basics. There's still plenty of time.",
        "You should have registered before you graduated.",
        "I didn't realize the results had already come out.",
        "Right, October is when the scores expire."
      ],
      answer: 0,
      explanation: {
        summary: "'\uC624\uB7AB\uB3D9\uC548 \uACF5\uBD80\uB97C \uC26C\uC5C8\uB2E4'\uB294 \uAC71\uC815\uC5D0 \uB300\uD55C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uBC18\uC751\uC740 \uC870\uC5B8\uACFC \uC548\uC2EC\uC2DC\uD0A4\uAE30\uB2E4. \uAE30\uCD08\uBD80\uD130 \uC2DC\uC791\uD558\uB77C\uB294 \uC81C\uC548\uC774 \uB9E5\uB77D\uC5D0 \uB9DE\uB294\uB2E4.",
        evidence: "I haven't studied since college\uB77C\uB294 \uAC71\uC815\uC5D0 \uB300\uD574 \uB300\uC751\uD574\uC57C \uD558\uBBC0\uB85C, \uD559\uC2B5 \uCD9C\uBC1C\uC810\uACFC \uB0A8\uC740 \uAE30\uAC04\uC744 \uC5B8\uAE09\uD55C \uC751\uB2F5\uC774 \uC801\uC808\uD558\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uACF5\uBC31\uC5D0 \uB300\uD55C \uD574\uBC95(\uAE30\uCD08\uBD80\uD130)\uACFC \uC548\uC2EC(\uC2DC\uAC04\uC774 \uC788\uB2E4)\uC744 \uD568\uAED8 \uC81C\uC2DC\uD558\uB294 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC751\uB2F5\uC774\uB2E4.",
          "\uC624\uB2F5(\uC2DC\uC81C\xB7\uB17C\uB9AC \uC624\uB958). \uC5EC\uC790\uB294 \uC544\uC9C1 \uC2DC\uD5D8\uC744 \uC900\uBE44\uD558\uB294 \uB2E8\uACC4\uC774\uBA70, \uC878\uC5C5 \uC804 \uB4F1\uB85D\uC774\uB77C\uB294 \uC870\uC5B8\uC740 \uC0C1\uD669\uACFC \uB9DE\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC65C\uACE1). \uC544\uC9C1 \uC2DC\uD5D8\uC744 \uBCF4\uC9C0\uB3C4 \uC54A\uC558\uC73C\uBBC0\uB85C '\uACB0\uACFC\uAC00 \uB098\uC654\uB2E4'\uB294 \uC804\uC81C\uAC00 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC5F0\uC0C1 \uD568\uC815). October\uB9CC \uBC1B\uC544 \uB9CC\uB4E0 \uC751\uB2F5\uC73C\uB85C, \uC810\uC218 \uB9CC\uB8CC\uB77C\uB294 \uD654\uC81C\uB294 \uB300\uD654\uC5D0 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["response", "context", "conversation-flow"],
      vocabulary: [
        { word: "start with the basics", meaning: "\uAE30\uCD08\uBD80\uD130 \uC2DC\uC791\uD558\uB2E4" }
      ]
    },
    {
      id: "L-DIA-0002",
      section: "listening",
      part: 1,
      type: "dialogue",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["dialogue", "next-action", "scheduling"],
      question: "What will the man most likely do next?",
      passage: "",
      transcript: "W: Did you get the confirmation email for the workshop?\nM: I got one, but it says Saturday. I signed up for the Friday session.\nW: They probably moved you when Friday filled up.\nM: That doesn't work for me. I'll call the office before it closes and see if there's still a spot.",
      choices: [
        "Contact the workshop office about changing his session",
        "Attend the Saturday session as it was assigned",
        "Ask the woman to forward her confirmation email",
        "Sign up for a completely different workshop"
      ],
      answer: 0,
      explanation: {
        summary: "\uB0A8\uC790\uAC00 \uB9C8\uC9C0\uB9C9 \uBC1C\uD654\uC5D0\uC11C '\uC0AC\uBB34\uC2E4\uC774 \uBB38 \uB2EB\uAE30 \uC804\uC5D0 \uC804\uD654\uD574\uC11C \uC790\uB9AC\uAC00 \uC788\uB294\uC9C0 \uC54C\uC544\uBCF4\uACA0\uB2E4'\uACE0 \uC9C1\uC811 \uB9D0\uD55C\uB2E4. \uB2E4\uC74C \uD589\uB3D9\uC740 \uC0AC\uBB34\uC2E4 \uC5F0\uB77D\uC774\uB2E4.",
        evidence: "I'll call the office before it closes and see if there's still a spot\uC774 \uACB0\uC815\uC801 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. call the office ... see if there's still a spot\uC744 \uADF8\uB300\uB85C \uBC14\uAFD4 \uD45C\uD604\uD55C \uAC83\uC774\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). That doesn't work for me\uB77C\uACE0 \uD588\uC73C\uBBC0\uB85C \uD1A0\uC694\uC77C \uC218\uC5C5\uC744 \uADF8\uB300\uB85C \uB4E3\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uC5EC\uC790\uC758 \uC774\uBA54\uC77C\uC744 \uC804\uB2EC\uBC1B\uACA0\uB2E4\uB294 \uC5B8\uAE09\uC740 \uC804\uD600 \uC5C6\uB2E4.",
          "\uC624\uB2F5(\uBE44\uC57D). \uB2E4\uB978 \uC6CC\uD06C\uC20D\uC73C\uB85C \uAC08\uC544\uD0C4\uB2E4\uB294 \uB9D0\uC740 \uC5C6\uACE0, \uAC19\uC740 \uC6CC\uD06C\uC20D\uC758 \uC694\uC77C \uBCC0\uACBD\uC744 \uC2DC\uB3C4\uD55C\uB2E4."
        ]
      },
      skills: ["dialogue", "next-action", "detail"],
      vocabulary: [
        { word: "confirmation email", meaning: "\uD655\uC815 \uC548\uB0B4 \uBA54\uC77C" },
        { word: "fill up", meaning: "(\uC790\uB9AC\uAC00) \uB2E4 \uCC28\uB2E4" }
      ]
    },
    {
      id: "L-DET-0003",
      section: "listening",
      part: 1,
      type: "detail",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["detail", "announcement", "transportation"],
      question: "According to the announcement, which of the following is correct?",
      passage: "",
      transcript: "M: Attention passengers on the 6:40 express to Daejeon. Because of track maintenance near Cheonan, this train will depart from Platform 4 rather than Platform 2, and arrival in Daejeon is now expected at 8:15, about twenty minutes later than scheduled. Passengers holding seats in cars nine and ten should note that these two cars have been removed from today's service; the ticket counter on the first floor will reassign your seats at no charge. Refreshment service will not be available on this run.",
      choices: [
        "Passengers in two of the cars need to have their seats reassigned.",
        "The train will leave from Platform 2 as it normally does.",
        "The delay adds roughly forty minutes to the journey.",
        "Passengers whose seats are reassigned must pay a small fee."
      ],
      answer: 0,
      explanation: {
        summary: "9\uD638\uCC28\uC640 10\uD638\uCC28\uAC00 \uC624\uB298 \uC6B4\uD589\uC5D0\uC11C \uC81C\uC678\uB418\uC5B4 \uD574\uB2F9 \uC2B9\uAC1D\uC740 \uC88C\uC11D\uC744 \uC7AC\uBC30\uC815\uBC1B\uC544\uC57C \uD55C\uB2E4\uB294 \uAC83\uC774 \uBC29\uC1A1\uC758 \uD575\uC2EC \uC138\uBD80 \uC815\uBCF4\uB2E4.",
        evidence: "cars nine and ten ... have been removed from today's service; the ticket counter ... will reassign your seats at no charge\uAC00 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uB450 \uAC1C \uD638\uCC28(9, 10\uD638\uCC28) \uC2B9\uAC1D\uC758 \uC88C\uC11D \uC7AC\uBC30\uC815\uC774 \uBA85\uC2DC\uB418\uC5B4 \uC788\uB2E4.",
          "\uC624\uB2F5(\uC22B\uC790 \uD568\uC815). Platform 4 rather than Platform 2\uB77C\uACE0 \uD588\uC73C\uBBC0\uB85C \uC2B9\uAC15\uC7A5\uC774 \uBCC0\uACBD\uB418\uC5C8\uB2E4.",
          "\uC624\uB2F5(\uC22B\uC790 \uD568\uC815). \uC9C0\uC5F0\uC740 about twenty minutes\uC774\uBA70 40\uBD84\uC740 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uB2E4.",
          "\uC624\uB2F5(\uBA85\uC2DC\uC801 \uBD80\uC815). at no charge\uB77C\uACE0 \uD588\uC73C\uBBC0\uB85C \uBE44\uC6A9\uC740 \uBC1C\uC0DD\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["detail", "listening-for-numbers", "fact-check"],
      vocabulary: [
        { word: "reassign", meaning: "\uC7AC\uBC30\uC815\uD558\uB2E4" },
        { word: "at no charge", meaning: "\uBB34\uB8CC\uB85C" }
      ]
    },
    {
      id: "L-INF-0004",
      section: "listening",
      part: 1,
      type: "inference",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["inference", "dialogue", "implication"],
      question: "What can be inferred about the man?",
      passage: "",
      transcript: "W: How was the apartment you looked at yesterday?\nM: The rooms were bigger than I expected, and the rent is fair for that area.\nW: So you're taking it?\nM: The commute would be ninety minutes each way.\nW: Ah.",
      choices: [
        "He is reluctant to take the apartment despite its advantages.",
        "He has already signed the lease for the apartment.",
        "He thinks the rent is too high for that neighborhood.",
        "He intends to move closer to his office next year."
      ],
      answer: 0,
      explanation: {
        summary: "'\uACC4\uC57D\uD560 \uAC70\uB0D0'\uB294 \uC9C8\uBB38\uC5D0 \uB0A8\uC790\uB294 \uC608/\uC544\uB2C8\uC624 \uB300\uC2E0 \uD3B8\uB3C4 90\uBD84 \uD1B5\uADFC\uC744 \uC5B8\uAE09\uD55C\uB2E4. \uC9C1\uC811 \uAC70\uC808\uD558\uC9C0 \uC54A\uC73C\uBA74\uC11C \uB9DD\uC124\uC784\uC744 \uB4DC\uB7EC\uB0B4\uB294 \uC804\uD615\uC801 \uD654\uBC95\uC774\uB2E4.",
        evidence: "So you're taking it?\uC5D0 \uB300\uD55C \uB300\uB2F5\uC774 The commute would be ninety minutes each way\uB77C\uB294 \uC810, \uADF8\uB9AC\uACE0 \uC5EC\uC790\uC758 Ah\uB77C\uB294 \uBC18\uC751\uC774 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uC7A5\uC810(\uB113\uC740 \uBC29, \uC801\uC815 \uC784\uB300\uB8CC)\uC744 \uC778\uC815\uD558\uBA74\uC11C\uB3C4 \uD1B5\uADFC \uC2DC\uAC04\uC744 \uBB38\uC81C\uB85C \uAEBC\uB0B4 \uB9DD\uC124\uC784\uC744 \uB098\uD0C0\uB0B8\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uACC4\uC57D\uC744 \uC774\uBBF8 \uD588\uB2E4\uBA74 So you're taking it?\uC774\uB77C\uB294 \uC9C8\uBB38 \uC790\uCCB4\uAC00 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). the rent is fair for that area\uB77C\uACE0 \uC9C1\uC811 \uB9D0\uD588\uC73C\uBBC0\uB85C \uBE44\uC2F8\uB2E4\uACE0 \uC5EC\uAE30\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uACFC\uB3C4\uD55C \uCD94\uB860). \uB0B4\uB144 \uC774\uC0AC \uACC4\uD68D\uC740 \uB300\uD654\uC5D0 \uC804\uD600 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["inference", "implication", "dialogue"],
      vocabulary: [
        { word: "commute", meaning: "\uD1B5\uADFC, \uD1B5\uADFC\uD558\uB2E4" },
        { word: "each way", meaning: "\uD3B8\uB3C4\uB85C" }
      ]
    },
    {
      id: "L-RSP-0005",
      section: "listening",
      part: 1,
      type: "response",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["response", "workplace", "apology"],
      question: "Choose the most appropriate response to complete the conversation.",
      passage: "",
      transcript: "M: I'm sorry to bring this up again, but the report was supposed to be on my desk Monday.\nW: ___",
      choices: [
        "I know. I should have told you earlier that the data came in late.",
        "Then I'll put it on your desk as soon as it's finished on Monday.",
        "You're welcome. Just let me know if you need anything else.",
        "Actually, I never received your report from Monday."
      ],
      answer: 0,
      explanation: {
        summary: "\uC9C0\uC5F0\uC5D0 \uB300\uD55C \uC815\uC911\uD55C \uD56D\uC758\uC774\uBBC0\uB85C, \uC0AC\uC2E4\uC744 \uC778\uC815\uD558\uACE0 \uB2A6\uC5B4\uC9C4 \uC774\uC720\uB97C \uC124\uBA85\uD558\uB294 \uC751\uB2F5\uC774 \uC790\uC5F0\uC2A4\uB7FD\uB2E4.",
        evidence: "the report was supposed to be on my desk Monday\uB77C\uB294 \uACFC\uAC70 \uC2DC\uC810\uC758 \uBBF8\uC774\uD589 \uC9C0\uC801\uC5D0 \uB300\uD574, \uC778\uC815 + \uC0AC\uC720 \uC124\uBA85\uC774 \uC774\uC5B4\uC838\uC57C \uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. I know\uB85C \uC0AC\uC2E4\uC744 \uC778\uC815\uD558\uACE0 should have told you\uB85C \uB2A6\uC740 \uC0AC\uC720\uB97C \uC124\uBA85\uD558\uB294 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC0AC\uACFC \uBC18\uC751\uC774\uB2E4.",
          "\uC624\uB2F5(\uC2DC\uC81C \uD568\uC815). Monday\uB294 \uC774\uBBF8 \uC9C0\uB09C \uAE30\uD55C\uC778\uB370 \uBBF8\uB798 \uC2DC\uC810\uCC98\uB7FC \uB2E4\uB8E8\uC5B4 \uB17C\uB9AC\uAC00 \uC5B4\uAE0B\uB09C\uB2E4.",
          "\uC624\uB2F5(\uAE30\uB2A5 \uBD88\uC77C\uCE58). \uD56D\uC758\uC5D0 \uB300\uD574 You're welcome\uC73C\uB85C \uB2F5\uD558\uB294 \uAC83\uC740 \uB300\uD654 \uAE30\uB2A5\uC0C1 \uC131\uB9BD\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC5ED\uD560 \uB4A4\uBC14\uAFC8). \uBCF4\uACE0\uC11C\uB97C \uC81C\uCD9C\uD574\uC57C \uD558\uB294 \uCABD\uC740 \uC5EC\uC790\uC774\uBBC0\uB85C \uB0A8\uC790\uC5D0\uAC8C \uBABB \uBC1B\uC558\uB2E4\uACE0 \uD558\uB294 \uAC83\uC740 \uC55E\uB4A4\uAC00 \uB9DE\uC9C0 \uC54A\uB294\uB2E4."
        ]
      },
      skills: ["response", "conversation-flow", "register"],
      vocabulary: [
        { word: "bring something up", meaning: "(\uD654\uC81C\uB97C) \uAEBC\uB0B4\uB2E4, \uC5B8\uAE09\uD558\uB2E4" },
        { word: "come in late", meaning: "\uB2A6\uAC8C \uB4E4\uC5B4\uC624\uB2E4, \uB2A6\uAC8C \uB3C4\uCC29\uD558\uB2E4" }
      ]
    },
    {
      id: "L-DIA-0006",
      section: "listening",
      part: 1,
      type: "dialogue",
      difficulty: 3,
      targetScoreBand: "320-350",
      tags: ["dialogue", "main-point", "reasoning"],
      question: "What is the woman's main point?",
      passage: "",
      transcript: "M: Enrollment in the evening classes has dropped for the third term in a row.\nW: I'd be careful about reading too much into that. We moved the start time to 7:30 last year, and the campus shuttle stops running at seven.\nM: So you think it's access, not interest?\nW: I think we can't tell those two apart until we ask the people who dropped out.",
      choices: [
        "The cause of the decline cannot be determined without more information.",
        "The class start time should be moved back to its original hour.",
        "Interest in the evening classes has clearly fallen among students.",
        "The campus shuttle should run later into the evening."
      ],
      answer: 0,
      explanation: {
        summary: "\uC5EC\uC790\uB294 \uB4F1\uB85D\uC790 \uAC10\uC18C\uC758 \uC6D0\uC778\uC744 \uB2E8\uC815\uD558\uC9C0 \uB9D0\uB77C\uACE0 \uD558\uBA70, \uC811\uADFC\uC131\uACFC \uAD00\uC2EC\uB3C4\uB97C \uAD6C\uBD84\uD558\uB824\uBA74 \uC911\uB3C4 \uC774\uD0C8\uC790\uC5D0\uAC8C \uBB3C\uC5B4\uBD10\uC57C \uD55C\uB2E4\uACE0 \uB9D0\uD55C\uB2E4. \uC989 '\uC815\uBCF4 \uBD80\uC871'\uC774 \uC694\uC9C0\uB2E4.",
        evidence: "I'd be careful about reading too much into that\uACFC we can't tell those two apart until we ask the people who dropped out\uC774 \uD575\uC2EC\uC774\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uC6D0\uC778 \uD310\uB2E8\uC744 \uC720\uBCF4\uD558\uACE0 \uCD94\uAC00 \uC870\uC0AC\uB97C \uC804\uC81C\uB85C \uC0BC\uB294 \uC5EC\uC790\uC758 \uD0DC\uB3C4\uB97C \uC815\uD655\uD788 \uC694\uC57D\uD55C\uB2E4.",
          "\uC624\uB2F5(\uBE44\uC57D). \uC2DC\uC791 \uC2DC\uAC04\uC740 \uC6D0\uC778 \uAC00\uB2A5\uC131\uC73C\uB85C \uC5B8\uAE09\uB418\uC5C8\uC744 \uBFD0, \uB418\uB3CC\uB9AC\uC790\uB294 \uC81C\uC548\uC740 \uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). \uC5EC\uC790\uB294 \uAD00\uC2EC\uB3C4 \uD558\uB77D\uC774\uB77C\uB294 \uD574\uC11D \uC790\uCCB4\uB97C \uACBD\uACC4\uD558\uACE0 \uC788\uB2E4.",
          "\uC624\uB2F5(\uBE44\uC57D). \uC154\uD2C0 \uC6B4\uD589 \uC2DC\uAC04\uB3C4 \uAC00\uB2A5\uD55C \uC694\uC778\uC73C\uB85C \uB4E0 \uAC83\uC774\uC9C0 \uC815\uCC45 \uC81C\uC548\uC740 \uC544\uB2C8\uB2E4."
        ]
      },
      skills: ["dialogue", "main-idea", "inference"],
      vocabulary: [
        { word: "read too much into", meaning: "~\uC744 \uACFC\uB300 \uD574\uC11D\uD558\uB2E4" },
        { word: "in a row", meaning: "\uC5F0\uC18D\uC73C\uB85C" },
        { word: "drop out", meaning: "\uC911\uB3C4\uC5D0 \uADF8\uB9CC\uB450\uB2E4" }
      ]
    },
    {
      id: "L-DET-0007",
      section: "listening",
      part: 1,
      type: "detail",
      difficulty: 4,
      targetScoreBand: "320-350",
      tags: ["detail", "monologue", "academic"],
      question: "According to the speaker, which of the following is correct?",
      passage: "",
      transcript: "W: One last note before we finish. For the final project you may work alone or in pairs, but pairs must submit a one-page statement describing who did what. That statement isn't graded; it simply has to exist. The project itself is due on the last Friday of the term, and I don't grant extensions for it, since grades go to the registrar three days later. If you're worried about time, you may send me a draft two weeks early and I'll give you comments, though not a provisional grade.",
      choices: [
        "Students can get feedback on an early draft but no grade for it.",
        "The statement about the division of labor counts toward the project grade.",
        "Extensions are granted as long as they are requested before the deadline.",
        "All students are required to complete the final project in pairs."
      ],
      answer: 0,
      explanation: {
        summary: "2\uC8FC \uC804 \uCD08\uC548 \uC81C\uCD9C \uC2DC \uCF54\uBA58\uD2B8\uB294 \uBC1B\uC9C0\uB9CC \uC7A0\uC815 \uC810\uC218\uB294 \uC8FC\uC9C0 \uC54A\uB294\uB2E4\uB294 \uC870\uAC74\uC774 \uADF8\uB300\uB85C \uC9C4\uC220\uB41C\uB2E4.",
        evidence: "you may send me a draft two weeks early and I'll give you comments, though not a provisional grade\uAC00 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. comments\uB294 \uC81C\uACF5\uB418\uC9C0\uB9CC provisional grade\uB294 \uC81C\uACF5\uB418\uC9C0 \uC54A\uB294\uB2E4\uB294 \uC870\uAC74\uC744 \uC815\uD655\uD788 \uC62E\uACBC\uB2E4.",
          "\uC624\uB2F5(\uBA85\uC2DC\uC801 \uBD80\uC815). That statement isn't graded\uB77C\uACE0 \uBD84\uBA85\uD788 \uB9D0\uD588\uB2E4.",
          "\uC624\uB2F5(\uBA85\uC2DC\uC801 \uBD80\uC815). I don't grant extensions for it\uC774\uB77C\uACE0 \uD588\uC73C\uBA70, \uC0AC\uC804 \uC694\uCCAD \uC608\uC678\uB3C4 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uB2E4.",
          "\uC624\uB2F5(\uC870\uAC74 \uC65C\uACE1). you may work alone or in pairs\uC774\uBBC0\uB85C \uC9DD \uD65C\uB3D9\uC740 \uC758\uBB34\uAC00 \uC544\uB2C8\uB77C \uC120\uD0DD\uC774\uB2E4."
        ]
      },
      skills: ["detail", "listening-for-conditions", "fact-check"],
      vocabulary: [
        { word: "grant an extension", meaning: "\uAE30\uD55C \uC5F0\uC7A5\uC744 \uD5C8\uC6A9\uD558\uB2E4" },
        { word: "provisional", meaning: "\uC7A0\uC815\uC801\uC778, \uC784\uC2DC\uC758" },
        { word: "registrar", meaning: "\uD559\uC801 \uB2F4\uB2F9 \uBD80\uC11C, \uAD50\uBB34\uCC98" }
      ]
    },
    {
      id: "L-INF-0008",
      section: "listening",
      part: 1,
      type: "inference",
      difficulty: 4,
      targetScoreBand: "327-target",
      tags: ["inference", "indirect-refusal", "workplace"],
      question: "What can be inferred about the woman?",
      passage: "",
      transcript: "M: You've been with the company eleven years now. Have you ever thought about the opening in the Singapore office?\nW: My daughter starts high school in March.\nM: They'd cover the relocation costs, apparently.\nW: That's generous of them.",
      choices: [
        "She is turning down the idea without saying so directly.",
        "She is seriously considering the post now that relocation is covered.",
        "She is dissatisfied with her current position at the company.",
        "She considers the relocation package insufficient."
      ],
      answer: 0,
      explanation: {
        summary: "\uC5EC\uC790\uB294 \uC81C\uC548\uC5D0 \uB300\uD574 \uB538\uC758 \uC9C4\uD559\uC774\uB77C\uB294 \uAC1C\uC778 \uC0AC\uC815\uC744 \uBA3C\uC800 \uAEBC\uB0B4\uACE0, \uC774\uC0AC \uBE44\uC6A9 \uC9C0\uC6D0\uC5D0\uB3C4 That's generous of them\uC774\uB77C\uB294 \uAC70\uB9AC \uB450\uB294 \uB17C\uD3C9\uB9CC \uD55C\uB2E4. \uC9C1\uC811 \uB9D0\uD558\uC9C0 \uC54A\uB294 \uC644\uACE1\uD55C \uAC70\uC808\uC774\uB2E4.",
        evidence: "\uC9C8\uBB38\uC5D0 \uB300\uD55C \uB300\uB2F5\uC774 My daughter starts high school in March\uB77C\uB294 \uC810, \uADF8\uB9AC\uACE0 \uC81C\uC548\uC5D0 \uB300\uD574 \uAD00\uC2EC \uD45C\uD604 \uC5C6\uC774 That's generous of them\uC73C\uB85C \uB9C8\uBB34\uB9AC\uD558\uB294 \uC810\uC774 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uAC1C\uC778 \uC0AC\uC815 \uC81C\uC2DC + \uC81C3\uC790 \uC2DC\uC810\uC758 \uB17C\uD3C9\uC740 \uC601\uC5B4 \uB300\uD654\uC5D0\uC11C \uC804\uD615\uC801\uC778 \uAC04\uC811 \uAC70\uC808 \uC2E0\uD638\uB2E4.",
          "\uC624\uB2F5(\uC815\uBC18\uB300). \uC9C4\uC9C0\uD558\uAC8C \uACE0\uB824\uD55C\uB2E4\uBA74 \uC870\uAC74\uC774\uB098 \uC77C\uC815\uC5D0 \uB300\uD55C \uD6C4\uC18D \uC9C8\uBB38\uC774 \uB530\uB77C\uC624\uB294 \uAC83\uC774 \uC790\uC5F0\uC2A4\uB7FD\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uD604\uC7AC \uC9C1\uBB34\uC5D0 \uB300\uD55C \uBD88\uB9CC\uC740 \uC804\uD600 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uB2E4.",
          "\uC624\uB2F5(\uC5B4\uD718 \uC624\uB3C5). generous\uB294 '\uD6C4\uD558\uB2E4'\uB294 \uAE0D\uC815 \uD3C9\uAC00\uC774\uBBC0\uB85C \uC9C0\uC6D0\uC774 \uBD80\uC871\uD558\uB2E4\uB294 \uD574\uC11D\uC740 \uBC18\uB300\uB2E4."
        ]
      },
      skills: ["inference", "implication", "pragmatics"],
      vocabulary: [
        { word: "opening", meaning: "(\uC77C\uC790\uB9AC\uC758) \uACF5\uC11D, \uC790\uB9AC" },
        { word: "cover relocation costs", meaning: "\uC774\uC8FC \uBE44\uC6A9\uC744 \uBD80\uB2F4\uD558\uB2E4" }
      ]
    },
    {
      id: "L-DIA-0009",
      section: "listening",
      part: 1,
      type: "dialogue",
      difficulty: 2,
      targetScoreBand: "250-320",
      tags: ["dialogue", "topic", "language-learning"],
      question: "What are the speakers mainly talking about?",
      passage: "",
      transcript: "W: Your English sounds different from last year.\nM: I stopped trying to translate in my head. I just repeat whole phrases now.\nW: Does that actually work?\nM: For speaking, yes. My grammar explanations are worse, but I hesitate a lot less.",
      choices: [
        "A change in the way the man practices English",
        "The man's plan to sign up for a grammar course",
        "The reason the man's test scores have fallen",
        "The difficulty of translating technical terms"
      ],
      answer: 0,
      explanation: {
        summary: "\uBA38\uB9BF\uC18D \uBC88\uC5ED\uC744 \uADF8\uB9CC\uB450\uACE0 \uD1B5\uBB38\uC7A5 \uBC18\uBCF5\uC73C\uB85C \uD559\uC2B5\uBC95\uC744 \uBC14\uAFE8\uACE0 \uADF8 \uACB0\uACFC\uB97C \uC774\uC57C\uAE30\uD558\uB294 \uB300\uD654\uB2E4. \uC8FC\uC81C\uB294 \uD559\uC2B5 \uBC29\uC2DD\uC758 \uBCC0\uD654\uB2E4.",
        evidence: "I stopped trying to translate in my head. I just repeat whole phrases now\uC640 I hesitate a lot less\uAC00 \uD654\uC81C\uB97C \uADDC\uC815\uD55C\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uD559\uC2B5 \uBC29\uBC95\uC758 \uBCC0\uD654\uC640 \uADF8 \uD6A8\uACFC(\uB9D0\uD560 \uB54C \uB35C \uBA38\uBB47\uAC70\uB9BC)\uAC00 \uB300\uD654 \uC804\uCCB4\uB97C \uAD00\uD1B5\uD55C\uB2E4.",
          "\uC624\uB2F5(\uC5F0\uC0C1 \uD568\uC815). grammar\uAC00 \uC5B8\uAE09\uB418\uC9C0\uB9CC \uC218\uC5C5 \uB4F1\uB85D \uACC4\uD68D\uC740 \uB098\uC624\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uC2DC\uD5D8 \uC810\uC218 \uC774\uC57C\uAE30\uB294 \uC804\uD600 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uB294\uB2E4.",
          "\uC624\uB2F5(\uC5F0\uC0C1 \uD568\uC815). translate\uAC00 \uB098\uC624\uC9C0\uB9CC \uC804\uBB38 \uC6A9\uC5B4 \uBC88\uC5ED\uC758 \uC5B4\uB824\uC6C0\uC740 \uC8FC\uC81C\uAC00 \uC544\uB2C8\uB2E4."
        ]
      },
      skills: ["dialogue", "main-idea", "topic-identification"],
      vocabulary: [
        { word: "hesitate", meaning: "\uBA38\uBB47\uAC70\uB9AC\uB2E4, \uC8FC\uC800\uD558\uB2E4" },
        { word: "whole phrase", meaning: "\uB369\uC5B4\uB9AC \uD45C\uD604, \uD1B5\uBB38\uC7A5" }
      ]
    },
    {
      id: "L-DET-0010",
      section: "listening",
      part: 1,
      type: "detail",
      difficulty: 3,
      targetScoreBand: "327-target",
      tags: ["detail", "voicemail", "appointment"],
      question: "According to the message, which of the following is correct?",
      passage: "",
      transcript: "M: Hi, this is Daniel calling from Hansol Dental for Ms. Yoon. You're scheduled with Dr. Lim this Thursday at two, but he's been called into a procedure that afternoon, so we'd like to move your appointment. We can offer Thursday at ten in the morning, or Friday at the same time as your original booking. Whichever you choose, please arrive fifteen minutes early. The insurance form we mailed you has to be signed here in person, so there's no need to bring your copy. Just call us back at this number.",
      choices: [
        "Ms. Yoon should arrive early because a form must be signed in person.",
        "The appointment was canceled because of an unpaid balance.",
        "She is asked to bring the insurance form that was mailed to her.",
        "The Friday option is at ten o'clock in the morning."
      ],
      answer: 0,
      explanation: {
        summary: "\uC77C\uC815 \uBCC0\uACBD \uC548\uB0B4 \uC74C\uC131 \uBA54\uC2DC\uC9C0\uB2E4. \uC5B4\uB5A4 \uC2DC\uAC04\uC744 \uD0DD\uD558\uB4E0 15\uBD84 \uC77C\uCC0D \uC640\uC57C \uD558\uBA70, \uADF8 \uC774\uC720\uB294 \uBCF4\uD5D8 \uC11C\uB958\uB97C \uD604\uC7A5\uC5D0\uC11C \uC11C\uBA85\uD574\uC57C \uD558\uAE30 \uB54C\uBB38\uC774\uB2E4.",
        evidence: "please arrive fifteen minutes early. The insurance form we mailed you has to be signed here in person\uC774 \uADFC\uAC70\uB2E4.",
        choiceAnalysis: [
          "\uC815\uB2F5. \uC870\uAE30 \uB3C4\uCC29 \uC694\uCCAD\uACFC \uADF8 \uC774\uC720(\uD604\uC7A5 \uC11C\uBA85)\uAC00 \uC5F0\uACB0\uB418\uC5B4 \uADF8\uB300\uB85C \uC9C4\uC220\uB41C\uB2E4.",
          "\uC624\uB2F5(\uC815\uBCF4 \uC5C6\uC74C). \uBCC0\uACBD \uC0AC\uC720\uB294 \uC6D0\uC7A5\uC758 \uC2DC\uC220 \uC77C\uC815(called into a procedure)\uC774\uBA70 \uBBF8\uB0A9 \uC694\uAE08\uC740 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC558\uB2E4.",
          "\uC624\uB2F5(\uBA85\uC2DC\uC801 \uBD80\uC815). there's no need to bring your copy\uB77C\uACE0 \uBD84\uBA85\uD788 \uB9D0\uD588\uB2E4.",
          "\uC624\uB2F5(\uC2DC\uAC04 \uD568\uC815). 10\uC2DC\uB294 \uBAA9\uC694\uC77C \uB300\uC548\uC774\uACE0, \uAE08\uC694\uC77C\uC740 \uC6D0\uB798 \uC608\uC57D\uACFC \uAC19\uC740 \uC2DC\uAC01\uC778 \uC624\uD6C4 2\uC2DC\uB2E4."
        ]
      },
      skills: ["detail", "listening-for-numbers", "fact-check"],
      vocabulary: [
        { word: "be called into a procedure", meaning: "(\uC758\uB8CC) \uC2DC\uC220\uC5D0 \uD22C\uC785\uB418\uB2E4" },
        { word: "in person", meaning: "\uC9C1\uC811, \uBCF8\uC778\uC774 \uC640\uC11C" },
        { word: "original booking", meaning: "\uC6D0\uB798 \uC608\uC57D" }
      ]
    }
  ];

  // data/packs/TEPSCrew_Pack_kim_reading_0001.json
  var TEPSCrew_Pack_kim_reading_0001_default = {
    name: "TEPSCrew_Pack_kim_reading_0001",
    author: "kim",
    section: "reading",
    version: 1,
    questionCount: 12,
    createdAt: "2026-08-12",
    notes: "\uD559\uC2B5\uC6A9 \uC790\uCCB4 \uC81C\uC791 \xB7 \uACF5\uC2DD TEPS \uAE30\uCD9C \uC544\uB2D8",
    questions: [
      {
        id: "R-BLK-kim-0001",
        section: "reading",
        part: 1,
        type: "blank",
        difficulty: 2,
        targetScoreBand: "250-320",
        tags: [
          "blank",
          "business",
          "workplace"
        ],
        question: "Which of the following best completes the blank?",
        passage: "To maintain productivity during the office renovation, management has decided to implement a temporary work-from-home policy. Employees are expected to fulfill their usual duties remotely and stay reachable during regular office hours. Although this arrangement requires adjustments, leadership expects team members to _______________ throughout this transition period.",
        transcript: "",
        choices: [
          "maintain high standards of performance",
          "cancel all upcoming project deadlines",
          "relocate to a different regional office",
          "submit daily physical attendance logs"
        ],
        answer: 0,
        explanation: {
          summary: "\uC0AC\uBB34\uC2E4 \uB9AC\uBAA8\uB378\uB9C1 \uAE30\uAC04 \uB3D9\uC548 \uC7AC\uD0DD\uADFC\uBB34\uB97C \uC2DC\uD589\uD558\uC9C0\uB9CC \uC5C5\uBB34 \uC131\uACFC \uC218\uC900\uC744 \uC720\uC9C0\uD574\uC8FC\uAE38 \uAE30\uB300\uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "fulfill their usual duties remotely and stay reachable... leadership expects team members to maintain high standards of performance",
          choiceAnalysis: [
            "(A) \uC815\uB2F5: \uD3C9\uC18C\uC640 \uB3D9\uC77C\uD55C \uC5C5\uBB34 \uC218\uD589 \uBC0F \uC5F0\uB77D \uAC00\uB2A5 \uC0C1\uD0DC \uC720\uC9C0\uB97C \uC694\uCCAD\uD558\uBBC0\uB85C '\uB192\uC740 \uC131\uACFC \uAE30\uC900\uC744 \uC720\uC9C0\uD558\uB2E4'\uAC00 \uBE48\uCE78\uC5D0 \uAC00\uC7A5 \uC801\uC808\uD568.",
            "(B) \uC624\uB2F5: \uB9C8\uAC10 \uAE30\uD55C\uC744 \uCDE8\uC18C\uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC740 \uC9C0\uBB38\uC758 \uCDE8\uC9C0\uC640 \uBC18\uB300\uB428.",
            "(C) \uC624\uB2F5: \uB2E4\uB978 \uC9C0\uC5ED \uC0AC\uBB34\uC2E4\uB85C \uC774\uC804\uD55C\uB2E4\uB294 \uC5B8\uAE09\uC740 \uC5C6\uC74C.",
            "(D) \uC624\uB2F5: \uC7AC\uD0DD\uADFC\uBB34 \uC0C1\uD669\uC774\uBBC0\uB85C \uB9E4\uC77C \uCD9C\uC11D \uC77C\uC9C0\uB97C \uC81C\uCD9C\uD55C\uB2E4\uB294 \uAC83\uC740 \uB9E5\uB77D\uC5D0 \uB9DE\uC9C0 \uC54A\uC74C."
          ]
        },
        skills: [
          "contextual-inference",
          "reading-comprehension"
        ],
        vocabulary: [
          {
            word: "renovation",
            meaning: "\uAC1C\uBCF4\uC218, \uB9AC\uBAA8\uB378\uB9C1"
          },
          {
            word: "fulfill",
            meaning: "\uC774\uD589\uD558\uB2E4, \uC644\uC218\uD558\uB2E4"
          },
          {
            word: "transition",
            meaning: "\uC804\uD658, \uC774\uD589"
          }
        ]
      },
      {
        id: "R-BLK-kim-0002",
        section: "reading",
        part: 1,
        type: "blank",
        difficulty: 2,
        targetScoreBand: "250-320",
        tags: [
          "blank",
          "environment",
          "technology"
        ],
        question: "Which of the following best completes the blank?",
        passage: "Urban rooftop gardens have gained popularity as effective tools for combatting the heat island effect in major cities. By covering concrete surfaces with vegetation, these gardens absorb solar radiation and lower surrounding temperatures through evapotranspiration. Consequently, city planners view them not merely as aesthetic additions, but as _______________ for sustainable urban development.",
        transcript: "",
        choices: [
          "costly burdens",
          "vital strategies",
          "temporary trends",
          "minor distractions"
        ],
        answer: 1,
        explanation: {
          summary: "\uC625\uC0C1 \uC815\uC6D0\uC774 \uB3C4\uC2EC \uC5F4\uC12C \uD604\uC0C1\uC744 \uC644\uD654\uD558\uB294 \uD6A8\uACFC\uC801\uC778 \uB3C4\uAD6C\uC774\uBA70 \uB2E8\uC21C \uBBF8\uAD00\uC6A9\uC774 \uC544\uB2CC \uC9C0\uC18D \uAC00\uB2A5\uD55C \uB3C4\uC2DC \uAC1C\uBC1C\uC744 \uC704\uD55C \uD575\uC2EC \uC804\uB7B5\uC774\uB77C\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "not merely as aesthetic additions, but as vital strategies for sustainable urban development",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uBE44\uC6A9 \uBD80\uB2F4\uC774\uB77C\uB294 \uBD80\uC815\uC801\uC778 \uD45C\uD604\uC740 \uC625\uC0C1 \uC815\uC6D0\uC758 \uAE0D\uC815\uC801 \uC5ED\uD560\uC744 \uC124\uBA85\uD558\uB294 \uD750\uB984\uACFC \uC5B4\uAE0B\uB0A8.",
            "(B) \uC815\uB2F5: \uB2E8\uC21C \uBBF8\uAD00\uC6A9\uC774 \uC544\uB2CC \uB3C4\uC2DC \uC5F4\uC12C \uC644\uD654\uB97C \uC704\uD55C '\uD544\uC218\uC801 \uC804\uB7B5'\uC73C\uB85C \uBCF8\uB2E4\uB294 \uD750\uB984\uC774 \uC801\uC808\uD568.",
            "(C) \uC624\uB2F5: \uC77C\uC2DC\uC801 \uC720\uD589\uC73C\uB85C \uCE58\uBD80\uD558\uB294 \uAC83\uC740 \uAE0D\uC815\uC801 \uD6A8\uACFC \uAC15\uC870\uC640 \uB9DE\uC9C0 \uC54A\uC74C.",
            "(D) \uC624\uB2F5: \uC0AC\uC18C\uD55C \uC8FC\uC758 \uC0B0\uB9CC \uC694\uC18C\uB77C\uB294 \uD45C\uD604\uC740 \uBB38\uB9E5\uC0C1 \uBD80\uC801\uC808\uD568."
          ]
        },
        skills: [
          "vocabulary-in-context",
          "logical-completion"
        ],
        vocabulary: [
          {
            word: "vegetation",
            meaning: "\uC2DD\uC0DD, \uCD08\uBAA9"
          },
          {
            word: "evapotranspiration",
            meaning: "\uC99D\uBC1C\uC0B0(\uC791\uC6A9)"
          },
          {
            word: "aesthetic",
            meaning: "\uBBF8\uC801\uC778"
          }
        ]
      },
      {
        id: "R-MAI-kim-0003",
        section: "reading",
        part: 2,
        type: "main-idea",
        difficulty: 2,
        targetScoreBand: "250-320",
        tags: [
          "main-idea",
          "health",
          "psychology"
        ],
        question: "Which of the following best summarizes the main idea of the passage?",
        passage: "Recent studies suggest that taking short, frequent breaks during long periods of cognitive effort significantly improves overall focus and mental stamina. Unlike extended breaks taken late in the workday, micro-breaks lasting just two to three minutes help reset cognitive load before exhaustion sets in. Incorporating brief pauses into routine workflows allows individuals to sustain high levels of accuracy and creative problem-solving over prolonged periods.",
        transcript: "",
        choices: [
          "Longer breaks at the end of the day are essential for total recovery.",
          "Short and regular pauses boost cognitive focus and continuous performance.",
          "Continuous work without interruption builds mental resilience over time.",
          "Creative problem-solving depends entirely on physical fitness levels."
        ],
        answer: 1,
        explanation: {
          summary: "\uC9E7\uACE0 \uC8FC\uAE30\uC801\uC778 \uD734\uC2DD\uC774 \uB1CC\uC758 \uACFC\uBD80\uD558\uB97C \uB9C9\uACE0 \uC9D1\uC911\uB825 \uBC0F \uC9C0\uC18D\uC801\uC778 \uC5C5\uBB34 \uC131\uACFC\uB97C \uD5A5\uC0C1\uC2DC\uD0A8\uB2E4\uB294 \uAE00\uC774\uB2E4.",
          evidence: "taking short, frequent breaks... improves overall focus... sustain high levels of accuracy",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uD1F4\uADFC \uBB34\uB835\uC758 \uAE34 \uD734\uC2DD\uBCF4\uB2E4 \uC9E7\uC740 \uD734\uC2DD\uC774 \uD6A8\uACFC\uC801\uC774\uB77C\uB294 \uC9C0\uBB38 \uB0B4\uC6A9\uACFC \uBC30\uCE58\uB428.",
            "(B) \uC815\uB2F5: \uC9E7\uACE0 \uC815\uAE30\uC801\uC778 \uD734\uC2DD\uC774 \uC778\uC9C0\uC801 \uC9D1\uC911\uACFC \uC9C0\uC18D\uC801\uC778 \uC131\uACFC\uB97C \uD5A5\uC0C1\uC2DC\uD0A8\uB2E4\uB294 \uBCF8\uBB38 \uC694\uC9C0\uC640 \uC77C\uCE58\uD568.",
            "(C) \uC624\uB2F5: \uC26C\uC9C0 \uC54A\uACE0 \uC77C\uD558\uB294 \uAC83\uC774 \uC815\uC2E0\uC801 \uD0C4\uB825\uC131\uC744 \uD0A4\uC6B4\uB2E4\uB294 \uC5B8\uAE09\uC740 \uC5C6\uC74C.",
            "(D) \uC624\uB2F5: \uC2E0\uCCB4\uC801 \uCCB4\uB825 \uC218\uC900\uB9CC\uC774 \uCC3D\uC758\uC801 \uBB38\uC81C \uD574\uACB0\uC744 \uACB0\uC815\uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC740 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC74C."
          ]
        },
        skills: [
          "main-idea-identification",
          "summarization"
        ],
        vocabulary: [
          {
            word: "cognitive",
            meaning: "\uC778\uC9C0\uC801\uC778"
          },
          {
            word: "stamina",
            meaning: "\uCCB4\uB825, \uC6D0\uAE30"
          },
          {
            word: "prolonged",
            meaning: "\uC7A5\uAE30\uC801\uC778, \uC7A5\uC2DC\uAC04\uC758"
          }
        ]
      },
      {
        id: "R-DET-kim-0004",
        section: "reading",
        part: 2,
        type: "detail",
        difficulty: 2,
        targetScoreBand: "250-320",
        tags: [
          "detail",
          "science",
          "astronomy"
        ],
        question: "According to the passage, which of the following is TRUE about James Webb Space Telescope?",
        passage: "Launched in December 2021, the James Webb Space Telescope (JWST) operates primarily in the infrared spectrum, allowing it to peer through dense cosmic dust clouds. Unlike the Hubble Space Telescope, which orbits Earth, JWST orbits the Sun at the second Lagrange point (L2), roughly 1.5 million kilometers away. This distant position provides a stable cryogenic environment necessary for its extremely sensitive infrared instruments to detect light from the universe's earliest galaxies.",
        transcript: "",
        choices: [
          "It orbits the Earth at a closer distance than the Hubble Space Telescope.",
          "It primary observes space using visible spectrum radiation.",
          "It is positioned at the second Lagrange point to maintain a stable low temperature.",
          "It was designed mainly to monitor weather patterns in Earth's atmosphere."
        ],
        answer: 2,
        explanation: {
          summary: "\uC81C\uC784\uC2A4 \uC6F9 \uC6B0\uC8FC\uB9DD\uC6D0\uACBD\uC758 \uC8FC\uC694 \uD2B9\uC131\uACFC \uADA4\uB3C4 \uC704\uCE58(L2)\uC5D0 \uB300\uD55C \uC138\uBD80 \uC815\uBCF4\uB97C \uC124\uBA85\uD558\uB294 \uAE00\uC774\uB2E4.",
          evidence: "orbits the Sun at the second Lagrange point (L2)... provides a stable cryogenic environment",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uC9C0\uAD6C \uADA4\uB3C4\uB97C \uB3C4\uB294 \uD5C8\uBE14\uACFC \uB2EC\uB9AC \uD0DC\uC591 \uADA4\uB3C4\uC758 L2 \uC9C0\uC810\uC5D0 \uC704\uCE58\uD558\uBBC0\uB85C \uC9C0\uAD6C\uC5D0 \uB354 \uAC00\uAE5D\uC9C0 \uC54A\uC74C.",
            "(B) \uC624\uB2F5: \uAC00\uC2DC\uAD11\uC120\uC774 \uC544\uB2CC \uC801\uC678\uC120 \uC601\uC5ED(infrared spectrum)\uC5D0\uC11C \uC8FC\uB85C \uC791\uB3D9\uD568.",
            "(C) \uC815\uB2F5: \uC548\uC815\uC801\uC778 \uC800\uC628(cryogenic) \uD658\uACBD\uC744 \uC720\uC9C0\uD558\uAE30 \uC704\uD574 L2 \uC9C0\uC810\uC5D0 \uC704\uCE58\uD55C\uB2E4\uB294 \uC9C0\uBB38\uC758 \uC0AC\uC2E4\uACFC \uC77C\uCE58\uD568.",
            "(D) \uC624\uB2F5: \uC9C0\uAD6C \uB300\uAE30 \uAE30\uC0C1 \uAD00\uCE21\uC6A9\uC774 \uC544\uB2C8\uB77C \uCD08\uAE30 \uC740\uD558\uC758 \uBE5B\uC744 \uAC10\uC9C0\uD558\uAE30 \uC704\uD55C \uBAA9\uC801\uC784."
          ]
        },
        skills: [
          "fact-checking",
          "detail-comprehension"
        ],
        vocabulary: [
          {
            word: "infrared",
            meaning: "\uC801\uC678\uC120\uC758"
          },
          {
            word: "orbit",
            meaning: "\uADA4\uB3C4\uB97C \uB3CC\uB2E4"
          },
          {
            word: "cryogenic",
            meaning: "\uADF9\uC800\uC628\uC758"
          }
        ]
      },
      {
        id: "R-DET-kim-0005",
        section: "reading",
        part: 2,
        type: "detail",
        difficulty: 2,
        targetScoreBand: "250-320",
        tags: [
          "detail",
          "business",
          "marketing"
        ],
        question: "According to the passage, why are companies increasingly using subscription models?",
        passage: "In recent years, companies across various industries have shifted from traditional one-time sales to subscription-based models. This transition offers businesses predictable recurring revenue streams, which simplifies financial forecasting and long-term planning. Additionally, subscriptions encourage continuous customer engagement, as firms regularly update software or add new services to retain subscribers. For consumers, this model often lowers upfront costs while providing access to continually improving products.",
        transcript: "",
        choices: [
          "To eliminate the need for regular software updates",
          "To secure predictable revenue and improve financial forecasting",
          "To maximize single-transaction profit margins on hardware sales",
          "To reduce the number of active customer interactions"
        ],
        answer: 1,
        explanation: {
          summary: "\uAE30\uC5C5\uB4E4\uC774 \uAD6C\uB3C5 \uBAA8\uB378\uC744 \uB3C4\uC785\uD558\uB294 \uC774\uC720(\uC608\uCE21 \uAC00\uB2A5\uD55C \uC218\uC775 \uD655\uBCF4, \uC7AC\uBB34 \uC608\uCE21 \uC6A9\uC774\uC131 \uB4F1)\uB97C \uB2E4\uB8E8\uACE0 \uC788\uB2E4.",
          evidence: "offers businesses predictable recurring revenue streams, which simplifies financial forecasting",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uC9C0\uC18D\uC801\uC778 \uC5C5\uB370\uC774\uD2B8\uB97C \uC81C\uACF5\uD55C\uB2E4\uACE0 \uD588\uC9C0 \uC5C5\uB370\uC774\uD2B8 \uD544\uC694\uC131\uC744 \uC5C6\uC564\uB2E4\uACE0 \uD558\uC9C0 \uC54A\uC74C.",
            "(B) \uC815\uB2F5: \uC608\uCE21 \uAC00\uB2A5\uD55C \uC218\uC775\uC744 \uD655\uBCF4\uD558\uACE0 \uC7AC\uBB34 \uC608\uCE21\uC744 \uC6A9\uC774\uD558\uAC8C \uB9CC\uB4E0\uB2E4\uB294 \uB0B4\uC6A9\uACFC \uC815\uD655\uD788 \uC77C\uCE58\uD568.",
            "(C) \uC624\uB2F5: \uB2E8\uC77C \uAC70\uB798 \uC774\uC775\uC744 \uADF9\uB300\uD654\uD55C\uB2E4\uB294 \uAC83\uC740 \uC77C\uD68C\uC131 \uD310\uB9E4\uC5D0 \uD574\uB2F9\uD558\uBBC0\uB85C \uAD6C\uB3C5 \uBAA8\uB378\uACFC \uB2E4\uB984.",
            "(D) \uC624\uB2F5: \uACE0\uAC1D \uCC38\uC5EC\uB97C \uC9C0\uC18D\uC2DC\uD0A8\uB2E4\uACE0 \uD588\uC73C\uBBC0\uB85C \uC0C1\uD638\uC791\uC6A9\uC744 \uC904\uC778\uB2E4\uB294 \uAC83\uC740 \uC0AC\uC2E4\uACFC \uBC18\uB300\uB428."
          ]
        },
        skills: [
          "scanning",
          "detail-retrieval"
        ],
        vocabulary: [
          {
            word: "recurring",
            meaning: "\uBC18\uBCF5\uB418\uB294, \uC21C\uD658\uD558\uB294"
          },
          {
            word: "forecasting",
            meaning: "\uC608\uCE21, \uC804\uB9DD"
          },
          {
            word: "upfront",
            meaning: "\uC120\uBD88\uC758, \uC120\uB450\uC758"
          }
        ]
      },
      {
        id: "R-INF-kim-0006",
        section: "reading",
        part: 3,
        type: "inference",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: [
          "inference",
          "history",
          "culture"
        ],
        question: "What can be inferred about the printing press from the passage?",
        passage: "Before Johannes Gutenberg perfected the movable type printing press around 1440, manuscripts were copied entirely by hand by scribes. This tedious process made books extraordinarily rare and expensive, confining knowledge largely to wealthy elites and religious institutions. The rapid adoption of Gutenberg's technology dramatically reduced production costs and accelerated the dissemination of scientific, political, and philosophical ideas across Europe, laying the groundwork for the Renaissance and the Enlightenment.",
        transcript: "",
        choices: [
          "It caused scribes to lose their societal role almost immediately in 1440.",
          "It democratized access to information that was previously restricted.",
          "It was initially opposed by European scholars and political leaders.",
          "It was restricted to printing religious texts for its first century."
        ],
        answer: 1,
        explanation: {
          summary: "\uAD6C\uD150\uBCA0\uB974\uD06C\uC758 \uC778\uC1C4\uC220\uC774 \uC9C0\uC2DD\uC758 \uB3C5\uC810\uC744 \uAE68\uACE0 \uC778\uC1C4 \uBE44\uC6A9\uC744 \uB0AE\uCD94\uC5B4 \uC815\uBCF4\uC758 \uBCF4\uAE09 \uBC0F \uB300\uC911\uD654\uC5D0 \uAE30\uC5EC\uD588\uB2E4\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "confining knowledge largely to wealthy elites... reduced production costs and accelerated the dissemination of ideas",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uD544\uC0AC\uAE30\uAC00 \uC989\uAC01 \uC9C1\uC5C5\uC744 \uC783\uC5C8\uB294\uC9C0 \uC5EC\uBD80\uB294 \uC9C0\uBB38\uC5D0\uC11C \uCD94\uB860\uD560 \uC218 \uC5C6\uC74C.",
            "(B) \uC815\uB2F5: \uACFC\uAC70 \uC5D8\uB9AC\uD2B8/\uC885\uAD50 \uB2E8\uCCB4\uC5D0 \uD55C\uC815\uB418\uC5C8\uB358 \uC815\uBCF4 \uC811\uADFC\uC131\uC744 \uB300\uC911\uD654(democratized)\uD588\uB2E4\uB294 \uCD94\uB860\uC774 \uC801\uC808\uD568.",
            "(C) \uC624\uB2F5: \uD559\uC790\uB098 \uC815\uCE58 \uC9C0\uB3C4\uC790\uB4E4\uC774 \uCD08\uAE30 \uBC18\uB300\uD588\uB2E4\uB294 \uC5B8\uAE09\uC740 \uC9C0\uBB38\uC5D0 \uC5C6\uC74C.",
            "(D) \uC624\uB2F5: \uCCAB 1\uC138\uAE30 \uB3D9\uC548 \uC885\uAD50 \uC11C\uC801\uB9CC \uC778\uC1C4\uD558\uB3C4\uB85D \uC81C\uD55C\uB418\uC5C8\uB2E4\uB294 \uB0B4\uC6A9\uB3C4 \uC9C0\uBB38 \uB0B4\uC6A9\uACFC \uB9DE\uC9C0 \uC54A\uC74C."
          ]
        },
        skills: [
          "logical-inference",
          "contextual-deduction"
        ],
        vocabulary: [
          {
            word: "manuscript",
            meaning: "\uC6D0\uACE0, \uD544\uC0AC\uBCF8"
          },
          {
            word: "tedious",
            meaning: "\uC9C0\uB8E8\uD55C, \uC18C\uBAA8\uC801\uC778"
          },
          {
            word: "dissemination",
            meaning: "\uC720\uD3EC, \uBCF4\uAE09"
          }
        ]
      },
      {
        id: "R-BLK-kim-0007",
        section: "reading",
        part: 1,
        type: "blank",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: [
          "blank",
          "economics",
          "finance"
        ],
        question: "Which of the following best completes the blank?",
        passage: "Central banks often face a delicate balancing act when managing inflation. Raising interest rates can curb rising prices by borrowing costs and discouraging consumer spending. However, if rates are increased too aggressively, central banks risk halting economic growth altogether and triggering a recession. Therefore, policymakers must carefully calibrate monetary adjustments to control inflation without _______________.",
        transcript: "",
        choices: [
          "stifling economic activity unnecessarily",
          "encouraging excessive foreign investment",
          "reducing the national tax revenue base",
          "expanding emergency welfare expenditures"
        ],
        answer: 0,
        explanation: {
          summary: "\uC911\uC559\uC740\uD589\uC774 \uBB3C\uAC00\uB97C \uC7A1\uAE30 \uC704\uD574 \uAE08\uB9AC\uB97C \uC778\uC0C1\uD560 \uB54C, \uACFC\uB3C4\uD55C \uC778\uC0C1\uC73C\uB85C \uACBD\uAE30 \uCE68\uCCB4\uB97C \uC720\uBC1C\uD558\uC9C0 \uC54A\uB3C4\uB85D \uC870\uC728\uD574\uC57C \uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "risk halting economic growth altogether... calibrate monetary adjustments to control inflation without stifling economic activity unnecessarily",
          choiceAnalysis: [
            "(A) \uC815\uB2F5: \uACBD\uC81C \uC131\uC7A5\uC774 \uBA48\uCD94\uACE0 \uCE68\uCCB4\uB418\uB294 \uAC83\uC744 \uB9C9\uC544\uC57C \uD558\uBBC0\uB85C '\uACBD\uC81C \uD65C\uB3D9\uC744 \uBD88\uD544\uC694\uD558\uAC8C \uC704\uCD95\uC2DC\uD0A4\uC9C0 \uC54A\uC73C\uBA74\uC11C'\uAC00 \uC801\uC808\uD568.",
            "(B) \uC624\uB2F5: \uC678\uAD6D\uC778 \uD22C\uC790 \uACFC\uB2E4 \uC720\uCE58\uB97C \uB9C9\uB294\uB2E4\uB294 \uB9E5\uB77D\uC740 \uAE34\uCD95 \uD1B5\uD654\uC815\uCC45\uC758 \uC704\uD5D8\uC131\uACFC \uAD00\uB828 \uC5C6\uC74C.",
            "(C) \uC624\uB2F5: \uC138\uC218 \uAE30\uBC18 \uCD95\uC18C\uB294 \uC911\uC559\uC740\uD589\uC758 \uAE08\uB9AC \uC815\uCC45 \uBAA9\uC801\uACFC \uC9C1\uC811\uC801 \uC5F0\uAD00\uC774 \uBD80\uC871\uD568.",
            "(D) \uC624\uB2F5: \uAE34\uAE09 \uBCF5\uC9C0 \uC9C0\uCD9C \uD655\uB300\uB97C \uD53C\uD55C\uB2E4\uB294 \uAC83\uC740 \uC9C0\uBB38\uC758 \uD575\uC2EC \uADE0\uD615\uC810\uACFC \uC5B4\uAE0B\uB0A8."
          ]
        },
        skills: [
          "cohesion-and-coherence",
          "academic-reading"
        ],
        vocabulary: [
          {
            word: "curb",
            meaning: "\uC5B5\uC81C\uD558\uB2E4"
          },
          {
            word: "recession",
            meaning: "\uACBD\uAE30 \uCE68\uCCB4"
          },
          {
            word: "calibrate",
            meaning: "\uC870\uC728\uD558\uB2E4, \uC815\uBC00 \uC870\uC815\uD558\uB2E4"
          }
        ]
      },
      {
        id: "R-BLK-kim-0008",
        section: "reading",
        part: 1,
        type: "blank",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: [
          "blank",
          "sociology",
          "workplace"
        ],
        question: "Which of the following best completes the blank?",
        passage: "The concept of psychological safety in the workplace refers to a shared belief that team members will not be embarrassed, rejected, or punished for speaking up with ideas, questions, or mistakes. Organizations that foster psychological safety report higher levels of innovation and faster problem-solving. This is largely because employees in such environments feel empowered to _______________ without fear of negative consequences.",
        transcript: "",
        choices: [
          "take calculated risks and express constructive criticism",
          "delegate their individual responsibilities to peers",
          "avoid taking responsibility for operational errors",
          "demand higher compensation during quarterly reviews"
        ],
        answer: 0,
        explanation: {
          summary: "\uC2EC\uB9AC\uC801 \uC548\uC815\uAC10\uC774 \uC870\uC131\uB41C \uC870\uC9C1\uC5D0\uC11C\uB294 \uAD6C\uC131\uC6D0\uB4E4\uC774 \uBD80\uC815\uC801 \uACB0\uACFC\uC5D0 \uB300\uD55C \uB450\uB824\uC6C0 \uC5C6\uC774 \uC758\uACAC\uC744 \uB0B4\uACE0 \uC870\uC2EC\uC2A4\uB7EC\uC6B4 \uC704\uD5D8\uC744 \uBB34\uB985\uC4F4\uB2E4\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "will not be embarrassed... for speaking up with ideas... feel empowered to take calculated risks and express constructive criticism",
          choiceAnalysis: [
            "(A) \uC815\uB2F5: \uC544\uC774\uB514\uC5B4\uB098 \uC624\uB958\uB97C \uC194\uC9C1\uD788 \uB9D0\uD560 \uC218 \uC788\uB294 \uC548\uC804\uD55C \uBD84\uC704\uAE30\uC774\uBBC0\uB85C '\uACC4\uC0B0\uB41C \uC704\uD5D8\uC744 \uBB34\uB985\uC4F0\uACE0 \uAC74\uC124\uC801 \uBE44\uD310\uC744 \uD45C\uD604\uD558\uB2E4'\uAC00 \uC815\uB2F5\uC784.",
            "(B) \uC624\uB2F5: \uB3D9\uB8CC\uC5D0\uAC8C \uCC45\uC784\uC744 \uC804\uAC00\uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC740 \uC2EC\uB9AC\uC801 \uC548\uC815\uAC10\uC758 \uAE0D\uC815\uC801 \uD6A8\uACFC\uC640 \uAC70\uB9AC\uAC00 \uBA5E.",
            "(C) \uC624\uB2F5: \uC624\uB958 \uCC45\uC784\uC744 \uD68C\uD53C\uD558\uB294 \uAC83\uC740 \uC815\uC9C1\uD55C \uC18C\uD1B5\uACFC \uBC18\uB300\uB418\uB294 \uD589\uC704\uC784.",
            "(D) \uC624\uB2F5: \uAE09\uC5EC \uC778\uC0C1\uC744 \uC694\uAD6C\uD558\uB294 \uAC83\uACFC \uC2EC\uB9AC\uC801 \uC548\uC815\uAC10\uC758 \uD575\uC2EC \uAC00\uCE58\uB294 \uC9C1\uC811\uC801 \uAD00\uB828\uC774 \uC5C6\uC74C."
          ]
        },
        skills: [
          "contextual-synthesis",
          "logic-building"
        ],
        vocabulary: [
          {
            word: "psychological",
            meaning: "\uC2EC\uB9AC\uC801\uC778"
          },
          {
            word: "empower",
            meaning: "\uAD8C\uD55C\uC744 \uC8FC\uB2E4, \uC6A9\uAE30\uB97C \uBD81\uB3CB\uC6B0\uB2E4"
          },
          {
            word: "calculated risk",
            meaning: "\uACC4\uC0B0\uB41C(\uC608\uC0C1\uB41C) \uC704\uD5D8"
          }
        ]
      },
      {
        id: "R-COH-kim-0009",
        section: "reading",
        part: 4,
        type: "coherence",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: [
          "coherence",
          "biology",
          "nature"
        ],
        question: "Which of the following sentences does NOT belong in the passage?",
        passage: "(a) Coral reefs are among the most biodiverse ecosystems on Earth, supporting roughly 25 percent of all marine species. (b) They provide vital coastal protection by absorbing wave energy and preventing shoreline erosion. (c) Many coastal tourism operators report significant revenue growth due to eco-friendly scuba diving packages. (d) However, rising sea temperatures caused by global climate change are leading to widespread coral bleaching, threatening their long-term survival.",
        transcript: "",
        choices: [
          "(a)",
          "(b)",
          "(c)",
          "(d)"
        ],
        answer: 2,
        explanation: {
          summary: "\uC0B0\uD638\uCD08 \uC0DD\uD0DC\uACC4\uC758 \uC911\uC694\uC131\uACFC \uAE30\uD6C4 \uBCC0\uD654\uB85C \uC778\uD55C \uC704\uAE30\uB97C \uB2E4\uB8E8\uB294 \uAE00\uC5D0\uC11C \uAD00\uAD11 \uC0C1\uD488 \uC218\uC775 \uC99D\uB300\uB294 \uB9E5\uB77D\uC0C1 \uD750\uB984\uC744 \uD574\uCE58\uB294 \uBB38\uC7A5\uC774\uB2E4.",
          evidence: "\uBB38\uC7A5 (a), (b), (d)\uB294 \uC0B0\uD638\uCD08\uC758 \uC0DD\uD0DC\uC801 \uC5ED\uD560\uACFC \uAE30\uD6C4\uBCC0\uD654 \uC704\uAE30\uC5D0 \uAD00\uD55C \uC124\uBA85\uC778 \uBC18\uBA74, (c)\uB294 \uAD00\uAD11 \uC5C5\uCCB4 \uC218\uC775\uC5D0 \uB300\uD55C \uB72C\uAE08\uC5C6\uB294 \uC0C1\uC5C5\uC801 \uB0B4\uC6A9\uC784.",
          choiceAnalysis: [
            "(a) \uBB38\uB9E5\uC0C1 \uC801\uC808: \uC0B0\uD638\uCD08\uC758 \uB192\uC740 \uC0DD\uBB3C\uB2E4\uC591\uC131\uC744 \uC18C\uAC1C\uD568.",
            "(b) \uBB38\uB9E5\uC0C1 \uC801\uC808: \uD574\uC548 \uBCF4\uD638\uB77C\uB294 \uC0B0\uD638\uCD08\uC758 \uC0DD\uD0DC\uC801 \uAE30\uB2A5\uC744 \uC124\uBA85\uD568.",
            "(c) \uC815\uB2F5(\uD750\uB984\uC5D0\uC11C \uBC97\uC5B4\uB0A8): \uC2A4\uCFE0\uBC84 \uB2E4\uC774\uBE59 \uAD00\uAD11 \uC0C1\uD488\uC758 \uB9E4\uCD9C \uC99D\uAC00 \uC774\uC57C\uAE30\uB294 \uC0B0\uD638\uCD08 \uC0DD\uD0DC\uACC4 \uC5ED\uD560 \uBC0F \uC704\uAE30\uB77C\uB294 \uC804\uCCB4 \uD750\uB984\uC5D0\uC11C \uBC97\uC5B4\uB0A8.",
            "(d) \uBB38\uB9E5\uC0C1 \uC801\uC808: \uC9C0\uAD6C \uC628\uB09C\uD654\uB85C \uC778\uD55C \uC0B0\uD638 \uBC31\uD654 \uD604\uC0C1\uACFC \uC704\uAE30\uB97C \uC5B8\uAE09\uD558\uC5EC \uB17C\uC9C0\uB97C \uC644\uC131\uD568."
          ]
        },
        skills: [
          "coherence-check",
          "paragraph-structure"
        ],
        vocabulary: [
          {
            word: "biodiverse",
            meaning: "\uC0DD\uBB3C\uB2E4\uC591\uC131\uC774 \uD48D\uBD80\uD55C"
          },
          {
            word: "erosion",
            meaning: "\uCE68\uC2DD"
          },
          {
            word: "bleaching",
            meaning: "\uBC31\uD654 \uD604\uC0C1"
          }
        ]
      },
      {
        id: "R-MAI-kim-0010",
        section: "reading",
        part: 2,
        type: "main-idea",
        difficulty: 3,
        targetScoreBand: "327-target",
        tags: [
          "main-idea",
          "technology",
          "artificial-intelligence"
        ],
        question: "Which of the following best expresses the main idea of the passage?",
        passage: "While artificial intelligence tools have automated routine administrative tasks, human intuition and empathy remain irreplaceable in effective leadership. AI algorithms can process vast amounts of data to forecast market trends, but they lack the capacity to understand emotional nuances or inspire organizational morale during crises. Thus, future executives must leverage analytical AI tools while honing distinctly human interpersonal skills to guide their organizations effectively.",
        transcript: "",
        choices: [
          "AI will fully replace corporate executives within the next decade.",
          "Effective leadership requires combining AI capabilities with uniquely human qualities.",
          "Data analysis is far more crucial than empathy when managing corporate crises.",
          "Administrative tasks should no longer be automated due to accuracy concerns."
        ],
        answer: 1,
        explanation: {
          summary: "AI\uC758 \uB370\uC774\uD130 \uBD84\uC11D \uB2A5\uB825\uACFC \uC778\uAC04\uC758 \uACF5\uAC10 \uB2A5\uB825 \uBC0F \uC9C1\uAD00\uC744 \uACB0\uD569\uD558\uB294 \uAC83\uC774 \uBBF8\uB798 \uB9AC\uB354\uC2ED\uC758 \uD575\uC2EC\uC774\uB77C\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "executives must leverage analytical AI tools while honing distinctly human interpersonal skills",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: AI\uAC00 \uACBD\uC601\uC9C4\uC744 \uC644\uC804\uD788 \uB300\uCCB4\uD560 \uAC83\uC774\uB77C\uB294 \uAC83\uC740 \uC9C0\uBB38\uC758 \uC8FC\uC7A5\uACFC \uB2E4\uB984.",
            "(B) \uC815\uB2F5: AI\uC758 \uBD84\uC11D\uB825\uACFC \uC778\uAC04 \uACE0\uC720\uC758 \uAC10\uC131/\uB300\uC778\uAD00\uACC4 \uC5ED\uB7C9\uC744 \uACB0\uD569\uD574\uC57C \uD55C\uB2E4\uB294 \uC694\uC9C0\uC640 \uC815\uD655\uD788 \uC77C\uCE58\uD568.",
            "(C) \uC624\uB2F5: \uB370\uC774\uD130 \uBD84\uC11D\uC774 \uACF5\uAC10 \uB2A5\uB825\uBCF4\uB2E4 \uD6E8\uC52C \uC911\uC694\uD558\uB2E4\uB294 \uAC83\uC740 \uC9C0\uBB38 \uB0B4\uC6A9\uACFC \uBC18\uB300\uB428.",
            "(D) \uC624\uB2F5: \uD589\uC815 \uC5C5\uBB34 \uC790\uB3D9\uD654\uB97C \uC911\uB2E8\uD574\uC57C \uD55C\uB2E4\uB294 \uB0B4\uC6A9\uC740 \uC9C0\uBB38\uC5D0 \uC5C6\uC74C."
          ]
        },
        skills: [
          "main-idea-extraction",
          "critical-reading"
        ],
        vocabulary: [
          {
            word: "intuition",
            meaning: "\uC9C1\uAD00(\uB825)"
          },
          {
            word: "morale",
            meaning: "\uC0AC\uAE30, \uC758\uC695"
          },
          {
            word: "leverage",
            meaning: "\uD65C\uC6A9\uD558\uB2E4"
          }
        ]
      },
      {
        id: "R-INF-kim-0011",
        section: "reading",
        part: 3,
        type: "inference",
        difficulty: 4,
        targetScoreBand: "327-target",
        tags: [
          "inference",
          "linguistics",
          "cognition"
        ],
        question: "What can be inferred about bilingual individuals from the passage?",
        passage: "For decades, researchers debated whether acquiring two languages simultaneously delayed childhood cognitive development. Recent neuroimaging studies, however, demonstrate that managing two linguistic systems continuously strengthens executive control networks in the brain. Bilingual individuals habitually suppress one language while accessing another, which enhances cognitive flexibility and task-switching ability throughout adulthood. Furthermore, evidence indicates this neural resilience may delay the onset of age-related cognitive decline.",
        transcript: "",
        choices: [
          "They experience lifelong speech impediments due to language interference.",
          "Their brain networks benefit cognitive control from managing multiple languages.",
          "They are less capable of multitasking compared to monolingual peers.",
          "They generally lose their second language fluency as they reach old age."
        ],
        answer: 1,
        explanation: {
          summary: "\uC774\uC911 \uC5B8\uC5B4 \uC0AC\uC6A9\uC774 \uC5B5\uC81C \uC81C\uC5B4\uC640 \uB1CC \uC2E0\uACBD\uB9DD\uC744 \uAC15\uD654\uD558\uC5EC \uC778\uC9C0\uC801 \uC720\uC5F0\uC131\uC744 \uB192\uC774\uACE0 \uB098\uC774\uAC00 \uB4E4\uC5B4\uC11C\uB3C4 \uC778\uC9C0 \uC800\uD558\uB97C \uB2A6\uCDB0\uC900\uB2E4\uB294 \uB0B4\uC6A9\uC774\uB2E4.",
          evidence: "managing two linguistic systems continuously strengthens executive control networks... enhances cognitive flexibility",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uD3C9\uC0DD \uC5B8\uC5B4 \uC7A5\uC560\uB97C \uACAA\uB294\uB2E4\uB294 \uBD80\uC791\uC6A9\uC740 \uC9C0\uBB38\uC5D0 \uC5B8\uAE09\uB418\uC9C0 \uC54A\uC73C\uBA70 \uD1B5\uB150\uACFC\uB3C4 \uB2E4\uB984.",
            "(B) \uC815\uB2F5: \uB450 \uC5B8\uC5B4\uB97C \uB2E4\uB8E8\uB294 \uACFC\uC815\uC5D0\uC11C \uB1CC\uC758 \uC778\uC9C0 \uC870\uC808 \uB2A5\uB825\uC774 \uAC15\uD654\uB41C\uB2E4\uB294 \uBCF8\uBB38 \uB0B4\uC6A9\uC73C\uB85C\uBD80\uD130 \uC801\uC808\uD558\uAC8C \uCD94\uB860\uB428.",
            "(C) \uC624\uB2F5: \uB2E4\uC911 \uC791\uC5C5 \uB2A5\uB825\uC774 \uB5A8\uC5B4\uC9C4\uB2E4\uB294 \uAC83\uC740 \uC778\uC9C0\uC801 \uC720\uC5F0\uC131\uC774 \uB192\uC544\uC9C4\uB2E4\uB294 \uBCF8\uBB38\uACFC \uBC18\uB300\uC784.",
            "(D) \uC624\uB2F5: \uB178\uB144\uAE30\uC5D0 \uC81C2\uC5B8\uC5B4 \uC720\uCC3D\uC131\uC744 \uC783\uB294\uB2E4\uB294 \uB0B4\uC6A9 \uB610\uD55C \uC9C0\uBB38\uC5D0 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uC74C."
          ]
        },
        skills: [
          "advanced-inference",
          "textual-deduction"
        ],
        vocabulary: [
          {
            word: "simultaneously",
            meaning: "\uB3D9\uC2DC\uC5D0"
          },
          {
            word: "suppress",
            meaning: "\uC5B5\uC81C\uD558\uB2E4"
          },
          {
            word: "onset",
            meaning: "\uBC1C\uBCD1, \uC2DC\uC791"
          }
        ]
      },
      {
        id: "R-BLK-kim-0012",
        section: "reading",
        part: 1,
        type: "blank",
        difficulty: 4,
        targetScoreBand: "327-target",
        tags: [
          "blank",
          "philosophy",
          "ethics"
        ],
        question: "Which of the following best completes the blank?",
        passage: "Scientific discovery thrives on the objective evaluation of empirical evidence. However, scientists are not immune to confirmation bias\u2014the subconscious tendency to notice data that supports existing theories while ignoring conflicting results. To counter this human limitation, the scientific community relies heavily on peer review and independent replication. These rigorous protocols ensure that findings are accepted only after withstanding _______________.",
        transcript: "",
        choices: [
          "uncritical public approval and media praise",
          "thorough scrutiny and empirical verification by peers",
          "unconditional endorsement by government agencies",
          "preliminary testing without formal documentation"
        ],
        answer: 1,
        explanation: {
          summary: "\uACFC\uD559\uC801 \uD655\uC99D \uD3B8\uD5A5\uC744 \uBC29\uC9C0\uD558\uAE30 \uC704\uD574 \uB3D9\uB8CC \uAC80\uD1A0(peer review)\uC640 \uB3C5\uB9BD\uC801 \uC7AC\uD604 \uB4F1 \uC5C4\uACA9\uD55C \uACFC\uC815\uC744 \uD1B5\uD574 \uCCA0\uC800\uD55C \uAC80\uC99D\uC744 \uAC70\uCE5C\uB2E4\uB294 \uAE00\uC774\uB2E4.",
          evidence: "relies heavily on peer review and independent replication... ensure findings are accepted only after withstanding thorough scrutiny",
          choiceAnalysis: [
            "(A) \uC624\uB2F5: \uBE44\uD310 \uC5C6\uB294 \uB300\uC911 \uC2B9\uC778\uACFC \uC5B8\uB860 \uCC2C\uC0AC\uB294 \uACFC\uD559\uC801 \uC815\uBC00\uC131\uACFC \uAC70\uB9AC\uAC00 \uBA5E.",
            "(B) \uC815\uB2F5: \uB3D9\uB8CC\uB4E4\uC5D0 \uC758\uD55C \uCCA0\uC800\uD55C \uC870\uC0AC\uC640 \uC2E4\uC99D\uC801 \uAC80\uC99D\uC744 \uACAC\uB38C\uB0B8 \uD6C4\uC5D0\uC57C \uBC1B\uC544\uB4E4\uC5EC\uC9C4\uB2E4\uB294 \uBB38\uB9E5\uC774 \uC815\uB2F5\uC784.",
            "(C) \uC624\uB2F5: \uC815\uBD80 \uAE30\uAD00\uC758 \uBB34\uC870\uAC74\uC801\uC778 \uC2B9\uC778\uC740 \uB3C5\uB9BD\uC801 \uAC80\uC99D\uC758 \uAC1C\uB150\uACFC \uBB34\uAD00\uD568.",
            "(D) \uC624\uB2F5: \uBB38\uC11C\uD654 \uC5C6\uB294 \uC608\uBE44 \uD14C\uC2A4\uD2B8\uB294 \uC5C4\uACA9\uD55C \uACFC\uD559\uC801 \uC808\uCC28\uC640 \uBC18\uB300\uB428."
          ]
        },
        skills: [
          "complex-blank-completion",
          "academic-reasoning"
        ],
        vocabulary: [
          {
            word: "empirical",
            meaning: "\uC2E4\uC99D\uC801\uC778, \uACBD\uD5D8\uC801\uC778"
          },
          {
            word: "bias",
            meaning: "\uD3B8\uD5A5, \uD3B8\uACAC"
          },
          {
            word: "scrutiny",
            meaning: "\uCCA0\uC800\uD55C \uC870\uC0AC, \uC815\uBC00 \uAC80\uC0AC"
          }
        ]
      }
    ]
  };

  // data/foundation/manifest.json
  var manifest_default2 = {
    version: 2,
    demo: false,
    categories: [
      { id: "sentence", title: "\uBB38\uC7A5 \uAE30\uCD08", description: "\uC601\uC5B4 \uBB38\uC7A5\uC758 \uAE30\uBCF8 \uAD6C\uC870\uB97C \uB2E4\uC2DC \uC138\uC6C1\uB2C8\uB2E4." },
      { id: "grammar", title: "\uBB38\uBC95 \uAE30\uCD08", description: "\uD575\uC2EC \uBB38\uBC95 \uAC1C\uB150\uC744 \uC815\uB9AC\uD569\uB2C8\uB2E4." },
      { id: "vocabulary", title: "\uC5B4\uD718 \uAE30\uCD08", description: "\uACE0\uBE48\uB3C4 \uC5B4\uD718\xB7\uC5F0\uC5B4\xB7\uD63C\uB3D9\uC5B4\uB97C \uC775\uD799\uB2C8\uB2E4." },
      { id: "expand", title: "\uBB38\uC7A5 \uD655\uC7A5", description: "\uB354 \uAE34 \uBB38\uC7A5\uC744 \uC77D\uACE0 \uC4F0\uB294 \uD798\uC744 \uD0A4\uC6C1\uB2C8\uB2E4." },
      { id: "reading", title: "\uB3C5\uD574 \uAE30\uCD08", description: "\uC9E7\uC740 \uC9C0\uBB38\uBD80\uD130 \uB3C5\uD574 \uAC10\uAC01\uC744 \uD68C\uBCF5\uD569\uB2C8\uB2E4." },
      { id: "listening", title: "\uCCAD\uD574 \uAE30\uCD08", description: "\uC9E7\uC740 \uB300\uD654\xB7\uC0C1\uD669 \uD30C\uC545\uC5D0 \uC775\uC219\uD574\uC9D1\uB2C8\uB2E4." }
    ],
    lessons: [
      { id: "F-001", order: 1, title: "\uC601\uC5B4 \uBB38\uC7A5\uC758 \uBF08\uB300", category: "sentence", estimatedMinutes: 15, file: "./data/foundation/lessons/F-001.json" },
      { id: "F-002", order: 2, title: "\uD488\uC0AC", category: "sentence", estimatedMinutes: 12, file: "./data/foundation/lessons/F-002.json" },
      { id: "F-003", order: 3, title: "\uC8FC\uC5B4\uC640 \uB3D9\uC0AC", category: "sentence", estimatedMinutes: 12, file: "./data/foundation/lessons/F-003.json" },
      { id: "F-004", order: 4, title: "\uBAA9\uC801\uC5B4\uC640 \uBCF4\uC5B4", category: "sentence", estimatedMinutes: 12, file: "./data/foundation/lessons/F-004.json" },
      { id: "F-005", order: 5, title: "\uC2DC\uC81C", category: "grammar", estimatedMinutes: 15, file: "./data/foundation/lessons/F-005.json" },
      { id: "F-006", order: 6, title: "\uC870\uB3D9\uC0AC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-006.json" },
      { id: "F-007", order: 7, title: "\uC218\uB3D9\uD0DC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-007.json" },
      { id: "F-008", order: 8, title: "to\uBD80\uC815\uC0AC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-008.json" },
      { id: "F-009", order: 9, title: "\uB3D9\uBA85\uC0AC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-009.json" },
      { id: "F-010", order: 10, title: "\uBD84\uC0AC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-010.json" },
      { id: "F-011", order: 11, title: "\uC811\uC18D\uC0AC", category: "grammar", estimatedMinutes: 12, file: "./data/foundation/lessons/F-011.json" },
      { id: "F-012", order: 12, title: "\uAD00\uACC4\uC0AC", category: "grammar", estimatedMinutes: 15, file: "./data/foundation/lessons/F-012.json" },
      { id: "F-013", order: 13, title: "\uACE0\uBE48\uB3C4 \uD575\uC2EC \uC5B4\uD718", category: "vocabulary", estimatedMinutes: 14, file: "./data/foundation/lessons/F-013.json" },
      { id: "F-014", order: 14, title: "\uC5F0\uC5B4\uC640 \uAD6C\uB3D9\uC0AC", category: "vocabulary", estimatedMinutes: 14, file: "./data/foundation/lessons/F-014.json" },
      { id: "F-015", order: 15, title: "\uD63C\uB3D9\uD558\uAE30 \uC26C\uC6B4 \uC5B4\uD718", category: "vocabulary", estimatedMinutes: 14, file: "./data/foundation/lessons/F-015.json" },
      { id: "F-016", order: 16, title: "\uC808\uC744 \uC5F0\uACB0\uD558\uAE30", category: "expand", estimatedMinutes: 14, file: "./data/foundation/lessons/F-016.json" },
      { id: "F-017", order: 17, title: "\uC218\uC2DD\uC5B4 \uBD99\uC774\uAE30", category: "expand", estimatedMinutes: 14, file: "./data/foundation/lessons/F-017.json" },
      { id: "F-018", order: 18, title: "\uAE34 \uBB38\uC7A5 \uC77D\uAE30", category: "expand", estimatedMinutes: 15, file: "./data/foundation/lessons/F-018.json" },
      { id: "F-019", order: 19, title: "\uC9E7\uC740 \uC9C0\uBB38 \uC694\uC9C0", category: "reading", estimatedMinutes: 15, file: "./data/foundation/lessons/F-019.json" },
      { id: "F-020", order: 20, title: "\uC9C0\uC2DC\uC5B4\uC640 \uC138\uBD80\uC815\uBCF4", category: "reading", estimatedMinutes: 15, file: "./data/foundation/lessons/F-020.json" },
      { id: "F-021", order: 21, title: "\uC9E7\uC740 \uCD94\uB860", category: "reading", estimatedMinutes: 15, file: "./data/foundation/lessons/F-021.json" },
      { id: "F-022", order: 22, title: "\uC9E7\uC740 \uC751\uB2F5 \uD30C\uC545", category: "listening", estimatedMinutes: 14, file: "./data/foundation/lessons/F-022.json" },
      { id: "F-023", order: 23, title: "\uC22B\uC790\xB7\uC7A5\uC18C\xB7\uC2DC\uAC04", category: "listening", estimatedMinutes: 14, file: "./data/foundation/lessons/F-023.json" },
      { id: "F-024", order: 24, title: "\uC9E7\uC740 \uB300\uD654 \uC0C1\uD669", category: "listening", estimatedMinutes: 15, file: "./data/foundation/lessons/F-024.json" }
    ]
  };

  // data/foundation/lessons/F-001.json
  var F_001_default = {
    id: "F-001",
    order: 1,
    title: "\uC601\uC5B4 \uBB38\uC7A5\uC758 \uBF08\uB300",
    category: "sentence",
    estimatedMinutes: 15,
    skills: [
      "sentence-patterns",
      "svo-analysis",
      "complement-vs-object"
    ],
    objectives: [
      "\uC601\uC5B4 \uBB38\uC7A5\uC758 \uAE30\uBCF8 5\uD615\uC2DD \uAD6C\uC870\uB97C \uD30C\uC545\uD55C\uB2E4",
      "\uC8FC\uC5B4\xB7\uB3D9\uC0AC\xB7\uBAA9\uC801\uC5B4\xB7\uBCF4\uC5B4\uC758 \uC5ED\uD560\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uC2E4\uC804 \uBB38\uC7A5\uC744 \uAD6C\uC870\uC801\uC73C\uB85C \uBE60\uB974\uAC8C \uBD84\uC11D\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uC601\uC5B4 \uBB38\uC7A5\uC740 \uC8FC\uC5B4(S)\uC640 \uB3D9\uC0AC(V)\uB97C \uBF08\uB300\uB85C \uD569\uB2C8\uB2E4. \uC5EC\uAE30\uC5D0 \uBAA9\uC801\uC5B4(O)\uB098 \uBCF4\uC5B4(C)\uAC00 \uBD99\uC73C\uBA70 \uC758\uBBF8\uAC00 \uC644\uC131\uB418\uACE0, TEPS\uC5D0\uC11C\uB3C4 \uC774 \uBF08\uB300\uB97C \uBA3C\uC800 \uC7A1\uC73C\uBA74 \uAE34 \uBB38\uC7A5\uC774 \uB2E8\uC21C\uD574\uC9D1\uB2C8\uB2E4.",
      points: [
        "S + V : \uC8FC\uC5B4\uAC00 \uBB34\uC5C7\uC744 \uD55C\uB2E4 (He arrived.)",
        "S + V + O : \uC8FC\uC5B4\uAC00 \uBAA9\uC801\uC5B4\uC5D0 \uD589\uC704\uD55C\uB2E4 (She read the report.)",
        "S + V + C : \uBCF4\uC5B4\uAC00 \uC8FC\uC5B4\uC758 \uC0C1\uD0DC\xB7\uC2E0\uBD84\uC744 \uC124\uBA85\uD55C\uB2E4 (He became CEO.)",
        "S + V + IO + DO / S + V + O + C : \uAC04\uC811\xB7\uC9C1\uC811\uBAA9\uC801\uC5B4 \uB610\uB294 \uBAA9\uC801\uBCF4\uC5B4\uB85C \uD655\uC7A5\uB41C\uB2E4"
      ]
    },
    examples: [
      {
        en: "She studies.",
        ko: "\uADF8\uB140\uB294 \uACF5\uBD80\uD55C\uB2E4.",
        structure: "S + V"
      },
      {
        en: "He reads a book.",
        ko: "\uADF8\uB294 \uCC45\uC744 \uC77D\uB294\uB2E4.",
        structure: "S + V + O"
      },
      {
        en: "The soup tastes delicious.",
        ko: "\uADF8 \uC218\uD504\uB294 \uB9DB\uC788\uB2E4.",
        structure: "S + V + C"
      }
    ],
    checks: [
      {
        id: "F-001-Q01",
        skill: "pattern-id",
        question: '"Tom opened the door."\uC758 \uBB38\uC7A5 \uAD6C\uC870\uB294?',
        choices: [
          "S + V",
          "S + V + O",
          "S + V + C",
          "S + V + IO + DO"
        ],
        answer: 1,
        explanation: "Tom(\uC8FC\uC5B4)\uC774 opened(\uB3D9\uC0AC)\uB85C the door(\uBAA9\uC801\uC5B4)\uB97C \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4. S + V + O \uAD6C\uC870\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q02",
        skill: "complement-spot",
        question: "\uB2E4\uC74C \uC911 \uBCF4\uC5B4(Complement)\uAC00 \uC788\uB294 \uBB38\uC7A5\uC740?",
        choices: [
          "I bought a ticket.",
          "She became a teacher.",
          "They watched a movie.",
          "We closed the window."
        ],
        answer: 1,
        explanation: "became \uB2E4\uC74C\uC758 a teacher\uB294 \uC8FC\uC5B4 She\uC758 \uC0C1\uD0DC\uB97C \uC124\uBA85\uD558\uB294 \uC8FC\uACA9\uBCF4\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q03",
        skill: "core-elements",
        question: "\uC601\uC5B4 \uBB38\uC7A5\uC5D0\uC11C \uAC00\uC7A5 \uC911\uC2EC\uC774 \uB418\uB294 \uB450 \uC694\uC18C\uB294?",
        choices: [
          "\uD615\uC6A9\uC0AC\uC640 \uBD80\uC0AC",
          "\uC804\uCE58\uC0AC\uC640 \uC811\uC18D\uC0AC",
          "\uC8FC\uC5B4\uC640 \uB3D9\uC0AC",
          "\uBAA9\uC801\uC5B4\uC640 \uBCF4\uC5B4"
        ],
        answer: 2,
        explanation: "\uC8FC\uC5B4\uC640 \uB3D9\uC0AC\uB294 \uC601\uC5B4 \uBB38\uC7A5\uC758 \uBF08\uB300\uC785\uB2C8\uB2E4. \uB098\uBA38\uC9C0 \uC694\uC18C\uB294 \uC774 \uC704\uC5D0 \uD655\uC7A5\uB429\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q04",
        skill: "pattern-id",
        question: '"Please send me the file."\uC5D0\uC11C me\uC758 \uBB38\uC7A5 \uC131\uBD84\uC740?',
        choices: [
          "\uC8FC\uC5B4",
          "\uC9C1\uC811\uBAA9\uC801\uC5B4",
          "\uAC04\uC811\uBAA9\uC801\uC5B4",
          "\uBCF4\uC5B4"
        ],
        answer: 2,
        explanation: "send me the file\uB294 S+V+IO+DO \uAD6C\uC870\uB85C, me\uB294 \uAC04\uC811\uBAA9\uC801\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q05",
        skill: "trap-linking",
        question: "linking verb(\uC5F0\uACB0\uB3D9\uC0AC) \uB4A4\uC5D0 \uC8FC\uB85C \uC624\uB294 \uAC83\uC740?",
        choices: [
          "\uBAA9\uC801\uC5B4",
          "\uBCF4\uC5B4",
          "\uBD80\uC0AC\uB9CC",
          "\uC804\uCE58\uC0AC\uAD6C\uB9CC"
        ],
        answer: 1,
        explanation: "be, become, seem, look \uB4F1 \uC5F0\uACB0\uB3D9\uC0AC \uB4A4\uC5D0\uB294 \uC8FC\uC5B4\uB97C \uC124\uBA85\uD558\uB294 \uBCF4\uC5B4\uAC00 \uC635\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q06",
        skill: "pattern-id",
        question: '"They elected him chairperson."\uC758 \uAD6C\uC870\uB294?',
        choices: [
          "S + V + O",
          "S + V + C",
          "S + V + O + C",
          "S + V + IO + DO"
        ],
        answer: 2,
        explanation: "him\uC740 \uBAA9\uC801\uC5B4, chairperson\uC740 \uBAA9\uC801\uBCF4\uC5B4\uC774\uBBC0\uB85C S + V + O + C\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q07",
        skill: "object-spot",
        question: "\uB2E4\uC74C \uC911 \uBAA9\uC801\uC5B4\uAC00 \uC5C6\uB294 \uBB38\uC7A5\uC740?",
        choices: [
          "I finished the draft.",
          "She remains calm.",
          "We need more data.",
          "He called a taxi."
        ],
        answer: 1,
        explanation: "remains\uB294 \uC5F0\uACB0\uB3D9\uC0AC\uC774\uACE0 calm\uC740 \uBCF4\uC5B4\uC785\uB2C8\uB2E4. \uBAA9\uC801\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q08",
        skill: "application",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAD6C\uC870 \uC124\uBA85\uC740? "My colleague gave ___ ___ ."',
        choices: [
          "IO + DO (me the key)",
          "O + C\uB9CC \uAC00\uB2A5",
          "C\uB9CC \uAC00\uB2A5",
          "\uC804\uCE58\uC0AC \uC5C6\uC774 DO\uB9CC"
        ],
        answer: 0,
        explanation: "give\uB294 \uAC04\uC811\uBAA9\uC801\uC5B4+\uC9C1\uC811\uBAA9\uC801\uC5B4 \uD328\uD134\uC774 \uD754\uD569\uB2C8\uB2E4. gave me the key."
      },
      {
        id: "F-001-Q09",
        skill: "trap-sense",
        question: '"The plan sounds reasonable."\uC5D0\uC11C reasonable\uC758 \uC5ED\uD560\uC740?',
        choices: [
          "\uBAA9\uC801\uC5B4",
          "\uBD80\uC0AC",
          "\uC8FC\uACA9\uBCF4\uC5B4",
          "\uAC04\uC811\uBAA9\uC801\uC5B4"
        ],
        answer: 2,
        explanation: "sound\uB294 \uC5F0\uACB0\uB3D9\uC0AC\uB85C, reasonable\uC774 \uC8FC\uC5B4 the plan\uC744 \uC124\uBA85\uD558\uB294 \uC8FC\uACA9\uBCF4\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-001-Q10",
        skill: "application",
        question: "\uAE34 \uBB38\uC7A5\uC744 \uC77D\uC744 \uB54C \uAC00\uC7A5 \uBA3C\uC800 \uCC3E\uC544\uC57C \uD560 \uAC83\uC740?",
        choices: [
          "\uAC00\uC7A5 \uAE34 \uD615\uC6A9\uC0AC",
          "\uC8FC\uC5B4\uC640 \uBCF8\uB3D9\uC0AC",
          "\uBAA8\uB4E0 \uC804\uCE58\uC0AC",
          "\uC811\uC18D\uC0AC\uB9CC"
        ],
        answer: 1,
        explanation: "\uC218\uC2DD\uC5B4\uB97C \uC7A0\uC2DC \uC81C\uCCD0 \uB450\uACE0 \uC8FC\uC5B4\xB7\uBCF8\uB3D9\uC0AC\uBD80\uD130 \uC7A1\uC73C\uBA74 \uBF08\uB300\uAC00 \uBCF4\uC785\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-002.json
  var F_002_default = {
    id: "F-002",
    order: 2,
    title: "\uD488\uC0AC",
    category: "sentence",
    estimatedMinutes: 12,
    skills: [
      "parts-of-speech",
      "adj-vs-adv",
      "word-function"
    ],
    objectives: [
      "\uC8FC\uC694 \uD488\uC0AC\uC758 \uAE30\uBCF8 \uC5ED\uD560\uC744 \uC815\uB9AC\uD55C\uB2E4",
      "\uBB38\uC7A5 \uC18D\uC5D0\uC11C \uAC19\uC740 \uB2E8\uC5B4\uC758 \uD488\uC0AC \uC804\uD658\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uD615\uC6A9\uC0AC\uC640 \uBD80\uC0AC \uD63C\uB3D9 \uD568\uC815\uC744 \uD53C\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uD488\uC0AC\uB294 \uB2E8\uC5B4\uAC00 \uBB38\uC7A5\uC5D0\uC11C \uD558\uB294 \uC5ED\uD560\uC785\uB2C8\uB2E4. \uAC19\uC740 \uCCA0\uC790\uB77C\uB3C4 \uBB38\uB9E5\uC5D0 \uB530\uB77C \uBA85\uC0AC\xB7\uB3D9\uC0AC\xB7\uD615\uC6A9\uC0AC\uB85C \uBC14\uB014 \uC218 \uC788\uC73C\uBBC0\uB85C, \uC0AC\uC804 \uC554\uAE30\uBCF4\uB2E4 \u2018\uBB34\uC5C7\uC744 \uAFB8\uBBF8\uB294\uC9C0\u2019\uB97C \uBCF4\uB294 \uC2B5\uAD00\uC774 \uC911\uC694\uD569\uB2C8\uB2E4.",
      points: [
        "\uBA85\uC0AC: \uC0AC\uB78C\xB7\uC0AC\uBB3C\xB7\uAC1C\uB150\uC758 \uC774\uB984 (report, decision)",
        "\uB3D9\uC0AC: \uB3D9\uC791\uC774\uB098 \uC0C1\uD0DC (decide, remain)",
        "\uD615\uC6A9\uC0AC: \uBA85\uC0AC\uB97C \uC218\uC2DD (a careful review)",
        "\uBD80\uC0AC: \uB3D9\uC0AC\xB7\uD615\uC6A9\uC0AC\xB7\uBD80\uC0AC\xB7\uC808\uC744 \uC218\uC2DD (carefully, very, honestly)"
      ]
    },
    examples: [
      {
        en: "A careful student reads slowly.",
        ko: "\uC2E0\uC911\uD55C \uD559\uC0DD\uC740 \uCC9C\uCC9C\uD788 \uC77D\uB294\uB2E4.",
        structure: "\uD615\uC6A9\uC0AC careful / \uBD80\uC0AC slowly"
      },
      {
        en: "Please update the schedule.",
        ko: "\uC77C\uC815\uC744 \uC5C5\uB370\uC774\uD2B8\uD574 \uC8FC\uC138\uC694.",
        structure: "\uB3D9\uC0AC update"
      },
      {
        en: "We need an update on the schedule.",
        ko: "\uC77C\uC815\uC5D0 \uB300\uD55C \uC5C5\uB370\uC774\uD2B8\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
        structure: "\uBA85\uC0AC update"
      }
    ],
    checks: [
      {
        id: "F-002-Q01",
        skill: "adverb-id",
        question: '\uBB38\uC7A5 "She spoke clearly."\uC5D0\uC11C clearly\uC758 \uD488\uC0AC\uB294?',
        choices: [
          "\uBA85\uC0AC",
          "\uD615\uC6A9\uC0AC",
          "\uBD80\uC0AC",
          "\uC804\uCE58\uC0AC"
        ],
        answer: 2,
        explanation: "clearly\uB294 \uB3D9\uC0AC spoke\uB97C \uC218\uC2DD\uD558\uBBC0\uB85C \uBD80\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q02",
        skill: "adjective-id",
        question: "\uB2E4\uC74C \uC911 \uD615\uC6A9\uC0AC\uAC00 \uC4F0\uC778 \uBB38\uC7A5\uC740?",
        choices: [
          "He runs fast.",
          "They arrived early.",
          "It was a quiet night.",
          "Please speak loudly."
        ],
        answer: 2,
        explanation: "quiet\uB294 \uBA85\uC0AC night\uB97C \uC218\uC2DD\uD558\uB294 \uD615\uC6A9\uC0AC\uC785\uB2C8\uB2E4. \uB098\uBA38\uC9C0\uB294 \uBD80\uC0AC \uC6A9\uBC95\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q03",
        skill: "noun-role",
        question: "\uBA85\uC0AC\uC758 \uC5ED\uD560\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uB3D9\uC791\uC774\uB098 \uC0C1\uD0DC\uB97C \uB098\uD0C0\uB0B8\uB2E4",
          "\uC0AC\uB78C\xB7\uC0AC\uBB3C\xB7\uAC1C\uB150\uC758 \uC774\uB984\uC744 \uB098\uD0C0\uB0B8\uB2E4",
          "\uB3D9\uC0AC\uB97C \uAFB8\uBA70 \uC815\uB3C4\uB97C \uB098\uD0C0\uB0B8\uB2E4",
          "\uBB38\uC7A5\uACFC \uBB38\uC7A5\uC744 \uC5F0\uACB0\uD55C\uB2E4"
        ],
        answer: 1,
        explanation: "\uBA85\uC0AC\uB294 \uC0AC\uB78C, \uC0AC\uBB3C, \uAC1C\uB150\uC758 \uC774\uB984\uC744 \uB098\uD0C0\uB0B4\uB294 \uD488\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q04",
        skill: "adj-vs-adv",
        question: '\uBE48\uCE78: "She feels ___ about the result."',
        choices: [
          "badly",
          "bad",
          "worsely",
          "badness"
        ],
        answer: 1,
        explanation: "feel\uC740 \uC5F0\uACB0\uB3D9\uC0AC\uB77C \uC0C1\uD0DC\uB97C \uB098\uD0C0\uB0B4\uB294 \uD615\uC6A9\uC0AC bad\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q05",
        skill: "function-shift",
        question: '"Light the candle."\uC5D0\uC11C light\uC758 \uD488\uC0AC\uB294?',
        choices: [
          "\uBA85\uC0AC",
          "\uD615\uC6A9\uC0AC",
          "\uB3D9\uC0AC",
          "\uBD80\uC0AC"
        ],
        answer: 2,
        explanation: "\uBA85\uB839\uBB38\uC758 \uC220\uC5B4\uB85C \uC4F0\uC600\uC73C\uBBC0\uB85C \uB3D9\uC0AC\uC785\uB2C8\uB2E4. (\uBA85\uC0AC the light\uC640 \uAD6C\uBD84)"
      },
      {
        id: "F-002-Q06",
        skill: "preposition-id",
        question: "\uB2E4\uC74C \uC911 \uC804\uCE58\uC0AC\uAC00 \uD3EC\uD568\uB41C \uAD6C\uB294?",
        choices: [
          "very quickly",
          "in the morning",
          "and then",
          "so carefully"
        ],
        answer: 1,
        explanation: "in the morning\uC5D0\uC11C in\uC774 \uC804\uCE58\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q07",
        skill: "trap-ly",
        question: "\uB2E4\uC74C \uC911 -ly\uB85C \uB05D\uB098\uC9C0\uB9CC \uD615\uC6A9\uC0AC\uC778 \uAC83\uC740?",
        choices: [
          "slowly",
          "carefully",
          "friendly",
          "quickly"
        ],
        answer: 2,
        explanation: "friendly\uB294 \uD615\uC6A9\uC0AC\uC785\uB2C8\uB2E4. He is friendly. (\uBD80\uC0AC\uCC98\uB7FC \uC4F0\uC774\uBA74 \uC5B4\uC0C9)"
      },
      {
        id: "F-002-Q08",
        skill: "conjunction-id",
        question: "\uC811\uC18D\uC0AC\uC758 \uC8FC\uB41C \uC5ED\uD560\uC740?",
        choices: [
          "\uBA85\uC0AC\uB97C \uAFB8\uBBFC\uB2E4",
          "\uB2E8\uC5B4\xB7\uAD6C\xB7\uC808\uC744 \uC5F0\uACB0\uD55C\uB2E4",
          "\uC2DC\uC81C\uB97C \uBC14\uAFBC\uB2E4",
          "\uC218\uB3D9\uD0DC\uB97C \uB9CC\uB4E0\uB2E4"
        ],
        answer: 1,
        explanation: "\uC811\uC18D\uC0AC\uB294 and, but, because\uCC98\uB7FC \uC694\uC18C\uB97C \uC5F0\uACB0\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q09",
        skill: "application",
        question: '"The weekly report arrived late."\uC5D0\uC11C weekly\uC758 \uD488\uC0AC\uB294?',
        choices: [
          "\uBD80\uC0AC",
          "\uBA85\uC0AC",
          "\uD615\uC6A9\uC0AC",
          "\uC811\uC18D\uC0AC"
        ],
        answer: 2,
        explanation: "weekly\uAC00 \uBA85\uC0AC report\uB97C \uC218\uC2DD\uD558\uBBC0\uB85C \uD615\uC6A9\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-002-Q10",
        skill: "trap-hard",
        question: '"Work hard."\uC640 "a hard decision"\uC5D0\uC11C hard\uC758 \uD488\uC0AC\uB294 \uAC01\uAC01?',
        choices: [
          "\uD615\uC6A9\uC0AC / \uBD80\uC0AC",
          "\uBD80\uC0AC / \uD615\uC6A9\uC0AC",
          "\uB458 \uB2E4 \uBA85\uC0AC",
          "\uB458 \uB2E4 \uC811\uC18D\uC0AC"
        ],
        answer: 1,
        explanation: "Work hard\uC758 hard\uB294 \uBD80\uC0AC, a hard decision\uC758 hard\uB294 \uD615\uC6A9\uC0AC\uC785\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-003.json
  var F_003_default = {
    id: "F-003",
    order: 3,
    title: "\uC8FC\uC5B4\uC640 \uB3D9\uC0AC",
    category: "sentence",
    estimatedMinutes: 12,
    skills: [
      "subject-verb-agreement",
      "head-noun",
      "tricky-subjects"
    ],
    objectives: [
      "\uC8FC\uC5B4\uC758 \uD575(head)\uC744 \uCC3E\uC544 \uB3D9\uC0AC \uC218\uB97C \uB9DE\uCD98\uB2E4",
      "\uBD80\uC815\uB300\uBA85\uC0AC\xB7\uC9D1\uD569\uBA85\uC0AC\xB7there \uAD6C\uBB38\uC758 \uC218\uC77C\uCE58\uB97C \uC775\uD78C\uB2E4",
      "of \uC804\uCE58\uC0AC\uAD6C\uC5D0 \uC18D\uC9C0 \uC54A\uB294 \uBD84\uC11D \uC2B5\uAD00\uC744 \uAE30\uB978\uB2E4"
    ],
    concept: {
      summary: "\uB3D9\uC0AC\uC758 \uB2E8\uC218\xB7\uBCF5\uC218\uB294 \uC8FC\uC5B4\uC758 \uD575\uC5D0 \uB9DE\uCDA5\uB2C8\uB2E4. of \uB4A4\uC758 \uBA85\uC0AC, \uAD00\uACC4\uC808, \uC0BD\uC785\uAD6C\uB294 \uC218\uC2DD\uC77C \uBFD0 \uC8FC\uC5B4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. TEPS \uBB38\uBC95\uC5D0\uC11C\uB3C4 \uC774 \u2018\uD575 \uCC3E\uAE30\u2019\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4.",
      points: [
        "\uB2E8\uC218 \uC8FC\uC5B4 \u2192 \uB2E8\uC218 \uB3D9\uC0AC / \uBCF5\uC218 \uC8FC\uC5B4 \u2192 \uBCF5\uC218 \uB3D9\uC0AC",
        "The list of items is\u2026 \u2192 \uD575\uC740 list",
        "everyone, each, nobody \uB4F1\uC740 \uBCF4\uD1B5 \uB2E8\uC218",
        "a number of + \uBCF5\uC218 = \uBCF5\uC218 / the number of + \uBCF5\uC218 = \uB2E8\uC218"
      ]
    },
    examples: [
      {
        en: "The list of items is on the desk.",
        ko: "\uD56D\uBAA9 \uBAA9\uB85D\uC774 \uCC45\uC0C1 \uC704\uC5D0 \uC788\uB2E4.",
        structure: "\uD575 list(\uB2E8\uC218) \u2192 is"
      },
      {
        en: "Everyone wants a clear answer.",
        ko: "\uB204\uAD6C\uB098 \uBD84\uBA85\uD55C \uB2F5\uC744 \uC6D0\uD55C\uB2E4.",
        structure: "everyone \u2192 \uB2E8\uC218 \uB3D9\uC0AC"
      },
      {
        en: "A number of staff are attending.",
        ko: "\uB2E4\uC218\uC758 \uC9C1\uC6D0\uC774 \uCC38\uC11D\uD55C\uB2E4.",
        structure: "a number of + \uBCF5\uC218 \u2192 are"
      }
    ],
    checks: [
      {
        id: "F-003-Q01",
        skill: "agreement",
        question: '\uBE48\uCE78: "The news ___ surprising."',
        choices: [
          "are",
          "were",
          "is",
          "have been"
        ],
        answer: 2,
        explanation: "news\uB294 \uD615\uD0DC\uB294 \uBCF5\uC218\uCC98\uB7FC \uBCF4\uC5EC\uB3C4 \uB2E8\uC218 \uCDE8\uAE09\uC774\uBBC0\uB85C is\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q02",
        skill: "agreement",
        question: "\uB2E4\uC74C \uC911 \uC218\uC77C\uCE58\uAC00 \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "The results of the test is ready.",
          "Each of the students have a book.",
          "There are two options left.",
          "Nobody know the answer."
        ],
        answer: 2,
        explanation: "there are + \uBCF5\uC218(options)\uAC00 \uC62C\uBC14\uB985\uB2C8\uB2E4. \uB098\uBA38\uC9C0\uB294 \uC8FC\uC5B4 \uD575\xB7\uBD80\uC815\uB300\uBA85\uC0AC \uC218\uC77C\uCE58 \uC624\uB958\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q03",
        skill: "a-number-of",
        question: '"A number of people ___ waiting."\uC5D0 \uC54C\uB9DE\uC740 \uB3D9\uC0AC\uB294?',
        choices: [
          "is",
          "was",
          "has been",
          "are"
        ],
        answer: 3,
        explanation: "a number of + \uBCF5\uC218\uBA85\uC0AC\uB294 \u2018\uB2E4\uC218\uC758 ~\u2019\uB85C \uBCF5\uC218 \uCDE8\uAE09\uD558\uC5EC are\uB97C \uC501\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q04",
        skill: "the-number-of",
        question: '"The number of applicants ___ increased."',
        choices: [
          "have",
          "are",
          "has",
          "were"
        ],
        answer: 2,
        explanation: "the number of\uB294 \u2018~\uC758 \uC218\u2019\uB85C \uB2E8\uC218 \uCDE8\uAE09\uD558\uBBC0\uB85C has\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q05",
        skill: "head-noun",
        question: '"One of the managers ___ overseas."',
        choices: [
          "work",
          "are working",
          "works",
          "have worked"
        ],
        answer: 2,
        explanation: "\uC8FC\uC5B4\uC758 \uD575\uC740 One(\uB2E8\uC218)\uC774\uBBC0\uB85C works\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q06",
        skill: "collective",
        question: '\uD300\uC774 \uAD6C\uC131\uC6D0 \uAC1C\uAC1C\uC778\uC744 \uAC15\uC870\uD560 \uB54C: "The team ___ arguing among themselves."',
        choices: [
          "is",
          "was",
          "are",
          "has"
        ],
        answer: 2,
        explanation: "\uAD6C\uC131\uC6D0\uC758 \uAC1C\uBCC4 \uD589\uB3D9\uC744 \uB9D0\uD560 \uB54C\uB294 \uBCF5\uC218\uAC00 \uD754\uD569\uB2C8\uB2E4. among themselves\uC640 \uD638\uC751\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q07",
        skill: "neither",
        question: '"Neither of the proposals ___ acceptable."',
        choices: [
          "are",
          "were",
          "have been",
          "is"
        ],
        answer: 3,
        explanation: "neither of + \uBCF5\uC218\uBA85\uC0AC\uB3C4 \uBCF4\uD1B5 \uB2E8\uC218 \uB3D9\uC0AC\uB97C \uC501\uB2C8\uB2E4."
      },
      {
        id: "F-003-Q08",
        skill: "there-be",
        question: '"There ___ several issues to discuss."',
        choices: [
          "is",
          "was",
          "has",
          "are"
        ],
        answer: 3,
        explanation: "there \uAD6C\uBB38\uC740 \uB4A4\uB530\uB974\uB294 \uBA85\uC0AC\uC758 \uC218\uC5D0 \uB9DE\uCDA5\uB2C8\uB2E4. several issues \u2192 are."
      },
      {
        id: "F-003-Q09",
        skill: "trap-along-with",
        question: '"The CEO, along with the directors, ___ arrived."',
        choices: [
          "have",
          "are",
          "has",
          "were"
        ],
        answer: 2,
        explanation: "along with \uAD6C\uB294 \uC0BD\uC785 \uC218\uC2DD\uC785\uB2C8\uB2E4. \uC8FC\uC5B4 \uD575\uC740 The CEO(\uB2E8\uC218) \u2192 has."
      },
      {
        id: "F-003-Q10",
        skill: "application",
        question: "\uC218\uC77C\uCE58 \uC624\uB958\uB97C \uACE0\uB974\uC138\uC694.",
        choices: [
          "Each employee has a badge.",
          "The data are incomplete. (\uD559\uC220 \uB9E5\uB77D)",
          "Everybody know the deadline.",
          "Many of the files are missing."
        ],
        answer: 2,
        explanation: "everybody\uB294 \uB2E8\uC218\uC774\uBBC0\uB85C knows\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4. Everybody know\uB294 \uC624\uB958\uC785\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-004.json
  var F_004_default = {
    id: "F-004",
    order: 4,
    title: "\uBAA9\uC801\uC5B4\uC640 \uBCF4\uC5B4",
    category: "sentence",
    estimatedMinutes: 12,
    skills: [
      "object-vs-complement",
      "direct-indirect-object",
      "object-complement"
    ],
    objectives: [
      "\uBAA9\uC801\uC5B4\uC640 \uBCF4\uC5B4\uC758 \uCC28\uC774\uB97C \uBA85\uD655\uD788 \uAD6C\uBD84\uD55C\uB2E4",
      "\uAC04\uC811\uBAA9\uC801\uC5B4\xB7\uC9C1\uC811\uBAA9\uC801\uC5B4 \uD328\uD134\uC744 \uC775\uD78C\uB2E4",
      "\uBAA9\uC801\uBCF4\uC5B4\uAC00 \uD544\uC694\uD55C \uB3D9\uC0AC\uB97C \uBB38\uB9E5\uC5D0\uC11C \uCC3E\uB294\uB2E4"
    ],
    concept: {
      summary: "\uBAA9\uC801\uC5B4\uB294 \uB3D9\uC791\uC758 \uB300\uC0C1\uC774\uACE0, \uBCF4\uC5B4\uB294 \uC8FC\uC5B4\uB098 \uBAA9\uC801\uC5B4\uC758 \uC0C1\uD0DC\xB7\uC2E0\uBD84\uC744 \uBCF4\uC644\uD569\uB2C8\uB2E4. make/keep/find/consider \uB4A4\uC5D0\uB294 \uBAA9\uC801\uBCF4\uC5B4\uAC00 \uC790\uC8FC \uC624\uBA70, \uC774 \uAD6C\uBD84\uC744 \uB193\uCE58\uBA74 \uBE48\uCE78\uC774 \uAF2C\uC785\uB2C8\uB2E4.",
      points: [
        "\uBAA9\uC801\uC5B4: \uD589\uC704\uC758 \uB300\uC0C1 (I wrote a memo.)",
        "\uC8FC\uACA9\uBCF4\uC5B4: \uC8FC\uC5B4 \uC124\uBA85 (She is capable.)",
        "\uBAA9\uC801\uBCF4\uC5B4: \uBAA9\uC801\uC5B4 \uC124\uBA85 (They made him leader.)",
        "IO+DO: give/send/show/tell me the result"
      ]
    },
    examples: [
      {
        en: "I finished the proposal.",
        ko: "\uB098\uB294 \uC81C\uC548\uC11C\uB97C \uB05D\uB0C8\uB2E4.",
        structure: "O = the proposal"
      },
      {
        en: "The result seems fair.",
        ko: "\uACB0\uACFC\uAC00 \uACF5\uC815\uD574 \uBCF4\uC778\uB2E4.",
        structure: "C = fair"
      },
      {
        en: "They appointed her manager.",
        ko: "\uADF8\uB4E4\uC740 \uADF8\uB140\uB97C \uB9E4\uB2C8\uC800\uB85C \uC784\uBA85\uD588\uB2E4.",
        structure: "O + C"
      }
    ],
    checks: [
      {
        id: "F-004-Q01",
        skill: "object-id",
        question: '"We discussed the budget."\uC5D0\uC11C the budget\uC758 \uC131\uBD84\uC740?',
        choices: [
          "\uC8FC\uC5B4",
          "\uBCF4\uC5B4",
          "\uBAA9\uC801\uC5B4",
          "\uBD80\uC0AC"
        ],
        answer: 2,
        explanation: "discuss\uC758 \uD589\uC704 \uB300\uC0C1\uC774\uBBC0\uB85C \uBAA9\uC801\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q02",
        skill: "complement-id",
        question: '"The meeting remained productive."\uC5D0\uC11C productive\uC758 \uC131\uBD84\uC740?',
        choices: [
          "\uBAA9\uC801\uC5B4",
          "\uC8FC\uACA9\uBCF4\uC5B4",
          "\uAC04\uC811\uBAA9\uC801\uC5B4",
          "\uC804\uCE58\uC0AC"
        ],
        answer: 1,
        explanation: "remain\uC740 \uC5F0\uACB0\uB3D9\uC0AC\uC774\uACE0 productive\uAC00 \uC8FC\uC5B4\uB97C \uC124\uBA85\uD558\uB294 \uC8FC\uACA9\uBCF4\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q03",
        skill: "io-do",
        question: '"Please show the client the prototype."\uC5D0\uC11C the client\uB294?',
        choices: [
          "\uC9C1\uC811\uBAA9\uC801\uC5B4",
          "\uAC04\uC811\uBAA9\uC801\uC5B4",
          "\uC8FC\uACA9\uBCF4\uC5B4",
          "\uBAA9\uC801\uBCF4\uC5B4"
        ],
        answer: 1,
        explanation: "show IO DO \uD328\uD134\uC5D0\uC11C the client\uB294 \uAC04\uC811\uBAA9\uC801\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q04",
        skill: "object-complement",
        question: "\uB2E4\uC74C \uC911 \uBAA9\uC801\uBCF4\uC5B4\uAC00 \uC788\uB294 \uBB38\uC7A5\uC740?",
        choices: [
          "I bought a laptop.",
          "She became quiet.",
          "We found the report useful.",
          "They arrived late."
        ],
        answer: 2,
        explanation: "found + \uBAA9\uC801\uC5B4(the report) + \uBAA9\uC801\uBCF4\uC5B4(useful) \uAD6C\uC870\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q05",
        skill: "trap-linking",
        question: "\uBAA9\uC801\uC5B4\uAC00 \uD544\uC694 \uC5C6\uB294 \uB3D9\uC0AC\uB294?",
        choices: [
          "need",
          "build",
          "seem",
          "prefer"
        ],
        answer: 2,
        explanation: "seem\uC740 \uC5F0\uACB0\uB3D9\uC0AC\uB77C \uBCF4\uC5B4\uB97C \uCDE8\uD558\uACE0, \uBAA9\uC801\uC5B4\uB97C \uC694\uAD6C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q06",
        skill: "rewrite",
        question: '"Give the keys to me."\uC640 \uAC19\uC740 \uB73B\uC758 \uB9D0\uC21C\uC11C\uB294?',
        choices: [
          "Give to me the keys.",
          "Give me the keys.",
          "Give the me keys.",
          "Give keys me the."
        ],
        answer: 1,
        explanation: "Give me the keys = Give the keys to me."
      },
      {
        id: "F-004-Q07",
        skill: "application",
        question: '\uBE48\uCE78: "The board considers the plan ___ ."',
        choices: [
          "feasibly",
          "feasible",
          "feasibility",
          "to feasible"
        ],
        answer: 1,
        explanation: "consider + O + \uD615\uC6A9\uC0AC(\uBAA9\uC801\uBCF4\uC5B4). feasible\uC774 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q08",
        skill: "object-spot",
        question: '\uBAA9\uC801\uC5B4\uB97C \uACE0\uB974\uC138\uC694: "After lunch, the committee approved the amendment."',
        choices: [
          "After lunch",
          "the committee",
          "approved",
          "the amendment"
        ],
        answer: 3,
        explanation: "approved\uC758 \uB300\uC0C1\uC778 the amendment\uAC00 \uBAA9\uC801\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q09",
        skill: "trap-call",
        question: '"They called the project a success."\uC5D0\uC11C a success\uB294?',
        choices: [
          "\uC9C1\uC811\uBAA9\uC801\uC5B4",
          "\uAC04\uC811\uBAA9\uC801\uC5B4",
          "\uBAA9\uC801\uBCF4\uC5B4",
          "\uC8FC\uC5B4"
        ],
        answer: 2,
        explanation: "call O C \uD328\uD134\uC5D0\uC11C a success\uB294 \uBAA9\uC801\uBCF4\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-004-Q10",
        skill: "concept",
        question: "\uBCF4\uC5B4\uC640 \uBAA9\uC801\uC5B4\uC758 \uD575\uC2EC \uCC28\uC774\uB294?",
        choices: [
          "\uBCF4\uC5B4\uB294 \uD56D\uC0C1 \uBD80\uC0AC\uB2E4",
          "\uBAA9\uC801\uC5B4\uB294 \uB300\uC0C1\uC744, \uBCF4\uC5B4\uB294 \uC0C1\uD0DC\xB7\uC2E0\uBD84\uC744 \uBCF4\uC644\uD55C\uB2E4",
          "\uB458\uC740 \uD56D\uC0C1 \uAC19\uB2E4",
          "\uBCF4\uC5B4\uB294 \uC804\uCE58\uC0AC \uB4A4\uC5D0\uB9CC \uC628\uB2E4"
        ],
        answer: 1,
        explanation: "\uBAA9\uC801\uC5B4\uB294 \uD589\uC704 \uB300\uC0C1, \uBCF4\uC5B4\uB294 \uC8FC\uC5B4/\uBAA9\uC801\uC5B4\uB97C \uC124\uBA85\xB7\uBCF4\uC644\uD569\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-005.json
  var F_005_default = {
    id: "F-005",
    order: 5,
    title: "\uC2DC\uC81C",
    category: "grammar",
    estimatedMinutes: 15,
    skills: [
      "tense-choice",
      "present-perfect",
      "past-vs-perfect"
    ],
    objectives: [
      "\uD604\uC7AC\xB7\uACFC\uAC70\xB7\uD604\uC7AC\uC644\uB8CC\uC758 \uC4F0\uC784 \uCC28\uC774\uB97C \uC815\uB9AC\uD55C\uB2E4",
      "\uC2DC\uAC04 \uD45C\uD604\uACFC \uC5B4\uC6B8\uB9AC\uB294 \uC2DC\uC81C\uB97C \uACE0\uB978\uB2E4",
      "\uC644\uB8CC\uC2DC\uC81C\uC640 \uB2E8\uC21C\uC2DC\uC81C \uD568\uC815\uC744 \uAD6C\uBD84\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uC2DC\uC81C\uB294 \u2018\uC5B8\uC81C\u2019\uBFD0 \uC544\uB2C8\uB77C \u2018\uD604\uC7AC\uC640\uC758 \uC5F0\uACB0\u2019\uC744 \uB098\uD0C0\uB0C5\uB2C8\uB2E4. \uB2E8\uC21C\uACFC\uAC70\uB294 \uB05D\uB09C \uC2DC\uC810, \uD604\uC7AC\uC644\uB8CC\uB294 \uACBD\uD5D8\xB7\uACB0\uACFC\xB7\uACC4\uC18D\uCC98\uB7FC \uD604\uC7AC\uC640 \uC774\uC5B4\uC9C4 \uC0C1\uD669\uC5D0 \uC4F0\uC785\uB2C8\uB2E4. \uC2DC\uAC04 \uBD80\uC0AC(ago, since, yet)\uC640 \uD568\uAED8 \uBCF4\uBA74 \uC120\uD0DD\uC774 \uC26C\uC6CC\uC9D1\uB2C8\uB2E4.",
      points: [
        "\uB2E8\uC21C\uD604\uC7AC: \uC2B5\uAD00\xB7\uC0AC\uC2E4 / \uD604\uC7AC\uC9C4\uD589: \uC9C0\uAE08 \uC9C4\uD589",
        "\uB2E8\uC21C\uACFC\uAC70: \uACFC\uAC70 \uD2B9\uC815 \uC2DC\uC810\uC758 \uC644\uB8CC (yesterday, in 2019)",
        "\uD604\uC7AC\uC644\uB8CC: \uACBD\uD5D8\xB7\uACB0\uACFC\xB7\uACC4\uC18D (already, yet, since, for)",
        "\uACFC\uAC70\uC644\uB8CC: \uACFC\uAC70\uBCF4\uB2E4 \uB354 \uC774\uC804\uC758 \uC0AC\uAC74 (by then, before\u2026)"
      ]
    },
    examples: [
      {
        en: "She submits reports every Friday.",
        ko: "\uADF8\uB140\uB294 \uB9E4\uC8FC \uAE08\uC694\uC77C\uC5D0 \uBCF4\uACE0\uC11C\uB97C \uC81C\uCD9C\uD55C\uB2E4.",
        structure: "\uB2E8\uC21C\uD604\uC7AC(\uC2B5\uAD00)"
      },
      {
        en: "They launched the app last month.",
        ko: "\uADF8\uB4E4\uC740 \uC9C0\uB09C\uB2EC\uC5D0 \uC571\uC744 \uCD9C\uC2DC\uD588\uB2E4.",
        structure: "\uB2E8\uC21C\uACFC\uAC70"
      },
      {
        en: "I have already sent the invoice.",
        ko: "\uB098\uB294 \uC774\uBBF8 \uCCAD\uAD6C\uC11C\uB97C \uBCF4\uB0C8\uB2E4.",
        structure: "\uD604\uC7AC\uC644\uB8CC(\uACB0\uACFC)"
      }
    ],
    checks: [
      {
        id: "F-005-Q01",
        skill: "simple-past",
        question: '\uBE48\uCE78: "We ___ the contract yesterday."',
        choices: [
          "have signed",
          "signed",
          "had been signing",
          "sign"
        ],
        answer: 1,
        explanation: "yesterday\uB294 \uD2B9\uC815 \uACFC\uAC70 \uC2DC\uC810\uC774\uBBC0\uB85C \uB2E8\uC21C\uACFC\uAC70 signed\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q02",
        skill: "present-perfect",
        question: '\uBE48\uCE78: "She ___ here since 2020."',
        choices: [
          "works",
          "worked",
          "has worked",
          "had work"
        ],
        answer: 2,
        explanation: "since + \uC2DC\uC810\uACFC \uD568\uAED8 \uD604\uC7AC\uAE4C\uC9C0\uC758 \uACC4\uC18D\uC740 \uD604\uC7AC\uC644\uB8CC\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q03",
        skill: "trap-ago",
        question: "ago\uC640 \uD568\uAED8 \uC4F0\uAE30 \uC801\uC808\uD55C \uC2DC\uC81C\uB294?",
        choices: [
          "\uD604\uC7AC\uC644\uB8CC",
          "\uB2E8\uC21C\uACFC\uAC70",
          "\uD604\uC7AC\uC9C4\uD589",
          "\uBBF8\uB798\uC644\uB8CC\uB9CC"
        ],
        answer: 1,
        explanation: "ago\uB294 \uB2E8\uC21C\uACFC\uAC70\uC640 \uD568\uAED8 \uC501\uB2C8\uB2E4. (three days ago \u2192 left)"
      },
      {
        id: "F-005-Q04",
        skill: "present-simple",
        question: '"Water ___ at 100\xB0C."',
        choices: [
          "is boiling",
          "boiled",
          "boils",
          "has boiled"
        ],
        answer: 2,
        explanation: "\uACFC\uD559\uC801 \uC0AC\uC2E4\uC740 \uB2E8\uC21C\uD604\uC7AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q05",
        skill: "past-perfect",
        question: '"By the time we arrived, the meeting ___ ."',
        choices: [
          "starts",
          "has started",
          "had started",
          "is starting"
        ],
        answer: 2,
        explanation: "\uB3C4\uCC29(\uACFC\uAC70)\uBCF4\uB2E4 \uC774\uC804 \uC644\uB8CC\uC774\uBBC0\uB85C \uACFC\uAC70\uC644\uB8CC had started\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q06",
        skill: "yet-already",
        question: '"Have you finished the draft ___ ?"',
        choices: [
          "ago",
          "yesterday",
          "yet",
          "last week"
        ],
        answer: 2,
        explanation: "\uC758\uBB38\xB7\uBD80\uC815\uC758 \uD604\uC7AC\uC644\uB8CC\uC5D0\uC11C yet\uC774 \uD754\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q07",
        skill: "application",
        question: "\uB2E4\uC74C \uC911 \uC2DC\uC81C \uC120\uD0DD\uC774 \uC5B4\uC0C9\uD55C \uBB38\uC7A5\uC740?",
        choices: [
          "I saw him two hours ago.",
          "I have seen him two hours ago.",
          "I have seen him twice.",
          "I saw him yesterday."
        ],
        answer: 1,
        explanation: "ago\uC640 \uD604\uC7AC\uC644\uB8CC\uB294 \uD568\uAED8 \uC4F0\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q08",
        skill: "progressive",
        question: '"Please be quiet. The baby ___ ."',
        choices: [
          "sleeps",
          "slept",
          "is sleeping",
          "has sleep"
        ],
        answer: 2,
        explanation: "\uC9C0\uAE08 \uC9C4\uD589 \uC911\uC778 \uC0C1\uD669\uC740 \uD604\uC7AC\uC9C4\uD589 is sleeping\uC774 \uC801\uD569\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q09",
        skill: "for-since",
        question: '"They have lived abroad ___ five years."',
        choices: [
          "since",
          "for",
          "ago",
          "during"
        ],
        answer: 1,
        explanation: "\uAE30\uAC04(five years)\uC5D0\uB294 for\uB97C \uC501\uB2C8\uB2E4. since\uB294 \uC2DC\uC791\uC810\uACFC \uD568\uAED8\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-005-Q10",
        skill: "concept",
        question: "\uD604\uC7AC\uC644\uB8CC\uC758 \uD575\uC2EC \uAC10\uAC01\uC73C\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uACFC\uAC70 \uD2B9\uC815 \uB0A0\uC9DC\uB9CC \uAC15\uC870",
          "\uD604\uC7AC\uC640 \uC5F0\uACB0\uB41C \uACBD\uD5D8\xB7\uACB0\uACFC\xB7\uACC4\uC18D",
          "\uD56D\uC0C1 \uBBF8\uB798 \uC758\uBBF8",
          "\uC218\uB3D9\uD0DC\uC640 \uB3D9\uC758\uC5B4"
        ],
        answer: 1,
        explanation: "\uD604\uC7AC\uC644\uB8CC\uB294 \uACFC\uAC70 \uC0AC\uAC74\uC774 \uD604\uC7AC\uC5D0 \uBBF8\uCE58\uB294 \uC5F0\uACB0\uC744 \uB098\uD0C0\uB0C5\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-006.json
  var F_006_default = {
    id: "F-006",
    order: 6,
    title: "\uC870\uB3D9\uC0AC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "modals",
      "ability-permission",
      "deduction-obligation"
    ],
    objectives: [
      "\uAC00\uB2A5\xB7\uD5C8\uAC00\xB7\uC758\uBB34\xB7\uCD94\uCE21 \uC870\uB3D9\uC0AC\uC758 \uAE30\uBCF8 \uC758\uBBF8\uB97C \uAD6C\uBD84\uD55C\uB2E4",
      "must / have to / should\uC758 \uB258\uC559\uC2A4 \uCC28\uC774\uB97C \uC775\uD78C\uB2E4",
      "\uC870\uB3D9\uC0AC + \uC6D0\uD615\uB3D9\uC0AC \uD615\uD0DC\uB97C \uC815\uD655\uD788 \uACE0\uB978\uB2E4"
    ],
    concept: {
      summary: "\uC870\uB3D9\uC0AC\uB294 \uBCF8\uB3D9\uC0AC \uC55E\uC5D0 \uBD99\uC5B4 \uAC00\uB2A5\xB7\uC758\uBB34\xB7\uD5C8\uAC00\xB7\uCD94\uCE21 \uB4F1\uC758 \uD0DC\uB3C4\uB97C \uB354\uD569\uB2C8\uB2E4. \uD615\uD0DC\uB294 \uC870\uB3D9\uC0AC + \uB3D9\uC0AC\uC6D0\uD615\uC774 \uAE30\uBCF8\uC774\uBA70, \uC758\uBBF8 \uCC28\uC774\uB97C \uBAA8\uB974\uBA74 \uBE44\uC2B7\uD55C \uC120\uD0DD\uC9C0\uAC00 \uC804\uBD80 \uB9DE\uC544 \uBCF4\uC785\uB2C8\uB2E4.",
      points: [
        "can/could: \uB2A5\uB825\xB7\uAC00\uB2A5\xB7\uD5C8\uAC00 / may/might: \uD5C8\uAC00\xB7\uC57D\uD55C \uCD94\uCE21",
        "must: \uAC15\uD55C \uC758\uBB34\xB7\uAC15\uD55C \uCD94\uCE21 / have to: \uC678\uBD80 \uC758\uBB34",
        "should/ought to: \uAD8C\uACE0\xB7\uB2F9\uC5F0",
        "will/would: \uBBF8\uB798\xB7\uC758\uC9C0\xB7\uC815\uC911\uD55C \uC694\uCCAD"
      ]
    },
    examples: [
      {
        en: "You must wear a badge in the lab.",
        ko: "\uC2E4\uD5D8\uC2E4\uC5D0\uC11C\uB294 \uBC30\uC9C0\uB97C \uBC18\uB4DC\uC2DC \uCC29\uC6A9\uD574\uC57C \uD55C\uB2E4.",
        structure: "must + \uC6D0\uD615"
      },
      {
        en: "She can handle complex data.",
        ko: "\uADF8\uB140\uB294 \uBCF5\uC7A1\uD55C \uB370\uC774\uD130\uB97C \uB2E4\uB8F0 \uC218 \uC788\uB2E4.",
        structure: "can = \uB2A5\uB825"
      },
      {
        en: "He might be in a meeting.",
        ko: "\uADF8\uB294 \uD68C\uC758 \uC911\uC77C\uC9C0\uB3C4 \uBAA8\uB978\uB2E4.",
        structure: "might = \uCD94\uCE21"
      }
    ],
    checks: [
      {
        id: "F-006-Q01",
        skill: "form",
        question: '\uBE48\uCE78: "Employees ___ arrive by 9." (\uAC15\uD55C \uC0AC\uB0B4 \uADDC\uC815)',
        choices: [
          "must to",
          "must",
          "musts",
          "musting"
        ],
        answer: 1,
        explanation: "\uC870\uB3D9\uC0AC must \uB4A4\uC5D0\uB294 \uB3D9\uC0AC\uC6D0\uD615\uC785\uB2C8\uB2E4. must arrive."
      },
      {
        id: "F-006-Q02",
        skill: "ability",
        question: "\uB2A5\uB825\xB7\uAC00\uB2A5\uC744 \uB098\uD0C0\uB0B4\uB294 \uC870\uB3D9\uC0AC\uB294?",
        choices: [
          "must",
          "should",
          "can",
          "ought"
        ],
        answer: 2,
        explanation: "can\uC740 \uB2A5\uB825\xB7\uAC00\uB2A5\uC131\uC744 \uB098\uD0C0\uB0C5\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q03",
        skill: "advice",
        question: '"You ___ check the numbers again." (\uAD8C\uACE0)',
        choices: [
          "must to",
          "should",
          "can to",
          "may to"
        ],
        answer: 1,
        explanation: "\uAD8C\uACE0\uC5D0\uB294 should\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q04",
        skill: "deduction",
        question: '"The lights are on. Someone ___ be inside." (\uAC15\uD55C \uCD94\uCE21)',
        choices: [
          "can",
          "must",
          "should",
          "might not"
        ],
        answer: 1,
        explanation: "\uAC15\uD55C \uB17C\uB9AC\uC801 \uCD94\uCE21\uC5D0\uB294 must be\uAC00 \uD754\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q05",
        skill: "permission",
        question: "\uC815\uC911\uD788 \uD5C8\uAC00\uB97C \uBB3C\uC744 \uB54C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "Must I borrow your pen?",
          "May I borrow your pen?",
          "Should I borrow must?",
          "Will must I borrow?"
        ],
        answer: 1,
        explanation: "May I\u2026?\uB294 \uC815\uC911\uD55C \uD5C8\uAC00 \uC694\uCCAD\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q06",
        skill: "trap-form",
        question: "\uBB38\uBC95\uC801\uC73C\uB85C \uD2C0\uB9B0 \uAC83\uC740?",
        choices: [
          "She can finish early.",
          "He must leave now.",
          "They should to call.",
          "We might delay."
        ],
        answer: 2,
        explanation: "should \uB4A4\uC5D0\uB294 to \uC5C6\uC774 \uC6D0\uD615\uC785\uB2C8\uB2E4. should call\uC774 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q07",
        skill: "have-to",
        question: `"I ___ leave early today\u2014there's a train to catch." (\uC0C1\uD669\uC0C1 \uC758\uBB34)`,
        choices: [
          "can",
          "might",
          "have to",
          "shall maybe"
        ],
        answer: 2,
        explanation: "\uC678\uBD80 \uC0C1\uD669\xB7\uC77C\uC815\uC5D0 \uB530\uB978 \uC758\uBB34\uB294 have to\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q08",
        skill: "negative-deduction",
        question: '"He ___ be the manager; he looks too young." (\uAC15\uD55C \uBD80\uC815 \uCD94\uCE21)',
        choices: [
          "must",
          "can't",
          "should",
          "will"
        ],
        answer: 1,
        explanation: "\uAC15\uD55C \u2018~\uC77C \uB9AC\uAC00 \uC5C6\uB2E4\u2019\uB294 can't be\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q09",
        skill: "past-ability",
        question: '"When I was intern, I ___ stay late without overtime."',
        choices: [
          "can",
          "could",
          "must",
          "should to"
        ],
        answer: 1,
        explanation: "\uACFC\uAC70\uC758 \uB2A5\uB825\xB7\uAC00\uB2A5\uC740 could\uB85C \uB098\uD0C0\uB0C5\uB2C8\uB2E4."
      },
      {
        id: "F-006-Q10",
        skill: "application",
        question: "\uC758\uBB34\uAC00 \uAC00\uC7A5 \uAC15\uD55C \uD45C\uD604\uC740?",
        choices: [
          "You might submit it.",
          "You could submit it.",
          "You must submit it.",
          "You may submit it."
        ],
        answer: 2,
        explanation: "must\uB294 \uAC15\uD55C \uC758\uBB34\uB97C \uB098\uD0C0\uB0C5\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-007.json
  var F_007_default = {
    id: "F-007",
    order: 7,
    title: "\uC218\uB3D9\uD0DC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "passive-voice",
      "be-pp",
      "agent-by"
    ],
    objectives: [
      "\uB2A5\uB3D9\u2194\uC218\uB3D9 \uC804\uD658\uC758 \uAE30\uBCF8 \uC6D0\uB9AC\uB97C \uC774\uD574\uD55C\uB2E4",
      "\uC2DC\uC81C\uC5D0 \uB9DE\uB294 be + \uACFC\uAC70\uBD84\uC0AC \uD615\uD0DC\uB97C \uACE0\uB978\uB2E4",
      "\uD589\uC704\uC790(by\u2026)\uB97C \uC0DD\uB7B5\uD558\uB294 \uC2E4\uC6A9\uC801 \uD310\uB2E8\uC744 \uC775\uD78C\uB2E4"
    ],
    concept: {
      summary: "\uC218\uB3D9\uD0DC\uB294 \uD589\uC704\uC758 \uB300\uC0C1\uC774 \uC8FC\uC5B4\uAC00 \uB420 \uB54C \uC501\uB2C8\uB2E4. \uD615\uD0DC\uB294 be + \uACFC\uAC70\uBD84\uC0AC(p.p.)\uC774\uBA70, \uC2DC\uC81C\xB7\uC870\uB3D9\uC0AC\uC5D0 \uB530\uB77C be\uC758 \uD615\uD0DC\uAC00 \uBC14\uB01D\uB2C8\uB2E4. \uBCF4\uACE0\uC11C\xB7\uB274\uC2A4\uCC98\uB7FC \uD589\uC704\uC790\uBCF4\uB2E4 \uACB0\uACFC\uAC00 \uC911\uC694\uD560 \uB54C \uC790\uC8FC \uB4F1\uC7A5\uD569\uB2C8\uB2E4.",
      points: [
        "\uB2A5\uB3D9: They reviewed the plan. \u2192 \uC218\uB3D9: The plan was reviewed.",
        "\uD604\uC7AC: is/are + p.p. / \uACFC\uAC70: was/were + p.p.",
        "\uD604\uC7AC\uC644\uB8CC: has/have been + p.p.",
        "\uC870\uB3D9\uC0AC: must be completed / can be fixed"
      ]
    },
    examples: [
      {
        en: "The email was sent yesterday.",
        ko: "\uADF8 \uC774\uBA54\uC77C\uC740 \uC5B4\uC81C \uBCF4\uB0B4\uC84C\uB2E4.",
        structure: "was + sent"
      },
      {
        en: "The issue has been resolved.",
        ko: "\uADF8 \uBB38\uC81C\uB294 \uD574\uACB0\uB418\uC5C8\uB2E4.",
        structure: "has been + resolved"
      },
      {
        en: "This form must be signed.",
        ko: "\uC774 \uC591\uC2DD\uC740 \uC11C\uBA85\uB418\uC5B4\uC57C \uD55C\uB2E4.",
        structure: "must be + signed"
      }
    ],
    checks: [
      {
        id: "F-007-Q01",
        skill: "form",
        question: '\uBE48\uCE78: "The report ___ yesterday."',
        choices: [
          "is submitting",
          "was submitted",
          "submitted was",
          "has submit"
        ],
        answer: 1,
        explanation: "\uACFC\uAC70 \uC218\uB3D9\uC740 was/were + p.p. \u2192 was submitted."
      },
      {
        id: "F-007-Q02",
        skill: "transform",
        question: '"Someone locked the door."\uC758 \uC218\uB3D9\uD0DC\uB294?',
        choices: [
          "The door locked someone.",
          "The door was locked.",
          "The door is locking.",
          "Someone was locked the door."
        ],
        answer: 1,
        explanation: "\uBAA9\uC801\uC5B4 the door\uAC00 \uC8FC\uC5B4\uAC00 \uB418\uACE0 was locked\uAC00 \uB429\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q03",
        skill: "perfect-passive",
        question: '"The files ___ already."',
        choices: [
          "have uploaded",
          "have been uploaded",
          "are upload",
          "were uploading by"
        ],
        answer: 1,
        explanation: "\uD604\uC7AC\uC644\uB8CC \uC218\uB3D9\uC740 have/has been + p.p.\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q04",
        skill: "modal-passive",
        question: '"The bug ___ immediately."',
        choices: [
          "must fix",
          "must be fixed",
          "must fixed",
          "must been fix"
        ],
        answer: 1,
        explanation: "\uC870\uB3D9\uC0AC \uC218\uB3D9\uC740 modal + be + p.p.\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q05",
        skill: "agent",
        question: "\uD589\uC704\uC790\uB97C \uB098\uD0C0\uB0BC \uB54C \uC4F0\uB294 \uC804\uCE58\uC0AC\uB294?",
        choices: [
          "to",
          "for",
          "by",
          "at"
        ],
        answer: 2,
        explanation: "\uD589\uC704\uC790\uB294 by + agent\uB85C \uB098\uD0C0\uB0C5\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q06",
        skill: "trap-intransitive",
        question: "\uC218\uB3D9\uD0DC\uB85C \uB9CC\uB4E4\uAE30 \uC5B4\uB824\uC6B4 \uBB38\uC7A5\uC740?",
        choices: [
          "They built a bridge.",
          "She wrote a memo.",
          "He arrived at noon.",
          "We published the paper."
        ],
        answer: 2,
        explanation: "arrive\uB294 \uBAA9\uC801\uC5B4\uAC00 \uC5C6\uB294 \uC790\uB3D9\uC0AC\uB77C \uC77C\uBC18 \uC218\uB3D9 \uC804\uD658\uC774 \uC5B4\uB835\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q07",
        skill: "continuous-passive",
        question: '"The system ___ right now."',
        choices: [
          "is updating",
          "is being updated",
          "has update",
          "was update"
        ],
        answer: 1,
        explanation: "\uC9C4\uD589 \uC218\uB3D9\uC740 be being + p.p. \u2192 is being updated."
      },
      {
        id: "F-007-Q08",
        skill: "application",
        question: "\uC218\uB3D9\uC774 \uB354 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC0C1\uD669\uC740?",
        choices: [
          "\uB0B4\uAC00 \uCEE4\uD53C\uB97C \uB9C8\uC2E0 \uC0AC\uC2E4\uC744 \uAC15\uC870\uD560 \uB54C",
          "\uB204\uAC00 \uD588\uB294\uC9C0\uBCF4\uB2E4 \uACB0\uACFC\xB7\uB300\uC0C1\uC774 \uC911\uC694\uD560 \uB54C",
          "\uD56D\uC0C1 \uB2A5\uB3D9\uB9CC \uAC00\uB2A5",
          "\uC870\uB3D9\uC0AC\uAC00 \uC5C6\uC744 \uB54C\uB9CC"
        ],
        answer: 1,
        explanation: "\uD589\uC704\uC790\uBCF4\uB2E4 \uB300\uC0C1\xB7\uACB0\uACFC\uAC00 \uC911\uC694\uD558\uBA74 \uC218\uB3D9\uC774 \uD754\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q09",
        skill: "get-passive",
        question: "\uAD6C\uC5B4\uCCB4\uC5D0\uC11C be \uB300\uC2E0 \uC790\uC8FC \uC4F0\uC774\uB294 \uC218\uB3D9 \uD45C\uD604\uC740?",
        choices: [
          "do + p.p.",
          "get + p.p.",
          "make + \uC6D0\uD615\uB9CC",
          "have + \uC6D0\uD615\uB9CC"
        ],
        answer: 1,
        explanation: "get paid, get damaged\uCC98\uB7FC get + p.p. \uC218\uB3D9\uC774 \uC788\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-007-Q10",
        skill: "error",
        question: "\uD2C0\uB9B0 \uBB38\uC7A5\uC740?",
        choices: [
          "The policy was revised.",
          "The policy has been revised.",
          "The policy was revise.",
          "The policy is being revised."
        ],
        answer: 2,
        explanation: "\uC218\uB3D9\uC5D0\uB294 \uACFC\uAC70\uBD84\uC0AC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. revise\uAC00 \uC544\uB2C8\uB77C revised\uC785\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-008.json
  var F_008_default = {
    id: "F-008",
    order: 8,
    title: "to\uBD80\uC815\uC0AC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "infinitive",
      "to-infinitive-uses",
      "verb-patterns"
    ],
    objectives: [
      "to\uBD80\uC815\uC0AC\uC758 \uBA85\uC0AC\xB7\uD615\uC6A9\uC0AC\xB7\uBD80\uC0AC \uC6A9\uBC95\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uB3D9\uC0AC \uB4A4 to\uBD80\uC815\uC0AC \uD328\uD134\uC744 \uC775\uD78C\uB2E4",
      "\uBAA9\uC801\xB7\uC758\uB3C4 \uD45C\uD604\uC5D0\uC11C to\uBD80\uC815\uC0AC\uB97C \uC815\uD655\uD788 \uC4F4\uB2E4"
    ],
    concept: {
      summary: "to\uBD80\uC815\uC0AC(to + \uB3D9\uC0AC\uC6D0\uD615)\uB294 \uBA85\uC0AC\uCC98\uB7FC \uC8FC\uC5B4\xB7\uBAA9\uC801\uC5B4\uAC00 \uB418\uAC70\uB098, \uBA85\uC0AC\uB97C \uC218\uC2DD\uD558\uAC70\uB098, \uBAA9\uC801\xB7\uACB0\uACFC\uB97C \uB098\uD0C0\uB0B4\uB294 \uBD80\uC0AC \uC5ED\uD560\uB3C4 \uD569\uB2C8\uB2E4. decide/plan/hope/need \uB4F1\uC740 to\uBD80\uC815\uC0AC\uB97C \uBAA9\uC801\uC5B4\uB85C \uC790\uC8FC \uCDE8\uD569\uB2C8\uB2E4.",
      points: [
        "\uBA85\uC0AC\uC801: To err is human. / I want to leave.",
        "\uD615\uC6A9\uC0AC\uC801: a report to submit (\uC81C\uCD9C\uD560 \uBCF4\uACE0\uC11C)",
        "\uBD80\uC0AC\uC801: She called to confirm. (\uBAA9\uC801)",
        "\uB3D9\uC0AC \uD328\uD134: decide/agree/promise/refuse + to-V"
      ]
    },
    examples: [
      {
        en: "We need to revise the draft.",
        ko: "\uC6B0\uB9AC\uB294 \uCD08\uC548\uC744 \uC218\uC815\uD574\uC57C \uD55C\uB2E4.",
        structure: "need + to-V"
      },
      {
        en: "He stayed late to finish the slides.",
        ko: "\uADF8\uB294 \uC2AC\uB77C\uC774\uB4DC\uB97C \uB05D\uB0B4\uB824\uACE0 \uB2A6\uAC8C\uAE4C\uC9C0 \uB0A8\uC558\uB2E4.",
        structure: "\uBD80\uC0AC\uC801(\uBAA9\uC801)"
      },
      {
        en: "There is nothing to worry about.",
        ko: "\uAC71\uC815\uD560 \uAC83\uC740 \uC5C6\uB2E4.",
        structure: "\uD615\uC6A9\uC0AC\uC801 \uC218\uC2DD"
      }
    ],
    checks: [
      {
        id: "F-008-Q01",
        skill: "form",
        question: "to\uBD80\uC815\uC0AC\uC758 \uAE30\uBCF8 \uD615\uD0DC\uB294?",
        choices: [
          "to + -ing",
          "to + \uACFC\uAC70\uD615",
          "to + \uB3D9\uC0AC\uC6D0\uD615",
          "to + p.p."
        ],
        answer: 2,
        explanation: "to + \uB3D9\uC0AC\uC6D0\uD615\uC774 \uAE30\uBCF8\uC785\uB2C8\uB2E4. to go, to finish."
      },
      {
        id: "F-008-Q02",
        skill: "noun-use",
        question: '"I hope ___ soon."',
        choices: [
          "hearing",
          "to hear",
          "heard",
          "hear to"
        ],
        answer: 1,
        explanation: "hope\uB294 to\uBD80\uC815\uC0AC\uB97C \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q03",
        skill: "purpose",
        question: "\uBAA9\uC801\uC744 \uB098\uD0C0\uB0B4\uB294 \uD45C\uD604\uC73C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "She left early for to catch the train.",
          "She left early to catch the train.",
          "She left early catch to the train.",
          "She left early catching for."
        ],
        answer: 1,
        explanation: "\uBAA9\uC801\uC758 to\uBD80\uC815\uC0AC: left early to catch\u2026"
      },
      {
        id: "F-008-Q04",
        skill: "adjective-use",
        question: '"I have a call ___ ."',
        choices: [
          "to make",
          "making to",
          "made to",
          "make"
        ],
        answer: 0,
        explanation: "\uBA85\uC0AC call\uC744 \uC218\uC2DD\uD558\uB294 \uD615\uC6A9\uC0AC\uC801 to\uBD80\uC815\uC0AC to make\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q05",
        skill: "verb-pattern",
        question: "\uB2E4\uC74C \uC911 to\uBD80\uC815\uC0AC\uB97C \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD558\uB294 \uB3D9\uC0AC\uB294?",
        choices: [
          "enjoy",
          "avoid",
          "decide",
          "finish"
        ],
        answer: 2,
        explanation: "decide to V. enjoy/avoid/finish\uB294 \uC8FC\uB85C \uB3D9\uBA85\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q06",
        skill: "trap-bare",
        question: "\uC6D0\uD615\uBD80\uC815\uC0AC(to \uC5C6\uC74C)\uAC00 \uC624\uB294 \uC790\uB9AC\uC758 \uC608\uB294?",
        choices: [
          "want ___ go",
          "make someone ___ go",
          "hope ___ go",
          "plan ___ go"
        ],
        answer: 1,
        explanation: "\uC0AC\uC5ED\uB3D9\uC0AC make + O + \uC6D0\uD615(go). to\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q07",
        skill: "not-to",
        question: "to\uBD80\uC815\uC0AC\uC758 \uBD80\uC815\uD615\uC73C\uB85C \uAC00\uC7A5 \uD45C\uC900\uC801\uC778 \uAC83\uC740?",
        choices: [
          "to not go",
          "not to go",
          "to go not",
          "notting to go"
        ],
        answer: 1,
        explanation: "\uD45C\uC900 \uBB38\uC5B4\uC5D0\uC11C\uB294 not to go\uAC00 \uC77C\uBC18\uC801\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q08",
        skill: "application",
        question: '"The goal is ___ costs without cutting quality."',
        choices: [
          "reduce",
          "reducing to",
          "to reduce",
          "reduced"
        ],
        answer: 2,
        explanation: "be + to-V\uB85C \uBAA9\uD45C\xB7\uC608\uC815\xB7\uC5ED\uD560\uC744 \uB098\uD0C0\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q09",
        skill: "too-enough",
        question: '"The file is too large ___ by email."',
        choices: [
          "sending",
          "to send",
          "sent",
          "send"
        ],
        answer: 1,
        explanation: "too\u2026to V \uAD6C\uBB38\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-008-Q10",
        skill: "error",
        question: "\uC5B4\uC0C9\uD55C \uBB38\uC7A5\uC740?",
        choices: [
          "She promised to help.",
          "He agreed to wait.",
          "They enjoy to wait.",
          "We need to talk."
        ],
        answer: 2,
        explanation: "enjoy\uB294 \uB3D9\uBA85\uC0AC\uB97C \uCDE8\uD569\uB2C8\uB2E4. enjoy waiting\uC774 \uB9DE\uC2B5\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-009.json
  var F_009_default = {
    id: "F-009",
    order: 9,
    title: "\uB3D9\uBA85\uC0AC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "gerund",
      "gerund-vs-infinitive",
      "preposition-gerund"
    ],
    objectives: [
      "\uB3D9\uBA85\uC0AC\uC758 \uBA85\uC0AC\uC801 \uC4F0\uC784\uC744 \uC774\uD574\uD55C\uB2E4",
      "\uB3D9\uBA85\uC0AC\uB9CC \uBAA9\uC801\uC5B4\uB85C \uCDE8\uD558\uB294 \uB3D9\uC0AC\uB97C \uC775\uD78C\uB2E4",
      "\uC804\uCE58\uC0AC \uB4A4 -ing \uADDC\uCE59\uC744 \uC801\uC6A9\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uB3D9\uBA85\uC0AC(V-ing)\uB294 \uB3D9\uC0AC\uC5D0\uC11C \uC654\uC9C0\uB9CC \uBB38\uC7A5\uC5D0\uC11C\uB294 \uBA85\uC0AC\uCC98\uB7FC \uC4F0\uC785\uB2C8\uB2E4. enjoy, avoid, consider, finish, suggest \uB4F1\uC740 \uBAA9\uC801\uC5B4\uB85C \uB3D9\uBA85\uC0AC\uB97C \uC120\uD638\uD558\uACE0, \uC804\uCE58\uC0AC \uB4A4\uC5D0\uB294 \uC6D0\uCE59\uC801\uC73C\uB85C \uB3D9\uBA85\uC0AC\uAC00 \uC635\uB2C8\uB2E4.",
      points: [
        "\uC8FC\uC5B4\xB7\uBAA9\uC801\uC5B4\xB7\uBCF4\uC5B4\uB85C \uC0AC\uC6A9: Swimming helps. / I like reading.",
        "\uB3D9\uBA85\uC0AC \uBAA9\uC801\uC5B4 \uB3D9\uC0AC: enjoy, avoid, mind, finish, keep",
        "\uC804\uCE58\uC0AC + -ing: before leaving, by improving",
        "\uC758\uBBF8 \uCC28\uC774: stop smoking(\uB04A\uB2E4) vs stop to smoke(\uC26C\uB824\uACE0 \uD53C\uC6B0\uB2E4)"
      ]
    },
    examples: [
      {
        en: "She enjoys mentoring junior staff.",
        ko: "\uADF8\uB140\uB294 \uD6C4\uBC30 \uBA58\uD1A0\uB9C1\uC744 \uC990\uAE34\uB2E4.",
        structure: "enjoy + V-ing"
      },
      {
        en: "Thank you for waiting.",
        ko: "\uAE30\uB2E4\uB824 \uC8FC\uC154\uC11C \uAC10\uC0AC\uD569\uB2C8\uB2E4.",
        structure: "\uC804\uCE58\uC0AC for + V-ing"
      },
      {
        en: "His job is managing schedules.",
        ko: "\uADF8\uC758 \uC77C\uC740 \uC77C\uC815\uC744 \uAD00\uB9AC\uD558\uB294 \uAC83\uC774\uB2E4.",
        structure: "\uBCF4\uC5B4\uB85C \uC4F0\uC778 \uB3D9\uBA85\uC0AC"
      }
    ],
    checks: [
      {
        id: "F-009-Q01",
        skill: "form",
        question: "\uB3D9\uBA85\uC0AC\uC758 \uD615\uD0DC\uB294?",
        choices: [
          "to + \uC6D0\uD615",
          "V-ing (\uBA85\uC0AC \uC5ED\uD560)",
          "have + p.p.\uB9CC",
          "be + \uD615\uC6A9\uC0AC\uB9CC"
        ],
        answer: 1,
        explanation: "\uB3D9\uBA85\uC0AC\uB294 V-ing \uD615\uD0DC\uB85C \uBA85\uC0AC \uC5ED\uD560\uC744 \uD569\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q02",
        skill: "verb-pattern",
        question: '"Would you mind ___ the window?"',
        choices: [
          "to open",
          "opening",
          "opened",
          "open to"
        ],
        answer: 1,
        explanation: "mind\uB294 \uB3D9\uBA85\uC0AC\uB97C \uCDE8\uD569\uB2C8\uB2E4. mind opening."
      },
      {
        id: "F-009-Q03",
        skill: "preposition",
        question: '"She left without ___ goodbye."',
        choices: [
          "to say",
          "saying",
          "said",
          "say"
        ],
        answer: 1,
        explanation: "\uC804\uCE58\uC0AC without \uB4A4\uC5D0\uB294 \uB3D9\uBA85\uC0AC saying\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q04",
        skill: "subject",
        question: "\uB3D9\uBA85\uC0AC\uAC00 \uC8FC\uC5B4\uC778 \uBB38\uC7A5\uC740?",
        choices: [
          "To early is better.",
          "Jogging clears my head.",
          "She jogging clears.",
          "Jogged clears my head."
        ],
        answer: 1,
        explanation: "Jogging\uC774 \uC8FC\uC5B4\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q05",
        skill: "avoid",
        question: '"We should avoid ___ the same mistake."',
        choices: [
          "to make",
          "making",
          "made",
          "make to"
        ],
        answer: 1,
        explanation: "avoid + V-ing \uD328\uD134\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q06",
        skill: "trap-stop",
        question: '"He stopped ___ a coffee." (\uC7A0\uC2DC \uC26C\uB824\uACE0 \uCEE4\uD53C\uB97C \uB9C8\uC168\uB2E4)',
        choices: [
          "drinking",
          "to drink",
          "drunk",
          "drink"
        ],
        answer: 1,
        explanation: "stop to V\uB294 \u2018\uD558\uB824\uACE0 \uBA48\uCD94\uB2E4\u2019. stop V-ing\uB294 \u2018\uD558\uB358 \uAC83\uC744 \uADF8\uB9CC\uB450\uB2E4\u2019."
      },
      {
        id: "F-009-Q07",
        skill: "suggest",
        question: '"I suggest ___ the agenda."',
        choices: [
          "to revise",
          "revising",
          "revised",
          "revise to"
        ],
        answer: 1,
        explanation: "suggest\uB294 \uB3D9\uBA85\uC0AC(\uB610\uB294 that\uC808)\uB97C \uCDE8\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q08",
        skill: "application",
        question: "\uC804\uCE58\uC0AC \uB4A4 \uD615\uD0DC\uAC00 \uC62C\uBC14\uB978 \uAC83\uC740?",
        choices: [
          "interested in to learn",
          "interested in learning",
          "interested in learned",
          "interested learning in"
        ],
        answer: 1,
        explanation: "interested in + V-ing\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q09",
        skill: "go-ing",
        question: `"Let's go ___ this weekend."`,
        choices: [
          "to hike",
          "hiking",
          "hiked",
          "hike to"
        ],
        answer: 1,
        explanation: "go shopping/hiking\uCC98\uB7FC go + V-ing\uAC00 \uAD00\uC6A9\uC801\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-009-Q10",
        skill: "error",
        question: "\uD2C0\uB9B0 \uBB38\uC7A5\uC740?",
        choices: [
          "She finished writing the email.",
          "He keeps interrupting.",
          "They enjoy to travel.",
          "I avoided mentioning it."
        ],
        answer: 2,
        explanation: "enjoy\uB294 \uB3D9\uBA85\uC0AC\uB97C \uC501\uB2C8\uB2E4. enjoy traveling\uC774 \uB9DE\uC2B5\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-010.json
  var F_010_default = {
    id: "F-010",
    order: 10,
    title: "\uBD84\uC0AC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "participles",
      "present-past-participle",
      "reduced-relative"
    ],
    objectives: [
      "\uD604\uC7AC\uBD84\uC0AC\uC640 \uACFC\uAC70\uBD84\uC0AC\uC758 \uC758\uBBF8 \uCC28\uC774\uB97C \uC774\uD574\uD55C\uB2E4",
      "\uBD84\uC0AC\uAC00 \uBA85\uC0AC\uB97C \uC218\uC2DD\uD558\uB294 \uAD6C\uC870\uB97C \uC77D\uB294\uB2E4",
      "\uBD84\uC0AC\uAD6C\uBB38\uC73C\uB85C \uC808\uC744 \uC555\uCD95\uD558\uB294 \uAC10\uAC01\uC744 \uC775\uD78C\uB2E4"
    ],
    concept: {
      summary: "\uBD84\uC0AC\uB294 \uD615\uC6A9\uC0AC\uCC98\uB7FC \uBA85\uC0AC\uB97C \uC218\uC2DD\uD558\uAC70\uB098, \uBD84\uC0AC\uAD6C\uBB38\uC73C\uB85C \uBD80\uC0AC\uC808\uC744 \uC555\uCD95\uD569\uB2C8\uB2E4. \uD604\uC7AC\uBD84\uC0AC(V-ing)\uB294 \uB2A5\uB3D9\xB7\uC9C4\uD589, \uACFC\uAC70\uBD84\uC0AC(p.p.)\uB294 \uC218\uB3D9\xB7\uC644\uB8CC \uB290\uB08C\uC774 \uAC15\uD569\uB2C8\uB2E4. boring(\uC9C0\uB8E8\uD558\uAC8C \uB9CC\uB4DC\uB294) vs bored(\uC9C0\uB8E8\uD55C) \uAC19\uC740 \uAC10\uC815 \uBD84\uC0AC\uB97C \uD2B9\uD788 \uC8FC\uC758\uD558\uC138\uC694.",
      points: [
        "\uD604\uC7AC\uBD84\uC0AC: a growing market / people waiting outside",
        "\uACFC\uAC70\uBD84\uC0AC: a written report / issues discussed yesterday",
        "\uAC10\uC815: interesting(\uAD00\uC2EC \uB044\uB294) / interested(\uAD00\uC2EC \uAC00\uC9C4)",
        "\uBD84\uC0AC\uAD6C\uBB38: Walking in, she noticed\u2026 (= When she walked in\u2026)"
      ]
    },
    examples: [
      {
        en: "The rising costs worry investors.",
        ko: "\uC0C1\uC2B9\uD558\uB294 \uBE44\uC6A9\uC774 \uD22C\uC790\uC790\uB4E4\uC744 \uAC71\uC815\uC2DC\uD0A8\uB2E4.",
        structure: "\uD604\uC7AC\uBD84\uC0AC rising"
      },
      {
        en: "Please review the attached file.",
        ko: "\uCCA8\uBD80\uB41C \uD30C\uC77C\uC744 \uAC80\uD1A0\uD574 \uC8FC\uC138\uC694.",
        structure: "\uACFC\uAC70\uBD84\uC0AC attached"
      },
      {
        en: "Confused by the chart, he asked a question.",
        ko: "\uCC28\uD2B8\uC5D0 \uD63C\uB780\uC2A4\uB7EC\uC6CC\uC11C \uADF8\uB294 \uC9C8\uBB38\uD588\uB2E4.",
        structure: "\uACFC\uAC70\uBD84\uC0AC\uAD6C\uBB38"
      }
    ],
    checks: [
      {
        id: "F-010-Q01",
        skill: "present-participle",
        question: '"a ___ opportunity" (\uC99D\uAC00\uD558\uB294)',
        choices: [
          "grew",
          "growing",
          "grownly",
          "grow"
        ],
        answer: 1,
        explanation: "\uBA85\uC218\uC2DD \uD604\uC7AC\uBD84\uC0AC\uB294 growing\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q02",
        skill: "past-participle",
        question: '"the ___ proposal" (\uAC70\uBD80\uB41C)',
        choices: [
          "rejecting",
          "rejected",
          "rejects",
          "reject"
        ],
        answer: 1,
        explanation: "\uC218\uB3D9 \uC758\uBBF8\uC758 \uACFC\uAC70\uBD84\uC0AC rejected\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q03",
        skill: "emotion",
        question: '"I am ___ in data privacy."',
        choices: [
          "interesting",
          "interested",
          "interest",
          "interests"
        ],
        answer: 1,
        explanation: "\uC0AC\uB78C\uC774 \u2018\uAD00\uC2EC \uC788\uB2E4\u2019\uB294 interested\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q04",
        skill: "emotion-trap",
        question: '"The lecture was ___ ."',
        choices: [
          "bored",
          "boring",
          "bore",
          "bores"
        ],
        answer: 1,
        explanation: "\uC0AC\uBB3C\uC774 \u2018\uC9C0\uB8E8\uD558\uAC8C \uB9CC\uB4DC\uB294\u2019 \uC131\uC9C8\uC740 boring\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q05",
        skill: "reduced",
        question: '"Customers ___ in line looked impatient."',
        choices: [
          "wait",
          "waiting",
          "waited for to",
          "waits"
        ],
        answer: 1,
        explanation: "who were waiting \u2192 waiting\uC73C\uB85C \uCD95\uC57D\uB41C \uD604\uC7AC\uBD84\uC0AC \uC218\uC2DD\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q06",
        skill: "absolute-sense",
        question: "\uBD84\uC0AC\uAD6C\uBB38\uC758 \uC8FC\uC5B4\uB294 \uBCF4\uD1B5?",
        choices: [
          "\uD56D\uC0C1 it",
          "\uC8FC\uC808 \uC8FC\uC5B4\uC640 \uAC19\uC544\uC57C \uC790\uC5F0\uC2A4\uB7FD\uB2E4",
          "\uBAA9\uC801\uC5B4\uB9CC",
          "\uC804\uCE58\uC0AC\uB9CC"
        ],
        answer: 1,
        explanation: "\uBD84\uC0AC\uAD6C\uBB38\uC758 \uC758\uBBF8\uC0C1 \uC8FC\uC5B4\uB294 \uC8FC\uC808 \uC8FC\uC5B4\uC640 \uC77C\uCE58\uD558\uB294 \uAC83\uC774 \uC6D0\uCE59\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q07",
        skill: "application",
        question: '"___ the deadline, we worked overnight."',
        choices: [
          "Approach",
          "Approaching",
          "Approached to",
          "Approaches"
        ],
        answer: 1,
        explanation: "Approaching the deadline\u2026 = As we approached\u2026"
      },
      {
        id: "F-010-Q08",
        skill: "passive-participle",
        question: '"Documents ___ last week are ready."',
        choices: [
          "signing",
          "signed",
          "sign",
          "to signing"
        ],
        answer: 1,
        explanation: "signed last week = which were signed\u2026"
      },
      {
        id: "F-010-Q09",
        skill: "trap-dangling",
        question: "\uC5B4\uC0C9\uD55C(\uB9E4\uB2EC\uB9B0 \uBD84\uC0AC) \uBB38\uC7A5\uC740?",
        choices: [
          "Entering the room, she turned on the light.",
          "Entering the room, the light was turned on.",
          "Tired, he took a break.",
          "Written clearly, the note helped."
        ],
        answer: 1,
        explanation: "\uB450 \uBC88\uC9F8 \uBB38\uC7A5\uC740 \uBD84\uC0AC \uC8FC\uC5B4\uAC00 light\uCC98\uB7FC \uC77D\uD600 \uC5B4\uC0C9\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-010-Q10",
        skill: "concept",
        question: "\uD604\uC7AC\uBD84\uC0AC\uC640 \uACFC\uAC70\uBD84\uC0AC\uC758 \uAE30\uBCF8 \uB300\uBE44\uB294?",
        choices: [
          "\uD604\uC7AC=\uC218\uB3D9 / \uACFC\uAC70=\uB2A5\uB3D9",
          "\uD604\uC7AC=\uB2A5\uB3D9\xB7\uC9C4\uD589 / \uACFC\uAC70=\uC218\uB3D9\xB7\uC644\uB8CC \uAC10\uAC01",
          "\uB458 \uB2E4 \uD56D\uC0C1 \uBD80\uC0AC",
          "\uC2DC\uC81C\uC640 \uBB34\uAD00\uD558\uAC8C \uB3D9\uC77C"
        ],
        answer: 1,
        explanation: "V-ing\uB294 \uB2A5\uB3D9\xB7\uC9C4\uD589, p.p.\uB294 \uC218\uB3D9\xB7\uC644\uB8CC \uB290\uB08C\uC774 \uAE30\uBCF8\uC785\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-011.json
  var F_011_default = {
    id: "F-011",
    order: 11,
    title: "\uC811\uC18D\uC0AC",
    category: "grammar",
    estimatedMinutes: 12,
    skills: [
      "conjunctions",
      "coordinating",
      "subordinating"
    ],
    objectives: [
      "\uB4F1\uC704\uC811\uC18D\uC0AC\uC640 \uC885\uC18D\uC811\uC18D\uC0AC\uC758 \uC5ED\uD560\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uC6D0\uC778\xB7\uB300\uC870\xB7\uC870\uAC74\xB7\uC2DC\uAC04\uC744 \uB098\uD0C0\uB0B4\uB294 \uC811\uC18D\uC0AC\uB97C \uACE0\uB978\uB2E4",
      "\uC811\uC18D\uC0AC \uB4A4 \uC808 \uAD6C\uC870(S+V)\uB97C \uD655\uC778\uD558\uB294 \uC2B5\uAD00\uC744 \uAE30\uB978\uB2E4"
    ],
    concept: {
      summary: "\uC811\uC18D\uC0AC\uB294 \uB2E8\uC5B4\xB7\uAD6C\xB7\uC808\uC744 \uB17C\uB9AC\uC801\uC73C\uB85C \uC5F0\uACB0\uD569\uB2C8\uB2E4. and/but/or/so\uB294 \uB4F1\uC704, because/if/when/although\uB294 \uC885\uC18D\uC808\uC744 \uC774\uB055\uB2C8\uB2E4. TEPS\uC5D0\uC11C\uB294 \uC811\uC18D\uC0AC \uC120\uD0DD\uACFC \uC808/\uAD6C \uD63C\uB3D9(despite vs although)\uC774 \uC790\uC8FC \uB098\uC635\uB2C8\uB2E4.",
      points: [
        "\uB4F1\uC704: and, but, or, so, yet",
        "\uC2DC\uAC04: when, while, before, after, until",
        "\uC6D0\uC778\xB7\uACB0\uACFC: because, since, so, therefore(\uBD80\uC0AC)",
        "\uB300\uC870\xB7\uC591\uBCF4: but, although, even though / despite + \uBA85\uC0AC(\uAD6C)"
      ]
    },
    examples: [
      {
        en: "I called, but no one answered.",
        ko: "\uB098\uB294 \uC804\uD654\uD588\uC9C0\uB9CC \uC544\uBB34\uB3C4 \uBC1B\uC9C0 \uC54A\uC558\uB2E4.",
        structure: "\uB4F1\uC704 but"
      },
      {
        en: "We postponed the launch because the build failed.",
        ko: "\uBE4C\uB4DC\uAC00 \uC2E4\uD328\uD574\uC11C \uCD9C\uC2DC\uB97C \uBBF8\uB918\uB2E4.",
        structure: "\uC6D0\uC778 because"
      },
      {
        en: "Although the budget is tight, we can proceed.",
        ko: "\uC608\uC0B0\uC774 \uBE60\uB4EF\uD574\uB3C4 \uC9C4\uD589\uD560 \uC218 \uC788\uB2E4.",
        structure: "\uC591\uBCF4 although"
      }
    ],
    checks: [
      {
        id: "F-011-Q01",
        skill: "coordinating",
        question: "\uB4F1\uC704\uC811\uC18D\uC0AC\uAC00 \uC544\uB2CC \uAC83\uC740?",
        choices: [
          "and",
          "but",
          "because",
          "or"
        ],
        answer: 2,
        explanation: "because\uB294 \uC885\uC18D\uC811\uC18D\uC0AC\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q02",
        skill: "contrast",
        question: '\uBE48\uCE78: "The plan is solid, ___ funding is uncertain."',
        choices: [
          "and",
          "but",
          "because",
          "so that"
        ],
        answer: 1,
        explanation: "\uB300\uC870\uC5D0\uB294 but\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q03",
        skill: "cause",
        question: '"___ the server was down, we worked offline."',
        choices: [
          "Despite",
          "Because",
          "Although of",
          "But"
        ],
        answer: 1,
        explanation: "\uC6D0\uC778 \uC808\uC744 \uC774\uB04C \uB54C\uB294 Because + S+V\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q04",
        skill: "trap-despite",
        question: "\uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "Despite he was tired, he continued.",
          "Despite being tired, he continued.",
          "Although being tired, he continued.",
          "Because of he was tired, he continued."
        ],
        answer: 1,
        explanation: "despite \uB4A4\uC5D0\uB294 \uBA85\uC0AC(\uAD6C)/V-ing. despite being tired."
      },
      {
        id: "F-011-Q05",
        skill: "condition",
        question: '"___ you confirm today, we can ship tomorrow."',
        choices: [
          "If",
          "Although",
          "But",
          "Or"
        ],
        answer: 0,
        explanation: "\uC870\uAC74\uC740 If + \uC808\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q06",
        skill: "time",
        question: `"Don't submit it ___ you double-check the figures."`,
        choices: [
          "while",
          "until",
          "during",
          "despite"
        ],
        answer: 1,
        explanation: "until\uC740 \u2018~\uD560 \uB54C\uAE4C\uC9C0 (\uD558\uC9C0 \uB9C8\uB77C)\u2019\uC5D0 \uC801\uD569\uD569\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q07",
        skill: "so-that",
        question: "\uBAA9\uC801\xB7\uACB0\uACFC(\u2018~\uD558\uB3C4\uB85D\u2019)\uC5D0 \uAC00\uAE4C\uC6B4 \uC5F0\uACB0\uC740?",
        choices: [
          "so that",
          "but",
          "or else and",
          "despite"
        ],
        answer: 0,
        explanation: "so that\uC740 \uBAA9\uC801\xB7\uACB0\uACFC \uC808\uC744 \uC774\uB055\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q08",
        skill: "application",
        question: "\uC811\uC18D\uC0AC \uB4A4 \uAD6C\uC870\uAC00 \uC62C\uBC14\uB978 \uAC83\uC740?",
        choices: [
          "Although the delay.",
          "Although the delay was short, we apologized.",
          "Although of the delay, we apologized.",
          "Although delayed was short."
        ],
        answer: 1,
        explanation: "although \uB4A4\uC5D0\uB294 \uC808(S+V)\uC774 \uC635\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q09",
        skill: "while",
        question: '"___ I agree with the goal, I question the timeline."',
        choices: [
          "During",
          "While",
          "Despite",
          "Or"
        ],
        answer: 1,
        explanation: "While\uB294 \uC2DC\uAC04\uBFD0 \uC544\uB2C8\uB77C \uC57D\uD55C \uB300\uC870(\u2018~\uC774\uAE34 \uD558\uB098\u2019)\uC5D0\uB3C4 \uC501\uB2C8\uB2E4."
      },
      {
        id: "F-011-Q10",
        skill: "error",
        question: "\uC5B4\uC0C9\uD55C \uC5F0\uACB0\uC740?",
        choices: [
          "She was late because traffic was heavy.",
          "She was late, so she apologized.",
          "She was late although the roads were clear.",
          "She was late despite traffic was heavy."
        ],
        answer: 3,
        explanation: "despite \uB4A4\uC5D0\uB294 \uC808\uC774 \uBC14\uB85C \uC624\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. despite heavy traffic\uC774 \uB9DE\uC2B5\uB2C8\uB2E4."
      }
    ]
  };

  // data/foundation/lessons/F-012.json
  var F_012_default = {
    id: "F-012",
    order: 12,
    title: "\uAD00\uACC4\uC0AC",
    category: "grammar",
    estimatedMinutes: 15,
    skills: [
      "relatives",
      "who-which-that",
      "whose-where"
    ],
    objectives: [
      "\uAD00\uACC4\uB300\uBA85\uC0AC who/which/that\uC758 \uAE30\uBCF8 \uC4F0\uC784\uC744 \uC775\uD78C\uB2E4",
      "\uC18C\uC720\uACA9 whose\uC640 \uAD00\uACC4\uBD80\uC0AC where/when\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uAD00\uACC4\uC808\uC774 \uC120\uD589\uC0AC\uB97C \uC218\uC2DD\uD558\uB294 \uAD6C\uC870\uB97C \uBE60\uB974\uAC8C \uC77D\uB294\uB2E4"
    ],
    concept: {
      summary: "\uAD00\uACC4\uC0AC\uB294 \uC120\uD589\uC0AC\uB97C \uBC1B\uB294 \uC808\uC744 \uC774\uB04C\uC5B4 \uC815\uBCF4\uB97C \uB367\uBD99\uC785\uB2C8\uB2E4. \uC0AC\uB78C who, \uC0AC\uBB3C which, \uB458 \uB2E4 that\uC774 \uAE30\uBCF8\uC774\uBA70, whose\uB294 \uC18C\uC720, where/when\uC740 \uC7A5\uC18C\xB7\uC2DC\uAC04\uC744 \uC5F0\uACB0\uD569\uB2C8\uB2E4. \uCF64\uB9C8 \uC720\uBB34(\uC81C\uD55C/\uBE44\uC81C\uD55C)\uB3C4 \uC758\uBBF8\uC5D0 \uC601\uD5A5\uC744 \uC90D\uB2C8\uB2E4.",
      points: [
        "\uC0AC\uB78C: the manager who approved it",
        "\uC0AC\uBB3C: the tool which/that we use",
        "\uC18C\uC720: an employee whose idea won",
        "\uC7A5\uC18C\xB7\uC2DC\uAC04: the office where\u2026 / the year when\u2026"
      ]
    },
    examples: [
      {
        en: "The analyst who prepared the chart joined us.",
        ko: "\uCC28\uD2B8\uB97C \uC900\uBE44\uD55C \uBD84\uC11D\uAC00\uAC00 \uD569\uB958\uD588\uB2E4.",
        structure: "who + \uC0AC\uB78C"
      },
      {
        en: "This is the dataset that we cleaned yesterday.",
        ko: "\uC774\uAC83\uC774 \uC6B0\uB9AC\uAC00 \uC5B4\uC81C \uC815\uB9AC\uD55C \uB370\uC774\uD130\uC14B\uC774\uB2E4.",
        structure: "that + \uC0AC\uBB3C"
      },
      {
        en: "She works at a firm whose clients are global.",
        ko: "\uADF8\uB140\uB294 \uACE0\uAC1D\uC774 \uAE00\uB85C\uBC8C\uC778 \uD68C\uC0AC\uC5D0\uC11C \uC77C\uD55C\uB2E4.",
        structure: "whose + \uC18C\uC720"
      }
    ],
    checks: [
      {
        id: "F-012-Q01",
        skill: "who",
        question: '\uBE48\uCE78: "The engineer ___ fixed the bug got credit."',
        choices: [
          "which",
          "who",
          "where",
          "whose"
        ],
        answer: 1,
        explanation: "\uC0AC\uB78C \uC120\uD589\uC0AC\uC5D0\uB294 who\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q02",
        skill: "which",
        question: '"Here is the report ___ you requested."',
        choices: [
          "who",
          "whose",
          "which",
          "where"
        ],
        answer: 2,
        explanation: "\uC0AC\uBB3C report\uC5D0\uB294 which/that\uC774 \uC635\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q03",
        skill: "whose",
        question: '"I met a designer ___ portfolio impressed me."',
        choices: [
          "who",
          "which",
          "whose",
          "where"
        ],
        answer: 2,
        explanation: "portfolio\uC758 \uC18C\uC720\uC8FC\uAC00 designer\uC774\uBBC0\uB85C whose\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q04",
        skill: "where",
        question: '"This is the lab ___ we test prototypes."',
        choices: [
          "who",
          "which",
          "where",
          "whose"
        ],
        answer: 2,
        explanation: "\uC7A5\uC18C lab + where \uAD00\uACC4\uBD80\uC0AC\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q05",
        skill: "omission",
        question: "\uBAA9\uC801\uACA9 \uAD00\uACC4\uB300\uBA85\uC0AC \uC0DD\uB7B5\uC774 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uAC83\uC740?",
        choices: [
          "the person who called (\uC8FC\uC5B4 who \uC0DD\uB7B5)",
          "the file that I sent \u2192 the file I sent",
          "the woman whose car\u2026 (whose \uC0DD\uB7B5)",
          "the office where\u2026 (where \uD56D\uC0C1 \uC0DD\uB7B5)"
        ],
        answer: 1,
        explanation: "\uBAA9\uC801\uACA9 that/which\uB294 \uC790\uC8FC \uC0DD\uB7B5\uB429\uB2C8\uB2E4. the file I sent."
      },
      {
        id: "F-012-Q06",
        skill: "that-restrictive",
        question: "\uC81C\uD55C\uC6A9\uBC95\uC5D0 \uD754\uD788 \uC4F0\uC774\uBA70 \uC0AC\uB78C\xB7\uC0AC\uBB3C \uBAA8\uB450 \uAC00\uB2A5\uD55C \uAC83\uC740?",
        choices: [
          "where\uB9CC",
          "that",
          "whose\uB9CC",
          "whom\uB9CC"
        ],
        answer: 1,
        explanation: "that\uC740 \uC81C\uD55C \uAD00\uACC4\uC808\uC5D0\uC11C \uC0AC\uB78C\xB7\uC0AC\uBB3C \uBAA8\uB450\uC5D0 \uC4F0\uC785\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q07",
        skill: "nonrestrictive",
        question: "\uBE44\uC81C\uD55C(\uCF64\uB9C8) \uAD00\uACC4\uC808\uC5D0 \uBCF4\uD1B5 that\uC744 \uC4F0\uC9C0 \uC54A\uB294 \uC774\uC720\uB85C \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uAC83\uC740?",
        choices: [
          "that\uC740 \uB3D9\uC0AC\uB2E4",
          "\uBE44\uC81C\uD55C\uC5D0\uB294 which/who\uAC00 \uC77C\uBC18\uC801\uC774\uB2E4",
          "that\uC740 \uC804\uCE58\uC0AC\uB2E4",
          "that\uC740 \uD56D\uC0C1 \uC0DD\uB7B5 \uD544\uC218"
        ],
        answer: 1,
        explanation: "\uCF64\uB9C8\uAC00 \uC788\uB294 \uBD80\uAC00 \uC124\uBA85\uC5D0\uB294 which/who\uAC00 \uC77C\uBC18\uC801\uC774\uACE0 that\uC740 \uC798 \uC548 \uC501\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q08",
        skill: "application",
        question: "\uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "The client which called is waiting.",
          "The client who called is waiting.",
          "The client where called is waiting.",
          "The client whose called is waiting."
        ],
        answer: 1,
        explanation: "\uC0AC\uB78C client\uC5D0\uB294 who\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q09",
        skill: "when",
        question: '"I remember the week ___ we launched."',
        choices: [
          "who",
          "whose",
          "when",
          "which who"
        ],
        answer: 2,
        explanation: "\uC2DC\uAC04 \uC120\uD589\uC0AC\uC5D0\uB294 when\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4."
      },
      {
        id: "F-012-Q10",
        skill: "trap-preposition",
        question: '"the project ___ we talked about"',
        choices: [
          "who",
          "where",
          "that/which",
          "whose"
        ],
        answer: 2,
        explanation: "talk about\uC758 \uBAA9\uC801\uC5B4\uAC00 project\uC774\uBBC0\uB85C that/which\uAC00 \uC635\uB2C8\uB2E4. (about\uC774 \uC808 \uB05D\uC5D0)"
      }
    ]
  };

  // data/foundation/lessons/F-013.json
  var F_013_default = {
    id: "F-013",
    order: 13,
    title: "\uACE0\uBE48\uB3C4 \uD575\uC2EC \uC5B4\uD718",
    category: "vocabulary",
    estimatedMinutes: 14,
    skills: ["high-frequency", "context-meaning", "paraphrase"],
    objectives: [
      "TEPS\uC5D0 \uC790\uC8FC \uB098\uC624\uB294 \uD575\uC2EC \uC5B4\uD718\uC758 \uAE30\uBCF8 \uB73B\uC744 \uD30C\uC545\uD55C\uB2E4",
      "\uBB38\uB9E5\uC5D0 \uB9DE\uB294 \uC720\uC758\xB7\uBC18\uC758 \uD45C\uD604\uC744 \uACE0\uB978\uB2E4",
      "\uC9E7\uC740 \uBB38\uC7A5\uC5D0\uC11C \uC5B4\uD718\uC758 \uAE30\uB2A5\uC744 \uD655\uC778\uD55C\uB2E4"
    ],
    concept: {
      summary: "TEPS \uC5B4\uD718\uB294 \uC5B4\uB824\uC6B4 \uB2E8\uC5B4\uBCF4\uB2E4 \u2018\uC790\uC8FC \uC4F0\uC774\uB294 \uD575\uC2EC \uC5B4\uD718\u2019\uB97C \uBB38\uB9E5\uC5D0\uC11C \uC815\uD655\uD788 \uC77D\uB294 \uB2A5\uB825\uC774 \uC911\uC694\uD569\uB2C8\uB2E4. \uB2E8\uC21C \uC554\uAE30\uBCF4\uB2E4 \uC720\uC758\uC5B4\xB7\uBC18\uC758\uC5B4\xB7\uC5F0\uC5B4 \uD328\uD134\uC744 \uD568\uAED8 \uC775\uD788\uBA74 \uB3C5\uD574\xB7\uCCAD\uD574\uC5D0\uC11C\uB3C4 \uBC14\uB85C \uD65C\uC6A9\uB429\uB2C8\uB2E4. \uACE0\uBE48\uB3C4 \uC5B4\uD718\uB294 \uC9E7\uACE0 \uBC18\uBCF5\uC801\uC778 \uBB38\uC81C\uB85C \uBA3C\uC800 \uACE0\uC815\uD558\uC138\uC694.",
      points: [
        "\uB73B + \uC608\uBB38 + \uC720\uC758\uC5B4\uB97C \uC138\uD2B8\uB85C \uAE30\uC5B5\uD55C\uB2E4",
        "\uBB38\uC7A5 \uC18D \uC5ED\uD560(\uB3D9\uC0AC/\uD615\uC6A9\uC0AC/\uBA85\uC0AC)\uC744 \uBA3C\uC800 \uBCF8\uB2E4",
        "\uBE44\uC2B7\uD55C \uB73B\uC774\uB77C\uB3C4 \uC5F0\uC5B4(collocation)\uAC00 \uB2E4\uB97C \uC218 \uC788\uB2E4",
        "\uBC18\uC758\uC5B4\uB85C \uC758\uBBF8\uB97C \uC120\uBA85\uD558\uAC8C \uAD6C\uBD84\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "The company aims to enhance customer satisfaction.",
        ko: "\uADF8 \uD68C\uC0AC\uB294 \uACE0\uAC1D \uB9CC\uC871\uB3C4\uB97C \uB192\uC774\uB824 \uD55C\uB2E4.",
        structure: "enhance = improve / strengthen"
      },
      {
        en: "She was reluctant to accept the offer.",
        ko: "\uADF8\uB140\uB294 \uADF8 \uC81C\uC548\uC744 \uBC1B\uC544\uB4E4\uC774\uAE30\uB97C \uAEBC\uB838\uB2E4.",
        structure: "reluctant to + V = unwilling to"
      },
      {
        en: "They need to allocate more time to research.",
        ko: "\uADF8\uB4E4\uC740 \uC5F0\uAD6C\uC5D0 \uB354 \uB9CE\uC740 \uC2DC\uAC04\uC744 \uBC30\uC815\uD574\uC57C \uD55C\uB2E4.",
        structure: "allocate A to B = assign A to B"
      }
    ],
    checks: [
      {
        id: "F-013-Q01",
        skill: "word-meaning",
        question: '"retain"\uC758 \uB73B\uC73C\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["\uD3EC\uAE30\uD558\uB2E4", "\uC720\uC9C0\uD558\uB2E4", "\uC5F0\uAE30\uD558\uB2E4", "\uAC70\uBD80\uD558\uB2E4"],
        answer: 1,
        explanation: "retain\uC740 \u2018\uC720\uC9C0\uD558\uB2E4, \uBCF4\uC720\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4. \uC815\uBCF4\xB7\uAD8C\uB9AC\xB7\uD1B5\uC81C\uB97C \uACC4\uC18D \uAC00\uC9C4\uB2E4\uB294 \uB9E5\uB77D\uC5D0\uC11C \uC790\uC8FC \uC4F0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q02",
        skill: "context-meaning",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "A ___ increase in sales surprised the board."',
        choices: ["reluctant", "substantial", "ambiguous", "preceding"],
        answer: 1,
        explanation: "substantial\uC740 \u2018\uC0C1\uB2F9\uD55C\u2019\uC774\uB77C\uB294 \uB73B\uC73C\uB85C increase\uC640 \uC790\uC8FC \uD568\uAED8 \uC4F0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q03",
        skill: "paraphrase",
        question: '"enhance performance"\uC640 \uC758\uBBF8\uAC00 \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uAC83\uC740?',
        choices: ["delay performance", "ignore performance", "improve performance", "measure performance"],
        answer: 2,
        explanation: "enhance\uB294 improve, strengthen\uC640 \uAC00\uAE4C\uC6B4 \uB73B\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q04",
        skill: "word-meaning",
        question: '"comprise"\uC758 \uC6A9\uBC95\uC73C\uB85C \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?',
        choices: [
          "The team is comprised five members.",
          "The team comprises five members.",
          "The team comprises of five members.",
          "Five members comprise of the team."
        ],
        answer: 1,
        explanation: "comprise\uB294 \u2018~\uB85C \uAD6C\uC131\uB418\uB2E4/\uD3EC\uD568\uD558\uB2E4\u2019\uB85C, The whole comprises the parts \uD615\uD0DC\uAC00 \uD45C\uC900\uC785\uB2C8\uB2E4. of\uB97C \uBD99\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q05",
        skill: "context-meaning",
        question: '"She gave an ambiguous answer."\uC5D0\uC11C ambiguous\uC758 \uC758\uBBF8\uB294?',
        choices: ["\uBA85\uD655\uD55C", "\uBAA8\uD638\uD55C", "\uC790\uC138\uD55C", "\uAE0D\uC815\uC801\uC778"],
        answer: 1,
        explanation: "ambiguous\uB294 \u2018\uBAA8\uD638\uD55C, \uC560\uB9E4\uD55C\u2019\uC785\uB2C8\uB2E4. \uB458 \uC774\uC0C1\uC73C\uB85C \uD574\uC11D\uB420 \uC218 \uC788\uB294 \uD45C\uD604\uC5D0 \uC4F0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q06",
        skill: "collocation",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "Please ___ resources carefully before the launch."',
        choices: ["allocate", "precede", "retain", "hesitate"],
        answer: 0,
        explanation: "allocate resources\uB294 \u2018\uC790\uC6D0\uC744 \uBC30\uBD84\uD558\uB2E4\u2019\uB77C\uB294 \uACE0\uBE48\uB3C4 \uC5F0\uC5B4\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q07",
        skill: "word-meaning",
        question: '"Events that precede the conference"\uC5D0\uC11C precede\uC758 \uB73B\uC740?',
        choices: ["~\uBCF4\uB2E4 \uC55E\uC11C\uB2E4", "~\uB97C \uCDE8\uC18C\uD558\uB2E4", "~\uB97C \uC694\uC57D\uD558\uB2E4", "~\uB97C \uB530\uB77C\uAC00\uB2E4"],
        answer: 0,
        explanation: "precede\uB294 \u2018~\uBCF4\uB2E4 \uC55E\uC11C\uB2E4, \uC120\uD589\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q08",
        skill: "paraphrase",
        question: '"reluctant to admit"\uC640 \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uC758\uBBF8\uB294?',
        choices: ["eager to admit", "unwilling to admit", "forced to admit", "unable to admit"],
        answer: 1,
        explanation: "reluctant\uB294 unwilling, hesitant\uC640 \uAC00\uAE5D\uC2B5\uB2C8\uB2E4. \u2018\uB9C8\uC9C0\uBABB\uD574 \uD558\uB294\u2019 \uB258\uC559\uC2A4\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q09",
        skill: "context-meaning",
        question: "\uB2E4\uC74C \uC911 retain\uC774 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC4F0\uC778 \uBB38\uC7A5\uC740?",
        choices: [
          "They retain the meeting until next week.",
          "She retained calm during the crisis.",
          "He retained to leave early.",
          "We retained the problem carefully."
        ],
        answer: 1,
        explanation: "retain calm/control/information\uCC98\uB7FC \u2018\uC0C1\uD0DC\uB97C \uC720\uC9C0\uD558\uB2E4\u2019 \uC6A9\uBC95\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4. \uC5F0\uAE30\uB294 postpone, \uBD84\uC11D\uC740 examine\uC774 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-013-Q10",
        skill: "word-meaning",
        question: '"a substantial amount of evidence"\uC758 \uC758\uBBF8\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: [
          "\uC544\uC8FC \uC801\uC740 \uC591\uC758 \uC99D\uAC70",
          "\uC0C1\uB2F9\uD55C \uC591\uC758 \uC99D\uAC70",
          "\uBAA8\uD638\uD55C \uC591\uC758 \uC99D\uAC70",
          "\uC55E\uC120 \uC591\uC758 \uC99D\uAC70"
        ],
        answer: 1,
        explanation: "substantial amount\uB294 \u2018\uC0C1\uB2F9\uD55C \uC591\u2019\uC744 \uB73B\uD569\uB2C8\uB2E4. \uD559\uC220\xB7\uC5C5\uBB34 \uC9C0\uBB38\uC5D0\uC11C \uC790\uC8FC \uB4F1\uC7A5\uD569\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-014.json
  var F_014_default = {
    id: "F-014",
    order: 14,
    title: "\uC5F0\uC5B4\uC640 \uAD6C\uB3D9\uC0AC",
    category: "vocabulary",
    estimatedMinutes: 14,
    skills: ["collocation", "phrasal-verb", "context"],
    objectives: [
      "\uACE0\uBE48\uB3C4 \uC5F0\uC5B4(collocation) \uD328\uD134\uC744 \uC775\uD78C\uB2E4",
      "\uAD6C\uB3D9\uC0AC(phrasal verb)\uC758 \uAE30\uBCF8 \uC758\uBBF8\uB97C \uAD6C\uBD84\uD55C\uB2E4",
      "\uBB38\uB9E5\uC5D0 \uB9DE\uB294 \uC804\uCE58\uC0AC\xB7\uBD80\uC0AC \uC785\uB825\uC744 \uACE0\uB978\uB2E4"
    ],
    concept: {
      summary: "\uC601\uC5B4\uB294 \uB2E8\uC5B4 \uD558\uB098\uBCF4\uB2E4 \u2018\uD568\uAED8 \uC790\uC8FC \uC4F0\uC774\uB294 \uC870\uD569\u2019\uC774 \uC911\uC694\uD569\uB2C8\uB2E4. make a decision, take responsibility\uCC98\uB7FC \uB3D9\uC0AC+\uBA85\uC0AC \uC5F0\uC5B4\uC640 look into, put off \uAC19\uC740 \uAD6C\uB3D9\uC0AC\uB97C \uC138\uD2B8\uB85C \uC775\uD788\uBA74 \uC5B4\uD718\xB7\uB3C5\uD574\xB7\uCCAD\uD574\uAC00 \uD568\uAED8 \uC88B\uC544\uC9D1\uB2C8\uB2E4. \uB73B\uC744 \uC678\uC6B8 \uB54C \uC804\uCE58\uC0AC\uAE4C\uC9C0 \uBD99\uC5EC \uAE30\uC5B5\uD558\uC138\uC694.",
      points: [
        "\uB3D9\uC0AC+\uBA85\uC0AC \uC5F0\uC5B4\uB294 \uD1B5\uC9F8\uB85C \uC554\uAE30\uD55C\uB2E4",
        "\uAD6C\uB3D9\uC0AC\uB294 \uB3D9\uC0AC+\uBD80\uC0AC/\uC804\uCE58\uC0AC\uB85C \uC0C8 \uC758\uBBF8\uB97C \uB9CC\uB4E0\uB2E4",
        "\uBE44\uC2B7\uD574 \uBCF4\uC5EC\uB3C4 \uC804\uCE58\uC0AC\uAC00 \uBC14\uB00C\uBA74 \uB73B\uC774 \uB2EC\uB77C\uC9C4\uB2E4",
        "\uBB38\uC7A5 \uC804\uCCB4 \uB9E5\uB77D\uC73C\uB85C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC870\uD569\uC744 \uACE0\uB978\uB2E4"
      ]
    },
    examples: [
      {
        en: "We need to look into the complaint carefully.",
        ko: "\uC6B0\uB9AC\uB294 \uADF8 \uBD88\uB9CC\uC744 \uC8FC\uC758 \uAE4A\uAC8C \uC870\uC0AC\uD574\uC57C \uD55C\uB2E4.",
        structure: "look into = investigate"
      },
      {
        en: "She put off the meeting until Friday.",
        ko: "\uADF8\uB140\uB294 \uD68C\uC758\uB97C \uAE08\uC694\uC77C\uAE4C\uC9C0 \uC5F0\uAE30\uD588\uB2E4.",
        structure: "put off = postpone"
      },
      {
        en: "He took responsibility for the delay.",
        ko: "\uADF8\uB294 \uC9C0\uC5F0\uC5D0 \uB300\uD55C \uCC45\uC784\uC744 \uC84C\uB2E4.",
        structure: "take responsibility for"
      }
    ],
    checks: [
      {
        id: "F-014-Q01",
        skill: "phrasal-verb",
        question: '"look into the matter"\uC758 \uC758\uBBF8\uB294?',
        choices: ["\uBB38\uC81C\uB97C \uBB34\uC2DC\uD558\uB2E4", "\uBB38\uC81C\uB97C \uC870\uC0AC\uD558\uB2E4", "\uBB38\uC81C\uB97C \uACF5\uAC1C\uD558\uB2E4", "\uBB38\uC81C\uB97C \uC5F0\uAE30\uD558\uB2E4"],
        answer: 1,
        explanation: "look into\uB294 investigate, examine\uACFC \uAC19\uC544 \u2018\uC870\uC0AC\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q02",
        skill: "collocation",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "They finally ___ a decision after a long debate."',
        choices: ["did", "made", "took", "had"],
        answer: 1,
        explanation: "make a decision\uC774 \uD45C\uC900 \uC5F0\uC5B4\uC785\uB2C8\uB2E4. decision\uACFC \uD568\uAED8 do/take\uB97C \uC4F0\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q03",
        skill: "phrasal-verb",
        question: '"The flight was called off."\uC5D0\uC11C call off\uC758 \uB73B\uC740?',
        choices: ["\uC5F0\uAE30\uD558\uB2E4", "\uCDE8\uC18C\uD558\uB2E4", "\uD655\uC778\uD558\uB2E4", "\uCD9C\uBC1C\uD558\uB2E4"],
        answer: 1,
        explanation: "call off\uB294 cancel, \uC989 \u2018\uCDE8\uC18C\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4. put off(\uC5F0\uAE30)\uC640 \uAD6C\uBD84\uD558\uC138\uC694.",
        transcript: ""
      },
      {
        id: "F-014-Q04",
        skill: "collocation",
        question: "\uB2E4\uC74C \uC911 \uC5F0\uC5B4\uAC00 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uAC83\uC740?",
        choices: [
          "do a mistake",
          "make an effort",
          "take a research",
          "give an attention"
        ],
        answer: 1,
        explanation: "make an effort\uAC00 \uC62C\uBC14\uB978 \uC5F0\uC5B4\uC785\uB2C8\uB2E4. mistake\uB294 make, research\uB294 conduct/do, attention\uC740 pay\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q05",
        skill: "phrasal-verb",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "Please ___ the form and submit it today."',
        choices: ["fill out", "fill up", "fill in on", "fill off"],
        answer: 0,
        explanation: "fill out (a form)\uC740 \u2018\uC591\uC2DD\uC744 \uC791\uC131\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4. fill up\uC740 \u2018\uAC00\uB4DD \uCC44\uC6B0\uB2E4\u2019\uC5D0 \uAC00\uAE5D\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q06",
        skill: "context",
        question: '"She came across an old photo."\uC758 \uC758\uBBF8\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: [
          "\uC77C\uBD80\uB7EC \uC0AC\uC9C4\uC744 \uCC3E\uC558\uB2E4",
          "\uC6B0\uC5F0\uD788 \uC0AC\uC9C4\uC744 \uBC1C\uACAC\uD588\uB2E4",
          "\uC0AC\uC9C4\uC744 \uD3D0\uAE30\uD588\uB2E4",
          "\uC0AC\uC9C4\uC744 \uBCF5\uC0AC\uD588\uB2E4"
        ],
        answer: 1,
        explanation: "come across\uB294 \u2018\uC6B0\uC5F0\uD788 \uB9C8\uC8FC\uCE58\uB2E4/\uBC1C\uACAC\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q07",
        skill: "collocation",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "He ___ attention to the warning signs."',
        choices: ["made", "did", "paid", "gave"],
        answer: 2,
        explanation: "pay attention to\uAC00 \uACE0\uBE48\uB3C4 \uC5F0\uC5B4\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q08",
        skill: "phrasal-verb",
        question: '"put up with the noise"\uC640 \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uB73B\uC740?',
        choices: ["\uC18C\uC74C\uC744 \uC990\uAE30\uB2E4", "\uC18C\uC74C\uC744 \uCC38\uB2E4", "\uC18C\uC74C\uC744 \uCE21\uC815\uD558\uB2E4", "\uC18C\uC74C\uC744 \uC904\uC774\uB2E4"],
        answer: 1,
        explanation: "put up with\uB294 tolerate, endure\uB85C \u2018\uCC38\uB2E4, \uACAC\uB514\uB2E4\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q09",
        skill: "context",
        question: "\uB2E4\uC74C \uC911 put off\uAC00 \uC62C\uBC14\uB974\uAC8C \uC4F0\uC778 \uBB38\uC7A5\uC740?",
        choices: [
          "They put off the lights before leaving.",
          "She put off her coat on the chair.",
          "We put off discussing the budget.",
          "He put off to the station early."
        ],
        answer: 2,
        explanation: "put off + V-ing/\uBA85\uC0AC\uB294 \u2018\uC5F0\uAE30\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4. \uBD88\uC744 \uB044\uB294 \uAC83\uC740 turn off, \uC637\uC744 \uBC97\uB294 \uAC83\uC740 take off\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-014-Q10",
        skill: "collocation",
        question: '"take part in the workshop"\uC758 \uC758\uBBF8\uB294?',
        choices: ["\uC6CC\uD06C\uC20D\uC744 \uCDE8\uC18C\uD558\uB2E4", "\uC6CC\uD06C\uC20D\uC5D0 \uCC38\uC5EC\uD558\uB2E4", "\uC6CC\uD06C\uC20D\uC744 \uC900\uBE44\uD558\uB2E4", "\uC6CC\uD06C\uC20D\uC744 \uD3C9\uAC00\uD558\uB2E4"],
        answer: 1,
        explanation: "take part in\uC740 participate in\uACFC \uAC19\uC544 \u2018\uCC38\uC5EC\uD558\uB2E4\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-015.json
  var F_015_default = {
    id: "F-015",
    order: 15,
    title: "\uD63C\uB3D9\uD558\uAE30 \uC26C\uC6B4 \uC5B4\uD718",
    category: "vocabulary",
    estimatedMinutes: 14,
    skills: ["confusable-words", "precise-usage", "context"],
    objectives: [
      "\uD615\uD0DC\xB7\uC758\uBBF8\uAC00 \uBE44\uC2B7\uD55C \uD63C\uB3D9 \uC5B4\uD718\uB97C \uAD6C\uBD84\uD55C\uB2E4",
      "\uBB38\uB9E5\uC5D0 \uB9DE\uB294 \uC815\uD655\uD55C \uB2E8\uC5B4\uB97C \uACE0\uB978\uB2E4",
      "\uD488\uC0AC\xB7\uB258\uC559\uC2A4 \uCC28\uC774\uB97C \uC124\uBA85\uC73C\uB85C \uC815\uB9AC\uD55C\uB2E4"
    ],
    concept: {
      summary: "affect/effect, raise/rise, borrow/lend\uCC98\uB7FC \uBE44\uC2B7\uD574 \uBCF4\uC774\uB294 \uB2E8\uC5B4\uB294 TEPS\uC5D0\uC11C \uC790\uC8FC \uCD9C\uC81C\uB429\uB2C8\uB2E4. \uB73B\uB9CC \uC678\uC6B0\uC9C0 \uB9D0\uACE0 \u2018\uC8FC\uC5B4\uAC00 \uBB34\uC5C7\uC744 \uD558\uB294\uC9C0\u2019, \u2018\uBAA9\uC801\uC5B4\uAC00 \uD544\uC694\uD55C\uC9C0\u2019\uB97C \uD568\uAED8 \uBCF4\uBA74 \uC624\uB2F5\uC774 \uC904\uC5B4\uB4ED\uB2C8\uB2E4. \uD63C\uB3D9\uC30D\uC740 \uB300\uBE44\uD45C\uB85C \uC815\uB9AC\uD558\uB294 \uAC83\uC774 \uAC00\uC7A5 \uD6A8\uC728\uC801\uC785\uB2C8\uB2E4.",
      points: [
        "\uB3D9\uC0AC/\uBA85\uC0AC \uD488\uC0AC\uBD80\uD130 \uD655\uC778\uD55C\uB2E4",
        "\uD0C0\uB3D9\uC0AC\uC778\uC9C0 \uC790\uB3D9\uC0AC\uC778\uC9C0 \uBCF8\uB2E4",
        "\uC8FC\uC5B4\xB7\uBAA9\uC801\uC5B4 \uAD00\uACC4\uB97C \uBA3C\uC800 \uADF8\uB9B0\uB2E4",
        "\uC608\uBB38\uC744 \uD55C \uC30D\uC529 \uBE44\uAD50\uD574 \uACE0\uC815\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "The policy will affect housing prices.",
        ko: "\uADF8 \uC815\uCC45\uC740 \uC8FC\uD0DD \uAC00\uACA9\uC5D0 \uC601\uD5A5\uC744 \uBBF8\uCE60 \uAC83\uC774\uB2E4.",
        structure: "affect(V) vs effect(N)"
      },
      {
        en: "Prices continue to rise.",
        ko: "\uBB3C\uAC00\uAC00 \uACC4\uC18D \uC624\uB978\uB2E4.",
        structure: "rise(\uC790\uB3D9\uC0AC) / raise(\uD0C0\uB3D9\uC0AC)"
      },
      {
        en: "Can you lend me your notes?",
        ko: "\uB178\uD2B8\uB97C \uC880 \uBE4C\uB824\uC904 \uC218 \uC788\uB098\uC694?",
        structure: "lend = give temporarily / borrow = take temporarily"
      }
    ],
    checks: [
      {
        id: "F-015-Q01",
        skill: "confusable-words",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "Stress can ___ your sleep quality."',
        choices: ["effect", "affect", "affection", "effective"],
        answer: 1,
        explanation: "\uC5EC\uAE30\uC11C\uB294 \uB3D9\uC0AC\uAC00 \uD544\uC694\uD558\uBBC0\uB85C affect\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4. effect\uB294 \uC8FC\uB85C \uBA85\uC0AC \u2018\uACB0\uACFC/\uC601\uD5A5\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q02",
        skill: "precise-usage",
        question: "\uB2E4\uC74C \uC911 \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "They raised early this morning.",
          "The sun raised at 6 a.m.",
          "She raised her hand to ask a question.",
          "Costs are raising quickly."
        ],
        answer: 2,
        explanation: "raise\uB294 \uD0C0\uB3D9\uC0AC\uB77C \uBAA9\uC801\uC5B4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. \uD574\uAC00 \uB728\uB2E4/\uBE44\uC6A9\uC774 \uC624\uB974\uB2E4\uB294 rise\uB97C \uC501\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q03",
        skill: "confusable-words",
        question: '"I need to ___ a book from the library."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["lend", "borrow", "loan to", "owe"],
        answer: 1,
        explanation: "\uBE4C\uB9AC\uB294 \uCABD\uC740 borrow, \uBE4C\uB824\uC8FC\uB294 \uCABD\uC740 lend\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q04",
        skill: "context",
        question: '"He is currently ___ in Seoul."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["living", "leaving", "lefting", "leaved"],
        answer: 0,
        explanation: "live(\uAC70\uC8FC\uD558\uB2E4)\uC640 leave(\uB5A0\uB098\uB2E4)\uB97C \uD63C\uB3D9\uD558\uC9C0 \uB9C8\uC138\uC694. \uD604\uC7AC \uAC70\uC8FC\uB294 living\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q05",
        skill: "confusable-words",
        question: '"The ___ of the new rule was immediate."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["affect", "effect", "affective", "affected"],
        answer: 1,
        explanation: "\uAD00\uC0AC the \uB4A4\uC774\uBBC0\uB85C \uBA85\uC0AC effect(\uACB0\uACFC/\uC601\uD5A5)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q06",
        skill: "precise-usage",
        question: "\uB2E4\uC74C \uC911 economic\uACFC economical\uC758 \uC4F0\uC784\uC774 \uC62C\uBC14\uB978 \uAC83\uC740?",
        choices: [
          "an economical crisis",
          "economic growth this year",
          "an economic car",
          "economical policy debate"
        ],
        answer: 1,
        explanation: "economic\uC740 \u2018\uACBD\uC81C\uC758\u2019, economical\uC740 \u2018\uC808\uC57D\uD558\uB294/\uACBD\uC81C\uC801\uC778\u2019\uC785\uB2C8\uB2E4. economic growth\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uACE0, \uCC28\uB294 economical car\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q07",
        skill: "confusable-words",
        question: '"Please ___ me know when you arrive."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["let", "make", "allow", "permit"],
        answer: 0,
        explanation: "let someone know\uAC00 \uACE0\uC815 \uD45C\uD604\uC785\uB2C8\uB2E4. make me know\uB294 \uC4F0\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q08",
        skill: "precise-usage",
        question: '"She is ___ for the delay."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["responsible", "responsive", "response", "responding"],
        answer: 0,
        explanation: "be responsible for\uB294 \u2018~\uC5D0 \uCC45\uC784\uC774 \uC788\uB2E4\u2019\uC785\uB2C8\uB2E4. responsive\uB294 \u2018\uBC18\uC751\uC774 \uBE60\uB978\u2019\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q09",
        skill: "context",
        question: '"The weather ___ our outdoor plans."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["effected", "affected", "affection", "effective"],
        answer: 1,
        explanation: "\uACFC\uAC70\uD615 \uB3D9\uC0AC\uB85C \u2018\uC601\uD5A5\uC744 \uBBF8\uCCE4\uB2E4\u2019\uB294 affected\uC785\uB2C8\uB2E4. effect\uC758 \uACFC\uAC70\uD615 effected\uB294 \u2018\uC131\uCDE8\uD558\uB2E4\u2019 \uB73B\uC73C\uB85C \uB4DC\uBB45\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-015-Q10",
        skill: "confusable-words",
        question: '"Could you ___ me some money until Friday?"\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["borrow", "lend", "rent", "owe"],
        answer: 1,
        explanation: "\uC0C1\uB300\uAC00 \u2018\uB098\uC5D0\uAC8C \uBE4C\uB824\uC8FC\uB294\u2019 \uC0C1\uD669\uC774\uBBC0\uB85C lend me\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-016.json
  var F_016_default = {
    id: "F-016",
    order: 16,
    title: "\uC808\uC744 \uC5F0\uACB0\uD558\uAE30",
    category: "expand",
    estimatedMinutes: 14,
    skills: ["clause-linking", "conjunctions", "sentence-expansion"],
    objectives: [
      "\uB4F1\uC704\xB7\uC885\uC18D \uC811\uC18D\uC0AC\uB85C \uC808\uC744 \uC5F0\uACB0\uD558\uB294 \uBC29\uBC95\uC744 \uC775\uD78C\uB2E4",
      "\uC6D0\uC778\xB7\uB300\uC870\xB7\uC870\uAC74\xB7\uC2DC\uAC04\uC758 \uAD00\uACC4\uB97C \uBB38\uC7A5\uC73C\uB85C \uD45C\uD604\uD55C\uB2E4",
      "\uC9E7\uC740 \uBB38\uC7A5 \uB450 \uAC1C\uB97C \uB17C\uB9AC\uC801\uC73C\uB85C \uD569\uCE5C\uB2E4"
    ],
    concept: {
      summary: "\uAE34 \uBB38\uC7A5\uC740 \uC808\uACFC \uC808\uC744 \uC5F0\uACB0\uD558\uB294 \uB2A5\uB825\uC5D0\uC11C \uC2DC\uC791\uB429\uB2C8\uB2E4. and/but/so \uAC19\uC740 \uB4F1\uC704\uC811\uC18D\uC0AC\uC640 because/although/if/when \uAC19\uC740 \uC885\uC18D\uC811\uC18D\uC0AC\uB97C \uAD6C\uBD84\uD558\uBA74 \uBB38\uC7A5 \uD655\uC7A5\uC774 \uC26C\uC6CC\uC9D1\uB2C8\uB2E4. TEPS \uB3C5\uD574\uC5D0\uC11C\uB3C4 \uC5F0\uACB0\uC5B4\uAC00 \uB17C\uB9AC \uD750\uB984\uC758 \uC2E0\uD638\uC785\uB2C8\uB2E4.",
      points: [
        "\uB4F1\uC704\uC811\uC18D\uC0AC: \uB300\uB4F1\uD55C \uC808\uC744 \uC5F0\uACB0\uD55C\uB2E4",
        "\uC885\uC18D\uC811\uC18D\uC0AC: \uC8FC\uC808\uC5D0 \uC885\uC18D\uC808\uC744 \uBD99\uC778\uB2E4",
        "\uC5F0\uACB0\uC5B4\uB294 \uC758\uBBF8 \uAD00\uACC4(\uC6D0\uC778\xB7\uB300\uC870\xB7\uC870\uAC74)\uB97C \uB4DC\uB7EC\uB0B8\uB2E4",
        "\uCF64\uB9C8 \uC0AC\uC6A9\uC740 \uC808\uC758 \uAE38\uC774\uC640 \uC704\uCE58\uC5D0 \uB530\uB77C \uB2EC\uB77C\uC9C4\uB2E4"
      ]
    },
    examples: [
      {
        en: "She stayed home because she felt sick.",
        ko: "\uADF8\uB140\uB294 \uC544\uD30C\uC11C \uC9D1\uC5D0 \uC788\uC5C8\uB2E4.",
        structure: "\uC8FC\uC808 + because + \uC885\uC18D\uC808"
      },
      {
        en: "Although the test was hard, he finished on time.",
        ko: "\uC2DC\uD5D8\uC774 \uC5B4\uB824\uC6E0\uC9C0\uB9CC \uADF8\uB294 \uC81C\uC2DC\uAC04\uC5D0 \uB05D\uB0C8\uB2E4.",
        structure: "Although + \uC885\uC18D\uC808, \uC8FC\uC808"
      },
      {
        en: "If it rains, the event will be postponed.",
        ko: "\uBE44\uAC00 \uC624\uBA74 \uD589\uC0AC\uB294 \uC5F0\uAE30\uB420 \uAC83\uC774\uB2E4.",
        structure: "If + \uC870\uAC74\uC808, \uC8FC\uC808"
      }
    ],
    checks: [
      {
        id: "F-016-Q01",
        skill: "conjunctions",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "He left early ___ he had another appointment."',
        choices: ["although", "because", "unless", "while"],
        answer: 1,
        explanation: "\uC774\uC720\uB97C \uB098\uD0C0\uB0B4\uBBC0\uB85C because\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q02",
        skill: "clause-linking",
        question: '\uB450 \uBB38\uC7A5\uC744 \uAC00\uC7A5 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5F0\uACB0\uD55C \uAC83\uC740? "It was late. She kept working."',
        choices: [
          "It was late, so she kept working.",
          "It was late, but she kept working.",
          "It was late, because she kept working.",
          "It was late, if she kept working."
        ],
        answer: 1,
        explanation: "\uB2A6\uC740 \uC2DC\uAC04\uACFC \uACC4\uC18D \uC77C\uD55C \uAC83\uC740 \uB300\uC870 \uAD00\uACC4\uC774\uBBC0\uB85C but\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q03",
        skill: "conjunctions",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "___ you finish the report, we can leave."',
        choices: ["Unless", "Although", "Once", "Yet"],
        answer: 2,
        explanation: "Once\uB294 \u2018~\uD558\uC790\uB9C8\uC790/~\uD558\uBA74\u2019\uC758 \uC2DC\uAC04\xB7\uC870\uAC74 \uC5F0\uACB0\uC5D0 \uC4F0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q04",
        skill: "sentence-expansion",
        question: "\uB2E4\uC74C \uC911 \uBB38\uBC95\uC801\uC73C\uB85C \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "Because he was tired. He went to bed.",
          "He went to bed because he was tired.",
          "He went to bed, because of he was tired.",
          "Because of he was tired, he went to bed."
        ],
        answer: 1,
        explanation: "because \uB4A4\uC5D0\uB294 \uC808(S+V)\uC774 \uC635\uB2C8\uB2E4. Because\uB9CC\uC73C\uB85C \uBB38\uC7A5\uC744 \uB04A\uC73C\uBA74 \uBD88\uC644\uC804\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q05",
        skill: "conjunctions",
        question: '"She will join us ___ she is free."\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740?',
        choices: ["if", "although", "so", "but"],
        answer: 0,
        explanation: "\uC870\uAC74\uC744 \uB098\uD0C0\uB0B4\uBBC0\uB85C if\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q06",
        skill: "clause-linking",
        question: "\uB300\uC870\uB97C \uB098\uD0C0\uB0B4\uB294 \uC5F0\uACB0\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "I studied hard, so I passed.",
          "I studied hard, and I passed.",
          "I studied hard, but I failed.",
          "I studied hard, because I failed."
        ],
        answer: 2,
        explanation: "but\uC740 \uAE30\uB300\uC640 \uB2E4\uB978 \uACB0\uACFC\uB97C \uC787\uB294 \uB300\uC870 \uC811\uC18D\uC0AC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q07",
        skill: "conjunctions",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "___ the delay, the project was completed."',
        choices: ["Although", "Despite", "Because", "If"],
        answer: 1,
        explanation: "Despite \uB4A4\uC5D0\uB294 \uBA85\uC0AC\uAD6C\uAC00 \uC635\uB2C8\uB2E4. Although \uB4A4\uC5D0\uB294 \uC808\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q08",
        skill: "sentence-expansion",
        question: '"I will call you when I arrive."\uC5D0\uC11C when\uC808\uC758 \uC5ED\uD560\uC740?',
        choices: ["\uC8FC\uC5B4", "\uBAA9\uC801\uC5B4", "\uC2DC\uAC04 \uC885\uC18D\uC808", "\uBCF4\uC5B4"],
        answer: 2,
        explanation: "when I arrive\uB294 \uC8FC\uC808\uC758 \uC2DC\uAC04\uC744 \uB098\uD0C0\uB0B4\uB294 \uC885\uC18D\uC808\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q09",
        skill: "clause-linking",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "Take a map, ___ you may get lost."',
        choices: ["or", "but", "so", "although"],
        answer: 0,
        explanation: "\uADF8\uB807\uC9C0 \uC54A\uC73C\uBA74(~\uD558\uC9C0 \uC54A\uC73C\uBA74)\uC758 \uACBD\uACE0\xB7\uC120\uD0DD \uAD00\uACC4\uC5D0\uC11C\uB294 or\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-016-Q10",
        skill: "conjunctions",
        question: "\uB2E4\uC74C \uC911 unless\uC758 \uC758\uBBF8\uAC00 \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "Unless you hurry, you will be late.",
          "Unless you hurry, you will not be late.",
          "Unless it is cheap, I will buy it.",
          "Unless she studied, she passed."
        ],
        answer: 0,
        explanation: "unless\uB294 if not(~\uD558\uC9C0 \uC54A\uC73C\uBA74)\uC785\uB2C8\uB2E4. \uC11C\uB450\uB974\uC9C0 \uC54A\uC73C\uBA74 \uB2A6\uB294\uB2E4\uB294 \uB73B\uC774 \uB429\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-017.json
  var F_017_default = {
    id: "F-017",
    order: 17,
    title: "\uC218\uC2DD\uC5B4 \uBD99\uC774\uAE30",
    category: "expand",
    estimatedMinutes: 14,
    skills: ["modifiers", "adjective-adverb", "relative-modifier"],
    objectives: [
      "\uD615\uC6A9\uC0AC\xB7\uBD80\uC0AC\xB7\uC804\uCE58\uC0AC\uAD6C\uB85C \uBB38\uC7A5\uC744 \uD655\uC7A5\uD55C\uB2E4",
      "\uC218\uC2DD \uB300\uC0C1\uC774 \uBB34\uC5C7\uC778\uC9C0 \uC815\uD655\uD788 \uD30C\uC545\uD55C\uB2E4",
      "\uAD00\uACC4\uC808\xB7\uBD84\uC0AC\uAD6C\uB85C \uC815\uBCF4\uB97C \uB367\uBD99\uC774\uB294 \uAC10\uAC01\uC744 \uC775\uD78C\uB2E4"
    ],
    concept: {
      summary: "\uAE30\uBCF8 \uBB38\uC7A5\uC5D0 \uC218\uC2DD\uC5B4\uB97C \uBD99\uC774\uBA74 \uC815\uBCF4\uAC00 \uD48D\uBD80\uD55C \uBB38\uC7A5\uC774 \uB429\uB2C8\uB2E4. \uD615\uC6A9\uC0AC\uB294 \uBA85\uC0AC\uB97C, \uBD80\uC0AC\uB294 \uB3D9\uC0AC\xB7\uD615\uC6A9\uC0AC\xB7\uBB38\uC7A5\uC744 \uAFB8\uBC09\uB2C8\uB2E4. \uC804\uCE58\uC0AC\uAD6C\uC640 \uAD00\uACC4\uC808\uB3C4 \uAC19\uC740 \u2018\uAFB8\uBBF8\uAE30\u2019 \uAE30\uB2A5\uC744 \uD558\uBBC0\uB85C, \uBB34\uC5C7\uC774 \uBB34\uC5C7\uC744 \uC218\uC2DD\uD558\uB294\uC9C0 \uD45C\uC2DC\uD558\uBA70 \uC77D\uB294 \uC5F0\uC2B5\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
      points: [
        "\uD615\uC6A9\uC0AC: \uBA85\uC0AC \uC55E/\uB4A4(\uBCF4\uC5B4)\uC5D0\uC11C \uBA85\uC0AC\uB97C \uAFB8\uBBFC\uB2E4",
        "\uBD80\uC0AC: how/when/where/\uC815\uB3C4\uB97C \uB354\uD55C\uB2E4",
        "\uC804\uCE58\uC0AC\uAD6C\uB294 \uC704\uCE58\xB7\uC2DC\uAC04\xB7\uBC29\uBC95 \uC815\uBCF4\uB97C \uBD99\uC778\uB2E4",
        "\uAD00\uACC4\uC808\xB7\uBD84\uC0AC\uB294 \uBA85\uC0AC\uB97C \uAE38\uAC8C \uC218\uC2DD\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "The careful manager reviewed the report thoroughly.",
        ko: "\uC2E0\uC911\uD55C \uAD00\uB9AC\uC790\uAC00 \uBCF4\uACE0\uC11C\uB97C \uCCA0\uC800\uD788 \uAC80\uD1A0\uD588\uB2E4.",
        structure: "\uD615\uC6A9\uC0AC careful / \uBD80\uC0AC thoroughly"
      },
      {
        en: "The book on the desk belongs to Mina.",
        ko: "\uCC45\uC0C1 \uC704\uC758 \uCC45\uC740 \uBBF8\uB098\uC758 \uAC83\uC774\uB2E4.",
        structure: "\uC804\uCE58\uC0AC\uAD6C on the desk \u2192 book \uC218\uC2DD"
      },
      {
        en: "Employees who arrive early get better seats.",
        ko: "\uC77C\uCC0D \uB3C4\uCC29\uD558\uB294 \uC9C1\uC6D0\uB4E4\uC774 \uB354 \uC88B\uC740 \uC88C\uC11D\uC744 \uBC1B\uB294\uB2E4.",
        structure: "\uAD00\uACC4\uC808 who arrive early \u2192 Employees \uC218\uC2DD"
      }
    ],
    checks: [
      {
        id: "F-017-Q01",
        skill: "adjective-adverb",
        question: '"She answered the question correctly."\uC5D0\uC11C correctly\uAC00 \uC218\uC2DD\uD558\uB294 \uAC83\uC740?',
        choices: ["She", "question", "answered", "the"],
        answer: 2,
        explanation: "\uBD80\uC0AC correctly\uB294 \uB3D9\uC0AC answered\uC758 \uBC29\uC2DD\uC744 \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q02",
        skill: "modifiers",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "It was a ___ decision."',
        choices: ["careful", "carefully", "care", "caringness"],
        answer: 0,
        explanation: "\uBA85\uC0AC decision \uC55E\uC5D0\uB294 \uD615\uC6A9\uC0AC careful\uC774 \uC635\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q03",
        skill: "relative-modifier",
        question: '"The laptop that I bought yesterday is light."\uC5D0\uC11C that\uC808\uC774 \uC218\uC2DD\uD558\uB294 \uAC83\uC740?',
        choices: ["yesterday", "is", "The laptop", "light"],
        answer: 2,
        explanation: "\uAD00\uACC4\uC808 that I bought yesterday\uB294 The laptop\uC744 \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q04",
        skill: "modifiers",
        question: "\uB2E4\uC74C \uC911 \uC218\uC2DD \uAD00\uACC4\uAC00 \uC5B4\uC0C9\uD55C \uBB38\uC7A5\uC740?",
        choices: [
          "He spoke in a clear voice.",
          "He spoke clearly.",
          "He gave a clearly explanation.",
          "His explanation was clear."
        ],
        answer: 2,
        explanation: "\uBA85\uC0AC explanation \uC55E\uC5D0\uB294 \uD615\uC6A9\uC0AC clear\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. clearly\uB294 \uBD80\uC0AC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q05",
        skill: "modifiers",
        question: '"People in the front row could hear better."\uC5D0\uC11C in the front row\uAC00 \uC218\uC2DD\uD558\uB294 \uAC83\uC740?',
        choices: ["hear", "better", "People", "could"],
        answer: 2,
        explanation: "\uC804\uCE58\uC0AC\uAD6C in the front row\uB294 People\uC744 \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q06",
        skill: "adjective-adverb",
        question: '\uBE48\uCE78\uC5D0 \uC54C\uB9DE\uC740 \uAC83\uC740? "The team performed ___ in the final."',
        choices: ["impressive", "impressively", "impression", "impressed"],
        answer: 1,
        explanation: "\uB3D9\uC0AC performed\uB97C \uC218\uC2DD\uD558\uB824\uBA74 \uBD80\uC0AC impressively\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q07",
        skill: "relative-modifier",
        question: "\uBB38\uC7A5\uC744 \uD655\uC7A5\uD560 \uB54C \uAC00\uC7A5 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uAC83\uC740?",
        choices: [
          "I met a woman works at the bank.",
          "I met a woman who works at the bank.",
          "I met a woman which works at the bank.",
          "I met a woman working she at the bank."
        ],
        answer: 1,
        explanation: "\uC0AC\uB78C\uC744 \uC218\uC2DD\uD558\uB294 \uAD00\uACC4\uB300\uBA85\uC0AC\uB294 who\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q08",
        skill: "modifiers",
        question: '"Almost every applicant submitted a resume."\uC5D0\uC11C Almost\uAC00 \uC218\uC2DD\uD558\uB294 \uAC83\uC740?',
        choices: ["submitted", "every", "resume", "applicant"],
        answer: 1,
        explanation: "Almost\uB294 every\uB97C \uC218\uC2DD\uD558\uC5EC \u2018\uAC70\uC758 \uBAA8\uB4E0\u2019\uC758 \uC758\uBBF8\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q09",
        skill: "adjective-adverb",
        question: "\uB2E4\uC74C \uC911 \uC62C\uBC14\uB978 \uBB38\uC7A5\uC740?",
        choices: [
          "She feels happily today.",
          "She feels happy today.",
          "She feels more happily today.",
          "She feels happinessly today."
        ],
        answer: 1,
        explanation: "feel \uAC19\uC740 \uAC10\uAC01\uB3D9\uC0AC \uB4A4\uC5D0\uB294 \uC8FC\uC5B4 \uC0C1\uD0DC\uB97C \uC124\uBA85\uD558\uB294 \uD615\uC6A9\uC0AC\uAC00 \uC635\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-017-Q10",
        skill: "relative-modifier",
        question: '"Students interested in design joined the club."\uC5D0\uC11C interested in design\uC758 \uC5ED\uD560\uC740?',
        choices: ["\uC8FC\uC5B4", "\uBCF8\uB3D9\uC0AC", "Students\uB97C \uC218\uC2DD\uD558\uB294 \uBD84\uC0AC\uAD6C", "\uBAA9\uC801\uC5B4"],
        answer: 2,
        explanation: "\uACFC\uAC70\uBD84\uC0AC\uAD6C interested in design\uC740 Students\uB97C \uB4A4\uC5D0\uC11C \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-018.json
  var F_018_default = {
    id: "F-018",
    order: 18,
    title: "\uAE34 \uBB38\uC7A5 \uC77D\uAE30",
    category: "expand",
    estimatedMinutes: 15,
    skills: ["long-sentence", "core-structure", "modifier-parsing"],
    objectives: [
      "\uAE34 \uBB38\uC7A5\uC5D0\uC11C \uC8FC\uC5B4\xB7\uB3D9\uC0AC \uBF08\uB300\uB97C \uBA3C\uC800 \uCC3E\uB294\uB2E4",
      "\uC0BD\uC785\xB7\uC218\uC2DD \uC694\uC18C\uB97C \uAD04\uD638\uCC98\uB7FC \uBB36\uC5B4 \uC77D\uB294\uB2E4",
      "\uD575\uC2EC \uC758\uBBF8\uB97C \uD55C \uBB38\uC7A5\uC73C\uB85C \uC694\uC57D\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uAE34 \uBB38\uC7A5\uC740 \uC815\uBCF4\uAC00 \uB9CE\uC544\uC11C \uC5B4\uB835\uC9C0, \uAD6C\uC870\uAC00 \uC644\uC804\uD788 \uB2E4\uB978 \uAC83\uC740 \uC544\uB2D9\uB2C8\uB2E4. \uBA3C\uC800 \uC8FC\uC5B4\uC640 \uBCF8\uB3D9\uC0AC\uB97C \uCC3E\uACE0, \uAD00\uACC4\uC808\xB7\uC804\uCE58\uC0AC\uAD6C\xB7\uC0BD\uC785\uAD6C\uB294 \uC7A0\uC2DC \uC606\uC5D0 \uB450\uB294 \uC804\uB7B5\uC774 \uD6A8\uACFC\uC801\uC785\uB2C8\uB2E4. TEPS \uB3C5\uD574 \uBB38\uC7A5\uB3C4 \uAC19\uC740 \uBC29\uC2DD\uC73C\uB85C \u2018\uBF08\uB300 \u2192 \uC218\uC2DD\u2019 \uC21C\uC73C\uB85C \uC77D\uC73C\uBA74 \uC18D\uB3C4\uAC00 \uBD99\uC2B5\uB2C8\uB2E4.",
      points: [
        "S\uC640 V\uB97C \uBA3C\uC800 \uD45C\uC2DC\uD55C\uB2E4",
        "who/which/that\uC808\uC740 \uBA85\uC0AC\uC5D0 \uBD99\uB294 \uC124\uBA85\uC774\uB2E4",
        "\uCF64\uB9C8\uB85C \uBB36\uC778 \uC0BD\uC785\uAD6C\uB294 \uD575\uC2EC\uC774 \uC544\uB2D0 \uC218 \uC788\uB2E4",
        "\uBF08\uB300\uB97C \uD55C \uC904\uB85C \uC694\uC57D\uD55C \uB4A4 \uC138\uBD80\uC815\uBCF4\uB97C \uB354\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "The report that the committee submitted last week includes several recommendations.",
        ko: "\uC704\uC6D0\uD68C\uAC00 \uC9C0\uB09C\uC8FC\uC5D0 \uC81C\uCD9C\uD55C \uBCF4\uACE0\uC11C\uB294 \uBA87 \uAC00\uC9C0 \uAD8C\uACE0\uC548\uC744 \uD3EC\uD568\uD55C\uB2E4.",
        structure: "The report ... includes ..."
      },
      {
        en: "Many workers, tired after the long shift, went home immediately.",
        ko: "\uAE34 \uADFC\uBB34 \uD6C4 \uC9C0\uCE5C \uB9CE\uC740 \uC9C1\uC6D0\uB4E4\uC774 \uACE7\uBC14\uB85C \uC9D1\uC5D0 \uAC14\uB2E4.",
        structure: "Many workers ... went home"
      },
      {
        en: "The policy announced in March aims to reduce traffic in the downtown area.",
        ko: "3\uC6D4\uC5D0 \uBC1C\uD45C\uB41C \uC815\uCC45\uC740 \uB3C4\uC2EC \uAD50\uD1B5\uC744 \uC904\uC774\uB294 \uAC83\uC744 \uBAA9\uD45C\uB85C \uD55C\uB2E4.",
        structure: "The policy ... aims to reduce ..."
      }
    ],
    checks: [
      {
        id: "F-018-Q01",
        skill: "core-structure",
        question: '\uBB38\uC7A5 "The manager who joined last month revised the schedule."\uC758 \uBCF8\uB3D9\uC0AC\uB294?',
        choices: ["who", "joined", "revised", "schedule"],
        answer: 2,
        explanation: "\uC8FC\uC5B4 The manager\uC758 \uBCF8\uB3D9\uC0AC\uB294 revised\uC785\uB2C8\uB2E4. who joined last month\uB294 \uC218\uC2DD\uC808\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q02",
        skill: "long-sentence",
        question: '"Books written in simple English help adult learners rebuild confidence."\uC758 \uC8FC\uC5B4 \uD575\uC740?',
        choices: ["English", "Books", "learners", "confidence"],
        answer: 1,
        explanation: "\uC8FC\uC5B4\uC758 \uD575\uC740 Books\uC774\uACE0, written in simple English\uAC00 \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q03",
        skill: "modifier-parsing",
        question: '\uB2E4\uC74C \uBB38\uC7A5\uC5D0\uC11C \uC0BD\uC785\uB41C \uC124\uBA85 \uBD80\uBD84\uC740? "The proposal, despite strong opposition, was approved."',
        choices: ["The proposal", "despite strong opposition", "was approved", "proposal was"],
        answer: 1,
        explanation: "\uCF64\uB9C8 \uC0AC\uC774\uC758 despite strong opposition\uC740 \uBD80\uAC00 \uC815\uBCF4\uC785\uB2C8\uB2E4. \uBF08\uB300\uB294 The proposal was approved\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q04",
        skill: "core-structure",
        question: '\uBB38\uC7A5\uC758 \uD575\uC2EC \uC758\uBBF8\uB85C \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uAC83\uC740? "Customers who waited more than an hour received a discount."',
        choices: [
          "\uBAA8\uB4E0 \uACE0\uAC1D\uC774 \uD560\uC778\uC744 \uBC1B\uC558\uB2E4",
          "\uD55C \uC2DC\uAC04 \uC774\uC0C1 \uAE30\uB2E4\uB9B0 \uACE0\uAC1D\uC774 \uD560\uC778\uC744 \uBC1B\uC558\uB2E4",
          "\uACE0\uAC1D\uC774 \uD55C \uC2DC\uAC04\uC744 \uD560\uC778\uBC1B\uC558\uB2E4",
          "\uD560\uC778\uC774 \uD55C \uC2DC\uAC04 \uC774\uC0C1 \uC9C0\uC5F0\uB418\uC5C8\uB2E4"
        ],
        answer: 1,
        explanation: "\uAD00\uACC4\uC808 who waited more than an hour\uAC00 \uC5B4\uB5A4 \uACE0\uAC1D\uC778\uC9C0 \uD55C\uC815\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q05",
        skill: "long-sentence",
        question: '"The results collected during the survey suggest a clear trend."\uC5D0\uC11C \uC8FC\uC5B4\uC758 \uD575\uC740?',
        choices: ["survey", "trend", "The results", "collected"],
        answer: 2,
        explanation: "\uC8FC\uC5B4\uC758 \uD575\uC740 The results\uC774\uACE0, collected during the survey\uB294 \uC218\uC2DD\uC5B4\uC785\uB2C8\uB2E4. \uB3D9\uC0AC suggest\uC640 \uC218\uC77C\uCE58\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q06",
        skill: "modifier-parsing",
        question: '"A plan to improve public transport was discussed at the meeting."\uC5D0\uC11C to improve public transport\uAC00 \uC218\uC2DD\uD558\uB294 \uAC83\uC740?',
        choices: ["was", "meeting", "A plan", "discussed"],
        answer: 2,
        explanation: "to\uBD80\uC815\uC0AC\uAD6C\uB294 A plan\uC758 \uB0B4\uC6A9\uC744 \uC124\uBA85\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q07",
        skill: "core-structure",
        question: "\uAE34 \uBB38\uC7A5 \uC77D\uAE30\uC5D0\uC11C \uAC00\uC7A5 \uBA3C\uC800 \uD560 \uC77C\uC740?",
        choices: [
          "\uBAA8\uB974\uB294 \uB2E8\uC5B4\uB97C \uBAA8\uB450 \uCC3E\uB294\uB2E4",
          "\uC8FC\uC5B4\uC640 \uBCF8\uB3D9\uC0AC\uB97C \uCC3E\uB294\uB2E4",
          "\uC811\uC18D\uC0AC\uB97C \uBAA8\uB450 \uBC88\uC5ED\uD55C\uB2E4",
          "\uBD80\uC0AC\uB9CC \uD45C\uC2DC\uD55C\uB2E4"
        ],
        answer: 1,
        explanation: "\uBF08\uB300(S+V)\uB97C \uBA3C\uC800 \uC7A1\uC73C\uBA74 \uC218\uC2DD \uC694\uC18C\uB97C \uC548\uC804\uD558\uAC8C \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q08",
        skill: "long-sentence",
        question: '\uBB38\uC7A5 \uC694\uC57D\uC73C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740? "Researchers at the institute published a paper on sleep and memory last year."',
        choices: [
          "\uC5F0\uAD6C\uC18C \uC5F0\uAD6C\uC790\uB4E4\uC774 \uC218\uBA74\uACFC \uAE30\uC5B5\uC5D0 \uAD00\uD55C \uB17C\uBB38\uC744 \uB0C8\uB2E4",
          "\uC218\uBA74\uC774 \uC5F0\uAD6C\uC18C\uB97C \uCD9C\uD310\uD588\uB2E4",
          "\uAE30\uC5B5\uC774 \uC791\uB144\uC5D0 \uB17C\uBB38\uC744 \uC77D\uC5C8\uB2E4",
          "\uC5F0\uAD6C\uC18C\uAC00 \uC218\uBA74\uC744 \uAE30\uC5B5\uD588\uB2E4"
        ],
        answer: 0,
        explanation: "\uBF08\uB300\uB294 Researchers published a paper\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q09",
        skill: "modifier-parsing",
        question: '"The files on the shared drive need updating."\uC5D0\uC11C on the shared drive\uB294?',
        choices: ["\uB3D9\uC0AC need\uC758 \uBAA9\uC801\uC5B4", "The files\uB97C \uC218\uC2DD\uD558\uB294 \uC804\uCE58\uC0AC\uAD6C", "\uBB38\uC7A5 \uBD80\uC0AC", "\uBCF4\uC5B4"],
        answer: 1,
        explanation: "\uC704\uCE58 \uC804\uCE58\uC0AC\uAD6C\uAC00 The files\uB97C \uC218\uC2DD\uD569\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-018-Q10",
        skill: "core-structure",
        question: '"What the committee decided surprised everyone."\uC758 \uC8FC\uC5B4\uC5D0 \uD574\uB2F9\uD558\uB294 \uBD80\uBD84\uC740?',
        choices: ["the committee", "What the committee decided", "surprised", "everyone"],
        answer: 1,
        explanation: "What the committee decided\uB294 \uBA85\uC0AC\uC808 \uC8FC\uC5B4\uC785\uB2C8\uB2E4. \uBCF8\uB3D9\uC0AC\uB294 surprised\uC785\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-019.json
  var F_019_default = {
    id: "F-019",
    order: 19,
    title: "\uC9E7\uC740 \uC9C0\uBB38 \uC694\uC9C0",
    category: "reading",
    estimatedMinutes: 15,
    skills: ["main-idea", "summarize", "topic"],
    objectives: [
      "\uC9E7\uC740 \uC9C0\uBB38\uC758 \uC8FC\uC81C\uC640 \uC694\uC9C0\uB97C \uAD6C\uBD84\uD55C\uB2E4",
      "\uC138\uBD80\uC815\uBCF4\uC5D0 \uB04C\uB824\uAC00\uC9C0 \uC54A\uACE0 \uC911\uC2EC \uC0DD\uAC01\uC744 \uACE0\uB978\uB2E4",
      "\uC120\uD0DD\uC9C0\uC758 \uBD80\uBD84 \uC9C4\uC2E4\xB7\uACFC\uC7A5 \uD568\uC815\uC744 \uAC78\uB7EC\uB0B8\uB2E4"
    ],
    concept: {
      summary: "\uC694\uC9C0 \uBB38\uC81C\uB294 \u2018\uC9C0\uBB38\uC774 \uB9D0\uD558\uB824\uB294 \uD55C \uAC00\uC9C0\u2019\uB97C \uCC3E\uB294 \uD6C8\uB828\uC785\uB2C8\uB2E4. \uC138\uBD80\uC0AC\uC2E4\xB7\uC608\uC2DC\xB7\uC22B\uC790\uB294 \uC694\uC9C0\uB97C \uB4B7\uBC1B\uCE68\uD560 \uBFD0, \uC694\uC9C0 \uC790\uCCB4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uCCAB \uBB38\uC7A5\uACFC \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5, \uADF8\uB9AC\uACE0 \uBC18\uBCF5\uB418\uB294 \uD575\uC2EC\uC5B4\uB97C \uBCF4\uBA74 \uC8FC\uC81C\uAC00 \uBE60\uB974\uAC8C \uBCF4\uC785\uB2C8\uB2E4.",
      points: [
        "\uC8FC\uC81C(topic): \uBB34\uC5C7\uC5D0 \uAD00\uD55C \uAE00\uC778\uAC00",
        "\uC694\uC9C0(main idea): \uADF8 \uC8FC\uC81C\uC5D0 \uB300\uD574 \uBB34\uC5C7\uC744 \uB9D0\uD558\uB294\uAC00",
        "\uC608\uC2DC\uB294 \uC694\uC9C0\uB97C \uC9C0\uC9C0\uD558\uB294 \uC7AC\uB8CC\uB2E4",
        "\uB108\uBB34 \uC881\uAC70\uB098 \uB108\uBB34 \uB113\uC740 \uC120\uD0DD\uC9C0\uB97C \uACBD\uACC4\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "Remote work can raise productivity when goals are clear.",
        ko: "\uBAA9\uD45C\uAC00 \uBD84\uBA85\uD558\uBA74 \uC6D0\uACA9\uADFC\uBB34\uB294 \uC0DD\uC0B0\uC131\uC744 \uB192\uC77C \uC218 \uC788\uB2E4.",
        structure: "\uC694\uC9C0 = \uC870\uAC74 \uD558\uC758 \uC6D0\uACA9\uADFC\uBB34 \uD6A8\uACFC"
      },
      {
        en: "Many adults restart English by rebuilding basic sentence sense.",
        ko: "\uB9CE\uC740 \uC131\uC778\uC740 \uBB38\uC7A5 \uAC10\uAC01\uC744 \uB2E4\uC2DC \uC313\uC73C\uBA70 \uC601\uC5B4\uB97C \uC7AC\uC2DC\uC791\uD55C\uB2E4.",
        structure: "\uC694\uC9C0 = \uAE30\uCD08 \uD68C\uBCF5\uC758 \uC911\uC694\uC131"
      },
      {
        en: "Short daily practice beats rare long study sessions.",
        ko: "\uAC00\uB054 \uC624\uB798 \uACF5\uBD80\uD558\uB294 \uAC83\uBCF4\uB2E4 \uB9E4\uC77C \uC9E7\uAC8C \uD558\uB294 \uD3B8\uC774 \uB0AB\uB2E4.",
        structure: "\uC694\uC9C0 = \uAFB8\uC900\uD55C \uC9E7\uC740 \uD559\uC2B5"
      }
    ],
    checks: [
      {
        id: "F-019-Q01",
        skill: "main-idea",
        question: "Many offices now allow flexible hours. Employees can start earlier or later if they finish required tasks. Managers report that clear goals matter more than fixed schedules.\n\n\uC774 \uAE00\uC758 \uC694\uC9C0\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uBAA8\uB4E0 \uD68C\uC0AC\uAC00 \uC7AC\uD0DD\uADFC\uBB34\uB97C \uB3C4\uC785\uD588\uB2E4",
          "\uC720\uC5F0\uADFC\uBB34\uB294 \uBA85\uD655\uD55C \uBAA9\uD45C\uC640 \uD568\uAED8\uC77C \uB54C \uD6A8\uACFC\uC801\uC77C \uC218 \uC788\uB2E4",
          "\uAD00\uB9AC\uC790\uB294 \uACE0\uC815 \uADFC\uBB34\uB9CC \uC120\uD638\uD55C\uB2E4",
          "\uC9C1\uC6D0\uC740 \uC5C5\uBB34\uB97C \uB05D\uB0B4\uC9C0 \uC54A\uC544\uB3C4 \uB41C\uB2E4"
        ],
        answer: 1,
        explanation: "\uC720\uC5F0\uADFC\uBB34 \uAC00\uB2A5\uC131\uACFC \uD568\uAED8 \u2018\uBA85\uD655\uD55C \uBAA9\uD45C\uAC00 \uB354 \uC911\uC694\uD558\uB2E4\u2019\uB294 \uC810\uC774 \uC911\uC2EC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q02",
        skill: "topic",
        question: "Drinking water regularly helps concentration. Even mild dehydration can slow thinking. Simple habits, such as keeping a bottle nearby, make a difference.\n\n\uC774 \uAE00\uC758 \uC8FC\uC81C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: ["\uC6B4\uB3D9\uACFC \uC218\uBA74", "\uC218\uBD84 \uC12D\uCDE8\uC640 \uC9D1\uC911\uB825", "\uBCD1 \uB514\uC790\uC778\uC758 \uC5ED\uC0AC", "\uC0AC\uACE0\uB825 \uD14C\uC2A4\uD2B8 \uBC29\uBC95"],
        answer: 1,
        explanation: "\uC804\uBC18\uC801\uC73C\uB85C \uBB3C \uC12D\uCDE8\uC640 \uC9D1\uC911\uB825\uC758 \uAD00\uACC4\uB97C \uB2E4\uB8F9\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q03",
        skill: "summarize",
        question: "Public libraries are changing. Beyond lending books, they offer quiet study rooms, job workshops, and digital training. Communities increasingly treat them as learning hubs.\n\n\uC694\uC57D\uC73C\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uB3C4\uC11C\uAD00\uC740 \uCC45\uB9CC \uBE4C\uB824\uC8FC\uB294 \uACF3\uC774\uB2E4",
          "\uB3C4\uC11C\uAD00\uC774 \uD559\uC2B5\xB7\uC9C0\uC6D0 \uACF5\uAC04\uC73C\uB85C \uC5ED\uD560\uC774 \uB113\uC5B4\uC9C0\uACE0 \uC788\uB2E4",
          "\uBAA8\uB4E0 \uB3C4\uC11C\uAD00\uC774 \uC720\uB8CC\uB2E4",
          "\uB514\uC9C0\uD138 \uAD50\uC721\uC740 \uD6A8\uACFC\uAC00 \uC5C6\uB2E4"
        ],
        answer: 1,
        explanation: "\uB300\uCD9C\uC744 \uB118\uC5B4 \uD559\uC2B5 \uD5C8\uBE0C\uB85C \uD655\uC7A5\uB41C\uB2E4\uB294 \uB0B4\uC6A9\uC774 \uC694\uC9C0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q04",
        skill: "main-idea",
        question: "People often wait for perfect conditions to start studying. Waiting usually delays progress. Starting small and adjusting later is more practical.\n\n\uD544\uC790\uC758 \uC8FC\uC7A5\uC5D0 \uAC00\uAE4C\uC6B4 \uAC83\uC740?",
        choices: [
          "\uC644\uBCBD\uD55C \uACC4\uD68D\uC774 \uC0DD\uAE38 \uB54C\uAE4C\uC9C0 \uAE30\uB2E4\uB824\uB77C",
          "\uC791\uAC8C\uB77C\uB3C4 \uBA3C\uC800 \uC2DC\uC791\uD558\uB294 \uD3B8\uC774 \uB0AB\uB2E4",
          "\uACF5\uBD80\uB294 \uB098\uC911\uC5D0 \uBAB0\uC544\uC11C \uD558\uB77C",
          "\uC870\uAC74\uC774 \uB098\uBE60\uB3C4 \uACC4\uD68D\uC744 \uBC14\uAFB8\uC9C0 \uB9C8\uB77C"
        ],
        answer: 1,
        explanation: "\uC644\uBCBD\uD55C \uC870\uAC74\uC744 \uAE30\uB2E4\uB9AC\uC9C0 \uB9D0\uACE0 \uC791\uAC8C \uC2DC\uC791\uD558\uB77C\uB294 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q05",
        skill: "main-idea",
        question: "City parks do more than decorate neighborhoods. They lower stress, encourage walking, and give residents a place to meet. Urban planners now treat parks as basic infrastructure.\n\n\uC694\uC9C0\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uACF5\uC6D0\uC740 \uC7A5\uC2DD\uC6A9\uC5D0 \uBD88\uACFC\uD558\uB2E4",
          "\uB3C4\uC2DC \uACF5\uC6D0\uC740 \uAC74\uAC15\xB7\uAD50\uB958\uB97C \uC704\uD55C \uD544\uC218 \uC778\uD504\uB77C\uB2E4",
          "\uBAA8\uB4E0 \uC8FC\uBBFC\uC774 \uB9E4\uC77C \uAC77\uB294\uB2E4",
          "\uB3C4\uC2DC \uACC4\uD68D\uC740 \uB354 \uC774\uC0C1 \uD544\uC694 \uC5C6\uB2E4"
        ],
        answer: 1,
        explanation: "\uACF5\uC6D0\uC758 \uC2E4\uC9C8\uC801 \uAE30\uB2A5\uACFC \uC778\uD504\uB77C\uB85C\uC11C\uC758 \uC911\uC694\uC131\uC774 \uC911\uC2EC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q06",
        skill: "topic",
        question: "When adults return to English after a long break, grammar lists alone rarely help. They need sentence patterns they can reuse at work and in daily talk.\n\n\uC8FC\uC81C\uB294?",
        choices: ["\uC5EC\uD589 \uC601\uC5B4", "\uC131\uC778\uC758 \uC2E4\uC6A9\uC801 \uC601\uC5B4 \uD68C\uBCF5", "\uC5B4\uB9B0\uC774 \uBC1C\uC74C \uAD50\uC721", "\uBB38\uD559 \uBC88\uC5ED \uAE30\uBC95"],
        answer: 1,
        explanation: "\uACF5\uBC31 \uD6C4 \uC131\uC778\uC774 \uB2E4\uC2DC \uC601\uC5B4\uB97C \uC313\uB294 \uC2E4\uC6A9\uC801 \uC811\uADFC\uC774 \uC8FC\uC81C\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q07",
        skill: "summarize",
        question: "Online reviews influence buyers, but extreme opinions can mislead. Checking several reviews and looking for specific details leads to better decisions.\n\n\uC694\uC57D\uC73C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uB9AC\uBDF0\uB294 \uD56D\uC0C1 \uC815\uD655\uD558\uB2E4",
          "\uADF9\uB2E8\uC801 \uB9AC\uBDF0\uB9CC \uBBFF\uC5B4\uC57C \uD55C\uB2E4",
          "\uC5EC\uB7EC \uB9AC\uBDF0\uC640 \uAD6C\uCCB4\uC801 \uADFC\uAC70\uB97C \uD655\uC778\uD558\uB294 \uAC83\uC774 \uB0AB\uB2E4",
          "\uC628\uB77C\uC778 \uC1FC\uD551\uC740 \uD53C\uD574\uC57C \uD55C\uB2E4"
        ],
        answer: 2,
        explanation: "\uB9AC\uBDF0 \uC601\uD5A5\uB825\uACFC \uD568\uAED8, \uAD50\uCC28\uD655\uC778\xB7\uAD6C\uCCB4\uC131 \uD655\uC778\uC774 \uC694\uC9C0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q08",
        skill: "main-idea",
        question: "Sleep is not wasted time. During sleep, the brain sorts memories and restores energy. Cutting sleep to gain study hours often reduces learning quality.\n\n\uC694\uC9C0\uB294?",
        choices: [
          "\uC218\uBA74\uC740 \uC2DC\uAC04 \uB0AD\uBE44\uB2E4",
          "\uC218\uBA74\uC744 \uC904\uC774\uBA74 \uD559\uC2B5\uC774 \uD56D\uC0C1 \uB298\uB294\uB2E4",
          "\uCDA9\uBD84\uD55C \uC218\uBA74\uC774 \uD559\uC2B5 \uC9C8\uC744 \uC9C0\uD0A4\uB294 \uB370 \uC911\uC694\uD558\uB2E4",
          "\uAE30\uC5B5\uC740 \uAE68\uC5B4 \uC788\uC744 \uB54C\uB9CC \uC815\uB9AC\uB41C\uB2E4"
        ],
        answer: 2,
        explanation: "\uC218\uBA74\uC758 \uC5ED\uD560\uACFC, \uC218\uBA74 \uCD95\uC18C\uAC00 \uD559\uC2B5\uC5D0 \uD574\uB85C\uC6B8 \uC218 \uC788\uB2E4\uB294 \uC810\uC774 \uC911\uC2EC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q09",
        skill: "main-idea",
        question: "A company replaced long weekly meetings with short written updates. Staff saved hours and still shared key information. Communication improved because updates were clearer.\n\n\uC694\uC9C0\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uD68C\uC758\uB294 \uBB34\uC870\uAC74 \uC5C6\uC560\uC57C \uD55C\uB2E4",
          "\uC9E7\uC740 \uC11C\uBA74 \uC5C5\uB370\uC774\uD2B8\uAC00 \uAE34 \uD68C\uC758\uBCF4\uB2E4 \uD6A8\uC728\uC801\uC77C \uC218 \uC788\uB2E4",
          "\uC9C1\uC6D0\uC740 \uC815\uBCF4\uB97C \uACF5\uC720\uD558\uC9C0 \uC54A\uC558\uB2E4",
          "\uC11C\uBA74 \uC5C5\uB370\uC774\uD2B8\uB294 \uD56D\uC0C1 \uC2E4\uD328\uD55C\uB2E4"
        ],
        answer: 1,
        explanation: "\uAE34 \uD68C\uC758\uB97C \uC9E7\uC740 \uC11C\uBA74 \uC5C5\uB370\uC774\uD2B8\uB85C \uBC14\uAFD4 \uD6A8\uC728\uC774 \uC62C\uB790\uB2E4\uB294 \uC0AC\uB840\uAC00 \uC694\uC9C0\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-019-Q10",
        skill: "summarize",
        question: "Learning vocabulary in word families\u2014such as decide, decision, decisive\u2014helps learners recognize related forms in reading passages more quickly.\n\n\uC774 \uBB38\uC7A5\uC758 \uC694\uC9C0\uB294?",
        choices: [
          "\uB2E8\uC5B4\uC871\uC73C\uB85C \uBC30\uC6B0\uBA74 \uAD00\uB828 \uD615\uD0DC\uB97C \uB354 \uBE68\uB9AC \uC54C\uC544\uBCF8\uB2E4",
          "\uB2E8\uC5B4\uB294 \uD558\uB098\uC529\uB9CC \uC678\uC6CC\uC57C \uD55C\uB2E4",
          "\uB3C5\uD574\uC5D0\uC11C\uB294 \uC5B4\uD718\uAC00 \uD544\uC694 \uC5C6\uB2E4",
          "decisive\uB9CC \uC54C\uBA74 \uCDA9\uBD84\uD558\uB2E4"
        ],
        answer: 0,
        explanation: "\uB2E8\uC5B4\uC871 \uD559\uC2B5\uC774 \uB3C5\uD574\uC5D0\uC11C \uAD00\uB828 \uD615\uD0DC \uC778\uC2DD\uC5D0 \uB3C4\uC6C0\uC774 \uB41C\uB2E4\uB294 \uB0B4\uC6A9\uC785\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-020.json
  var F_020_default = {
    id: "F-020",
    order: 20,
    title: "\uC9C0\uC2DC\uC5B4\uC640 \uC138\uBD80\uC815\uBCF4",
    category: "reading",
    estimatedMinutes: 15,
    skills: ["reference", "detail", "scanning"],
    objectives: [
      "this/that/these/it/they \uB4F1 \uC9C0\uC2DC\uC5B4\uAC00 \uAC00\uB9AC\uD0A4\uB294 \uB300\uC0C1\uC744 \uCC3E\uB294\uB2E4",
      "\uC138\uBD80\uC815\uBCF4 \uBB38\uC81C\uC5D0\uC11C \uADFC\uAC70 \uBB38\uC7A5\uC744 \uBE60\uB974\uAC8C \uCC3E\uB294\uB2E4",
      "\uBE44\uC2B7\uD55C \uC22B\uC790\xB7\uACE0\uC720\uBA85\uC0AC \uD568\uC815\uC744 \uAD6C\uBD84\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uC138\uBD80\uC815\uBCF4 \uBB38\uC81C\uB294 \uC9C0\uBB38 \uC804\uCCB4\uB97C \uB2E4\uC2DC \uC77D\uB294 \uAC83\uC774 \uC544\uB2C8\uB77C, \uC9C8\uBB38\uC758 \uD0A4\uC6CC\uB4DC\uB85C \uD574\uB2F9 \uBB38\uC7A5\uC744 \uCC3E\uB294 \uD6C8\uB828\uC785\uB2C8\uB2E4. \uC9C0\uC2DC\uC5B4 \uBB38\uC81C\uB294 \uB300\uBA85\uC0AC \uC55E\uC5D0\uC11C \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uBA85\uC0AC\xB7\uB0B4\uC6A9\uC744 \uD655\uC778\uD558\uBA74 \uB429\uB2C8\uB2E4. \u2018\uBE44\uC2B7\uD558\uC9C0\uB9CC \uB2E4\uB978\u2019 \uC120\uD0DD\uC9C0\uB97C \uACE8\uB77C\uB0B4\uB294 \uC2B5\uAD00\uC774 \uC810\uC218\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.",
      points: [
        "\uC9C0\uC2DC\uC5B4\uB294 \uC55E \uBB38\uC7A5\uC758 \uD575\uC2EC \uBA85\uC0AC/\uB0B4\uC6A9\uC744 \uBC1B\uB294\uB2E4",
        "\uC9C8\uBB38\uC758 \uACE0\uC720\uBA85\uC0AC\xB7\uC22B\uC790\xB7\uB3D9\uC0AC\uB97C \uD45C\uC2DC\uD55C\uB2E4",
        "\uADFC\uAC70 \uBB38\uC7A5\uACFC \uC120\uD0DD\uC9C0\uB97C 1:1\uB85C \uB300\uC870\uD55C\uB2E4",
        "\uBD80\uBD84\uB9CC \uB9DE\uB294 \uC120\uD0DD\uC9C0\uB97C \uC624\uB2F5\uC73C\uB85C \uCC98\uB9AC\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "The policy failed. This disappointed many residents.",
        ko: "\uADF8 \uC815\uCC45\uC740 \uC2E4\uD328\uD588\uB2E4. \uC774\uAC83(\uC2E4\uD328)\uC774 \uB9CE\uC740 \uC8FC\uBBFC\uC744 \uC2E4\uB9DD\uC2DC\uCF30\uB2E4.",
        structure: "This \u2192 the policy's failure"
      },
      {
        en: "Mina bought two tickets. She kept them in her bag.",
        ko: "\uBBF8\uB098\uB294 \uD45C \uB450 \uC7A5\uC744 \uC0C0\uB2E4. \uADF8\uB140\uB294 \uADF8\uAC83\uB4E4\uC744 \uAC00\uBC29\uC5D0 \uB450\uC5C8\uB2E4.",
        structure: "them \u2192 two tickets"
      },
      {
        en: "The museum opens at 10 a.m. on weekdays.",
        ko: "\uADF8 \uBC15\uBB3C\uAD00\uC740 \uD3C9\uC77C \uC624\uC804 10\uC2DC\uC5D0 \uC5F0\uB2E4.",
        structure: "\uC138\uBD80\uC815\uBCF4: \uC2DC\uAC04\xB7\uC694\uC77C"
      }
    ],
    checks: [
      {
        id: "F-020-Q01",
        skill: "reference",
        question: "The city built a new bike lane last spring. It has already reduced traffic near schools.\n\nIt\uAC00 \uAC00\uB9AC\uD0A4\uB294 \uAC83\uC740?",
        choices: ["the city", "last spring", "a new bike lane", "schools"],
        answer: 2,
        explanation: "\uC55E \uBB38\uC7A5\uC758 \uD575\uC2EC \uB300\uC0C1\uC778 a new bike lane\uC744 It\uC774 \uBC1B\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q02",
        skill: "detail",
        question: "The workshop starts at 2 p.m. in Room B. Participants should bring a laptop. Registration closes on Monday.\n\n\uCC38\uAC00\uC790\uAC00 \uAC00\uC838\uC640\uC57C \uD558\uB294 \uAC83\uC740?",
        choices: ["\uB4F1\uB85D\uC99D", "\uB178\uD2B8\uBD81", "\uC6D4\uC694\uC77C \uC77C\uC815\uD45C", "Room A \uC5F4\uC1E0"],
        answer: 1,
        explanation: "bring a laptop\uC774 \uBA85\uC2DC\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q03",
        skill: "reference",
        question: "Tom suggested a shorter agenda. Most teammates supported the idea, and they adopted it immediately.\n\nthey\uAC00 \uAC00\uB9AC\uD0A4\uB294 \uAC83\uC740?",
        choices: ["agenda", "Most teammates", "idea", "Tom only"],
        answer: 1,
        explanation: "\uBCF5\uC218 \uC8FC\uC5B4 Most teammates\uAC00 they\uC758 \uC120\uD589\uC0AC\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q04",
        skill: "scanning",
        question: "Flight 208 to Busan departs at 7:40 a.m. from Gate 12. Passengers must arrive 60 minutes early.\n\n\uCD9C\uBC1C \uAC8C\uC774\uD2B8\uB294?",
        choices: ["208", "7:40", "Gate 12", "60 minutes"],
        answer: 2,
        explanation: "from Gate 12\uAC00 \uCD9C\uBC1C \uAC8C\uC774\uD2B8 \uC815\uBCF4\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q05",
        skill: "reference",
        question: "Online courses can be flexible. However, this requires strong self-discipline from learners.\n\nthis\uAC00 \uAC00\uB9AC\uD0A4\uB294 \uB0B4\uC6A9\uC5D0 \uAC00\uAE4C\uC6B4 \uAC83\uC740?",
        choices: [
          "\uC628\uB77C\uC778 \uAC15\uC758\uAC00 \uC720\uC5F0\uD558\uB2E4\uB294 \uC810/\uADF8 \uC720\uC5F0\uD568\uC744 \uD65C\uC6A9\uD558\uB294 \uAC83",
          "\uC790\uAE30\uAD00\uB9AC\uAC00 \uD544\uC694 \uC5C6\uB2E4\uB294 \uC810",
          "\uD559\uC2B5\uC790\uAC00 \uAC15\uC758\uC2E4\uC5D0 \uC788\uC5B4\uC57C \uD55C\uB2E4\uB294 \uC810",
          "\uC720\uC5F0\uD568\uC774 \uD56D\uC0C1 \uD574\uB86D\uB2E4\uB294 \uC810"
        ],
        answer: 0,
        explanation: "\uC55E \uBB38\uC7A5\uC758 \uC720\uC5F0\uD55C \uC628\uB77C\uC778 \uD559\uC2B5(\uC744 \uC798 \uD574\uB0B4\uB294 \uAC83)\uC774 this\uC758 \uB0B4\uC6A9\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q06",
        skill: "detail",
        question: "The caf\xE9 offers free Wi-Fi after 3 p.m. Before that, customers must make a purchase to use the network.\n\n\uC624\uD6C4 3\uC2DC \uC774\uC804 Wi-Fi \uC774\uC6A9 \uC870\uAC74\uC740?",
        choices: [
          "\uBB34\uB8CC\uB85C \uB204\uAD6C\uB098 \uC0AC\uC6A9",
          "\uAD6C\uB9E4 \uD6C4\uC5D0 \uC0AC\uC6A9",
          "\uD68C\uC6D0\uB9CC \uC0AC\uC6A9",
          "\uC9C1\uC6D0\uB9CC \uC0AC\uC6A9"
        ],
        answer: 1,
        explanation: "3\uC2DC \uC804\uC5D0\uB294 \uAD6C\uB9E4\uAC00 \uD544\uC694\uD558\uB2E4\uACE0 \uBA85\uC2DC\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q07",
        skill: "reference",
        question: "Two proposals were reviewed. The second one was clearer, so the board chose it.\n\nit\uC774 \uAC00\uB9AC\uD0A4\uB294 \uAC83\uC740?",
        choices: ["Two proposals", "The second one", "the board", "clearer style alone"],
        answer: 1,
        explanation: "\uC120\uD0DD\uD55C \uB300\uC0C1\uC740 The second one\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q08",
        skill: "detail",
        question: "According to the notice, the elevator will be out of service from Tuesday to Thursday for repairs. The stairs remain open.\n\n\uC5D8\uB9AC\uBCA0\uC774\uD130 \uC810\uAC80 \uAE30\uAC04\uC740?",
        choices: ["\uC6D4\uC694\uC77C\uB9CC", "\uD654\uC694\uC77C\uBD80\uD130 \uBAA9\uC694\uC77C\uAE4C\uC9C0", "\uC8FC\uB9D0 \uC804\uCCB4", "\uAE08\uC694\uC77C\uB9CC"],
        answer: 1,
        explanation: "from Tuesday to Thursday\uAC00 \uAE30\uAC04\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q09",
        skill: "scanning",
        question: "Hana ordered salad and soup. Joon ordered pasta. They shared a dessert after the meal.\n\n\uB450 \uC0AC\uB78C\uC774 \uD568\uAED8 \uBA39\uC740 \uAC83\uC740?",
        choices: ["salad", "soup", "pasta", "dessert"],
        answer: 3,
        explanation: "shared a dessert\uAC00 \uACF5\uB3D9\uC73C\uB85C \uBA39\uC740 \uD56D\uBAA9\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-020-Q10",
        skill: "reference",
        question: "The instructions were printed on the box. Please read them before assembly.\n\nthem\uC774 \uAC00\uB9AC\uD0A4\uB294 \uAC83\uC740?",
        choices: ["the box", "The instructions", "assembly", "Please"],
        answer: 1,
        explanation: "\uC77D\uC5B4\uC57C \uD560 \uB300\uC0C1\uC740 The instructions\uC785\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-021.json
  var F_021_default = {
    id: "F-021",
    order: 21,
    title: "\uC9E7\uC740 \uCD94\uB860",
    category: "reading",
    estimatedMinutes: 15,
    skills: ["inference", "implication", "attitude"],
    objectives: [
      "\uC9C0\uBB38\uC5D0 \uC9C1\uC811 \uC4F0\uC774\uC9C0 \uC54A\uC740 \uB0B4\uC6A9\uC744 \uB17C\uB9AC\uC801\uC73C\uB85C \uCD94\uB860\uD55C\uB2E4",
      "\uADFC\uAC70\uAC00 \uC788\uB294 \uCD94\uB860\uACFC \uACFC\uB3C4\uD55C \uBE44\uC57D\uC744 \uAD6C\uBD84\uD55C\uB2E4",
      "\uD544\uC790\xB7\uC778\uBB3C\uC758 \uD0DC\uB3C4\xB7\uC758\uB3C4\uB97C \uC9E7\uAC8C \uD30C\uC545\uD55C\uB2E4"
    ],
    concept: {
      summary: "\uCD94\uB860\uC740 \u2018\uC4F0\uC5EC \uC788\uC9C0 \uC54A\uC9C0\uB9CC, \uC4F0\uC778 \uB0B4\uC6A9\uC744 \uBC14\uD0D5\uC73C\uB85C \uD569\uB9AC\uC801\uC73C\uB85C \uC54C \uC218 \uC788\uB294 \uAC83\u2019\uC744 \uACE0\uB974\uB294 \uB2A5\uB825\uC785\uB2C8\uB2E4. \uC9C0\uBB38\uC5D0 \uC5C6\uB294 \uAC10\uC815\xB7\uC0AC\uC2E4\uC744 \uB9C8\uC74C\uB300\uB85C \uCD94\uAC00\uD558\uBA74 \uC624\uB2F5\uC774 \uB429\uB2C8\uB2E4. \uD56D\uC0C1 \u2018\uC5B4\uB290 \uBB38\uC7A5 \uB54C\uBB38\uC5D0 \uADF8\uB807\uAC8C \uB9D0\uD560 \uC218 \uC788\uB294\uAC00\u2019\uB97C \uD655\uC778\uD558\uC138\uC694.",
      points: [
        "\uC9C1\uC811 \uBA85\uC2DC\uB41C \uC0AC\uC2E4 \u2260 \uCD94\uB860",
        "\uADFC\uAC70 \uBB38\uC7A5\uC5D0\uC11C \uD55C \uAC78\uC74C\uB9CC \uB098\uC544\uAC04\uB2E4",
        "\uC808\uB300\uD45C\uD604(always/never)\uC774 \uC788\uB294 \uC120\uD0DD\uC9C0\uB97C \uACBD\uACC4\uD55C\uB2E4",
        "\uD0DC\uB3C4 \uBB38\uC81C\uB294 \uAE0D\uC815\xB7\uBD80\uC815\xB7\uC720\uBCF4 \uC2E0\uD638\uB97C \uBCF8\uB2E4"
      ]
    },
    examples: [
      {
        en: "Only three seats remain for the seminar.",
        ko: "\uC138\uBBF8\uB098 \uC88C\uC11D\uC774 \uC138 \uC790\uB9AC\uB9CC \uB0A8\uC558\uB2E4.",
        structure: "\uCD94\uB860: \uAC70\uC758 \uB9C8\uAC10\uC5D0 \uAC00\uAE5D\uB2E4"
      },
      {
        en: "She checked the clock and packed faster.",
        ko: "\uADF8\uB140\uB294 \uC2DC\uACC4\uB97C \uD655\uC778\uD558\uACE0 \uB354 \uBE68\uB9AC \uC9D0\uC744 \uC30C\uB2E4.",
        structure: "\uCD94\uB860: \uC2DC\uAC04\uC774 \uCD09\uBC15\uD558\uB2E4"
      },
      {
        en: "The review praised the plot but criticized the ending.",
        ko: "\uB9AC\uBDF0\uB294 \uC904\uAC70\uB9AC\uB294 \uCE6D\uCC2C\uD588\uC9C0\uB9CC \uACB0\uB9D0\uC740 \uBE44\uD310\uD588\uB2E4.",
        structure: "\uD0DC\uB3C4: \uBD80\uBD84\uC801\uC73C\uB85C \uAE0D\uC815\xB7\uBD80\uC815"
      }
    ],
    checks: [
      {
        id: "F-021-Q01",
        skill: "inference",
        question: "The bakery closes when the last loaf is sold. Today the shelves were empty by noon.\n\n\uCD94\uB860\uC73C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uC624\uB298\uC740 \uC815\uC624 \uC804\uC5D0 \uBE75\uC774 \uB2E4 \uD314\uB838\uC744 \uAC00\uB2A5\uC131\uC774 \uD06C\uB2E4",
          "\uBE75\uC9D1\uC774 \uC624\uC804\uC5D0 \uBB38\uC744 \uB2EB\uC9C0 \uC54A\uC558\uB2E4",
          "\uBE75\uC744 \uC544\uBB34\uB3C4 \uC0AC\uC9C0 \uC54A\uC558\uB2E4",
          "\uB0B4\uC77C\uC740 \uBB34\uC870\uAC74 \uB2A6\uAC8C \uB2EB\uB294\uB2E4"
        ],
        answer: 0,
        explanation: "\uB9C8\uC9C0\uB9C9 \uBE75\uC774 \uD314\uB9AC\uBA74 \uB2EB\uACE0, \uC815\uC624\uC5D0 \uC120\uBC18\uC774 \uBE44\uC5C8\uB2E4\uB294 \uC810\uC5D0\uC11C \uC624\uC804\uC5D0 \uB9E4\uC9C4\uB418\uC5C8\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q02",
        skill: "implication",
        question: '"I would join if the fee were lower," Mark said.\n\n\uB9C8\uD06C\uC5D0 \uB300\uD574 \uC54C \uC218 \uC788\uB294 \uAC83\uC740?',
        choices: [
          "\uADF8\uB294 \uC774\uBBF8 \uCC38\uAC00\uBE44\uB97C \uB0C8\uB2E4",
          "\uD604\uC7AC \uCC38\uAC00\uBE44\uAC00 \uBD80\uB2F4\uC2A4\uB7FD\uB2E4\uACE0 \uB290\uB080\uB2E4",
          "\uADF8\uB294 \uD589\uC0AC\uC5D0 \uAD00\uC2EC\uC774 \uC804\uD600 \uC5C6\uB2E4",
          "\uADF8\uB294 \uD589\uC0AC \uC8FC\uCD5C\uC790\uB2E4"
        ],
        answer: 1,
        explanation: "\uC694\uAE08\uC774 \uB354 \uB0AE\uB2E4\uBA74 \uCC38\uAC00\uD558\uACA0\uB2E4\uB294 \uC870\uAC74\uBD80 \uBC1C\uD654\uC774\uBBC0\uB85C, \uD604\uC7AC \uC694\uAE08\uC774 \uBD80\uB2F4\uC774\uB77C\uB294 \uD568\uC758\uAC00 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q03",
        skill: "inference",
        question: "After reading the email, Sora canceled her weekend trip and booked a train ticket to the office city.\n\n\uAC00\uC7A5 \uD0C0\uB2F9\uD55C \uCD94\uB860\uC740?",
        choices: [
          "\uC8FC\uB9D0 \uC5EC\uD589\uC774 \uB354 \uC911\uC694\uD574\uC84C\uB2E4",
          "\uC0AC\uBB34\uC2E4 \uB3C4\uC2DC\uB85C \uAC00\uC57C \uD560 \uC77C\uC774 \uC0DD\uACBC\uB2E4",
          "\uC774\uBA54\uC77C\uC740 \uAD11\uACE0\uC600\uB2E4",
          "\uAE30\uCC28\uAC00 \uCDE8\uC18C\uB418\uC5C8\uB2E4"
        ],
        answer: 1,
        explanation: "\uC5EC\uD589\uC744 \uCDE8\uC18C\uD558\uACE0 \uC0AC\uBB34\uC2E4 \uB3C4\uC2DC\uD589 \uAE30\uCC28\uB97C \uC608\uC57D\uD55C \uD589\uB3D9\uC73C\uB85C \uC5C5\uBB34\xB7\uC6A9\uBB34 \uAC00\uB2A5\uC131\uC744 \uCD94\uB860\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q04",
        skill: "attitude",
        question: 'The editor called the draft "promising but incomplete."\n\n\uD3B8\uC9D1\uC790\uC758 \uD0DC\uB3C4\uB294?',
        choices: [
          "\uC804\uC801\uC73C\uB85C \uBD80\uC815\uC801",
          "\uC804\uC801\uC73C\uB85C \uAE0D\uC815\uC801",
          "\uBD80\uBD84\uC801\uC73C\uB85C \uAE0D\uC815\uD558\uB418 \uBCF4\uC644\uC774 \uD544\uC694\uD558\uB2E4\uACE0 \uBD04",
          "\uBB34\uAD00\uC2EC"
        ],
        answer: 2,
        explanation: "promising\uC740 \uAE0D\uC815, incomplete\uB294 \uBCF4\uC644 \uD544\uC694\uB97C \uB098\uD0C0\uB0C5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q05",
        skill: "inference",
        question: "No one answered when the fire alarm rang during lunch. Later, staff learned it had been a drill announced on the intranet that morning.\n\n\uCD94\uB860\uC73C\uB85C \uC801\uC808\uD55C \uAC83\uC740?",
        choices: [
          "\uC9C1\uC6D0 \uC911 \uC77C\uBD80\uAC00 \uACF5\uC9C0\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC744 \uC218 \uC788\uB2E4",
          "\uC2E4\uC81C \uD654\uC7AC\uAC00 \uBC1C\uC0DD\uD588\uB2E4",
          "\uC54C\uB78C\uC740 \uC6B8\uB9AC\uC9C0 \uC54A\uC558\uB2E4",
          "\uC810\uC2EC\uC2DC\uAC04\uC5D0 \uC804\uC6D0 \uCD9C\uADFC\uD558\uC9C0 \uC54A\uC558\uB2E4"
        ],
        answer: 0,
        explanation: "\uC624\uC804\uC5D0 \uACF5\uC9C0\uB41C \uD6C8\uB828\uC774\uC5C8\uB294\uB370 \uBC18\uC751\uD558\uC9C0 \uC54A\uC740 \uC810\uC73C\uB85C, \uACF5\uC9C0 \uBBF8\uD655\uC778 \uAC00\uB2A5\uC131\uC744 \uCD94\uB860\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q06",
        skill: "implication",
        question: `"Let's discuss this offline," the manager said during the large group call.

\uD568\uC758\uB85C \uAC00\uAE4C\uC6B4 \uAC83\uC740?`,
        choices: [
          "\uC9C0\uAE08 \uD070 \uD68C\uC758\uC5D0\uC11C \uC790\uC138\uD788 \uB2E4\uB8E8\uACE0 \uC2F6\uC9C0 \uC54A\uB2E4",
          "\uD68C\uC758\uB97C \uC989\uC2DC \uC885\uB8CC\uD55C\uB2E4",
          "\uC624\uD504\uB77C\uC778 \uB9E4\uC7A5\uC73C\uB85C \uAC00\uC790\uB294 \uB73B\uC774\uB2E4",
          "\uC548\uAC74\uC774 \uC774\uBBF8 \uACB0\uC815\uB418\uC5C8\uB2E4"
        ],
        answer: 0,
        explanation: "\uB300\uADDC\uBAA8 \uD1B5\uD654\uC5D0\uC11C offline\uC73C\uB85C \uBBF8\uB8E8\uC790\uB294 \uB9D0\uC740 \uBCC4\uB3C4\xB7\uC18C\uADDC\uBAA8 \uB17C\uC758 \uC758\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q07",
        skill: "inference",
        question: "The restaurant usually requires reservations. Tonight several empty tables remained after 8 p.m.\n\n\uD0C0\uB2F9\uD55C \uCD94\uB860\uC740?",
        choices: [
          "\uC624\uB298 \uC800\uB141\uC740 \uD3C9\uC18C\uBCF4\uB2E4 \uC190\uB2D8\uC774 \uC801\uC744 \uC218 \uC788\uB2E4",
          "\uC608\uC57D\uC81C\uAC00 \uC5C6\uC5B4\uC84C\uB2E4",
          "\uC2DD\uB2F9\uC774 \uD3D0\uC5C5\uD588\uB2E4",
          "8\uC2DC \uC774\uD6C4\uC5D0\uB294 \uD56D\uC0C1 \uB9CC\uC11D\uC774\uB2E4"
        ],
        answer: 0,
        explanation: "\uD3C9\uC18C \uC608\uC57D\uC774 \uD544\uC694\uD55C\uB370 \uBE48\uC790\uB9AC\uAC00 \uB0A8\uC558\uB2E4\uBA74 \uD55C\uC0B0\uD588\uC744 \uAC00\uB2A5\uC131\uC774 \uD07D\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q08",
        skill: "attitude",
        question: '"We appreciate the feedback, yet we will keep the current design," the company replied.\n\n\uD68C\uC0AC\uC758 \uC785\uC7A5\uC740?',
        choices: [
          "\uD53C\uB4DC\uBC31\uC744 \uBC18\uC601\uD574 \uB514\uC790\uC778\uC744 \uBC14\uAFBC\uB2E4",
          "\uD53C\uB4DC\uBC31\uC740 \uBC1B\uB418 \uD604 \uB514\uC790\uC778\uC744 \uC720\uC9C0\uD55C\uB2E4",
          "\uD53C\uB4DC\uBC31\uC744 \uAC70\uBD80\uD558\uACE0 \uB300\uD654\uB97C \uB04A\uB294\uB2E4",
          "\uB514\uC790\uC778 \uB17C\uC758\uB97C \uC2DC\uC791\uD55C\uB2E4"
        ],
        answer: 1,
        explanation: "appreciate... yet keep\uC5D0\uC11C \uC608\uC758\uB294 \uC9C0\uD0A4\uB418 \uC720\uC9C0 \uACB0\uC815\uC784\uC744 \uC54C \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q09",
        skill: "inference",
        question: "Jun turned down the overtime offer because his certification exam is tomorrow morning.\n\n\uCD94\uB860\uC73C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uADF8\uB294 \uB0B4\uC77C \uC2DC\uD5D8\uC744 \uC704\uD574 \uC624\uB298 \uBB34\uB9AC\uD558\uC9C0 \uC54A\uC73C\uB824 \uD55C\uB2E4",
          "\uADF8\uB294 \uC57C\uADFC \uC218\uB2F9\uC744 \uC2EB\uC5B4\uD55C\uB2E4",
          "\uC2DC\uD5D8\uC774 \uCDE8\uC18C\uB418\uC5C8\uB2E4",
          "\uADF8\uB294 \uC774\uBBF8 \uC790\uACA9\uC99D\uC744 \uBC1B\uC558\uB2E4"
        ],
        answer: 0,
        explanation: "\uB0B4\uC77C \uC544\uCE68 \uC2DC\uD5D8\uC744 \uC774\uC720\uB85C \uC57C\uADFC\uC744 \uAC70\uC808\uD588\uC73C\uBBC0\uB85C \uC900\uBE44\xB7\uCEE8\uB514\uC158 \uAD00\uB9AC \uC758\uB3C4\uC785\uB2C8\uB2E4.",
        transcript: ""
      },
      {
        id: "F-021-Q10",
        skill: "implication",
        question: 'The guide said, "If you leave now, you can still catch the last bus."\n\n\uD568\uC758\uB294?',
        choices: [
          "\uC9C0\uAE08 \uCD9C\uBC1C\uD558\uC9C0 \uC54A\uC73C\uBA74 \uB9C9\uCC28\uB97C \uB193\uCE60 \uC218 \uC788\uB2E4",
          "\uB9C9\uCC28\uB294 \uC774\uBBF8 \uCD9C\uBC1C\uD588\uB2E4",
          "\uBC84\uC2A4\uAC00 \uD558\uB8E8 \uC885\uC77C \uC788\uB2E4",
          "\uAC00\uC774\uB4DC\uAC00 \uBC84\uC2A4\uB97C \uC6B4\uC804\uD55C\uB2E4"
        ],
        answer: 0,
        explanation: "\uC870\uAC74\uBD80 \uC870\uC5B8\uC740 \uC9C0\uCCB4 \uC2DC \uB9C9\uCC28 \uB193\uCE68 \uAC00\uB2A5\uC131\uC744 \uC554\uC2DC\uD569\uB2C8\uB2E4.",
        transcript: ""
      }
    ]
  };

  // data/foundation/lessons/F-022.json
  var F_022_default = {
    id: "F-022",
    order: 22,
    title: "\uC9E7\uC740 \uC751\uB2F5 \uD30C\uC545",
    category: "listening",
    estimatedMinutes: 14,
    skills: ["response", "conversation-flow", "function"],
    objectives: [
      "\uC9E7\uC740 \uC9C8\uBB38\uC5D0 \uB300\uD55C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC751\uB2F5\uC744 \uACE0\uB978\uB2E4",
      "\uC81C\uC548\xB7\uC694\uCCAD\xB7\uD655\uC778\uC5D0 \uB9DE\uB294 \uB300\uB2F5 \uAE30\uB2A5\uC744 \uD30C\uC545\uD55C\uB2E4",
      "\uBB38\uBC95\uB9CC \uB9DE\uACE0 \uC0C1\uD669\uC5D0 \uC5B4\uAE0B\uB09C \uC120\uD0DD\uC9C0\uB97C \uAC78\uB7EC\uB0B8\uB2E4"
    ],
    concept: {
      summary: "\uC9E7\uC740 \uC751\uB2F5 \uBB38\uC81C\uB294 \u2018\uC9C8\uBB38\uC758 \uC758\uB3C4\u2019\uB97C \uBA3C\uC800 \uB4E3\uB294 \uD6C8\uB828\uC785\uB2C8\uB2E4. Yes/No \uC9C8\uBB38, \uC815\uBCF4 \uC9C8\uBB38, \uC81C\uC548\xB7\uC694\uCCAD\uC740 \uB2F5\uD558\uB294 \uBC29\uC2DD\uC774 \uB2E4\uB985\uB2C8\uB2E4. \uBB38\uBC95\uC801\uC73C\uB85C \uAC00\uB2A5\uD55C \uBB38\uC7A5\uC774\uB77C\uB3C4 \uB300\uD654 \uD750\uB984\uC5D0 \uB9DE\uC9C0 \uC54A\uC73C\uBA74 \uC624\uB2F5\uC785\uB2C8\uB2E4. \uB300\uBCF8\uC744 \uB4E4\uC73C\uBA70 \uC9C8\uBB38 \uC720\uD615\uC744 \uD45C\uC2DC\uD558\uC138\uC694.",
      points: [
        "\uC9C8\uBB38 \uC720\uD615(\uC815\uBCF4/\uC81C\uC548/\uC694\uCCAD/\uD655\uC778)\uC744 \uBA3C\uC800 \uBD84\uB958\uD55C\uB2E4",
        "\uC9C1\uC811 \uB2F5 + \uAC04\uB2E8 \uC774\uC720\uAC00 \uC790\uC8FC \uB098\uC628\uB2E4",
        "\uC9C8\uBB38\uACFC \uB3D9\uB5A8\uC5B4\uC9C4 \uD654\uC81C \uC804\uD658\uC740 \uC624\uB2F5 \uD6C4\uBCF4",
        "\uACF5\uC190\uD55C \uAC70\uC808\uB3C4 \uC62C\uBC14\uB978 \uC751\uB2F5\uC774 \uB420 \uC218 \uC788\uB2E4"
      ]
    },
    examples: [
      {
        en: "A: Could you open the window? B: Sure, no problem.",
        ko: "A: \uCC3D\uBB38 \uC880 \uC5F4\uC5B4 \uC8FC\uC2DC\uACA0\uC5B4\uC694? B: \uB124, \uBB3C\uB860\uC774\uC8E0.",
        structure: "\uC694\uCCAD \u2192 \uC218\uB77D"
      },
      {
        en: "A: How about lunch at noon? B: Sounds good.",
        ko: "A: \uC815\uC624\uC5D0 \uC810\uC2EC \uC5B4\uB54C\uC694? B: \uC88B\uB124\uC694.",
        structure: "\uC81C\uC548 \u2192 \uB3D9\uC758"
      },
      {
        en: "A: Is this seat taken? B: No, go ahead.",
        ko: "A: \uC774 \uC790\uB9AC \uC788\uC5B4\uC694? B: \uC544\uB2C8\uC694, \uC549\uC73C\uC138\uC694.",
        structure: "\uD655\uC778 \u2192 \uD5C8\uAC00"
      }
    ],
    checks: [
      {
        id: "F-022-Q01",
        skill: "response",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "Yes, at 3 p.m.",
          "I took the bus.",
          "It's on the second floor.",
          "Nice to meet you."
        ],
        answer: 0,
        explanation: "\uD68C\uC758 \uC2DC\uC791 \uC2DC\uAC04\uC744 \uBB3C\uC5C8\uC73C\uBBC0\uB85C \uC2DC\uAC04\uC73C\uB85C \uB2F5\uD558\uB294 A\uAC00 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Do you know when the meeting starts?"
      },
      {
        id: "F-022-Q02",
        skill: "function",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "I already ate, thanks.",
          "The restaurant is closed tomorrow.",
          "Coffee has caffeine.",
          "Please pass the salt."
        ],
        answer: 0,
        explanation: "\uCEE4\uD53C \uC81C\uC548\uC774\uBBC0\uB85C \uC218\uB77D\xB7\uAC70\uC808 \uC751\uB2F5\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Would you like some coffee?"
      },
      {
        id: "F-022-Q03",
        skill: "conversation-flow",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "Sorry, I'm using it right now.",
          "The printer is white.",
          "I like documents.",
          "See you next week."
        ],
        answer: 0,
        explanation: "\uD504\uB9B0\uD130 \uC0AC\uC6A9 \uAC00\uB2A5 \uC5EC\uBD80 \uC9C8\uBB38\uC774\uBBC0\uB85C \uC0AC\uC6A9 \uC911\uC774\uB77C\uACE0 \uB2F5\uD558\uB294 \uAC83\uC774 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Is the printer free?"
      },
      {
        id: "F-022-Q04",
        skill: "response",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "About fifteen minutes by subway.",
          "I bought a map yesterday.",
          "Stations are crowded.",
          "Let's cancel the trip."
        ],
        answer: 0,
        explanation: "\uC18C\uC694 \uC2DC\uAC04\uC744 \uBB3C\uC5C8\uC73C\uBBC0\uB85C \uC2DC\uAC04\uC73C\uB85C \uB2F5\uD569\uB2C8\uB2E4.",
        transcript: "A: How long does it take to get to the station?"
      },
      {
        id: "F-022-Q05",
        skill: "function",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "I'd love to, but I have another call.",
          "Meetings are important.",
          "The room number is 204.",
          "Please write an agenda."
        ],
        answer: 0,
        explanation: "\uD568\uAED8 \uB4E4\uC5B4\uAC00\uC790\uB294 \uC81C\uC548\uC5D0 \uB300\uD55C \uACF5\uC190\uD55C \uAC70\uC808\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Why don't we join the meeting together?"
      },
      {
        id: "F-022-Q06",
        skill: "response",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "Yes, here it is.",
          "Pens are cheap.",
          "I lost my keys.",
          "Blue looks nice."
        ],
        answer: 0,
        explanation: "\uD39C\uC744 \uBE4C\uB824\uB2EC\uB77C\uB294 \uC694\uCCAD\uC5D0 \uAC74\uB124\uB294 \uC751\uB2F5\uC774 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Can I borrow your pen for a second?"
      },
      {
        id: "F-022-Q07",
        skill: "conversation-flow",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "No, this is my first visit.",
          "The hotel has a gym.",
          "I reserved online.",
          "Check-out is at noon."
        ],
        answer: 0,
        explanation: "\uBC29\uBB38 \uACBD\uD5D8 \uC5EC\uBD80 Yes/No \uC9C8\uBB38\uC774\uBBC0\uB85C \uBC29\uBB38 \uC5EC\uBD80\uB97C \uB2F5\uD569\uB2C8\uB2E4.",
        transcript: "A: Have you been to this hotel before?"
      },
      {
        id: "F-022-Q08",
        skill: "response",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "It's next to the elevator.",
          "Restrooms are clean.",
          "I need water.",
          "I don't drink coffee."
        ],
        answer: 0,
        explanation: "\uC704\uCE58 \uC9C8\uBB38\uC5D0\uB294 \uC7A5\uC18C\uB85C \uB2F5\uD574\uC57C \uD569\uB2C8\uB2E4. \uB098\uBA38\uC9C0 \uC120\uD0DD\uC9C0\uB294 \uC9C8\uBB38\uACFC \uBB34\uAD00\uD569\uB2C8\uB2E4.",
        transcript: "A: Excuse me, where is the restroom?"
      },
      {
        id: "F-022-Q09",
        skill: "function",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "Congratulations! That's great news.",
          "Promotion means higher pay.",
          "I work in marketing.",
          "When is the interview?"
        ],
        answer: 0,
        explanation: "\uC2B9\uC9C4 \uC18C\uC2DD\uC5D0\uB294 \uCD95\uD558 \uC751\uB2F5\uC774 \uC790\uC5F0\uC2A4\uB7FD\uC2B5\uB2C8\uB2E4.",
        transcript: "A: I got promoted today."
      },
      {
        id: "F-022-Q10",
        skill: "conversation-flow",
        question: "\uB4E4\uC740 \uB9D0\uC5D0 \uB300\uD55C \uC54C\uB9DE\uC740 \uC751\uB2F5\uC740?",
        choices: [
          "Sure. How about Thursday afternoon?",
          "Schedules are complicated.",
          "I hate meetings.",
          "The calendar is digital."
        ],
        answer: 0,
        explanation: "\uC77C\uC815 \uC870\uC728 \uC81C\uC548\uC5D0 \uAD6C\uCCB4\uC801 \uC2DC\uAC04\uC744 \uC81C\uC548\uD558\uB294 \uC751\uB2F5\uC774 \uB9DE\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Can we reschedule our appointment?"
      }
    ]
  };

  // data/foundation/lessons/F-023.json
  var F_023_default = {
    id: "F-023",
    order: 23,
    title: "\uC22B\uC790\xB7\uC7A5\uC18C\xB7\uC2DC\uAC04",
    category: "listening",
    estimatedMinutes: 14,
    skills: ["listening-for-numbers", "place", "time"],
    objectives: [
      "\uB300\uD654\uC5D0\uC11C \uC22B\uC790\xB7\uAC00\uACA9\xB7\uC218\uB7C9\uC744 \uC815\uD655\uD788 \uC7A1\uB294\uB2E4",
      "\uC7A5\uC18C\xB7\uBC29\uD5A5 \uC815\uBCF4\uB97C \uAD6C\uBD84\uD55C\uB2E4",
      "\uC2DC\uAC04\xB7\uC694\uC77C\xB7\uAE30\uAC04 \uD45C\uD604\uC744 \uB4E3\uACE0 \uACE0\uB978\uB2E4"
    ],
    concept: {
      summary: "\uC22B\uC790\xB7\uC7A5\uC18C\xB7\uC2DC\uAC04 \uBB38\uC81C\uB294 \u2018\uD575\uC2EC \uC815\uBCF4 \uD55C \uBC29\u2019\uC744 \uB193\uCE58\uC9C0 \uC54A\uB294 \uD6C8\uB828\uC785\uB2C8\uB2E4. \uBE44\uC2B7\uD55C \uC22B\uC790(13/30), \uBCC0\uACBD\uB41C \uC2DC\uAC04, \uCD9C\uBC1C\uC9C0/\uB3C4\uCC29\uC9C0 \uD63C\uB3D9\uC5D0 \uC8FC\uC758\uD558\uC138\uC694. \uB300\uD654 \uC911\uAC04\uC5D0 \uC815\uBCF4\uAC00 \uC218\uC815\uB418\uBA74 \uB9C8\uC9C0\uB9C9 \uD655\uC815 \uC815\uBCF4\uB97C \uAE30\uC900\uC73C\uB85C \uB2F5\uD569\uB2C8\uB2E4.",
      points: [
        "\uC22B\uC790 \uC55E\uB4A4 \uB2E8\uC704(\uC6D0, \uBD84, \uCE35)\uB97C \uD568\uAED8 \uB4E3\uB294\uB2E4",
        "\uC815\uC815 \uD45C\uD604(actually / I mean) \uB4A4\uB97C \uC6B0\uC120\uD55C\uB2E4",
        "\uC7A5\uC18C\uB294 from/to/at/in \uC2E0\uD638\uB97C \uD45C\uC2DC\uD55C\uB2E4",
        "\uC2DC\uAC04\uC740 o'clock, half, quarter\uB97C \uAD6C\uBD84\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "A: The train leaves at 9:15. B: Got it. Platform 4.",
        ko: "A: \uAE30\uCC28\uB294 9\uC2DC 15\uBD84\uC5D0 \uCD9C\uBC1C\uD574\uC694. B: \uC54C\uACA0\uC5B4\uC694. 4\uBC88 \uC2B9\uAC15\uC7A5\uC774\uC5D0\uC694.",
        structure: "\uC2DC\uAC04 + \uC7A5\uC18C"
      },
      {
        en: "A: How much is this? B: It's $12.50.",
        ko: "A: \uC774\uAC70 \uC5BC\uB9C8\uC608\uC694? B: 12\uB2EC\uB7EC 50\uC13C\uD2B8\uC608\uC694.",
        structure: "\uAC00\uACA9 \uC22B\uC790"
      },
      {
        en: "A: Meet me at the main entrance. B: Okay, see you there.",
        ko: "A: \uC815\uBB38\uC5D0\uC11C \uB9CC\uB098\uC694. B: \uB124, \uAC70\uAE30\uC11C \uBD10\uC694.",
        structure: "\uC7A5\uC18C \uD655\uC815"
      }
    ],
    checks: [
      {
        id: "F-023-Q01",
        skill: "time",
        question: "\uD68C\uC758\uB294 \uBA87 \uC2DC\uC5D0 \uC2DC\uC791\uD569\uB2C8\uAE4C?",
        choices: ["1:00", "1:30", "2:00", "2:30"],
        answer: 1,
        explanation: "\uCC98\uC74C 2\uC2DC\uB97C \uB9D0\uD588\uC9C0\uB9CC actually\uB85C 1:30\uC73C\uB85C \uC815\uC815\uD588\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Does the meeting start at 2? B: Actually, it starts at 1:30."
      },
      {
        id: "F-023-Q02",
        skill: "listening-for-numbers",
        question: "\uD2F0\uCF13 \uAC00\uACA9\uC740 \uC5BC\uB9C8\uC785\uB2C8\uAE4C?",
        choices: ["$15", "$16", "$50", "$60"],
        answer: 0,
        explanation: "adult ticket\uC774 fifteen dollars\uB77C\uACE0 \uD588\uC2B5\uB2C8\uB2E4. fifty\uC640 \uD63C\uB3D9\uD558\uC9C0 \uB9C8\uC138\uC694.",
        transcript: "A: How much is an adult ticket? B: Fifteen dollars."
      },
      {
        id: "F-023-Q03",
        skill: "place",
        question: "\uC790\uB8CC\uB97C \uC5B4\uB514\uC5D0 \uB450\uC5C8\uC2B5\uB2C8\uAE4C?",
        choices: ["\uCC45\uC0C1 \uC704", "\uC11C\uB78D \uC548", "\uBCF5\uC0AC\uAE30 \uC606", "\uD68C\uC758\uC2E4"],
        answer: 2,
        explanation: "next to the copier\uAC00 \uC7A5\uC18C\uC785\uB2C8\uB2E4.",
        transcript: "A: Where did you leave the handouts? B: Next to the copier."
      },
      {
        id: "F-023-Q04",
        skill: "time",
        question: "\uBC84\uC2A4\uB294 \uBA87 \uC2DC\uC5D0 \uB3C4\uCC29\uD569\uB2C8\uAE4C?",
        choices: ["10:10", "10:20", "10:30", "11:10"],
        answer: 0,
        explanation: "ten ten, Gate C\uB77C\uACE0 \uD588\uC2B5\uB2C8\uB2E4.",
        transcript: "A: What time does the bus arrive? B: At ten ten, Gate C."
      },
      {
        id: "F-023-Q05",
        skill: "listening-for-numbers",
        question: "\uC608\uC57D \uC778\uC6D0\uC740 \uBA87 \uBA85\uC785\uB2C8\uAE4C?",
        choices: ["3\uBA85", "4\uBA85", "5\uBA85", "6\uBA85"],
        answer: 2,
        explanation: "for five\uB77C\uACE0 \uD655\uC815\uD588\uC2B5\uB2C8\uB2E4. table for four\uB294 \uC81C\uC548\uC774\uC5C8\uB2E4\uAC00 \uC218\uC815\uB429\uB2C8\uB2E4.",
        transcript: "A: A table for four? B: No, for five, please."
      },
      {
        id: "F-023-Q06",
        skill: "place",
        question: "\uC0C8 \uCE74\uD398\uB294 \uC5B4\uB514\uC5D0 \uC788\uC2B5\uB2C8\uAE4C?",
        choices: ["\uC740\uD589 \uB9DE\uC740\uD3B8", "\uC740\uD589 \uC548", "\uB3C4\uC11C\uAD00 \uC606", "\uC8FC\uCC28\uC7A5 \uC544\uB798"],
        answer: 0,
        explanation: "across from the bank\uAC00 \u2018\uC740\uD589 \uB9DE\uC740\uD3B8\u2019\uC785\uB2C8\uB2E4.",
        transcript: "A: Where is the new caf\xE9? B: It's across from the bank."
      },
      {
        id: "F-023-Q07",
        skill: "time",
        question: "\uB3C4\uC11C\uAD00\uC740 \uBA87 \uC2DC\uC5D0 \uB2EB\uC2B5\uB2C8\uAE4C?",
        choices: ["7 p.m.", "8 p.m.", "9 p.m.", "10 p.m."],
        answer: 2,
        explanation: "\uD3C9\uC77C 9\uC2DC\uC5D0 \uB2EB\uB294\uB2E4\uACE0 \uD588\uC2B5\uB2C8\uB2E4.",
        transcript: "A: What time does the library close on weekdays? B: At 9 p.m."
      },
      {
        id: "F-023-Q08",
        skill: "listening-for-numbers",
        question: "\uC0AC\uBB34\uC2E4\uC740 \uBA87 \uCE35\uC785\uB2C8\uAE4C?",
        choices: ["2\uCE35", "3\uCE35", "12\uCE35", "13\uCE35"],
        answer: 1,
        explanation: "third floor\uC785\uB2C8\uB2E4. thirteenth\uC640 \uD63C\uB3D9\uD558\uC9C0 \uB9C8\uC138\uC694.",
        transcript: "A: Which floor is the marketing office on? B: The third floor."
      },
      {
        id: "F-023-Q09",
        skill: "place",
        question: "\uD0DD\uC2DC\uB97C \uC5B4\uB514\uC11C \uD0D1\uB2C8\uAE4C?",
        choices: ["\uACF5\uD56D \uC548", "\uB3C4\uCC29 \uD640", "\uCD9C\uAD6C 3\uBC88 \uBC16", "\uC8FC\uCC28\uC7A5 \uC785\uAD6C"],
        answer: 2,
        explanation: "outside Exit 3\uB77C\uACE0 \uD588\uC2B5\uB2C8\uB2E4.",
        transcript: "A: Where can I catch a taxi? B: Outside Exit 3."
      },
      {
        id: "F-023-Q10",
        skill: "time",
        question: "\uC57D\uC18D\uC740 \uBB34\uC2A8 \uC694\uC77C\uC785\uB2C8\uAE4C?",
        choices: ["\uC6D4\uC694\uC77C", "\uD654\uC694\uC77C", "\uC218\uC694\uC77C", "\uAE08\uC694\uC77C"],
        answer: 3,
        explanation: "\uD654\uC694\uC77C\uC5D0\uC11C \uAE08\uC694\uC77C\uB85C \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCD5C\uC885 \uC815\uBCF4\uB294 Friday\uC785\uB2C8\uB2E4.",
        transcript: "A: Is your appointment on Tuesday? B: It was, but I moved it to Friday."
      }
    ]
  };

  // data/foundation/lessons/F-024.json
  var F_024_default = {
    id: "F-024",
    order: 24,
    title: "\uC9E7\uC740 \uB300\uD654 \uC0C1\uD669",
    category: "listening",
    estimatedMinutes: 15,
    skills: ["dialogue", "situation", "next-action"],
    objectives: [
      "\uC9E7\uC740 \uB300\uD654\uC758 \uC7A5\uC18C\xB7\uAD00\uACC4\uB97C \uD30C\uC545\uD55C\uB2E4",
      "\uD654\uC790\uC758 \uBAA9\uC801\uACFC \uB2E4\uC74C \uD589\uB3D9\uC744 \uCD94\uB860\uD55C\uB2E4",
      "\uC138\uBD80 \uD55C \uB2E8\uC5B4\uC5D0\uB9CC \uB9E4\uBAB0\uB418\uC9C0 \uC54A\uACE0 \uC0C1\uD669\uC744 \uC77D\uB294\uB2E4"
    ],
    concept: {
      summary: "\uC0C1\uD669 \uD30C\uC545 \uBB38\uC81C\uB294 \uB2E8\uC5B4 \uD558\uB098\uAC00 \uC544\uB2C8\uB77C \u2018\uB204\uAC00, \uC5B4\uB514\uC11C, \uBB34\uC5C7\uC744 \uD558\uB824\uB294\uC9C0\u2019\uB97C \uC885\uD569\uD569\uB2C8\uB2E4. \uC9C1\uC5C5\xB7\uC7A5\uC18C \uB2E8\uC11C(menu, boarding pass, prescription)\uC640 \uD589\uB3D9 \uB3D9\uC0AC(reserve, cancel, check in)\uB97C \uC5F0\uACB0\uD558\uBA74 \uC7A5\uBA74\uC774 \uBCF4\uC785\uB2C8\uB2E4. \uB9C8\uC9C0\uB9C9 \uBC1C\uD654\uAC00 \uB2E4\uC74C \uD589\uB3D9\uC744 \uC54C\uB824 \uC8FC\uB294 \uACBD\uC6B0\uAC00 \uB9CE\uC2B5\uB2C8\uB2E4.",
      points: [
        "\uC7A5\uC18C \uB2E8\uC11C \uC5B4\uD718\uB97C \uBA3C\uC800 \uD45C\uC2DC\uD55C\uB2E4",
        "\uD654\uC790 \uAD00\uACC4(\uB3D9\uB8CC/\uC810\uC6D0/\uC2B9\uAC1D)\uB97C \uCD94\uC815\uD55C\uB2E4",
        "\uBB38\uC81C\xB7\uD574\uACB0 \uAD6C\uC870\uB97C \uB4E3\uB294\uB2E4",
        "\uB2E4\uC74C \uD589\uB3D9\uC740 \uB300\uD654 \uB05D\uBD80\uBD84\uC744 \uC6B0\uC120\uD55C\uB2E4"
      ]
    },
    examples: [
      {
        en: "A: I'd like to return this shirt. B: Do you have the receipt?",
        ko: "A: \uC774 \uC154\uCE20\uB97C \uBC18\uD488\uD558\uACE0 \uC2F6\uC5B4\uC694. B: \uC601\uC218\uC99D \uC788\uC73C\uC138\uC694?",
        structure: "\uC0C1\uD669: \uB9E4\uC7A5 \uBC18\uD488"
      },
      {
        en: "A: Gate 22 has changed to Gate 25. B: Thanks for the update.",
        ko: "A: 22\uBC88 \uAC8C\uC774\uD2B8\uAC00 25\uBC88\uC73C\uB85C \uBCC0\uACBD\uB410\uC5B4\uC694. B: \uC54C\uB824 \uC8FC\uC154\uC11C \uAC10\uC0AC\uD574\uC694.",
        structure: "\uC0C1\uD669: \uACF5\uD56D \uD0D1\uC2B9"
      },
      {
        en: "A: The system is down. B: I'll reboot the router.",
        ko: "A: \uC2DC\uC2A4\uD15C\uC774 \uB2E4\uC6B4\uB410\uC5B4\uC694. B: \uACF5\uC720\uAE30\uB97C \uC7AC\uBD80\uD305\uD560\uAC8C\uC694.",
        structure: "\uB2E4\uC74C \uD589\uB3D9: \uC7AC\uBD80\uD305"
      }
    ],
    checks: [
      {
        id: "F-024-Q01",
        skill: "situation",
        question: "\uB300\uD654\uB294 \uC5B4\uB514\uC5D0\uC11C \uC774\uB8E8\uC5B4\uC9C8 \uAC00\uB2A5\uC131\uC774 \uD07D\uB2C8\uAE4C?",
        choices: ["\uC2DD\uB2F9", "\uBCD1\uC6D0", "\uC11C\uC810", "\uC740\uD589"],
        answer: 0,
        explanation: "table for two, menu \uB2E8\uC11C\uB85C \uC2DD\uB2F9 \uC0C1\uD669\uC785\uB2C8\uB2E4.",
        transcript: "A: A table for two, please. B: Right this way. Here are your menus."
      },
      {
        id: "F-024-Q02",
        skill: "dialogue",
        question: "\uB450 \uC0AC\uB78C\uC758 \uAD00\uACC4\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: ["\uC810\uC6D0\uACFC \uC190\uB2D8", "\uC758\uC0AC\uC640 \uD658\uC790", "\uAD50\uC0AC\uC640 \uD559\uC0DD", "\uC6B4\uC804\uC0AC\uC640 \uC2B9\uAC1D"],
        answer: 0,
        explanation: "\uC0AC\uC774\uC988 \uAD50\uD658\xB7\uD53C\uD305\uB8F8 \uB2E8\uC11C\uB85C \uB9E4\uC7A5 \uC810\uC6D0-\uC190\uB2D8 \uAD00\uACC4\uC785\uB2C8\uB2E4.",
        transcript: "A: Can I exchange this for a larger size? B: Of course. The fitting room is over there."
      },
      {
        id: "F-024-Q03",
        skill: "next-action",
        question: "\uB0A8\uC790\uAC00 \uB2E4\uC74C\uC5D0 \uD560 \uC77C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uB2E4\uB978 \uC5F4\uCC28\uB85C \uAC08\uC544\uD0C4\uB2E4",
          "\uD45C\uB97C \uD658\uBD88\uD55C\uB2E4",
          "\uC5ED\uBB34\uC6D0\uC5D0\uAC8C \uD56D\uC758\uD55C\uB2E4",
          "\uD0DD\uC2DC\uB97C \uC989\uC2DC \uD0C4\uB2E4"
        ],
        answer: 0,
        explanation: "\uB2E4\uC74C \uC5F4\uCC28\uB97C \uD0C0\uB77C\uB294 \uC548\uB0B4\uB97C \uBC1B\uC544\uB4E4\uC785\uB2C8\uB2E4.",
        transcript: "A: The 8:10 train is delayed. B: You can take the next one at 8:25. A: Okay, I'll do that."
      },
      {
        id: "F-024-Q04",
        skill: "situation",
        question: "\uB300\uD654\uC758 \uC8FC\uC694 \uBAA9\uC801\uC740 \uBB34\uC5C7\uC785\uB2C8\uAE4C?",
        choices: [
          "\uD68C\uC758\uC2E4 \uC608\uC57D\uD558\uAE30",
          "\uBCF5\uC0AC\uAE30 \uC218\uB9AC \uC694\uCCAD\uD558\uAE30",
          "\uCD9C\uC7A5 \uC77C\uC815 \uC7A1\uAE30",
          "\uC810\uC2EC \uBA54\uB274 \uACE0\uB974\uAE30"
        ],
        answer: 0,
        explanation: "room availability\uC640 book it\uC73C\uB85C \uD68C\uC758\uC2E4 \uC608\uC57D\uC774 \uBAA9\uC801\uC785\uB2C8\uB2E4.",
        transcript: "A: Is Room 3 available at 3 p.m.? B: Yes. Should I book it for one hour? A: Please do."
      },
      {
        id: "F-024-Q05",
        skill: "dialogue",
        question: "\uC5EC\uC790\uAC00 \uBD88\uD3B8\uD574\uD558\uB294 \uC774\uC720\uB294 \uBB34\uC5C7\uC785\uB2C8\uAE4C?",
        choices: [
          "\uC5D0\uC5B4\uCEE8\uC774 \uB108\uBB34 \uAC15\uD558\uB2E4",
          "\uCC3D\uBB38\uC774 \uC5F4\uB9AC\uC9C0 \uC54A\uB294\uB2E4",
          "\uC790\uB9AC\uAC00 \uC5C6\uB2E4",
          "\uC870\uBA85\uC774 \uB108\uBB34 \uC5B4\uB461\uB2E4"
        ],
        answer: 0,
        explanation: "freezing, turn down the air conditioner\uAC00 \uADFC\uAC70\uC785\uB2C8\uB2E4.",
        transcript: "A: It's freezing in here. B: I'll turn down the air conditioner."
      },
      {
        id: "F-024-Q06",
        skill: "next-action",
        question: "\uC9C1\uC6D0\uC774 \uB2E4\uC74C\uC5D0 \uD560 \uC77C\uC740 \uBB34\uC5C7\uC785\uB2C8\uAE4C?",
        choices: [
          "\uC0C8 \uC5F4\uC1E0\uB97C \uBC1C\uAE09\uD55C\uB2E4",
          "\uBC29\uC744 \uC5C5\uADF8\uB808\uC774\uB4DC\uD55C\uB2E4",
          "\uCCB4\uD06C\uC544\uC6C3\uC744 \uC9C4\uD589\uD55C\uB2E4",
          "\uC870\uC2DD\uC744 \uCDE8\uC18C\uD55C\uB2E4"
        ],
        answer: 0,
        explanation: "\uC5F4\uC1E0 \uBD84\uC2E4 \uD6C4 \uC0C8 \uD0A4\uB97C \uB9CC\uB4E4\uC5B4 \uC8FC\uACA0\uB2E4\uACE0 \uD588\uC2B5\uB2C8\uB2E4.",
        transcript: "A: I lost my room key. B: No problem. I'll issue a new one at the front desk."
      },
      {
        id: "F-024-Q07",
        skill: "situation",
        question: "\uB300\uD654\uAC00 \uC774\uB8E8\uC5B4\uC9C0\uB294 \uC7A5\uC18C\uB85C \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: ["\uC57D\uAD6D", "\uC6B0\uCCB4\uAD6D", "\uBBF8\uC220\uAD00", "\uCCB4\uC721\uAD00"],
        answer: 0,
        explanation: "prescription, pharmacist \uB2E8\uC11C\uB85C \uC57D\uAD6D\uC785\uB2C8\uB2E4.",
        transcript: "A: I'd like to fill this prescription. B: It'll be ready in twenty minutes."
      },
      {
        id: "F-024-Q08",
        skill: "dialogue",
        question: "\uB0A8\uC790\uAC00 \uC804\uD654\uD55C \uC774\uC720\uB294 \uBB34\uC5C7\uC785\uB2C8\uAE4C?",
        choices: [
          "\uBC30\uC1A1 \uC9C0\uC5F0\uC744 \uD655\uC778\uD558\uB824\uACE0",
          "\uC0C8 \uC81C\uD488\uC744 \uC8FC\uBB38\uD558\uB824\uACE0",
          "\uC8FC\uC18C\uB97C \uBC14\uAFB8\uB824\uACE0",
          "\uD658\uBD88\uC744 \uAC70\uC808\uD558\uB824\uACE0"
        ],
        answer: 0,
        explanation: "order hasn't arrived\uB85C \uBC30\uC1A1 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uB294 \uD1B5\uD654\uC785\uB2C8\uB2E4.",
        transcript: "A: Hi, my order hasn't arrived yet. B: Let me check the tracking number for you."
      },
      {
        id: "F-024-Q09",
        skill: "next-action",
        question: "\uB450 \uC0AC\uB78C\uC774 \uB2E4\uC74C\uC5D0 \uD558\uAE30\uB85C \uD55C \uAC83\uC740?",
        choices: [
          "\uC790\uB8CC\uB97C \uBA3C\uC800 \uC77D\uACE0 \uB0B4\uC77C \uB2E4\uC2DC \uC774\uC57C\uAE30\uD55C\uB2E4",
          "\uC9C0\uAE08 \uBC14\uB85C \uACB0\uC815\uD55C\uB2E4",
          "\uD504\uB85C\uC81D\uD2B8\uB97C \uCDE8\uC18C\uD55C\uB2E4",
          "\uB2E4\uB978 \uD300\uC5D0 \uB118\uAE34\uB2E4"
        ],
        answer: 0,
        explanation: "read the proposal tonight, talk tomorrow morning\uC774 \uB2E4\uC74C \uACC4\uD68D\uC785\uB2C8\uB2E4.",
        transcript: "A: Should we decide now? B: Let's read the proposal tonight and talk tomorrow morning."
      },
      {
        id: "F-024-Q10",
        skill: "situation",
        question: "\uB300\uD654\uC758 \uC0C1\uD669\uC73C\uB85C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uAC83\uC740?",
        choices: [
          "\uACF5\uD56D\uC5D0\uC11C \uD0D1\uC2B9 \uAC8C\uC774\uD2B8\uB97C \uD655\uC778\uD558\uACE0 \uC788\uB2E4",
          "\uD638\uD154\uC5D0\uC11C \uC870\uC2DD\uC744 \uC8FC\uBB38\uD558\uACE0 \uC788\uB2E4",
          "\uD559\uAD50\uC5D0\uC11C \uC2DC\uD5D8\uC744 \uBCF4\uACE0 \uC788\uB2E4",
          "\uC740\uD589\uC5D0\uC11C \uACC4\uC88C\uB97C \uB9CC\uB4E4\uACE0 \uC788\uB2E4"
        ],
        answer: 0,
        explanation: "boarding pass, gate number\uB294 \uACF5\uD56D \uD0D1\uC2B9 \uC0C1\uD669 \uB2E8\uC11C\uC785\uB2C8\uB2E4.",
        transcript: "A: Could you check my boarding pass? Which gate is it? B: Gate 17. Boarding begins in ten minutes."
      }
    ]
  };

  // js/content/embedded.js
  var EMBEDDED = {
    "./data/vocabulary.json": vocabulary_default,
    "./data/grammar.json": grammar_default,
    "./data/reading.json": reading_default,
    "./data/listening.json": listening_default,
    "./data/guide.json": guide_default,
    "./data/packs/manifest.json": manifest_default,
    "./data/packs/TEPS_Crew_Pack_001.json": TEPS_Crew_Pack_001_default,
    "./data/packs/TEPS_Crew_Pack_002.json": TEPS_Crew_Pack_002_default,
    "./data/packs/TEPSCrew_Pack_kim_reading_0001.json": TEPSCrew_Pack_kim_reading_0001_default,
    "./data/foundation/manifest.json": manifest_default2,
    "./data/foundation/lessons/F-001.json": F_001_default,
    "./data/foundation/lessons/F-002.json": F_002_default,
    "./data/foundation/lessons/F-003.json": F_003_default,
    "./data/foundation/lessons/F-004.json": F_004_default,
    "./data/foundation/lessons/F-005.json": F_005_default,
    "./data/foundation/lessons/F-006.json": F_006_default,
    "./data/foundation/lessons/F-007.json": F_007_default,
    "./data/foundation/lessons/F-008.json": F_008_default,
    "./data/foundation/lessons/F-009.json": F_009_default,
    "./data/foundation/lessons/F-010.json": F_010_default,
    "./data/foundation/lessons/F-011.json": F_011_default,
    "./data/foundation/lessons/F-012.json": F_012_default,
    "./data/foundation/lessons/F-013.json": F_013_default,
    "./data/foundation/lessons/F-014.json": F_014_default,
    "./data/foundation/lessons/F-015.json": F_015_default,
    "./data/foundation/lessons/F-016.json": F_016_default,
    "./data/foundation/lessons/F-017.json": F_017_default,
    "./data/foundation/lessons/F-018.json": F_018_default,
    "./data/foundation/lessons/F-019.json": F_019_default,
    "./data/foundation/lessons/F-020.json": F_020_default,
    "./data/foundation/lessons/F-021.json": F_021_default,
    "./data/foundation/lessons/F-022.json": F_022_default,
    "./data/foundation/lessons/F-023.json": F_023_default,
    "./data/foundation/lessons/F-024.json": F_024_default
  };
  function normalizePath(path) {
    if (!path) return "";
    let p = String(path).split(String.fromCharCode(92)).join("/");
    if (p.startsWith("/")) p = "." + p;
    if (!p.startsWith("./")) p = "./" + p.replace(/^\.\//, "");
    return p;
  }
  function getEmbeddedJson(path) {
    return EMBEDDED[normalizePath(path)];
  }

  // js/utils.js
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  }
  function formatRelativeTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 6e4);
    if (minutes < 1) return "\uBC29\uAE08 \uC804";
    if (minutes < 60) return `${minutes}\uBD84 \uC804`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}\uC2DC\uAC04 \uC804`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}\uC77C \uC804`;
    return formatDate(iso);
  }
  function uid(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("\uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
      reader.readAsText(file);
    });
  }
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function formatTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }
  var STAGE_META = {
    foundation: {
      id: "foundation",
      label: "Foundation",
      description: "TEPS \uC2E4\uC804 \uC804\uC5D0 \uC601\uC5B4 \uAE30\uBCF8\uAE30\uB97C \uB2E4\uC2DC \uB9CC\uB4DC\uB294 \uB2E8\uACC4\uC785\uB2C8\uB2E4."
    },
    buildup: {
      id: "buildup",
      label: "Build-up",
      description: "\uAE30\uCD08\uC640 TEPS \uC720\uD615\uD6C8\uB828\uC744 \uD568\uAED8 \uC9C4\uD589\uD558\uB294 \uB2E8\uACC4\uC785\uB2C8\uB2E4."
    },
    near327: {
      id: "near327",
      label: "Near 327",
      description: "\uBAA9\uD45C\uC810\uC218\uC5D0 \uAC00\uAE4C\uC6CC\uC84C\uC2B5\uB2C8\uB2E4. \uCDE8\uC57D \uC601\uC5ED\uC744 \uC9D1\uC911\uC801\uC73C\uB85C \uBCF4\uC644\uD558\uC138\uC694."
    },
    target327: {
      id: "target327",
      label: "Target 327",
      description: "\uBAA9\uD45C\uC810\uC218\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4."
    },
    safezone: {
      id: "safezone",
      label: "Safe Zone",
      description: "\uCD5C\uADFC \uD3C9\uAC00\uC5D0\uC11C \uC548\uC815\uC801\uC73C\uB85C \uBAA9\uD45C\uC810\uC218\uB97C \uB118\uACE0 \uC788\uC2B5\uB2C8\uB2E4."
    }
  };
  var KNOWLEDGE_MAP_TEMPLATE = SKILL_TAXONOMY;
  function createDefaultKnowledgeMap() {
    const map = { id: "default", updatedAt: (/* @__PURE__ */ new Date()).toISOString(), sections: {} };
    Object.entries(KNOWLEDGE_MAP_TEMPLATE).forEach(([section, items]) => {
      map.sections[section] = items.map((item) => ({
        ...item,
        mastery: 0
      }));
    });
    return map;
  }
  async function fetchJson(path) {
    const embedded = getEmbeddedJson(path);
    if (embedded !== void 0) {
      try {
        return structuredClone(embedded);
      } catch {
        return JSON.parse(JSON.stringify(embedded));
      }
    }
    if (typeof location !== "undefined" && location.protocol === "file:") {
      throw new Error(`\uB0B4\uC7A5 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${path}`);
    }
    const res = await fetch(path);
    if (!res.ok) throw new Error(`\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${path}`);
    return res.json();
  }

  // js/config.js
  var TEPS_CONFIG = {
    full: {
      totalQuestions: 135,
      durationMinutes: 105,
      sections: {
        listening: 60,
        vocabulary: 30,
        grammar: 30,
        reading: 45
      }
    },
    mini: {
      preferredTotal: 24,
      durationMinutes: 25,
      /** Preferred counts when bank is large enough */
      sections: {
        listening: 6,
        vocabulary: 5,
        grammar: 5,
        reading: 8
      },
      /** Minimum total to start a meaningful Mini TEPS */
      minQuestions: 4
    },
    diagnosis: {
      preferredPerSection: 2,
      minQuestions: 3,
      durationMinutes: 15
    },
    sectionMaxScores: {
      listening: 240,
      vocabulary: 60,
      grammar: 60,
      reading: 240
    },
    totalMaxScore: 600
  };
  var SECTION_WEIGHTS = {
    listening: 1,
    reading: 1,
    vocabulary: 0.6,
    grammar: 0.6
  };
  var ERROR_REASONS = [
    { id: "vocabulary", label: "\uB2E8\uC5B4\uB97C \uBAB0\uB790\uC5B4\uC694" },
    { id: "structure", label: "\uBB38\uC7A5 \uAD6C\uC870\uB97C \uC774\uD574\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694" },
    { id: "grammar", label: "\uBB38\uBC95 \uAC1C\uB150\uC774 \uBD80\uC871\uD588\uC5B4\uC694" },
    { id: "judgment", label: "\uB0B4\uC6A9\uC744 \uC774\uD574\uD588\uC9C0\uB9CC \uD310\uB2E8\uC744 \uD2C0\uB838\uC5B4\uC694" },
    { id: "inference", label: "\uCD94\uB860 \uACFC\uC815\uC5D0\uC11C \uD2C0\uB838\uC5B4\uC694" },
    { id: "time", label: "\uC2DC\uAC04\uC774 \uBD80\uC871\uD588\uC5B4\uC694" },
    { id: "mistake", label: "\uC2E4\uC218\uD588\uC5B4\uC694" },
    { id: "unknown", label: "\uC798 \uBAA8\uB974\uACA0\uC5B4\uC694" }
  ];
  var PRACTICE_MODES = {
    practice: "practice",
    review: "review",
    miniMock: "miniMock",
    fullMock: "fullMock",
    diagnosis: "diagnosis",
    lesson: "lesson",
    target327: "target327"
  };
  var VOCAB_KNOWN_INTERVALS = [3, 7, 14, 30];

  // js/mastery.js
  function normalizeSkill(section, skill) {
    return canonicalizeSkill(section, skill);
  }
  function skillsFromQuestion(question) {
    const section = question?.section || "reading";
    const raw = [];
    if (Array.isArray(question?.skills)) raw.push(...question.skills);
    if (question?.type) raw.push(question.type);
    const seen = /* @__PURE__ */ new Set();
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
  function addDays(isoOrDate, days) {
    const d = isoOrDate ? new Date(isoOrDate) : /* @__PURE__ */ new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  function isDue(iso) {
    if (!iso) return true;
    return new Date(iso).getTime() <= Date.now();
  }
  function calculateNextReview(input) {
    const { correct, consecutiveCorrect = 0, mastery = 20 } = input;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!correct) {
      return {
        nextReview: addDays(now, 1),
        consecutiveCorrect: 0,
        mastery: clamp(mastery - 12, 0, 100),
        status: "learning",
        wrongBump: 1
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
      status: mastered ? "mastered" : "learning",
      wrongBump: 0
    };
  }
  function createQuestionReviewItem(question, existing = null) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const skills = skillsFromQuestion(question);
    const base = existing || {
      id: `question-${question.id}`,
      type: "question",
      refId: question.id,
      section: question.section,
      skill: skills[0] || question.type || "",
      wrongCount: 0,
      reviewCount: 0,
      consecutiveCorrect: 0,
      mastery: 20,
      status: "learning",
      createdAt: now
    };
    return {
      ...base,
      section: question.section || base.section,
      skill: skills[0] || base.skill,
      lastAttempt: now,
      updatedAt: now
    };
  }
  function applyReviewAttempt(item, { correct }) {
    const calc = calculateNextReview({
      correct,
      consecutiveCorrect: item.consecutiveCorrect || 0,
      mastery: item.mastery ?? 20
    });
    return {
      ...item,
      wrongCount: (item.wrongCount || 0) + (correct ? 0 : calc.wrongBump),
      reviewCount: (item.reviewCount || 0) + 1,
      consecutiveCorrect: calc.consecutiveCorrect,
      mastery: calc.mastery,
      status: calc.status,
      nextReview: calc.nextReview,
      lastAttempt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  function computeSkillMasteryDelta({ correct, attemptsForSkill = 0 }) {
    if (attemptsForSkill < 1) {
      return correct ? 8 : -4;
    }
    if (attemptsForSkill < 4) {
      return correct ? 6 : -5;
    }
    return correct ? 4 : -6;
  }
  function applyKnowledgeMapUpdate(map, section, skillId, delta) {
    if (!map?.sections?.[section]) return map;
    const items = map.sections[section];
    const target = items.find((i) => i.id === skillId);
    if (!target) return map;
    const prev = target.mastery || 0;
    const stepped = clamp(delta, -10, 10);
    target.mastery = clamp(prev + stepped, 0, 100);
    map.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return map;
  }
  function applyVocabResult(existing, result) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const item = {
      known: 0,
      unsure: 0,
      unknown: 0,
      familiarity: 0,
      streak: 0,
      status: "learning",
      ...existing,
      id: existing?.id,
      lastResult: result,
      lastReviewedAt: now,
      updatedAt: now
    };
    if (result === "known") item.known += 1;
    if (result === "unsure") item.unsure += 1;
    if (result === "unknown") item.unknown += 1;
    if (result === "unknown") {
      item.streak = 0;
      item.familiarity = clamp((item.familiarity || 0) - 15, 0, 100);
      item.nextReview = addDays(now, 0);
      item.status = "learning";
    } else if (result === "unsure") {
      item.streak = 0;
      item.familiarity = clamp((item.familiarity || 0) + 5, 0, 100);
      item.nextReview = addDays(now, item.familiarity < 40 ? 1 : 3);
      item.status = "learning";
    } else {
      item.streak = (item.streak || 0) + 1;
      const idx = Math.min(item.streak - 1, VOCAB_KNOWN_INTERVALS.length - 1);
      const days = VOCAB_KNOWN_INTERVALS[Math.max(0, idx)];
      item.familiarity = clamp((item.familiarity || 0) + 12 + item.streak * 2, 0, 100);
      item.nextReview = addDays(now, days);
      if (item.streak >= 4 && item.familiarity >= 85) {
        item.status = "mastered";
        item.nextReview = addDays(now, 30);
      } else {
        item.status = "learning";
      }
    }
    return item;
  }
  function weaknessRatio(vocabItem) {
    const k = vocabItem.known || 0;
    const u = (vocabItem.unsure || 0) + (vocabItem.unknown || 0);
    const total = k + u;
    if (!total) return 0;
    return u / total;
  }

  // js/scoring.js
  var SECTIONS = ["listening", "vocabulary", "grammar", "reading"];
  function summarizeAttempts(attempts = []) {
    const bySection = Object.fromEntries(
      SECTIONS.map((s) => [s, { total: 0, correct: 0, time: 0 }])
    );
    const skillStats = {};
    attempts.forEach((a) => {
      const section = a.section || "reading";
      if (!bySection[section]) {
        bySection[section] = { total: 0, correct: 0, time: 0 };
      }
      bySection[section].total += 1;
      bySection[section].correct += a.correct ? 1 : 0;
      bySection[section].time += a.responseTime || 0;
      const skills = a.skills?.length ? a.skills : skillsFromQuestion({ section, type: a.questionType, skills: a.skills });
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
        const bandBoost = q.targetScoreBand === "327-target" ? 1.08 : 1;
        const w = (0.85 + diff * 0.05) * bandBoost;
        weightSum += w;
        if (attempt.correct) weightedCorrect += w;
      });
    }
    const acc = weightSum > 0 ? weightedCorrect / weightSum : stats.correct / stats.total;
    const n = stats.total;
    const prior = 0.45;
    const blended = (acc * n + prior * 2) / (n + 2);
    return Math.round(clamp(blended * max, 0, max));
  }
  function getScoreConfidence({ totalQuestions, demoRatio = 1, sectionsCovered = 0 }) {
    if (totalQuestions < 8 || sectionsCovered < 3 || demoRatio > 0.85) {
      return {
        level: "low",
        label: "\uB0AE\uC74C",
        message: "\uD604\uC7AC \uBB38\uC81C\uC740\uD589\uC774 \uC801\uAC70\uB098 Demo \uBB38\uD56D \uBE44\uC911\uC774 \uB192\uC544 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uB85C\uB9CC \uD65C\uC6A9\uD558\uC138\uC694."
      };
    }
    if (totalQuestions < 40 || sectionsCovered < 4) {
      return {
        level: "medium",
        label: "\uBCF4\uD1B5",
        message: "\uC5F0\uC2B5 \uACB0\uACFC \uAE30\uBC18\uC758 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uC131\uC801\uC774 \uC544\uB2D9\uB2C8\uB2E4."
      };
    }
    return {
      level: "high",
      label: "\uB192\uC74C",
      message: "\uC5F0\uC2B5 \uACB0\uACFC \uAE30\uBC18\uC758 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uC131\uC801\uC774 \uC544\uB2D9\uB2C8\uB2E4."
    };
  }
  function estimateTepsScore(attempts, questions = []) {
    const { bySection } = summarizeAttempts(attempts);
    const totalQuestions = attempts.length;
    const demoCount = questions.filter((q) => q.source === "demo").length;
    const demoRatio = totalQuestions ? demoCount / totalQuestions : 1;
    const scores = {};
    const accuracyBySection = {};
    let covered = 0;
    SECTIONS.forEach((section) => {
      const st = bySection[section] || { total: 0, correct: 0 };
      accuracyBySection[section] = st.total ? Math.round(st.correct / st.total * 1e3) / 10 : null;
      const meta = questions.filter((q) => q.section === section).map((q) => ({
        difficulty: q.difficulty,
        targetScoreBand: q.targetScoreBand,
        attempt: attempts.find((a) => a.questionId === q.id)
      })).filter((m) => m.attempt);
      const est = estimateSectionScore(section, st, meta);
      scores[section] = est;
      if (est != null && st.total >= 1) covered += 1;
    });
    const confidence = getScoreConfidence({
      totalQuestions,
      demoRatio,
      sectionsCovered: covered
    });
    if (totalQuestions < 4 || covered < 2) {
      return {
        score: null,
        scores,
        accuracyBySection,
        confidence: {
          level: "low",
          label: "\uB0AE\uC74C",
          message: "\uCE21\uC815 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4. \uB354 \uD480\uBA74 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uB97C \uC81C\uACF5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        },
        canEstimate: false,
        reason: "insufficient_data"
      };
    }
    const parts = SECTIONS.map((s) => scores[s]).filter((v) => v != null);
    if (!parts.length) {
      return {
        score: null,
        scores,
        accuracyBySection,
        confidence,
        canEstimate: false,
        reason: "no_section_scores"
      };
    }
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
      demoHeavy: demoRatio > 0.7
    };
  }
  function determineStage({ estimatedScore, targetScore = 327, recentMocks = [] }) {
    const valid = recentMocks.filter((m) => typeof m.score === "number");
    if (estimatedScore == null && !valid.length) {
      return STAGE_META.foundation;
    }
    const score = estimatedScore ?? valid[0]?.score ?? null;
    if (score == null) return STAGE_META.foundation;
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
  function computeGapPriorities({ accuracyBySection, knowledgeMap, attempts = [] }) {
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
        source: "attempts"
      });
    });
    if (knowledgeMap?.sections) {
      Object.entries(knowledgeMap.sections).forEach(([section, items]) => {
        (items || []).forEach((item) => {
          if ((item.mastery ?? 0) > 45) return;
          const weight = SECTION_WEIGHTS[section] || 0.6;
          const priority = (100 - (item.mastery || 0)) / 100 * weight * 0.85;
          weakSkills.push({
            section,
            skill: item.id,
            label: item.label,
            mastery: item.mastery || 0,
            priority,
            source: "knowledgeMap"
          });
        });
      });
    }
    const merged = /* @__PURE__ */ new Map();
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
        level: priorityLabel(weakness * weight)
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
    return {
      topSkills: ranked.slice(0, 5),
      sectionPriorities: sectionAcc
    };
  }
  function priorityLabel(score) {
    if (score >= 0.7) return "\uCD5C\uC6B0\uC120";
    if (score >= 0.5) return "\uB192\uC74C";
    if (score >= 0.3) return "\uBCF4\uD1B5";
    return "\uB0AE\uC74C";
  }
  function levelFromMastery(avg) {
    if (avg == null || Number.isNaN(avg)) return { level: 1, label: "\uAE30\uCD08" };
    if (avg < 30) return { level: 1, label: "\uAE30\uCD08" };
    if (avg < 60) return { level: 2, label: "\uC131\uC7A5" };
    return { level: 3, label: "\uC548\uC815" };
  }
  function sectionMasteryAverage(knowledgeMap, section) {
    const items = knowledgeMap?.sections?.[section] || [];
    if (!items.length) return 0;
    return items.reduce((s, i) => s + (i.mastery || 0), 0) / items.length;
  }

  // js/content/foundation-loader.js
  var MANIFEST_PATH = "./data/foundation/manifest.json";
  async function loadFoundationContent() {
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
        checks: Array.isArray(body.checks) ? body.checks : []
      });
    }
    lessons.sort((a, b) => (a.order || 0) - (b.order || 0));
    return {
      version: manifest.version || 1,
      demo: false,
      categories: manifest.categories || [],
      lessons
    };
  }
  function getNextFoundationLesson(lessons = [], foundationProgress = {}) {
    const sorted = [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
    const incomplete = sorted.filter((l) => foundationProgress[l.id]?.status !== "completed");
    if (!incomplete.length) return sorted[sorted.length - 1] || null;
    const inProgress = incomplete.map((l) => ({ lesson: l, p: foundationProgress[l.id] })).filter((x) => x.p?.status === "in_progress");
    if (inProgress.length) {
      inProgress.sort(
        (a, b) => (a.p.bestAccuracy ?? a.p.accuracy ?? 100) - (b.p.bestAccuracy ?? b.p.accuracy ?? 100)
      );
      return inProgress[0].lesson;
    }
    return incomplete[0];
  }
  function collectFoundationWrongChecks(lessons = [], foundationProgress = {}) {
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

  // js/recommendation.js
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function getWeakSkills(knowledgeMap, limit = 6) {
    const weak = [];
    if (!knowledgeMap?.sections) return weak;
    Object.entries(knowledgeMap.sections).forEach(([section, items]) => {
      (items || []).forEach((item) => {
        weak.push({
          section,
          skill: item.id,
          label: item.label,
          mastery: item.mastery || 0,
          score: (100 - (item.mastery || 0)) / 100 * (SECTION_WEIGHTS[section] || 0.6)
        });
      });
    });
    return weak.sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function rankQuestionsForUser(questions, ctx = {}) {
    const {
      knowledgeMap,
      recentWrongIds = /* @__PURE__ */ new Set(),
      recentAnsweredIds = /* @__PURE__ */ new Set(),
      preferTargetBand = false
    } = ctx;
    const weak = getWeakSkills(knowledgeMap, 12);
    const weakSet = new Set(weak.map((w) => `${w.section}:${w.skill}`));
    return questions.map((q) => {
      const skills = skillsFromQuestion(q);
      let score = 0;
      skills.forEach((sk) => {
        if (weakSet.has(`${q.section}:${sk}`)) score += 3;
      });
      if (recentWrongIds.has(q.id)) score += 2.5;
      if (preferTargetBand && q.targetScoreBand === "327-target") score += 2;
      if (q.difficulty >= 2 && q.difficulty <= 3) score += 1;
      if (recentAnsweredIds.has(q.id)) score -= 2;
      score += SECTION_WEIGHTS[q.section] || 0.5;
      return { q, score };
    }).sort((a, b) => b.score - a.score);
  }
  function buildPracticeSet(options = {}) {
    const {
      questions = [],
      count = 5,
      section = null,
      knowledgeMap = null,
      recentWrongIds = /* @__PURE__ */ new Set(),
      recentAnsweredIds = /* @__PURE__ */ new Set(),
      preferTargetBand = false,
      excludeIds = /* @__PURE__ */ new Set()
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
      preferTargetBand
    });
    const selected = [];
    const used = /* @__PURE__ */ new Set();
    ranked.forEach(({ q }) => {
      if (selected.length >= count) return;
      if (used.has(q.id)) return;
      selected.push(q);
      used.add(q.id);
    });
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
  function build327TargetSet(questions, ctx = {}, count = 10) {
    return buildPracticeSet({
      questions,
      count,
      knowledgeMap: ctx.knowledgeMap,
      recentWrongIds: ctx.recentWrongIds,
      recentAnsweredIds: ctx.recentAnsweredIds,
      preferTargetBand: true
    });
  }
  function buildBalancedSet(questions, sectionPlan, ctx = {}) {
    const selected = [];
    const used = /* @__PURE__ */ new Set();
    Object.entries(sectionPlan).forEach(([section, n]) => {
      if (!n) return;
      const chunk = buildPracticeSet({
        questions,
        count: n,
        section,
        excludeIds: used,
        knowledgeMap: ctx.knowledgeMap,
        recentWrongIds: ctx.recentWrongIds,
        recentAnsweredIds: ctx.recentAnsweredIds
      });
      chunk.forEach((q) => {
        selected.push(q);
        used.add(q.id);
      });
    });
    const totalWanted = Object.values(sectionPlan).reduce((a, b) => a + b, 0);
    if (selected.length < totalWanted) {
      const fill = buildPracticeSet({
        questions,
        count: totalWanted - selected.length,
        excludeIds: used,
        knowledgeMap: ctx.knowledgeMap
      });
      selected.push(...fill);
    }
    return selected;
  }
  function planMiniTePSCounts(questions) {
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
    if (total < TEPS_CONFIG.mini.minQuestions) {
      const leftovers = questions.slice(0, Math.min(questions.length, 10));
      return {
        plan: null,
        questions: leftovers,
        total: leftovers.length,
        scaled: true
      };
    }
    return { plan, total, scaled: total < TEPS_CONFIG.mini.preferredTotal };
  }
  function planFullTePSFeasibility(questions) {
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
      totalHave: questions.length
    };
  }
  function buildTodayPlan(state2) {
    const minutes = state2.settings?.dailyStudyMinutes || 30;
    const profile = state2.profile || {};
    const reviewQueue = state2.reviewQueue || [];
    const vocabMastery = state2.vocabMastery || {};
    const words = state2.content?.vocabulary?.words || [];
    const knowledgeMap = state2.knowledgeMap;
    const records = state2.learningRecords || [];
    const isNew = !profile.diagnosisCompleted && profile.estimatedScore == null && records.filter((r) => r.recordType === "question" || r.type === "practice").length < 3;
    const dueQuestions = reviewQueue.filter(
      (r) => r.type === "question" && r.status !== "mastered" && isDue(r.nextReview)
    );
    const dueVocab = words.filter((w) => {
      const m = vocabMastery[w.id];
      if (!m) return false;
      return m.status !== "mastered" && isDue(m.nextReview);
    });
    const newVocab = words.filter((w) => !vocabMastery[w.id]);
    const weakSkills = getWeakSkills(knowledgeMap, 3);
    const foundationLessons = state2.content?.foundation?.lessons || [];
    const foundationProgress = state2.foundationProgress || {};
    const nextFoundation = getNextFoundationLesson(foundationLessons, foundationProgress);
    const foundationDone = foundationLessons.length ? foundationLessons.every((l) => foundationProgress[l.id]?.status === "completed") : false;
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
        id: "foundation",
        title: "\uAE30\uCD08\uD559\uC2B5",
        detail: nextFoundation?.title || "\uC601\uC5B4 \uAE30\uCD08",
        reason: "\uCCAB \uC0AC\uC6A9\uC790\uC5D0\uAC8C Foundation\uBD80\uD130 \uCD94\uCC9C",
        minutes: Math.min(nextFoundation?.estimatedMinutes || 12, minutes),
        route: "lesson",
        params: { id: nextFoundation?.id || "F-001" }
      });
      push({
        id: "vocab-new",
        title: "\uB2E8\uC5B4 \uD559\uC2B5",
        detail: `\uC0C8 \uB2E8\uC5B4 ${Math.min(8, newVocab.length || 8)}\uAC1C`,
        reason: "\uC5B4\uD718 \uAE30\uBC18\uC744 \uBA3C\uC800 \uC313\uAE30",
        minutes: 5,
        route: "vocabulary",
        params: { tab: "new" }
      });
      push({
        id: "quick-practice",
        title: "\uBE60\uB978 \uBB38\uC81C\uD6C8\uB828",
        detail: "5\uBB38\uC81C",
        reason: "\uC9E7\uC740 Practice\uB85C \uD604\uC7AC \uAC10\uAC01 \uD655\uC778",
        minutes: 8,
        route: "practice-quiz",
        params: { count: 5, mode: "practice" }
      });
      if (!profile.diagnosisCompleted) {
        push({
          id: "diagnosis",
          title: "Quick Diagnosis",
          detail: "\uC601\uC5ED\uBCC4 \uAE30\uCD08 \uC9C4\uB2E8",
          reason: "\uC5B4\uB290 \uC601\uC5ED\uBD80\uD130 \uACF5\uBD80\uD560\uC9C0 \uD310\uB2E8",
          minutes: 10,
          route: "diagnosis"
        });
      }
      return { totalMinutes: minutes, items, source: "rule-new", isNew: true };
    }
    if (!foundationDone && nextFoundation) {
      push({
        id: "foundation-next",
        title: "\uAE30\uCD08\uD559\uC2B5",
        detail: nextFoundation.title,
        reason: "\uC544\uC9C1 \uB05D\uB098\uC9C0 \uC54A\uC740 Foundation Lesson \uC6B0\uC120",
        minutes: Math.min(nextFoundation.estimatedMinutes || 12, 15),
        route: "lesson",
        params: { id: nextFoundation.id }
      });
    }
    if (dueVocab.length) {
      push({
        id: "vocab-due",
        title: "\uB2E8\uC5B4 \uBCF5\uC2B5",
        detail: `${dueVocab.length}\uAC1C`,
        reason: `\uC624\uB298 \uBCF5\uC2B5 \uC608\uC815 \uB2E8\uC5B4 ${dueVocab.length}\uAC1C`,
        minutes: Math.min(8, 3 + Math.ceil(dueVocab.length / 3)),
        route: "vocabulary",
        params: { tab: "review" }
      });
    } else if (newVocab.length) {
      push({
        id: "vocab-new",
        title: "\uC0C8 \uB2E8\uC5B4",
        detail: `${Math.min(10, newVocab.length)}\uAC1C`,
        reason: "\uC544\uC9C1 \uD559\uC2B5\uD558\uC9C0 \uC54A\uC740 \uB2E8\uC5B4\uAC00 \uC788\uC2B5\uB2C8\uB2E4",
        minutes: 5,
        route: "vocabulary",
        params: { tab: "new" }
      });
    }
    if (dueQuestions.length) {
      push({
        id: "review-due",
        title: "\uC624\uB2F5 \uBCF5\uC2B5",
        detail: `${dueQuestions.length}\uBB38\uC81C`,
        reason: "\uBCF5\uC2B5 \uC77C\uC815\uC774 \uB3C4\uB798\uD55C \uC624\uB2F5",
        minutes: Math.min(10, 5 + dueQuestions.length),
        route: "review",
        params: { start: "1" }
      });
    }
    if (weakSkills[0]) {
      const w = weakSkills[0];
      push({
        id: "weak-skill",
        title: `${labelSection(w.section)} \xB7 ${w.label || w.skill}`,
        detail: "\uCDE8\uC57D Skill \uC9D1\uC911",
        reason: `\uC219\uB828\uB3C4 ${w.mastery}%\uB85C \uCD5C\uADFC \uC815\uB2F5\uB960/\uB9F5 \uAE30\uC900 \uC6B0\uC120 \uCD94\uCC9C`,
        minutes: 8,
        route: "practice-quiz",
        params: {
          count: 5,
          section: w.section,
          mode: "practice"
        }
      });
    }
    if (remaining >= 6) {
      const focus = (weakSkills.find((w) => w.section === "reading" || w.section === "listening") || weakSkills[0])?.section || "reading";
      push({
        id: "focus-practice",
        title: `${labelSection(focus)} \uD6C8\uB828`,
        detail: "\uCDE8\uC57D \uC601\uC5ED Practice",
        reason: `${labelSection(focus)} \uBE44\uC911\uC774 \uB192\uC544 \uC6B0\uC120 \uBC30\uCE58`,
        minutes: Math.min(10, remaining),
        route: "practice-quiz",
        params: { count: 5, section: focus, mode: "practice" }
      });
    }
    if (profile.estimatedScore == null && remaining >= 5) {
      push({
        id: "mini",
        title: "Mini TEPS",
        detail: "\uD604\uC7AC \uC0C1\uD0DC \uD655\uC778",
        reason: "\uC544\uC9C1 \uC608\uC0C1\uC810\uC218\uAC00 \uC5C6\uC5B4 \uC9C4\uB2E8\uC6A9 Mini TEPS \uCD94\uCC9C",
        minutes: Math.min(15, remaining),
        route: "mock-guide",
        params: { type: "mini" }
      });
    }
    if (!items.length) {
      push({
        id: "default-practice",
        title: "\uBB38\uC81C\uD6C8\uB828",
        detail: "5\uBB38\uC81C",
        reason: "\uAE30\uBCF8 \uD559\uC2B5 \uB8E8\uD2F4",
        minutes: 10,
        route: "practice-quiz",
        params: { count: 5 }
      });
    }
    return { totalMinutes: minutes, items, source: "rule", isNew: false };
  }
  function labelSection(section) {
    const map = {
      listening: "Listening",
      vocabulary: "Vocabulary",
      grammar: "Grammar",
      reading: "Reading"
    };
    return map[section] || section;
  }
  function collectRecentWrongIds(records, limit = 50) {
    const ids = /* @__PURE__ */ new Set();
    records.filter((r) => r.recordType === "question" && r.correct === false).slice(0, limit).forEach((r) => ids.add(r.questionId));
    return ids;
  }
  function collectRecentAnsweredIds(records, limit = 80) {
    const ids = /* @__PURE__ */ new Set();
    records.filter((r) => r.recordType === "question" && r.questionId).slice(0, limit).forEach((r) => ids.add(r.questionId));
    return ids;
  }
  function classifyVocabLists(words, vocabMastery) {
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
      if (m.status === "mastered") {
        mastered.push({ word: w, mastery: m });
        return;
      }
      if (isDue(m.nextReview)) review.push({ word: w, mastery: m });
      if (weaknessRatio(m) >= 0.4 || m.lastResult === "unknown" || m.lastResult === "unsure") {
        weak.push({ word: w, mastery: m });
      }
    });
    weak.sort((a, b) => weaknessRatio(b.mastery) - weaknessRatio(a.mastery));
    return { review, new: neu, weak, mastered };
  }

  // js/validator.js
  var VALID_SECTIONS = /* @__PURE__ */ new Set(["listening", "vocabulary", "grammar", "reading"]);
  function validateQuestion(question, index = 0) {
    const errors = [];
    const label = question?.id || `index:${index}`;
    if (!question || typeof question !== "object") {
      return [{ id: label, message: "\uBB38\uD56D\uC774 \uAC1D\uCCB4\uAC00 \uC544\uB2D9\uB2C8\uB2E4." }];
    }
    if (!question.id || typeof question.id !== "string") {
      errors.push({ id: label, message: "id\uAC00 \uC5C6\uAC70\uB098 \uBB38\uC790\uC5F4\uC774 \uC544\uB2D9\uB2C8\uB2E4." });
    }
    if (!VALID_SECTIONS.has(question.section)) {
      errors.push({
        id: label,
        message: `section\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. (${[...VALID_SECTIONS].join(", ")})`
      });
    }
    if (typeof question.difficulty !== "number" || question.difficulty < 1 || question.difficulty > 5) {
      errors.push({ id: label, message: "difficulty\uB294 1~5 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4." });
    }
    if (!Array.isArray(question.choices) || question.choices.length !== 4) {
      errors.push({ id: label, message: "choices\uB294 \uC815\uD655\uD788 4\uAC1C\uC5EC\uC57C \uD569\uB2C8\uB2E4." });
    }
    if (typeof question.answer !== "number" || question.answer < 0 || question.answer > 3 || !Number.isInteger(question.answer)) {
      errors.push({ id: label, message: "answer\uB294 0~3 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4." });
    }
    if (!question.explanation || typeof question.explanation !== "object") {
      errors.push({ id: label, message: "explanation \uAC1D\uCCB4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    } else {
      const ca = question.explanation.choiceAnalysis;
      if (!Array.isArray(ca) || ca.length !== 4) {
        errors.push({ id: label, message: "explanation.choiceAnalysis\uB294 4\uAC1C\uC5EC\uC57C \uD569\uB2C8\uB2E4." });
      }
    }
    return errors;
  }
  function validateQuestionBank(payload) {
    const result = {
      ok: false,
      packName: "\uBB38\uC81C \uD329",
      total: 0,
      valid: 0,
      invalid: 0,
      errors: [],
      validQuestions: [],
      invalidQuestions: []
    };
    let data = payload;
    let questions = [];
    if (typeof payload === "string") {
      try {
        data = JSON.parse(payload);
      } catch {
        result.errors.push({ id: "-", message: "JSON \uD30C\uC2F1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
        return result;
      }
    }
    if (Array.isArray(data)) {
      questions = data;
      result.packName = "Imported Questions";
    } else if (data && typeof data === "object") {
      result.packName = data.name || data.packName || data.title || "Imported Pack";
      if (Array.isArray(data.questions)) questions = data.questions;
      else {
        result.errors.push({ id: "-", message: "questions \uBC30\uC5F4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
        return result;
      }
    } else {
      result.errors.push({ id: "-", message: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4." });
      return result;
    }
    result.total = questions.length;
    const seen = /* @__PURE__ */ new Set();
    questions.forEach((q, index) => {
      const itemErrors = validateQuestion(q, index);
      if (q?.id) {
        if (seen.has(q.id)) {
          itemErrors.push({ id: q.id, message: "id\uAC00 \uC911\uBCF5\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
        } else {
          seen.add(q.id);
        }
      }
      if (itemErrors.length) {
        result.invalid += 1;
        result.invalidQuestions.push(q);
        result.errors.push(...itemErrors);
      } else {
        result.valid += 1;
        result.validQuestions.push(q);
      }
    });
    result.ok = result.invalid === 0 && result.valid > 0;
    return result;
  }

  // js/content/packs.js
  var MANIFEST_PATH2 = "./data/packs/manifest.json";
  async function loadPackManifest() {
    try {
      return await fetchJson(MANIFEST_PATH2);
    } catch {
      return { version: 1, packs: [] };
    }
  }
  function normalizePackPayload(raw, packMeta = {}) {
    let questions = [];
    let title = packMeta.title || "Content Pack";
    let packId = packMeta.id || "imported-pack";
    if (Array.isArray(raw)) {
      questions = raw;
    } else if (raw && typeof raw === "object") {
      title = raw.title || raw.name || raw.packName || title;
      packId = raw.id || packId;
      if (Array.isArray(raw.questions)) questions = raw.questions;
      else if (Array.isArray(raw.items)) questions = raw.items;
    }
    const source = packMeta.id || packId || "tepscrew-pack";
    const stamped = questions.map((q) => ({
      ...q,
      source,
      packId: source
    }));
    return {
      id: source,
      title,
      version: packMeta.version || raw?.version || 1,
      questions: stamped
    };
  }
  async function loadBuiltinPack(packMeta) {
    const raw = await fetchJson(packMeta.file);
    const pack = normalizePackPayload(raw, packMeta);
    const validation = validateQuestionBank({
      name: pack.title,
      questions: pack.questions
    });
    return { pack, validation };
  }
  async function loadAllBuiltinPacks() {
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
          validation: { ok: false, errors: [{ id: "-", message: err.message }] },
          error: err.message
        });
      }
    }
    return { manifest, loaded };
  }
  function computeBankStats(questions = []) {
    const stats = {
      total: questions.length,
      bySection: {},
      byDifficulty: {},
      byBand: {},
      byType: {},
      bySource: {},
      target327: 0
    };
    questions.forEach((q) => {
      stats.bySection[q.section] = (stats.bySection[q.section] || 0) + 1;
      const d = q.difficulty ?? "unknown";
      stats.byDifficulty[d] = (stats.byDifficulty[d] || 0) + 1;
      const band = q.targetScoreBand || "unspecified";
      stats.byBand[band] = (stats.byBand[band] || 0) + 1;
      const type = q.type || "unknown";
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      const src = q.source || "unknown";
      stats.bySource[src] = (stats.bySource[src] || 0) + 1;
      if (band === "327-target") stats.target327 += 1;
    });
    return stats;
  }
  function groupQuestionsBySkill(questions, section) {
    const groups = {};
    questions.filter((q) => !section || q.section === section).forEach((q) => {
      const skills = Array.isArray(q.skills) && q.skills.length ? q.skills : [q.type || "general"];
      skills.forEach((sk) => {
        if (!groups[sk]) groups[sk] = [];
        groups[sk].push(q);
      });
    });
    return groups;
  }
  function difficultyLabel(level) {
    if (level <= 2) return "\uC785\uBB38";
    if (level === 3) return "\uD575\uC2EC";
    return "\uB3C4\uC804";
  }

  // js/state.js
  var state = {
    ready: false,
    currentPage: "home",
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
      guide: null
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
    targetPreview: null
  };
  var listeners = /* @__PURE__ */ new Set();
  function getState() {
    return state;
  }
  function notify(reason = "update") {
    listeners.forEach((fn) => {
      try {
        fn(state, reason);
      } catch {
      }
    });
  }
  function setPage(page, params = {}) {
    state.currentPage = page;
    state.routeParams = params;
    notify("route");
  }
  function updateSettings(partial) {
    state.settings = saveSettings({ ...state.settings, ...partial });
    notify("settings");
    return state.settings;
  }
  function updateProfile(partial) {
    state.profile = saveProfile({ ...state.profile, ...partial });
    notify("profile");
    return state.profile;
  }
  async function ensureKnowledgeMap() {
    let map = await getItem("knowledgeMap", "default");
    if (!map) {
      map = createDefaultKnowledgeMap();
    }
    map = ensureTaxonomyInMap(map);
    await putItem("knowledgeMap", map);
    state.knowledgeMap = map;
    return map;
  }
  async function bumpKnowledgeFromAttempt(question, correct) {
    const map = await ensureKnowledgeMap();
    const skills = skillsFromQuestion(question);
    const section = question.section;
    const related = state.learningRecords.filter(
      (r) => r.recordType === "question" && r.section === section && (r.skills || []).some((s) => skills.includes(normalizeSkill(section, s) || s))
    );
    skills.forEach((skill) => {
      const attemptsForSkill = related.filter(
        (r) => (r.skills || []).map((s) => normalizeSkill(section, s) || s).includes(skill)
      ).length;
      const delta = computeSkillMasteryDelta({ correct, attemptsForSkill });
      applyKnowledgeMapUpdate(map, section, skill, delta);
    });
    await putItem("knowledgeMap", map);
    state.knowledgeMap = map;
    notify("knowledgeMap");
    return map;
  }
  async function addLearningRecord(record) {
    const item = {
      id: uid("lr"),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...record
    };
    await addItem("learningRecords", item);
    state.learningRecords = [item, ...state.learningRecords].slice(0, 500);
    notify("learningRecords");
    return item;
  }
  async function saveFoundationProgress(lessonId, progress) {
    const prev = state.foundationProgress[lessonId] || {};
    const item = {
      ...prev,
      ...progress,
      id: lessonId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await putItem("foundationProgress", item);
    state.foundationProgress[lessonId] = item;
    notify("foundationProgress");
    return item;
  }
  async function saveVocabResult(wordId, result) {
    const existing = state.vocabMastery[wordId] || { id: wordId };
    const next = applyVocabResult(existing, result);
    await putItem("vocabulary", next);
    state.vocabMastery[wordId] = next;
    await putItem("reviewQueue", {
      id: `vocab-${wordId}`,
      type: "vocabulary",
      refId: wordId,
      status: next.status === "mastered" ? "mastered" : "learning",
      mastery: next.familiarity || 0,
      nextReview: next.nextReview,
      lastAttempt: next.lastReviewedAt,
      updatedAt: next.updatedAt,
      createdAt: existing.createdAt || next.updatedAt
    });
    const allReview = await getAllItems("reviewQueue");
    state.reviewQueue = allReview;
    await addLearningRecord({
      recordType: "vocabulary",
      type: "vocabulary",
      title: "\uB2E8\uC5B4 \uD559\uC2B5",
      detail: `${wordId} \xB7 ${result}`,
      refId: wordId,
      result
    });
    notify("vocabulary");
    return next;
  }
  function getTodayPlan() {
    return buildTodayPlan(state);
  }
  function getScoreSummary() {
    const target = state.settings?.targetScore ?? 327;
    const estimated = state.profile?.estimatedScore ?? null;
    const highest = state.profile?.highestScore ?? null;
    const gap = estimated == null ? null : Math.max(0, target - estimated);
    const stageMeta = STAGE_META[state.profile?.currentStage] || determineStage({
      estimatedScore: estimated,
      targetScore: target,
      recentMocks: state.mockTests
    });
    const confidence = state.profile?.scoreConfidence || null;
    return { target, estimated, highest, gap, stage: stageMeta, confidence };
  }
  function getQuestionPool() {
    if (state.questionBank?.length) return state.questionBank;
    return [
      ...(state.content.grammar?.questions || []).map((q) => ({ ...q, source: "demo" })),
      ...(state.content.reading?.questions || []).map((q) => ({ ...q, source: "demo" })),
      ...(state.content.listening?.questions || []).map((q) => ({ ...q, source: "demo" }))
    ];
  }
  function practiceContext() {
    return {
      knowledgeMap: state.knowledgeMap,
      recentWrongIds: collectRecentWrongIds(state.learningRecords),
      recentAnsweredIds: collectRecentAnsweredIds(state.learningRecords)
    };
  }
  function selectPracticeQuestions({
    count = 5,
    section = null,
    target327 = false,
    questionIds = null
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
      ...practiceContext()
    });
  }
  function buildMiniQuestions() {
    const pool = getQuestionPool();
    const planned = planMiniTePSCounts(pool);
    if (planned.plan) {
      return {
        questions: buildBalancedSet(pool, planned.plan, practiceContext()),
        meta: planned
      };
    }
    return { questions: planned.questions, meta: planned };
  }
  function getFullTePSStatus() {
    return planFullTePSFeasibility(getQuestionPool());
  }
  async function upsertQuestionReview(question, { correct, mode }) {
    const id = `question-${question.id}`;
    const existing = await getItem("reviewQueue", id);
    let item = createQuestionReviewItem(question, existing);
    if (mode === "review" || existing) {
      item = applyReviewAttempt(item, { correct });
    } else if (!correct) {
      item.wrongCount = (item.wrongCount || 0) + 1;
      item.mastery = 20;
      item.status = "learning";
      item.consecutiveCorrect = 0;
      item.nextReview = new Date(Date.now() + 864e5).toISOString();
      item.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
      item.updatedAt = item.lastAttempt;
    } else if (!existing) {
      return null;
    } else {
      item = applyReviewAttempt(item, { correct: true });
    }
    if (!existing && correct) return null;
    await putItem("reviewQueue", item);
    const idx = state.reviewQueue.findIndex((r) => r.id === item.id);
    if (idx >= 0) state.reviewQueue[idx] = item;
    else state.reviewQueue.push(item);
    notify("reviewQueue");
    return item;
  }
  async function persistQuestionAttempt({
    session,
    question,
    selectedAnswer,
    correct,
    responseTime,
    errorReason = null,
    confidence = null
  }) {
    const skills = skillsFromQuestion(question);
    const record = {
      recordType: "question",
      type: session.mode || "practice",
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
      detail: `${question.section} \xB7 ${correct ? "\uC815\uB2F5" : "\uC624\uB2F5"}`
    };
    await addLearningRecord(record);
    await upsertQuestionReview(question, { correct, mode: session.mode });
    await bumpKnowledgeFromAttempt(question, correct);
    return record;
  }
  async function persistSessionSummary(session, summaryExtra = {}) {
    const attempts = Object.values(session.answers || {}).filter((a) => a.submitted);
    const correctCount = attempts.filter((a) => a.correct).length;
    const totalTime = attempts.reduce((s, a) => s + (a.responseTime || 0), 0);
    const summary = {
      recordType: "session",
      type: session.mode,
      title: session.title || session.mode,
      sessionId: session.sessionId,
      mode: session.mode,
      totalQuestions: session.questions.length,
      correctCount,
      accuracy: session.questions.length ? Math.round(correctCount / session.questions.length * 1e3) / 10 : 0,
      totalTime,
      detail: `${correctCount}/${session.questions.length}`,
      ...summaryExtra
    };
    await addLearningRecord(summary);
    return summary;
  }
  function setLastSessionResult(result) {
    state.lastSessionResult = result;
    notify("sessionResult");
  }
  function getLastSessionResult() {
    return state.lastSessionResult;
  }
  async function saveMockResult(mockRecord) {
    await putItem("mockTests", mockRecord);
    state.mockTests = [mockRecord, ...state.mockTests.filter((m) => m.id !== mockRecord.id)];
    notify("mockTests");
    const target = state.settings?.targetScore ?? 327;
    const nextProfile = { ...state.profile };
    if (typeof mockRecord.score === "number") {
      nextProfile.estimatedScore = mockRecord.score;
      nextProfile.highestScore = nextProfile.highestScore == null ? mockRecord.score : Math.max(nextProfile.highestScore, mockRecord.score);
      nextProfile.scoreConfidence = mockRecord.scoreConfidence || null;
    }
    if (mockRecord.type === "diagnosis") {
      nextProfile.diagnosisCompleted = true;
      nextProfile.diagnosis = mockRecord.diagnosis || null;
    }
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
      recentMocks: [mockRecord, ...state.mockTests]
    });
    nextProfile.currentStage = stage.id;
    updateProfile(nextProfile);
    return mockRecord;
  }
  async function refreshProfileStage() {
    const stage = determineStage({
      estimatedScore: state.profile?.estimatedScore,
      targetScore: state.settings?.targetScore ?? 327,
      recentMocks: state.mockTests
    });
    if (state.profile?.currentStage !== stage.id) {
      updateProfile({ currentStage: stage.id });
    }
    return stage;
  }
  function getVocabLists() {
    const words = state.content?.vocabulary?.words || [];
    return classifyVocabLists(words, state.vocabMastery);
  }
  function getDueReviewQuestions() {
    return state.reviewQueue.filter(
      (r) => r.type === "question" && r.status !== "mastered" && isDue(r.nextReview)
    );
  }
  function getWrongReviewQuestions() {
    return state.reviewQueue.filter((r) => r.type === "question" && (r.wrongCount || 0) > 0);
  }
  function getMasteredReviews() {
    return state.reviewQueue.filter((r) => r.status === "mastered");
  }
  function resolveQuestionsByReviewItems(items) {
    const pool = new Map(getQuestionPool().map((q) => [q.id, q]));
    return items.map((i) => pool.get(i.refId)).filter(Boolean);
  }
  async function ensureQuestionBankSeeded() {
    const existing = await getAllItems("questionBank");
    const byId = new Map(existing.map((q) => [q.id, q]));
    const packRecords = await getAllItems("contentPacks");
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
          if (prev.source === "demo" || prev.source === packId) {
            const next2 = { ...q, source: packId, packId };
            await putItem("questionBank", next2);
            byId.set(q.id, next2);
            added += 1;
          } else {
            skippedConflict += 1;
          }
          continue;
        }
        const next = { ...q, source: packId, packId };
        await putItem("questionBank", next);
        byId.set(q.id, next);
        added += 1;
      }
      await putItem("contentPacks", {
        id: packId,
        title: entry.pack.title,
        version: entry.pack.version,
        source: packId,
        questionCount: entry.pack.questions.length,
        installedAt: already ? packRecords.find((p) => p.id === packId)?.installedAt || (/* @__PURE__ */ new Date()).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        validationOk: entry.validation?.ok !== false,
        skippedConflict,
        added
      });
    }
    const demoPacks = [
      ...(state.content.reading?.questions || []).map((q) => ({ ...q, source: "demo" })),
      ...(state.content.listening?.questions || []).map((q) => ({ ...q, source: "demo" })),
      ...(state.content.grammar?.questions || []).map((q) => ({ ...q, source: "demo" }))
    ];
    for (const q of demoPacks) {
      if (byId.has(q.id)) continue;
      await putItem("questionBank", q);
      byId.set(q.id, q);
    }
    state.questionBank = [...byId.values()];
    state.contentPacks = await getAllItems("contentPacks");
    state.bankStats = computeBankStats(state.questionBank);
    return state.questionBank;
  }
  async function loadContent() {
    const [foundation, vocabulary, grammar, reading, listening, guide] = await Promise.all([
      loadFoundationContent(),
      fetchJson("./data/vocabulary.json"),
      fetchJson("./data/grammar.json"),
      fetchJson("./data/reading.json"),
      fetchJson("./data/listening.json"),
      fetchJson("./data/guide.json")
    ]);
    state.content = { foundation, vocabulary, grammar, reading, listening, guide };
  }
  async function loadProgressCaches() {
    const [records, review, mocks, progress, vocab, customVocab] = await Promise.all([
      getAllItems("learningRecords"),
      getAllItems("reviewQueue"),
      getAllItems("mockTests"),
      getAllItems("foundationProgress"),
      getAllItems("vocabulary"),
      getAllItems("customVocabulary")
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
  async function initAppState() {
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
        }
      }
      throw err;
    }
    state.ready = true;
    notify("ready");
    return state;
  }
  function getBankStats() {
    state.bankStats = computeBankStats(getQuestionPool());
    return state.bankStats;
  }
  async function addCustomVocabularyEntry(entry) {
    const word = String(entry.word || "").trim();
    if (!word) throw new Error("\uB2E8\uC5B4\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    const id = entry.id || `cv-${word.toLowerCase().replace(/\s+/g, "-")}`;
    const existing = state.customVocabulary[id] || await getItem("customVocabulary", id);
    const sources = /* @__PURE__ */ new Set([...existing?.sourceQuestionIds || [], ...entry.sourceQuestionIds || []]);
    const next = {
      id,
      word,
      meaning: entry.meaning || existing?.meaning || "",
      examples: entry.examples || existing?.examples || [],
      collocations: entry.collocations || existing?.collocations || [],
      confusableWords: entry.confusableWords || existing?.confusableWords || [],
      sourceQuestionIds: [...sources],
      status: existing?.status || "learning",
      createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await putItem("customVocabulary", next);
    state.customVocabulary[id] = next;
    notify("customVocabulary");
    return next;
  }
  function setTargetPreview(preview) {
    state.targetPreview = preview;
    notify("targetPreview");
  }
  function stripAiSecrets(settings) {
    if (!settings) return settings;
    const clone = JSON.parse(JSON.stringify(settings));
    if (clone.ai) {
      clone.ai.apiKey = "";
      clone.ai.keys = { openai: "", claude: "", gemini: "" };
    }
    return clone;
  }
  async function createBackupPayload() {
    const idb = await exportAllData();
    return {
      app: "tepscrew",
      version: 3,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      note: "AI API Key\uB294 \uBCF4\uC548\uC744 \uC704\uD574 \uBC31\uC5C5\uC5D0 \uD3EC\uD568\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    };
  }
  async function restoreBackupPayload(payload) {
    if (!payload || payload.app !== "tepscrew") {
      throw new Error("\uD15D\uC2A4\uD06C\uB8E8 \uBC31\uC5C5 \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
    }
    if (payload.settings) {
      const cleaned = stripAiSecrets(payload.settings);
      cleaned.ai = { ...state.settings?.ai || {}, ...cleaned.ai || {}, apiKey: "", keys: { openai: "", claude: "", gemini: "" } };
      state.settings = saveSettings(cleaned);
    }
    if (payload.profile) state.profile = saveProfile(payload.profile);
    const map = [
      ["learningRecords", payload.learningRecords],
      ["reviewQueue", payload.reviewQueue],
      ["mockTests", payload.mockTests],
      ["knowledgeMap", payload.knowledgeMap],
      ["foundationProgress", payload.foundationProgress],
      ["vocabulary", payload.vocabulary],
      ["customVocabulary", payload.customVocabulary],
      ["contentPacks", payload.contentPacks],
      ["questionBank", payload.questionBank]
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
    notify("restore");
  }
  async function resetAllUserData() {
    await clearAllStores();
    clearLocalStorageData();
    state.settings = loadSettings();
    state.profile = loadProfile();
    state.lastSessionResult = null;
    await ensureKnowledgeMap();
    await ensureQuestionBankSeeded();
    await loadProgressCaches();
    notify("reset");
  }
  async function importValidQuestions(questions, meta = {}) {
    let added = 0;
    let conflicts = 0;
    for (const q of questions) {
      const existing = await getItem("questionBank", q.id);
      if (existing && existing.source && existing.source !== "demo" && existing.source !== meta.source) {
        conflicts += 1;
        continue;
      }
      await putItem("questionBank", {
        ...q,
        source: meta.source || q.source || "imported",
        importedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      added += 1;
    }
    state.questionBank = await getAllItems("questionBank");
    state.bankStats = computeBankStats(state.questionBank);
    notify("questionBank");
    return { added, conflicts };
  }

  // js/router.js
  var ROUTES = {
    home: { page: "home", title: "\uD648" },
    guide: { page: "guide", title: "TEPS \uAC00\uC774\uB4DC" },
    foundation: { page: "foundation", title: "\uAE30\uCD08\uD559\uC2B5" },
    lesson: { page: "lesson", title: "Lesson" },
    "lesson-quiz": { page: "lesson-quiz", title: "\uAE30\uCD08 \uBBF8\uB2C8 \uD034\uC988" },
    teps: { page: "teps", title: "TEPS \uD559\uC2B5" },
    vocabulary: { page: "vocabulary", title: "Vocabulary" },
    practice: { page: "practice", title: "\uBB38\uC81C\uD6C8\uB828" },
    "practice-quiz": { page: "practice-quiz", title: "\uBB38\uC81C\uD480\uC774" },
    "practice-result": { page: "practice-result", title: "\uD480\uC774 \uACB0\uACFC" },
    "target-preview": { page: "target-preview", title: "327 Target" },
    mock: { page: "mock", title: "\uBAA8\uC758\uACE0\uC0AC" },
    "mock-guide": { page: "mock-guide", title: "\uBAA8\uC758\uACE0\uC0AC \uC548\uB0B4" },
    "mock-exam": { page: "mock-exam", title: "\uBAA8\uC758\uACE0\uC0AC \uC9C4\uD589" },
    "mock-result": { page: "mock-result", title: "\uBAA8\uC758\uACE0\uC0AC \uACB0\uACFC" },
    diagnosis: { page: "diagnosis", title: "Quick Diagnosis" },
    review: { page: "review", title: "\uC624\uB2F5\xB7\uBCF5\uC2B5" },
    "my-teps": { page: "my-teps", title: "My TEPS" },
    settings: { page: "settings", title: "\uC124\uC815" }
  };
  function parseHash() {
    const raw = (location.hash || "#home").replace(/^#/, "");
    const [pathPart, queryPart = ""] = raw.split("?");
    const path = pathPart || "home";
    const params = {};
    queryPart.split("&").forEach((pair) => {
      if (!pair) return;
      const [k, v = ""] = pair.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    const segments = path.split("/").filter(Boolean);
    const base = segments[0] || "home";
    if (segments[1]) params.id = segments[1];
    const route = ROUTES[base];
    if (!route) {
      return { page: "not-found", title: "\uD398\uC774\uC9C0 \uC5C6\uC74C", params, path: base };
    }
    return { ...route, params, path: base };
  }
  function navigate(path, params = {}) {
    const query = Object.entries(params).filter(([k, v]) => v != null && k !== "id").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    let hash = `#${path}`;
    if (params.id) hash = `#${path}/${params.id}`;
    if (query) hash += `?${query}`;
    location.hash = hash;
  }
  function startRouter(onChange) {
    const handle = () => {
      const route = parseHash();
      onChange(route);
    };
    window.addEventListener("hashchange", handle);
    handle();
    return () => window.removeEventListener("hashchange", handle);
  }
  function getNavItems() {
    return [
      { id: "home", label: "\uD648", emoji: "\u{1F3E0}", icon: "home", href: "#home" },
      { id: "guide", label: "\uAC00\uC774\uB4DC", emoji: "\u{1F5FA}\uFE0F", icon: "guide", href: "#guide" },
      { id: "foundation", label: "\uAE30\uCD08\uD559\uC2B5", emoji: "\u{1F9F1}", icon: "foundation", href: "#foundation" },
      { id: "teps", label: "TEPS \uD559\uC2B5", emoji: "\u{1F4D8}", icon: "teps", href: "#teps" },
      { id: "practice", label: "\uBB38\uC81C\uD6C8\uB828", emoji: "\u270F\uFE0F", icon: "practice", href: "#practice" },
      { id: "mock", label: "\uBAA8\uC758\uACE0\uC0AC", emoji: "\u{1F4DD}", icon: "mock", href: "#mock" },
      { id: "review", label: "\uC624\uB2F5\xB7\uBCF5\uC2B5", emoji: "\u{1F501}", icon: "review", href: "#review" },
      { id: "my-teps", label: "My TEPS", emoji: "\u{1F4CA}", icon: "chart", href: "#my-teps" },
      { id: "settings", label: "\uC124\uC815", emoji: "\u2699\uFE0F", icon: "settings", href: "#settings" }
    ];
  }

  // js/toast.js
  var ICONS = {
    success: "\u2713",
    info: "i",
    warning: "!",
    error: "\xD7"
  };
  var container = null;
  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions");
    document.body.appendChild(container);
    return container;
  }
  function showToast(message, type = "info", duration = 3200) {
    const root = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="\uB2EB\uAE30">\xD7</button>
  `;
    toast.querySelector(".toast-message").textContent = message;
    const remove = () => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 220);
    };
    toast.querySelector(".toast-close").addEventListener("click", remove);
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    if (duration > 0) {
      setTimeout(remove, duration);
    }
    return remove;
  }

  // js/ai/ai-config.js
  var AI_CONFIG = {
    defaultProvider: "claude",
    providers: {
      openai: {
        id: "openai",
        label: "OpenAI",
        defaultModel: "gpt-4o-mini",
        testPrompt: "Reply with exactly: OK"
      },
      claude: {
        id: "claude",
        label: "Claude",
        defaultModel: "claude-sonnet-4-6",
        testPrompt: "Reply with exactly: OK",
        apiVersion: "2023-06-01"
      },
      gemini: {
        id: "gemini",
        label: "Gemini",
        defaultModel: "gemini-2.0-flash",
        testPrompt: "Reply with exactly: OK"
      }
    },
    tutor: {
      temperature: 0.4,
      maxTokens: 900
    },
    cacheTtlMs: 1e3 * 60 * 60 * 24 * 7
  };
  var AI_TUTOR_SYSTEM = `\uB108\uB294 TEPS 327\uC810 \uC774\uC0C1\uC744 \uBAA9\uD45C\uB85C \uD558\uB294 \uC131\uC778 \uD559\uC2B5\uC790\uC758 \uAC1C\uC778 \uC601\uC5B4 \uD29C\uD130\uB2E4.

\uC815\uB2F5\uC744 \uB2E8\uC21C\uD788 \uBC18\uBCF5\uD558\uC9C0 \uB9D0\uACE0 \uC0AC\uC6A9\uC790\uAC00 \uC65C \uD2C0\uB838\uB294\uC9C0(\uB610\uB294 \uC5B4\uB5BB\uAC8C \uB354 \uC815\uD655\uD788 \uD480 \uC218 \uC788\uB294\uC9C0) \uC774\uD574\uD558\uB3C4\uB85D \uB3C4\uC640\uB77C.
\uC601\uC5B4 \uACF5\uBD80 \uACF5\uBC31\uC774 \uAE34 \uC131\uC778 \uD559\uC2B5\uC790\uB3C4 \uC774\uD574\uD560 \uC218 \uC788\uAC8C \uC124\uBA85\uD558\uB77C.

\uD544\uC694\uD558\uBA74 \uB2E4\uC74C\uC744 \uB2E8\uACC4\uC801\uC73C\uB85C \uC124\uBA85\uD55C\uB2E4:
1) \uBB38\uC7A5/\uC9C0\uBB38\uC758 \uD575\uC2EC \uAD6C\uC870
2) \uD575\uC2EC \uC5B4\uD718/\uC5F0\uC5B4
3) \uBB38\uBC95 \uD3EC\uC778\uD2B8
4) \uC120\uD0DD\uC9C0 \uCC28\uC774
5) TEPS\uC2DD \uBB38\uC81C\uD480\uC774 \uC0AC\uACE0\uACFC\uC815

\uB108\uBB34 \uC7A5\uD669\uD558\uC9C0 \uC54A\uAC8C, \uD55C\uAD6D\uC5B4\uB85C \uBA85\uD655\uD788 \uC124\uBA85\uD55C\uB2E4.
\uC2E4\uC81C TEPS \uACF5\uC2DD \uAE30\uCD9C\uC774\uB77C\uACE0 \uC8FC\uC7A5\uD558\uC9C0 \uB9C8\uB77C.
\uD559\uC2B5\uC6A9 \uC5F0\uC2B5 \uBB38\uD56D/\uC124\uBA85\uC784\uC744 \uC874\uC911\uD558\uB77C.`;
  var AI_QUICK_ACTIONS = [
    { id: "simplify", label: "\u{1F9E9} \uB354 \uC27D\uAC8C \uC124\uBA85", prompt: "\uBC29\uAE08 \uC124\uBA85\uC744 \uB354 \uC27D\uACE0 \uC9E7\uAC8C \uB2E4\uC2DC \uC124\uBA85\uD574 \uC8FC\uC138\uC694." },
    { id: "structure", label: "\u{1F9F1} \uBB38\uC7A5 \uAD6C\uC870 \uBD84\uC11D", prompt: "\uC774 \uBB38\uC81C\uC758 \uD575\uC2EC \uBB38\uC7A5 \uAD6C\uC870\uB97C \uBD84\uC11D\uD574 \uC8FC\uC138\uC694." },
    { id: "choices", label: "\u2696\uFE0F \uC120\uD0DD\uC9C0 \uBE44\uAD50", prompt: "\uC120\uD0DD\uC9C0\uB97C \uC11C\uB85C \uBE44\uAD50\uD574 \uC65C \uC815\uB2F5\uC774 \uB9DE\uACE0 \uB098\uBA38\uC9C0\uB294 \uC548 \uB418\uB294\uC9C0 \uC124\uBA85\uD574 \uC8FC\uC138\uC694." },
    { id: "vocab", label: "\u{1F4DD} \uD575\uC2EC \uB2E8\uC5B4 \uC124\uBA85", prompt: "\uC774 \uBB38\uC81C\uC758 \uD575\uC2EC \uC5B4\uD718/\uD45C\uD604\uC744 \uC608\uBB38\uACFC \uD568\uAED8 \uC124\uBA85\uD574 \uC8FC\uC138\uC694." },
    { id: "similar", label: "\u2795 \uD55C \uBB38\uC81C \uB354", prompt: "SIMILAR_QUESTION" },
    { id: "minilesson", label: "\u{1F4DA} \uC774 \uAC1C\uB150 \uB2E4\uC2DC \uBC30\uC6B0\uAE30", prompt: "MINI_LESSON" }
  ];

  // js/ai/providers/openai.js
  async function generateText({ apiKey, model, system, messages, temperature = 0.4, maxTokens = 900 }) {
    if (!apiKey) throw new Error("OpenAI API Key\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const body = {
      model: model || "gpt-4o-mini",
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...system ? [{ role: "system", content: system }] : [],
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ]
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `OpenAI \uC624\uB958 (${res.status})`;
      throw new Error(sanitizeError(msg));
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI \uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    return { text: String(text).trim(), raw: data, provider: "openai", model: body.model };
  }
  function sanitizeError(msg) {
    return String(msg).replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED]");
  }

  // js/ai/providers/anthropic.js
  async function generateText2({
    apiKey,
    model,
    system,
    messages,
    temperature = 0.4,
    maxTokens = 900,
    apiVersion = "2023-06-01"
  }) {
    if (!apiKey) throw new Error("Claude API Key\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const body = {
      model: model || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      temperature,
      system: system || void 0,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }))
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": apiVersion,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `Claude \uC624\uB958 (${res.status})`;
      throw new Error(sanitizeError2(msg));
    }
    const parts = Array.isArray(data.content) ? data.content : [];
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
    if (!text) throw new Error("Claude \uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    return { text, raw: data, provider: "claude", model: body.model };
  }
  function sanitizeError2(msg) {
    return String(msg).replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]").replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED]");
  }

  // js/ai/providers/gemini.js
  async function generateText3({ apiKey, model, system, messages, temperature = 0.4, maxTokens = 900 }) {
    if (!apiKey) throw new Error("Gemini API Key\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const modelId = model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const body = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini \uC624\uB958 (${res.status})`;
      throw new Error(sanitizeError3(msg));
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (!text) throw new Error("Gemini \uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    return { text, raw: data, provider: "gemini", model: modelId };
  }
  function sanitizeError3(msg) {
    return String(msg).replace(/AIza[0-9A-Za-z_-]+/g, "[REDACTED]");
  }

  // js/ai/ai-service.js
  function resolveAiSettings(settings) {
    const ai = settings?.ai || {};
    const provider = ai.provider || AI_CONFIG.defaultProvider;
    const cfg = AI_CONFIG.providers[provider] || AI_CONFIG.providers.claude;
    const keys = ai.keys || {};
    const apiKey = keys[provider] || ai.apiKey || "";
    const model = ai.model || cfg.defaultModel;
    return {
      enabled: !!ai.enabled,
      provider,
      apiKey,
      model,
      cfg
    };
  }
  function getAiStatus(settings) {
    const resolved = resolveAiSettings(settings);
    if (!resolved.enabled) return { label: "AI OFF", on: false, provider: null };
    return {
      label: `AI \xB7 ${resolved.cfg.label}`,
      on: true,
      provider: resolved.provider
    };
  }
  async function testAiConnection(settings) {
    const { enabled, provider, apiKey, model, cfg } = resolveAiSettings(settings);
    if (!enabled) throw new Error("AI \uAE30\uB2A5\uC774 OFF \uC0C1\uD0DC\uC785\uB2C8\uB2E4.");
    if (!apiKey) throw new Error("API Key\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    try {
      const result = await callProvider({
        provider,
        apiKey,
        model,
        system: "You are a connection test assistant.",
        messages: [{ role: "user", content: cfg.testPrompt }],
        temperature: 0,
        maxTokens: 32
      });
      return {
        ok: true,
        message: `${cfg.label} \uC5F0\uACB0\uC5D0 \uC131\uACF5\uD588\uC2B5\uB2C8\uB2E4.`,
        sample: result.text.slice(0, 80)
      };
    } catch (err) {
      if (isCorsError(err)) {
        throw new Error(
          `${cfg.label} \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800 CORS \uB610\uB294 \uB124\uD2B8\uC6CC\uD06C \uC81C\uD55C\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4. API Key\uC640 Provider \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.`
        );
      }
      throw new Error(
        `${cfg.label} \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. API Key\uC640 Provider \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694. (${err.message})`
      );
    }
  }
  function isCorsError(err) {
    const msg = String(err?.message || err || "");
    return err?.name === "TypeError" || /Failed to fetch|NetworkError|CORS|Load failed/i.test(msg);
  }
  async function callProvider(opts) {
    const map = {
      openai: generateText,
      claude: generateText2,
      gemini: generateText3
    };
    const fn = map[opts.provider];
    if (!fn) throw new Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 Provider\uC785\uB2C8\uB2E4.");
    return fn(opts);
  }
  function cacheKey({ provider, model, questionId, action }) {
    return `ai:${provider}:${model}:${questionId || "na"}:${action}`;
  }
  async function readCache(key) {
    try {
      const item = await getItem("aiCache", key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) return null;
      return item.response;
    } catch {
      return null;
    }
  }
  async function writeCache(key, response) {
    try {
      await putItem("aiCache", {
        id: key,
        response,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        expiresAt: Date.now() + AI_CONFIG.cacheTtlMs
      });
    } catch {
    }
  }
  function buildQuestionTutorContext({ question, attempt, knowledgeMap, targetScore = 327 }) {
    const skills = question?.skills || [];
    const relatedMastery = [];
    skills.forEach((sk) => {
      const section = question.section;
      const item = knowledgeMap?.sections?.[section]?.find((x) => x.id === sk || x.label === sk);
      if (item) relatedMastery.push({ skill: item.id, mastery: item.mastery });
    });
    return {
      targetScore,
      question: {
        id: question.id,
        section: question.section,
        type: question.type,
        difficulty: question.difficulty,
        targetScoreBand: question.targetScoreBand,
        skills,
        passage: question.passage || question.transcript || "",
        question: question.question,
        choices: question.choices,
        answer: question.answer,
        explanation: question.explanation,
        vocabulary: question.vocabulary,
        collocations: question.collocations,
        synonyms: question.synonyms,
        confusableWords: question.confusableWords,
        source: question.source
      },
      learner: {
        selectedAnswer: attempt?.selectedAnswer ?? null,
        correct: attempt?.correct ?? null,
        errorReason: attempt?.errorReason ?? null,
        relatedMastery
      }
    };
  }
  async function askAiTutor({
    settings,
    context,
    userMessage,
    history = [],
    action = "tutor",
    useCache = false,
    questionId = null
  }) {
    const resolved = resolveAiSettings(settings);
    if (!resolved.enabled) throw new Error("AI \uAE30\uB2A5\uC774 OFF\uC785\uB2C8\uB2E4.");
    if (!resolved.apiKey) throw new Error("API Key\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
    const key = cacheKey({
      provider: resolved.provider,
      model: resolved.model,
      questionId,
      action
    });
    if (useCache && !history.length && action !== "chat") {
      const cached = await readCache(key);
      if (cached) return { text: cached, cached: true, provider: resolved.provider };
    }
    const contextJson = JSON.stringify(context, null, 0).slice(0, 12e3);
    const messages = [
      {
        role: "user",
        content: `\uD559\uC2B5 \uCEE8\uD14D\uC2A4\uD2B8(JSON):
${contextJson}

\uC694\uCCAD:
${userMessage}`
      },
      ...history.map((h) => ({ role: h.role, content: h.content }))
    ];
    try {
      const result = await callProvider({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        model: resolved.model,
        system: AI_TUTOR_SYSTEM,
        messages,
        temperature: AI_CONFIG.tutor.temperature,
        maxTokens: AI_CONFIG.tutor.maxTokens
      });
      if (useCache && !history.length) await writeCache(key, result.text);
      return { text: result.text, cached: false, provider: resolved.provider, model: result.model };
    } catch (err) {
      if (isCorsError(err)) {
        throw new Error(
          "AI \uC694\uCCAD\uC774 \uBE0C\uB77C\uC6B0\uC800 \uB124\uD2B8\uC6CC\uD06C/CORS \uC81C\uD55C\uC73C\uB85C \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 \uD559\uC2B5 \uAE30\uB2A5\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        );
      }
      throw new Error(String(err.message || err).replace(/(sk-|AIza|sk-ant-)[^\s]+/gi, "[REDACTED]"));
    }
  }
  async function generateSimilarQuestion({ settings, context }) {
    const prompt = `\uD604\uC7AC \uBB38\uC81C\uC640 \uAC19\uC740 section/skill\uC744 \uACA8\uB0E5\uD55C \uD559\uC2B5\uC6A9 \uC720\uC0AC\uBB38\uC81C 1\uAC1C\uB97C JSON\uB9CC \uCD9C\uB825\uD558\uB77C.
\uC2A4\uD0A4\uB9C8:
{
  "id": "AI-TMP-xxxx",
  "section": "...",
  "part": 1,
  "type": "...",
  "difficulty": 2,
  "targetScoreBand": "327-target",
  "tags": [],
  "question": "...",
  "passage": "",
  "choices": ["","","",""],
  "answer": 0,
  "explanation": {
    "summary": "",
    "evidence": "",
    "choiceAnalysis": ["","","",""]
  },
  "vocabulary": [],
  "skills": []
}
\uC2E4\uC81C TEPS \uAE30\uCD9C\uC774\uB77C\uACE0 \uC4F0\uC9C0 \uB9D0\uACE0, \uD559\uC2B5\uC6A9 \uC5F0\uC2B5\uBB38\uC81C\uC5EC\uC57C \uD55C\uB2E4.
JSON \uC678 \uD14D\uC2A4\uD2B8\uB97C \uCD9C\uB825\uD558\uC9C0 \uB9C8\uB77C.`;
    const result = await askAiTutor({
      settings,
      context,
      userMessage: prompt,
      action: "similar",
      useCache: false,
      questionId: context?.question?.id
    });
    const parsed = extractJsonObject(result.text);
    if (!parsed) {
      throw new Error("\uBB38\uC81C\uB97C \uC0DD\uC131\uD588\uC9C0\uB9CC \uD615\uC2DD \uAC80\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC0DD\uC131\uD574 \uC8FC\uC138\uC694.");
    }
    parsed.id = parsed.id || `AI-TMP-${uid("q").slice(-6)}`;
    parsed.source = "ai-practice";
    const errors = validateQuestion(parsed);
    if (errors.length) {
      throw new Error("\uBB38\uC81C\uB97C \uC0DD\uC131\uD588\uC9C0\uB9CC \uD615\uC2DD \uAC80\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC0DD\uC131\uD574 \uC8FC\uC138\uC694.");
    }
    return parsed;
  }
  async function generateMiniLesson({ settings, context }) {
    const prompt = `\uD604\uC7AC \uBB38\uD56D\uC758 skill\uC744 \uAE30\uC900\uC73C\uB85C \uC9E7\uC740 \uBBF8\uB2C8\uC218\uC5C5\uC744 \uB9CC\uB4E4\uC5B4\uB77C.
\uAD6C\uC131:
1. \uD575\uC2EC \uAC1C\uB150
2. \uC26C\uC6B4 \uC608\uBB38 2\uAC1C
3. TEPS\uC5D0\uC11C \uC5B4\uB5BB\uAC8C \uBB3B\uB294\uC9C0
4. \uD655\uC778\uBB38\uC81C 2~3\uAC1C (\uC815\uB2F5 \uD3EC\uD568)
\uD55C\uAD6D\uC5B4\uB85C, \uB108\uBB34 \uAE38\uC9C0 \uC54A\uAC8C.`;
    return askAiTutor({
      settings,
      context,
      userMessage: prompt,
      action: "minilesson",
      useCache: true,
      questionId: context?.question?.id
    });
  }
  async function generateAiStudyComment({ settings, summary }) {
    const prompt = `\uB2E4\uC74C \uD559\uC2B5 \uC694\uC57D(JSON)\uC744 \uBCF4\uACE0 TEPS ${summary.targetScore || 327} \uB2EC\uC131\uC744 \uC704\uD55C \uC9E7\uC740 \uCF54\uCE6D \uCF54\uBA58\uD2B8\uB97C 3~5\uBB38\uC7A5\uC73C\uB85C \uC791\uC131\uD558\uB77C. \uACFC\uC7A5\uB41C \uC810\uC218 \uC608\uCE21\uC740 \uD558\uC9C0 \uB9C8\uB77C.
${JSON.stringify(
      summary
    )}`;
    return askAiTutor({
      settings,
      context: { summary },
      userMessage: prompt,
      action: "home-comment",
      useCache: false
    });
  }
  function extractJsonObject(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  // js/ui/modal.js
  function showConfirmModal({
    title = "\uD655\uC778",
    message = "",
    confirmLabel = "\uD655\uC778",
    cancelLabel = "\uCDE8\uC18C",
    danger = false
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${escape(title)}</h2>
        <p class="modal-message">${escape(message)}</p>
        <div class="btn-row wrap modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${escape(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${escape(confirmLabel)}</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      const focusBtn = overlay.querySelector('[data-act="ok"]');
      focusBtn?.focus();
      const close = (val) => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
      };
      document.addEventListener("keydown", onKey);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
      overlay.querySelector('[data-act="ok"]').addEventListener("click", () => close(true));
    });
  }
  function escape(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function setLoading(btn, loading, loadingText = "\uCC98\uB9AC \uC911\u2026") {
    if (!btn) return;
    if (loading) {
      btn.dataset.prevLabel = btn.textContent;
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.textContent = loadingText;
    } else {
      btn.disabled = false;
      btn.classList.remove("is-loading");
      if (btn.dataset.prevLabel) btn.textContent = btn.dataset.prevLabel;
    }
  }

  // js/dashboard.js
  function renderProgressBar(estimated, target) {
    if (estimated == null) {
      return `
      <div class="progress-track empty" role="img" aria-label="\uC608\uC0C1\uC810\uC218 \uC5C6\uC74C">
        <div class="progress-markers">
          <span>0</span>
          <span class="marker-target">${escapeHtml(target)}</span>
        </div>
      </div>
    `;
    }
    const pct = Math.min(100, Math.round(estimated / target * 100));
    return `
    <div class="progress-track" role="progressbar" aria-valuenow="${estimated}" aria-valuemin="0" aria-valuemax="${target}" aria-label="\uBAA9\uD45C \uC9C4\uD589\uB960">
      <div class="progress-fill" style="width:${pct}%"></div>
      <div class="progress-markers">
        <span>0</span>
        <span class="current-mark" style="left:${pct}%">${estimated}</span>
        <span class="marker-target">${escapeHtml(target)}</span>
      </div>
    </div>
  `;
  }
  function lastContinueItem(records) {
    return records.find(
      (r) => r.recordType === "session" || r.type === "foundation" || r.mode === "practice" || r.mode === "target327"
    );
  }
  function renderDashboard() {
    const state2 = getState();
    const summary = getScoreSummary();
    const plan = getTodayPlan();
    const records = state2.learningRecords.slice(0, 8);
    const hasScore = summary.estimated != null;
    const dueReview = (state2.reviewQueue || []).filter(
      (r) => r.status !== "mastered" && (!r.nextReview || new Date(r.nextReview) <= /* @__PURE__ */ new Date())
    ).length;
    const cont = lastContinueItem(records);
    const showWelcome = !state2.settings?.welcomeSeen;
    const ai = getAiStatus(state2.settings);
    const confLabel = summary.confidence === "low" ? "\uB0AE\uC74C" : summary.confidence === "medium" ? "\uBCF4\uD1B5" : summary.confidence === "high" ? "\uB192\uC74C" : null;
    if (showWelcome) {
      return `
      <section class="page home-page home-welcome">
        <section class="home-hero" aria-labelledby="welcome-brand">
          <div class="home-hero-glow" aria-hidden="true"></div>
          <p class="home-kicker">\u{1F3AF} TEPS 327 Target Learning</p>
          <p class="home-brand-mark" aria-hidden="true">327</p>
          <h1 id="welcome-brand" class="home-brand">TEPS Crew</h1>
          <p class="home-brand-ko">\uD15D\uC2A4\uD06C\uB8E8</p>
          <p class="home-lede">
            \uC601\uC5B4 \uACF5\uBC31\uC774 \uAE38\uC5B4\uB3C4 \uAD1C\uCC2E\uC2B5\uB2C8\uB2E4.<br />
            \uAE30\uCD08\uBD80\uD130 \uC313\uC544 <strong>TEPS ${escapeHtml(summary.target)}\uC810</strong>\uAE4C\uC9C0 \uAC19\uC774 \uAC11\uB2C8\uB2E4.
          </p>
          <div class="home-cta-row">
            <button type="button" class="btn btn-primary btn-lg" data-nav="diagnosis">\u{1F680} \uBE60\uB978 \uC9C4\uB2E8 \uC2DC\uC791</button>
            <button type="button" class="btn btn-secondary btn-lg" data-nav="guide">\u{1F5FA}\uFE0F TEPS \uAC00\uC774\uB4DC</button>
            <button type="button" class="btn btn-secondary btn-lg" id="welcome-dismiss">\u{1F440} \uBA3C\uC800 \uB458\uB7EC\uBCF4\uAE30</button>
          </div>
          <p class="home-footnote">\u{1F510} \uB85C\uADF8\uC778 \uC5C6\uC74C \xB7 \u2728 AI\uB294 \uC120\uD0DD \xB7 \u2705 \uC9C0\uAE08 \uBC14\uB85C \uD559\uC2B5 \uAC00\uB2A5</p>
        </section>
      </section>
    `;
    }
    return `
    <section class="page home-page home-ready">
      <section class="home-status" aria-labelledby="goal-heading">
        <div class="home-status-top">
          <div>
            <p class="home-kicker">\u2600\uFE0F \uC624\uB298\uC758 TEPS Crew</p>
            <h1 class="home-title-inline">
              <span class="home-title-brand">TEPS Crew</span>
              <span class="home-title-sep" aria-hidden="true">\xB7</span>
              <span id="goal-heading">\u{1F3AF} ${escapeHtml(summary.target)} \uBAA9\uD45C</span>
            </h1>
            <p class="muted home-sub">\uD559\uC2B5\uC6A9 \uCD94\uC815\uC73C\uB85C \uC704\uCE58\uB9CC \uD655\uC778\uD569\uB2C8\uB2E4 \xB7 ${escapeHtml(ai.label)}</p>
          </div>
          <div class="stage-badge" title="${escapeHtml(summary.stage.description)}">
            <span class="stage-label">\u{1F4CD} ${escapeHtml(summary.stage.label)}</span>
            <span class="stage-desc">${escapeHtml(summary.stage.description)}</span>
          </div>
        </div>

        <div class="home-scoreboard">
          <div class="home-score-main">
            <span class="label">\u{1F4C8} \uD559\uC2B5\uC6A9 \uC608\uC0C1\uC810\uC218</span>
            ${hasScore ? `<strong class="score-value display-num">${escapeHtml(summary.estimated)}</strong>
                   ${confLabel ? `<p class="muted small">\uC2E0\uB8B0\uB3C4 ${escapeHtml(confLabel)}</p>` : ""}` : `<strong class="score-value empty-score display-num">\u2014</strong>
                   <p class="empty-hint">\uC544\uC9C1 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</p>`}
          </div>
          <div class="home-score-side">
            <div>
              <span class="label">\u{1F3AF} Gap</span>
              <strong class="score-value">${hasScore ? `${escapeHtml(summary.gap)}` : "\u2014"}</strong>
            </div>
            <div>
              <span class="label">\u{1F501} \uC624\uB298 \uBCF5\uC2B5</span>
              <strong class="score-value">${dueReview}</strong>
            </div>
          </div>
        </div>

        ${renderProgressBar(summary.estimated, summary.target)}

        ${!hasScore ? `<div class="home-inline-cta">
                <p>\uCCAB \uC9C4\uB2E8\uC73C\uB85C \uC2DC\uC791\uC810\uC744 \uC815\uD558\uBA74 Today \uCD94\uCC9C\uC774 \uC5F4\uB9BD\uB2C8\uB2E4. TEPS \uAD6C\uC870\uAC00 \uAD81\uAE08\uD558\uBA74 \uAC00\uC774\uB4DC\uB97C \uBA3C\uC800 \uBCF4\uC138\uC694.</p>
                <div class="home-cta-row">
                  <button type="button" class="btn btn-primary" data-nav="diagnosis">\u{1F680} \uBE60\uB978 \uC9C4\uB2E8</button>
                  <button type="button" class="btn btn-secondary" data-nav="guide">\u{1F5FA}\uFE0F TEPS \uAC00\uC774\uB4DC</button>
                  <button type="button" class="btn btn-secondary" data-nav="practice">\u270F\uFE0F \uBB38\uC81C\uD6C8\uB828</button>
                </div>
              </div>` : ""}
      </section>

      ${cont ? `<section class="home-continue">
              <div>
                <p class="home-kicker">\u25B6\uFE0F \uC774\uC5B4\uC11C \uD559\uC2B5\uD558\uAE30</p>
                <h2>${escapeHtml(cont.title || cont.mode || cont.type)}</h2>
                <p class="muted">${escapeHtml(formatRelativeTime(cont.createdAt))}${cont.detail ? ` \xB7 ${escapeHtml(cont.detail)}` : ""}</p>
              </div>
              <button type="button" class="btn btn-primary" data-nav="${cont.type === "foundation" || cont.mode === "lesson" ? "foundation" : "practice"}">\uC774\uC5B4\uD558\uAE30</button>
            </section>` : ""}

      <section class="home-today" aria-labelledby="today-heading">
        <div class="home-today-head">
          <div>
            <h2 id="today-heading">\u{1F4C5} \uC624\uB298 \uBB34\uC5C7\uC744 \uD560\uAE4C</h2>
            <p class="muted">\uC57D ${escapeHtml(plan.totalMinutes)}\uBD84 \xB7 \uADDC\uCE59 \uAE30\uBC18 \uCD94\uCC9C</p>
          </div>
        </div>
        <ol class="home-plan-list">
          ${plan.items.map(
      (item, idx) => `
            <li>
              <button type="button" class="home-plan-item" data-nav="${escapeHtml(item.route)}"
                ${item.params ? `data-params="${encodeURIComponent(JSON.stringify(item.params))}"` : ""}>
                <span class="home-plan-index" aria-hidden="true">${idx + 1}</span>
                <span class="home-plan-body">
                  <span class="plan-title">${escapeHtml(item.title)}</span>
                  <span class="plan-detail">${escapeHtml(item.detail)}</span>
                  ${item.reason ? `<span class="plan-reason">${escapeHtml(item.reason)}</span>` : ""}
                </span>
                <span class="plan-time">\uC57D ${escapeHtml(item.minutes)}\uBD84</span>
              </button>
            </li>`
    ).join("")}
        </ol>
        <button type="button" class="btn btn-primary btn-lg btn-block home-today-start"
          data-nav="${escapeHtml(plan.items[0]?.route || "foundation")}"
          ${plan.items[0]?.params ? `data-params="${encodeURIComponent(JSON.stringify(plan.items[0].params))}"` : ""}>\u{1F680} \uC624\uB298 \uD559\uC2B5 \uC2DC\uC791</button>
        ${ai.on ? `<button type="button" class="btn btn-ghost btn-block" id="ai-home-comment">\u2728 AI \uD559\uC2B5 \uBD84\uC11D \uBCF4\uAE30</button>
               <p class="muted small ai-home-note" id="ai-home-result"></p>` : ""}
      </section>

      <section class="home-launch">
        <h2 class="sr-only">\uBE60\uB978 \uC2DC\uC791</h2>
        <div class="home-launch-grid">
          <button type="button" class="home-launch-item" data-nav="vocabulary" data-params="${encodeURIComponent(
      JSON.stringify({ tab: "review" })
    )}">
            <span class="home-launch-label">\u{1F4D7} \uB2E8\uC5B4</span>
            <span class="home-launch-desc">5\uBD84 \uBCF5\uC2B5</span>
          </button>
          <button type="button" class="home-launch-item" data-nav="practice-quiz" data-params="${encodeURIComponent(
      JSON.stringify({ count: "10", mode: "practice", section: "vocabulary" })
    )}">
            <span class="home-launch-label">\u270F\uFE0F \uC5F0\uC2B5</span>
            <span class="home-launch-desc">\uC5B4\uD718\xB7\uBB38\uBC95</span>
          </button>
          <button type="button" class="home-launch-item" data-nav="review">
            <span class="home-launch-label">\u{1F501} \uC624\uB2F5</span>
            <span class="home-launch-desc">${dueReview}\uAC74</span>
          </button>
          <button type="button" class="home-launch-item home-launch-accent" data-nav="target-preview">
            <span class="home-launch-label">\u{1F3AF} 327</span>
            <span class="home-launch-desc">Target</span>
          </button>
        </div>
      </section>

      <section class="home-recent">
        <h2>\u{1F558} \uCD5C\uADFC \uD559\uC2B5</h2>
        ${records.length === 0 ? `<p class="muted">\uC544\uC9C1 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC624\uB298 \uD559\uC2B5\uC744 \uC2DC\uC791\uD574 \uBCF4\uC138\uC694.</p>` : `<ul class="record-list">
                ${records.slice(0, 5).map(
      (r) => `
                  <li>
                    <div>
                      <strong>${escapeHtml(r.title || r.type || r.mode)}</strong>
                      <p class="muted">${escapeHtml(r.detail || r.recordType || "")}</p>
                    </div>
                    <time datetime="${escapeHtml(r.createdAt)}">${escapeHtml(
        formatRelativeTime(r.createdAt)
      )}</time>
                  </li>`
    ).join("")}
              </ul>`}
      </section>
    </section>
  `;
  }
  function bindDashboard(root) {
    root.querySelector("#welcome-dismiss")?.addEventListener("click", () => {
      updateSettings({ welcomeSeen: true });
      navigate("home");
    });
    root.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        const page = el.getAttribute("data-nav");
        let params = {};
        if (el.dataset.params) {
          try {
            params = JSON.parse(decodeURIComponent(el.dataset.params));
          } catch {
            params = {};
          }
        }
        if (page === "diagnosis") updateSettings({ welcomeSeen: true });
        navigate(page, params);
      });
    });
    root.querySelector("#ai-home-comment")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const out = root.querySelector("#ai-home-result");
      const state2 = getState();
      const summary = {
        targetScore: state2.settings.targetScore,
        estimatedScore: state2.profile.estimatedScore,
        weakSkills: (state2.knowledgeMap?.sections ? Object.entries(state2.knowledgeMap.sections).flatMap(
          ([section, items]) => items.filter((i) => (i.mastery || 0) < 40).map((i) => ({ section, skill: i.id, mastery: i.mastery }))
        ) : []).slice(0, 8),
        reviewDue: state2.reviewQueue.filter((r) => r.status !== "mastered").length,
        recentAccuracy: state2.learningRecords.filter((r) => r.recordType === "session").slice(0, 3).map((r) => ({ mode: r.mode, accuracy: r.accuracy }))
      };
      setLoading(btn, true, "\uBD84\uC11D \uC911\u2026");
      try {
        const res = await generateAiStudyComment({ settings: state2.settings, summary });
        if (out) out.textContent = res.text;
      } catch (err) {
        showToast(err.message || "AI \uBD84\uC11D \uC2E4\uD328", "error");
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // js/settings.js
  function renderSettings() {
    const state2 = getState();
    const { settings } = state2;
    const ai = settings.ai || {};
    const stats = getBankStats();
    const packs = state2.contentPacks || [];
    const provider = ai.provider || "claude";
    const currentKey = ai.keys?.[provider] || ai.apiKey || "";
    return `
    <section class="page settings-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Preferences</p>
          <h1>\u2699\uFE0F \uC124\uC815</h1>
        </div>
        <span class="badge badge-soft">${escapeHtml(getAiStatus(settings).label)}</span>
      </header>

      <form id="settings-form" class="stack-lg">
        <section class="card">
          <h2>\u{1F3AF} \uD559\uC2B5 \uC124\uC815</h2>
          <p class="muted small">\uC571\uC758 \uC8FC\uC694 \uCF58\uD150\uCE20\uB294 TEPS 327 \uBAA9\uD45C\uC5D0 \uCD5C\uC801\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.</p>
          <div class="form-grid">
            <label class="field">
              <span>\uBAA9\uD45C\uC810\uC218</span>
              <input type="number" name="targetScore" min="1" max="990" value="${escapeHtml(
      settings.targetScore
    )}" />
              <span class="field-hint">\uAE30\uBCF8\uAC12 327</span>
            </label>
            <label class="field">
              <span>\uD558\uB8E8 \uD559\uC2B5\uC2DC\uAC04 (\uBD84)</span>
              <input type="number" name="dailyStudyMinutes" min="5" max="300" value="${escapeHtml(
      settings.dailyStudyMinutes
    )}" />
            </label>
            <fieldset class="field">
              <legend>\uD574\uC124 \uD45C\uC2DC \uBC29\uC2DD</legend>
              <label class="radio-row"><input type="radio" name="explanationMode" value="immediate" ${settings.explanationMode === "immediate" ? "checked" : ""} /> \uC989\uC2DC</label>
              <label class="radio-row"><input type="radio" name="explanationMode" value="manual" ${settings.explanationMode === "manual" ? "checked" : ""} /> \uC9C1\uC811 \uC120\uD0DD</label>
              <label class="radio-row"><input type="radio" name="explanationMode" value="after-set" ${settings.explanationMode === "after-set" ? "checked" : ""} /> \uC138\uD2B8 \uC885\uB8CC \uD6C4</label>
            </fieldset>
          </div>
          <button type="submit" class="btn btn-primary">\uD559\uC2B5 \uC124\uC815 \uC800\uC7A5</button>
        </section>

        <section class="card">
          <h2>\u{1F4E6} \uBB38\uC81C\uC740\uD589</h2>
          <div class="stats-grid">
            <div><strong>\uCD1D ${stats.total}\uBB38\uD56D</strong></div>
            <div>327 \uD575\uC2EC ${stats.target327}\uBB38\uD56D</div>
          </div>
          <ul class="bullet-list">
            ${["listening", "vocabulary", "grammar", "reading"].map((s) => {
      const n = stats.bySection[s] || 0;
      const note = n < 5 && (s === "reading" || s === "listening") ? " \xB7 \uCD94\uAC00 Pack\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" : "";
      return `<li>${escapeHtml(s)}: ${n}${note}</li>`;
    }).join("")}
          </ul>
          <p class="muted small">\uB09C\uB3C4 \xB7 Level2 ${stats.byDifficulty[2] || 0} / Level3 ${stats.byDifficulty[3] || 0} / Level4 ${stats.byDifficulty[4] || 0}
          (${difficultyLabel(2)}/${difficultyLabel(3)}/${difficultyLabel(4)})</p>
          ${packs.map(
      (p) => `
            <article class="chip-card" style="margin-top:12px">
              <strong>${escapeHtml(p.title || p.id)}</strong>
              <p>${escapeHtml(p.questionCount || 0)}\uBB38\uD56D \xB7 \uC0C1\uD0DC: \uC0AC\uC6A9 \uC911</p>
            </article>`
    ).join("") || '<p class="muted">\uC124\uCE58\uB41C Pack\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
        </section>

        <section class="card">
          <h2>\u2728 AI \uC124\uC815</h2>
          <p class="callout">AI \uAE30\uB2A5\uC740 \uC120\uD0DD\uC0AC\uD56D\uC785\uB2C8\uB2E4. AI\uB97C \uC5F0\uACB0\uD558\uC9C0 \uC54A\uC544\uB3C4 \uD15D\uC2A4\uD06C\uB8E8\uC758 \uAE30\uBCF8 \uD559\uC2B5 \uAE30\uB2A5\uC744 \uBAA8\uB450 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
          <p class="callout">API Key\uB294 \uC774 \uBE0C\uB77C\uC6B0\uC800\uC758 \uB85C\uCEEC \uC800\uC7A5\uC18C(\uB610\uB294 \uC774\uBC88 \uC138\uC158)\uC5D0 \uC800\uC7A5\uB429\uB2C8\uB2E4. \uACF5\uC6A9 PC\uC5D0\uC11C\uB294 API Key\uB97C \uC800\uC7A5\uD558\uC9C0 \uB9C8\uC138\uC694.</p>
          <div class="form-grid">
            <label class="switch-row">
              <span>AI \uAE30\uB2A5</span>
              <input type="checkbox" name="aiEnabled" ${ai.enabled ? "checked" : ""} />
              <span class="switch-text">${ai.enabled ? "ON" : "OFF"}</span>
            </label>
            <label class="field">
              <span>Provider</span>
              <select name="aiProvider" id="ai-provider">
                <option value="openai" ${provider === "openai" ? "selected" : ""}>OpenAI</option>
                <option value="claude" ${provider === "claude" ? "selected" : ""}>Claude</option>
                <option value="gemini" ${provider === "gemini" ? "selected" : ""}>Gemini</option>
              </select>
            </label>
            <label class="field">
              <span>Model (\uBE44\uC6CC\uB450\uBA74 \uAE30\uBCF8\uAC12)</span>
              <input type="text" name="aiModel" value="${escapeHtml(
      ai.model || ""
    )}" placeholder="${escapeHtml(
      AI_CONFIG.providers[provider]?.defaultModel || ""
    )}" />
            </label>
            <label class="field">
              <span>API Key</span>
              <div class="btn-row">
                <input type="password" name="aiApiKey" id="ai-api-key" value="${escapeHtml(
      currentKey
    )}" autocomplete="off" style="flex:1" />
                <button type="button" class="btn btn-ghost" id="toggle-key">\uD45C\uC2DC</button>
              </div>
            </label>
            <fieldset class="field">
              <legend>Key \uC800\uC7A5 \uBC29\uC2DD</legend>
              <label class="radio-row"><input type="radio" name="keyStorage" value="local" ${ai.keyStorage !== "session" ? "checked" : ""} /> \uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC800\uC7A5</label>
              <label class="radio-row"><input type="radio" name="keyStorage" value="session" ${ai.keyStorage === "session" ? "checked" : ""} /> \uC774\uBC88 \uC138\uC158\uC5D0\uC11C\uB9CC \uC0AC\uC6A9</label>
            </fieldset>
          </div>
          <div class="btn-row wrap">
            <button type="button" class="btn btn-secondary" id="ai-save-btn">AI \uC124\uC815 \uC800\uC7A5</button>
            <button type="button" class="btn btn-primary" id="ai-test-btn">\uC5F0\uACB0 \uD14C\uC2A4\uD2B8</button>
            <button type="button" class="btn btn-danger" id="ai-clear-btn">API Key \uC0AD\uC81C</button>
          </div>
          <p class="muted small" id="ai-test-result"></p>
        </section>
      </form>

      <section class="card">
        <h2>\u{1F4BE} \uB370\uC774\uD130 \uAD00\uB9AC</h2>
        <p class="muted small">\uD559\uC2B5\uAE30\uB85D\uACFC \uC124\uC815\uC744 \uBC31\uC5C5\uD569\uB2C8\uB2E4. \uBCF4\uC548\uC744 \uC704\uD574 AI API Key\uB294 \uBC31\uC5C5\uC5D0 \uD3EC\uD568\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" id="backup-export">\uD559\uC2B5 \uB370\uC774\uD130 \uBC31\uC5C5</button>
          <label class="btn btn-secondary file-btn">
            \uBC31\uC5C5 \uBD88\uB7EC\uC624\uAE30
            <input type="file" id="backup-import" accept="application/json,.json" hidden />
          </label>
          <label class="btn btn-secondary file-btn">
            \uBB38\uC81C\uC740\uD589 \uAC00\uC838\uC624\uAE30
            <input type="file" id="bank-import" accept="application/json,.json" hidden />
          </label>
          <button type="button" class="btn btn-danger" id="data-reset">\uC804\uCCB4 \uB370\uC774\uD130 \uCD08\uAE30\uD654</button>
        </div>
        <div id="import-result" class="import-result" hidden></div>
      </section>

      <section class="card">
        <h2>\u2753 \uB3C4\uC6C0\uB9D0</h2>
        <ul class="bullet-list">
          <li>\uC790\uC138\uD55C TEPS \uC774\uD574\xB7\uC900\uBE44\uBC95\xB7\uC571 \uC21C\uC11C\uB294 <button type="button" class="linkish" data-nav="guide">\uAC00\uC774\uB4DC</button> \uD0ED\uC744 \uBCF4\uC138\uC694.</li>
          <li>\uD648\uC758 \uC624\uB298 \uD559\uC2B5 \u2192 \uBB38\uC81C\uD480\uC774 \u2192 \uC624\uB2F5\uBCF5\uC2B5 \uC21C\uC73C\uB85C \uB8E8\uD2F4\uC744 \uB9CC\uB4DC\uC138\uC694.</li>
          <li>Mini TEPS\uB85C \uC704\uCE58\uB97C, 327 Target\uC73C\uB85C \uC57D\uC810\uC744 \uBCF4\uC644\uD558\uC138\uC694.</li>
          <li>AI\xB7\uBC31\uC5C5\uC740 \uC704 \uC124\uC815\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4.</li>
        </ul>
      </section>
    </section>
  `;
  }
  function bindSettings(root) {
    const form = root.querySelector("#settings-form");
    const switchText = root.querySelector(".switch-text");
    const aiEnabled = root.querySelector('[name="aiEnabled"]');
    const providerSelect = root.querySelector("#ai-provider");
    const keyInput = root.querySelector("#ai-api-key");
    aiEnabled?.addEventListener("change", () => {
      if (switchText) switchText.textContent = aiEnabled.checked ? "ON" : "OFF";
    });
    providerSelect?.addEventListener("change", () => {
      const settings = getState().settings;
      const p = providerSelect.value;
      const nextKey = settings.ai?.keys?.[p] || "";
      if (keyInput) keyInput.value = nextKey;
      showToast(`${p}\uC6A9 API Key\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.`, "info");
    });
    root.querySelector("#toggle-key")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (!keyInput) return;
      const show = keyInput.type === "password";
      keyInput.type = show ? "text" : "password";
      btn.textContent = show ? "\uC228\uAE30\uAE30" : "\uD45C\uC2DC";
    });
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      updateSettings({
        targetScore: Number(fd.get("targetScore")) || 327,
        dailyStudyMinutes: Number(fd.get("dailyStudyMinutes")) || 30,
        explanationMode: String(fd.get("explanationMode") || "manual")
      });
      showToast("\uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", "success");
    });
    const collectAi = () => {
      const fd = new FormData(form);
      const provider = String(fd.get("aiProvider") || "claude");
      const apiKey = String(fd.get("aiApiKey") || "");
      const current = getState().settings;
      const keys = { ...current.ai?.keys || {} };
      keys[provider] = apiKey;
      return {
        enabled: fd.get("aiEnabled") === "on",
        provider,
        model: String(fd.get("aiModel") || ""),
        apiKey,
        keyStorage: String(fd.get("keyStorage") || "local"),
        keys
      };
    };
    root.querySelector("#ai-save-btn")?.addEventListener("click", () => {
      updateSettings({ ai: collectAi() });
      showToast("AI \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", "success");
    });
    root.querySelector("#ai-test-btn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const resultEl = root.querySelector("#ai-test-result");
      updateSettings({ ai: collectAi() });
      setLoading(btn, true, "\uD14C\uC2A4\uD2B8 \uC911\u2026");
      try {
        const res = await testAiConnection(getState().settings);
        if (resultEl) resultEl.textContent = res.message;
        showToast(res.message, "success");
      } catch (err) {
        if (resultEl) resultEl.textContent = err.message;
        showToast(err.message || "\uC5F0\uACB0 \uC2E4\uD328", "error");
      } finally {
        setLoading(btn, false);
      }
    });
    root.querySelector("#ai-clear-btn")?.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "API Key \uC0AD\uC81C",
        message: "\uC800\uC7A5\uB41C AI API Key\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694? \uD559\uC2B5 \uB370\uC774\uD130\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4.",
        confirmLabel: "\uC0AD\uC81C",
        danger: true
      });
      if (!ok) return;
      const next = clearAiKeys();
      updateSettings(next);
      if (keyInput) keyInput.value = "";
      showToast("API Key\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.", "success");
    });
    root.querySelector("#backup-export")?.addEventListener("click", async () => {
      try {
        const payload = await createBackupPayload();
        const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        downloadJson(`tepscrew-backup-${stamp}.json`, payload);
        showToast("\uBC31\uC5C5 \uD30C\uC77C\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.", "success");
      } catch (err) {
        showToast(err.message || "\uBC31\uC5C5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      }
    });
    root.querySelector("#backup-import")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const payload = JSON.parse(text);
        await restoreBackupPayload(payload);
        showToast("\uBC31\uC5C5 \uD30C\uC77C\uC744 \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.", "success");
        location.hash = "#settings";
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } catch (err) {
        showToast(err.message || "\uD30C\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "error");
      } finally {
        e.target.value = "";
      }
    });
    root.querySelector("#bank-import")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      const resultBox = root.querySelector("#import-result");
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const result = validateQuestionBank(text);
        resultBox.hidden = false;
        resultBox.innerHTML = `
        <h3>${escapeHtml(result.packName)}</h3>
        <p>${result.total}\uBB38\uD56D \uBC1C\uACAC \xB7 \uC815\uC0C1 ${result.valid} \xB7 \uC624\uB958 ${result.invalid}</p>
        ${result.errors.length ? `<ul class="error-list">${result.errors.slice(0, 12).map(
          (err) => `<li><code>${escapeHtml(err.id)}</code> \u2014 ${escapeHtml(err.message)}</li>`
        ).join("")}</ul>` : '<p class="success-text">\uBAA8\uB4E0 \uBB38\uD56D\uC774 \uC720\uD6A8\uD569\uB2C8\uB2E4.</p>'}
        <div class="btn-row">
          ${result.valid ? `<button type="button" class="btn btn-primary" id="import-valid-only">\uC815\uC0C1 \uBB38\uD56D\uB9CC \uCD94\uAC00 (${result.valid})</button>` : ""}
        </div>
      `;
        resultBox.querySelector("#import-valid-only")?.addEventListener("click", async () => {
          const res = await importValidQuestions(result.validQuestions, {
            source: "imported"
          });
          showToast(
            `\uBB38\uC81C ${res.added}\uAC1C\uAC00 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.${res.conflicts ? ` (\uCDA9\uB3CC ${res.conflicts}\uAC74 \uAC74\uB108\uB700)` : ""}`,
            "success"
          );
        });
      } catch (err) {
        showToast(err.message || "\uD30C\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "error");
      } finally {
        e.target.value = "";
      }
    });
    root.querySelector("#data-reset")?.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "\uC804\uCCB4 \uB370\uC774\uD130 \uCD08\uAE30\uD654",
        message: "\uBAA8\uB4E0 \uD559\uC2B5 \uAE30\uB85D, \uC124\uC815, \uC624\uB2F5, \uBAA8\uC758\uACE0\uC0AC \uB370\uC774\uD130\uAC00 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
        confirmLabel: "\uCD08\uAE30\uD654",
        danger: true
      });
      if (!ok) return;
      try {
        await resetAllUserData();
        showToast("\uC804\uCCB4 \uB370\uC774\uD130\uAC00 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", "success");
        location.hash = "#home";
      } catch (err) {
        showToast(err.message || "\uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      }
    });
    root.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.getAttribute("data-nav") || "home"));
    });
  }

  // js/session.js
  function createSession({ mode, questions, title = "", meta = {} }) {
    const sessionId = uid("sess");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      sessionId,
      mode: mode || PRACTICE_MODES.practice,
      title,
      startedAt: now,
      finishedAt: null,
      currentIndex: 0,
      questions: questions.map((q) => ({ ...q })),
      answers: {},
      // questionId -> { selectedAnswer, correct, responseTime, errorReason, submittedAt }
      questionStartedAt: Date.now(),
      meta
    };
  }
  function startQuestionTimer(session) {
    session.questionStartedAt = Date.now();
    return session;
  }
  function getCurrentQuestion(session) {
    if (!session?.questions?.length) return null;
    return session.questions[session.currentIndex] || null;
  }
  function recordAnswer(session, questionId, payload) {
    const responseTime = Math.max(
      1,
      Math.round((Date.now() - (session.questionStartedAt || Date.now())) / 1e3)
    );
    session.answers[questionId] = {
      questionId,
      responseTime,
      ...payload,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return session.answers[questionId];
  }
  function setSelectedAnswer(session, questionId, selectedAnswer) {
    const prev = session.answers[questionId] || { questionId };
    session.answers[questionId] = {
      ...prev,
      selectedAnswer,
      submitted: prev.submitted || false
    };
    return session.answers[questionId];
  }
  function buildAttemptList(session) {
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
        createdAt: a.createdAt || null
      };
    });
  }
  function unansweredCount(session) {
    return session.questions.filter((q) => {
      const a = session.answers[q.id];
      return a?.selectedAnswer == null;
    }).length;
  }
  var MOCK_KEY = "tepscrew:activeMockSession";
  function saveMockSessionSnapshot(session) {
    try {
      sessionStorage.setItem(
        MOCK_KEY,
        JSON.stringify({
          ...session
          // Date.now number is fine
        })
      );
    } catch {
    }
  }
  function loadMockSessionSnapshot() {
    try {
      const raw = sessionStorage.getItem(MOCK_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function clearMockSessionSnapshot() {
    try {
      sessionStorage.removeItem(MOCK_KEY);
    } catch {
    }
  }
  function getPassageText(question) {
    if (question?.transcript) return question.transcript;
    return question?.passage || "";
  }
  function choiceLetter(index) {
    return String.fromCharCode(65 + Number(index));
  }

  // js/ai/ai-tutor-ui.js
  function renderAiTutorPanel(question) {
    const status = getAiStatus(getState().settings);
    if (!status.on) {
      return `
      <div class="ai-panel ai-off card-soft">
        <p class="muted">AI\uB97C \uC5F0\uACB0\uD558\uBA74 \uAC1C\uC778 \uB9DE\uCDA4 \uC124\uBA85\uC744 \uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. (\uC124\uC815 \u2192 AI)</p>
      </div>`;
    }
    return `
    <div class="ai-panel card-soft" id="ai-tutor-panel" data-qid="${escapeHtml(question.id)}">
      <div class="card-header-row">
        <h3>\u2728 AI Tutor \xB7 ${escapeHtml(status.label.replace("AI \xB7 ", ""))}</h3>
        <button type="button" class="btn btn-primary" id="ai-tutor-open">\u2728 AI Tutor</button>
      </div>
      <div class="ai-quick" id="ai-quick-actions" hidden>
        ${AI_QUICK_ACTIONS.map(
      (a) => `<button type="button" class="chip-btn" data-ai-action="${escapeHtml(a.id)}">${escapeHtml(
        a.label
      )}</button>`
    ).join("")}
      </div>
      <div class="ai-thread" id="ai-thread" hidden></div>
      <form id="ai-chat-form" class="ai-chat-form" hidden>
        <label class="field">
          <span class="sr-only">AI\uC5D0\uAC8C \uC9C8\uBB38</span>
          <input type="text" name="message" placeholder="\uC608: \uC65C B\uB294 \uC548 \uB3FC?" autocomplete="off" />
        </label>
        <button type="submit" class="btn btn-secondary">\uBCF4\uB0B4\uAE30</button>
      </form>
      <p class="muted small" id="ai-status-line"></p>
    </div>`;
  }
  function bindAiTutorPanel(root, { question, attempt }) {
    const panel = root.querySelector("#ai-tutor-panel");
    if (!panel) return;
    const settings = getState().settings;
    const context = buildQuestionTutorContext({
      question,
      attempt,
      knowledgeMap: getState().knowledgeMap,
      targetScore: settings.targetScore || 327
    });
    const history = [];
    const thread = panel.querySelector("#ai-thread");
    const form = panel.querySelector("#ai-chat-form");
    const quick = panel.querySelector("#ai-quick-actions");
    const statusLine = panel.querySelector("#ai-status-line");
    const append = (role, text) => {
      thread.hidden = false;
      const div = document.createElement("div");
      div.className = `ai-msg ai-msg-${role}`;
      div.innerHTML = `<strong>${role === "user" ? "\uB098" : "Tutor"}</strong><p></p>`;
      div.querySelector("p").textContent = text;
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    };
    const run = async (userMessage, action = "chat", btn = null) => {
      setLoading(btn, true, "\uC0DD\uC131 \uC911\u2026");
      statusLine.textContent = "AI \uC751\uB2F5\uC744 \uAE30\uB2E4\uB9AC\uB294 \uC911\u2026";
      try {
        if (action === "similar") {
          const q = await generateSimilarQuestion({ settings, context });
          statusLine.textContent = "";
          showToast("AI \uC0DD\uC131 \uC5F0\uC2B5\uBB38\uC81C\uB97C \uC900\uBE44\uD588\uC2B5\uB2C8\uB2E4.", "success");
          sessionStorage.setItem(
            "tepscrew:aiPracticeQuestion",
            JSON.stringify(q)
          );
          navigate("practice-quiz", { mode: "practice", aiPractice: "1", count: "1" });
          return;
        }
        if (action === "minilesson") {
          const res2 = await generateMiniLesson({ settings, context });
          append("assistant", res2.text);
          history.push({ role: "assistant", content: res2.text });
          statusLine.textContent = res2.cached ? "\uCE90\uC2DC\uB41C \uC124\uBA85" : "";
          return;
        }
        history.push({ role: "user", content: userMessage });
        append("user", userMessage);
        const res = await askAiTutor({
          settings,
          context,
          userMessage,
          history: history.slice(0, -1),
          action,
          useCache: action !== "chat",
          questionId: question.id
        });
        history.push({ role: "assistant", content: res.text });
        append("assistant", res.text);
        statusLine.textContent = res.cached ? "\uCE90\uC2DC\uB41C \uC124\uBA85" : "";
      } catch (err) {
        statusLine.textContent = "";
        showToast(err.message || "AI \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      } finally {
        setLoading(btn, false);
      }
    };
    panel.querySelector("#ai-tutor-open")?.addEventListener("click", async (e) => {
      quick.hidden = false;
      form.hidden = false;
      const btn = e.currentTarget;
      await run(
        "\uC774 \uBB38\uC81C\uB97C \uD559\uC2B5\uC790\uAC00 \uC774\uD574\uD560 \uC218 \uC788\uAC8C \uC124\uBA85\uD574 \uC8FC\uC138\uC694. \uC815\uB2F5 \uBC18\uBCF5\uB9CC \uD558\uC9C0 \uB9D0\uACE0, \uC624\uB2F5 \uC120\uD0DD \uC774\uC720\uC640 \uD480\uC774 \uC0AC\uACE0\uB97C \uC911\uC2EC\uC73C\uB85C \uC124\uBA85\uD574 \uC8FC\uC138\uC694.",
        "explain",
        btn
      );
    });
    quick?.querySelectorAll("[data-ai-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-ai-action");
        const action = AI_QUICK_ACTIONS.find((a) => a.id === id);
        if (!action) return;
        if (action.prompt === "SIMILAR_QUESTION") {
          await run("", "similar", btn);
          return;
        }
        if (action.prompt === "MINI_LESSON") {
          await run("", "minilesson", btn);
          return;
        }
        await run(action.prompt, id, btn);
      });
    });
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector('[name="message"]');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = "";
      await run(msg, "chat", form.querySelector("button"));
    });
  }
  async function addVocabCandidate(word, meaning, questionId) {
    await addCustomVocabularyEntry({
      word,
      meaning,
      sourceQuestionIds: questionId ? [questionId] : []
    });
    showToast(`\u300C${word}\u300D\uB97C \uB0B4 \uB2E8\uC5B4\uC7A5\uC5D0 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.`, "success");
  }

  // js/practice.js
  var activeSession = null;
  var engineCleanup = null;
  async function confirmLeave(message) {
    return showConfirmModal({
      title: "\uD559\uC2B5 \uC885\uB8CC",
      message,
      confirmLabel: "\uC885\uB8CC",
      cancelLabel: "\uACC4\uC18D",
      danger: true
    });
  }
  function speakLearningAudio(text, btn) {
    if (!text || !window.speechSynthesis) {
      showToast("\uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C\uB294 \uC74C\uC131 \uC77D\uAE30\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Transcript\uB85C \uD559\uC2B5\uD574 \uC8FC\uC138\uC694.", "warning");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    if (btn) {
      btn.disabled = true;
      u.onend = () => {
        btn.disabled = false;
      };
      u.onerror = () => {
        btn.disabled = false;
        showToast("\uC74C\uC131 \uC7AC\uC0DD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. Transcript\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.", "warning");
      };
    }
    window.speechSynthesis.speak(u);
  }
  function renderPractice() {
    const stats = getBankStats();
    const sections = [
      { id: "listening", title: "Listening", emoji: "\u{1F3A7}" },
      { id: "vocabulary", title: "Vocabulary", emoji: "\u{1F4D7}" },
      { id: "grammar", title: "Grammar", emoji: "\u{1F9E9}" },
      { id: "reading", title: "Reading", emoji: "\u{1F4D6}" }
    ];
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Practice</p>
          <h1>\u270F\uFE0F \uBB38\uC81C\uD6C8\uB828</h1>
          <p class="muted page-lead">\uCC44\uC810 \xB7 \uD574\uC124 \xB7 \uC624\uB2F5\uBCF5\uC2B5\uAE4C\uC9C0 \uC5F0\uACB0\uB418\uB294 \uD559\uC2B5 \uC5D4\uC9C4\uC785\uB2C8\uB2E4.</p>
        </div>
      </header>

      <section class="card">
        <h2>\u26A1 \uBE60\uB978\uD6C8\uB828</h2>
        <div class="btn-row wrap section-actions">
          <button type="button" class="btn btn-secondary" data-quiz-count="5">5\uBB38\uC81C</button>
          <button type="button" class="btn btn-secondary" data-quiz-count="10">10\uBB38\uC81C</button>
          <button type="button" class="btn btn-secondary" data-quiz-count="20">20\uBB38\uC81C</button>
        </div>
      </section>

      <section class="card">
        <h2>\u{1F5C2}\uFE0F \uC720\uD615\uD6C8\uB828</h2>
        <div class="quick-grid">
          ${sections.map((s) => {
      const n = stats.bySection?.[s.id] || 0;
      const scarce = n < 5 && (s.id === "reading" || s.id === "listening");
      return `
            <button type="button" class="quick-action ${scarce ? "is-scarce" : ""}" data-quiz-section="${s.id}">
              <span class="qa-title">${s.emoji} ${s.title}</span>
              <span class="qa-desc">${n}\uBB38\uD56D${scarce ? " \xB7 Pack \uD544\uC694" : ""}</span>
            </button>`;
    }).join("")}
        </div>
      </section>

      <section class="card target-card">
        <p class="eyebrow accent-text">Core Feature</p>
        <h2>\u{1F3AF} 327 Target</h2>
        <p class="card-copy">\uCDE8\uC57D Skill \xB7 \uCD5C\uADFC \uC624\uB2F5 \xB7 327 \uD575\uC2EC \uBB38\uD56D\uC744 \uC6B0\uC120 \uAD6C\uC131\uD569\uB2C8\uB2E4. (${stats.target327 || 0}\uBB38\uD56D \uBCF4\uC720)</p>
        <ul class="bullet-list">
          <li>Knowledge Map \uCDE8\uC57D\uC810 \uBC18\uC601</li>
          <li>\uCD5C\uADFC \uC624\uB2F5 \uC720\uD615 \uC6B0\uC120</li>
          <li>\uBB38\uC81C \uBD80\uC871 \uC2DC graceful fallback</li>
        </ul>
        <div class="section-actions">
          <button type="button" class="btn btn-primary" data-target327="1">\u{1F3AF} 327 Target \uC2DC\uC791</button>
        </div>
      </section>
    </section>
  `;
  }
  function bindPractice(root) {
    root.querySelectorAll("[data-quiz-count]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("practice-quiz", {
          count: btn.getAttribute("data-quiz-count"),
          mode: PRACTICE_MODES.practice
        });
      });
    });
    root.querySelectorAll("[data-quiz-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("practice-quiz", {
          count: "5",
          section: btn.getAttribute("data-quiz-section"),
          mode: PRACTICE_MODES.practice
        });
      });
    });
    root.querySelector("[data-target327]")?.addEventListener("click", () => {
      navigate("target-preview");
    });
  }
  function buildTargetComposition(count = 12) {
    const state2 = getState();
    const questions = build327TargetSet(
      state2.questionBank || [],
      {
        knowledgeMap: state2.knowledgeMap,
        recentWrongIds: collectRecentWrongIds(state2.learningRecords),
        recentAnsweredIds: collectRecentAnsweredIds(state2.learningRecords)
      },
      count
    );
    const groups = {};
    questions.forEach((q) => {
      const skill = normalizeSkill(q.section, q.skills && q.skills[0] || q.type) || q.type || "general";
      const key = `${q.section} \xB7 ${skill}`;
      groups[key] = (groups[key] || 0) + 1;
    });
    const preview = {
      count: questions.length,
      groups,
      questionIds: questions.map((q) => q.id),
      reason: "\uCD5C\uADFC \uCDE8\uC57D \uC601\uC5ED\uACFC 327 \uD575\uC2EC \uBB38\uC81C\uB97C \uC911\uC2EC\uC73C\uB85C \uAD6C\uC131\uD588\uC2B5\uB2C8\uB2E4."
    };
    setTargetPreview(preview);
    return preview;
  }
  function renderTargetPreview() {
    const preview = buildTargetComposition(12);
    if (!preview.count) {
      return `<section class="page"><div class="empty-state card">
      <p class="empty-title">\uAD6C\uC131\uD560 \uBB38\uC81C\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.</p>
      <button type="button" class="btn btn-secondary" data-nav="practice">\uBB38\uC81C\uD6C8\uB828\uC73C\uB85C</button>
    </div></section>`;
    }
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">327 Target</p>
          <h1>327 \uC9D1\uC911\uD6C8\uB828</h1>
        </div>
      </header>
      <section class="card target-card">
        <h2>\uC774\uBC88 \uC138\uD2B8</h2>
        <ul class="bullet-list">
          ${Object.entries(preview.groups).map(([k, n]) => `<li>${escapeHtml(k)} ${n}</li>`).join("")}
        </ul>
        <p><strong>\uCD1D ${preview.count}\uBB38\uC81C</strong></p>
        <p class="muted">\uC120\uC815 \uC774\uC720: ${escapeHtml(preview.reason)}</p>
        <button type="button" class="btn btn-primary" id="start-target">\uD6C8\uB828 \uC2DC\uC791</button>
      </section>
    </section>`;
  }
  function bindTargetPreview(root) {
    root.querySelector('[data-nav="practice"]')?.addEventListener("click", () => navigate("practice"));
    root.querySelector("#start-target")?.addEventListener("click", () => {
      const preview = getState().targetPreview;
      navigate("practice-quiz", {
        mode: PRACTICE_MODES.target327,
        target327: "1",
        count: String(preview?.count || 12),
        ids: (preview?.questionIds || []).join(",")
      });
    });
  }
  function resolveQuestionsFromParams(params) {
    if (params.aiPractice === "1") {
      try {
        const raw = sessionStorage.getItem("tepscrew:aiPracticeQuestion");
        if (raw) {
          const q = JSON.parse(raw);
          return {
            questions: [q],
            mode: PRACTICE_MODES.practice,
            title: "AI \uC0DD\uC131 \uC5F0\uC2B5\uBB38\uC81C"
          };
        }
      } catch {
      }
    }
    if (params.mode === PRACTICE_MODES.review || params.review === "1") {
      const due = getDueReviewQuestions();
      const ids = (params.ids || "").split(",").filter(Boolean);
      let items = due;
      if (ids.length) {
        const set = new Set(ids);
        items = getState().reviewQueue.filter((r) => set.has(r.refId));
      }
      const qs = resolveQuestionsByReviewItems(items);
      if (qs.length) return { questions: qs, mode: PRACTICE_MODES.review, title: "\uC624\uB2F5 \uBCF5\uC2B5" };
    }
    const count = Number(params.count) || 5;
    const section = params.section || null;
    const target327 = params.target327 === "1" || params.mode === PRACTICE_MODES.target327;
    const mode = params.mode === PRACTICE_MODES.diagnosis ? PRACTICE_MODES.diagnosis : target327 ? PRACTICE_MODES.target327 : PRACTICE_MODES.practice;
    const idList = (params.ids || "").split(",").filter(Boolean);
    const questions = selectPracticeQuestions({
      count,
      section,
      target327,
      questionIds: idList.length ? idList : null
    });
    const title = mode === PRACTICE_MODES.target327 ? "327 Target" : mode === PRACTICE_MODES.diagnosis ? "Quick Diagnosis" : section ? `${section} \uD6C8\uB828` : "\uBB38\uC81C\uD6C8\uB828";
    return { questions, mode, title };
  }
  function renderPracticeQuiz(params = {}) {
    const { questions, mode, title } = resolveQuestionsFromParams(params);
    if (!questions.length) {
      return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">\uD480 \uC218 \uC788\uB294 \uBB38\uC81C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
          <p class="muted">\uBB38\uC81C\uC740\uD589\uC774 \uBE44\uC5B4 \uC788\uAC70\uB098 \uBCF5\uC2B5 \uB300\uAE30 \uBB38\uC81C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
          <button type="button" class="btn btn-secondary" data-nav="practice">\uBB38\uC81C\uD6C8\uB828\uC73C\uB85C</button>
        </div>
      </section>`;
    }
    activeSession = createSession({ mode, questions, title });
    startQuestionTimer(activeSession);
    return `
    <section class="page quiz-page practice-engine" data-engine="practice">
      <header class="quiz-header card">
        <div>
          <p class="eyebrow" id="quiz-section">\u2014</p>
          <h1 id="quiz-title">${escapeHtml(title)}</h1>
        </div>
        <div class="quiz-meta">
          <span id="quiz-progress">1 / ${questions.length}</span>
          <span class="timer" id="quiz-timer" aria-live="off">00:00</span>
        </div>
      </header>

      <article class="card quiz-body" id="quiz-body"></article>

      <div class="quiz-sticky-footer" id="quiz-actions"></div>
      <p class="muted small center" id="quiz-demo-note" hidden>Demo \uBB38\uC81C \uAE30\uBC18 \uD559\uC2B5\uC785\uB2C8\uB2E4. \uC2E4\uC81C TEPS \uAE30\uCD9C\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p>
    </section>
  `;
  }
  function renderExplanation(question, settings) {
    const ex = question.explanation || {};
    const mode = settings.explanationMode || "manual";
    if (mode === "after-set") return "";
    const vocab = normalizeVocabList(question.vocabulary);
    const collocations = asStringList(question.collocations);
    const synonyms = asStringList(question.synonyms);
    const confusable = asStringList(question.confusableWords);
    const sourceLabel = question.source === "demo" ? "Demo \uD559\uC2B5\uBB38\uD56D" : question.source === "ai-practice" ? "AI \uC0DD\uC131 \uC5F0\uC2B5\uBB38\uC81C" : "TEPS Crew Practice";
    const body = `
    <div class="explain-panel" id="explain-panel">
      <p class="muted small">${escapeHtml(sourceLabel)}${question.targetScoreBand === "327-target" ? ' \xB7 <span class="badge badge-soft">327 \uD575\uC2EC</span>' : ""}</p>
      <div class="explain-block">
        <h3>\uD575\uC2EC \uD480\uC774</h3>
        <p>${escapeHtml(ex.summary || "\uD574\uC124 \uC694\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")}</p>
      </div>
      <div class="explain-block">
        <h3>\uC815\uB2F5 \uADFC\uAC70</h3>
        <p>${escapeHtml(ex.evidence || "\uADFC\uAC70 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")}</p>
      </div>
      <details class="explain-details" ${mode === "immediate" ? "open" : ""}>
        <summary>\uC120\uD0DD\uC9C0\uBCC4 \uBD84\uC11D</summary>
        <ul class="choice-analysis">
          ${(ex.choiceAnalysis || question.choices || []).map(
      (text, i) => `<li><strong>${choiceLetter(i)}</strong> ${escapeHtml(
        typeof text === "string" ? text : ""
      )}</li>`
    ).join("")}
        </ul>
      </details>
      ${collocations.length ? `<details class="explain-details"><summary>\uD568\uAED8 \uC678\uC6B8 \uD45C\uD604</summary>
              <ul class="vocab-mini-list">${collocations.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></details>` : ""}
      ${synonyms.length ? `<details class="explain-details"><summary>\uC720\uC758\uC5B4</summary>
              <ul class="vocab-mini-list">${synonyms.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></details>` : ""}
      ${confusable.length ? `<details class="explain-details"><summary>\uD5F7\uAC08\uB9AC\uB294 \uD45C\uD604</summary>
              <ul class="vocab-mini-list">${confusable.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></details>` : ""}
      ${vocab.length ? `<details class="explain-details" open><summary>\uD575\uC2EC \uC5B4\uD718</summary>
              <ul class="vocab-mini-list">
                ${vocab.map(
      (v) => `
                  <li>
                    <strong>${escapeHtml(v.word)}</strong>${v.meaning ? ` \u2014 ${escapeHtml(v.meaning)}` : ""}
                    <button type="button" class="btn btn-ghost btn-mini" data-add-vocab="${escapeHtml(
        v.word
      )}" data-meaning="${escapeHtml(v.meaning || "")}">\uB0B4 \uB2E8\uC5B4\uC7A5\uC5D0 \uCD94\uAC00</button>
                  </li>`
    ).join("")}
              </ul></details>` : ""}
      ${collocations[0] ? `<div class="empty-inline">
              <p>\uC774 \uD45C\uD604\uC744 \uBCF5\uC2B5\uC5D0 \uCD94\uAC00\uD560\uAE4C\uC694? <strong>${escapeHtml(collocations[0])}</strong></p>
              <button type="button" class="btn btn-secondary" data-add-vocab="${escapeHtml(
      collocations[0]
    )}" data-meaning="">\uBCF5\uC2B5\uC5D0 \uCD94\uAC00</button>
            </div>` : ""}
    </div>`;
    return body;
  }
  function asStringList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => typeof x === "string" ? x : x?.word || x?.phrase || "").filter(Boolean);
  }
  function normalizeVocabList(vocabulary) {
    if (!Array.isArray(vocabulary)) return [];
    return vocabulary.map((v) => {
      if (typeof v === "string") return { word: v, meaning: "" };
      if (v && typeof v === "object") return { word: v.word || v.term || "", meaning: v.meaning || "" };
      return null;
    }).filter((v) => v && v.word);
  }
  function renderErrorReasonPicker() {
    return `
    <div class="error-reason card-soft" id="error-reason-box">
      <p class="field-label">\uC65C \uD2C0\uB838\uB2E4\uACE0 \uC0DD\uAC01\uD558\uB098\uC694? <span class="muted">(\uC120\uD0DD)</span></p>
      <div class="reason-grid" role="group" aria-label="\uC624\uB2F5 \uC6D0\uC778">
        ${ERROR_REASONS.map(
      (r) => `<button type="button" class="reason-chip" data-reason="${escapeHtml(r.id)}">${escapeHtml(
        r.label
      )}</button>`
    ).join("")}
      </div>
    </div>`;
  }
  function paintQuestion(root) {
    const session = activeSession;
    const q = getCurrentQuestion(session);
    if (!q) return;
    const settings = getState().settings;
    const answerState = session.answers[q.id] || {};
    const submitted = !!answerState.submitted;
    const sectionLabel = (q.section || "reading").replace(/^./, (c) => c.toUpperCase());
    const passage = getPassageText(q);
    const isListening = q.section === "listening";
    root.querySelector("#quiz-section").textContent = `${sectionLabel} \xB7 Question ${session.currentIndex + 1}`;
    root.querySelector("#quiz-progress").textContent = `${session.currentIndex + 1} / ${session.questions.length}`;
    root.querySelector("#quiz-demo-note").hidden = !(q.source === "demo" || getState().content.reading?.demo);
    const body = root.querySelector("#quiz-body");
    const canTts = isListening && passage && typeof window.speechSynthesis !== "undefined";
    body.innerHTML = `
    ${isListening ? `<div class="listening-toolbar">
            <p class="badge badge-soft">\uD559\uC2B5\uC6A9 Transcript \xB7 \uC2E4\uC81C TEPS \uC74C\uC6D0\uC774 \uC544\uB2D9\uB2C8\uB2E4</p>
            ${canTts ? `<button type="button" class="btn btn-secondary btn-mini" id="tts-play">\uD559\uC2B5\uC6A9 \uC74C\uC131 \uB4E3\uAE30</button>` : ""}
          </div>` : ""}
    <div class="passage reading-prose ${passage ? "" : "is-empty"}">${passage ? escapeHtml(passage).replace(/\n/g, "<br>") : '<span class="muted">\uC9C0\uBB38 \uC5C6\uC74C</span>'}</div>
    <h2 class="quiz-question">${escapeHtml(q.question)}</h2>
    <div class="choice-list" id="quiz-choices" role="radiogroup" aria-label="\uC120\uD0DD\uC9C0">
      ${q.choices.map((c, i) => {
      let cls = "choice-btn";
      let extra = "";
      if (submitted) {
        if (i === q.answer) {
          cls += " is-correct";
          extra = '<span class="choice-status">\uC815\uB2F5</span>';
        }
        if (answerState.selectedAnswer === i && i !== q.answer) {
          cls += " is-wrong";
          extra = '<span class="choice-status">\uB0B4 \uC120\uD0DD</span>';
        } else if (answerState.selectedAnswer === i) {
          extra = '<span class="choice-status">\uB0B4 \uC120\uD0DD \xB7 \uC815\uB2F5</span>';
        }
      } else if (answerState.selectedAnswer === i) {
        cls += " is-selected";
      }
      return `
            <button type="button" class="${cls}" role="radio"
              aria-checked="${answerState.selectedAnswer === i}"
              data-choice="${i}" ${submitted ? "disabled" : ""}>
              <span class="choice-key">${choiceLetter(i)}</span>
              <span class="choice-text">${escapeHtml(c)}</span>
              ${extra}
            </button>`;
    }).join("")}
    </div>
    <div id="result-banner" class="result-banner" ${submitted ? "" : "hidden"}></div>
    <div id="after-submit">${submitted ? `${renderResultBanner(answerState, q)}
           ${renderExplanation(q, settings)}
           ${answerState.correct ? "" : renderErrorReasonPicker()}
           ${renderAiTutorPanel(q)}` : ""}</div>
  `;
    if (submitted && answerState.errorReason) {
      body.querySelector(`[data-reason="${answerState.errorReason}"]`)?.classList.add("is-active");
    }
    body.querySelector("#tts-play")?.addEventListener("click", (e) => {
      speakLearningAudio(passage, e.currentTarget);
    });
    if (submitted) {
      bindAiTutorPanel(root, { question: q, attempt: answerState });
      body.querySelectorAll("[data-add-vocab]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await addVocabCandidate(
              btn.getAttribute("data-add-vocab"),
              btn.getAttribute("data-meaning") || "",
              q.id
            );
          } catch (err) {
            showToast(err.message || "\uCD94\uAC00 \uC2E4\uD328", "error");
          }
        });
      });
    }
    const actions = root.querySelector("#quiz-actions");
    const isLast = session.currentIndex >= session.questions.length - 1;
    actions.innerHTML = `
    <button type="button" class="btn btn-ghost" id="quiz-exit">\uB098\uAC00\uAE30</button>
    ${submitted ? `<button type="button" class="btn btn-primary" id="quiz-next">${isLast ? "\uACB0\uACFC \uBCF4\uAE30" : "\uB2E4\uC74C \uBB38\uC81C"}</button>` : `<button type="button" class="btn btn-primary" id="quiz-submit" ${answerState.selectedAnswer == null ? "disabled" : ""}>\uB2F5\uC548 \uC81C\uCD9C</button>`}
  `;
    bindQuestionInteractions(root);
  }
  function renderResultBanner(answerState, q) {
    if (answerState.correct) {
      return `<div class="result-banner is-correct" role="status">\uC815\uB2F5\uC785\uB2C8\uB2E4 \u2713</div>`;
    }
    return `<div class="result-banner is-wrong" role="status">\uC544\uC27D\uC2B5\uB2C8\uB2E4. \uC815\uB2F5\uC740 ${choiceLetter(
      q.answer
    )}\uC785\uB2C8\uB2E4.</div>`;
  }
  function bindQuestionInteractions(root) {
    const session = activeSession;
    const q = getCurrentQuestion(session);
    if (!q) return;
    const answerState = session.answers[q.id] || {};
    const submitted = !!answerState.submitted;
    if (!submitted) {
      root.querySelectorAll("#quiz-choices .choice-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          setSelectedAnswer(session, q.id, Number(btn.dataset.choice));
          paintQuestion(root);
        });
      });
    } else {
      root.querySelectorAll("[data-reason]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const reason = btn.getAttribute("data-reason");
          session.answers[q.id].errorReason = reason;
          root.querySelectorAll("[data-reason]").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
      });
    }
    root.querySelector("#quiz-submit")?.addEventListener("click", async () => {
      const selected = session.answers[q.id]?.selectedAnswer;
      if (selected == null) return;
      const correct = selected === q.answer;
      const recorded = recordAnswer(session, q.id, {
        selectedAnswer: selected,
        correct,
        correctAnswer: q.answer,
        submitted: true,
        section: q.section,
        type: q.type,
        skills: skillsSafe(q)
      });
      try {
        await persistQuestionAttempt({
          session,
          question: q,
          selectedAnswer: selected,
          correct,
          responseTime: recorded.responseTime,
          errorReason: null
        });
      } catch (err) {
        showToast(err.message || "\uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "warning");
      }
      paintQuestion(root);
    });
    root.querySelector("#quiz-next")?.addEventListener("click", async () => {
      const a = session.answers[q.id];
      if (a && !a.correct && a.errorReason) {
        try {
          const rec = getState().learningRecords.find(
            (r) => r.sessionId === session.sessionId && r.questionId === q.id
          );
          if (rec) {
            await putItem("learningRecords", { ...rec, errorReason: a.errorReason });
            rec.errorReason = a.errorReason;
          }
        } catch {
        }
      }
      if (session.currentIndex >= session.questions.length - 1) {
        await finishPracticeSession(root);
        return;
      }
      session.currentIndex += 1;
      startQuestionTimer(session);
      paintQuestion(root);
    });
    root.querySelector("#quiz-exit")?.addEventListener("click", async () => {
      const ok = await confirmLeave(
        session.mode?.includes("Mock") ? "\uC2DC\uD5D8\uC744 \uC885\uB8CC\uD558\uBA74 \uD604\uC7AC \uB2F5\uC548\uC774 \uC81C\uCD9C\uB418\uC9C0 \uC54A\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC885\uB8CC\uD560\uAE4C\uC694?" : "\uD604\uC7AC \uD559\uC2B5\uC744 \uC885\uB8CC\uD560\uAE4C\uC694?"
      );
      if (ok) {
        cleanupEngine();
        navigate(session.mode === PRACTICE_MODES.review ? "review" : "practice");
      }
    });
  }
  function skillsSafe(q) {
    return Array.isArray(q.skills) ? q.skills : q.type ? [q.type] : [];
  }
  async function finishPracticeSession() {
    const session = activeSession;
    if (!session) return;
    const attempts = buildAttemptList(session).map((a) => {
      const saved = session.answers[a.questionId];
      return { ...a, errorReason: saved?.errorReason || a.errorReason };
    });
    try {
      await persistSessionSummary(session);
    } catch (err) {
      showToast(err.message || "\uC138\uC158 \uC694\uC57D \uC800\uC7A5 \uC2E4\uD328", "warning");
    }
    const answered = attempts.filter((a) => a.correct != null);
    const correctCount = answered.filter((a) => a.correct).length;
    const totalTime = answered.reduce((s, a) => s + (a.responseTime || 0), 0);
    const { bySection, skillStats } = summarizeAttempts(answered);
    const skillList = Object.values(skillStats).filter((s) => s.total);
    const weakSkills = skillList.filter((s) => s.correct / s.total < 0.67).sort((a, b) => a.correct / a.total - b.correct / b.total).slice(0, 4);
    const improvedSkills = skillList.filter((s) => s.correct / s.total >= 0.67).sort((a, b) => b.correct / b.total - a.correct / a.total).slice(0, 4);
    const result = {
      kind: "practice",
      sessionId: session.sessionId,
      mode: session.mode,
      title: session.title,
      questions: session.questions,
      attempts: answered,
      totalQuestions: session.questions.length,
      correctCount,
      accuracy: session.questions.length ? Math.round(correctCount / session.questions.length * 1e3) / 10 : 0,
      totalTime,
      avgTime: answered.length ? Math.round(totalTime / answered.length) : 0,
      bySection,
      weakSkills,
      improvedSkills,
      isTarget327: session.mode === PRACTICE_MODES.target327,
      demo: session.questions.every((q) => q.source === "demo") || getState().content.reading?.demo
    };
    setLastSessionResult(result);
    cleanupEngine();
    navigate("practice-result");
  }
  function bindPracticeQuiz(root) {
    root.querySelector('[data-nav="practice"]')?.addEventListener(
      "click",
      () => navigate("practice")
    );
    if (!root.querySelector(".practice-engine")) return;
    let seconds = 0;
    const timerEl = root.querySelector("#quiz-timer");
    const timer = setInterval(() => {
      seconds += 1;
      if (timerEl) timerEl.textContent = formatTimer(seconds);
    }, 1e3);
    const onKey = (e) => {
      if (!activeSession) return;
      const q = getCurrentQuestion(activeSession);
      if (!q) return;
      const submitted = activeSession.answers[q.id]?.submitted;
      if (submitted) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        setSelectedAnswer(activeSession, q.id, Number(e.key) - 1);
        paintQuestion(root);
      }
    };
    document.addEventListener("keydown", onKey);
    engineCleanup = () => {
      clearInterval(timer);
      document.removeEventListener("keydown", onKey);
    };
    root._quizCleanup = engineCleanup;
    paintQuestion(root);
  }
  function cleanupEngine() {
    if (typeof engineCleanup === "function") engineCleanup();
    engineCleanup = null;
    activeSession = null;
  }
  function renderPracticeResult() {
    const result = getLastSessionResult();
    if (!result || result.kind === "mock") {
      return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">\uD45C\uC2DC\uD560 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
          <button type="button" class="btn btn-primary" data-nav="practice">\uBB38\uC81C\uD6C8\uB828\uC73C\uB85C</button>
        </div>
      </section>`;
    }
    const sectionRows = Object.entries(result.bySection || {}).filter(([, s]) => s.total > 0).map(
      ([section, s]) => `
      <div class="level-row">
        <span>${escapeHtml(section)}</span>
        <div class="bar thin"><div class="bar-fill" style="width:${s.total ? Math.round(s.correct / s.total * 100) : 0}%"></div></div>
        <strong>${s.correct}/${s.total}</strong>
      </div>`
    ).join("");
    const wrongIds = result.attempts.filter((a) => !a.correct).map((a) => a.questionId);
    const minutes = Math.max(1, Math.round((result.totalTime || 0) / 60));
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">${result.isTarget327 ? "327 Target \uACB0\uACFC" : "Result"}</p>
          <h1>${result.isTarget327 ? "327 Target \uACB0\uACFC" : `${escapeHtml(result.totalQuestions)}\uBB38\uC81C \uC644\uB8CC`}</h1>
          ${result.demo ? '<span class="badge badge-demo">Demo \uBB38\uC81C \uAE30\uBC18 \uD559\uC2B5 \uACB0\uACFC</span>' : ""}
          <p class="muted">\uC57D ${minutes}\uBD84 \xB7 \uC815\uB2F5\uB960 ${result.accuracy}%</p>
        </div>
      </header>

      <section class="card">
        <div class="score-grid">
          <div class="score-cell">
            <span class="label">\uC815\uB2F5</span>
            <strong class="score-value">${result.correctCount} / ${result.totalQuestions}</strong>
          </div>
          <div class="score-cell accent-cell">
            <span class="label">\uC815\uB2F5\uB960</span>
            <strong class="score-value accent-text">${result.accuracy}%</strong>
          </div>
          <div class="score-cell">
            <span class="label">\uD3C9\uADE0 \uD480\uC774\uC2DC\uAC04</span>
            <strong class="score-value">${result.avgTime}\uCD08</strong>
          </div>
        </div>
      </section>

      ${result.isTarget327 ? `<section class="card">
              <h2>\uC774\uBC88\uC5D0 \uBCF4\uC644\uD55C \uC601\uC5ED</h2>
              ${result.improvedSkills?.length ? `<ul class="bullet-list">${result.improvedSkills.map(
      (s) => `<li>${escapeHtml(s.skill)} (${s.correct}/${s.total})</li>`
    ).join("")}</ul>` : '<p class="muted">\uC774\uBC88 \uC138\uD2B8\uC5D0\uC11C \uD655\uC2E4\uD788 \uBCF4\uC644\uB41C Skill\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
              <h2 style="margin-top:1rem">\uACC4\uC18D \uBCF4\uC644 \uD544\uC694</h2>
              ${result.weakSkills?.length ? `<ul class="bullet-list">${result.weakSkills.map(
      (s) => `<li>${escapeHtml(s.skill)} (${s.correct}/${s.total})</li>`
    ).join("")}</ul>` : '<p class="muted">\uB450\uB4DC\uB7EC\uC9C4 \uCDE8\uC57D Skill\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
            </section>` : `<section class="card">
              <h2>\uCDE8\uC57D Skill</h2>
              ${result.weakSkills?.length ? `<ul class="bullet-list">${result.weakSkills.map(
      (s) => `<li>${escapeHtml(s.section)} \xB7 ${escapeHtml(s.skill)} (${s.correct}/${s.total})</li>`
    ).join("")}</ul>` : '<p class="muted">\uB450\uB4DC\uB7EC\uC9C4 \uCDE8\uC57D Skill\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
            </section>`}

      <section class="card">
        <h2>\uC601\uC5ED\uBCC4</h2>
        <div class="level-list">${sectionRows || '<p class="muted">\uC601\uC5ED \uB370\uC774\uD130 \uC5C6\uC74C</p>'}</div>
      </section>

      ${getState().settings?.explanationMode === "after-set" ? renderAfterSetExplanations(result) : ""}

      <section class="card">
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" data-nav="review">\uC624\uB2F5 \uD655\uC778</button>
          ${wrongIds.length ? `<button type="button" class="btn btn-primary" id="retry-wrong">\uD2C0\uB9B0 \uBB38\uC81C \uB2E4\uC2DC \uD480\uAE30</button>` : ""}
          <button type="button" class="btn btn-secondary" data-nav="practice-quiz" data-count="${result.totalQuestions}">\uC0C8\uB85C\uC6B4 \uBB38\uC81C \uD480\uAE30</button>
          <button type="button" class="btn btn-ghost" data-nav="practice">\uBB38\uC81C\uD6C8\uB828\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30</button>
        </div>
      </section>
    </section>
  `;
  }
  function renderAfterSetExplanations(result) {
    const wrong = result.attempts.filter((a) => !a.correct);
    if (!wrong.length) return "";
    const qmap = new Map(result.questions.map((q) => [q.id, q]));
    return `
    <section class="card">
      <h2>\uC138\uD2B8 \uD574\uC124 (\uC624\uB2F5)</h2>
      ${wrong.map((a) => {
      const q = qmap.get(a.questionId);
      if (!q) return "";
      return `<article class="explain-block">
            <h3>${escapeHtml(q.id)}</h3>
            <p>${escapeHtml(q.explanation?.summary || "")}</p>
            <p class="muted">${escapeHtml(q.explanation?.evidence || "")}</p>
          </article>`;
    }).join("")}
    </section>`;
  }
  function bindPracticeResult(root) {
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.getAttribute("data-nav");
        const params = {};
        if (btn.dataset.count) params.count = btn.dataset.count;
        navigate(page, params);
      });
    });
    root.querySelector("#retry-wrong")?.addEventListener("click", () => {
      const result = getLastSessionResult();
      const wrongIds = result.attempts.filter((a) => !a.correct).map((a) => a.questionId);
      navigate("practice-quiz", {
        mode: PRACTICE_MODES.review,
        review: "1",
        ids: wrongIds.join(",")
      });
    });
  }
  function destroyPracticeEngine() {
    cleanupEngine();
  }

  // js/review.js
  function dueVocabItems() {
    const { review, weak } = getVocabLists();
    return review;
  }
  function renderReview(params = {}) {
    const tab = params.tab || "today";
    const dueQ = getDueReviewQuestions();
    const dueV = dueVocabItems();
    const wrong = getWrongReviewQuestions();
    const mastered = getMasteredReviews();
    const vocabLists = getVocabLists();
    const km = getState().knowledgeMap;
    const weakConcepts = [];
    if (km?.sections) {
      Object.entries(km.sections).forEach(([section, items]) => {
        (items || []).forEach((item) => {
          if ((item.mastery || 0) <= 35) {
            weakConcepts.push({ section, ...item });
          }
        });
      });
    }
    weakConcepts.sort((a, b) => (a.mastery || 0) - (b.mastery || 0));
    const filter = params.section || "all";
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Review</p>
          <h1>\u{1F501} \uC624\uB2F5\xB7\uBCF5\uC2B5</h1>
        </div>
      </header>

      <div class="segmented" role="tablist" aria-label="\uBCF5\uC2B5 \uD0ED">
        ${[
      ["today", "\u{1F4C5} \uC624\uB298 \uBCF5\uC2B5"],
      ["wrong", "\u274C \uC624\uB2F5 \uBB38\uC81C"],
      ["weak-vocab", "\u26A0\uFE0F \uCDE8\uC57D \uB2E8\uC5B4"],
      ["weak-concept", "\u{1F9E9} \uCDE8\uC57D \uAC1C\uB150"],
      ["mastered", "\u2705 Mastered"]
    ].map(
      ([id, label]) => `<button type="button" class="seg-btn ${tab === id ? "is-active" : ""}" data-review-tab="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`
    ).join("")}
      </div>

      ${tab === "today" ? `<section class="card">
              <div class="card-header-row">
                <h2>\uC624\uB298 \uBCF5\uC2B5</h2>
                <button type="button" class="btn btn-primary" id="start-today-review"
                  ${dueQ.length + dueV.length ? "" : "disabled"}>\uC624\uB298 \uBCF5\uC2B5 \uC2DC\uC791</button>
              </div>
              ${renderTodayPanel(dueQ, dueV)}
            </section>` : ""}

      ${tab === "wrong" ? `<section class="card">
              <div class="card-header-row">
                <h2>\uC624\uB2F5 \uBB38\uC81C</h2>
              </div>
              <div class="filter-row" role="group" aria-label="\uC601\uC5ED \uD544\uD130">
                ${["all", "listening", "vocabulary", "grammar", "reading"].map(
      (s) => `<button type="button" class="chip-btn ${filter === s ? "is-active" : ""}" data-section-filter="${s}">${s === "all" ? "\uC804\uCCB4" : s}</button>`
    ).join("")}
              </div>
              ${renderWrongList(
      filter === "all" ? wrong : wrong.filter((w) => w.section === filter)
    )}
            </section>` : ""}

      ${tab === "weak-vocab" ? `<section class="card">
              <h2>\uCDE8\uC57D \uB2E8\uC5B4</h2>
              ${renderWeakVocab(vocabLists.weak)}
            </section>` : ""}

      ${tab === "weak-concept" ? `<section class="card">
              <h2>\uCDE8\uC57D \uAC1C\uB150</h2>
              ${weakConcepts.length ? `<ul class="knowledge-list">${weakConcepts.slice(0, 16).map(
      (c) => `<li>
                        <div class="knowledge-label">
                          <span>${escapeHtml(c.section)} \xB7 ${escapeHtml(c.label)}</span>
                          <span class="muted">${escapeHtml(c.mastery || 0)}%</span>
                        </div>
                        <div class="bar thin"><div class="bar-fill" style="width:${escapeHtml(
        c.mastery || 0
      )}%"></div></div>
                      </li>`
    ).join("")}</ul>` : `<div class="empty-state">
                      <p class="empty-title">\uD45C\uC2DC\uD560 \uCDE8\uC57D \uAC1C\uB150\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
                      <p class="muted">\uBB38\uC81C\uB97C \uD480\uBA74 Knowledge Map\uC774 \uCC44\uC6CC\uC9D1\uB2C8\uB2E4.</p>
                    </div>`}
            </section>` : ""}

      ${tab === "mastered" ? `<section class="card">
              <h2>Mastered</h2>
              ${renderMastered(mastered, vocabLists.mastered)}
            </section>` : ""}
    </section>
  `;
  }
  function renderTodayPanel(dueQ, dueV) {
    if (!dueQ.length && !dueV.length) {
      return `<div class="empty-state">
      <p class="empty-title">\uC624\uB298 \uBCF5\uC2B5\uD560 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <p class="muted">\uBB38\uC81C\uB97C \uD2C0\uB9AC\uAC70\uB098 \uB2E8\uC5B4\uB97C \uD559\uC2B5\uD558\uBA74 \uBCF5\uC2B5 \uC77C\uC815\uC774 \uC313\uC785\uB2C8\uB2E4.</p>
      <button type="button" class="btn btn-secondary" data-nav="practice">\uBB38\uC81C\uD6C8\uB828 \uAC00\uAE30</button>
    </div>`;
    }
    return `
    <p class="muted">\uBB38\uC81C ${dueQ.length}\uAC1C \xB7 \uB2E8\uC5B4 ${dueV.length}\uAC1C</p>
    <ul class="record-list">
      ${dueQ.slice(0, 8).map(
      (r) => `<li>
          <div>
            <strong>${escapeHtml(r.refId)}</strong>
            <p class="muted">${escapeHtml(r.section)} \xB7 ${escapeHtml(r.skill || "")}</p>
          </div>
          <span class="status-pill">\uBB38\uC81C</span>
        </li>`
    ).join("")}
      ${dueV.slice(0, 8).map(
      ({ word }) => `<li>
          <div><strong>${escapeHtml(word.word)}</strong>
          <p class="muted">${escapeHtml(word.meaning)}</p></div>
          <span class="status-pill">\uB2E8\uC5B4</span>
        </li>`
    ).join("")}
    </ul>`;
  }
  function renderWrongList(items) {
    if (!items.length) {
      return `<div class="empty-state">
      <p class="empty-title">\uC544\uC9C1 \uBCF5\uC2B5\uD560 \uC624\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <p class="muted">\uBB38\uC81C\uD480\uC774 \uACB0\uACFC\uAC00 \uC313\uC774\uBA74 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</p>
    </div>`;
    }
    return `<ul class="record-list">
    ${items.slice(0, 40).map(
      (r) => `<li>
        <div>
          <strong>${escapeHtml(r.refId)}</strong>
          <p class="muted">${escapeHtml(r.section)} \xB7 \uC624\uB2F5 ${escapeHtml(
        r.wrongCount || 1
      )}\uD68C \xB7 mastery ${escapeHtml(r.mastery || 0)}</p>
        </div>
        <button type="button" class="btn btn-secondary" data-retry="${escapeHtml(
        r.refId
      )}">\uB2E4\uC2DC \uD480\uAE30</button>
      </li>`
    ).join("")}
  </ul>`;
  }
  function renderWeakVocab(list) {
    if (!list.length) {
      return `<div class="empty-state">
      <p class="empty-title">\uCDE8\uC57D \uB2E8\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <p class="muted">\uB2E8\uC5B4 \uD559\uC2B5\uC5D0\uC11C \u300C\uBAB0\uB77C\uC694\u300D\u300C\uD5F7\uAC08\uB824\uC694\u300D\uAC00 \uC313\uC774\uBA74 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</p>
      <button type="button" class="btn btn-secondary" data-nav="vocabulary">\uB2E8\uC5B4 \uD559\uC2B5</button>
    </div>`;
    }
    return `<ul class="record-list">
    ${list.slice(0, 30).map(
      ({ word, mastery }) => `<li>
        <div>
          <strong>${escapeHtml(word.word)}</strong>
          <p class="muted">${escapeHtml(word.meaning)} \xB7 ${escapeHtml(
        mastery.lastResult || ""
      )}</p>
        </div>
        <span class="status-pill">${escapeHtml(mastery.status || "learning")}</span>
      </li>`
    ).join("")}
  </ul>`;
  }
  function renderMastered(questions, vocab) {
    if (!questions.length && !vocab.length) {
      return `<div class="empty-state">
      <p class="empty-title">Mastered \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <p class="muted">\uCDA9\uBD84\uD788 \uBCF5\uC2B5\uD55C \uBB38\uC81C\xB7\uB2E8\uC5B4\uAC00 \uC5EC\uAE30\uC5D0 \uBAA8\uC785\uB2C8\uB2E4.</p>
    </div>`;
    }
    return `<ul class="record-list">
    ${questions.map(
      (r) => `<li><div><strong>${escapeHtml(r.refId)}</strong><p class="muted">\uBB38\uC81C</p></div>
          <span class="status-pill status-completed">Mastered</span></li>`
    ).join("")}
    ${vocab.map(
      ({ word }) => `<li><div><strong>${escapeHtml(word.word)}</strong><p class="muted">\uB2E8\uC5B4</p></div>
          <span class="status-pill status-completed">Mastered</span></li>`
    ).join("")}
  </ul>`;
  }
  function bindReview(root) {
    root.querySelectorAll("[data-review-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("review", { tab: btn.getAttribute("data-review-tab") });
      });
    });
    root.querySelectorAll("[data-section-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("review", {
          tab: "wrong",
          section: btn.getAttribute("data-section-filter")
        });
      });
    });
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.getAttribute("data-nav")));
    });
    root.querySelectorAll("[data-retry]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("practice-quiz", {
          mode: PRACTICE_MODES.review,
          review: "1",
          ids: btn.getAttribute("data-retry")
        });
      });
    });
    root.querySelector("#start-today-review")?.addEventListener("click", () => {
      const dueQ = getDueReviewQuestions();
      const qs = resolveQuestionsByReviewItems(dueQ);
      const dueV = dueVocabItems();
      if (qs.length) {
        navigate("practice-quiz", {
          mode: PRACTICE_MODES.review,
          review: "1",
          ids: qs.map((q) => q.id).join(",")
        });
        return;
      }
      if (dueV.length) {
        navigate("vocabulary", { tab: "review" });
        return;
      }
    });
  }

  // js/vocabulary.js
  function listForTab(tab, lists) {
    if (tab === "new") return lists.new.map((w) => ({ word: w, mastery: null }));
    if (tab === "weak") return lists.weak;
    return lists.review.length ? lists.review : lists.new.slice(0, 5).map((w) => ({ word: w, mastery: null }));
  }
  function skillGroupsFromBank(questionBank) {
    const raw = groupQuestionsBySkill(questionBank || [], "vocabulary");
    const map = {};
    Object.entries(raw).forEach(([skill, qs]) => {
      const id = canonicalizeSkill("vocabulary", skill) || skill;
      if (!map[id]) map[id] = [];
      map[id].push(...qs);
    });
    const labels = Object.fromEntries(
      (SKILL_TAXONOMY.vocabulary || []).map((s) => [s.id, s.label])
    );
    return Object.entries(map).map(([id, qs]) => ({
      id,
      label: labels[id] || id,
      count: qs.length
    })).sort((a, b) => b.count - a.count);
  }
  function renderVocabulary(params = {}) {
    const tab = params.tab || "skills";
    const lists = getVocabLists();
    const state2 = getState();
    const skills = skillGroupsFromBank(state2.questionBank);
    const custom = Object.values(state2.customVocabulary || {}).sort(
      (a, b) => (a.word || "").localeCompare(b.word || "")
    );
    const detailId = params.wordId || "";
    const detail = detailId ? state2.customVocabulary?.[detailId] : null;
    if (tab === "detail" && detail) {
      return renderWordDetail(detail);
    }
    const queue = ["review", "new", "weak"].includes(tab) ? listForTab(tab, lists) : [];
    return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="teps">\u2190 TEPS \uD559\uC2B5</button>
        <div>
          <p class="eyebrow">Vocabulary</p>
          <h1>\u{1F4D7} \uB2E8\uC5B4 \uD559\uC2B5</h1>
          <p class="muted page-lead">\uBB38\uC81C\uC740\uD589 Skill \uAE30\uC900\uC73C\uB85C \uBD84\uB958\uD569\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uAE30\uCD9C\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p>
        </div>
      </header>

      <div class="segmented" role="tablist" aria-label="\uB2E8\uC5B4 \uD559\uC2B5 \uBAA8\uB4DC">
        <button type="button" class="seg-btn ${tab === "skills" ? "is-active" : ""}" data-vocab-tab="skills">\u{1F5C2}\uFE0F \uC720\uD615</button>
        <button type="button" class="seg-btn ${tab === "review" ? "is-active" : ""}" data-vocab-tab="review">\u{1F501} \uC624\uB298 \uBCF5\uC2B5 (${lists.review.length})</button>
        <button type="button" class="seg-btn ${tab === "new" ? "is-active" : ""}" data-vocab-tab="new">\u2728 \uC0C8 \uB2E8\uC5B4 (${lists.new.length})</button>
        <button type="button" class="seg-btn ${tab === "weak" ? "is-active" : ""}" data-vocab-tab="weak">\u26A0\uFE0F \uCDE8\uC57D (${lists.weak.length})</button>
        <button type="button" class="seg-btn ${tab === "mine" ? "is-active" : ""}" data-vocab-tab="mine">\u{1F4D2} \uB0B4 \uB2E8\uC5B4\uC7A5 (${custom.length})</button>
      </div>

      ${tab === "skills" ? `<section class="card">
              <h2>Vocabulary Skill</h2>
              ${skills.length ? `<ul class="knowledge-list">
                      ${skills.map(
      (s) => `
                        <li>
                          <div class="knowledge-label">
                            <span>${escapeHtml(s.label)}</span>
                            <span class="muted">${s.count}\uBB38\uD56D</span>
                          </div>
                          <button type="button" class="btn btn-ghost btn-mini" data-practice-skill="${escapeHtml(
        s.id
      )}">\uC5F0\uC2B5 \uC2DC\uC791</button>
                        </li>`
    ).join("")}
                    </ul>` : '<p class="muted">Vocabulary \uBB38\uC81C\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
            </section>` : ""}

      ${tab === "mine" ? `<section class="card">
              <h2>\uB0B4 \uB2E8\uC5B4\uC7A5</h2>
              ${custom.length ? `<ul class="knowledge-list">
                      ${custom.map(
      (w) => `
                        <li>
                          <div class="knowledge-label">
                            <span><strong>${escapeHtml(w.word)}</strong>${w.meaning ? ` \u2014 ${escapeHtml(w.meaning)}` : ""}</span>
                          </div>
                          <button type="button" class="btn btn-ghost btn-mini" data-word-detail="${escapeHtml(
        w.id
      )}">\uC0C1\uC138</button>
                        </li>`
    ).join("")}
                    </ul>` : '<p class="muted">\uBB38\uC81C \uD574\uC124\uC5D0\uC11C \u300C\uB0B4 \uB2E8\uC5B4\uC7A5\uC5D0 \uCD94\uAC00\u300D\uB85C \uB2E8\uC5B4\uB97C \uBAA8\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>'}
            </section>` : ""}

      ${["review", "new", "weak"].includes(tab) ? `<div id="vocab-stage" class="vocab-stage" data-tab="${escapeHtml(tab)}">
              ${queue.length ? renderVocabCard(queue[0].word, 0, queue.length, queue[0].mastery) : renderEmpty(tab)}
            </div>` : ""}
    </section>
  `;
  }
  function renderWordDetail(word) {
    const aiOn = getAiStatus(getState().settings).on;
    const sources = word.sourceQuestionIds || [];
    return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-vocab-tab="mine">\u2190 \uB0B4 \uB2E8\uC5B4\uC7A5</button>
        <div>
          <p class="eyebrow">Word Detail</p>
          <h1>${escapeHtml(word.word)}</h1>
          <p class="muted">${escapeHtml(word.meaning || "\uB73B\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.")}</p>
        </div>
      </header>
      <section class="card">
        <p><strong>\uD559\uC2B5 \uC0C1\uD0DC</strong> \xB7 ${escapeHtml(word.status || "saved")}</p>
        ${sources.length ? `<p class="muted small">\uCD9C\uCC98 \uBB38\uC81C: ${sources.map((id) => escapeHtml(id)).join(", ")}</p>` : ""}
        ${(word.examples || []).length ? `<h3>\uC608\uBB38</h3><ul class="example-list">${(word.examples || []).map((ex) => `<li>${escapeHtml(ex)}</li>`).join("")}</ul>` : ""}
        ${(word.collocations || []).length ? `<h3>\uD568\uAED8 \uC678\uC6B8 \uD45C\uD604</h3><ul class="vocab-mini-list">${(word.collocations || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
        ${aiOn ? `<button type="button" class="btn btn-primary" id="ai-word-explain" data-word="${escapeHtml(
      word.word
    )}" data-meaning="${escapeHtml(word.meaning || "")}">AI\uC5D0\uAC8C \uC124\uBA85 \uB4E3\uAE30</button>
               <div id="ai-word-result" class="ai-thread" hidden></div>` : '<p class="muted small">AI\uB97C \uC5F0\uACB0\uD558\uBA74 \uC774 \uD45C\uD604\uC5D0 \uB300\uD55C \uCD94\uAC00 \uC124\uBA85\uC744 \uB4E4\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>'}
      </section>
    </section>`;
  }
  function renderEmpty(tab) {
    const msg = {
      review: ["\uC624\uB298 \uBCF5\uC2B5\uD560 \uB2E8\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", "\uC0C8 \uB2E8\uC5B4\uB97C \uD559\uC2B5\uD558\uAC70\uB098 \uB098\uC911\uC5D0 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694."],
      new: ["\uBAA8\uB4E0 \uB2E8\uC5B4\uB97C \uD55C \uBC88 \uC774\uC0C1 \uD559\uC2B5\uD588\uC2B5\uB2C8\uB2E4.", "\uCDE8\uC57D \uB2E8\uC5B4\uB098 \uBCF5\uC2B5 \uD0ED\uC744 \uD655\uC778\uD574 \uBCF4\uC138\uC694."],
      weak: ["\uCDE8\uC57D \uB2E8\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", "\u300C\uBAB0\uB77C\uC694\u300D\u300C\uD5F7\uAC08\uB824\uC694\u300D\uACB0\uACFC\uAC00 \uC313\uC774\uBA74 \uC774\uACF3\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4."]
    }[tab] || ["\uD45C\uC2DC\uD560 \uB2E8\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", ""];
    return `<div class="empty-state card">
    <p class="empty-title">${msg[0]}</p>
    <p class="muted">${msg[1]}</p>
  </div>`;
  }
  function renderVocabCard(word, index, total, mastery) {
    return `
    <article class="card vocab-card" data-word-id="${escapeHtml(word.id)}" data-index="${index}">
      <div class="card-header-row">
        <span class="muted">${index + 1} / ${total}</span>
        ${mastery ? `<span class="status-pill">${escapeHtml(mastery.status || "learning")} \xB7 fam ${escapeHtml(
      mastery.familiarity || 0
    )}</span>` : '<span class="status-pill">\uC2E0\uADDC</span>'}
      </div>
      <h2 class="vocab-word">${escapeHtml(word.word)}</h2>
      <p class="vocab-meaning">${escapeHtml(word.meaning)}</p>
      <ul class="example-list">
        ${(word.examples || []).map((ex) => `<li>${escapeHtml(ex)}</li>`).join("")}
      </ul>
      <div class="vocab-actions" role="group" aria-label="\uD559\uC2B5 \uACB0\uACFC">
        <button type="button" class="btn btn-success" data-vocab-result="known">\uC54C\uC544\uC694</button>
        <button type="button" class="btn btn-warning" data-vocab-result="unsure">\uD5F7\uAC08\uB824\uC694</button>
        <button type="button" class="btn btn-danger-soft" data-vocab-result="unknown">\uBAB0\uB77C\uC694</button>
      </div>
    </article>
  `;
  }
  function bindVocabulary(root, params = {}) {
    const tab = params.tab || "skills";
    root.querySelector('[data-nav="teps"]')?.addEventListener("click", () => navigate("teps"));
    root.querySelectorAll("[data-vocab-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("vocabulary", { tab: btn.getAttribute("data-vocab-tab") });
      });
    });
    root.querySelectorAll("[data-practice-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("practice-quiz", {
          section: "vocabulary",
          count: "5",
          mode: "practice"
        });
      });
    });
    root.querySelectorAll("[data-word-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("vocabulary", {
          tab: "detail",
          wordId: btn.getAttribute("data-word-detail")
        });
      });
    });
    root.querySelector("#ai-word-explain")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const word = btn.getAttribute("data-word");
      const meaning = btn.getAttribute("data-meaning") || "";
      const box = root.querySelector("#ai-word-result");
      setLoading(btn, true, "\uC124\uBA85 \uC911\u2026");
      try {
        const res = await askAiTutor({
          settings: getState().settings,
          context: {
            section: "vocabulary",
            question: `Explain the expression "${word}"${meaning ? ` (${meaning})` : ""} for a TEPS 327 adult learner.`,
            answer: meaning,
            explanation: "",
            targetScore: getState().settings?.targetScore || 327
          },
          userMessage: `"${word}"\uB97C TEPS \uD559\uC2B5\uC790\uC5D0\uAC8C \uC9E7\uACE0 \uBA85\uD655\uD558\uAC8C \uC124\uBA85\uD574 \uC8FC\uC138\uC694. \uC608\uBB38 1~2\uAC1C \uD3EC\uD568.`,
          action: "word-explain",
          useCache: true,
          questionId: `vocab:${word}`
        });
        if (box) {
          box.hidden = false;
          box.innerHTML = `<div class="ai-msg ai-msg-assistant"><strong>Tutor</strong><p></p></div>`;
          box.querySelector("p").textContent = res.text;
        }
      } catch (err) {
        showToast(err.message || "AI \uC124\uBA85\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      } finally {
        setLoading(btn, false);
      }
    });
    if (!["review", "new", "weak"].includes(tab)) return;
    const lists = getVocabLists();
    let queue = listForTab(tab, lists);
    let index = 0;
    const stage = root.querySelector("#vocab-stage");
    if (!stage) return;
    const bindCard = () => {
      stage.querySelectorAll("[data-vocab-result]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const result = btn.getAttribute("data-vocab-result");
          const card = stage.querySelector(".vocab-card");
          const wordId = card?.getAttribute("data-word-id");
          const item = queue[index];
          if (!item?.word) return;
          try {
            await saveVocabResult(item.word.id || wordId, result);
            index += 1;
            if (index >= queue.length) {
              stage.innerHTML = `<div class="empty-state card">
              <p class="empty-title">\uC774 \uC138\uC158\uC758 \uB2E8\uC5B4\uB97C \uBAA8\uB450 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.</p>
              <button type="button" class="btn btn-secondary" data-vocab-tab="${escapeHtml(
                tab
              )}">\uBAA9\uB85D\uC73C\uB85C</button>
            </div>`;
              stage.querySelector("[data-vocab-tab]")?.addEventListener("click", () => {
                navigate("vocabulary", { tab });
              });
              showToast("\uB2E8\uC5B4 \uD559\uC2B5\uC744 \uAE30\uB85D\uD588\uC2B5\uB2C8\uB2E4.", "success");
              return;
            }
            const next = queue[index];
            stage.innerHTML = renderVocabCard(next.word, index, queue.length, next.mastery);
            bindCard();
          } catch (err) {
            showToast(err.message || "\uC800\uC7A5 \uC2E4\uD328", "error");
          }
        });
      });
    };
    bindCard();
  }

  // js/mock.js
  var mockSession = null;
  var mockCleanup = null;
  function renderMock() {
    const full = getFullTePSStatus();
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Assessment</p>
          <h1>\u{1F4DD} \uBAA8\uC758\uACE0\uC0AC</h1>
          <p class="muted page-lead">\uD604\uC7AC \uC704\uCE58\uB97C \uD655\uC778\uD558\uACE0 \uBAA9\uD45C\uAE4C\uC9C0\uC758 Gap\uC744 \uCE21\uC815\uD569\uB2C8\uB2E4.</p>
        </div>
      </header>

      <div class="area-grid">
        <article class="card">
          <h2>\u26A1 Mini TEPS</h2>
          <p class="card-copy">\uBE60\uB978 \uD604\uC7AC \uC0C1\uD0DC \uD655\uC778\uC6A9 \uC9E7\uC740 \uC9C4\uB2E8\uC785\uB2C8\uB2E4.</p>
          <ul class="bullet-list">
            <li>\uAC00\uB2A5 \uC2DC \uC57D ${TEPS_CONFIG.mini.preferredTotal}\uBB38\uD56D / ${TEPS_CONFIG.mini.durationMinutes}\uBD84</li>
            <li>\uBB38\uC81C\uC740\uD589 \uADDC\uBAA8\uC5D0 \uB530\uB77C \uBB38\uD56D \uC218 \uC790\uB3D9 \uC870\uC815</li>
            <li>\uC2DC\uD5D8 \uC911 \uD574\uC124\xB7\uC815\uB2F5 \uD45C\uC2DC \uC5C6\uC74C</li>
          </ul>
          <div class="section-actions">
            <button type="button" class="btn btn-primary" data-mock="mini">\uC2DC\uC791\uD558\uAE30</button>
          </div>
        </article>

        <article class="card">
          <h2>\u{1F3C1} Full TEPS</h2>
          <p class="card-copy">\uC2E4\uC804\uD615 \uBAA8\uC758\uACE0\uC0AC \uC5D4\uC9C4 \uAD6C\uC870\uC785\uB2C8\uB2E4.</p>
          <ul class="meta-list">
            <li><strong>${TEPS_CONFIG.full.totalQuestions}\uBB38\uD56D</strong></li>
            <li><strong>${TEPS_CONFIG.full.durationMinutes}\uBD84</strong></li>
            <li>\uC2E4\uC804\uD615 \xB7 \uC911\uAC04 \uD574\uC124 \uC5C6\uC74C</li>
          </ul>
          ${full.ok ? `<div class="section-actions"><button type="button" class="btn btn-secondary" data-mock="full">\uC2DC\uC791\uD558\uAE30</button></div>` : `<p class="callout">\u{1F4E6} \uD604\uC7AC Full TEPS\uB97C \uAD6C\uC131\uD560 \uBB38\uC81C\uC740\uD589\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4.</p>
                 <ul class="bullet-list">${Object.entries(full.missing).map(
      ([s, m]) => `<li>${escapeHtml(s)}: \uD544\uC694 ${m.need} \xB7 \uBCF4\uC720 ${m.have} \xB7 \uBD80\uC871 ${m.lack}</li>`
    ).join("")}</ul>
                 <p class="muted small">\uC804\uCCB4 \uD544\uC694 ${full.totalNeed} \xB7 \uD604\uC7AC \uBCF4\uC720 ${full.totalHave}</p>`}
        </article>
      </div>
    </section>
  `;
  }
  function bindMock(root) {
    root.querySelectorAll("[data-mock]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("mock-guide", { type: btn.getAttribute("data-mock") });
      });
    });
  }
  function renderMockGuide(params = {}) {
    const type = params.type === "full" ? "full" : "mini";
    const isFull = type === "full";
    const full = getFullTePSStatus();
    const resume = loadMockSessionSnapshot();
    const resumeMode = isFull ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;
    return `
    <section class="page">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="mock">\u2190 \uBAA8\uC758\uACE0\uC0AC</button>
        <div>
          <p class="eyebrow">\uC2DC\uD5D8 \uC548\uB0B4</p>
          <h1>${isFull ? "Full TEPS" : "Mini TEPS"}</h1>
        </div>
      </header>
      <section class="card">
        <h2>\uC2DC\uC791 \uC804 \uC548\uB0B4</h2>
        ${isFull ? `<ul class="bullet-list">
                <li>\uCD1D ${TEPS_CONFIG.full.totalQuestions}\uBB38\uD56D / ${TEPS_CONFIG.full.durationMinutes}\uBD84</li>
                <li>\uC2DC\uD5D8 \uC911 \uC815\uB2F5\xB7\uD574\uC124\xB7\uC624\uB2F5 \uC6D0\uC778\uC744 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</li>
                <li>\uC74C\uC6D0\uC774 \uC5C6\uB294 Listening\uC740 \uD559\uC2B5\uC6A9 Transcript\uB85C \uC81C\uACF5\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</li>
              </ul>
              ${full.ok ? "" : `<div class="empty-inline"><p>\uD604\uC7AC Full TEPS\uB97C \uAD6C\uC131\uD560 \uBB38\uC81C\uC740\uD589\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uBB38\uC81C\uC740\uD589 Import \uD6C4 \uC774\uC6A9\uD558\uC138\uC694.</p></div>`}` : `<ul class="bullet-list">
                <li>\uC601\uC5ED \uADE0\uD615 \uC0D8\uD50C\uB85C \uD604\uC7AC \uC0C1\uD0DC\uB97C \uCD94\uC815\uD569\uB2C8\uB2E4.</li>
                <li>\uACB0\uACFC\uB294 <strong>\uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58</strong>\uC774\uBA70 \uACF5\uC2DD TEPS \uC131\uC801\uC774 \uC544\uB2D9\uB2C8\uB2E4.</li>
                <li>Demo \uBB38\uD56D\uB9CC \uC788\uC744 \uACBD\uC6B0 \uC2E0\uB8B0\uB3C4\uAC00 \uB0AE\uAC8C \uD45C\uC2DC\uB429\uB2C8\uB2E4.</li>
              </ul>`}
        <div class="btn-row wrap">
          ${!isFull || full.ok ? `<button type="button" class="btn btn-primary" id="mock-start">${isFull ? "Full TEPS \uC2DC\uC791" : "Mini TEPS \uC2DC\uC791"}</button>` : ""}
          ${resume && resume.mode === resumeMode ? `<button type="button" class="btn btn-secondary" id="mock-resume">\uC774\uC5B4\uD558\uAE30</button>` : ""}
        </div>
      </section>
    </section>
  `;
  }
  function bindMockGuide(root, params = {}) {
    const type = params.type === "full" ? "full" : params.type || "mini";
    root.querySelector('[data-nav="mock"]')?.addEventListener("click", () => navigate("mock"));
    root.querySelector("#mock-start")?.addEventListener("click", () => {
      mockSession = null;
      navigate("mock-exam", { type });
    });
    root.querySelector("#mock-resume")?.addEventListener("click", () => {
      navigate("mock-exam", { type, resume: "1" });
    });
  }
  function createMockSession(type) {
    const mode = type === "full" ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;
    const pool = getQuestionPool();
    if (type === "full") {
      const status = getFullTePSStatus();
      if (!status.ok) return { error: "insufficient", status };
      const questions = buildBalancedSet(pool, TEPS_CONFIG.full.sections, {
        knowledgeMap: getState().knowledgeMap
      });
      return {
        session: createSession({
          mode,
          questions,
          title: "Full TEPS",
          meta: { type: "full" }
        })
      };
    }
    const built = buildMiniQuestions();
    if (!built.questions.length) {
      return { error: "empty" };
    }
    const sectionsPresent = new Set(built.questions.map((q) => q.section));
    const partial = !sectionsPresent.has("reading") || !sectionsPresent.has("listening") || built.questions.length < TEPS_CONFIG.mini.preferredTotal;
    return {
      session: createSession({
        mode,
        questions: built.questions,
        title: partial ? "Mini TEPS (\uBD80\uBD84 \uC9C4\uB2E8)" : "Mini TEPS",
        meta: {
          type: "mini",
          partialDiagnosis: partial,
          sectionsPresent: [...sectionsPresent],
          ...built.meta
        }
      })
    };
  }
  function renderMockExam(params = {}) {
    const type = params.type === "full" ? "full" : "mini";
    const mode = type === "full" ? PRACTICE_MODES.fullMock : PRACTICE_MODES.miniMock;
    if (params.resume === "1") {
      const snap = loadMockSessionSnapshot();
      if (snap?.questions?.length && snap.mode === mode) {
        mockSession = snap;
      }
    }
    if (!mockSession || mockSession.mode !== mode) {
      const created = createMockSession(type);
      if (created.error === "insufficient") {
        return `<section class="page"><div class="empty-state card">
        <p class="empty-title">Full TEPS \uBB38\uC81C\uC740\uD589 \uBD80\uC871</p>
        <p class="muted">\uD544\uC694\uD55C \uC601\uC5ED\uBCC4 \uBB38\uD56D\uC744 \uCC44\uC6B4 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.</p>
        <button type="button" class="btn btn-secondary" data-nav="mock">\uBAA8\uC758\uACE0\uC0AC\uB85C</button>
      </div></section>`;
      }
      if (created.error || !created.session?.questions?.length) {
        return `<section class="page"><div class="empty-state card">
        <p class="empty-title">\uC2DC\uD5D8\uC744 \uAD6C\uC131\uD560 \uBB38\uC81C\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.</p>
        <p class="muted">\uCD5C\uC18C ${TEPS_CONFIG.mini.minQuestions}\uBB38\uD56D \uC774\uC0C1\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4. (\uD604\uC7AC Demo \uBB38\uD56D \uCD94\uAC00 \uC608\uC815 \uAD6C\uC870)</p>
        <button type="button" class="btn btn-secondary" data-nav="mock">\uBAA8\uC758\uACE0\uC0AC\uB85C</button>
      </div></section>`;
      }
      mockSession = created.session;
      try {
        if (sessionStorage.getItem("tepscrew:diagnosisFlag") === "1") {
          mockSession.title = "Quick Diagnosis";
          mockSession.meta = { ...mockSession.meta || {}, type: "diagnosis" };
        }
      } catch {
      }
      startQuestionTimer(mockSession);
      saveMockSessionSnapshot(mockSession);
    }
    const total = mockSession.questions.length;
    const duration = type === "full" ? TEPS_CONFIG.full.durationMinutes : TEPS_CONFIG.mini.durationMinutes;
    return `
    <section class="page quiz-page mock-engine" data-engine="mock" data-type="${type}">
      <header class="quiz-header card">
        <div>
          <p class="eyebrow">${escapeHtml(mockSession.title)}</p>
          <h1 id="mock-section-label">\uC2DC\uD5D8 \uC9C4\uD589</h1>
          <p class="muted small">\uAD8C\uC7A5 ${duration}\uBD84 \xB7 \uC815\uB2F5/\uD574\uC124 \uBE44\uD45C\uC2DC \xB7 \uD559\uC2B5\uC6A9</p>
        </div>
        <div class="quiz-meta">
          <span id="mock-progress">1 / ${total}</span>
          <span class="timer" id="mock-timer" aria-live="off">00:00</span>
        </div>
      </header>

      <button type="button" class="btn btn-secondary btn-block" id="toggle-nav" aria-expanded="false">
        \uBB38\uC81C \uBC88\uD638 (Answer Sheet)
      </button>
      <div class="mock-nav card" id="mock-nav" hidden></div>

      <article class="card quiz-body" id="mock-body"></article>

      <div class="quiz-sticky-footer mock-footer">
        <button type="button" class="btn btn-ghost" id="mock-exit">\uB098\uAC00\uAE30</button>
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" id="mock-prev">\uC774\uC804</button>
          <button type="button" class="btn btn-secondary" id="mock-next">\uB2E4\uC74C</button>
          <button type="button" class="btn btn-primary" id="mock-submit-all">\uC81C\uCD9C</button>
        </div>
      </div>
    </section>
  `;
  }
  function paintMock(root) {
    const session = mockSession;
    const q = getCurrentQuestion(session);
    if (!q) return;
    const sectionLabel = (q.section || "").replace(/^./, (c) => c.toUpperCase());
    root.querySelector("#mock-section-label").textContent = sectionLabel || "\uC2DC\uD5D8 \uC9C4\uD589";
    root.querySelector("#mock-progress").textContent = `${session.currentIndex + 1} / ${session.questions.length}`;
    const selected = session.answers[q.id]?.selectedAnswer;
    const passage = getPassageText(q);
    root.querySelector("#mock-body").innerHTML = `
    ${q.section === "listening" ? `<div class="listening-toolbar">
            <p class="badge badge-soft">\uD559\uC2B5\uC6A9 Transcript \xB7 \uC2E4\uC81C TEPS \uC74C\uC6D0\uC774 \uC544\uB2D9\uB2C8\uB2E4</p>
            ${passage && typeof window.speechSynthesis !== "undefined" ? `<button type="button" class="btn btn-secondary btn-mini" id="mock-tts">\uD559\uC2B5\uC6A9 \uC74C\uC131 \uB4E3\uAE30</button>` : ""}
          </div>` : ""}
    <div class="passage reading-prose ${passage ? "" : "is-empty"}">${passage ? escapeHtml(passage).replace(/\n/g, "<br>") : '<span class="muted">\uC9C0\uBB38 \uC5C6\uC74C</span>'}</div>
    <h2 class="quiz-question">${escapeHtml(q.question)}</h2>
    <div class="choice-list" role="radiogroup" aria-label="\uC120\uD0DD\uC9C0">
      ${q.choices.map(
      (c, i) => `
        <button type="button" class="choice-btn ${selected === i ? "is-selected" : ""}"
          role="radio" aria-checked="${selected === i}" data-choice="${i}">
          <span class="choice-key">${choiceLetter(i)}</span>
          <span>${escapeHtml(c)}</span>
        </button>`
    ).join("")}
    </div>
  `;
    paintNav(root);
    root.querySelector("#mock-tts")?.addEventListener("click", (e) => {
      if (!passage || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(passage);
      u.lang = "en-US";
      u.rate = 0.92;
      const btn = e.currentTarget;
      btn.disabled = true;
      u.onend = () => {
        btn.disabled = false;
      };
      u.onerror = () => {
        btn.disabled = false;
      };
      window.speechSynthesis.speak(u);
    });
    root.querySelectorAll("#mock-body .choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = Number(btn.dataset.choice);
        const prev = session.answers[q.id];
        const responseTime = Math.max(
          1,
          Math.round((Date.now() - (session.questionStartedAt || Date.now())) / 1e3)
        );
        setSelectedAnswer(session, q.id, choice);
        session.answers[q.id] = {
          ...session.answers[q.id],
          responseTime: prev?.responseTime || responseTime,
          section: q.section,
          type: q.type
        };
        saveMockSessionSnapshot(session);
        paintMock(root);
      });
    });
  }
  function paintNav(root) {
    const nav = root.querySelector("#mock-nav");
    if (!nav) return;
    nav.innerHTML = `
    <div class="nav-grid" role="navigation" aria-label="\uBB38\uC81C \uBC88\uD638">
      ${mockSession.questions.map((q, i) => {
      const answered = mockSession.answers[q.id]?.selectedAnswer != null;
      const current = i === mockSession.currentIndex;
      return `<button type="button" class="nav-dot ${answered ? "is-answered" : ""} ${current ? "is-current" : ""}" data-goto="${i}" aria-label="\uBB38\uC81C ${i + 1}${answered ? " \uC751\uB2F5\uB428" : " \uBBF8\uC751\uB2F5"}${current ? " \uD604\uC7AC" : ""}">${i + 1}</button>`;
    }).join("")}
    </div>
  `;
    nav.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mockSession.currentIndex = Number(btn.dataset.goto);
        startQuestionTimer(mockSession);
        saveMockSessionSnapshot(mockSession);
        paintMock(root);
      });
    });
  }
  function bindMockExam(root) {
    root.querySelector('[data-nav="mock"]')?.addEventListener("click", () => navigate("mock"));
    if (!root.querySelector(".mock-engine") || !mockSession) return;
    let seconds = 0;
    const timerEl = root.querySelector("#mock-timer");
    const timer = setInterval(() => {
      seconds += 1;
      if (timerEl) timerEl.textContent = formatTimer(seconds);
    }, 1e3);
    mockCleanup = () => clearInterval(timer);
    root._quizCleanup = mockCleanup;
    root.querySelector("#toggle-nav")?.addEventListener("click", () => {
      const nav = root.querySelector("#mock-nav");
      const btn = root.querySelector("#toggle-nav");
      const open = nav.hidden;
      nav.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    root.querySelector("#mock-prev")?.addEventListener("click", () => {
      if (mockSession.currentIndex > 0) {
        mockSession.currentIndex -= 1;
        startQuestionTimer(mockSession);
        saveMockSessionSnapshot(mockSession);
        paintMock(root);
      }
    });
    root.querySelector("#mock-next")?.addEventListener("click", () => {
      if (mockSession.currentIndex < mockSession.questions.length - 1) {
        mockSession.currentIndex += 1;
        startQuestionTimer(mockSession);
        saveMockSessionSnapshot(mockSession);
        paintMock(root);
      }
    });
    root.querySelector("#mock-exit")?.addEventListener("click", () => {
      if (window.confirm(
        "\uC2DC\uD5D8\uC744 \uC885\uB8CC\uD558\uBA74 \uD604\uC7AC \uB2F5\uC548\uC774 \uC81C\uCD9C\uB418\uC9C0 \uC54A\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC885\uB8CC\uD560\uAE4C\uC694?"
      )) {
        destroyMockEngine();
        navigate("mock");
      }
    });
    root.querySelector("#mock-submit-all")?.addEventListener("click", async () => {
      const left = unansweredCount(mockSession);
      if (left > 0) {
        const ok = window.confirm(`\uBBF8\uC751\uB2F5 \uBB38\uC81C\uAC00 ${left}\uAC1C \uC788\uC2B5\uB2C8\uB2E4. \uADF8\uB798\uB3C4 \uC81C\uCD9C\uD560\uAE4C\uC694?`);
        if (!ok) return;
      }
      await finalizeMock(seconds);
    });
    paintMock(root);
  }
  async function finalizeMock(elapsedSeconds = 0) {
    const session = mockSession;
    if (!session) return;
    session.questions.forEach((q) => {
      const a = session.answers[q.id];
      if (!a || a.selectedAnswer == null) {
        session.answers[q.id] = {
          questionId: q.id,
          selectedAnswer: null,
          correct: false,
          responseTime: a?.responseTime || 0,
          submitted: true,
          section: q.section,
          type: q.type
        };
        return;
      }
      a.correct = a.selectedAnswer === q.answer;
      a.correctAnswer = q.answer;
      a.submitted = true;
    });
    const attempts = buildAttemptList(session).map((a) => ({
      ...a,
      correct: a.selectedAnswer != null ? a.selectedAnswer === a.correctAnswer : false
    }));
    for (const q of session.questions) {
      const a = session.answers[q.id];
      if (a?.selectedAnswer == null) continue;
      try {
        await persistQuestionAttempt({
          session,
          question: q,
          selectedAnswer: a.selectedAnswer,
          correct: a.correct,
          responseTime: a.responseTime || 0
        });
      } catch {
      }
    }
    const estimation = estimateTepsScore(attempts, session.questions);
    const summary = await persistSessionSummary(session, {
      title: session.title,
      score: estimation.score
    });
    const { bySection } = summarizeAttempts(attempts);
    const gapInfo = computeGapPriorities({
      accuracyBySection: estimation.accuracyBySection,
      knowledgeMap: getState().knowledgeMap,
      attempts
    });
    const target = getState().settings?.targetScore ?? 327;
    let isDiagnosis = false;
    try {
      isDiagnosis = sessionStorage.getItem("tepscrew:diagnosisFlag") === "1";
    } catch {
      isDiagnosis = session.meta?.type === "diagnosis";
    }
    const isPartial = !!session.meta?.partialDiagnosis;
    const allowScore = !isDiagnosis && !isPartial && estimation.canEstimate;
    const mockRecord = {
      id: uid("mock"),
      type: isDiagnosis ? "diagnosis" : session.meta?.type || "mini",
      title: isDiagnosis ? "Quick Diagnosis" : session.title,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: session.sessionId,
      totalQuestions: session.questions.length,
      correctCount: attempts.filter((a) => a.correct).length,
      accuracy: summary.accuracy,
      score: allowScore ? estimation.score : null,
      scoreConfidence: estimation.confidence?.level || "low",
      confidenceLabel: estimation.confidence?.label || "\uB0AE\uC74C",
      confidenceMessage: isDiagnosis ? "\uC9C4\uB2E8 \uACB0\uACFC\uB294 \uD559\uC2B5 \uC2DC\uC791 \uC704\uCE58\uB97C \uC815\uD558\uAE30 \uC704\uD55C \uCC38\uACE0\uC6A9\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uC810\uC218\uAC00 \uC544\uB2D9\uB2C8\uB2E4." : isPartial ? "\uC774\uBC88 Mini TEPS\uB294 Vocabulary / Grammar \uC911\uC2EC \uBD80\uBD84 \uC9C4\uB2E8\uC785\uB2C8\uB2E4. \uC804\uCCB4 TEPS \uC608\uC0C1\uC810\uC218\uB294 \uC0B0\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." : estimation.confidence?.message || "",
      scores: estimation.scores,
      accuracyBySection: estimation.accuracyBySection,
      weaknesses: gapInfo.topSkills.slice(0, 5).map((w) => `${w.section}-${w.skill}`),
      targetGap: allowScore && estimation.score != null ? Math.max(0, target - estimation.score) : null,
      elapsedSeconds,
      demoHeavy: estimation.demoHeavy || session.questions.every((q) => q.source === "demo"),
      partialDiagnosis: isPartial,
      gapInfo,
      bySection
    };
    try {
      await saveMockResult(mockRecord);
    } catch (err) {
      showToast(err.message || "\uBAA8\uC758\uACE0\uC0AC \uC800\uC7A5 \uC2E4\uD328", "warning");
    }
    let resultPayload = { kind: "mock", ...mockRecord, attempts, questions: session.questions };
    try {
      resultPayload = await maybeAttachDiagnosis(resultPayload) || resultPayload;
    } catch {
    }
    setLastSessionResult(resultPayload);
    clearMockSessionSnapshot();
    destroyMockEngine();
    navigate("mock-result");
  }
  function renderMockResult() {
    const result = getLastSessionResult();
    if (!result || result.kind !== "mock") {
      return `<section class="page"><div class="empty-state card">
      <p class="empty-title">\uBAA8\uC758\uACE0\uC0AC \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <button type="button" class="btn btn-primary" data-nav="mock">\uBAA8\uC758\uACE0\uC0AC\uB85C</button>
    </div></section>`;
    }
    const target = getState().settings?.targetScore ?? 327;
    const sectionHtml = Object.entries(result.bySection || {}).filter(([, s]) => s.total > 0).map(([section, s]) => {
      const acc = Math.round(s.correct / s.total * 100);
      const avgTime = s.total ? Math.round(s.time / s.total) : 0;
      return `<div class="section-result">
        <div class="card-header-row">
          <strong>${escapeHtml(section)}</strong>
          <span>${s.correct}/${s.total} \xB7 ${acc}%</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${acc}%"></div></div>
        <p class="muted small">\uD3C9\uADE0 ${avgTime}\uCD08</p>
      </div>`;
    }).join("");
    const slowest = Object.entries(result.bySection || {}).filter(([, s]) => s.total).sort((a, b) => b[1].time / b[1].total - a[1].time / a[1].total)[0];
    const tops = result.gapInfo?.topSkills || [];
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">${escapeHtml(result.title || "Mock")} \uACB0\uACFC</p>
          <h1>${result.type === "diagnosis" ? "\uC9C4\uB2E8 \uACB0\uACFC" : "\uACB0\uACFC \uBD84\uC11D"}</h1>
          ${result.demoHeavy ? '<span class="badge badge-demo">Demo \uBB38\uC81C \uAE30\uBC18 \uD559\uC2B5 \uACB0\uACFC</span>' : ""}
        </div>
      </header>

      ${result.type === "diagnosis" && result.diagnosis ? `<section class="card">
              <h2>\uCD94\uCC9C \uC2DC\uC791 \uB2E8\uACC4</h2>
              <p class="score-flow">${escapeHtml(result.diagnosis.recommendedStart)}</p>
              <ul class="bullet-list">
                ${Object.entries(result.diagnosis.levels || {}).map(
      ([k, v]) => `<li><strong>${escapeHtml(k)}</strong> \u2014 ${escapeHtml(v)}</li>`
    ).join("")}
              </ul>
              <p class="callout">\uC815\uD655\uD55C TEPS \uC810\uC218\uB97C \uC0B0\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Today Plan\uACFC Foundation \uC6B0\uC120\uC21C\uC704\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.</p>
              <div class="btn-row wrap">
                <button type="button" class="btn btn-primary" data-nav="foundation">\uAE30\uCD08\uD559\uC2B5 \uC2DC\uC791</button>
                <button type="button" class="btn btn-secondary" data-nav="home">\uD648\uC73C\uB85C</button>
              </div>
            </section>` : ""}

      <section class="card">
        <p class="eyebrow">\uD559\uC2B5\uC6A9 \uCD94\uC815 \xB7 \uACF5\uC2DD TEPS \uC131\uC801 \uC544\uB2D8</p>
        <div class="score-grid">
          <div class="score-cell accent-cell">
            <span class="label">\uC608\uC0C1 TEPS</span>
            <strong class="score-value accent-text">${result.score == null ? "\uCE21\uC815 \uB370\uC774\uD130 \uBD80\uC871" : escapeHtml(result.score)}</strong>
            ${result.score != null ? `<p class="muted small">\uC2E0\uB8B0\uB3C4: ${escapeHtml(
      result.confidenceLabel || "\uB0AE\uC74C"
    )}</p>` : ""}
          </div>
          <div class="score-cell">
            <span class="label">\uC815\uB2F5\uB960</span>
            <strong class="score-value">${escapeHtml(result.accuracy)}%</strong>
            <p class="muted small">${result.correctCount}/${result.totalQuestions}</p>
          </div>
          <div class="score-cell">
            <span class="label">\uBAA9\uD45C / Gap</span>
            <strong class="score-value">${escapeHtml(target)}${result.targetGap != null ? ` / ${result.targetGap}` : " / \u2014"}</strong>
          </div>
        </div>
        <p class="callout">${escapeHtml(
      result.confidenceMessage || "\uC5F0\uC2B5 \uACB0\uACFC \uAE30\uBC18\uC758 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uC131\uC801\uC774 \uC544\uB2D9\uB2C8\uB2E4."
    )}</p>
      </section>

      <section class="card">
        <h2>\uC601\uC5ED\uBCC4 \uACB0\uACFC</h2>
        <div class="stack-lg">${sectionHtml}</div>
        ${slowest ? `<p class="muted">\uAC00\uC7A5 \uC2DC\uAC04\uC774 \uC624\uB798 \uAC78\uB9B0 \uC601\uC5ED: <strong>${escapeHtml(
      slowest[0]
    )}</strong></p>` : ""}
      </section>

      <section class="card gap-card">
        <h2>327 Gap Analysis</h2>
        <div class="score-grid">
          <div class="score-cell"><span class="label">\uC608\uC0C1</span><strong class="score-value">${result.score ?? "\u2014"}</strong></div>
          <div class="score-cell accent-cell"><span class="label">\uBAA9\uD45C</span><strong class="score-value accent-text">${escapeHtml(
      target
    )}</strong></div>
          <div class="score-cell"><span class="label">Gap</span><strong class="score-value">${result.targetGap ?? "\u2014"}</strong></div>
        </div>
        <h3>\uC6B0\uC120 \uBCF4\uC644 \uC601\uC5ED</h3>
        <ol class="priority-list">
          ${tops.length ? tops.slice(0, 3).map(
      (t, i) => `<li><strong>${i + 1}. ${escapeHtml(t.section)} \u2014 ${escapeHtml(
        t.label || t.skill
      )}</strong>
                      <span class="priority-tag">${escapeHtml(
        result.gapInfo.sectionPriorities?.find((s) => s.section === t.section)?.level || "\uB192\uC74C"
      )}</span></li>`
    ).join("") : '<li class="muted">\uC544\uC9C1 \uC6B0\uC120\uC21C\uC704 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.</li>'}
        </ol>
        <h3>327\uC744 \uD5A5\uD55C \uB2E4\uC74C \uD559\uC2B5</h3>
        <ul class="bullet-list">
          ${tops.slice(0, 3).map(
      (t) => `<li>${escapeHtml(t.section)} \xB7 ${escapeHtml(t.label || t.skill)} \uC9D1\uC911 \uD6C8\uB828</li>`
    ).join("") || "<li>327 Target \uD6C8\uB828\uC73C\uB85C \uCDE8\uC57D\uC810\uC744 \uBCF4\uC644\uD558\uC138\uC694.</li>"}
        </ul>
        <button type="button" class="btn btn-primary" data-nav="practice-quiz" data-target327="1">327 \uC9D1\uC911\uD6C8\uB828 \uC2DC\uC791</button>
      </section>

      <div class="btn-row wrap">
        <button type="button" class="btn btn-secondary" data-nav="my-teps">My TEPS</button>
        <button type="button" class="btn btn-ghost" data-nav="home">\uD648\uC73C\uB85C</button>
      </div>
    </section>
  `;
  }
  function bindMockResult(root) {
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.getAttribute("data-nav");
        const params = {};
        if (btn.dataset.target327) {
          params.target327 = "1";
          params.count = "8";
          params.mode = "target327";
        }
        navigate(page, params);
      });
    });
  }
  function destroyMockEngine() {
    if (typeof mockCleanup === "function") mockCleanup();
    mockCleanup = null;
    mockSession = null;
  }
  function renderDiagnosis() {
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Quick Diagnosis</p>
          <h1>\uCCAB \uC9C4\uB2E8</h1>
          <p class="muted">\uACF5\uC2DD \uC810\uC218 \uC608\uCE21\uC774 \uC544\uB2C8\uB77C, \uC5B4\uB290 \uC601\uC5ED\uBD80\uD130 \uACF5\uBD80\uD560\uC9C0 \uD310\uB2E8\uD569\uB2C8\uB2E4.</p>
        </div>
      </header>
      <section class="card">
        <ul class="bullet-list">
          <li>\uAC00\uB2A5\uD558\uBA74 \uC601\uC5ED\uBCC4 Demo \uBB38\uD56D\uC744 \uACE8\uACE0\uB8E8 \uCD9C\uC81C\uD569\uB2C8\uB2E4.</li>
          <li>\uBB38\uD56D\uC774 \uBD80\uC871\uD55C \uC601\uC5ED\uC740 \u300C\uB370\uC774\uD130 \uBD80\uC871\u300D\uC73C\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4.</li>
          <li>\uACB0\uACFC\uB294 Foundation / TEPS Entry \uCD94\uCC9C\uC5D0 \uD65C\uC6A9\uB429\uB2C8\uB2E4.</li>
        </ul>
        <button type="button" class="btn btn-primary" id="start-diagnosis">\uC9C4\uB2E8 \uC2DC\uC791</button>
      </section>
    </section>
  `;
  }
  function bindDiagnosis(root) {
    root.querySelector("#start-diagnosis")?.addEventListener("click", () => {
      navigate("mock-exam", { type: "mini", diagnosis: "1" });
      try {
        sessionStorage.setItem("tepscrew:diagnosisFlag", "1");
      } catch {
      }
    });
  }
  async function maybeAttachDiagnosis(result) {
    let flag = false;
    try {
      flag = sessionStorage.getItem("tepscrew:diagnosisFlag") === "1";
      sessionStorage.removeItem("tepscrew:diagnosisFlag");
    } catch {
      flag = result?.type === "diagnosis";
    }
    if (!flag && result?.type !== "diagnosis") return result;
    const levels = {};
    Object.entries(result.bySection || {}).forEach(([section, s]) => {
      if (!s.total) {
        levels[section] = "\uB370\uC774\uD130 \uBD80\uC871";
        return;
      }
      const acc = s.correct / s.total;
      if (acc >= 0.7) levels[section] = "\uAE30\uBCF8\uAE30 \uC788\uC74C";
      else if (acc >= 0.4) levels[section] = "\uBCF4\uC644 \uD544\uC694";
      else levels[section] = "\uAE30\uCD08 \uBD80\uC871";
    });
    ["listening", "vocabulary", "grammar", "reading"].forEach((s) => {
      if (!levels[s]) levels[s] = "\uB370\uC774\uD130 \uBD80\uC871";
    });
    const diagnosis = {
      recommendedStart: "Foundation + TEPS Entry",
      levels,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updateProfile({
      diagnosisCompleted: true,
      diagnosis,
      currentStage: "foundation"
    });
    const next = {
      ...result,
      type: "diagnosis",
      title: "Quick Diagnosis",
      diagnosis
    };
    try {
      await saveMockResult({
        ...next,
        id: next.id || `diag-${Date.now()}`
      });
    } catch {
    }
    return next;
  }

  // js/foundation.js
  var STATUS_LABEL = {
    completed: "\uC644\uB8CC",
    in_progress: "\uD559\uC2B5 \uC911",
    recommended: "\uCD94\uCC9C",
    not_started: "\uBBF8\uD559\uC2B5"
  };
  var PASS_SCORE = 70;
  function lessonStatus(lesson, progress) {
    if (progress?.status === "completed") return "completed";
    if (progress?.status === "in_progress") return "in_progress";
    if (lesson.status === "recommended") return "recommended";
    return progress?.status || lesson.status || "not_started";
  }
  function getLesson(id) {
    return (getState().content.foundation?.lessons || []).find((l) => l.id === id);
  }
  function categoryProgress(lessons, foundationProgress, categoryId) {
    const subset = lessons.filter((l) => l.category === categoryId);
    const done = subset.filter((l) => foundationProgress[l.id]?.status === "completed").length;
    return { total: subset.length, done };
  }
  function renderFoundation(params = {}) {
    const { content, foundationProgress } = getState();
    const data = content.foundation;
    if (!data) {
      return `<section class="page"><div class="empty-state"><p>\uAE30\uCD08\uD559\uC2B5 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p></div></section>`;
    }
    const lessons = data.lessons || [];
    const filter = params.category || "all";
    const completed = lessons.filter((l) => foundationProgress[l.id]?.status === "completed").length;
    const pct = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
    const categories = data.categories || [];
    const next = getNextFoundationLesson(lessons, foundationProgress);
    const wrongItems = collectFoundationWrongChecks(lessons, foundationProgress);
    const filtered = filter === "all" ? lessons : lessons.filter((l) => l.category === filter);
    return `
    <section class="page foundation-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Foundation</p>
          <h1>\u{1F9F1} \uAE30\uCD08\uD559\uC2B5</h1>
          <p class="muted page-lead">\uBC30\uC6B0\uAE30 \u2192 \uBBF8\uB2C8 \uD034\uC988 \u2192 \uC624\uB2F5 \uBCF5\uC2B5\uC73C\uB85C \uC601\uC5B4 \uAE30\uBCF8\uAE30\uB97C \uC313\uC2B5\uB2C8\uB2E4.</p>
        </div>
      </header>

      <section class="card">
        <div class="card-header-row">
          <h2>\u{1F4CA} \uC804\uCCB4 \uC9C4\uD589\uB960</h2>
          <span class="accent-text">${completed}/${lessons.length} \xB7 ${pct}%</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p class="muted small">\uD559\uC2B5\uC6A9 \uAE30\uCD08 \uCF54\uC2A4\uC785\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uAE30\uCD9C\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p>
      </section>

      ${next ? `<section class="card foundation-next">
              <p class="eyebrow">\uB2E4\uC74C\uC5D0 \uD560 Lesson</p>
              <h2>${escapeHtml(next.title)}</h2>
              <p class="muted">\uC57D ${escapeHtml(next.estimatedMinutes || 12)}\uBD84 \xB7 Lesson ${String(
      next.order
    ).padStart(2, "0")}</p>
              <div class="btn-row wrap">
                <button type="button" class="btn btn-primary" data-nav="lesson" data-id="${escapeHtml(
      next.id
    )}">\uC774\uC5B4\uC11C \uD559\uC2B5</button>
                <button type="button" class="btn btn-secondary" data-nav="lesson-quiz" data-id="${escapeHtml(
      next.id
    )}">\uBBF8\uB2C8 \uD034\uC988</button>
              </div>
            </section>` : ""}

      <section class="foundation-filters" aria-label="\uAE30\uCD08 \uC601\uC5ED \uD544\uD130">
        <button type="button" class="filter-chip ${filter === "all" ? "is-active" : ""}" data-filter="all">\uC804\uCCB4</button>
        ${categories.map((c) => {
      const cp = categoryProgress(lessons, foundationProgress, c.id);
      return `<button type="button" class="filter-chip ${filter === c.id ? "is-active" : ""}" data-filter="${escapeHtml(c.id)}">${escapeHtml(c.title)}
              <span class="muted">${cp.done}/${cp.total}</span></button>`;
    }).join("")}
      </section>

      ${wrongItems.length ? `<section class="card">
              <h2>\u{1F501} \uAE30\uCD08 \uC624\uB2F5 \uBCF5\uC2B5</h2>
              <p class="muted">\uD2C0\uB9B0 \uD655\uC778\uBB38\uC81C ${wrongItems.length}\uBB38\uD56D</p>
              <button type="button" class="btn btn-secondary" id="foundation-review-start">\uC624\uB2F5 \uB2E4\uC2DC \uD480\uAE30</button>
            </section>` : ""}

      <section class="card">
        <h2>\u{1F4DA} Lesson \uBAA9\uB85D</h2>
        <ul class="lesson-list">
          ${filtered.length ? filtered.map((lesson) => {
      const progress = foundationProgress[lesson.id];
      const status = lessonStatus(lesson, progress);
      const acc = progress?.bestAccuracy ?? progress?.accuracy ?? null;
      return `
              <li>
                <button type="button" class="lesson-row" data-lesson="${escapeHtml(lesson.id)}">
                  <span class="lesson-num">${String(lesson.order).padStart(2, "0")}</span>
                  <span class="lesson-body">
                    <strong>${escapeHtml(lesson.title)}</strong>
                    <span class="muted">\uC57D ${escapeHtml(lesson.estimatedMinutes || 10)}\uBD84${acc != null ? ` \xB7 \uCD5C\uACE0 ${escapeHtml(acc)}%` : ""}</span>
                  </span>
                  <span class="status-pill status-${status}">${STATUS_LABEL[status]}</span>
                </button>
              </li>`;
    }).join("") : '<li class="muted">\uC774 \uC601\uC5ED\uC5D0 Lesson\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</li>'}
        </ul>
      </section>
    </section>
  `;
  }
  function bindFoundation(root) {
    root.querySelectorAll("[data-lesson]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("lesson", { id: btn.getAttribute("data-lesson") });
      });
    });
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.getAttribute("data-nav");
        const params = {};
        if (btn.dataset.id) params.id = btn.dataset.id;
        navigate(page, params);
      });
    });
    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const category = btn.getAttribute("data-filter");
        navigate("foundation", category === "all" ? {} : { category });
      });
    });
    root.querySelector("#foundation-review-start")?.addEventListener("click", () => {
      navigate("lesson-quiz", { id: "review" });
    });
  }
  function renderLesson(params) {
    const { foundationProgress } = getState();
    const lesson = getLesson(params.id);
    if (!lesson) {
      return `
      <section class="page">
        <div class="empty-state">
          <p class="empty-title">Lesson\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
          <button type="button" class="btn btn-secondary" data-nav="foundation">\uAE30\uCD08\uD559\uC2B5\uC73C\uB85C</button>
        </div>
      </section>`;
    }
    const progress = foundationProgress[lesson.id];
    const checks = lesson.checks || [];
    return `
    <section class="page lesson-page" data-lesson-id="${escapeHtml(lesson.id)}">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="foundation">\u2190 \uAE30\uCD08\uD559\uC2B5</button>
        <div>
          <p class="eyebrow">Lesson ${String(lesson.order).padStart(2, "0")}</p>
          <h1>${escapeHtml(lesson.title)}</h1>
        </div>
      </header>

      <section class="card">
        <h2>1. \uD559\uC2B5 \uBAA9\uD45C</h2>
        <ul class="bullet-list">
          ${(lesson.objectives || []).map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
        </ul>
      </section>

      <section class="card">
        <h2>2. \uAC1C\uB150 \uC124\uBA85</h2>
        <p>${escapeHtml(lesson.concept?.summary || "")}</p>
        <ul class="bullet-list">
          ${(lesson.concept?.points || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
        </ul>
      </section>

      <section class="card">
        <h2>3. \uC608\uBB38</h2>
        <div class="example-stack">
          ${(lesson.examples || []).map(
      (ex) => `
            <article class="example-card">
              <p class="example-en">${escapeHtml(ex.en)}</p>
              <p class="muted">${escapeHtml(ex.ko)}</p>
              ${ex.structure ? `<span class="structure-tag">${escapeHtml(ex.structure)}</span>` : ""}
            </article>`
    ).join("")}
        </div>
      </section>

      ${lesson.category === "sentence" || lesson.category === "grammar" ? `<section class="card">
        <h2>4. \uBB38\uC7A5 \uAD6C\uC870 \uBCF4\uAE30</h2>
        <div class="structure-board" aria-label="\uBB38\uC7A5 \uAD6C\uC870">
          <div class="structure-block">S<span>\uC8FC\uC5B4</span></div>
          <div class="structure-plus">+</div>
          <div class="structure-block">V<span>\uB3D9\uC0AC</span></div>
          <div class="structure-plus">+</div>
          <div class="structure-block">O / C<span>\uBAA9\uC801\uC5B4\xB7\uBCF4\uC5B4</span></div>
        </div>
      </section>` : ""}

      <section class="card complete-card">
        <h2>\uBBF8\uB2C8 \uD034\uC988</h2>
        <p class="muted">\uD655\uC778\uBB38\uC81C ${checks.length}\uBB38\uD56D \xB7 70% \uC774\uC0C1\uC774\uBA74 Lesson \uC644\uB8CC</p>
        ${progress?.bestAccuracy != null ? `<p class="muted small">\uCD5C\uACE0 \uAE30\uB85D ${escapeHtml(progress.bestAccuracy)}%${progress.status === "completed" ? " \xB7 \uC644\uB8CC\uB428" : ""}</p>` : ""}
        <div class="btn-row wrap">
          <button type="button" class="btn btn-primary" data-nav="lesson-quiz" data-id="${escapeHtml(
      lesson.id
    )}">\uBBF8\uB2C8 \uD034\uC988 \uC2DC\uC791</button>
          <button type="button" class="btn btn-secondary" data-nav="foundation">\uBAA9\uB85D\uC73C\uB85C</button>
        </div>
      </section>
    </section>
  `;
  }
  function bindLesson(root) {
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.getAttribute("data-nav");
        const params = {};
        if (btn.dataset.id) params.id = btn.dataset.id;
        navigate(page, params);
      });
    });
  }
  function buildReviewQuiz() {
    const { content, foundationProgress } = getState();
    const items = collectFoundationWrongChecks(content.foundation?.lessons || [], foundationProgress);
    return {
      id: "review",
      title: "\uAE30\uCD08 \uC624\uB2F5 \uBCF5\uC2B5",
      order: 0,
      checks: items.map((it) => ({
        ...it.check,
        _lessonId: it.lessonId
      }))
    };
  }
  function renderLessonQuiz(params) {
    const isReview = params.id === "review";
    const lesson = isReview ? buildReviewQuiz() : getLesson(params.id);
    if (!lesson || !(lesson.checks || []).length) {
      return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">${isReview ? "\uBCF5\uC2B5\uD560 \uC624\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." : "\uD034\uC988\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>
          <button type="button" class="btn btn-primary" data-nav="foundation">\uAE30\uCD08\uD559\uC2B5\uC73C\uB85C</button>
        </div>
      </section>`;
    }
    return `
    <section class="page foundation-quiz-page" data-lesson-id="${escapeHtml(lesson.id)}" data-mode="${isReview ? "review" : "lesson"}" data-wrong-only="${params.wrongOnly === "1" ? "1" : "0"}">
      <header class="page-header">
        <button type="button" class="btn btn-ghost back-btn" data-nav="${isReview ? "foundation" : "lesson"}" ${isReview ? "" : `data-id="${escapeHtml(lesson.id)}"`}>\u2190 \uB4A4\uB85C</button>
        <div>
          <p class="eyebrow">Mini Quiz</p>
          <h1>${escapeHtml(lesson.title)}</h1>
        </div>
      </header>
      <div id="fq-root" class="card"></div>
    </section>
  `;
  }
  function bindLessonQuiz(root) {
    const page = root.querySelector(".foundation-quiz-page");
    if (!page) {
      root.querySelectorAll("[data-nav]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = btn.getAttribute("data-nav");
          const params = {};
          if (btn.dataset.id) params.id = btn.dataset.id;
          navigate(p, params);
        });
      });
      return;
    }
    const lessonId = page.dataset.lessonId;
    const mode = page.dataset.mode;
    const lesson = mode === "review" ? buildReviewQuiz() : getLesson(lessonId);
    let checks = [...lesson?.checks || []];
    if (page.dataset.wrongOnly === "1" && mode !== "review") {
      const wrongIds = getState().foundationProgress[lessonId]?.wrongCheckIds || [];
      const filtered = checks.filter((c) => wrongIds.includes(c.id));
      if (filtered.length) checks = filtered;
    }
    const fqRoot = root.querySelector("#fq-root");
    let index = 0;
    const results = {};
    let answered = false;
    const renderQ = () => {
      answered = false;
      if (index >= checks.length) {
        renderResult();
        return;
      }
      const q = checks[index];
      const pct = Math.round(index / checks.length * 100);
      fqRoot.innerHTML = `
      <div class="fq-progress">
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p class="muted small">${index + 1} / ${checks.length}</p>
      </div>
      ${q.transcript ? `<details class="fq-transcript"><summary>\uB300\uBCF8 \uBCF4\uAE30</summary><p>${escapeHtml(
        q.transcript
      )}</p></details>` : ""}
      <p class="check-q"><span class="q-num">Q${index + 1}</span> ${escapeHtml(q.question)}</p>
      <div class="choice-list" role="radiogroup">
        ${q.choices.map(
        (c, i) => `
          <button type="button" class="choice-btn" data-choice="${i}">
            <span class="choice-key">${String.fromCharCode(65 + i)}</span>
            <span>${escapeHtml(c)}</span>
          </button>`
      ).join("")}
      </div>
      <div class="check-feedback" id="fq-feedback" hidden></div>
      <div class="btn-row wrap" id="fq-actions" hidden>
        <button type="button" class="btn btn-primary" id="fq-next">\uB2E4\uC74C</button>
      </div>
    `;
      fqRoot.querySelectorAll(".choice-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (answered) return;
          answered = true;
          const choice = Number(btn.dataset.choice);
          const correct = choice === q.answer;
          results[q.id] = correct;
          fqRoot.querySelectorAll(".choice-btn").forEach((b) => {
            b.disabled = true;
            b.classList.remove("is-selected", "is-correct", "is-wrong");
          });
          btn.classList.add("is-selected", correct ? "is-correct" : "is-wrong");
          fqRoot.querySelector(`[data-choice="${q.answer}"]`)?.classList.add("is-correct");
          const feedback = fqRoot.querySelector("#fq-feedback");
          feedback.hidden = false;
          feedback.className = `check-feedback ${correct ? "is-correct" : "is-wrong"}`;
          feedback.textContent = `${correct ? "\uC815\uB2F5\uC785\uB2C8\uB2E4." : "\uB2E4\uC2DC \uD655\uC778\uD574 \uBCF4\uC138\uC694."} ${q.explanation || ""}`;
          fqRoot.querySelector("#fq-actions").hidden = false;
        });
      });
      fqRoot.querySelector("#fq-next")?.addEventListener("click", () => {
        index += 1;
        renderQ();
      });
    };
    async function persistLessonResult(accuracy, wrongCheckIds, completed) {
      if (mode === "review") {
        const byLesson = {};
        checks.forEach((c) => {
          const lid = c._lessonId;
          if (!lid) return;
          if (!byLesson[lid]) byLesson[lid] = [];
          if (results[c.id] === false) byLesson[lid].push(c.id);
        });
        const lessons = getState().content.foundation?.lessons || [];
        for (const lessonMeta of lessons) {
          const prev2 = getState().foundationProgress[lessonMeta.id];
          if (!prev2?.wrongCheckIds?.length) continue;
          const stillWrong = (prev2.wrongCheckIds || []).filter((id) => {
            const q = checks.find((c) => c.id === id);
            if (!q) return true;
            return results[id] === false;
          });
          const nextWrong = stillWrong.filter((id) => results[id] !== true);
          await saveFoundationProgress(lessonMeta.id, {
            ...prev2,
            wrongCheckIds: nextWrong
          });
        }
        return;
      }
      const prev = getState().foundationProgress[lessonId] || {};
      const bestAccuracy = Math.max(prev.bestAccuracy ?? 0, accuracy);
      const attempts = (prev.quizAttempts || 0) + 1;
      await saveFoundationProgress(lessonId, {
        ...prev,
        status: completed ? "completed" : "in_progress",
        completedAt: completed ? (/* @__PURE__ */ new Date()).toISOString() : prev.completedAt,
        accuracy,
        bestAccuracy,
        quizAttempts: attempts,
        wrongCheckIds,
        checkResults: results
      });
    }
    async function renderResult() {
      const total = checks.length;
      const correctCount = Object.values(results).filter(Boolean).length;
      const accuracy = total ? Math.round(correctCount / total * 100) : 0;
      const wrongCheckIds = checks.filter((c) => results[c.id] === false).map((c) => c.id);
      const passed = accuracy >= PASS_SCORE;
      const canComplete = mode !== "review" && passed;
      if (mode === "review") {
        await persistLessonResult(accuracy, wrongCheckIds, false);
      } else {
        await persistLessonResult(accuracy, wrongCheckIds, false);
      }
      await addLearningRecord({
        type: "foundation",
        recordType: "session",
        mode: mode === "review" ? "foundation-review" : "lesson-quiz",
        title: lesson.title,
        detail: `\uBBF8\uB2C8 \uD034\uC988 ${correctCount}/${total} (${accuracy}%)`,
        totalQuestions: total,
        correctCount,
        accuracy
      });
      fqRoot.innerHTML = `
      <div class="fq-result">
        <p class="eyebrow">\uACB0\uACFC</p>
        <p class="score-value display-num">${accuracy}%</p>
        <p class="muted">${correctCount} / ${total} \uC815\uB2F5${passed ? " \xB7 \uC644\uB8CC \uAE30\uC900 \uCDA9\uC871" : ` \xB7 ${PASS_SCORE}% \uC774\uC0C1 \uD544\uC694`}</p>
        ${wrongCheckIds.length ? `<ul class="bullet-list">${wrongCheckIds.map((id) => {
        const q = checks.find((c) => c.id === id);
        return `<li>${escapeHtml(q?.question || id)}</li>`;
      }).join("")}</ul>` : '<p class="muted">\uD2C0\uB9B0 \uBB38\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}
        <div class="btn-row wrap">
          ${wrongCheckIds.length ? `<button type="button" class="btn btn-secondary" id="fq-retry-wrong">\uC624\uB2F5\uB9CC \uB2E4\uC2DC</button>` : ""}
          ${canComplete ? `<button type="button" class="btn btn-primary" id="fq-complete">Lesson \uC644\uB8CC</button>` : mode !== "review" ? `<button type="button" class="btn btn-secondary" data-nav="lesson" data-id="${escapeHtml(
        lessonId
      )}">\uBCF8\uBB38 \uBCF5\uC2B5</button>` : ""}
          <button type="button" class="btn btn-secondary" data-nav="foundation">\uAE30\uCD08\uD559\uC2B5 \uBAA9\uB85D</button>
        </div>
      </div>
    `;
      fqRoot.querySelector("#fq-retry-wrong")?.addEventListener("click", () => {
        if (mode === "review") {
          navigate("lesson-quiz", { id: "review" });
          return;
        }
        navigate("lesson-quiz", { id: lessonId, wrongOnly: "1" });
      });
      fqRoot.querySelector("#fq-complete")?.addEventListener("click", async () => {
        await persistLessonResult(accuracy, wrongCheckIds, true);
        showToast("Lesson\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4.", "success");
        const lessons = getState().content.foundation?.lessons || [];
        const next = getNextFoundationLesson(lessons, getState().foundationProgress);
        if (next && next.id !== lessonId) {
          navigate("lesson", { id: next.id });
        } else {
          navigate("foundation");
        }
      });
      fqRoot.querySelectorAll("[data-nav]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pageName = btn.getAttribute("data-nav");
          const navParams = {};
          if (btn.dataset.id) navParams.id = btn.dataset.id;
          navigate(pageName, navParams);
        });
      });
    }
    root.querySelectorAll(".page-header [data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pageName = btn.getAttribute("data-nav");
        const navParams = {};
        if (btn.dataset.id) navParams.id = btn.dataset.id;
        navigate(pageName, navParams);
      });
    });
    renderQ();
  }

  // js/pages.js
  function renderTeps(params = {}) {
    const { profile, knowledgeMap, questionBank } = getState();
    const counts = {
      listening: questionBank.filter((q) => q.section === "listening").length,
      vocabulary: questionBank.filter((q) => q.section === "vocabulary").length,
      grammar: questionBank.filter((q) => q.section === "grammar").length,
      reading: questionBank.filter((q) => q.section === "reading").length
    };
    const areas = [
      {
        id: "listening",
        title: "\u{1F3A7} Listening",
        desc: counts.listening < 5 ? `\uD604\uC7AC \uBB38\uC81C\uC740\uD589 ${counts.listening}\uBB38\uD56D. \uCD94\uAC00 Pack\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.` : "\uC751\uB2F5\xB7\uB300\uD654\xB7\uB2F4\uD654 \uC720\uD615\uC744 \uCCB4\uACC4\uC801\uC73C\uB85C \uD6C8\uB828\uD569\uB2C8\uB2E4.",
        avg: sectionMasteryAverage(knowledgeMap, "listening"),
        scarce: counts.listening < 5
      },
      {
        id: "vocabulary",
        title: "\u{1F4D7} Vocabulary",
        desc: `Collocation \xB7 Context \xB7 Phrasal Verb \uB4F1 (${counts.vocabulary}\uBB38\uD56D)`,
        avg: sectionMasteryAverage(knowledgeMap, "vocabulary"),
        route: "vocabulary"
      },
      {
        id: "grammar",
        title: "\u{1F9E9} Grammar",
        desc: `\uC218\uC77C\uCE58\xB7\uAD00\uACC4\uC0AC\xB7\uC2DC\uC81C \uB4F1 \uD575\uC2EC \uBB38\uBC95 (${counts.grammar}\uBB38\uD56D)`,
        avg: sectionMasteryAverage(knowledgeMap, "grammar")
      },
      {
        id: "reading",
        title: "\u{1F4D6} Reading",
        desc: counts.reading < 5 ? `\uD604\uC7AC Reading Pack ${counts.reading}\uBB38\uD56D. \uCD94\uAC00 Pack\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.` : "\uC694\uC9C0\xB7\uCD94\uB860\xB7\uBE48\uCE78\xB7\uC77C\uAD00\uC131 \uC720\uD615\uC744 \uC5F0\uC2B5\uD569\uB2C8\uB2E4.",
        avg: sectionMasteryAverage(knowledgeMap, "reading"),
        scarce: counts.reading < 5
      }
    ];
    const focus = params.area || "";
    const grammarSkills = (knowledgeMap?.sections?.grammar || []).slice().sort((a, b) => (a.mastery || 0) - (b.mastery || 0)).slice(0, 8);
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">TEPS Areas</p>
          <h1>\u{1F4D8} TEPS \uD559\uC2B5</h1>
          <p class="muted page-lead">\uB124 \uC601\uC5ED\uC744 \uADE0\uD615 \uC788\uAC8C \uC62C\uB9AC\uBA70 \uBAA9\uD45C \uC810\uC218\uC5D0 \uC811\uADFC\uD569\uB2C8\uB2E4.</p>
        </div>
      </header>
      <div class="area-grid">
        ${areas.map((a) => {
      const lv = levelFromMastery(a.avg);
      return `
          <article class="card area-card ${focus === a.id ? "is-focused" : ""} ${a.scarce ? "is-scarce" : ""}">
            <h2>${escapeHtml(a.title)}</h2>
            <p>${escapeHtml(a.desc)}</p>
            <div class="area-meta">
              <span>${escapeHtml(lv.label)} \xB7 ${Math.round(a.avg)}%</span>
              <span class="muted">Lv.${escapeHtml(profile.level?.[a.id] || lv.level)}</span>
            </div>
            <div class="bar thin"><div class="bar-fill" style="width:${Math.round(
        a.avg
      )}%"></div></div>
            <button type="button" class="btn btn-primary" data-area-start="${escapeHtml(
        a.route || a.id
      )}" ${a.scarce && a.id !== "vocabulary" ? "" : ""}>\uD559\uC2B5 \uC2DC\uC791</button>
          </article>`;
    }).join("")}
      </div>

      <section class="card">
        <h2>\u{1F9E9} Grammar Skill</h2>
        <p class="muted small">\uC219\uB828\uB3C4\uB294 \uCD5C\uADFC \uC815\uB2F5\uB960\xB7\uBC18\uBCF5 \uC131\uACF5\xB7\uD480\uC774\uAE30\uB85D\uC744 \uBC14\uD0D5\uC73C\uB85C \uACC4\uC0B0\uB429\uB2C8\uB2E4. \uACF5\uC2DD TEPS \uD3C9\uAC00\uAC00 \uC544\uB2D9\uB2C8\uB2E4.</p>
        <ul class="knowledge-list">
          ${grammarSkills.map(
      (item) => `
            <li>
              <div class="knowledge-label">
                <span>${escapeHtml(item.label)}</span>
                <span class="muted">${escapeHtml(item.mastery || 0)}%</span>
              </div>
              <div class="bar thin"><div class="bar-fill" style="width:${escapeHtml(
        item.mastery || 0
      )}%"></div></div>
              <button type="button" class="btn btn-ghost btn-mini" data-practice-skill="grammar" data-skill="${escapeHtml(
        item.id
      )}">\uC5F0\uC2B5 \uC2DC\uC791</button>
            </li>`
    ).join("")}
        </ul>
      </section>
    </section>
  `;
  }
  function bindTeps(root) {
    root.querySelectorAll("[data-area-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-area-start");
        if (target === "vocabulary") {
          navigate("vocabulary");
          return;
        }
        navigate("practice-quiz", { section: target, count: "5", mode: "practice" });
      });
    });
    root.querySelectorAll("[data-practice-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("practice-quiz", {
          section: btn.getAttribute("data-practice-skill"),
          count: "5",
          mode: "practice"
        });
      });
    });
  }
  function renderMyTeps() {
    const state2 = getState();
    const summary = getScoreSummary();
    const map = state2.knowledgeMap;
    const mocks = state2.mockTests.filter((m) => m.type !== "diagnosis");
    const scores = mocks.filter((m) => typeof m.score === "number").map((m) => m.score).slice(0, 8).reverse();
    return `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Progress</p>
          <h1>\u{1F4CA} My TEPS</h1>
        </div>
      </header>

      <section class="card">
        <p class="eyebrow">\uD559\uC2B5\uC6A9 \uCD94\uC815 \xB7 \uACF5\uC2DD TEPS \uC131\uC801 \uC544\uB2D8</p>
        <div class="score-grid">
          <div class="score-cell">
            <span class="label">\uBAA9\uD45C\uC810\uC218</span>
            <strong class="score-value accent-text">${escapeHtml(summary.target)}</strong>
          </div>
          <div class="score-cell">
            <span class="label">\uCD5C\uADFC \uC608\uC0C1\uC810\uC218</span>
            <strong class="score-value">${summary.estimated == null ? "\u2014" : escapeHtml(summary.estimated)}</strong>
            ${summary.confidence ? `<p class="muted small">\uC2E0\uB8B0\uB3C4: ${escapeHtml(
      summary.confidence === "low" ? "\uB0AE\uC74C" : summary.confidence === "medium" ? "\uBCF4\uD1B5" : summary.confidence === "high" ? "\uB192\uC74C" : summary.confidence
    )}</p>` : ""}
          </div>
          <div class="score-cell">
            <span class="label">\uCD5C\uACE0\uC810\uC218</span>
            <strong class="score-value">${summary.highest == null ? "\u2014" : escapeHtml(summary.highest)}</strong>
          </div>
          <div class="score-cell">
            <span class="label">\uBAA9\uD45C\uAE4C\uC9C0 Gap</span>
            <strong class="score-value">${summary.gap == null ? "\u2014" : `${escapeHtml(summary.gap)}\uC810`}</strong>
          </div>
        </div>
        ${summary.estimated == null ? `<div class="empty-inline">
                <p>\uC544\uC9C1 \uC608\uC0C1\uC810\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. Mini TEPS\uB85C \uD604\uC7AC \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uBCF4\uC138\uC694.</p>
                <button type="button" class="btn btn-primary" data-nav="mock">\uBAA8\uC758\uACE0\uC0AC\uB85C \uC774\uB3D9</button>
              </div>` : ""}
      </section>

      ${scores.length >= 2 ? `<section class="card">
              <h2>\uC810\uC218 \uBCC0\uD654</h2>
              <p class="score-flow">${scores.map((s) => escapeHtml(s)).join(" \u2192 ")}</p>
              ${renderSparkline(scores)}
              <p class="muted small">\uC5F0\uC2B5 \uACB0\uACFC \uAE30\uBC18 \uD559\uC2B5\uC6A9 \uCD94\uC815\uCE58 \uD750\uB984\uC785\uB2C8\uB2E4.</p>
            </section>` : ""}

      <section class="card">
        <h2>\uC601\uC5ED\uBCC4 \uC131\uCDE8\uB3C4</h2>
        <div class="level-list">
          ${["listening", "vocabulary", "grammar", "reading"].map((key) => {
      const avg = sectionMasteryAverage(map, key);
      const lv = levelFromMastery(avg);
      return `
            <div class="level-row">
              <span>${escapeHtml(key)}</span>
              <div class="bar thin"><div class="bar-fill" style="width:${Math.round(
        avg
      )}%"></div></div>
              <strong>${escapeHtml(lv.label)}</strong>
            </div>`;
    }).join("")}
        </div>
      </section>

      <section class="card">
        <h2>\uCD5C\uADFC \uBAA8\uC758\uACE0\uC0AC \uAE30\uB85D</h2>
        ${mocks.length === 0 ? `<div class="empty-state">
                <p class="empty-title">\uC544\uC9C1 \uBAA8\uC758\uACE0\uC0AC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
                <p class="muted">Mini TEPS\uB97C \uD480\uBA74 \uD604\uC7AC \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
              </div>` : `<ul class="record-list">${mocks.slice(0, 5).map(
      (m) => `<li>
                  <div><strong>${escapeHtml(m.title || m.type)}</strong>
                  <p class="muted">${escapeHtml(formatRelativeTime(m.createdAt))}
                  ${m.scoreConfidence ? ` \xB7 \uC2E0\uB8B0\uB3C4 ${escapeHtml(m.scoreConfidence)}` : ""}</p></div>
                  <strong>${m.score != null ? escapeHtml(m.score) : "\uB370\uC774\uD130 \uBD80\uC871"}</strong>
                </li>`
    ).join("")}</ul>`}
      </section>

      <section class="card">
        <h2>Knowledge Map</h2>
        ${renderKnowledgeMap(map)}
      </section>
    </section>
  `;
  }
  function renderSparkline(scores) {
    if (scores.length < 2) return "";
    const min = Math.min(...scores) - 5;
    const max = Math.max(...scores) + 5;
    const w = 280;
    const h = 64;
    const pts = scores.map((s, i) => {
      const x = i / (scores.length - 1) * w;
      const y = h - (s - min) / (max - min || 1) * (h - 8) - 4;
      return `${x},${y}`;
    }).join(" ");
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="100%" height="64" aria-hidden="true">
    <polyline fill="none" stroke="currentColor" stroke-width="2.5" points="${pts}" />
  </svg>`;
  }
  function renderKnowledgeMap(map) {
    if (!map?.sections) {
      return `<div class="empty-state"><p class="empty-title">Knowledge Map\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p></div>`;
    }
    const sectionTitles = {
      grammar: "Grammar",
      reading: "Reading",
      listening: "Listening",
      vocabulary: "Vocabulary"
    };
    return Object.entries(map.sections).map(([section, items]) => {
      const fallback = KNOWLEDGE_MAP_TEMPLATE[section] || [];
      const list = items?.length ? items : fallback.map((i) => ({ ...i, mastery: 0 }));
      return `
      <div class="knowledge-section">
        <h3>${escapeHtml(sectionTitles[section] || section)}</h3>
        <ul class="knowledge-list">
          ${list.map(
        (item) => `
            <li>
              <div class="knowledge-label">
                <span>${escapeHtml(item.label)}</span>
                <span class="muted">${escapeHtml(item.mastery || 0)}%</span>
              </div>
              <div class="bar thin" role="progressbar" aria-valuenow="${escapeHtml(
          item.mastery || 0
        )}" aria-valuemin="0" aria-valuemax="100">
                <div class="bar-fill" style="width:${escapeHtml(item.mastery || 0)}%"></div>
              </div>
            </li>`
      ).join("")}
        </ul>
      </div>`;
    }).join("");
  }
  function bindMyTeps(root) {
    root.querySelector('[data-nav="mock"]')?.addEventListener("click", () => navigate("mock"));
  }
  function renderNotFound() {
    return `
    <section class="page">
      <div class="empty-state card">
        <p class="empty-title">\uD398\uC774\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
        <p class="muted">\uBA54\uB274\uC5D0\uC11C \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.</p>
        <button type="button" class="btn btn-primary" data-nav="home">\uD648\uC73C\uB85C</button>
      </div>
    </section>
  `;
  }
  function bindNotFound(root) {
    root.querySelector('[data-nav="home"]')?.addEventListener("click", () => navigate("home"));
  }

  // js/guide.js
  function renderBlock(block) {
    if (!block || !block.type) return "";
    switch (block.type) {
      case "h3":
        return `<h3 class="guide-h3">${escapeHtml(block.text || "")}</h3>`;
      case "p":
        return `<p class="guide-p">${escapeHtml(block.text || "")}</p>`;
      case "ul":
        return `<ul class="guide-list">${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      case "ol":
        return `<ol class="guide-list guide-list-ol">${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
      case "callout":
        return `<aside class="guide-callout guide-callout-${escapeHtml(
          block.variant || "notice"
        )}" role="note"><p>${escapeHtml(block.text || "")}</p></aside>`;
      default:
        return "";
    }
  }
  function renderCtas(ctas = []) {
    if (!ctas.length) return "";
    return `
    <div class="guide-cta-row btn-row wrap">
      ${ctas.map(
      (cta) => `
        <button
          type="button"
          class="btn ${cta.primary ? "btn-primary" : "btn-secondary"}"
          data-nav="${escapeHtml(cta.nav || "home")}"
        >${escapeHtml(cta.label || "\uC774\uB3D9")}</button>`
    ).join("")}
    </div>
  `;
  }
  function renderGuide() {
    const guide = getState().content?.guide;
    if (!guide?.sections?.length) {
      return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">\uAC00\uC774\uB4DC\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p>
          <button type="button" class="btn btn-primary" data-nav="home">\uD648\uC73C\uB85C</button>
        </div>
      </section>
    `;
    }
    const sections = guide.sections;
    return `
    <section class="page guide-page">
      <header class="guide-hero">
        <p class="eyebrow">TEPS Crew</p>
        <h1>${escapeHtml(guide.title || "TEPS \uAC00\uC774\uB4DC")}</h1>
        <p class="guide-lede muted">${escapeHtml(guide.lede || "")}</p>
        <nav class="guide-jump" aria-label="\uAC00\uC774\uB4DC \uC139\uC158">
          ${sections.map(
      (s) => `
            <button type="button" class="guide-jump-chip" data-jump="${escapeHtml(
        s.id
      )}">${escapeHtml(s.navLabel || s.title)}</button>`
    ).join("")}
        </nav>
      </header>

      ${guide.officialUrl ? `<aside class="guide-official">
              <p>\uC2DC\uD5D8 \uC77C\uC815\xB7\uC811\uC218\xB7\uADDC\uC815\uC740 \uACF5\uC2DD \uC548\uB0B4\uB97C \uB530\uB985\uB2C8\uB2E4.</p>
              <a class="btn btn-secondary" href="${escapeHtml(
      guide.officialUrl
    )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
      guide.officialLabel || "\uACF5\uC2DD TEPS \uC0AC\uC774\uD2B8"
    )}</a>
            </aside>` : ""}

      ${sections.map(
      (section) => `
        <section
          class="guide-section"
          id="guide-section-${escapeHtml(section.id)}"
          aria-labelledby="guide-heading-${escapeHtml(section.id)}"
        >
          <h2 id="guide-heading-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
          <div class="guide-body">
            ${(section.blocks || []).map(renderBlock).join("")}
          </div>
          ${renderCtas(section.ctas)}
        </section>`
    ).join("")}
    </section>
  `;
  }
  function bindGuide(root) {
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate(btn.getAttribute("data-nav") || "home");
      });
    });
    root.querySelectorAll("[data-jump]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-jump");
        const target = root.querySelector(`#guide-section-${CSS.escape(id || "")}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // scripts.js
  var currentCleanup = null;
  function renderNav(activePage) {
    const items = getNavItems();
    const side = document.getElementById("side-nav");
    const bottom = document.getElementById("bottom-nav");
    const primaryBottom = /* @__PURE__ */ new Set(["home", "foundation", "practice", "review", "my-teps"]);
    const practicePages = /* @__PURE__ */ new Set(["practice", "practice-quiz", "practice-result", "target-preview"]);
    const mockPages = /* @__PURE__ */ new Set(["mock", "mock-guide", "mock-exam", "mock-result", "diagnosis"]);
    const foundationPages = /* @__PURE__ */ new Set(["foundation", "lesson", "lesson-quiz"]);
    side.innerHTML = items.map((item) => {
      const active = activePage === item.id || item.id === "foundation" && foundationPages.has(activePage) || item.id === "teps" && activePage === "vocabulary" || item.id === "practice" && practicePages.has(activePage) || item.id === "mock" && mockPages.has(activePage);
      return `
      <a class="nav-link ${active ? "is-active" : ""}" href="${item.href}" data-nav-id="${item.id}" ${active ? 'aria-current="page"' : ""}>
        <span class="nav-emoji" aria-hidden="true">${item.emoji || ""}</span>
        <span class="nav-label">${item.label}</span>
      </a>`;
    }).join("");
    const bottomItems = items.filter((i) => primaryBottom.has(i.id));
    bottom.innerHTML = bottomItems.map((item) => {
      const active = activePage === item.id || item.id === "foundation" && activePage === "lesson" || item.id === "practice" && practicePages.has(activePage);
      return `
      <a class="bottom-link ${active ? "is-active" : ""}" href="${item.href}" ${active ? 'aria-current="page"' : ""}>
        <span class="nav-emoji" aria-hidden="true">${item.emoji || ""}</span>
        <span>${item.label}</span>
      </a>`;
    }).join("");
  }
  function updateTopTarget() {
    const el = document.querySelector(".topbar-target");
    const target = getState().settings?.targetScore ?? 327;
    const ai = getAiStatus(getState().settings);
    if (el) el.textContent = `\uBAA9\uD45C ${target} \xB7 ${ai.label}`;
  }
  function closeMobileSidebar() {
    document.getElementById("sidebar")?.classList.remove("is-open");
    document.getElementById("menu-toggle")?.setAttribute("aria-expanded", "false");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (backdrop) backdrop.hidden = true;
  }
  function setupChrome() {
    const toggle = document.getElementById("menu-toggle");
    const backdrop = document.getElementById("sidebar-backdrop");
    toggle?.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      const open = !sidebar.classList.contains("is-open");
      sidebar.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      backdrop.hidden = !open;
    });
    backdrop?.addEventListener("click", closeMobileSidebar);
    document.querySelectorAll(".side-nav, .bottom-nav").forEach((nav) => {
      nav.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (link) closeMobileSidebar();
      });
    });
  }
  function renderPage(route) {
    if (typeof currentCleanup === "function") {
      try {
        currentCleanup();
      } catch {
      }
      currentCleanup = null;
    }
    if (route.page !== "practice-quiz") destroyPracticeEngine();
    const main = document.getElementById("main-content");
    setPage(route.page, route.params);
    renderNav(route.page);
    updateTopTarget();
    const map = {
      home: [renderDashboard, bindDashboard],
      guide: [renderGuide, bindGuide],
      foundation: [() => renderFoundation(route.params), bindFoundation],
      lesson: [() => renderLesson(route.params), bindLesson],
      "lesson-quiz": [() => renderLessonQuiz(route.params), bindLessonQuiz],
      teps: [() => renderTeps(route.params), bindTeps],
      vocabulary: [
        () => renderVocabulary(route.params),
        (root) => bindVocabulary(root, route.params)
      ],
      practice: [renderPractice, bindPractice],
      "practice-quiz": [() => renderPracticeQuiz(route.params), bindPracticeQuiz],
      "practice-result": [renderPracticeResult, bindPracticeResult],
      "target-preview": [renderTargetPreview, bindTargetPreview],
      mock: [renderMock, bindMock],
      "mock-guide": [
        () => renderMockGuide(route.params),
        (root) => bindMockGuide(root, route.params)
      ],
      "mock-exam": [() => renderMockExam(route.params), bindMockExam],
      "mock-result": [renderMockResult, bindMockResult],
      diagnosis: [renderDiagnosis, bindDiagnosis],
      review: [() => renderReview(route.params), bindReview],
      "my-teps": [renderMyTeps, bindMyTeps],
      settings: [renderSettings, bindSettings],
      "not-found": [renderNotFound, bindNotFound]
    };
    const pair = map[route.page] || map["not-found"];
    const [render, bind] = pair;
    try {
      main.innerHTML = render();
      bind?.(main);
      const quizRoot = main.querySelector(".quiz-page");
      if (quizRoot) {
        currentCleanup = () => {
          quizRoot._quizCleanup?.();
          quizRoot._quizKeyCleanup?.();
        };
      }
      main.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    } catch (err) {
      console.error(err);
      main.innerHTML = `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">\uD654\uBA74\uC744 \uD45C\uC2DC\uD558\uB294 \uC911 \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.</p>
          <p class="muted">${String(err.message || err)}</p>
          <button type="button" class="btn btn-primary" id="go-home">\uD648\uC73C\uB85C</button>
        </div>
      </section>`;
      main.querySelector("#go-home")?.addEventListener("click", () => navigate("home"));
      showToast("\uD654\uBA74 \uB80C\uB354\uB9C1 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", "error");
    }
  }
  async function boot() {
    const statusEl = document.getElementById("boot-status");
    const setBoot = (text) => {
      if (statusEl) statusEl.textContent = text;
    };
    setupChrome();
    setBoot("\uD559\uC2B5 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026");
    try {
      const initPromise = initAppState();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("\uCD08\uAE30\uD654 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.")), 15e3);
      });
      await Promise.race([initPromise, timeoutPromise]);
    } catch (err) {
      console.error(err);
      showToast(
        "\uC77C\uBD80 \uC800\uC7A5\uC18C\uB97C \uCD08\uAE30\uD654\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 \uAE30\uB2A5\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        "warning"
      );
      if (!getState().content?.foundation) {
        document.getElementById("main-content").innerHTML = `
        <section class="page">
          <div class="empty-state card">
            <p class="empty-title">\uC571\uC744 \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
            <p class="muted">\uAC19\uC740 \uD3F4\uB354\uC758 index.html / app.bundle.js / style.css \uAC00 \uD568\uAED8 \uC788\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</p>
            <p class="muted">${String(err.message || err)}</p>
          </div>
        </section>`;
        return;
      }
    }
    startRouter(renderPage);
  }
  boot();
})();
