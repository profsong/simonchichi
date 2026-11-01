# 꾸미기 가격 조정 — 0.9.0

기준일: 2026-11-01. 새 유료 상품 가격을 배경 12,000 XP·옷 6,000 XP·액세서리 2,500 XP로 통일했습니다. 이미 산 물건과 그때 결제한 금액, 누적 XP와 잔액은 그대로 유지합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 가격과 학습량 기준

| 종류     | 새 유료 가격 | 하루 870 XP 기준 | 사용자 목표 |
| -------- | -----------: | ---------------: | ----------: |
| 배경     |    12,000 XP |        약 13.8일 |     약 14일 |
| 옷       |     6,000 XP |         약 6.9일 |      약 7일 |
| 액세서리 |     2,500 XP |         약 2.9일 |      약 3일 |

하루 새 탐험 3~4회를 기준으로 **새 문항 24개 × 첫 정답 10 XP × 3~4회 + 하루 첫 완료 30 XP = 750~990 XP**이며 중간값은 870 XP입니다. 기억 채우기의 반복 문항 보상과 별도 무제한 복습 테스트는 이 기준 수입에서 제외했습니다. 정답률·재시험·복습에 따라 실제 기간은 달라지며 날짜 잠금이나 획득 보장이 아닙니다. 보상 공식·복습 횟수·학습 내용은 바꾸지 않았습니다.

가격의 단일 기준은 [room-catalog.ts](../src/core/room-catalog.ts)입니다. 14개 배경, 4개 옷, 4개 액세서리의 ID와 그림을 유지하며 무료 기본 3개·유료 19개입니다. 소유품 재장착은 무료이고 미구매 배경에는 계속 그림이 없습니다. 작은 화면에서 가격은 천 단위 쉼표로 표시하며, 다섯 자리 가격과 구매 문구가 어색하게 끊기지 않도록 버튼 안을 두 줄로 정리했습니다.

## 이전 구매와 백업

새 구매 영수증은 `pricingVersion: 2`와 현재 가격을 저장합니다. 버전 필드가 없는 기존 영수증은 v1 원가격으로 검증합니다. 과거 영수증의 금액·생성 시각·소유권을 수정하거나 인상분을 청구하지 않습니다. 누적 획득 XP는 불변이며 잔액은 실제 영수증의 합계를 뺀 값입니다. 잔액 확인·영수증 저장·장착을 한 트랜잭션으로 처리하여 중복 터치가 중복 결제를 만들지 않습니다.

백업은 **스키마 6**으로 내보내고 유효한 1~6을 가져옵니다. 과거와 새 영수증이 섞여 있어도 각각의 버전·가격을 검증합니다. 새 가격 버전이 있는 파일을 스키마 1~5로 위장하거나 새 영수증의 가격만 예전 값으로 바꾸면 거절합니다. Dexie 3과 여섯 테이블은 유지합니다.

기록 보존에는 실제 0.8 에뮬레이터의 여섯 테이블을 스키마 5 봉투로 감싼 [기존 기록 fixture](../tests/e2e/fixtures/legacy-v5-native-0.8.json)를 사용했습니다. **시스템 파일 저장창에서 내보낸 파일은 아닙니다.** 원래 테이블 값인 7개 세션·101개 답변·4개 영수증, 누적 998 / 지출 580 / 잔액 418 XP를 보존합니다. 웹의 정상 이식에서는 이미 지원하던 내부 `appMode` 변환만 적용합니다.

새 구매 성공 검사는 별도 [합성 고잔액 fixture](../tests/e2e/fixtures/funded-v6-pricing-test.json)를 사용합니다. 원래 기록을 정상 가져온 뒤 공개 DB API로 309회 복습 테스트를 완료하여 만든 자료이며 XP·보상 필드를 직접 주입하지 않았습니다. 316개 세션·3,191개 답변·기존 영수증 4개, 누적 30,662 / 지출 580 / 잔액 30,082 XP입니다. 실제 학습자의 학습량을 뜻하지 않습니다. [생성기](../scripts/create-funded-pricing-fixture.ts) · [생성 기록](../artifacts/pricing/funded-fixture-generation.json)

## 검증 결과

