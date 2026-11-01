# 아바타 방과 XP 꾸미기 — 0.6.0

> 이 문서는 0.6.0 당시 결과입니다. 현재 배경 14종과 구매 후 미리보기는 [0.7.0 보고서](BACKGROUND_EXPANSION_REPORT.md)를 확인하세요.

기준일: 2026-11-01. 복습함에 정사각형 아바타 방과 배경·옷·액세서리 구매를 추가했습니다. 사용자가 선택한 **첫 응답 정답 수에 비례한 복습 보상**을 적용했습니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 변경된 기능

복습함은 아바타 방 → 10단어 복습 테스트 → 단어장 링크 순서입니다. 방은 선택한 친구와 장착품을 보여 줍니다. 모바일에서 배경·옷·액세서리를 선택하고 고정 가격을 확인하여 구매할 수 있습니다. 원래 방·옷·장식 없음은 무료이며 소유한 아이템은 비용 없이 다시 장착합니다.

상단 XP는 사용 가능한 잔액입니다. 누적 획득 보상에서 구매 영수증 합계를 빼며, 기존 보상이나 성장 기록의 누적 XP를 수정하지 않습니다. 구매·장착은 한 트랜잭션에 저장하고 상품별 영수증 하나로 중복 청구를 막습니다. 현금 결제·광고·확률형 상품은 없습니다.

### 상품과 가격

기준 데이터는 [room-catalog.ts](../src/core/room-catalog.ts)입니다. 총 12개 중 기본 3개는 무료, 유료 9개는 80~420 XP입니다.

| 분류     | 무료 기본     | 유료 아이템                                            |
| -------- | ------------- | ------------------------------------------------------ |
| 배경     | 민트 공부방   | 하늘 정원 120 · 바다 창가 240 · 별빛 다락 360 XP       |
| 옷       | 원래 옷       | 블루 후디 180 · 초록 야구잠바 300 · 세일러 셔츠 420 XP |
| 액세서리 | 액세서리 없이 | 동그란 안경 80 · 별 헤드폰 160 · 꽃 왕관 240 XP        |

### 복습 보상

새 테스트 시작 시 선택한 책의 오늘 첫 완료 회차, 진행 중 회차, 다음 계획 순서로 기준을 고릅니다. 해당 회차의 모든 정답과 기본 완료 보너스에 해당하는 최대 XP를 기준으로 30%를 내림한 값을 복습 최대 보상으로 고정합니다. 마지막 회차까지 끝낸 경우에도 책의 기본 구성으로 계산합니다.

실제 보상은 `floor(최대 복습 XP × 첫 응답 정답 수 ÷ 10)`입니다. 기본 회차가 320 XP이면 최대 96 XP이고, 첫 정답 5개는 48 XP입니다. 미리보기 5개가 있는 270 XP 회차는 최대 81 XP이며 첫 정답 9개는 72 XP입니다. 재도전 성공은 첫 정답 수에 더하지 않습니다.

새 정책에서는 10문항 완료 시 `review:<sessionId>` 보상 한 건을 지급하고 문항별 +10/+3과 중복 지급하지 않습니다. 같은 날 새 테스트는 다시 보상받을 수 있습니다. 같은 테스트의 중복 제출·완료·새로고침에는 보상이 늘지 않습니다. 첫 글자 도움은 계속 무힌트 회상과 구분합니다.

## 데이터와 이전 버전 호환

Dexie 버전 3에 구매 테이블을 추가하고 설정의 `room`에 배경·옷·액세서리 ID를 저장합니다. 새 복습 세션에 기준 책·회차·최대 XP와 정책 버전을 고정합니다. 정책이 없는 이전 복습 세션은 원래 지급 기록을 그대로 보존합니다.

백업 스키마 4는 구매·장착·보상 정책을 포함하고 1~3도 읽습니다. 과거 파일에 없는 구매 내역은 빈 목록으로 받아들입니다. 새 파일의 가격·중복 영수증·잔액·소유하지 않은 장착과 보상 정합성을 검증하고, 실패하면 기존 기록을 교체하지 않습니다. 기존 모드 간 백업 복원과 안정적 단어/회차 ID는 유지합니다.

실제 0.5.0 브라우저의 270 XP 학습 백업을 [legacy-v3-course-learner.json](../tests/e2e/fixtures/legacy-v3-course-learner.json)으로 보존했습니다. 내용을 임의로 바꾸지 않고 이전 파일 복원과 새 스키마 내보내기를 확인하는 데 사용합니다.

## 검증 결과

