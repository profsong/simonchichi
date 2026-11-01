# 일반·프리미엄 옷 10종 추가 — 0.11.0

기준일: 2026-11-01. 새 옷 10종을 추가해 무료 원래 옷 포함 14종으로 확장했습니다. 일반 신상품 7종은 6,000 XP, 지정 프리미엄 3종은 7,000 XP이며 기존 상품·구매 기록·잔액은 유지합니다. [사용 안내](USER_GUIDE.md) · [Android 설치](ANDROID_INSTALL.md)

## 추가한 상품

| ID                 | 이름            |     가격 |
| ------------------ | --------------- | -------: |
| `nike-hoodie`      | 나이키 후드티   | 7,000 XP |
| `adidas-puffer`    | 아디다스 패딩   | 7,000 XP |
| `burberry-coat`    | 버버리 코트     | 7,000 XP |
| `mint-cardigan`    | 민트 가디건     | 6,000 XP |
| `denim-jacket`     | 데님 재킷       | 6,000 XP |
| `striped-knit`     | 스트라이프 니트 | 6,000 XP |
| `lavender-sweater` | 라벤더 맨투맨   | 6,000 XP |
| `raincoat`         | 레몬 레인코트   | 6,000 XP |
| `cozy-fleece`      | 크림 플리스     | 6,000 XP |
| `ribbon-dress`     | 리본 원피스     | 6,000 XP |

[상품 목록](../src/core/room-catalog.ts)은 배경 14·옷 14·액세서리 14, 총 **42개(무료 3·유료 39)**입니다. 옷은 구매 전 미리보기를 제공하며 세 친구가 함께 사용할 수 있고 한 번에 한 벌을 장착합니다. 소유품 재장착은 무료입니다. 미구매 배경 그림 숨김·액세서리 미리보기는 그대로입니다.

프리미엄 7,000 XP는 위 세 신규 ID에만 적용합니다. 이전 32개 상품의 가격과 기존 네 벌의 모습을 유지하며, 원래 6,000 XP 옷을 다시 가격 매기거나 과거 영수증에 차액을 청구하지 않습니다. `pricingVersion: 2`, 백업 6/가져오기 1~6, Dexie 3과 학습 보상 공식을 유지합니다. 새 상품에는 과거 v1 가격이 없습니다. 개별 상품의 실제 가격을 검증하므로 일반/프리미엄 금액을 서로 바꾸면 거절합니다.

## 그림 검토

[몬치치](../artifacts/avatar-outfits/monchichi-10.png)·[시치와레](../artifacts/avatar-outfits/sichiware-10.png)·[시폼푸린](../artifacts/avatar-outfits/sipompurin-10.png) 시트를 각각 열어 신규 10종×3친구의 전체 모습과 얼굴 미리보기를 독립 확인했습니다. 옷의 실루엣·포켓·깃·띠·무늬가 구분되고 얼굴·귀·손발과 후드가 자연스럽게 연결됩니다. [신규 10종 보기](../artifacts/avatar-outfits/new-10.png)

세 친구 각각의 [몬치치 동작](../artifacts/avatar-outfits/monchichi-motions.png)·[시치와레 동작](../artifacts/avatar-outfits/sichiware-motions.png)·[시폼푸린 동작](../artifacts/avatar-outfits/sipompurin-motions.png) 시트도 직접 확인했습니다. 네 옷×네 표정/팔 동작×세 친구, 총 48조합에서 소매와 손·민트 리본이 맞물리는 모습을 확인했습니다.

경계 검사 중 기존 동그란 안경의 두 번째 흰 반사광이 상대 좌표 `m` 때문에 렌즈 밖으로 이동하는 오류를 발견했습니다. 해당 시작 좌표를 절대 좌표 `M`으로 바로잡고 짧은 선의 상대 좌표 명령 `l`을 명시하는 최소 수정을 별도로 포함합니다. 안경 상품·가격·영수증·소유권은 바꾸지 않으며 기존 렌더 보존 검사에서는 이 의도된 그림 교정만 구분합니다. 교정 후 세 친구의 패딩+동그란 안경 전체/얼굴 미리보기를 다시 직접 확인해 반사광이 렌즈 안에 있고 화면 밖 잔선이 없음을 확인했습니다. [시각 검사 기록](../artifacts/avatar-outfits/visual-checks.json)은 기존 840개 렌더 중 780개가 동일하고 동그란 안경을 포함한 60개만 의도된 반사광 교정으로 달라짐을 기록합니다. 신규 의상 전체/얼굴 경계 60개도 통과했습니다. 모든 기존 렌더가 동일하다고 보고하지 않습니다.

## 검증 결과

