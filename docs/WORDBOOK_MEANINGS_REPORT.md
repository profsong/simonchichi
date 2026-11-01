# 2,000단어 뜻 보강과 모험 지도 범위

> 이 문서는 0.4.0까지의 기록입니다. 현재 0.5.0의 두 단어장·15/100회차·일반 실행 정책은 [현재 사용 안내](USER_GUIDE.md)와 [과정 개편 보고서](WORDBOOK_COURSES_REPORT.md)를 따릅니다.

기준일: 2026-11-01. 앱 0.4.0 단계의 구현·검증 기록입니다.

## 제공 기능

기존 모험 지도는 **300단어·12챕터·60단계**의 기본 종합 과정입니다. B1 80개·B2 140개·B3 80개로 구성되며, 챕터마다 25단어를 구문·독해와 함께 다룹니다. [각 챕터의 전체 단어](CURRICULUM_MAP.md)를 별도로 정리하고 화면에도 기본 과정과 챕터별 밴드를 표시했습니다.

PDF의 **수능 단어 2000**은 별도 단어장입니다. 지도 아래 **추가 단어장**에서 직접 열며, 원본 2,000개·기존 자료와 중복 176개·기본 새 목록 1,824개를 표시합니다. 전체 공통 표제어는 여전히 2,124개이고 기본 과정의 단어·단계·완료 ID를 바꾸지 않았습니다.

전체 2,000행에 한국어 대표 뜻·품사·출처를 보강했습니다. 영어/뜻 검색, 원문 DAY 순서, 중복 제외, 오프라인 목록 읽기를 유지합니다. `provide`는 **제공하다**로 검색할 수 있고, **뜻 출처**에서 원자료와 영어 정의의 편집 번역을 구분합니다. `vaccum`·`lagacy`는 원문 철자를 보존하면서 조회 표제어 `vacuum`·`legacy`를 표시·검색합니다. `retarded`의 사람 지칭 용법에는 주의를 표시합니다.

## 자료와 의미 검토

[사용자 제공 PDF](../reference/수능단어2000.pdf)의 뜻 칸은 원래 비어 있습니다. 원본 추출 JSON의 2,000개 빈 뜻을 그대로 두고 `content_src/wordbooks/definitions/suneung-2000.json`의 별도 뜻 오버레이를 합칩니다. 앱용 생성물에는 원래 빈 뜻을 `sourceKoreanMeaning`으로 남깁니다. 책 ID·원문 해시·행 ID·표제어·전체 행 수를 대조하며 기존 뜻을 묵시적으로 덮어쓰지 않습니다.

초기 후보는 한국어 Wiktionary 1,711개와 영어 Wiktionary의 한국어 자료 142개, 총 1,853개였습니다. 나머지 147개는 확인한 영어 정의를 읽고 한국어로 편집 번역했습니다. WordNet에 없는 `multitask`는 Wiktionary의 실제 영어 정의를 확인했습니다. 이는 2,000개 웹페이지를 각각 조회한 작업이 아니라 공개 사전 일괄 자료와 별도 편집 번역을 결합한 작업입니다.

후보 1,853개 전체를 두 구간으로 나누어 읽고 일반적 의미가 빠진 항목·잘못 선택된 품사·번역 오류를 확인했습니다. 한 구간의 927개 및 공통 다의어 검토에서는 129개를 수정하고 WordNet 전체 자료의 정확한 표제어·품사에 속하는 346개 선택 synset을 대조했습니다. 예를 들어 `international`의 노동자 연맹 의미, `rush`의 식물명만 표시된 경우, `fabric`의 고어 건물 의미, `supplement`의 잘못된 ‘대체’를 바로잡았습니다. 편집 근거와 선택한 영어 정의는 검토 자료에 남겼습니다.

