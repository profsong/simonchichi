# Phase 0·1 구현 보고

기준일: 2026-10-23 (KST). 실제 iPhone 운영 검증을 제외한 첫 PWA 구현 단계입니다.

## 확인한 초기 상태

초기 폴더에는 제품 명세, 개발 지침, 12주 원본 콘텐츠, 편집용 PSV, Python 생성·검사 도구, 교사 검수용 문서가 있었습니다. React 앱이나 npm 설정은 없었으며 Git 저장소도 초기화되어 있지 않았습니다. 원본 JSON·문항 ID·검수 상태·PSV·교육 문서는 변경하지 않았습니다. `README_FIRST.md`에 새 앱 실행 안내만 추가했습니다.

## 구현한 기능

- 반응형 한국어 화면: 오늘, 모험 지도, 복습함, 성장 기록, 설정. 직접 작성한 SVG 숲·아이콘과 기기 기본 글꼴 사용.
- 12주 일일 배정 기반 퀘스트: due 복습 → 새 단어 카드·객관식 → 구문 → 지문과 독해 두 문제 → 완료. 첫날에는 기존 due 복습이 없습니다.
- 정답 선택 변경, 입력형 회상, 힌트, 정답·오답 해설, 한 번의 재도전, 답변 후 실제 지문 근거 강조.
- 단계별 기억 일정과 서로 다른 날짜의 인식·능동 회상·문맥 성공 구분. 높은 복습 부하에서는 새 단어를 줄이고 미학습 분량을 이월.
- Dexie 트랜잭션으로 진행·답변·힌트·보상 저장. 중복 탭·새로고침·재방문으로 XP를 다시 지급하지 않음.
- 버전·문항·정답·모드·원장 관계·파생 상태를 검증하는 JSON 백업과 원자적 복원. 삭제 전 명시적 UI 확인.
- PWA manifest, 192/512 아이콘, Apple 터치 아이콘, 서비스 워커 캐시, 오프라인 실행 및 업데이트 안내.
- 기기 내 영어 음성이 있는 경우에만 선택적 발음 기능. 밤 테마와 수동 읽기 단계 선택.
- 일반 배포는 승인 콘텐츠만 노출. 개발/데모 빌드에서만 초안 체험을 켤 수 있고, 데모 기록은 별도 DB에 저장.

## 추가·변경한 파일

| 영역           | 파일                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실행·도구      | `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.env.demo`, `.gitignore`, `.prettierignore`, `.prettierrc.json`                             |
| 앱             | `src/main.tsx`, `src/app/App.tsx`, `src/app/useStudyData.ts`, `src/styles/index.css`                                                                                                                                       |
| 화면           | `src/components/Icon.tsx`, `src/components/Forest.tsx`, `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/phases.ts`, `src/features/settings/SettingsScreen.tsx`, `src/features/progress/ProgressScreen.tsx` |
| 순수 학습 로직 | `src/core/types.ts`, `src/core/grading.ts`, `src/core/scheduler.ts`, `src/core/quest-builder.ts`, `src/core/rewards.ts`                                                                                                    |
| 검증·저장      | `src/data/content-schema.ts`, `src/data/catalog.ts`, `src/data/db.ts`, `scripts/validate-content.ts`                                                                                                                       |
| 설치 아이콘    | `scripts/generate-icons.ts`, `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`                                                                        |
| 테스트         | `tests/setup.ts`, `tests/unit/core.test.ts`, `tests/unit/db.test.ts`, `tests/unit/quest-ui.test.tsx`, `tests/e2e/quest.spec.ts`, `tests/e2e/production.spec.ts`, `playwright.config.ts`, `playwright.production.config.ts` |
| 안내           | `README.md`, `README_FIRST.md`, `docs/DECISIONS.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서                                                                                                                            |
| 화면 확인 자료 | `artifacts/screenshots/`의 Chromium·WebKit 모바일 홈/완료, 데스크톱 홈 이미지                                                                                                                                              |

## 검증

실행한 자동 검사 결과입니다. 검수 전 콘텐츠를 승인으로 처리하는 검사는 없습니다.

최종 `npm run format:check`도 통과했습니다. 개발 서버는 `npm run dev`로 `http://localhost:4175`에서 실행 확인했습니다. 기존 기본 포트 5173의 Windows 바인딩 오류(`EACCES`) 때문에 4175를 기본값으로 사용합니다.