| 검사                                                                                | 실제 결과                                                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                                                 | 최종 소스 통과                                                                         |
| `npm run test`                                                                      | 12개 파일, 156개 통과                                                                  |
| 일반 웹 빌드                                                                        | E2E의 `npm run build` 통과. 대용량 청크 경고는 남음                                    |
| `npm run test:e2e`                                                                  | 최초 20개 중 19개 통과. WebKit 상점 닫기 초점 복귀 1개 실패 후 아래와 같이 수정·재검사 |
| `npx playwright test tests/e2e/room.spec.ts`                                        | 최종 초점 수정 후 Chromium·WebKit 2개 통과                                             |
| `npm run test:e2e:production`                                                       | 최종 일반 빌드에서 초점 회귀를 포함한 Chromium·WebKit 2개 통과                         |
| `npm run android:build`                                                             | 최종 0.6.0 APK 빌드 통과                                                               |
| `node scripts/test-android-room.mjs --apk …`로 Android 0.5.0 → 0.6.0 실제 덮어 설치 | API 36 에뮬레이터에서 최종 APK 기준 6개 검사 통과                                      |
| LAN 다운로드                                                                        | 페이지·APK·해시 파일 HTTP 200, 파일명·MIME·크기·해시 일치                              |

전체 웹 검사 범위는 주 검사 20개와 배포 검사 2개, 총 **22개 고유 시나리오**입니다. 최초 WebKit 검사는 상점을 닫은 뒤 버튼으로 키보드 초점이 돌아오지 않는 문제를 발견했습니다. `AvatarRoom`의 열기 버튼 참조와 `dialog.onClose`의 명시적 초점 복귀를 추가했습니다. 이 변경 뒤 방의 전체 구매·보상·복원 흐름 2개와 배포 회귀 2개를 다시 실행했습니다. 다른 18개 주 검사는 해당 수정 전 통과 결과를 사용하며, 최종 소스로 주 검사 전체를 다시 실행했다고 보고하지 않습니다. [최초 실패 기록](../artifacts/avatar-room/webkit-focus-before.md)

웹 검사는 375/430px 정사각형 방, 좁은 화면 가로 넘침, 방→테스트→단어장 순서, 키보드 탭·닫기 초점, 잔액 부족, 중복 구매, 소유품 무료 재장착을 확인했습니다. 0.5.0 백업의 270 XP에서 120+80 XP를 쓰고, 복습 두 번으로 81+81 XP를 받은 뒤 옷 180 XP를 구매하여 **누적 432 / 지출 380 / 잔액 52 XP**가 맞았습니다. 새 백업 4의 여섯 테이블·친구·장착이 초기화/복원과 오프라인 재실행 후 일치했고, 변조한 구매 가격은 거부했습니다.

별도 복습 검사는 첫 오답 뒤 재도전한 테스트에서 9/10 정답으로 72 XP, 다음 정상 새 테스트에서 81 XP를 받는지 확인했습니다. 빠른 답변·완료 탭과 새로고침은 보상을 늘리지 않았습니다. 단위 검사는 0/1/5/9/10 정답, 0 XP 완료 원장, 날짜 변경 뒤 고정 기준, 동시 구매와 부족한 잔액, 이전 정책의 보상 보존을 포함합니다.

[네이티브 결과 JSON](../artifacts/android/native-room-results.json)은 최종 APK 해시와 설치된 파일 해시를 함께 기록합니다. 기존 다섯 테이블의 직렬화 값과 **543 XP**를 그대로 보존하고 구매 테이블만 빈 상태로 추가했습니다. 세 상품 380 XP를 구매한 뒤 누적 543 / 잔액 163 XP였고, 복습 두 회는 각각 96 XP를 한 번씩 지급해 **누적 735 / 지출 380 / 잔액 355 XP**가 됐습니다. 최종 6개 세션·70개 답변·3개 구매, 수능 책·시폼푸린·장착 상태가 중간과 완료 후 강제 종료/재실행에도 유지됐습니다.