최종 편집 레코드는 **474개**입니다. 사전에 한국어 후보가 없던 147개와 기존 후보의 뜻·품사·표현을 수정한 327개를 포함합니다. 검토자가 겹쳐 고친 25개는 원자료와 병합 기록을 남겨 명시적으로 해소했습니다. 모든 편집에서 참조한 WordNet synset 1,111개를 원전과 대조했으며 표제어 불일치는 0개였습니다. 행별 첫 출처를 기준으로 한국어 Wiktionary 1,575개, WordNet 294개, 영한 사전 128개, 직접 확인한 영어 Wiktionary 3개입니다. 여러 출처가 함께 붙은 행도 있으므로 이 집계를 유일한 기여 출처 수로 해석하지 않습니다.

[최종 자료 감사](../artifacts/lexicon/final-data-audit.json)는 2,000개 전체의 한글 뜻·품사·출처, 원문 2,000개 빈 뜻과 ID·순서 보존을 확인합니다. 원본 추출 JSON의 SHA-256은 `f27813d396500a34badb5637199ae1f750e50611fb8865ba77dae66c96eef210`, 최종 뜻 오버레이는 `8079dcf74ab87bd18de0cbf3dc1b52015aa46eb48df39e6966dc6905f58a84f5`입니다. 기존 문제은행 SHA-256도 `f5266194a2f39326888ba8e0ffc358b94912f471d7ba08faf69cc3267d78671d`로 유지합니다.

이 검토는 대표 뜻을 위한 의미 점검이며 모든 다의어·용례를 망라한 사전 또는 교사의 최종 교육 검수가 아닙니다. **모든 보강 항목은 draft**이고 일반 학습 모드는 승인된 출처만 표시합니다. 예문·문항을 만들거나 읽기에 XP·숙련도·복습 예약을 부여하지 않았습니다.