| 검사                                                | 실제 결과                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                 | 최종 전체 소스 통과                                              |
| `npm run test`                                      | 14개 파일, 186개 통과                                            |
| `npx vitest run tests/unit/avatar-room-ui.test.tsx` | 10개 통과                                                        |
| `npm run test:e2e`                                  | 최종 소스·작업자 2개로 Chromium/WebKit 24/24 통과, 5.1분         |
| `npm run test:e2e:production`                       | 최종 일반 배포 Chromium/WebKit 2/2 통과                          |
| 일반 웹 빌드                                        | E2E 준비 명령의 `npm run build` 통과, 기존 대용량 청크 경고 유지 |
| `npm run android:build`                             | 최종 0.11.0 APK 빌드 통과                                        |
| 네이티브 0.10.0→0.11.0 검사                         | 최종 APK로 4/4 통과                                              |

주 E2E 24개는 이번 최종 소스에서 첫 실행으로 모두 통과했습니다. 일반 배포 2개를 더해 **웹 26개 시나리오가 모두 통과**했습니다. [주 검사 기록](../artifacts/outfits/main-e2e-report.json) · [일반 배포 기록](../artifacts/outfits/production-e2e-report.json)

UI 단위 10개는 신규 일반·프리미엄 가격, 구매 전 미리보기, 세 친구의 선택 액션과 기존 배경·액세서리 규칙을 확인했습니다.

경제/DB 검사에는 신규 옷 10종 각각의 중복 구매, 개별 6,000/7,000 XP 가격, 기존 영수증과 함께 백업 6 복원, 일반/프리미엄 가격 변조와 과거 가격 버전 위장 거절이 포함됩니다. 기존 합성 고잔액 fixture를 격리된 저장소에서 재사용했으며 더 큰 fixture나 수작업 XP를 추가하지 않았습니다.

웹 새 구매 검사도 [기존 합성 고잔액 fixture](../tests/e2e/fixtures/funded-v6-pricing-test.json)를 사용합니다. 정상 DB API로 생성된 테스트 자료이며 실제 학습자의 활동 기록이 아닙니다. 누적 30,662 / 지출 580 / 잔액 30,082 XP에서 민트 가디건 6,000 + 나이키 후드티 7,000 + 민트 리본 2,500 = **15,500 XP**를 구매하는 경로를 확인했습니다. 누적 XP는 30,662 그대로이며 지출 16,080 / 잔액 14,582 XP·영수증 7개가 됐습니다. 중복 클릭에도 각각 한 번만 결제되고 소유한 일반/프리미엄 옷의 재장착은 무료였습니다. 나이키 후드티를 세 친구에게 적용하고 구매·장착·학습 기록을 백업 6 내보내기→초기화→복원과 오프라인 재실행으로 확인했습니다. 원본 이전 기록과 합성 자료의 구분은 [fixture 설명](../tests/e2e/fixtures/README.md)에 있습니다.

316세션·3,191답변 합성 백업의 파일 선택·확인부터 완료 문구까지 관찰한 복원 시간은 Chromium 509/716ms, WebKit 60,937/60,938ms였습니다. 단일 실행의 관찰값이며 실제 iPhone 측정이나 성능 보장이 아닙니다. 이전 단계에서 확인한 대용량 복원의 긴 대기는 남아 있어 해당 테스트의 복원 대기를 120초로 유지합니다. [Chromium 시간 기록](../artifacts/outfits/restore-timings-chromium.json) · [WebKit 시간 기록](../artifacts/outfits/restore-timings-webkit.json)

실제 375px 상점과 세 친구의 나이키 후드티·민트 리본 조합을 직접 시각 확인했습니다. [프리미엄 옷 미리보기](../artifacts/screenshots/outfit-expansion/chromium-premium-outfit-previews-375.png) · [일반 옷 미리보기](../artifacts/screenshots/outfit-expansion/chromium-standard-outfit-previews-375.png) · [몬치치](../artifacts/screenshots/outfit-expansion/chromium-nike-hoodie-monchichi-375.png) · [시치와레](../artifacts/screenshots/outfit-expansion/chromium-nike-hoodie-sichiware-375.png) · [시폼푸린](../artifacts/screenshots/outfit-expansion/chromium-nike-hoodie-sipompurin-375.png)

## 네이티브 업데이트와 최종 APK

[최종 네이티브 검사](../artifacts/android/native-outfits-results.json)는 실제 0.10.0 설치 상태에서 0.11.0을 덮어 설치하여 **4/4 통과**했습니다. 업데이트 전후 여섯 테이블 전체가 같으며 **7개 세션·101개 답변·4개 구매, 누적 998 / 지출 580 / 잔액 418 XP**를 보존했습니다.

옷 14개와 신규 10개 SVG 미리보기·전체 상품 42개를 확인했습니다. 일반 6,000 XP·프리미엄 7,000 XP에 맞춰 각각 5,582/6,582 XP 부족 안내와 구매 차단이 표시됐습니다. 기존 소유품 4개의 반복 무료 재장착은 추가 영수증이나 차감을 만들지 않았습니다. 비행기 모드 1·Wi-Fi 0·모바일 데이터 0에서 강제 종료 후 재실행해도 기록이 같았고 service worker 0·관찰된 외부 요청 0·페이지 오류 0이었습니다.