| 명령                                                           | 결과                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `python tools/validate_content_bank.py`                        | 통과 — 구조 오류 0, 참고 경고 0                                                                  |
| `npm run validate:content`                                     | 통과 — 전체 수량·ID·참조·선택지·지문 근거 검사                                                   |
| `npm run typecheck`                                            | 통과                                                                                             |
| `npm run lint`                                                 | 통과                                                                                             |
| `npm run test`                                                 | 59개 통과 — 순수 로직·DB·React UI                                                                |
| `npm run build`                                                | 통과 — 일반 배포용 PWA 생성                                                                      |
| `npm run build:demo`                                           | 통과 — 명시적 데모 전환이 있는 PWA 생성                                                          |
| `npx playwright test` (`npm run test:e2e`와 같은 구성)         | Chromium 3개 + WebKit 3개 통과                                                                   |
| `npx playwright test --config playwright.production.config.ts` | 일반 배포에서 Chromium 1개 + WebKit 1개 통과. 동일 실행은 `npm run test:e2e:production`으로 제공 |
| 실제 iPhone Safari / 홈 화면 앱                                | **미실시**                                                                                       |

브라우저 검사는 375px 탐색·키보드 동작·가로 넘침, 전체 퀘스트, 중복 제출, 새로고침, 5단어 다음날 복습, 모드별 기록 분리, 다운로드 백업→초기화→복원, 잘못된 버전 거절, 서비스 워커를 통한 오프라인 전체 퀘스트를 포함합니다. 데스크톱 1440px와 모바일 화면 이미지도 직접 확인했습니다.

빌드에 전체 초안 데이터가 포함되어 초기 JS 크기 경고가 발생합니다(약 1.23MB, gzip 약 290KB). 모든 콘텐츠는 최초 적재 후 로컬 캐시에 남습니다. 일반 학습의 출제·복원 경로에서는 승인 필터를 적용합니다. 이는 콘텐츠의 비공개 암호화 기능이 아닙니다.

## 남은 조건과 다음 단계

1. 모든 원본 교육 콘텐츠는 여전히 `draft`이고 승인 항목은 0개입니다. 현재 앱의 전체 학습 흐름은 개발 데모에서 확인합니다. 자동 검사는 의미상 단일 정답·영어 자연스러움·번역 품질을 승인하지 않습니다.
2. 실제 iPhone에서 HTTPS 설치, 홈 화면 재실행, VoiceOver, 키보드, 오프라인, 다음날 복습, 파일 앱 백업을 [체크리스트](IPHONE_TEST_CHECKLIST.md)로 검증해야 합니다.
3. 다음 범위는 첫 주 콘텐츠의 개별 교육 검수·승인 기록 관리와 실제 iPhone 파일럿입니다. 이후 진단 30문항, 주간 보스전, 지연 회상률·분야별 난도 조절을 이어갑니다.
4. 문맥 적용 어휘 문항이 아직 검수되어 제공되지 않아, 객관식/직접 회상만으로 어휘 숙련 배지를 완료하지 않습니다. 상세 가정은 [결정 기록](DECISIONS.md)에 있습니다.

## 실행과 iPhone 확인

PC에서 `npm install` 후 `npm run dev`. 설정의 **데모 콘텐츠 사용(검수 전)** 을 켜고 오늘 퀘스트를 시작합니다. 같은 Wi-Fi의 iPhone에서는 터미널의 Network 주소로 화면을 확인할 수 있습니다.

설치·오프라인 시험은 별도 체험용으로 `npm run build:demo` → 생성된 `dist/`를 HTTPS 정적 호스팅에 배포 → iPhone Safari에서 주소 열기 → 공유 메뉴의 **홈 화면에 추가** → 설정에서 데모 선택 → **오프라인 준비 완료** 확인 → 비행기 모드에서 학습·새로 열기·백업 복원을 확인합니다. 일반 배포는 `npm run build`를 사용합니다. 외부 배포는 이 작업에서 실행하지 않았습니다.
