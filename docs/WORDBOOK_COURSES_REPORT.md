# 두 단어장 학습 과정 개편 — 0.5.0

> 0.5.0의 역사적 보고서입니다. 현재 복습 보상·XP 구매·백업 스키마 4는 [0.6.0 보고서](AVATAR_ROOM_REPORT.md)와 [사용 안내](USER_GUIDE.md)를 따릅니다.

기준일: 2026-11-01. 중등 심화 300과 수능 영어 2000을 선택하여 바로 학습하도록 개편했습니다. [사용 안내](USER_GUIDE.md) · [회차별 20단어](COURSE_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 제공 기능

| 항목        | 현재 동작                                                                              |
| ----------- | -------------------------------------------------------------------------------------- |
| 두 단어장   | 기존 B1/B2/B3를 중등 심화 300으로 통합, 수능 영어 2000과 함께 표시                     |
| 책 선택     | 오늘 상단·설정의 학습 단어장, 재실행·백업 후 유지                                      |
| 독립 지도   | 중등 15회/3묶음, 수능 100회/20묶음. 한 묶음 5회                                        |
| 한 회차     | 기억 채우기 5 + 뜻 카드 20/뜻 고르기 20 + 구문 2 + 독해 2 = 49단계                     |
| 처음 학습   | 기억 채우기 5개는 미리보기. 답변 24개, 새로 배정한 단어 20개                           |
| 복습 테스트 | 배운 서로 다른 10단어, 객관식 5/첫 글자 입력 5, 이전 오답 가중 추출, 재개 시 목록 유지 |
| 기록        | 책별 회차/세션 독립, 공통 어휘 SRS 공유, 하루 완료 보너스 1회, 중복 XP 방지            |
| 백업        | 스키마 3 export, 1/2/3 import, 정상 이전 demo 파일의 현재 앱 복원                      |
| 일반 실행   | 콘텐츠 준비/데모 토글/읽기 밴드 선택 제거, 두 과정 즉시 사용                           |

사용자의 명시적 수용 정책이 기존 승인 전 차단·5단어/12분 배정보다 우선합니다. 원자료의 `draft`, PDF의 빈 뜻 칸·표제어·행 순서·출처를 바꾸지 않았으며 외부 교사 검수 완료로 표현하지 않습니다. 49단계를 12분에 끝낸다고 약속하지 않고 중단·재개를 제공합니다.

수능의 176개 중복 단어도 100회차에 포함합니다. 사전 목록의 중복 제외 필터는 새 표제어 1,824개를 탐색하는 기능이고 과정 2,000개를 줄이지 않습니다. 기존 60계획과 그 완료 기록은 이전 탐험으로 보존하며 새 15/100회차로 자동 매핑하지 않습니다.

## 콘텐츠와 검토

- 2개 과정·115회·2,300단어 소속(고유 표제어 2,124)·구문 230문항·독해 230지문/230문항.
- 수능 독해 200개는 회차 어휘를 사용하는 원작 상황형 지문으로 57~85단어입니다. 1~50회 100개, 51~75회 50개, 76~100회 50개를 분담 집필하고 저작자가 뜻·정답·설명을 대조했습니다.
- 중등 독해 30개는 기존 원작을 회차에 맞춰 재사용합니다. 전체 본문·정답·근거·설명을 독립적으로 다시 읽고 박물관 입장 조건과 홍수 지문의 대명사 지시 2곳을 새 과정 복사본에서만 정리했습니다. 원문 111~215단어 길이는 유지했습니다.
- 독해 근거 230개 모두 실제 본문에 존재하며 구문/독해 합계에서 회차별 어휘 6개 이상을 사용합니다. Python/Zod 검사는 회차 수·ID·순서·20단어 완전 포함·정답 인덱스·선지 중복·근거·출처를 확인합니다.
- 담당한 76~100회 50개는 각 69~85단어이며 지문별 3개 이상, 두 지문 합계 6개 이상의 회차 어휘를 확인했습니다. 단어 목록을 지문처럼 나열하지 않았습니다.
- 학습 표기는 `vacuum`·`legacy`를 사용하고 원문 `vaccum`·`lagacy`와 출처 ID는 그대로 남깁니다. 인정 철자와 원문 철자를 구분합니다.

검토 범위와 생성 해시는 [content-validation.json](../artifacts/courses/content-validation.json)에 있습니다. 이는 독립 교사의 교육 검수나 모든 다의어의 완전한 설명, 실제 학습자의 난도 적합성 검증을 뜻하지 않습니다.

## 실행한 검사

| 검사                                                                         | 결과                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| `npm run typecheck`, `npm run lint`                                          | 통과                                        |
| `npm run test`                                                               | 139/139 통과(10파일, 최종 실행)             |
| `python tools/build_wordbook_courses.py --check`, `npm run validate:courses` | 최종 생성 115회/230구문/230독해 통과        |
| `npm run test:e2e`                                                           | 일반 빌드 Chromium/WebKit 18/18 통과        |
| `npm run test:e2e:production`                                                | 최종 CSS 포함 일반 빌드 2/2 통과            |
| `npm run build`                                                              | E2E 서버 시작 과정에서 일반 빌드 통과       |
| `npm run android:build`                                                      | 통과, 최종 아티팩트는 아래 기록             |
| Android 업데이트·오프라인                                                    | 기능 APK 5/5 + 최종 CSS APK 재검사 3/3 통과 |
| 실제 Android 휴대폰/iPhone                                                   | 미실시                                      |

브라우저 18개는 전체 49단계 완주·첫 응답 24개/270 XP·중복 탭·새로고침·한 날 2회·두 과정의 중단 위치·10문항 복습과 힌트 기록·스키마 3 초기화/복원·원본 스키마 1 demo 백업 복원·오프라인·사전 뜻/출처/DAY·15/100 지도를 확인합니다. 기존 승인 차단 가정을 현재 요구로 교체했으며 시나리오를 단순히 skip하지 않았습니다.

첫 실행에서는 비동기 아바타 저장을 즉시 판정하던 테스트, 첫 글자 표시 문구, WebKit DB 초기화 대기를 수정했습니다. 이후 18개 모두 통과했습니다. 시각 검사에서 책 선택란의 이름 잘림을 발견해 CSS 최대 폭 제한을 제거했고, 최종 production 2개에서 375px 선택란 폭 250px 초과와 전체 책 이름을 검사했습니다. 이 CSS 수정 외 학습 동작은 18개 검사 뒤 변하지 않았습니다.

[스크린샷 폴더](../artifacts/screenshots/wordbook-courses/)에 home·settings·study·question·completion·recall·두 지도·서가·뜻 출처를 실제 375 CSS px 뷰포트로 저장했습니다. 320/375/430/1440폭의 가로 넘침과 가운데 배치, 44px 버튼·키보드 포커스·동작 줄이기도 확인했습니다. 데스크톱 WebKit의 포커스 검사는 실제 iOS 가상 키보드 검사가 아닙니다.

## Android 산출물

- 파일: [simonchichi-0.5.0.apk](../artifacts/android/simonchichi-0.5.0.apk), 5,092,129바이트.
- SHA-256: `37576a39bf2259bcb03867f81786a538eee5f34168da3c39ab1283cf3f3a3d32`.
- 앱 표시 이름 시몬치치, `com.simonchichi.app`, versionName 0.5.0 / versionCode 5, minSdk 24 / targetSdk 36.
- v2 서명·이전 버전과 같은 인증서·INTERNET 권한 없음 확인. APK 안의 웹 자산 8개와 최종 `dist-android`가 바이트 단위로 일치합니다.
- 실제 LAN 설치 페이지·APK·체크섬 HTTP 200, MIME `application/vnd.android.package-archive`, 파일명·크기·다운로드 SHA가 로컬 파일과 일치합니다. [전달 검사 기록](../artifacts/android/courses-download-verification.json).

개인 사용을 위한 디버그 서명 APK입니다. Play 스토어 릴리스 배포는 포함하지 않습니다. 앱 삭제 없이 같은 서명으로 업데이트하며, 설치 뒤에는 PC 전달 서버가 필요하지 않습니다.

Android 16/API 36 에뮬레이터에서 비행기 모드 1, Wi-Fi 0, 모바일 데이터 0을 확인하고 검사했습니다. 실제 휴대폰 검사는 아닙니다. [네이티브 결과 JSON](../artifacts/android/native-courses-results.json)에 두 APK의 검사를 구분했습니다.

- 기능 후보 `f996fcf17f268f00f61495118a8c4a7a587333ad953691415c957e222cc8577b`: **5/5 통과**. 0.4.0에서 덮어 설치하여 원래 130 XP와 기존 기록을 보존했습니다. 10단어 복습에서 객관식 5개/입력 5개, 오답 중복 탭·재개·힌트 기록·93 XP와 완료 보너스 없음, 수능 49단계 완주와 320 XP, 독립 지도·오프라인 재실행을 확인했습니다.
- 최종 배포 `37576a39bf2259bcb03867f81786a538eee5f34168da3c39ab1283cf3f3a3d32`: 후보와 비교해 선택란 CSS만 변경했습니다. 덮어 설치 뒤 **3/3 통과**. 다섯 테이블이 정확히 유지되고 오늘/설정의 두 책 선택란은 329px, 텍스트 가용 폭 280px로 이름이 모두 보였습니다. 오프라인 강제 종료/재실행 후 4세션·50답변·543 XP와 수능 책 선택이 유지되었습니다.

두 검사에서 페이지 오류·외부 요청은 없었습니다. 실제 시스템 파일 선택창에서 이전 백업을 가져오는 동작은 이번 네이티브 검사 범위에 포함하지 않았습니다. 브라우저의 파일 입력/복원과 DB 단위 검사는 별도로 통과했습니다. 화면은 [Android 과정 검사 폴더](../artifacts/android/courses-2026-11-01T10-13-59-966Z/)에 보존했습니다.

## 주요 변경 파일

| 범위          | 파일                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 화면          | `src/app/App.tsx`, `src/components/WordbookSelector.tsx`, `src/features/home/Today.tsx`, `src/features/home/WorldMap.tsx`, `src/features/daily-quest/Quest.tsx`, `Completion.tsx`, `src/features/reviews/Reviews.tsx`, `src/features/progress/ProgressScreen.tsx`, `src/features/settings/SettingsScreen.tsx`, `src/features/wordbooks/WordbooksScreen.tsx`, `src/styles/index.css` |
| 순수로직/저장 | `src/core/types.ts`, `src/core/course-quest.ts`, `src/core/quest-builder.ts`, `src/core/rewards.ts`, `src/data/db.ts`, `src/data/wordbooks.ts`, `src/core/wordbook.ts`                                                                                                                                                                                                              |
| 과정          | `src/data/course-schema.ts`, `src/data/courses.ts`, `src/data/courses/*.json`, `content_src/courses/*`, `tools/build_wordbook_courses.py`, `scripts/validate-courses.ts`                                                                                                                                                                                                            |
| 검사          | `tests/unit/course-content.test.ts`, `course-quest.test.ts`, `course-db.test.ts`, `quest-ui.test.tsx`, `tests/e2e/helpers.ts`, `quest.spec.ts`, `wordbooks.spec.ts`, `production.spec.ts`, `playwright.config.ts`, `scripts/test-android-courses.mjs`                                                                                                                               |
| 빌드/설치     | `package.json`, `package-lock.json`, `android/app/build.gradle`, `scripts/build-android.mjs`, `scripts/serve-android-download.mjs`                                                                                                                                                                                                                                                  |
| 문서          | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `DECISIONS.md`, `USER_GUIDE.md`, `ANDROID_INSTALL.md`, `IPHONE_TEST_CHECKLIST.md`, `COURSE_GUIDE.md`, 본 보고서; 이전 보고서와 12챕터 문서에 역사적 상태 명시                                                                                                                                                                     |

## 실제 iPhone 실행과 다음 범위

1. `npm run build`의 `dist/`를 HTTPS 정적 호스팅으로 제공합니다.
2. Safari에서 온라인으로 한 번 열고 공유 → 홈 화면에 추가한 뒤 설정의 오프라인 준비를 확인합니다.
3. 두 책 선택·49단계 중단/재개·10단어 복습 입력·비행기 모드 재실행·파일 앱 백업/복원을 확인합니다.
4. [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기/iOS/실제 결과를 기록합니다. 사설 IP의 일반 HTTP 미리보기는 PWA 오프라인 검증을 대신하지 않습니다.

다음 범위는 실제 iPhone/Android 휴대폰의 키보드·VoiceOver·홈 화면·백업 확인과 학습자의 회차 소요 시간/독해 부담 관찰입니다. 진단·주간 보스전·적응형 난도·능동 회상 심화 과제는 이번 범위에 포함하지 않았습니다.
