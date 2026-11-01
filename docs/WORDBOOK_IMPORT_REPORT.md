# 독립 단어장 추가 보고서

기준일: 2026-11-01. 앱 **0.3.0**, Android versionCode **3**.

이 문서는 최초 가져오기를 기록한 0.3.0 보고서입니다. 이후 0.4.0에서 원문을 보존하면서 2,000개 전체의 한국어 뜻·품사를 보강했습니다. 최신 동작과 검증은 [뜻 보강 보고서](WORDBOOK_MEANINGS_REPORT.md)를 확인하세요.

## 제공 기능과 실제 집계

**오늘·복습함 → 단어장 둘러보기**에서 기존 B1·B2·B3와 새 **수능 단어 2000**을 확인합니다. 단어·한국어 뜻 검색, 원문 DAY 필터, 50개씩 더 보기, 기존 자료 중복 제외/표시를 제공합니다. 읽기 화면이므로 XP·복습 예약·기존 퀘스트 기록을 바꾸지 않습니다.

[사용자 제공 PDF](../reference/수능단어2000.pdf)는 25쪽, 50 DAY × 40행입니다. 두 추출기로 전체 순서를 대조한 결과 2,000행·고유 표제어 2,000개이며 누락·건너뛴 행·원문 내 중복은 0개입니다. 파일명만 보고 개수를 가정하지 않았습니다. 원문에는 영단어와 빈 뜻 칸이 있으며 **한국어 뜻·품사 2,000개 모두 미제공**입니다. 없는 뜻·예문·문항은 생성하지 않았습니다.

| 단어장            | 원본 행 |          고유 표제어 | 이전 자료와 중복 | 기본 새 단어 목록 |
| ----------------- | ------: | -------------------: | ---------------: | ----------------: |
| B1 중등 심화      |      80 |                   80 |                0 |                80 |
| B2 고등 영어 연결 |     140 |                  140 |                0 |               140 |
| B3 고등 영어 입문 |      80 |                   80 |                0 |                80 |
| 수능 단어 2000    |   2,000 |                2,000 |              176 |             1,824 |
| 합계              |   2,300 | 전체 공통 어휘 2,124 |              176 |             2,124 |

새 원문 2,000개는 모두 `draft`입니다. 일반 학습 모드에서는 네 권의 메타데이터만 보이고 초안 본문은 나오지 않습니다. 체험용 빌드에서 데모를 직접 켜야 목록을 볼 수 있습니다. 기존 자료와 겹쳐도 새 출처의 검수 상태가 자동 승격되지 않습니다.

기존 300개 어휘 ID와 원본 JSON은 보존했습니다. `seed-content.json`의 변경 전후 SHA-256은 `f5266194a2f39326888ba8e0ffc358b94912f471d7ba08faf69cc3267d78671d`로 같습니다. 저장소·백업 스키마를 바꾸지 않았으며 이 단어장은 학습 기록 JSON 백업에 추가되는 사용자 데이터가 아닌 앱에 포함된 자료입니다.

## 중복과 출처 보존

대소문자·양끝 및 반복 공백·NFKC·일부 타이포그래피 따옴표/하이픈만 정규화하여 같은 표제어를 연결합니다. 어간·복수형·파생형을 추정하거나 실제 하이픈·구 경계를 지우지 않습니다. 예를 들어 `adapt`와 `adaptation`은 별도 단어입니다. 뜻이 같은지 자동 판단하는 의미 기반 병합도 하지 않습니다.

기존 표제어는 원래 어휘 ID를 사용하고 새로운 표제어는 결정적인 ID를 받습니다. ID 충돌은 오류로 중단합니다. 원본 행 ID·페이지·DAY·행·열·원문 및 출처별 뜻을 보존합니다. 같은 책의 표제어 반복은 화면에서 한 행으로 모으되 서로 다른 뜻을 모두 표시·검색합니다. **중복 단어 제외**를 끄면 기존 자료와 겹치는 항목도 볼 수 있습니다.

