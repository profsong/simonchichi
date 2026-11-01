# 구매 후 배경 미리보기와 새 배경 10종 — 0.7.0

> 이 문서는 0.7.0 당시 결과입니다. 현재 단어 테스트·마지막 오답 재시험은 [0.8.0 보고서](TEST_FIRST_FLOW_REPORT.md)를 확인하세요.

기준일: 2026-11-01. 미구매 배경은 이름·설명·가격·구매 버튼으로만 표시하고, 구매한 배경은 미리보기를 보여 줍니다. 기존 배경 4종에 새 장면 10종을 더해 총 14종을 제공합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 변경된 동작

미구매 배경 카드에는 SVG·이미지·장면·미리보기 DOM과 이미지 자리를 만들지 않습니다. 흐리게 가리거나 잠금 그림으로 대체하지 않습니다. 이름·상황 설명과 XP 가격을 읽고 구매하면 해당 배경이 장착되면서 그림이 나타납니다. 무료 민트 공부방은 처음부터 보입니다. 이미 산 배경은 다른 배경을 장착해도 모두 미리보기가 남으며 무료로 다시 장착할 수 있습니다.

옷·액세서리는 구매 전 미리보기를 유지합니다. 장면은 앱에 포함된 로컬 SVG이고 오프라인에서도 표시됩니다. 이 변경은 상점 표시 정책이며 번들 자료를 암호화하거나 원격에서 다운로드하는 기능은 아닙니다.

### 추가된 배경과 가격

가격 기준은 [room-catalog.ts](../src/core/room-catalog.ts)입니다. 전체 상품은 배경 14개·옷 4개·액세서리 4개, 총 22개입니다. 무료 3개·유료 19개이고 유료 전체 범위는 80~440 XP입니다. 기존 상품 ID와 가격은 유지합니다.

| 새 배경     | ID                   |   가격 |
| ----------- | -------------------- | -----: |
| 빗소리 서재 | `rain-library`       | 200 XP |
| 대나무 쉼터 | `bamboo-hideout`     | 260 XP |
| 구름 오두막 | `cloud-cabin`        | 280 XP |
| 산호 작업실 | `coral-studio`       | 320 XP |
| 달빛 천문대 | `moon-observatory`   | 400 XP |
| 눈꽃 산장   | `winter-chalet`      | 360 XP |
| 봄날 온실   | `spring-greenhouse`  | 300 XP |
| 등대 다락방 | `seaside-lighthouse` | 440 XP |
| 파란 음악방 | `music-studio`       | 340 XP |
| 반딧불 캠프 | `night-camp`         | 380 XP |

## 기록과 업데이트

구매 영수증과 장착 설정의 형식, Dexie 버전 3, 백업 스키마 4를 유지합니다. 기존 구매의 가격을 바꾸지 않아 이전 영수증과 보유품을 계속 사용할 수 있습니다. 구매는 사용 가능한 잔액만 줄이며 누적 획득 XP·답변·복습·과정 진도는 바꾸지 않습니다. 복습 정답 비례 보상과 중복 차단 정책은 0.6.0과 같습니다.

Android 사용자는 먼저 JSON 백업을 저장하고 **기존 앱을 삭제하지 않은 채 같은 서명의 0.7.0 APK를 덮어 설치**합니다. 새 배경은 APK에 포함되므로 PC 폴더를 고치기만 해서는 이미 설치한 앱에 추가되지 않습니다. 다음 배경 추가도 고유 ID·한국어 설명·가격·로컬 SVG를 함께 등록하고, 기존 ID/가격·구매 복원·미구매 이미지 부재를 검사한 뒤 새 빌드로 전달합니다.

## 검증 결과

| 검사                                                | 실제 결과                                                    |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `npm run typecheck`, `npm run lint`                 | 최종 소스 통과                                               |
| `npm run test`                                      | 13개 파일, 162개 통과                                        |
| `npx vitest run tests/unit/avatar-room-ui.test.tsx` | 새 UI 검사 4개 통과, 전체 단위 수에 포함                     |
| `npm run test:e2e`                                  | 최종 일반 빌드, Chromium·WebKit 20/20 통과                   |
| `npm run test:e2e:production`                       | 최종 일반 배포·초점 회귀 2/2 통과                            |
| `npm run build`                                     | 위 E2E의 일반 빌드 통과. 기존 대용량 청크 경고는 남음        |
| `npm run android:build`                             | 최종 0.7.0 APK 빌드 통과                                     |
| `node scripts/test-android-backgrounds.mjs --apk …` | API 36 에뮬레이터의 0.6.0→0.7.0 덮어 설치, 4개 검사 통과     |
| LAN 다운로드                                        | 페이지·APK·해시 파일 HTTP 200, MIME·파일명·크기·SHA-256 일치 |

웹 E2E는 총 **22/22** 통과했습니다. 미구매 배경 13개의 SVG·이미지·장면·미리보기·이미지 자리 DOM이 없으면서 설명·가격이 남고, 소유한 비장착 배경도 그림이 보이는지 검사했습니다. 새 UI 단위 검사는 구매 버튼 클릭만으로는 그림이 나타나지 않으며 저장된 소유권이 반영된 뒤에만 나타나는 조건과 옷/액세서리 미리보기 유지도 확인합니다.