이번 네이티브 검사는 학습 답변·XP 주입·신규 상품 구매·초기화·시스템 백업 저장창/파일 선택창 조작을 하지 않았습니다. 새 구매 성공과 백업 복원은 웹·단위 검사로 구분합니다. [나이키 후드티](../artifacts/android/outfits-2026-11-01T13-15-59-649Z/03-new-nike-hoodie.png) · [버버리 코트](../artifacts/android/outfits-2026-11-01T13-15-59-649Z/03-new-burberry-coat.png) · [리본 원피스](../artifacts/android/outfits-2026-11-01T13-15-59-649Z/03-new-ribbon-dress.png)

실제 명령은 전용 에뮬레이터의 `ANDROID_HOME`/`ANDROID_SERIAL`을 설정하고 `node scripts/test-android-outfits.mjs --prepare`, 이어 `node scripts/test-android-outfits.mjs --apk artifacts/android/simonchichi-0.11.0.apk --expected-sha256 eac298e44c1b60897cd7e4c0c2fd65a3bd73548b8346c899322e5a7fa77c1f5b`를 실행했습니다.

- [simonchichi-0.11.0.apk](../artifacts/android/simonchichi-0.11.0.apk), **5,122,226 bytes**
- SHA-256: `eac298e44c1b60897cd7e4c0c2fd65a3bd73548b8346c899322e5a7fa77c1f5b`
- 앱 ID `com.simonchichi.app`, 버전 `0.11.0` / versionCode `11`, 최소 API 24·대상 API 36
- 기존 인증서와 같은 APK v2 서명, `INTERNET` 권한 없음
- 웹 자료 19개(번들 6개 포함)가 최종 `dist-android`와 바이트 단위로 일치: [APK 검사](../artifacts/android/outfits-apk-verification.json)
- LAN 설치 페이지·APK·해시 파일 HTTP 200, 파일명·MIME·크기·해시 일치: [출시 검사](../artifacts/android/outfits-download-verification.json) · [독립 재확인](../artifacts/android/outfits-download-qa-verification.json)

## 변경 파일

| 영역           | 파일                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 상품·가격      | `src/core/room-catalog.ts`                                                                                                                                         |
| 옷 그림        | `src/components/MascotOutfit.tsx`, `src/components/Mascot.tsx`, `src/components/MascotAccessory.tsx`                                                               |
| 버전·설치 전달 | `package.json`, `package-lock.json`, `android/app/build.gradle`, `src/features/settings/SettingsScreen.tsx`, `scripts/serve-android-download.mjs`                  |
| 단위 검사      | `tests/unit/avatar-room-ui.test.tsx`, `tests/unit/economy.test.ts`, `tests/unit/economy-db.test.ts`                                                                |
| 브라우저 검사  | `tests/e2e/room.spec.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`                                                                                           |
| 시각 검사 도구 | `artifacts/avatar-outfits/render.tsx`, `artifacts/avatar-outfits/capture-baseline.tsx`                                                                             |
| 네이티브 재현  | `scripts/test-android-outfits.mjs`                                                                                                                                 |
| 문서           | `AGENTS.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서 |

저장소·보상 생산 코드는 변경하지 않았습니다. 이전 보고서는 해당 버전의 결과로 보존합니다. Playwright는 대용량 합성 백업 검사의 동시 브라우저 수를 제한하도록 기본 작업자를 2개로 두었습니다.

## 설치와 남은 확인

기존 Android 앱을 삭제하지 않고 같은 서명의 0.11.0 APK를 설치합니다. 새 그림은 재빌드한 앱에 포함되며 PC 파일을 실시간으로 읽지 않습니다. `npm run android:serve`는 같은 LAN으로 설치 파일을 전달할 때만 필요하고 설치 뒤에는 PC 서버 없이 오프라인으로 실행합니다.

iPhone은 `npm run build`의 `dist/`를 HTTPS 정적 호스팅에 올린 뒤 Safari → 공유 → 홈 화면에 추가로 설치합니다. 온라인에서 한 번 열어 오프라인 준비를 확인하고 비행기 모드에서 장착·학습·백업 복원을 확인합니다. [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기·iOS·실제 결과를 기록합니다. **실제 Android 휴대폰과 iPhone 검증은 미실시**이며 브라우저·에뮬레이터 결과로 대신하지 않습니다.

다음 범위는 실제 기기의 작은 상점·프로필·VoiceOver·파일 저장/복원 확인입니다. 대용량 학습 기록 복원의 소요시간도 실기기에서 확인할 대상으로 남습니다.
