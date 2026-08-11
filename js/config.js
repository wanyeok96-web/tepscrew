/**
 * TEPS Crew — shared exam / weight configuration (Phase 2)
 */

export const TEPS_CONFIG = {
  full: {
    totalQuestions: 135,
    durationMinutes: 105,
    sections: {
      listening: 60,
      vocabulary: 30,
      grammar: 30,
      reading: 45,
    },
  },
  mini: {
    preferredTotal: 24,
    durationMinutes: 25,
    /** Preferred counts when bank is large enough */
    sections: {
      listening: 6,
      vocabulary: 5,
      grammar: 5,
      reading: 8,
    },
    /** Minimum total to start a meaningful Mini TEPS */
    minQuestions: 4,
  },
  diagnosis: {
    preferredPerSection: 2,
    minQuestions: 3,
    durationMinutes: 15,
  },
  sectionMaxScores: {
    listening: 240,
    vocabulary: 60,
    grammar: 60,
    reading: 240,
  },
  totalMaxScore: 600,
};

/** Relative importance for recommendation (TEPS weighting inspired) */
export const SECTION_WEIGHTS = {
  listening: 1.0,
  reading: 1.0,
  vocabulary: 0.6,
  grammar: 0.6,
};

export const ERROR_REASONS = [
  { id: 'vocabulary', label: '단어를 몰랐어요' },
  { id: 'structure', label: '문장 구조를 이해하지 못했어요' },
  { id: 'grammar', label: '문법 개념이 부족했어요' },
  { id: 'judgment', label: '내용을 이해했지만 판단을 틀렸어요' },
  { id: 'inference', label: '추론 과정에서 틀렸어요' },
  { id: 'time', label: '시간이 부족했어요' },
  { id: 'mistake', label: '실수했어요' },
  { id: 'unknown', label: '잘 모르겠어요' },
];

export const PRACTICE_MODES = {
  practice: 'practice',
  review: 'review',
  miniMock: 'miniMock',
  fullMock: 'fullMock',
  diagnosis: 'diagnosis',
  lesson: 'lesson',
  target327: 'target327',
};

/** Days to add after vocabulary known streak milestones */
export const VOCAB_KNOWN_INTERVALS = [3, 7, 14, 30];