| 검사                                                                         | 실제 결과                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                                          | 전체 통과                                                                    |
| `npm run test`                                                               | 14개 파일, 176개 통과                                                        |
| 마지막 버튼 배치 수정 후 `npx vitest run tests/unit/avatar-room-ui.test.tsx` | 4개 통과, 나머지 단위 대상의 동작 변경 없음                                  |
| `npm run test:e2e`                                                           | 최초 24개 중 22개 통과, 방 검사 2개는 테스트 숫자 표기 기대값/대기 시간 문제 |
| `npx playwright test tests/e2e/room.spec.ts`                                 | 최종 두 줄 버튼 소스의 Chromium/WebKit 2/2 통과                              |
| `npm run test:e2e:production`                                                | 최종 일반 배포 Chromium/WebKit 2/2 통과                                      |
| 일반 웹 빌드                                                                 | E2E가 사용하는 `npm run build` 통과; 기존 대용량 청크 경고 유지              |
| `npm run android:build`                                                      | 최종 버튼 수정 포함 APK 빌드 통과                                            |
| `node scripts/test-android-price-balance.mjs --apk …`                        | 최종 APK의 API 36 에뮬레이터 0.8→0.9 업데이트 4/4 통과                       |

웹 주 검사의 두 실패는 새 테스트가 성장 기록 숫자에도 쉼표를 기대한 것과 WebKit의 대용량 합성 백업이 기본 10초 대기를 넘긴 것입니다. UI의 기존 숫자 표기에 맞추고 복원 완료 대기를 60초로 조정했습니다. 두 브라우저의 방 검사가 통과한 뒤, 별도 시각 확인에서 발견한 구매 버튼 줄바꿈을 정리하여 관련 방 2개를 최종 소스로 재검사했습니다. 일반 배포 2개도 최종 소스로 통과하여 총 26개 고유 웹 시나리오를 확인했습니다. 변경 영향이 없는 나머지 22개는 최초 통과 결과를 사용하며 전체 24개를 마지막 소스로 다시 실행했다고 보고하지 않습니다. [최초 실행 기록](../artifacts/pricing/initial-e2e-report.json)

최종 방 시나리오는 Chromium 13.7초, WebKit 약 1.6분에 통과했습니다. 316세션·3,191답변 합성 백업의 파일 선택·확인부터 복원 완료 문구까지 관찰한 시간은 Chromium 630/629ms, WebKit 34,667/36,901ms였습니다. 단일 실행의 관찰값이며 성능 보장이나 실제 iPhone 측정이 아닙니다. 대용량 복원 대기는 남은 사용성 확인 범위입니다. [Chromium 시간 기록](../artifacts/pricing/restore-timings-chromium.json) · [WebKit 시간 기록](../artifacts/pricing/restore-timings-webkit.json) · [최종 방 검사 기록](../artifacts/pricing/final-room-e2e-report.json) · [배포 검사 기록](../artifacts/pricing/final-production-e2e-report.json)

웹 구매 검사는 구름 오두막 12,000 + 세일러 셔츠 6,000 + 별 헤드폰 2,500 = **20,500 XP**를 한 번씩 지출합니다. 누적 30,662 XP는 그대로이고 지출 21,080 / 잔액 9,582 XP·영수증 7개가 됩니다. 보유 배경 미리보기, 부족한 잔액, 무료 재장착, 중복 탭, 세 범주 장착, 구매 전후 학습 기록 불변, 혼합 백업 6의 초기화·복원과 위조 거절, 오프라인 재실행을 확인했습니다.

[최종 네이티브 검사](../artifacts/android/native-price-balance-results.json)는 아래 `bb91608d…` APK로 실제 0.8.0→0.9.0 덮어 설치하여 **4/4 통과**했습니다. 여섯 테이블 전체가 동일하며 7개 세션·101개 답변·4개 영수증, **누적 998 / 지출 580 / 잔액 418 XP**를 보존했습니다. 미보유 유료 상품 15개의 새 가격·정확한 부족액·구매 차단, 기존 보유품 4개의 무료 재장착·중복 탭 무차감, 미구매 배경 그림 숨김을 확인했습니다.

비행기 모드 1·Wi-Fi 0·모바일 데이터 0에서 강제 종료 후 다시 열어도 여섯 테이블이 같았고 service worker 0·관찰된 외부 요청 0·페이지 오류 0이었습니다. 최종 검사 전 이전 후보에서 0.8로 되돌릴 때도 기록 불변을 확인했습니다. [이전 버전 복원 증거](../artifacts/android/price-balance-2026-11-01T12-32-06-518Z/downgrade-preservation.json) · [최종 네이티브 배경 가격](../artifacts/android/price-balance-2026-11-01T12-32-06-518Z/03-new-backgroundId-webview.png)

실제 최종 명령은 전용 에뮬레이터의 `ANDROID_HOME`/`ANDROID_SERIAL`을 설정한 뒤 `node scripts/test-android-price-balance.mjs --prepare`, 이어 `node scripts/test-android-price-balance.mjs --apk artifacts/android/simonchichi-0.9.0.apk --expected-sha256 bb91608dd1f227b6e90c83f5f11870f0d62ee3f488dd2c9863d153f017843537`입니다. 별도 `native-price-balance-verify-results.json`은 이전 후보의 기록이므로 최종 결과의 근거로 사용하지 않습니다.

