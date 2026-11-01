# 시몬치치 Android APK 빌드 보고서

기준일: 2026-10-23 (KST)

Capacitor Android 앱과 개인 체험용 APK를 생성했습니다. 앱 화면·아이콘·문제은행을 APK에 포함하고, 설치 후 PC 서버나 네트워크 AI에 의존하지 않는 구성을 적용했습니다.

## 결과 파일

| 항목           | 값                                                                            |
| -------------- | ----------------------------------------------------------------------------- |
| APK            | [simonchichi-0.1.0-demo.apk](../artifacts/android/simonchichi-0.1.0-demo.apk) |
| 체크섬         | [APK SHA-256 파일](../artifacts/android/simonchichi-0.1.0-demo.apk.sha256)    |
| 파일 크기      | 4,542,112바이트 (약 4.3 MiB)                                                  |
| 앱 이름        | 시몬치치                                                                      |
| application ID | `com.simonchichi.app`                                                         |
| 버전           | `0.1.0`, versionCode `1`                                                      |
| SDK            | minSdk `24`, targetSdk/compileSdk `36`                                        |
| 빌드 종류      | 개인 체험용 디버그 서명, Play 스토어 릴리스 아님                              |

SHA-256:

```text
751bfb9a7e1782ffe0c4f6c8a9ee087d1f92422419035e695fc12c6b588af863
```

실제 APK 빌드에는 Android Gradle Plugin이 선택한 Build-Tools 35.0.0을 사용했습니다. SDK Platform 36과 Build-Tools 36.0.0도 설치되어 있습니다.

## 구현과 저장 방식

- `capacitor.config.ts`의 `webDir`은 `dist-android`이며 `server.url`은 없습니다. 실제 APK ZIP에서도 이 설정과 HTML·JS·아이콘 포함을 확인했습니다.
- Android 실행에서는 서비스 워커를 등록하지 않고 패키지 자료를 사용합니다. 웹/PWA에서는 명시적으로 서비스 워커를 등록하는 기존 오프라인 흐름을 유지합니다.
- 최초 실행은 일반 학습 모드입니다. 사용자가 설정에서 데모를 켜면 Preferences에 선택을 저장하고 다음 앱 실행에 복원합니다. 초안 문제를 승인 상태로 바꾸지 않습니다.
- 학습 기록은 Dexie/IndexedDB를 유지합니다. 네이티브 백업은 시스템 파일 저장창을 사용하고, 취소·용량 제한·저장 오류를 처리합니다. 가져오기는 기존 JSON 검증과 복원을 사용합니다.
- APK manifest 검사에서 인터넷·일반 저장소 권한이 없음을 확인했습니다. 앱의 내부 receiver 권한만 있으며 자동 클라우드 백업과 기기 전송은 제외합니다.
- APK 전달용 서버는 지정 파일·설치 안내·SHA-256만 제공합니다. 앱 실행에는 서버가 필요하지 않습니다.

