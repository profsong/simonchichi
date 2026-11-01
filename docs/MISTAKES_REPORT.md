# 오답노트와 기록을 보존하는 업데이트 — 0.12.0

기준일: 2026-11-02 (한국 시간). 오늘의 **오답 다시 도전**을 실제 진입 버튼으로 바꾸고, 복습함에 전체 단어장·영역의 오답 목록과 전용 퀴즈를 추가했습니다. 기존 학습·XP·구매와 과정의 마지막 재시험은 유지합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 원인과 변경

기존 오늘 화면의 오답 행은 클릭 처리 없는 루틴 안내였습니다. 실제 재시험은 회차의 마지막 독해 뒤에만 생성됐으므로, 오늘 화면의 행을 눌러 별도 복습을 시작할 수 없었습니다. 이제 오답이 없어도 빈 노트로 들어가고, 틀린 답을 저장한 직후에는 회차 완료 전부터 목록에 표시합니다.

복습함은 아바타 방 → 기존 10단어 복습 테스트 → 오답노트 → 단어장 링크 순서를 유지합니다. 노트는 전체·단어·문장·독해 필터, 검색, 정답·해설·독해 근거를 제공합니다. 단어는 공통 어휘 ID로 합치며 문장과 독해는 질문 ID별로 셉니다.

최근 오답 뒤 **서로 다른 세션에서 정답 두 번**이면 목록에서 해제합니다. 같은 세션의 같은 항목은 한 번만 기여하고 새 오답은 0으로 되돌립니다. 회차 마지막 재시험·기존 즉시 재도전·힌트 정답도 해제 횟수에는 기여할 수 있지만 기존 숙련 판정은 바꾸지 않습니다. 오답 상태는 원래 답변에서 계산하므로 목록 해제는 기록 삭제가 아닙니다.

전용 퀴즈는 최근 오답부터 최대 10문항이며 하나만 있어도 시작합니다. 현재 단어장·화면 필터와 무관하게 전체 미해결 항목에서 선택하고 시작한 문항과 위치를 저장합니다. 원래 정답·보기·근거를 사용하고 즉시 재도전은 없습니다. **추가 XP·하루 보너스·과정 완료를 만들지 않습니다.** 기존 10단어 복습 보상과 과정 재시험 보상은 그대로이며, 이미 고정한 과정의 재시험 문항은 다른 퀴즈에서 해제돼도 바꾸지 않습니다.

## 기록 호환

Dexie 스키마 3, 여섯 테이블, 백업 스키마 6과 기존 DB 이름·문항·보상·구매 ID를 유지합니다. 이전 스키마 1~6을 계속 지원하고 새로운 오답 세션을 과거 스키마로 위장하거나 전용 퀴즈 시각을 중첩시킨 백업은 거절합니다. 새 퀴즈는 앞선 전용 퀴즈가 끝난 뒤에만 시작합니다.

웹 검사는 실제 0.8 에뮬레이터 기록에서 보존한 스키마 5 fixture를 원본 그대로 복원해 여섯 테이블·누적 998 XP·지출 580 XP·잔액 418 XP를 대조합니다. 필요한 내부 appMode 이동 외 기록을 바꾸지 않습니다. 단위 검사는 실제 0.11 스키마 6 자료의 복원·오답 조회·내보내기·재복원 보존을 별도로 확인합니다. fixture는 파일 선택창에서 직접 내보낸 파일이 아닌 원형 테이블 스냅샷에 스키마 envelope를 붙인 테스트 자료임을 출처 문서에 기록했습니다.

## 검증 결과