예를 들어 PDF의 `adapt`는 `v-adapt-sense1`과 연결되며 **B1 중등 심화의 뜻**을 별도로 표시합니다. 이것을 PDF의 빈 뜻 칸에 써넣지 않습니다. 기존 자료에 없는 `provide`는 **뜻 미제공**으로 표시합니다.

## 다음 단어장 추가 방법

새 자료를 `src/data/wordbook-schema.ts`에 맞는 JSON으로 정규화하여 `content_src/wordbooks/`에 넣습니다. 원본 파일을 덮어쓰지 않고 고유 책 ID·행 ID·출처를 지정하며, `priority`는 기존 최댓값 100보다 크게 정합니다. 추출 과정에서 행을 누락하거나 중복 때문에 버리지 않습니다. 없는 뜻은 빈 문자열과 확인 필요 항목으로 남깁니다.

예시 구조는 다음과 같습니다. 실제 추가할 때는 자신의 원문·뜻·출처 이용 조건으로 작성합니다.

```json
{
  "schemaVersion": 1,
  "id": "my-next-book",
  "version": "1.0.0",
  "title": "새 단어장",
  "priority": 101,
  "source": {
    "kind": "json",
    "filename": "my-next-book.json",
    "license": "원본의 실제 이용 조건을 기록"
  },
  "entries": [
    {
      "id": "my-next-book-row-0001",
      "headword": "example",
      "koreanMeaning": "",
      "reviewStatus": "draft",
      "source": { "row": 1, "originalText": "example" },
      "uncertainties": ["missing-meaning", "missing-pos"]
    }
  ]
}
```

```powershell
npm run wordbooks:sync
npm run validate:wordbooks
npm run typecheck
npm run test
npm run build:demo
# Android에도 넣으려면 APK를 다시 빌드하고 기존 앱 위에 업데이트
npm run android:build
```

동기화는 모든 입력을 검사한 뒤 `src/data/wordbooks/<id>.json`을 결정적으로 생성합니다. 앱은 이 폴더를 자동 등록하므로 책 하나를 추가할 때 TypeScript 목록을 수정할 필요가 없습니다. 같은 책/행 ID·등록 순서 충돌, 원본이 사라진 생성 파일, 최신이 아닌 생성 파일은 오류로 알려줍니다. 자동 삭제·묵시적 덮어쓰기 대신 원본과 생성물의 차이를 해결해야 합니다.

이번 PDF의 재추출 검사는 다음 명령입니다. Python의 `pypdf`와 Poppler `pdftotext`가 필요하며, 실제 확인한 Windows 실행 파일은 `C:\texlive\2026\bin\windows\pdftotext.exe`입니다.

```powershell
python tools/import_wordbook_pdf.py --check
# PATH에 없는 경우
python tools/import_wordbook_pdf.py --check --pdftotext "C:\path\pdftotext.exe"
```

이 PDF 추출기는 이번 25쪽·두 열·DAY별 40행 형식을 검사합니다. 다른 형식의 PDF를 무조건 자동 해석하는 도구는 아니며, 다른 자료는 해당 원문에 맞게 추출한 뒤 공통 JSON 스키마로 등록합니다.

PC 폴더에 JSON을 추가하는 것만으로 이미 설치한 앱이 바뀌지는 않습니다. 웹은 다시 빌드한 파일을 제공하고 Android는 새 APK를 만들어 기존 앱 위에 업데이트해야 합니다. 설치된 오프라인 앱이 PC 폴더를 실시간으로 읽지는 않습니다.

## 실행한 검사

