# TEPS Crew (텝스크루)

성인 학습자가 영어 기초부터 다시 시작해 **TEPS 327점 이상**을 달성하도록 돕는 개인 학습 웹 애플리케이션입니다.

> 327을 향한 나의 TEPS 학습

## 목적

영어 공부 공백이 긴 성인 사용자가 Foundation부터 TEPS 영역 학습·문제풀이·복습·모의·327 Target까지 한 순환으로 이어가도록 돕습니다.

## 특징

- 로컬 중심 (로그인 / 자체 서버 없음)
- AI는 **선택 기능** — API Key 없이도 핵심 학습 가능
- PC / Tablet / Mobile 반응형
- Foundation · Vocabulary · Grammar · Reading · Listening
- Practice · Review · Knowledge Map · Today 추천
- Mini TEPS / Full TEPS (문제 수 부족 시 안내)
- 327 Target 집중훈련
- AI Tutor (OpenAI / Claude / Gemini)

## 현재 개발 단계

**Phase 3 Final** — Pack 001 문제은행 + AI Provider/Tutor + UX 최종 정리

## AI

설정에서 Provider를 선택하고 API Key를 입력한 뒤 **연결 테스트**로 확인할 수 있습니다.

| Provider | 기본 모델 (변경 가능) |
|----------|----------------------|
| Claude   | `claude-sonnet-4-6`  |
| OpenAI   | `gpt-4o-mini`        |
| Gemini   | `gemini-2.0-flash`   |

- API Key는 브라우저 `localStorage` 또는 `sessionStorage`에만 저장됩니다.
- 공용 PC에서는 Key를 저장하지 마세요.
- **백업 파일에는 API Key가 포함되지 않습니다.**
- AI 호출은 Tutor / 분석 / 유사문제 등 **명시적 클릭**으로만 실행됩니다.
- CORS·네트워크·잘못된 Key 오류가 나면 AI 패널에만 표시되며 기본 학습은 계속됩니다.

## 콘텐츠

내장 Pack은 `data/packs/manifest.json`으로 관리합니다.

- **TEPS Crew Pack 001**: Vocabulary 25 + Grammar 25 (총 50)
- **TEPS Crew Pack 002**: Reading 12 + Listening 10 (총 22)
- JSON이 앱 데이터 원본, `.md`는 사람용 검수본 (이중 Import 하지 않음)
- 출처 표기: `TEPS Crew Practice` (공식 TEPS 기출 아님)
- `file://` 더블클릭 실행을 위해 Pack은 `js/content/embedded.js`에도 등록하고 `build.bat`으로 `app.bundle.js`를 다시 만듭니다

### 문제 Pack 추가 방법

1. `data/packs/TEPS_Crew_Pack_00N.json` 추가
2. `data/packs/manifest.json`의 `packs` 배열에 항목 등록
3. `js/content/embedded.js`에 import / `EMBEDDED` 맵 추가
4. `build.bat` 실행 후 앱을 새로 로드 (Pack Loader가 검증 후 IndexedDB에 seed)

## 데이터

| 데이터 | 저장소 |
|--------|--------|
| 설정, 프로필, (선택) AI Key | `localStorage` / `sessionStorage` |
| 문제은행, 학습기록, 오답, 모의, Knowledge Map, Foundation, 단어, AI 캐시, Pack 메타, 사용자 단어장 | IndexedDB `tepscrew-db` **v3** |

## Backup

설정 → 데이터 관리에서 학습기록·설정을 JSON으로 내보내거나 복원합니다.

- API Key는 백업에서 제외됩니다.
- 내장 Pack 본문 전체 복제 대신 Pack 메타데이터와 사용자 Import 문항을 중심으로 복구합니다.
- 복원 후 builtin Pack은 다시 seed되어 문제 참조가 유지됩니다.

## 실행 방법

### 바로 실행 (권장)

`index.html` 을 **더블클릭**하면 브라우저에서 바로 실행됩니다.  
(`app.bundle.js`, `style.css` 가 같은 폴더에 있어야 합니다.)

코드를 수정한 뒤에는 `build.bat` 을 한 번 실행해 번들을 다시 만드세요.

### 로컬 서버 (선택)

개발 중 모듈 단위로 보고 싶을 때:

```bash
cd tepscrew
python -m http.server 5500
```

또는 `start.bat` 실행 → http://localhost:5500

## 학습 순환

```text
기초 진단 → Foundation → TEPS 영역 학습 → 문제풀이 → 오답 분석
→ 복습 → Knowledge Map → Today 추천 → Mini / Full TEPS
→ 327 Gap → 327 Target → 반복
```

예상점수는 항상 **학습용 예상 TEPS**이며 공식 TEPS 점수가 아닙니다.

## 개발 구조

```
tepscrew/
├── index.html
├── style.css
├── scripts.js
├── README.md
├── data/
│   ├── foundation.json / vocabulary.json / …
│   ├── guide.json
│   └── packs/
│       ├── manifest.json
│       ├── TEPS_Crew_Pack_001.json
│       ├── TEPS_Crew_Pack_001.md
│       └── TEPS_Crew_Pack_002.json
└── js/
    ├── config.js
    ├── db.js / storage.js / state.js
    ├── content/packs.js / embedded.js
    ├── content/skill-taxonomy.js
    ├── ai/
    │   ├── ai-config.js
    │   ├── ai-service.js
    │   ├── ai-tutor-ui.js
    │   └── providers/{openai,anthropic,gemini}.js
    ├── practice.js / review.js / vocabulary.js / mock.js
    ├── recommendation.js / scoring.js / mastery.js
    ├── dashboard.js / settings.js / pages.js
    └── ui/modal.js
```

## Phase 1~2 요약

- Phase 1: 앱 셸, 라우팅, IndexedDB, Demo 콘텐츠, UI
- Phase 2: Practice/Review/Vocab SRS, Today Plan, 327 Target, Mini/Full TEPS, 점수·Gap

Phase 3는 위 구조를 유지한 채 Pack·AI·UX를 최종 고도화했습니다.