| 검사                                                                                               | 실제 결과                                                       |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                                                                | 최종 소스 통과                                                  |
| `npm run test`                                                                                     | 전체 218개 통과                                                 |
| `npx playwright test tests/e2e/mistakes.spec.ts tests/e2e/test-first.spec.ts --reporter=list,json` | Chromium/WebKit 새 오답 6개 + 기존 회차 4개, 10/10 통과 (2.9분) |
| `npx playwright test --config playwright.pages.config.ts --reporter=list,json`                     | 프로젝트 경로 6/6 통과 (14.4초)                                 |
| `npx playwright test --config playwright.production.config.ts --reporter=list,json`                | 기본 루트 일반 배포 2/2 통과 (12.3초)                           |
| 일반 웹·프로젝트 경로 빌드                                                                         | 위 E2E 준비 단계에서 통과, 기존 큰 청크 경고 유지               |
| `npm run android:build`                                                                            | 최종 0.12.0 APK 빌드 통과                                       |
| Android 0.11.0→0.12.0                                                                              | 아래 제한된 범위로 최종 APK 4/4 통과                            |

이번 변경에 맞춰 **대상 웹 시나리오 18개**를 최종 소스로 실행했습니다. 이전 전체 꾸미기·단어장 E2E를 이번에 모두 재실행했다고 표현하지 않습니다. [오답·회차 검사](../artifacts/mistakes/main-e2e-results.json) · [Pages 검사](../artifacts/mistakes/pages-e2e-results.json) · [일반 배포 검사](../artifacts/mistakes/production-e2e-results.json)

Pages 검사는 `/simonchichi/` 아래 자산·manifest·worker·출처 경로, 오프라인 정답 저장·백업, 온라인 HTML 404 뒤 캐시 실행과 worker 업데이트 실패 시 기존 활성 worker 유지까지 포함합니다. 로컬 서버 결과이며 공개 GitHub Actions 배포나 실제 iPhone 장기 보존 검사로 대신하지 않습니다.

신규 E2E는 즉시 오답 등록, 두 정답 해제·새 오답 초기화, 두 책 전체 범위, 문장·독해 포함, 중복 시작/답변/완료, 부분 백업·초기화·복원·오프라인 재개, 기존 재시험 고정, 하루 보너스 한 번, 원형 이전 기록 보존을 확인합니다. 기존 test-first 회귀는 옛 49단계 이어하기와 새 29단계+오답 꼬리를 함께 검사합니다.

최초 실행은 테스트가 앱 모듈의 JSON을 Node에서 직접 import하면서 수집 단계에 실패했습니다. 테스트를 기존 방식처럼 원본 과정 JSON을 파일로 읽어 정답을 대조하도록 고쳤습니다. 제품 코드 변경은 필요하지 않았습니다.

375px Chromium/WebKit의 오답노트 진입·필터·CTA 화면을 직접 열어 잘림 없이 표시됨을 확인했습니다. [영역별 오답노트](../artifacts/screenshots/mistakes/chromium-mixed-domain-note.png) · [WebKit 진입](../artifacts/screenshots/mistakes/webkit-today-mistake-before-course-completion.png) · [오프라인 해제 후](../artifacts/screenshots/mistakes/webkit-offline-cleared-note.png)

## Android 업데이트

최종 [네이티브 검사](../artifacts/android/native-mistakes-results.json)는 실제 설치된 0.11.0에 0.12.0을 덮어 설치해 **4/4 통과**했습니다. 시작 전후 여섯 테이블 전체가 정확히 같았고, 기존 **7세션·101답변·4구매 / 획득 998·지출 580·잔액 418 XP**를 보존했습니다.

기존 오답 두 개의 0/2·1/2 표시, 오늘과 복습함의 두 진입점, 미응답 오답 퀴즈 한 개 생성·나가기·오프라인 강제 종료/재개를 확인했습니다. 마지막에는 미응답 세션만 하나 늘어 총 8세션이며 원래 일곱 세션과 답변·SRS·보상·구매는 그대로입니다. 비행기 모드, Wi-Fi·모바일 데이터 꺼짐, native service worker 0개, 관찰된 외부 요청·페이지 오류 0개입니다. 이번 네이티브 검사는 답변 제출·새 구매·시스템 파일 선택창을 실행하지 않았으며 정답 해제와 백업 복원은 웹·단위 결과와 구분합니다.