브라우저의 실제 이전 0.5.0 백업 270 XP에서 기존 상품 3개와 새 빗소리 서재를 구매했습니다. 정상 복습 네 회의 보상 324 XP를 더해 **누적 594 / 지출 580 / 잔액 14 XP·구매 4개**가 맞았습니다. 빠른 두 번 구매는 영수증 한 건만 만들었습니다. 백업 4 내보내기→초기화→복원 후 여섯 테이블·친구·새 장착이 일치했고, 잘못된 가격은 거절했습니다. 오프라인 재실행과 무료 기본/보유 배경 재장착도 기록을 보존했습니다. 기존 두 과정·49단계·학습 중단/재개·복습 정답 비례 지급·단어장·이전 백업 검사도 모두 통과했습니다.

[네이티브 결과 JSON](../artifacts/android/native-backgrounds-results.json)은 최종 APK 해시를 기록합니다. 실제 0.6.0 앱의 **여섯 테이블·3개 구매·누적 735 / 지출 380 / 잔액 355 XP**를 덮어 설치 후 그대로 보존했습니다. 새 빗소리 서재를 200 XP로 한 번 구매하여 **누적 735 / 지출 580 / 잔액 155 XP·구매 4개**가 됐습니다. 기존 6개 세션·70개 답변, 수능 책·시폼푸린·옷·안경과 새 배경이 무료 재장착과 오프라인 강제 종료/재실행 후에도 유지됐습니다.

네이티브 검사 전후 비행기 모드 1·Wi-Fi 0·모바일 데이터 0, 외부 요청과 페이지 오류 0을 확인했습니다. **이번 네이티브 검사는 시스템 백업 저장창/파일 선택창을 조작하지 않았습니다.** 백업 4 검증은 별도 단위·웹 결과입니다. 실제 Android 휴대폰과 iPhone 검증은 미실시입니다.

새 10개 장면 갤러리를 직접 확인하여 공간·주요 소품으로 구분되고 친구 얼굴과 착장을 가리지 않는지 검토했습니다. 설명의 연·나침반·그림 도구·나무 바닥 표현을 실제 그림에 맞췄습니다. 375px 실제 상점과 빗소리 서재 장착 화면도 직접 확인했습니다.

### 최종 APK와 증거

- 파일: [simonchichi-0.7.0.apk](../artifacts/android/simonchichi-0.7.0.apk), **5,113,026 bytes**
- SHA-256: `e70183a7d510b54354a2d832dd09ce715328863a1160ebdfd121ad90e8147806`
- 앱 ID `com.simonchichi.app`, 버전 `0.7.0` / versionCode `7`, 최소 API 24·대상 API 36
- 기존 앱과 같은 인증서의 APK v2 서명 확인, `INTERNET` 권한 없음
- APK의 번들 자료 6개가 최종 `dist-android/assets`와 바이트 단위로 일치
- [다운로드 검사](../artifacts/android/backgrounds-download-verification.json) · [독립 HTTP 재확인](../artifacts/android/backgrounds-download-qa-verification.json)
- [Android 구매 후 미리보기](../artifacts/android/backgrounds-2026-11-01T11-30-09-260Z/03-owned-rain-library-preview.png) · [Android 오프라인 장착](../artifacts/android/backgrounds-2026-11-01T11-30-09-260Z/04-final-offline-rain-library.png)
- [미구매 배경 상점](../artifacts/screenshots/background-expansion/chromium-backgrounds-unowned-375.png) · [소유 배경 미리보기](../artifacts/screenshots/background-expansion/chromium-backgrounds-owned-375.png) · [빗소리 서재 장착](../artifacts/screenshots/background-expansion/chromium-room-equipped-375.png)
- [전체 14종 갤러리](../artifacts/avatar-room/backgrounds/all-14.png) · [WebKit 오프라인 복원](../artifacts/screenshots/background-expansion/webkit-room-restored-offline-375.png)

## 변경 파일

| 영역              | 파일                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상품·구매 전 표시 | `src/core/room-catalog.ts`, `src/features/reviews/AvatarRoom.tsx`, `src/styles/index.css`                                                                                                                                                         |
| 새 로컬 장면      | `src/components/RoomBackgrounds.tsx`, `src/components/AvatarRoomScene.tsx`                                                                                                                                                                        |
| UI·구매 호환 검사 | `tests/unit/avatar-room-ui.test.tsx`, `tests/unit/economy.test.ts`, `tests/unit/economy-db.test.ts`, `tests/unit/fixtures/legacy-v4-native-backup.json`, `tests/e2e/room.spec.ts`, `tests/e2e/helpers.ts`, `scripts/test-android-backgrounds.mjs` |
| 버전·전달         | `package.json`, `package-lock.json`, `android/app/build.gradle`, `src/features/settings/SettingsScreen.tsx`, `scripts/serve-android-download.mjs`                                                                                                 |
| 정책·안내         | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서 및 0.6.0 보고서의 이력 안내                                                    |

학습 콘텐츠와 단어·회차 ID, XP 보상 계산, 구매 원장 및 백업 스키마는 변경하지 않았습니다.

## iPhone 실행과 남은 범위

`npm run build`의 `dist/`를 HTTPS 정적 호스팅으로 제공하고 Safari 공유 → 홈 화면에 추가합니다. 온라인으로 한 번 열어 오프라인 준비를 마친 뒤 비행기 모드로 재실행합니다. 복습함 → 방 꾸미기에서 미구매 배경은 글만 보이는지, 구매 후 새 장면과 이전 소유 장면이 보이는지, 재장착·백업/복원 후 잔액과 장착이 유지되는지 확인합니다. [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 실제 기기·iOS·VoiceOver·파일 앱 결과를 기록합니다.

다음 범위는 실제 휴대폰의 긴 배경 목록 탐색, 장면 식별성과 접근성, 홈 화면 오프라인 실행 및 파일 백업 점검입니다. Playwright WebKit과 Android 에뮬레이터는 실제 휴대폰 검증을 대신하지 않습니다.
