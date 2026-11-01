# 액세서리 10종 추가 — 0.10.0

기준일: 2026-11-01. 세 친구가 사용할 수 있는 새 액세서리 10종을 더했습니다. 액세서리는 무료 미착용을 포함해 14종이며, 유료 가격 2,500 XP와 기존 소유품·잔액은 유지합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 추가한 상품과 기존 정책

| ID                 | 이름          |
| ------------------ | ------------- |
| `mint-ribbon`      | 민트 리본     |
| `star-hairpin`     | 별빛 머리핀   |
| `moon-hairpin`     | 달빛 머리핀   |
| `butterfly-clip`   | 나비 머리핀   |
| `daisy-pin`        | 데이지 핀     |
| `pearl-headband`   | 진주 머리띠   |
| `heart-sunglasses` | 하트 선글라스 |
| `mint-scarf`       | 민트 스카프   |
| `lucky-clover`     | 행운의 클로버 |
| `blue-beret`       | 하늘 베레모   |

[상품 목록](../src/core/room-catalog.ts)은 배경 14개·옷 4개·액세서리 14개, 총 **32개(무료 3·유료 29)**입니다. 기존 상품의 ID·가격·모습은 유지합니다. 새 장식은 로컬 SVG로 앱에 포함하며 몬치치·시치와레·시폼푸린의 전체 모습과 얼굴 미리보기에 적용합니다. 액세서리는 구매 전에도 미리 볼 수 있고 한 번에 하나를 장착합니다. 구매한 소유품 재장착은 무료입니다.

미구매 배경의 그림 숨김은 그대로입니다. 배경 12,000 XP·옷 6,000 XP·액세서리 2,500 XP, 새 구매의 `pricingVersion: 2`, Dexie 3, 백업 6 및 이전 스키마 1~6 호환을 바꾸지 않습니다. 새 상품에는 존재하지 않았던 v1 가격을 만들지 않습니다. 기존 영수증의 금액·소유권·누적 XP·잔액과 학습 보상 공식은 유지합니다. 가격의 학습량 가정은 [0.9.0 보고서](PRICE_BALANCE_REPORT.md)에 있습니다.

## 그림 검토

[몬치치](../artifacts/avatar-accessories/monchichi-10.png)·[시치와레](../artifacts/avatar-accessories/sichiware-10.png)·[시폼푸린](../artifacts/avatar-accessories/sipompurin-10.png) 시트를 각각 열어 10종×3친구의 전체 모습과 얼굴 미리보기를 독립 검토했습니다. 장식별 실루엣이 구분되고 얼굴·귀·목 장식이 잘리지 않으며 하트 선글라스 안의 눈도 보입니다. 머리띠·베레모와 기존 옷의 조합도 확인했습니다.

[시각 검사 기록](../artifacts/avatar-accessories/visual-checks.json)은 신규 30조합의 전체/얼굴 장식 경계 60개가 viewBox 안에 있고, 기존 액세서리·옷·표정 조합 240개 렌더 해시가 이전과 같음을 기록합니다. 경계·해시 검사는 그림의 교육적/미적 품질을 자동 판정하는 검사가 아니며 실제 시트 검토와 구분합니다. [신규 10종 보기](../artifacts/avatar-accessories/new-10.png)

## 검증 결과

| 검사                                                                      | 실제 결과                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                                       | 최종 전체 소스 통과                                           |
| `npm run test`                                                            | 14개 파일, 180개 통과                                         |
| `npx vitest run tests/unit/avatar-room-ui.test.tsx`                       | 7개 통과, 신규 미리보기·가격·선택 액션을 세 친구에서 확인     |
| `npm run test:e2e`                                                        | 최초 24개 중 23개 통과, WebKit 합성 대용량 복원 대기 초과 1개 |
| `npx playwright test tests/e2e/room.spec.ts --project=webkit --workers=1` | 대기 시간 보정 후 1/1 통과                                    |
| `npm run test:e2e:production`                                             | 최종 일반 배포 Chromium/WebKit 2/2 통과                       |
| `npm run android:build`                                                   | 최종 0.10.0 APK 빌드 통과                                     |
| 네이티브 0.9.0→0.10.0 검사                                                | 최종 APK로 4/4 통과                                           |

