# 단어 테스트 우선과 독해 뒤 오답 재시험 — 0.8.0

기준일: 2026-11-01. 새 회차의 20단어는 뜻 카드 없이 영어→한국어 뜻 고르기로 시작합니다. 처음 틀린 단어만 구문·독해 뒤 한 번 다시 풀고 완료합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 새 회차와 이전 기록

새 회차는 기억 채우기 5개 → 단어 뜻 고르기 20개 → 구문 2개 → 독해 2개로 기본 29단계입니다. 기억 채우기에 배운 단어가 부족하면 미리보기 카드로 채우는 동작은 유지합니다. 따라서 처음에는 미리보기 카드 5개·답변 24개이고, 배운 단어가 충분하면 기본 답변은 29개입니다. 별도 vocab 뜻 카드 20개는 제거했습니다.

독해 뒤 초기 단어 테스트에서 처음 틀린 단어만 원래 순서대로 한 번 다시 나옵니다. 오답이 없으면 바로 완료하고, 최대 20개가 추가되면 전체 49단계입니다. 기억 채우기·구문·독해 오답은 꼬리에 포함하지 않습니다. 즉시 다시 풀기와 재시험 오답의 반복은 제공하지 않습니다. 화면은 영어 표제어와 한국어 선택지 네 개를 먼저 보여 주고 제출 뒤 해설을 보여 줍니다.

`courseFlow: "test-first-v1"`을 새 세션에만 기록합니다. 마지막 독해 다음으로 갈 때 `retestQuestionIds`를 빈 목록까지 포함해 한 번 고정합니다. `:retest` 단계는 `retestOf`로 원 질문을 연결하고 보기를 회전합니다. 저장한 순서·답변으로 재개하므로 새로고침이나 백업 복원이 재추출하지 않습니다.

이전 49단계 세션의 배열·위치·ID를 바꾸지 않고 그대로 이어갑니다. 실제 0.7.0 일반 배포 빌드에서 만든 [미완료 backup4](../tests/e2e/fixtures/legacy-v4-partial-course-0.7.json)를 원형으로 확보했습니다. 첫 6개 카드와 단어 정답 1개 뒤 중단한 7/49 위치·10 XP·답변 1개이며 새 흐름 메타데이터가 없습니다. [캡처 기록](../artifacts/test-first/legacy-0.7-fixture-capture.json)

## XP와 백업

재시험 응답은 원 질문 ID의 `firstTry: false`로 저장하고 기존 재도전 +3 XP 원장 키를 재사용합니다. 새 첫 정답 10 XP나 재시험 완료 보너스를 따로 만들지 않습니다. 처음부터 맞힌 경우보다 오답 후 재시험이 더 많은 보상을 주지 않습니다. 하루 완료 보너스는 재시험까지 모두 끝난 뒤 한 번만 지급합니다.

별도 10단어 복습 테스트의 최대 보상은 기존대로 기본 회차 가능 XP의 30%입니다. 재시험 꼬리는 기준 문항 수에 포함하지 않습니다. 완료 화면은 초기 vocab 문항의 고유 단어 20개를 세고, 재시험 결과는 별도로 표시합니다. 학습·구매 원장, 누적 XP/사용 잔액, 두 책의 진도와 14종 배경 정책을 유지합니다.

백업은 스키마 5로 내보내며 유효한 1~4도 읽습니다. 새 흐름·확정된 꼬리·부분 답변을 엄격히 검증하고, 새 흐름을 과거 스키마로 위장한 파일은 거절합니다. 저장소 테이블 버전은 변경하지 않습니다. 단어장·원문·구문·독해 콘텐츠 및 안정적 ID는 변경하지 않았습니다.

## 검증 결과