이번 네이티브 검사는 학습 답변·XP 주입·신규 상품 구매·초기화·시스템 백업 저장창/파일 선택창 조작을 하지 않았습니다. 새 구매·백업 6 복원은 웹·단위 결과로 구분합니다. **실제 Android 휴대폰과 iPhone 검증은 미실시**입니다.

## 최종 APK와 증거

- [simonchichi-0.9.0.apk](../artifacts/android/simonchichi-0.9.0.apk), **5,116,871 bytes**
- SHA-256: `bb91608dd1f227b6e90c83f5f11870f0d62ee3f488dd2c9863d153f017843537`
- 앱 ID `com.simonchichi.app`, 버전 `0.9.0` / versionCode `9`, 최소 API 24·대상 API 36
- 기존 앱과 같은 인증서의 APK v2 서명, `INTERNET` 권한 없음
- APK의 웹 자료 19개(번들 6개 포함)가 최종 `dist-android`와 바이트 단위로 일치: [APK 검사](../artifacts/android/price-balance-apk-verification.json)
- LAN 설치 페이지·APK·해시 파일 HTTP 200, 파일명·MIME·크기·해시 일치: [출시 검사](../artifacts/android/price-balance-download-verification.json) · [독립 재확인](../artifacts/android/price-balance-download-qa-verification.json)
- 최종 375px 화면: [새 배경 가격](../artifacts/screenshots/price-balance/chromium-new-background-prices-375.png) · [새 가격 구매 후 방](../artifacts/screenshots/price-balance/chromium-new-price-purchases-375.png)

중간 후보 `9bdb52aa…`는 버튼 두 줄 정리 전 파일입니다. 위 최종 `bb91608d…` APK와 구분하며 배포·최종 검증에는 위 파일을 사용합니다.

## 변경 파일

| 영역             | 파일                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 가격·영수증·백업 | `src/core/room-catalog.ts`, `src/core/types.ts`, `src/data/db.ts`                                                                                                                                                                             |
| 상점 가격 표시   | `src/features/reviews/AvatarRoom.tsx`, `src/styles/avatar-room.css`                                                                                                                                                                           |
| 버전·전달 페이지 | `package.json`, `package-lock.json`, `android/app/build.gradle`, `src/features/settings/SettingsScreen.tsx`, `scripts/serve-android-download.mjs`                                                                                             |
| 단위 검사        | `tests/unit/avatar-room-ui.test.tsx`, `tests/unit/economy.test.ts`, `tests/unit/economy-db.test.ts`, `tests/unit/db.test.ts`, `tests/unit/course-db.test.ts`, `tests/unit/test-first-db.test.ts`                                              |
| 웹 검사·fixture  | `tests/e2e/room.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/quest.spec.ts`, `tests/e2e/test-first.spec.ts`, `tests/e2e/fixtures/legacy-v5-native-0.8.json`, `tests/e2e/fixtures/funded-v6-pricing-test.json`, `tests/e2e/fixtures/README.md` |
| 재현 도구        | `scripts/create-funded-pricing-fixture.ts`, `scripts/test-android-price-balance.mjs`                                                                                                                                                          |
| 문서             | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서                                                                            |

## 실행과 남은 확인

일반 실행은 `npm install` 후 `npm run dev`입니다. 배포 빌드는 `npm run build`, Android 재생성은 Java 21·SDK 36 환경에서 `npm run android:build`, 같은 LAN으로 전달할 때는 `npm run android:serve`입니다. 기존 Android 앱을 삭제하지 말고 같은 서명의 새 APK로 업데이트합니다.

iPhone은 일반 빌드의 `dist/`를 HTTPS 정적 호스팅에 올리고 Safari → 공유 → 홈 화면에 추가로 설치합니다. 온라인으로 한 번 열어 오프라인 준비를 확인한 뒤 비행기 모드에서 학습·꾸미기·복원과 파일 앱 저장을 확인합니다. [실제 iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)는 수행 전 상태로 유지합니다. Playwright WebKit은 실제 iPhone 검증을 대신하지 않습니다.

다음 범위는 실제 기기의 표시·파일 복원 확인과 실제 학습 정답률/복습 사용량에 따른 가격 체감 관찰입니다. 추가 가격 변경이 필요하면 새 구매 버전을 명시하고 이전 영수증을 다시 계산하지 않습니다. 학습 내용의 교육적 적절성이나 가격의 장기 효과가 이번 자동 검사로 입증된 것은 아닙니다.