- 파일: `artifacts/android/simonchichi-0.12.0.apk`
- 버전: `0.12.0`, Android versionCode `12`
- 크기: **6,043,207바이트**
- SHA-256: `5eb0704ba066b359690be346277632fdfb40514df12c9cdf6950a1f6961cd686`

설치 페이지·해시·APK의 실제 LAN HTTP 응답은 모두 200이었고, 별도로 내려받은 파일의 크기·SHA-256·APK MIME·다운로드 이름을 확인했습니다. [독립 다운로드 확인](../artifacts/mistakes/download-verification.json)

재현 명령은 전용 테스트 에뮬레이터의 0.11 상태에서 `ANDROID_HOME`·`ANDROID_SERIAL`을 설정한 뒤 다음과 같습니다.

```powershell
node scripts/test-android-mistakes.mjs --prepare
node scripts/test-android-mistakes.mjs --apk artifacts/android/simonchichi-0.12.0.apk --expected-sha256 5eb0704ba066b359690be346277632fdfb40514df12c9cdf6950a1f6961cd686
```

## 변경 파일

| 범위                   | 파일                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 오답 집계·계획         | `src/core/mistakes.ts`, `src/core/types.ts`                                                                                                                                                                                                                                             |
| 저장·보상·복원 검증    | `src/data/db.ts`, `src/core/rewards.ts`                                                                                                                                                                                                                                                 |
| 화면·경로              | `src/app/App.tsx`, `src/features/home/Today.tsx`, `src/features/reviews/Reviews.tsx`, `src/features/reviews/MistakesScreen.tsx`, `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/Completion.tsx`, `src/features/progress/ProgressScreen.tsx`, `src/styles/mistakes.css` |
| 버전·배포              | `src/features/settings/SettingsScreen.tsx`, `package.json`, `package-lock.json`, `android/app/build.gradle`, `scripts/serve-android-download.mjs`                                                                                                                                       |
| 단위·호환 자료         | `tests/unit/mistakes.test.ts`, `tests/unit/mistakes-db.test.ts`, `tests/unit/mistakes-migration.test.ts`, `tests/unit/fixtures/legacy-v6-native-0.11.json`, `tests/unit/fixtures/legacy-v6-native-0.11.provenance.md`                                                                   |
| 브라우저·네이티브 검사 | `tests/e2e/mistakes.spec.ts`, `playwright.config.ts`, `scripts/test-android-mistakes.mjs`                                                                                                                                                                                               |
| 요구·안내              | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, `docs/GITHUB_PAGES.md`, 이 보고서                                                                                              |

## 공개 웹 업데이트

기존 앱의 실제 주소는 [시몬치치](https://profsong.github.io/simonchichi/)입니다. `main` 변경은 [Actions](https://github.com/profsong/simonchichi/actions)의 검사·빌드를 거쳐 배포합니다. 이번 0.12.0의 공개 배포와 기존 실서비스 브라우저에 남긴 기록을 업데이트 후 대조하는 결과는 `artifacts/pages/deployment-result-0.12.json`에 별도로 기록합니다. 이 보고서의 로컬 18개 결과만으로 해당 공개 배포나 실제 iPhone 업데이트 성공을 선행 주장하지 않습니다.

## iPhone 확인과 남은 범위

실제 iPhone·Android 휴대폰 검사는 **미실시**입니다. Chromium/WebKit과 Android 에뮬레이터 결과를 실물 검사로 확대하지 않습니다. iPhone Safari에서 기존과 같은 HTTPS 주소를 열고 업데이트한 뒤 기존 홈 화면 앱의 기록과 XP를 확인합니다. 앱 삭제나 Safari 데이터 지우기를 업데이트 방법으로 사용하지 않습니다. 먼저 설정에서 JSON 백업을 보관하고, 다른 origin·기기로 이동할 때만 명시적으로 복원합니다. [실제 iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)의 오답노트·업데이트 항목을 따라 모델·iOS·주소·실제 결과를 기록하는 것이 다음 확인 범위입니다. 기기 저장소 정리까지 막는 영구 보존을 약속하지 않습니다.