| 검사                                               | 실제 결과                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                | 최종 소스 통과                                                             |
| `npm run test`                                     | 14개 파일, 174개 통과                                                      |
| `npm run test:e2e`                                 | 최초 24개 중 20개 통과, 새 과정의 단어 외 즉시 재도전 버튼 문제로 4개 실패 |
| `npx playwright test tests/e2e/test-first.spec.ts` | UI 수정 후 새 흐름·이전 회차 호환 Chromium/WebKit 4/4 통과                 |
| `npm run test:e2e:production`                      | 최종 일반 배포 Chromium/WebKit 2/2 통과                                    |
| 일반 웹 빌드                                       | 위 E2E의 `npm run build` 통과. 기존 대용량 청크 경고는 남음                |
| `npm run android:build`                            | 최종 0.8.0 APK 빌드 통과                                                   |
| `node scripts/test-android-test-first.mjs --apk …` | 최종 APK의 API 36 에뮬레이터 0.7.0→0.8.0 덮어 설치, 4개 검사 통과          |

웹 검증 범위는 총 **26개 고유 시나리오**입니다. 첫 검사에서 새 과정의 구문·기억 채우기 오답에 즉시 재도전 버튼이 남아 있었습니다. 저장소가 거절하는 동작과 맞추어 UI 조건을 모든 새 과정 단계에 적용했습니다. 수정 후 관련 새 흐름 4개와 배포 2개를 재검사했고, 변경 영향이 없는 나머지 20개는 최초 통과 결과를 사용합니다. 최종 소스로 전체 주 검사 24개를 다시 실행한 것으로 보고하지 않습니다. [최초 실패 기록](../artifacts/test-first/test-first-only-first-wron-c472f-retest-and-one-retry-reward-chromium-before-fix.md)

브라우저의 새 기본 회차는 29단계·뜻 카드 없는 단어 20문항·첫 학습 24답변·270 XP로 완료했습니다. 오답을 넣은 검사는 단어 2개와 구문 1개·독해 1개를 틀렸지만 단어 2개만 뒤에 추가되어 31단계가 됐습니다. 첫 재시험은 정답 3 XP, 두 번째는 오답 0 XP이며 추가 꼬리는 생기지 않았습니다. 첫 응답 정답 20개×10 + 재시험 3 + 첫 완료 30 = **233 XP**, 답변 26개, 완료 단어 20개를 확인했습니다.

재시험 도중 답변 후 새로고침, 두 번째 재시험 전 백업 5 내보내기→초기화→복원, 빠른 중복 제출·완료에도 세션과 원장이 일치했습니다. 완료 전에는 일일 보너스가 없고 재시험까지 끝내면 한 번만 생겼습니다. 이어 시작한 별도 복습 테스트의 기준은 꼬리를 제외한 270 XP / 최대 81 XP였습니다.

실제 0.7.0 미완료 백업은 원래 49단계·위치·답변을 그대로 복원해 270 XP로 마쳤습니다. 그 다음 새 회차에서 기억 채우기만 한 번 틀렸을 때는 재시험 없이 29단계로 끝났고, 같은 날 추가 완료 보너스 없이 합계 550 XP였습니다. 단위 검사는 0/2/20개 단어 오답, 꼬리 고정·회전된 보기 채점·원 질문 ID의 +3 보상·영역 제외·백업 위장 거절을 포함합니다.

[네이티브 결과 JSON](../artifacts/android/native-test-first-results.json)의 설치 APK 해시는 최종 파일과 같습니다. 실제 0.7.0의 여섯 테이블, 6개 세션·70개 답변·4개 구매, **누적 735 / 지출 580 / 잔액 155 XP**를 업데이트 후 보존했습니다. 새 수능 2회차 29단계 뒤 단어 오답 2개를 한 번 재시험하여 31단계로 마쳤습니다. 첫 재시험 정답은 기존 +3 키 한 건, 두 번째 오답은 0 XP였고 중간 강제 종료·중복 탭에도 꼬리와 지급 내역이 고정됐습니다.

네이티브의 새 세션은 첫 응답 보상 260 + 재시험 3 + 이미 지급된 날짜의 추가 보너스 0 = **263 XP**입니다. 최종 **7개 세션·101개 답변·4개 구매, 누적 998 / 지출 580 / 잔액 418 XP**와 수능 책·시폼푸린·빗소리 서재·옷·안경을 유지했습니다. 비행기 모드 1·Wi-Fi 0·모바일 데이터 0에서 외부 요청과 페이지 오류는 0이었습니다.