주 E2E는 12개 작업자가 병렬 실행되는 동안 WebKit의 3,191답변 합성 백업 복원이 60초 대기를 넘어 한 건 실패했습니다. 이 복원 대기를 120초로 늘리고 해당 WebKit 방 시나리오를 단독 재검사하여 통과했습니다. 저장소·앱 동작 코드는 변경하지 않았습니다. 기존 주 검사 23개와 단독 재검사 1개, 일반 배포 2개를 합해 **26개 고유 웹 시나리오**를 확인했습니다. 전체 주 검사 24개를 다시 실행한 것으로 보고하지 않습니다. [최초 실행 기록](../artifacts/accessories/initial-e2e-report.json) · [대기 초과 기록](../artifacts/accessories/webkit-large-backup-timeout.md)

단위 경제/DB 검사는 신규 10종을 각각 중복 호출해도 영수증 10개·지출 25,000 XP만 생기는지, 기존 영수증과 함께 백업 6으로 복원되는지, 신규 ID의 가격 버전을 지워 과거 영수증으로 위장하면 모두 거절하는지 확인했습니다. SVG의 시각적 적절성은 위의 별도 그림 검토로 구분합니다.

최종 WebKit 방 검사는 약 2.5분에 통과했습니다. 316세션·3,191답변 합성 백업의 파일 선택·확인부터 완료 문구까지 관찰한 복원 시간은 Chromium 811/796ms, WebKit 60,955/60,918ms였습니다. 단일 실행의 관찰값이며 실제 iPhone 측정이나 성능 보장이 아닙니다. 대용량 복원의 긴 대기는 사용성 확인 대상으로 남습니다. [Chromium 시간 기록](../artifacts/accessories/restore-timings-chromium.json) · [WebKit 시간 기록](../artifacts/accessories/restore-timings-webkit.json) · [재검사 결과](../artifacts/accessories/final-webkit-room-e2e-report.json) · [일반 배포 결과](../artifacts/accessories/final-production-e2e-report.json)

웹 새 구매 검사는 이전 단계에서 공개 DB API로 생성한 [합성 고잔액 fixture](../tests/e2e/fixtures/funded-v6-pricing-test.json)를 재사용합니다. 수작업 XP 주입이나 실제 학습자의 활동 기록이 아닙니다. 누적 30,662 / 지출 580 / 잔액 30,082 XP에서 구름 오두막 12,000 + 세일러 셔츠 6,000 + 새 민트 리본 2,500 = 20,500 XP를 한 번씩 구매하는 경로를 확인했습니다. 누적 XP는 30,662 그대로이며 지출 21,080 / 잔액 9,582 XP·영수증 7개가 됐습니다. 중복 클릭에도 민트 리본 영수증은 하나였고, 세 친구를 차례로 선택한 뒤에도 같은 새 장식이 보였습니다. 백업 6 내보내기→초기화→복원·오프라인 재실행 후 장식·잔액·학습 기록이 일치했습니다. 기존 기록 보존용 원본 fixture와 생성 과정은 [설명](../tests/e2e/fixtures/README.md)을 참고하세요.

실제 앱의 375px 상점 위·아래와 세 친구의 민트 리본 장착을 직접 시각 확인했습니다. [새 액세서리 미리보기](../artifacts/screenshots/accessory-expansion/chromium-new-accessories-preview-375.png) · [목록 아래](../artifacts/screenshots/accessory-expansion/chromium-new-accessories-preview-bottom-375.png) · [몬치치](../artifacts/screenshots/accessory-expansion/chromium-mint-ribbon-monchichi-375.png) · [시치와레](../artifacts/screenshots/accessory-expansion/chromium-mint-ribbon-sichiware-375.png) · [시폼푸린](../artifacts/screenshots/accessory-expansion/chromium-mint-ribbon-sipompurin-375.png)

## 네이티브 업데이트와 최종 APK

[최종 네이티브 검사](../artifacts/android/native-accessories-results.json)는 실제 0.9.0 설치 상태에서 0.10.0을 `adb install -r`로 덮어 설치해 **4/4 통과**했습니다. 업데이트 전후 여섯 테이블이 완전히 같으며 **7개 세션·101개 답변·4개 구매, 누적 998 / 지출 580 / 잔액 418 XP**를 유지했습니다.

실제 상점의 액세서리 14개·신규 10개 SVG 미리보기·2,500 XP 가격과 2,082 XP 부족 안내를 확인했습니다. 전체 상품 32개와 기존 소유품 4개의 무료 재장착, 반복 탭의 무차감, 미구매 배경 미리보기 숨김도 유지됐습니다. 비행기 모드 1·Wi-Fi 0·모바일 데이터 0에서 강제 종료 후 다시 열어도 기록이 같았고 service worker 0·관찰된 외부 요청 0·페이지 오류 0이었습니다.