| 명령/검사                                                 | 결과                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| PDF 가져오기·`--check`                                    | 통과. Poppler 좌표 추출과 pypdf로 전체 2,000행 교차 확인, 반복 생성 일치 |
| `npm run wordbooks:sync` / `npm run validate:wordbooks`   | 통과. 전체 공통 어휘 2,124개·기존 ID 300개                               |
| `npm run typecheck` / `npm run lint`                      | 통과                                                                     |
| `npm run test`                                            | 단위·UI 110개 통과                                                       |
| `npm run test:e2e`                                        | Chromium·WebKit 총 14개 통과; 데모 빌드 포함                             |
| `npm run test:e2e:production`                             | Chromium·WebKit 총 2개 통과; 일반 빌드 포함                              |
| `npm run android:build`                                   | APK 생성·Gradle 성공, Java 3개 통과                                      |
| Android 단어장 검사 및 `--verify --test-preference-retry` | 설정 응답 누락 주입을 포함하여 에뮬레이터 6개 통과                       |
| 실제 HTTP 다운로드                                        | 설치 페이지·체크섬 200, HTTP APK와 로컬 파일 해시 일치                   |

새 단위 검사는 향후 두 책을 추가했을 때의 정규화·책 안/책 사이 중복·원본 뜻 보존·등록 순서·출처별 승인 제한을 확인합니다. UI 검사는 같은 표제어의 두 번째 뜻으로 검색해도 두 뜻 모두 한 행에 보이는지 확인합니다. 브라우저는 네 권의 메타데이터, 초안 차단, 50→100개 표시, `adapt` 연결·한국어 뜻 검색, 빈 뜻 표시, DAY 1의 40행, 오프라인 재열기를 검사했습니다. 기존 학습 80 XP와 다섯 테이블이 탐색 전후 같았으며 기존 퀘스트·보상·백업 검사도 모두 통과했습니다.

Android 16/API 36 에뮬레이터에서 실제 0.2.0→0.3.0 `install -r` 업데이트 후 다섯 테이블, 데모·시폼푸린 설정을 보존했습니다. 비행기 모드 켬·Wi-Fi/모바일 데이터 끔 상태에서 단어장, 중복 연결, DAY 1의 정확한 원문 순서, 재실행을 검사했습니다. 기존 2회 완료·10시도·130 XP는 변하지 않았고 JavaScript 오류도 없었습니다. 실제 Android 휴대폰·iPhone은 검사하지 않았습니다.

최종 APK 재검사 과정에서 WebView 새로고침 뒤 첫 `Preferences.get` 콜백이 돌아오지 않아 시작 화면에서 계속 기다리는 현상을 한 번 관찰했습니다. 당시 다섯 IndexedDB 테이블은 그대로였고 서비스 워커는 없었으며, 나중에 직접 호출한 설정 읽기는 `demo`를 반환했습니다. 이를 단순한 검사 불안정으로 넘기지 않고 Android 설정 읽기에 **요청당 2초·최대 3회**의 제한을 추가했습니다. 시간 초과만 재시도하며 명시적 저장소 오류는 즉시 처리합니다. 세 번 모두 응답이 없으면 기존 오류 안내·다시 열기를 제공하고, 임의로 일반 학습 모드로 바꾸거나 늦은 콜백으로 복구된 모드를 덮어쓰지 않습니다. 설정 저장 동작은 변경하지 않았습니다.

이 수정의 런타임 단위 검사 13개를 포함한 전체 110개가 통과했습니다. 브라우저 E2E 16개는 이 네이티브 전용 읽기 수정 전에 통과한 결과이며 웹 모드 경로는 변경하지 않았습니다. 관찰 증거는 [실패 기록](../artifacts/android/wordbooks-reload-failure.json), [원인 진단](../artifacts/android/wordbooks-reload-diagnostic.json), [네이티브 로그](../artifacts/android/wordbooks-reload-native.log)에 보존했습니다.