**이번 네이티브 검사는 시스템 백업 저장창/파일 선택창을 조작하지 않았습니다.** 백업 5의 내보내기·초기화·복원은 별도 웹/단위 검사 결과이며, 실제 Android 휴대폰과 iPhone 검증은 미실시입니다. 375px 웹의 큰 영어 표제어·한국어 선택지·재시험 및 20단어 완료 화면은 직접 시각 확인했습니다.

### 최종 APK와 증거

- 파일: [simonchichi-0.8.0.apk](../artifacts/android/simonchichi-0.8.0.apk), **5,114,878 bytes**
- SHA-256: `362642fd9264b011c5bc983faffc9d5d072a2c6a1b111d93779408d6a5a91767`
- 앱 ID `com.simonchichi.app`, 버전 `0.8.0` / versionCode `8`, 최소 API 24·대상 API 36
- 기존 앱과 같은 인증서의 APK v2 서명 확인, `INTERNET` 권한 없음
- APK 번들 자료 6개가 최종 `dist-android/assets`와 바이트 단위로 일치
- 다운로드 페이지·APK·해시 파일 HTTP 200, 파일명·MIME·크기·해시 일치: [출시 검사](../artifacts/android/test-first-download-verification.json) · [독립 재확인](../artifacts/android/test-first-download-qa-verification.json)
- [웹 재시험 시작](../artifacts/screenshots/test-first/webkit-retest-start-375.png) · [재시험 오답 후 마무리](../artifacts/screenshots/test-first/webkit-retest-wrong-once-375.png) · [233 XP·20단어 완료](../artifacts/screenshots/test-first/webkit-retest-completion-375.png)
- [Android 단어 테스트](../artifacts/android/test-first-2026-11-01T12-00-49-971Z/02-vocabulary-test-before-answer.png) · [Android 완료](../artifacts/android/test-first-2026-11-01T12-00-49-971Z/05-completed-test-first-lesson.png)

## 변경 파일

| 영역                | 파일                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 새 흐름·저장·보상   | `src/core/course-quest.ts`, `src/core/types.ts`, `src/core/rewards.ts`, `src/data/db.ts`                                                                                                                                                                                                                                                                                                                                                                                 |
| 단계·피드백·완료    | `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/Completion.tsx`, `src/features/daily-quest/phases.ts`, `src/features/home/Today.tsx`, `src/features/home/WorldMap.tsx`, `src/styles/index.css`                                                                                                                                                                                                                                                           |
| 자동 검사·원본 백업 | `tests/unit/course-quest.test.ts`, `tests/unit/course-content.test.ts`, `tests/unit/course-db.test.ts`, `tests/unit/db.test.ts`, `tests/unit/economy-db.test.ts`, `tests/unit/test-first-db.test.ts`, `tests/e2e/helpers.ts`, `tests/e2e/quest.spec.ts`, `tests/e2e/room.spec.ts`, `tests/e2e/test-first.spec.ts`, `tests/e2e/fixtures/legacy-v4-partial-course-0.7.json`, `tests/e2e/fixtures/README.md`, `playwright.config.ts`, `scripts/test-android-test-first.mjs` |
| 버전·전달           | `package.json`, `package-lock.json`, `android/app/build.gradle`, `src/features/settings/SettingsScreen.tsx`, `scripts/serve-android-download.mjs`                                                                                                                                                                                                                                                                                                                        |
| 정책·안내           | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서와 0.7.0 보고서의 이력 안내                                                                                                                                                                                                                                                                            |

## iPhone 실행과 다음 범위

`npm run build`의 `dist/`를 HTTPS 정적 호스팅으로 제공하고 Safari 공유 → 홈 화면에 추가합니다. 온라인으로 한 번 연 뒤 오프라인 준비를 확인합니다. 첫 단어 문제·독해 뒤 재시험·재시험 도중 종료/재개·파일 앱 백업/복원·비행기 모드 실행을 직접 확인하고 [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기·iOS·VoiceOver 결과를 기록합니다. 데스크톱 WebKit은 실제 iOS 검증이 아닙니다.

다음 범위는 실제 휴대폰의 입력·접근성·설치·파일 복원 확인과 문제 중심 흐름의 학습 부담 점검입니다. 12분 완료나 언어 능력 인증·수능 점수를 약속하지 않습니다.
