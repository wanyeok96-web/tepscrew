/**
 * TEPS Crew AI configuration
 */

export const AI_CONFIG = {
  defaultProvider: 'claude',
  providers: {
    openai: {
      id: 'openai',
      label: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      testPrompt: 'Reply with exactly: OK',
    },
    claude: {
      id: 'claude',
      label: 'Claude',
      defaultModel: 'claude-sonnet-4-6',
      testPrompt: 'Reply with exactly: OK',
      apiVersion: '2023-06-01',
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      defaultModel: 'gemini-2.0-flash',
      testPrompt: 'Reply with exactly: OK',
    },
  },
  tutor: {
    temperature: 0.4,
    maxTokens: 900,
  },
  cacheTtlMs: 1000 * 60 * 60 * 24 * 7,
};

export const AI_TUTOR_SYSTEM = `너는 TEPS 327점 이상을 목표로 하는 성인 학습자의 개인 영어 튜터다.

정답을 단순히 반복하지 말고 사용자가 왜 틀렸는지(또는 어떻게 더 정확히 풀 수 있는지) 이해하도록 도와라.
영어 공부 공백이 긴 성인 학습자도 이해할 수 있게 설명하라.

필요하면 다음을 단계적으로 설명한다:
1) 문장/지문의 핵심 구조
2) 핵심 어휘/연어
3) 문법 포인트
4) 선택지 차이
5) TEPS식 문제풀이 사고과정

너무 장황하지 않게, 한국어로 명확히 설명한다.
실제 TEPS 공식 기출이라고 주장하지 마라.
학습용 연습 문항/설명임을 존중하라.`;

export const AI_QUICK_ACTIONS = [
  { id: 'simplify', label: '🧩 더 쉽게 설명', prompt: '방금 설명을 더 쉽고 짧게 다시 설명해 주세요.' },
  { id: 'structure', label: '🧱 문장 구조 분석', prompt: '이 문제의 핵심 문장 구조를 분석해 주세요.' },
  { id: 'choices', label: '⚖️ 선택지 비교', prompt: '선택지를 서로 비교해 왜 정답이 맞고 나머지는 안 되는지 설명해 주세요.' },
  { id: 'vocab', label: '📝 핵심 단어 설명', prompt: '이 문제의 핵심 어휘/표현을 예문과 함께 설명해 주세요.' },
  { id: 'similar', label: '➕ 한 문제 더', prompt: 'SIMILAR_QUESTION' },
  { id: 'minilesson', label: '📚 이 개념 다시 배우기', prompt: 'MINI_LESSON' },
];
