# 선택형 연속 탐험·친구 변경 보고서

기준일: 2026-10-23. 앱 버전: **0.2.0**, Android versionCode **2**.

## 제공 기능

- 하루 기본 탐험 뒤 원하는 경우 **다음 퀘스트 시작**으로 다음 미완료 커리큘럼을 진행합니다. **오늘의 탐험 마치기**와 권장 12분 안내를 유지합니다.
- 같은 날 여러 세션, 중간 재개, 빠른 중복 시작, 날짜가 바뀐 완료를 처리합니다. 모험 지도·완료 단계·탐험 이력이 모든 세션을 반영합니다.
- 일일 완료 보너스는 실제 완료 날짜당 한 번만 지급합니다. 추가 퀘스트의 정답 보상은 해당 세션에 기록합니다.
- 기본 몬치치를 유지하고 모모·노바를 **시치와레·시폼푸린**으로 바꿨습니다. 이전 선택과 백업은 대응하는 새 친구로 표시합니다.
- IndexedDB v1→v2는 기존 다섯 테이블의 기록을 보존합니다. 새 백업 스키마는 2이며 기존 1도 복원합니다.
- 같은 앱 ID·서명의 Android APK를 덮어 설치하여 0.1.0 기록을 이어갑니다. 모든 문제의 기존 ID와 검수 전 상태는 유지했습니다.

사용 방법은 [사용 안내](USER_GUIDE.md), 변경 이유는 [결정 기록](DECISIONS.md)의 11절에 정리했습니다.

## 실제 검사 결과