[재현 명령과 필요한 0.5.0 기준 상태](ANDROID_INSTALL.md#네이티브-자동-검사)를 설치 안내에 기록했습니다. 네이티브 검사 전후 비행기 모드 1·Wi-Fi 0·모바일 데이터 0, 서비스 워커 0, 외부 요청과 페이지 오류 0을 확인했습니다. **이번 네이티브 검사는 시스템 백업 저장창/파일 선택창을 조작하지 않았습니다.** 백업 4 내보내기·초기화·복원은 웹 E2E와 DB 단위 검사 결과입니다. 실제 Android 휴대폰과 iPhone 검증은 미실시입니다.

### 최종 APK와 증거

- 파일: [simonchichi-0.6.0.apk](../artifacts/android/simonchichi-0.6.0.apk), **5,104,880 bytes**
- SHA-256: `c2db5081ec349d22b48548525e8339fc89062a4e6de6613a8ad2ea602d654143`
- 앱 ID `com.simonchichi.app`, versionName `0.6.0`, versionCode `6`, 최소 API 24, 대상 API 36
- 기존 앱과 같은 인증서의 APK v2 서명 확인, `INTERNET` 권한 없음
- APK의 모든 번들 자료가 최종 `dist-android/assets`와 바이트 단위로 일치
- [다운로드 검증](../artifacts/android/room-download-verification.json) · [독립 HTTP 재확인](../artifacts/android/room-download-qa-verification.json)
- [웹 장착 화면](../artifacts/screenshots/avatar-room/webkit-room-equipped-375.png) · [잔액 부족 상점](../artifacts/screenshots/avatar-room/webkit-shop-insufficient-375.png) · [오프라인 복원](../artifacts/screenshots/avatar-room/webkit-room-restored-offline-375.png)
- [Android 최종 방](../artifacts/android/room-2026-11-01T11-13-06-298Z/06-final-offline-room.png) · [최종 여섯 테이블 스냅샷](../artifacts/android/room-2026-11-01T11-13-06-298Z/final-six-table-snapshot.json)

초점 수정 전 APK `acf262…`는 후보 산출물이었으며 최종 네이티브 검증에 사용하지 않았습니다. 위 최종 해시 APK 하나로 업그레이드·구매·보상 검사를 수행했습니다.

## 변경 파일

| 영역           | 파일                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상품·보상·저장 | `src/core/room-catalog.ts`, `src/core/economy.ts`, `src/core/rewards.ts`, `src/core/types.ts`, `src/data/db.ts`, `src/app/useStudyData.ts`                                                                                                                                                                                                  |
| 방과 친구 외형 | `src/features/reviews/AvatarRoom.tsx`, `src/components/AvatarRoomScene.tsx`, `src/components/Mascot.tsx`, `src/styles/avatar-room.css`                                                                                                                                                                                                      |
| 화면 연결·잔액 | `src/app/App.tsx`, `src/features/reviews/Reviews.tsx`, `src/features/progress/ProgressScreen.tsx`, `src/features/home/Today.tsx`, `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/Completion.tsx`, `src/features/settings/SettingsScreen.tsx`, `src/features/wordbooks/WordbooksScreen.tsx`, `src/styles/index.css`         |
| 자동 검사      | `tests/unit/economy.test.ts`, `tests/unit/economy-db.test.ts`, `tests/unit/fixtures/legacy-v3-native-backup.json`, `tests/e2e/helpers.ts`, `tests/e2e/quest.spec.ts`, `tests/e2e/room.spec.ts`, `tests/e2e/production.spec.ts`, `tests/e2e/fixtures/legacy-v3-course-learner.json`, `playwright.config.ts`, `scripts/test-android-room.mjs` |
| 버전·전달      | `package.json`, `package-lock.json`, `android/app/build.gradle`, `scripts/serve-android-download.mjs`                                                                                                                                                                                                                                       |
| 정책·사용 안내 | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서와 이전 0.5.0 보고서의 이력 안내                                                                                                                                          |

기존 단어·회차 ID, 115회 과정, 230개 구문과 230개 독해 콘텐츠는 이번 단계에서 변경하지 않았습니다.

## iPhone 실행과 다음 범위

일반 `npm run build`의 `dist/`를 HTTPS 정적 호스팅으로 제공하고 Safari 공유 → 홈 화면에 추가합니다. 온라인으로 한 번 연 뒤 오프라인 준비를 확인합니다. 방의 정사각형·상품 가격·구매/재장착·XP 잔액·복습 보상·비행기 모드 재실행·파일 앱 백업/복원을 확인하고 [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기와 실제 결과를 기록합니다. 데스크톱 WebKit 검사는 실제 iOS의 가상 키보드·VoiceOver·저장소 정책 검증을 대신하지 않습니다.

다음 범위는 실제 휴대폰 화면과 접근성·설치·백업 점검입니다. 실제 돈 결제, 거래·선물·환불 시스템, 꾸미기로 학습 정답이나 숙련을 바꾸는 기능은 이번 범위에 포함하지 않습니다.
