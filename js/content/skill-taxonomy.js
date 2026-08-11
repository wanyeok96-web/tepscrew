/**
 * Skill taxonomy & aliases for Pack compatibility
 */

export const SKILL_TAXONOMY = {
  vocabulary: [
    { id: 'context', label: 'Context' },
    { id: 'collocation', label: 'Collocation' },
    { id: 'phrasal-verb', label: 'Phrasal Verb' },
    { id: 'synonym', label: 'Synonym' },
    { id: 'word-form', label: 'Word Form' },
    { id: 'expression', label: 'Expression' },
    { id: 'idiom', label: 'Idiom' },
  ],
  grammar: [
    { id: 'tense', label: '시제' },
    { id: 'agreement', label: '수일치' },
    { id: 'relative', label: '관계사' },
    { id: 'subjunctive', label: '가정법' },
    { id: 'conditional', label: '조건문' },
    { id: 'participle', label: '분사' },
    { id: 'gerund', label: '동명사' },
    { id: 'infinitive', label: '부정사' },
    { id: 'passive', label: '수동태' },
    { id: 'comparison', label: '비교' },
    { id: 'conjunction', label: '접속사' },
    { id: 'pronoun', label: '대명사' },
    { id: 'article', label: '관사' },
    { id: 'preposition', label: '전치사' },
    { id: 'noun-clause', label: '명사절' },
    { id: 'adverbial-clause', label: '부사절' },
    { id: 'inversion', label: '도치' },
    { id: 'parallelism', label: '병렬구조' },
    { id: 'causative', label: '사역' },
    { id: 'sentence-structure', label: '문장구조' },
    { id: 'error-identification', label: '오류 찾기' },
  ],
  reading: [
    { id: 'main-idea', label: 'Main Idea' },
    { id: 'detail', label: 'Detail' },
    { id: 'inference', label: 'Inference' },
    { id: 'blank', label: 'Blank' },
    { id: 'coherence', label: 'Coherence' },
  ],
  listening: [
    { id: 'response', label: 'Response' },
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'detail', label: 'Detail' },
    { id: 'inference', label: 'Inference' },
  ],
};

/** Map raw skill/type strings → canonical skill id */
export const SKILL_ALIASES = {
  'relative-clause': 'relative',
  relativeclause: 'relative',
  relatives: 'relative',
  'subject-verb': 'agreement',
  'subject-verb-agreement': 'agreement',
  agr: 'agreement',
  mainidea: 'main-idea',
  'main_idea': 'main-idea',
  'logical-reasoning': 'inference',
  logicalreasoning: 'inference',
  passives: 'passive',
  toinfinitive: 'infinitive',
  'to-infinitive': 'infinitive',
  gerunds: 'gerund',
  participles: 'participle',
  subjunctives: 'subjunctive',
  blankfill: 'blank',
  'blank-fill': 'blank',
  collocations: 'collocation',
  synonyms: 'synonym',
  'synonym-distinction': 'synonym',
  synonymdistinction: 'synonym',
  expressions: 'expression',
  'colloquial-expression': 'expression',
  colloquialexpression: 'expression',
  colloquial: 'expression',
  contexts: 'context',
  responses: 'response',
  dialogues: 'dialogue',
  details: 'detail',
  coherences: 'coherence',
  inferences: 'inference',
  'phrasal-verbs': 'phrasal-verb',
  phrasalverb: 'phrasal-verb',
  'word-forms': 'word-form',
  wordform: 'word-form',
  idioms: 'idiom',
  'verb-noun-pattern': 'collocation',
  verbnounpattern: 'collocation',
  'verb-pattern': 'collocation',
  'verb-form': 'tense',
  verbform: 'tense',
  'time-reference': 'tense',
  timereference: 'tense',
  'error-identification': 'error-identification',
  erroridentification: 'error-identification',
  'noun-clauses': 'noun-clause',
  'adverbial-clauses': 'adverbial-clause',
  modifier: 'participle',
  structure: 'sentence-structure',
  'sentence-structures': 'sentence-structure',
  countability: 'article',
  parallel: 'parallelism',
  causatives: 'causative',
  conditionals: 'conditional',
  pronouns: 'pronoun',
  articles: 'article',
  prepositions: 'preposition',
  comparisons: 'comparison',
  conjunctions: 'conjunction',
};

export function canonicalizeSkill(section, skill) {
  if (!skill) return null;
  let key = String(skill).trim();
  if (!key) return null;
  key = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/_/g, '-');
  const compact = key.replace(/-/g, '');
  if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
  if (SKILL_ALIASES[compact]) return SKILL_ALIASES[compact];
  return key;
}

export function taxonomyLabels(section) {
  return SKILL_TAXONOMY[section] || [];
}

export function ensureTaxonomyInMap(map) {
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
