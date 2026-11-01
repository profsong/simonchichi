# English Quest — 12주 학습 콘텐츠 + Codex 개발 패키지

> **앱 구현 안내 (2026-10-23):** 이 폴더에 Phase 0·1 PWA 구현이 추가되었습니다. 실행·데모·검사 방법은 [README.md](README.md)를 먼저 확인하세요. 아래는 원래 콘텐츠 패키지의 설명이며, 교육 콘텐츠는 계속 검수 전 초안입니다.

**대상:** 중학교 2학년 영어 상위권 학습자. 중등 심화 → 고등 영어 연결 → 고등 입문 독해.

## 이번 확충 결과 (2026-10-23)

- **300개** 고유 영어 표제어 (영어 뜻·한국어 뜻·품사·예문·번역·연어·3개 오답, 내부 레벨 및 학습일 배정).
- **600개** 단어 객관식 (영어→한국어 300, 한국어→영어 300).
- **60개** 구문 객관식 (문장, 문제, 4개 선택지, 정답, 한국어 해설).
- **60개** 독해 지문, **120개** 독해 객관식 (지문 속 실제 근거 인용·한국어 해설).
- **30개** 별도 진단 문제 (단어 12, 구문 10, 독해 8문항+진단 전용 지문 4개).
- **60개** 평일 학습 일정 (12주 × 주 5일; 매일 신규 단어 5개·구문 1개·지문 1개).
- **12개** 주간 보스전 (그 주 학습했던 문항 재활용; 고유 신규 문항은 아님).
- 총 **810개 고유 4지선다 문항**. 보스전에서 재출제한 문항은 중복 산정하지 않음.

**주의:** 콘텐츠 전체가 `reviewStatus: "draft"`입니다. 자동 검사는 구조·중복·정답 위치·근거 인용만 확인했고, 영어 표현의 자연스러움·한국어 번역·의미상 단일 정답·교육적 난이도는 전문가 검토가 필요합니다. Codex로 앱을 개발하는 것과 콘텐츠 검수 완료는 별개입니다.

## 주요 파일

| 경로 | 내용 |
|---|---|
| `src/data/seed-content.json` | **전체 통합 문제은행 및 12주 일정**, 앱 연동용 |
| `src/data/english-quest-question-bank.json` | 문제은행만 분리한 JSON |
| `src/data/curriculum-12weeks.json` | 주차·일일 학습·보스전 배정 |
| `src/data/seed-content.demo-original.json` | 이전 60단어+10구문+6지문 예제 보관 |
| `docs/CONTENT_COUNTS_AND_WORDLIST.md` | 전체 수량과 주차별 300단어 목록 |
| `docs/VOCABULARY_300_REVIEW.md` | 300단어 원문·번역·오답 교사 검토용 |
| `docs/SYNTAX_60_REVIEW.md` | 구문 60문항 검토용 |
| `docs/READINGS_60_REVIEW.md` | 독해 60지문/120문항 검토용 |
| `docs/DIAGNOSTIC_30_REVIEW.md` | 별도 진단평가 검토용 |
| `docs/PRODUCT_SPEC.md` | 전체 앱 기획/학습법/SRS/기술 명세 |
| `AGENTS.md` | Codex 개발 규칙 |
| `CODEX_START_PROMPT.md` | 앱을 **처음부터** 구현할 Codex 프롬프트 |
| `CODEX_CONTENT_IMPORT_PROMPT.md` | 기존 Codex 앱에 이번 콘텐츠를 통합할 프롬프트 |
| `content_src/*.psv` | 사람이 편집 가능한 문제 원본 자료 |
| `tools/build_content_bank.py` | 원본 자료 → 통합 JSON 재빌드 |
| `tools/validate_content_bank.py` | 독립적인 구조 검증 |
| `tools/make_review_docs.py` | 교사용 검수 마크다운 생성 |

## 사용 방법

### A. 아직 앱을 만들지 않았다면

1. 압축을 풀고 프로젝트 폴더를 VS Code 또는 터미널에서 열기.
2. 선택적으로 콘텐츠 검사: `python3 tools/validate_content_bank.py`.
3. `codex` 실행 후 `CODEX_START_PROMPT.md`의 영어 지시문 입력.
4. Codex가 앱을 구현한 뒤 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` 확인.
5. iPhone Safari에서 실제 PWA를 열어 홈 화면 설치, 오프라인, 데이터 백업 기능 검증.

### B. 기존에 만든 앱이 있다면

`src/data/seed-content.json` 등 데이터 파일을 프로젝트에 복사하고 `CODEX_CONTENT_IMPORT_PROMPT.md`를 Codex에 전달. **학습 기록이 남아 있는 경우 기존 ID 보존과 마이그레이션을 먼저 수행**해야 합니다.

### C. 어휘나 지문을 편집하려면

1. `content_src/*.psv`의 원본 수정 (필드 구분자 `|`는 입력하지 않기).
2. `python3 tools/build_content_bank.py`.
3. `python3 tools/validate_content_bank.py`.
4. `python3 tools/make_review_docs.py`.
5. 수정된 항목을 영어 교사 등에게 **개별 검수**받고 통과한 기록에만 `approved` 적용. 원본 재생성 시 승인 상태를 덮어쓸 수 있으므로 실제 서비스는 별도 review ledger를 유지해야 함.

## 코드/교육 관련 안전장치

- 문제는 자체 창작·실습용이며 EBS/수능/유료 앱 공식 콘텐츠라고 주장하지 않음.
- 본 패키지는 **학습 앱 완제품이 아닌 콘텐츠·명세서·개발 입력 자료**임.
- B1, B2, B3는 자체 내부 레벨로 공인 CEFR 등급을 나타내지 않음.
- 출시 전 미성년자 개인정보 수집 금지, Apple Safari/PWA 실제 테스트 필요.