수정한 최종 APK에서 `node scripts/test-android-wordbooks.mjs --verify --test-preference-retry`로 첫 네이티브 응답을 의도적으로 누락시켰습니다. 첫 호출로부터 **2,000.6ms** 뒤 두 번째 읽기를 시작하고 **2,419.8ms** 안에 기존 데모 모드로 복구했습니다. 총 두 번 읽었으며 다섯 테이블·130 XP는 같았습니다. 주입 장치를 제거한 정상 재실행까지 포함해 네이티브 검사 **6개가 통과**했습니다. 앞서 관찰한 시작 대기는 이 수정과 회귀 검사로 해결했습니다.

일반 웹 `dist/`는 승인 콘텐츠만 허용하는 빌드로 남겼습니다. 기존 500 kB 초과 청크 경고는 남아 있습니다.

## APK와 결과 파일

- [simonchichi-0.3.0-demo.apk](../artifacts/android/simonchichi-0.3.0-demo.apk): **4,993,353 bytes**, 앱 ID `com.simonchichi.app`, APK v2 서명 확인, 인터넷 권한 없음.
- SHA-256: `7c8e7bdef4126c70063b02c9d9be5c329b5fae4b8793d93716de2533d0214641`.
- [추출 보고서](../artifacts/wordbooks/suneung-2000-extraction.json): 원문 해시·행별 진단·추출 방법.
- [네이티브 결과](../artifacts/android/native-wordbooks-results.json): 오프라인 업데이트·단어장·설정 읽기 복구 검사 6개, 검사한 APK 해시 포함.
- 브라우저 375×812 CSS px 화면: `artifacts/screenshots/wordbooks/`.
- Android 화면: `artifacts/android/wordbooks-2026-11-01T08-28-29-250Z/`.

## 변경 파일과 남은 범위

| 영역                | 변경 파일                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공통 어휘·검증·등록 | `src/core/wordbook.ts`, `src/data/wordbook-schema.ts`, `src/data/wordbooks.ts`                                                                                                                  |
| 화면·진입점         | `src/features/wordbooks/WordbooksScreen.tsx`, `src/app/App.tsx`, `src/features/home/Today.tsx`, `src/features/reviews/Reviews.tsx`, `src/styles/index.css`                                      |
| 자료·생성           | `content_src/wordbooks/suneung-2000.json`, `src/data/wordbooks/suneung-2000.json`, `tools/import_wordbook_pdf.py`, `scripts/sync-wordbooks.ts`                                                  |
| Android 시작 복구   | `src/platform/runtime.ts`, `tests/unit/runtime.test.tsx`                                                                                                                                        |
| 검사                | `tests/unit/wordbooks.test.ts`, `tests/unit/wordbooks-ui.test.tsx`, `tests/e2e/wordbooks.spec.ts`, `tests/e2e/production.spec.ts`, `playwright.config.ts`, `scripts/test-android-wordbooks.mjs` |
| 버전·설치           | `package.json`, `package-lock.json`, `android/app/build.gradle`, `scripts/build-android.mjs`, `scripts/serve-android-download.mjs`                                                              |
| 문서                | `README.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, 이 보고서                                                                                                    |

교육 검수, 빈 뜻·품사의 원문 기반 보완, 실제 기기 검증이 남아 있습니다. 원본 PDF를 개인 요청으로 변환한 사실이 별도 재배포 권한 확인을 대신하지 않습니다. 콘텐츠를 자동 승인하거나 외부 게시하지 않았습니다.

iPhone은 [README의 실행 방법](../README.md#iphone-실행검증)에 따라 체험 빌드를 HTTPS로 제공하고 Safari에서 **공유 → 홈 화면에 추가**로 설치합니다. 데모를 켠 뒤 단어장 열기·뜻 검색·DAY 필터·비행기 모드 재실행과 기존 퀘스트를 확인하고 [실기기 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기/iOS 및 결과를 남깁니다. Playwright WebKit은 이 검증을 대신하지 않습니다. 다음 범위는 단어장 뜻의 교육 검수와 실제 iPhone/Android 사용성 확인입니다.