| 검사                                 | 결과                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run typecheck` / `npm run lint` | 통과                                                                |
| `npm run test`                       | 단위·UI 93개 통과                                                   |
| `npm run test:e2e`                   | Chromium 5개 + WebKit 5개, 총 10개 통과; 데모 빌드 포함             |
| `npm run test:e2e:production`        | Chromium·WebKit 총 2개 통과; 일반 빌드 포함                         |
| `npm run android:build`              | 0.2.0 APK 생성, Gradle 및 Java 검사 통과                            |
| Android 실제 구 APK 업데이트 검사    | 에뮬레이터 4개 통과                                                 |
| Android 시스템 파일 저장창           | 취소·저장·기록 보존 3개 통과, 실제 스키마 2 JSON 확인               |
| HTTP 다운로드                        | LAN 설치 페이지·체크섬 200, 다운로드 바이트와 로컬 APK SHA-256 일치 |

브라우저 검사는 같은 날 **3개 퀘스트·15시도·180 XP**, 일일 보너스 1개, 서로 다른 단계, 중복 탭, 두 번째 퀘스트의 새로고침 재개, 완료 화면 재열기, 지도·전체 이력, 스키마 2 백업→초기화→복원을 확인했습니다. 실제 0.1.0 APK가 내보낸 스키마 1 백업을 고정 자료로 사용하여 이전 기록과 친구 별칭의 복원도 확인했습니다. 기존 오프라인 서비스 워커·모바일 레이아웃·승인 콘텐츠 차단 검사를 유지했습니다.

Android 16/API 36 에뮬레이터에서 비행기 모드 켬, Wi-Fi·모바일 데이터 끔 상태로 **실제 0.1.0 APK → 0.2.0 APK의 `adb install -r` 업데이트**를 검사했습니다. 다섯 테이블과 데모 설정·이전 `momo` 선택이 보존되고 시치와레로 표시되었습니다. 추가 퀘스트 후 **2세션·10시도·130 XP·완료 보너스 1회**를 확인했으며 강제 종료 후 두 기록과 시폼푸린 선택이 유지되었습니다. 실행 중 JavaScript 오류는 없었습니다.

새 앱의 시스템 저장창에서 취소해도 기록·파일이 변하지 않았고, Downloads에 저장된 UTF-8 JSON이 다섯 테이블과 일치했습니다. 내보낸 파일은 스키마 2, 데모 모드, 2세션·10시도·130 XP 및 `sipompurin` 선택을 담고 있습니다. **네이티브 가져오기 파일 선택창은 이번에도 실행하지 않았습니다.** 복원 로직은 브라우저·단위 검사로 확인했습니다.

빌드의 500 kB 초과 청크 경고는 남아 있습니다. APK에는 문제은행을 포함하며 실행 시 외부 서버를 사용하지 않습니다. 일반 웹 `dist/`는 승인 콘텐츠만 허용하는 빌드로 최종 검사했습니다.

## 설치 파일과 증거

- 파일: [simonchichi-0.2.0-demo.apk](../artifacts/android/simonchichi-0.2.0-demo.apk), **4,544,564 bytes**.
- SHA-256: `556745b74d4f0a487b091933405c618a486a1ec9d645499122c345c66ce7c682`.
- Android 앱 ID `com.simonchichi.app`, 앱 이름 시몬치치, 최소 API 24·대상 API 36, APK v2 서명 확인. 인터넷 권한 없음.
- 업데이트 결과: [native-upgrade-results.json](../artifacts/android/native-upgrade-results.json), 실행 자료 `artifacts/android/upgrade-2026-10-23T03-15-08-251Z/`.
- 시스템 백업 결과: [native-backup-results.json](../artifacts/android/native-backup-results.json), 실행 자료 `artifacts/android/backup-smoke-2026-10-23T03-16-09-153Z/`.
- 브라우저 실제 375×812 CSS px 화면: `artifacts/screenshots/continuous-quest/`. 완료·이력·지도·두 새 친구 화면을 Chromium/WebKit별로 보존했습니다.

설치 방법은 [Android 안내](ANDROID_INSTALL.md)를 따릅니다. 기존 앱을 삭제하지 않고 같은 서명의 새 APK를 설치합니다. 다운로드 서버는 파일 전달용이며 설치 후에는 필요하지 않습니다. 0.1.0의 최초 오프라인 설치 검사는 [이전 보고서](ANDROID_BUILD_REPORT.md)에 남겼습니다.

## 변경 파일

| 영역                  | 파일                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 홈·완료·기록·지도     | `src/app/App.tsx`, `src/features/home/Today.tsx`, `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/Completion.tsx`, `src/features/progress/ProgressScreen.tsx`, `src/features/home/WorldMap.tsx`, `src/styles/index.css` |
| 선택·보상·보존        | `src/core/quest-builder.ts`, `src/core/rewards.ts`, `src/core/types.ts`, `src/data/db.ts`                                                                                                                                               |
| 친구                  | `src/components/Mascot.tsx`, `src/core/avatar.ts`, `src/features/settings/SettingsScreen.tsx`                                                                                                                                           |
| 앱 버전·빌드·다운로드 | `package.json`, `package-lock.json`, `android/app/build.gradle`, `scripts/build-android.mjs`, `scripts/serve-android-download.mjs`                                                                                                      |
| 검사                  | `tests/unit/core.test.ts`, `tests/unit/db.test.ts`, `tests/unit/avatar.test.tsx`, `tests/e2e/quest.spec.ts`, `tests/e2e/fixtures/`, `scripts/test-android-upgrade.mjs`, `scripts/test-android-backup.mjs`                               |
| 문서                  | `README.md`, `docs/DECISIONS.md`, `docs/ANDROID_INSTALL.md`, `docs/USER_GUIDE.md`, 이 보고서                                                                                                                                            |

## 남은 확인과 다음 범위

실제 Android 휴대폰·iPhone Safari·홈 화면 앱·VoiceOver는 **미검증**입니다. iPhone은 [README](../README.md#iphone-실행검증)의 HTTPS 체험 빌드 → Safari → 홈 화면에 추가 순서로 설치하고, 기본 탐험 종료·선택형 다음 탐험·비행기 모드 재실행·기록 복원을 [실기기 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기록해야 합니다. Android 휴대폰에서는 기존 앱 위에 업데이트한 뒤 같은 항목과 실제 파일 가져오기를 확인해야 합니다.

다음 범위는 콘텐츠의 문항별 교육 검수와 실제 기기 수용 검사입니다. 이번 변경은 최초 진단·주간 보스전·적응형 난도·음성 기능 확대를 포함하지 않습니다.