출처는 [Kaikki의 한국어 Wiktionary 자료](https://kaikki.org/kowiktionary/), [영한 사전 배포 자료](https://github.com/DanielGregorini/koreader-dicts/releases/tag/v1.2.0), [Princeton WordNet 3.0](https://wordnet.princeton.edu/license-and-commercial-use)입니다. Wiktionary에서 고른 뜻은 CC BY-SA 4.0, WordNet 영어 정의 기반 번역은 해당 자료의 이용 조건과 출처를 기록합니다. 저작자·라이선스 전문·수정 사실은 저장소와 앱에 포함합니다. 뜻 읽기에 네트워크가 필요하지 않으며 출처 링크를 직접 열 때만 외부 웹페이지로 이동합니다.

## 앞으로 단어장을 추가할 때

기존 기본 12챕터는 유지하고 추가 자료는 별도 단어장으로 등록합니다. 새 JSON을 등록·검증하고 다시 빌드하면 추가 단어장 영역에 자동으로 나타납니다. 구체적인 JSON 예시는 [0.3.0 가져오기 보고서](WORDBOOK_IMPORT_REPORT.md#다음-단어장-추가-방법)에 있습니다. PC에 파일만 넣어서는 이미 설치한 오프라인 앱이 바뀌지 않으며 Android는 새 APK 업데이트가 필요합니다.

뜻이 없는 다른 자료에도 보강 파일을 쓸 수 있습니다. 기존 원문을 보존하고 `wordbookDefinitionsSchema`에 맞게 원문 SHA-256·책 ID·모든 행의 뜻과 출처를 지정합니다. 사전 후보 선택과 영어 정의의 번역은 방법을 구분하고, 애매한 표제어나 용법을 확인한 뒤 재현 검사합니다. 이번 PDF 추출기는 25쪽·50 DAY의 특정 형식을 검사하는 도구이지 모든 PDF에 적용되는 해석기가 아닙니다.

```powershell
# 뜻 자료를 다시 만들 때만 필요: 확인한 사전 캐시와 편집 레코드 사용
python tools/merge_wordbook_editorial.py --check
python tools/enrich_wordbook_meanings.py
python tools/enrich_wordbook_meanings.py --check
python tools/validate_wordbook_meanings.py
npm run wordbooks:sync
npm run validate:wordbooks

# 브라우저/설치 앱에 포함
npm run build:demo
npm run android:build
```

사전 캐시가 없는 개발 환경에서는 `python tools/enrich_wordbook_meanings.py --fetch`로 고정된 자료를 받고 해시를 확인합니다. 원격 자료가 바뀌면 해시 검사에서 멈추므로 바뀐 사전을 조용히 적용하지 않습니다. 일반 앱 빌드는 이미 보관한 정의 오버레이와 생성 자료를 사용하며 실행 중 사전 다운로드·AI 호출은 하지 않습니다.

단어장별 학습 경로는 후속 범위입니다. 기본 과정과 다른 과정 ID를 두고 원문 DAY를 연결하며, 중복 단어는 기존 공통 어휘·복습 이력을 사용하도록 설계할 수 있습니다. 실제 퀘스트 배정은 예문·문항·능동 회상·교육 검수를 갖춘 뒤 추가합니다. 이번 단계에서는 추가 2,000단어 퀘스트가 구현되었다고 표시하지 않습니다.

## 검증 기록

| 명령/검사                                               | 결과                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `python tools/merge_wordbook_editorial.py --check`      | 편집 원본 해시·명시적 충돌 해결·재현 검사 통과                      |
| `python tools/enrich_wordbook_meanings.py --check`      | 최종 2,000개 오버레이 재생성 일치                                   |
| `python tools/validate_wordbook_meanings.py`            | 7개 불변 조건·WordNet 1,111개 참조 통과                             |
| `python tools/import_wordbook_pdf.py --check`           | 원문 PDF 재추출 일치                                                |
| `npm run wordbooks:sync` / `npm run validate:wordbooks` | 전체 2,124개 공통 어휘·기존 ID 300개·빈 유효 뜻 0개                 |
| `npm run typecheck` / `npm run lint`                    | 통과                                                                |
| `npm run test`                                          | 단위·UI 123개, 7개 파일 통과                                        |
| `npm run test:e2e`                                      | Chromium·WebKit 총 16개 통과, 데모 빌드 포함                        |
| `npm run test:e2e:production`                           | Chromium·WebKit 총 2개 통과, 일반 빌드 포함                         |
| `npm run android:build`                                 | 0.4.0 APK 생성·Gradle 성공                                          |
| Android 뜻 업데이트 스크립트 (`--prepare` → `--apk`)    | Android 16/API 36 에뮬레이터 6개 통과; 전체 명령은 설치 안내에 기록 |
| 실제 LAN HTTP 다운로드                                  | 페이지·APK·체크섬 200, 다운로드와 로컬 파일 SHA-256 일치            |

브라우저 검사는 기본 12챕터·60단계의 실제 밴드 구성, 별도 단어장 진입, `provide`/`제공하다` 검색과 사전 출처, 철자 조회와 용법 주의, DAY 1의 40행 원문 순서, 50→100개 표시, 오프라인 읽기를 확인했습니다. 탐색 전후 다섯 학습 테이블과 80 XP는 같았고 기존 퀘스트·같은 날 추가 탐험·중복 보상 차단·백업 복원도 통과했습니다. 320·375·430 CSS px에서 새 단어장 가로 넘침이 없었습니다.

375×812 CSS px 화면은 `artifacts/screenshots/wordbook-meanings/`에 보존했습니다. 지도와 펼친 `provide` 출처 화면을 직접 확인했습니다. 마지막 `dist/`는 승인 콘텐츠만 허용하는 일반 빌드이며, 기존 500 kB 초과 청크 경고는 남아 있습니다. 실제 Android 휴대폰·iPhone Safari·홈 화면 설치 검증은 미실시입니다.

Android 16/API 36 에뮬레이터에서는 기존 0.3.0 위에 실제 0.4.0 APK를 업데이트했습니다. 다섯 테이블, 완료 2회·답변 10개·130 XP, 데모 모드·시폼푸린 선택이 그대로였습니다. 비행기 모드 켬·Wi-Fi와 모바일 데이터 끔 상태에서 지도 12/60/300 구분과 별도 PDF 진입, DAY 1의 정확한 순서, `provide` 뜻·출처, `vacuum` 조회, 새로고침·강제 종료 후 재실행을 확인했습니다. 내장 라이선스 파일도 오프라인에서 HTTP 200으로 읽었고 외부 요청·JavaScript 오류는 0건이었습니다. [네이티브 결과](../artifacts/android/native-meanings-results.json)에 검사한 APK 해시를 포함합니다.

Android의 기존 Java 검사 3개는 코드 변경이 없어 Gradle 캐시 결과를 재사용했습니다. 이번 단계에서 새로 실행한 검사와 구분합니다.

## Android 설치 파일

- [simonchichi-0.4.0-demo.apk](../artifacts/android/simonchichi-0.4.0-demo.apk): **4,757,422 bytes**, versionCode **4**.
- SHA-256: `b1ab50de1536baa2ebf4b75b243718b57b228a9a7b83df3640f16d6331c2c394`.
- 앱 ID `com.simonchichi.app`, 최소 API 24·대상 API 36, APK v2 서명 확인, 인터넷 권한 없음.
- [실제 LAN 다운로드 검사](../artifacts/android/meanings-download-verification.json): 설치 페이지·APK·체크섬 200, APK MIME/파일명·바이트 수·SHA-256 일치.
- Android 화면: `artifacts/android/meanings-2026-11-01T09-18-36-515Z/`.

기존 앱을 삭제하지 않고 같은 서명의 APK로 업데이트합니다. [설치 안내](ANDROID_INSTALL.md)

## 주요 변경 파일

| 영역                    | 파일                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 과정·뜻 병합·검증  | `src/core/wordbook.ts`, `src/data/wordbook-schema.ts`, `scripts/sync-wordbooks.ts`, `tests/unit/wordbooks.test.ts`                                      |
| 지도·단어장 화면        | `src/features/home/WorldMap.tsx`, `src/features/wordbooks/WordbooksScreen.tsx`, `src/app/App.tsx`, `src/styles/index.css`                               |
| 뜻·편집 근거·저작자     | `content_src/wordbooks/definitions/`, `src/data/wordbooks/suneung-2000.json`, `public/licenses/`                                                        |
| 재현·의미 감사 도구     | `tools/enrich_wordbook_meanings.py`, `tools/merge_wordbook_editorial.py`, `tools/validate_wordbook_meanings.py`                                         |
| 브라우저·Android 검사   | `tests/e2e/wordbooks.spec.ts`, `scripts/test-android-meanings.mjs`                                                                                      |
| 버전·오프라인 파일·설치 | `package.json`, `package-lock.json`, `android/app/build.gradle`, `vite.config.ts`, `scripts/serve-android-download.mjs`                                 |
| 안내                    | `README.md`, `docs/CURRICULUM_MAP.md`, `docs/DECISIONS.md`, `docs/USER_GUIDE.md`, `docs/ANDROID_INSTALL.md`, `docs/IPHONE_TEST_CHECKLIST.md`, 이 보고서 |

## iPhone 확인 방법과 다음 범위

[README의 iPhone 절차](../README.md#iphone-실행검증)에 따라 체험 빌드를 HTTPS로 제공하고 Safari에서 연 뒤 홈 화면에 추가합니다. 설정에서 데모를 켜고 지도 분량·추가 단어장·한글 검색·뜻 출처를 확인합니다. 온라인으로 한 번 연 뒤 비행기 모드에서 목록과 퀘스트·기록·백업 복원을 확인하고 [실기기 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기와 iOS 버전을 기록합니다. PC 사설 IP의 일반 HTTP 화면 확인이나 Playwright WebKit 성공은 이 검증을 대신하지 않습니다.

다음 범위는 뜻·용법의 교육 검수와 별도 단어장 학습 경로 설계입니다. 기존 진단·보스전·문맥 어휘 과제의 미구현 범위는 유지합니다.