이번 네이티브 검사는 학습 답변·XP 주입·신규 구매·초기화·시스템 백업 저장창/파일 선택창 조작을 하지 않았습니다. 새 구매 성공과 백업 6 복원은 웹·단위 검사로 구분합니다. [네이티브 신규 리본](../artifacts/android/accessories-2026-11-01T12-45-29-022Z/03-new-mint-ribbon.png) · [신규 베레모](../artifacts/android/accessories-2026-11-01T12-45-29-022Z/03-new-blue-beret.png) · [오프라인 재실행](../artifacts/android/accessories-2026-11-01T12-45-29-022Z/05-offline-restored-room.png)

실제 명령은 테스트 에뮬레이터의 `ANDROID_HOME`/`ANDROID_SERIAL`을 설정하고 `node scripts/test-android-accessories.mjs --prepare`, 이어 `node scripts/test-android-accessories.mjs --apk artifacts/android/simonchichi-0.10.0.apk --expected-sha256 60b18de874e916506f9c63013d254e61721da311a8a41a40e9c0206284663f85`를 실행했습니다.

- [simonchichi-0.10.0.apk](../artifacts/android/simonchichi-0.10.0.apk), **5,117,926 bytes**
- SHA-256: `60b18de874e916506f9c63013d254e61721da311a8a41a40e9c0206284663f85`
- 앱 ID `com.simonchichi.app`, 버전 `0.10.0` / versionCode `10`, 최소 API 24·대상 API 36
- 기존 인증서와 같은 APK v2 서명, `INTERNET` 권한 없음
- APK의 웹 자료 19개(번들 6개 포함)가 최종 `dist-android`와 바이트 단위로 일치: [APK 검사](../artifacts/android/accessories-apk-verification.json)
- LAN 설치 페이지·APK·해시 파일 HTTP 200, 파일명·MIME·크기·해시 일치: [출시 검사](../artifacts/android/accessories-download-verification.json) · [독립 재확인](../artifacts/android/accessories-download-qa-verification.json)

## 변경 파일

| 영역           | 파일                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 상품 목록      | `src/core/room-catalog.ts`                                                                                                                                         |
| 세 친구의 장식 | `src/components/MascotAccessory.tsx`, `src/components/Mascot.tsx`                                                                                                  |
| 버전·설치 전달 | `package.json`, `package-lock.json`, `android/app/build.gradle`, `src/features/settings/SettingsScreen.tsx`, `scripts/serve-android-download.mjs`                  |
| 단위 검사      | `tests/unit/avatar-room-ui.test.tsx`, `tests/unit/economy.test.ts`, `tests/unit/economy-db.test.ts`                                                                |
| 브라우저 검사  | `tests/e2e/room.spec.ts`, `tests/e2e/helpers.ts`                                                                                                                   |
| 시각 검사 도구 | `artifacts/avatar-accessories/render.tsx`, `artifacts/avatar-room/capture-accessory-baseline.tsx`                                                                  |
| 네이티브 재현  | `scripts/test-android-accessories.mjs`                                                                                                                             |
| 문서           | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서 |

저장소·보상 생산 코드는 이번에 변경하지 않았습니다. 이전 보고서의 상품 수·해시·검사 결과는 해당 버전의 이력으로 남깁니다.

## 설치와 남은 확인

기존 Android 앱을 삭제하지 않고 같은 서명의 0.10.0 APK를 설치합니다. 새 장식은 재빌드한 앱에 포함되며 PC 폴더와 실시간 연결하지 않습니다. `npm run android:serve`는 설치 파일을 같은 LAN으로 전달할 때만 필요합니다. 설치 뒤에는 서버 없이 오프라인으로 사용할 수 있습니다.

iPhone은 `npm run build`의 `dist/`를 HTTPS 정적 호스팅에 올리고 Safari → 공유 → 홈 화면에 추가로 설치합니다. 온라인으로 한 번 열어 오프라인 준비를 확인한 뒤 비행기 모드에서 새 장식·학습·백업 복원을 확인합니다. [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기와 실제 결과를 기록하며, **실제 Android 휴대폰과 iPhone은 아직 미검증**입니다. WebKit·Android 에뮬레이터 결과를 실물 기기의 검사로 대신하지 않습니다.

다음 범위는 실제 기기에서 작은 프로필의 장식 가독성·VoiceOver·파일 저장/복원 확인입니다. 자동 검사나 그림 검토로 학습 효과나 모든 기기의 렌더링을 보장하지 않습니다.