Capacitor 8의 Android API 24 이상 지원과 SDK 36 기준을 따랐습니다. [Capacitor Android](https://capacitorjs.com/docs/android), [Capacitor 8 전환 지침](https://capacitorjs.com/docs/updating/8-0)

`server.url`은 외부 라이브 리로드용 설정이므로 사용하지 않습니다. 모드 선택에는 Android SharedPreferences를 사용하는 Preferences를 적용했고, 백업에는 사용자가 파일 위치를 고르는 Storage Access Framework를 사용합니다. [Capacitor 설정](https://capacitorjs.com/docs/config), [Preferences](https://capacitorjs.com/docs/apis/preferences), [Android 파일 저장](https://developer.android.com/training/data-storage/shared/documents-files)

주요 구현 파일은 `android/` 네이티브 프로젝트, `capacitor.config.ts`, `src/platform/`, `src/app/App.tsx`, `src/features/settings/SettingsScreen.tsx`, `vite.config.ts`, `.env.android-demo`, `scripts/build-android.mjs`, `scripts/serve-android-download.mjs`입니다. 런타임 단위 검사는 `tests/unit/runtime.test.tsx`, 네이티브 백업 입력 검사는 `android/app/src/test/`에 있습니다. 설치된 앱 검사는 `scripts/test-android.mjs`와 `scripts/test-android-backup.mjs`로 재현합니다.

## 실행한 검사

| 검사                                   | 결과                                       |
| -------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                    | 통과                                       |
| `npm run lint`                         | 통과                                       |
| `npm run test`                         | 71개 통과                                  |
| `npm run build`                        | 통과                                       |
| `npm run test:e2e`                     | Chromium 3개 + WebKit 3개, 총 6개 통과     |
| `npm run test:e2e:production`          | Chromium 1개 + WebKit 1개, 총 2개 통과     |
| Android Gradle `assembleDebug`         | `BUILD SUCCESSFUL`, APK 생성               |
| Android JVM 단위 테스트                | 3개 통과                                   |
| `node scripts/test-android.mjs`        | Android 에뮬레이터 10개 항목 통과          |
| `node scripts/test-android-backup.mjs` | 실제 시스템 파일 저장창 3개 항목 통과      |
| `apksigner verify`                     | APK v2 서명 검증 통과, 서명자 1명          |
| APK `aapt` 검사                        | 한글 이름·ID·SDK·권한 확인                 |
| 실제 APK HTTP 다운로드                 | 200, APK MIME·파일명·바이트와 SHA-256 일치 |
| 다운로드 경로 제한                     | 임의 파일·상위 경로 404, POST 405          |
| 설치 페이지 375px                      | 가로 넘침 없음, 다운로드 버튼 44px 이상    |

서비스 워커의 자동 주입을 끈 최종 설정에서 데모 E2E 6개를 다시 실행했습니다. 전체 퀘스트·오프라인·새로고침·중복 XP 방지·다음날 복습·백업 복원이 통과했습니다. 일반 배포는 `?demo=1` 주소에서도 초안을 제공하지 않습니다. 네이티브 모드 저장·복원과 서비스 워커 미등록·백업 취소는 런타임 단위 테스트로 확인했습니다.

다운로드한 APK는 디스크의 빌드 산출물과 바이트 단위로 같으며 체크섬 파일과도 일치합니다. [375px 설치 페이지 캡처](../artifacts/android/download-page-375.png)를 보관했습니다. PC에서 LAN 주소로도 응답을 확인했으며 휴대폰의 Wi-Fi 접속 자체는 별도 확인 대상입니다.

전체 콘텐츠를 포함한 JS 번들에 대한 Vite의 500kB 권고 경고는 남아 있습니다.

## Android 기기 실행 확인

Android 16 / API 36 x86_64 에뮬레이터(`emulator-5554`)에서 **설치 전 비행기 모드와 Wi-Fi 끄기**를 적용한 뒤 APK를 설치하고 첫 실행을 확인했습니다. [첫 오프라인 실행 화면](../artifacts/android/first-launch.png)에서 시몬치치 이름·몬치치·하단 탐색을 확인했고 가로 넘침이 없었습니다.

`node scripts/test-android.mjs`로 실제 설치된 Android WebView를 검사한 결과 **10개 확인 항목 모두 통과**했습니다. [네이티브 스모크 결과 JSON](../artifacts/android/native-smoke-results.json)에 기기·네트워크 상태와 세부 결과를 저장했습니다.

- 처음에는 일반 학습 모드로 실행하고 설정에서 직접 데모를 켠 뒤 포함된 콘텐츠로 진행했습니다.
- 비행기 모드 1, Wi-Fi 0, 모바일 데이터 0 상태를 시작과 종료 시 확인했습니다. 서비스 워커 등록과 컨트롤러는 0/없음이었습니다.
- 같은 답을 여러 번 눌러도 첫 시도 1건·10 XP만 기록했고, 새로고침 뒤에도 중복 지급하지 않았습니다.
- 퀘스트 완료 전 앱 강제 종료·재실행으로 데모 선택과 문제·피드백·기록이 유지됐습니다.
- 전체 오프라인 퀘스트가 응답 5건·80 XP로 완료됐고 실제 독해 근거, 새 어휘 5개의 다음날 복습 예약을 확인했습니다.
- 완료 후 두 번째 강제 종료·재실행에서도 완료 세션과 전체 저장 기록이 같았습니다.
- 검사 중 수집된 WebView JavaScript 오류와 외부 요청은 모두 0건이었습니다.

이어서 `node scripts/test-android-backup.mjs`로 실제 Android 시스템 파일 저장창을 조작하여 **3개 확인 항목 모두 통과**했습니다. 취소 시 기록과 파일이 그대로 유지됐고, 저장 시 Downloads에 `시몬치치-demo-2026-10-23.json`이 생성됐습니다. UTF-8 JSON의 모드·스키마·콘텐츠 버전과 attempts/reviews/sessions/rewards/settings 다섯 테이블이 원본과 같으며, 응답 5건·80 XP가 그대로 유지됐습니다. 저장 검사도 비행기 모드에서 수행했습니다. [네이티브 백업 결과 JSON](../artifacts/android/native-backup-results.json)

**Android의 실제 가져오기 파일 선택창은 아직 검증하지 않았습니다.** 가져오기 구조·스키마·데이터 복원은 웹 E2E와 단위 검사로 확인했습니다. 실제 Android 휴대폰과 실제 iPhone 확인은 아직 수행하지 않았습니다. 에뮬레이터 결과는 제조사별 휴대폰·실제 키보드·접근성 확인을 대신하지 않습니다.

## 설치와 다음 확인

PC에서 `npm run android:serve`를 실행하고 같은 Wi-Fi의 Android에서 터미널에 표시된 4180 포트 주소를 엽니다. 최초 다운로드·설치 이후 서버를 종료하고 비행기 모드에서 앱을 다시 실행합니다. 자세한 설치, 백업과 소스 재빌드는 [Android 설치 안내](ANDROID_INSTALL.md)에 정리했습니다.

다음 확인은 실제 휴대폰의 설치·강제 종료 후 오프라인 재실행·한 번의 전체 퀘스트·다음날 복습·시스템 백업 저장/취소/복원입니다. 교육 콘텐츠의 문항별 검수와 정식 승인, 스토어 릴리스 서명·배포는 별도 단계로 유지합니다.
