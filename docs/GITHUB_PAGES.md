# GitHub Pages 배포 안내

시몬치치는 정적 웹 앱이므로 GitHub Pages에 배포할 수 있습니다. 이번 변경은 프로젝트 하위 경로 지원과 배포 워크플로를 준비한 것입니다. **이 문서를 작성한 시점에는 실제 GitHub Actions 배포나 공개 주소의 실행을 검증하지 않았습니다.**

요청한 저장소가 `profsong/simonchichi`이면 기본 배포 주소는 `https://profsong.github.io/simonchichi/`가 됩니다. 이는 배포 성공 뒤 사용할 예상 주소이며 현재 가동을 확인한 링크가 아닙니다.

현재 연결에서 해당 저장소 조회는 404였으며 저장소 생성·Pages 설정을 실행할 수 없어 원격 파일을 올리지 않았습니다. **다음 진행에는 사용자가 GitHub에서 `profsong/simonchichi` 공개 저장소를 README 포함으로 만들고, 연결된 앱에 저장소 접근을 허용한 뒤 Pages의 Source를 GitHub Actions로 설정해야 합니다.** 로컬 준비 완료와 실제 게시 완료를 구분합니다.

## 공개 범위와 학습 기록

일반적인 GitHub Pages 사이트는 인터넷에 공개되며, 저장소가 비공개라는 이유만으로 사이트 접근이 제한되지는 않습니다. 공개 저장소와 비공개 저장소의 Pages 사용 가능 여부도 GitHub 요금제에 따라 다릅니다. [GitHub 게시 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)를 기준으로 저장소와 사이트의 공개 범위를 각각 정합니다.

앱의 단어·뜻·지문·그림은 브라우저에 내려받는 번들에 포함되므로 방문자가 읽을 수 있습니다. 원본 PDF를 제외하는 것만으로 번들 내용까지 비공개가 되지는 않습니다. 개인 사용 허용과 인터넷 재배포 허용을 구별하여 공개할 자료·캐릭터·상표 표현의 범위를 정하고 사전 저작자·라이선스 표기를 유지합니다.

학습 답변·XP·구매 내역은 기기의 IndexedDB에 저장되며 Pages에 업로드하거나 기기 간 동기화하지 않습니다. Android 앱·localhost에서 사용하던 기록은 새 HTTPS 주소에 자동 이전되지 않습니다. 기존 앱에서 JSON 백업을 만든 뒤 새 주소의 **설정 → 백업 파일 선택 → 백업으로 복원**으로 옮깁니다. 복원은 병합이 아니라 현재 기록 교체이므로 새 주소에도 기록이 있으면 먼저 백업합니다.

같은 호스트의 경로만 다른 사이트는 브라우저 origin이 같아 IndexedDB 이름도 공유할 수 있습니다. 경로를 다른 학습자 저장소의 보안 경계로 사용하지 않습니다. 저장소 이름이나 도메인을 바꾸기 전에도 백업을 보관합니다.

앱에는 추적기를 추가하지 않습니다. 다만 정적 파일을 제공하는 GitHub는 서비스 보안 목적으로 방문 IP를 기록한다고 안내합니다. [GitHub Pages의 데이터 수집 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

## 공개 설치 후 사이트를 내리는 운영에 관하여

**설치와 캐시가 정상적으로 끝난 기기에서는 게시가 중단된 뒤에도 기존 앱이 실행될 수 있습니다. 그러나 ‘한 번 설치하면 영구 사용’, ‘같은 URL이면 점수를 절대 잃지 않음’, ‘비공개 전환으로 이미 공개한 자료까지 회수됨’은 보장할 수 없습니다.**

| 상황                                  | 판단                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Free에서 public → private      | GitHub는 해당 Pages 사이트를 자동으로 게시 중단한다고 안내합니다. 다른 요금제에서는 비공개 저장소의 Pages가 계속 가능할 수 있으므로 저장소 비공개와 사이트 중단을 동일하게 취급하지 않습니다. |
| 정상 설치·캐시 후 사이트가 404를 반환 | 활성 service worker와 필요한 캐시가 남아 있고 요청 경로가 범위 안이면 저장된 앱을 보여 줄 수 있습니다. 처음 여는 기기, 저장소가 정리된 기기, 캐시되지 않은 파일에는 적용되지 않습니다.        |
| 나중에 다시 public으로 전환           | 전환만으로 즉시 게시·기기 업데이트가 끝나는 것은 아닙니다. Pages 설정과 Actions 배포 성공, 온라인에서 새 앱 설치·활성화를 각각 확인해야 합니다.                                               |
| 같은 주소로 업데이트                  | 같은 origin과 정상적인 데이터 호환성을 유지하면 기존 IndexedDB를 계속 사용할 수 있습니다. 주소 유지 자체가 데이터 손실 방지 장치는 아닙니다.                                                  |
| 이미 공개했던 자료                    | 공개 fork는 private 전환 뒤에도 공개로 남을 수 있습니다. 누군가 내려받은 앱·소스까지 회수하거나 접근 권한을 소급 제한하지 못합니다.                                                           |

공개/비공개 전환과 fork의 동작은 [GitHub 공식 저장소 공개 범위 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)에 근거합니다. 인용된 [Community 22809 답변](https://github.com/orgs/community/discussions/22809)은 **2020-10-01**의 복구 사례입니다. 당시의 새 커밋·재빌드 안내를 현재 앱의 자동 재게시 또는 iPhone 보존 보장으로 확대 해석하지 않습니다.

시몬치치의 빌드에는 이미 Workbox 사전 캐시와 앱 시작 문서 처리가 있습니다. 사전 캐시 요청은 저장된 응답을 먼저 찾고, 없을 때만 네트워크를 사용합니다. 따라서 온라인이라고 항상 서버의 404로 앱을 바꾸는 구조는 아닙니다. 이는 설치 전에 모든 파일을 내려받고 이후에도 캐시가 존재한다는 조건을 전제로 합니다. [Workbox 사전 캐시 설명](https://developer.chrome.com/docs/workbox/modules/workbox-precaching#serving_precached_responses)

일반 자산의 cache-first 처리와 `sw.js` 업데이트 확인은 별개입니다. 새 service worker가 404이거나 설치에 실패하면 기존 활성 worker는 유지되는 것이 일반적인 업데이트 수명주기입니다. 반대로 서버가 다시 열린 뒤 새 버전을 정상 설치하고 활성화해야 새 콘텐츠가 적용됩니다. 현재 앱은 업데이트 안내를 통해 적용하며, 기존 학습 DB를 지워 새 파일을 받는 방식으로 운영하지 않습니다. [service worker 업데이트 수명주기](https://web.dev/articles/service-worker-lifecycle#updating_the_service_worker)

이번 점검에서는 이미 설치한 앱을 다시 열었을 때 최초 설치 이벤트가 발생하지 않아 ‘오프라인 준비 완료’ 표시가 복구되지 않을 수 있는 점을 보완했습니다. 등록·업데이트 요청의 성공 여부와 별도로, 현재 경로의 활성 `sw.js`와 그 범위에 저장된 시작 문서·현재 해시의 JS/CSS·아이콘·manifest를 읽어 준비 상태를 확인합니다. 다른 앱의 캐시, 이전 파일만 남은 캐시, 누락·읽기 오류를 준비 완료로 간주하지 않습니다. 이 표시는 확인 시점의 상태이며 영구 저장 보증은 아닙니다. 학습 DB를 수정하거나 캐시를 지우지 않습니다.

Safari의 Cache API·IndexedDB·service worker 데이터는 기기 저장 공간 압박 등의 이유로 정리될 수 있습니다. WebKit은 기본 저장을 영구 보장하지 않으며 홈 화면 앱도 백업을 대체하지 않습니다. `persist()` 지원이나 허용 여부도 모든 삭제 상황을 막는 약속은 아닙니다. [WebKit 저장소 정책, 2023-08-10](https://webkit.org/blog/14403/updates-to-storage-policy/)

‘Safari 7일 규칙’을 홈 화면 앱이 반드시 7일 뒤 지워진다는 뜻으로 적용해서도 안 됩니다. WebKit의 2020년 설명은 홈 화면 앱에 별도 사용 일수 계산과 사용 시 갱신이 있음을 구분합니다. 그렇다고 저장 공간 정리·사용자의 웹사이트 데이터 삭제·기기 이전까지 없어지는 것은 아닙니다. [WebKit의 홈 화면 앱 설명, 2020-03-24](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/#a-note-on-web-applications-added-to-the-home-screen)

이 운영을 선택한다면 게시 중단 전 **홈 화면 앱에서 온라인 설치 완료 → 종료·재실행 → 비행기 모드 재실행 → JSON 백업**을 확인합니다. 업데이트 때에는 다시 게시한 주소가 정상 응답하고 해당 기기에서 업데이트를 적용한 뒤, 버전·XP·진도·구매 내역과 오프라인 재실행을 확인한 다음 중단 여부를 결정합니다. 이 절은 조건과 절차 설명이며 이번 작업에서 GitHub 공개 범위나 게시 상태를 변경하지 않았습니다.

## 최초 업로드와 설정

1. 사용할 GitHub 저장소와 공개 범위를 확정합니다. 기존 저장소에 올리는 경우 그 안의 파일과 브랜치를 먼저 확인합니다.
2. 첫 커밋 대상 파일을 검토합니다. 루트 `.gitignore`는 `artifacts/`, `reference/`, `tmp/`, `.tooling/`, 빌드·검사 산출물 및 로컬 `.env`를 제외합니다. 비밀값이 없는 `.env.demo`와 `.env.android-demo`만 예외로 둡니다. Android의 기존 ignore는 SDK 경로·서명키·복사된 웹 자산을 제외합니다.
3. `src/`, `public/`, `content_src/`, 검증 스크립트, 테스트, 설정, `package.json`, `package-lock.json`, `.github/workflows/deploy-pages.yml` 등 빌드에 필요한 소스를 함께 관리합니다. `tests/e2e/fixtures/`는 출처가 문서화된 자동 검사 자료이며 개인 백업을 그 폴더에 넣지 않습니다. 이미 추적 중인 파일은 ignore 추가만으로 공개 대상에서 제거되지 않으므로 실제 커밋 목록을 확인합니다.
4. 저장소의 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다. 이 워크플로는 Pages를 임의로 활성화하지 않습니다. 설정 경로는 [공식 Actions 게시 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)를 따릅니다.
5. 검토한 소스를 `main`에 올린 뒤 **Actions → Deploy GitHub Pages**의 결과를 확인합니다. 이후 `main` 푸시나 `main`을 선택한 **Run workflow**가 배포를 실행합니다. 다른 기본 브랜치를 사용하려면 워크플로의 `push.branches`와 `build.if`를 함께 변경합니다.
6. `github-pages` 환경의 배포 허용 브랜치를 `main`으로 제한하고, 성공한 배포의 URL을 엽니다. 첫 푸시가 Pages 설정보다 앞서 실패했다면 설정 뒤 같은 워크플로를 다시 실행합니다.

APK·PDF·개인 백업·검사 스냅샷은 Pages 배포 파일이 아닙니다. 역사 보고서의 `artifacts/` 링크는 로컬 증거 경로이며 공개 저장소에는 없을 수 있습니다. 이 작업은 원본 파일을 지우지 않습니다.

## 전달용 파일

최종 문서를 포함해 포장하는 파일은 다음 두 개입니다. ZIP 자체를 저장소에 올리지 않고 목적에 맞게 압축을 해제합니다. 생성 결과·파일 목록·해시는 별도 artifact manifest에 기록합니다.

| 파일                                           | 범위와 용도                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `artifacts/pages/simonchichi-pages-source.zip` | 소스·설정·잠금 파일·검증 자료·워크플로·문서. 원본 PDF, 개인 백업, APK, 로컬 도구와 생성 산출물을 제외한 저장소 업로드용 자료  |
| `artifacts/pages/simonchichi-pages-static.zip` | `/simonchichi/`용으로 빌드한 정적 웹 파일만 포함. 정적 호스팅 전달용이며 소스 기반 Actions 빌드를 대신하는 저장소 자료는 아님 |

소스 ZIP에는 `public/`의 그림·사전 라이선스와 빌드에 필요한 생성 학습 자료, 출처가 문서화된 합성 테스트 fixture가 포함됩니다. 정적 ZIP은 사용자 사이트 루트용이 아니므로 `/`에 게시하려면 해당 base로 다시 빌드합니다.

## 워크플로와 경로

[deploy-pages.yml](../.github/workflows/deploy-pages.yml)은 Node.js 24에서 다음 순서를 실행합니다.

```text
npm ci → typecheck → lint → unit test → content validation + web build
       → dist만 Pages artifact로 업로드 → GitHub Pages 배포
```

빌드 job에는 소스·Pages 설정 읽기 권한, 배포 job에만 `pages: write`와 `id-token: write`를 부여합니다. Git 쓰기나 별도 개인 액세스 토큰은 요구하지 않습니다. 동일 배포는 순서대로 실행하고, 검사가 실패하면 deploy job은 실행하지 않습니다. Android SDK·Java·APK 빌드는 호출하지 않습니다.

빌드·단위 검사 프로세스의 `TZ`는 `Asia/Seoul`로 고정해 로컬 검사와 날짜 조건을 맞춥니다. 이는 CI 환경 설정이며 사용자의 브라우저 날짜 처리나 앱 보상 규칙을 변경하지 않습니다.

공식 액션은 확인한 커밋 SHA로 고정했습니다: checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5. [Vite의 현재 Pages 예제](https://vite.dev/guide/static-deploy#github-pages)와 [GitHub의 분리된 build/deploy 구조](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 참고했습니다.

`configure-pages`의 `base_path`를 `VITE_BASE_PATH`에 그대로 전달합니다. [공식 액션 출력](https://github.com/actions/configure-pages/blob/v6/action.yml)에 따라 계정 사이트는 빈 문자열, 프로젝트 사이트는 `/저장소명`이며 Vite가 끝 `/`를 정규화합니다.

| 배포 형태                  | 저장소 예                     | Vite 경로       |
| -------------------------- | ----------------------------- | --------------- |
| 프로젝트 사이트            | `profsong/simonchichi`        | `/simonchichi/` |
| 계정 사이트                | `profsong/profsong.github.io` | `/`             |
| 별도 경로 미지정 로컬 실행 | 기존 개발·미리보기            | `/`             |

스크립트·스타일·아이콘·manifest의 시작 주소/범위·service worker·사전 라이선스 링크에 같은 경로를 사용합니다. 앱의 화면 전환은 URL 하위 라우트를 만들지 않아 서버의 SPA 재작성 규칙을 요구하지 않습니다. Android 빌드는 같은 환경 변수가 남아 있어도 기존 `/`를 사용합니다.

## 로컬 검증과 실제 iPhone

프로젝트 경로를 수동 빌드하려면 PowerShell에서 다음과 같이 실행합니다. 작업을 마치면 환경 변수를 지워 기존 루트 빌드로 돌아갑니다.

```powershell
$env:VITE_BASE_PATH='/simonchichi/'
npm run build
npm run preview
# 미리보기 종료 뒤
Remove-Item Env:VITE_BASE_PATH
```

배포 전 경로 회귀 검사는 다음 명령으로 수행합니다. Pages 검사는 별도 `dist-pages-test/`와 4176 포트를 사용하며, 프로젝트 경로 밖의 요청을 404로 처리하는 정적 서버로 실행합니다.

```powershell
npm run typecheck
npm run lint
npm run test
npx playwright install chromium webkit
npx playwright test --config playwright.pages.config.ts
npx playwright test --config playwright.production.config.ts
```

2026-11-01 최종 로컬 타입 검사·전체 린트·전체 단위 **201/201(15파일)**가 통과했습니다. 오프라인 준비 표시와 비동기 응답 순서 보완의 관련 단위 **28/28**도 통과했습니다. 최초 린트는 새 `dist-pages-test/` 생성물을 소스로 읽어 실패했고, ESLint·Prettier의 생성물 제외 규칙을 추가한 뒤 다시 통과했습니다.

최종 프로젝트 경로 **6/6**와 기존 루트 경로 **2/2**가 Chromium·WebKit에서 통과했습니다. 프로젝트 경로 검사에는 기존 아이콘·JS/CSS·manifest·worker 범위·라이선스, 오프라인 정답/10 XP 저장·재개, 스키마 6 백업 다운로드와 여섯 테이블 일치에 더해 다음 online-404 조건을 포함합니다.

- 인터넷 연결을 유지하고 시작 문서·JS/CSS·manifest·`sw.js`·라이선스의 서버 응답을 실제 HTML 404로 전환했습니다.
- 정상 캐시가 있는 동일 브라우저에서 새 페이지를 열면 캐시 응답 200으로 실행되고 답변 1개·10 XP·여섯 테이블과 백업이 유지됐습니다. 라이선스도 캐시에서 열리고 준비 완료 표시가 복구됐습니다.
- `sw.js`의 추가 업데이트 요청은 서버 404로 실패했으며 기존 활성 worker와 controller가 유지됐습니다. 같은 서버를 처음 여는 빈 브라우저 context는 404이고 등록된 worker도 없었습니다.

실제 결과는 `artifacts/pages/pages-e2e-results.json`, `artifacts/pages/online404-evidence.json`, 최종 19개 정적 파일의 해시는 `artifacts/pages/final-tested-tree.json`에 보관합니다. 이 검사는 로컬 서버로 게시 중단을 모사한 것이며 GitHub 공개 범위 전환·실제 iPhone·장기 캐시 보존을 검사한 것이 아닙니다.

워크플로 YAML·권한·실행 순서·배포 폴더 검증, ignore의 22개 제외/보존 경로 확인, 변경 문서 포맷 검사도 통과했습니다. GitHub에서의 `npm ci`·Actions 권한·실제 공개 배포는 첫 실행에서 별도로 확인해야 합니다.

배포 후 iPhone Safari에서 최종 HTTPS 주소를 온라인으로 열고 **설정의 오프라인 준비**를 확인합니다. 공유 → **홈 화면에 추가** 뒤 새 아이콘으로 실행하고 비행기 모드에서 학습·재개·방 꾸미기·출처 링크를 점검합니다. 백업 다운로드와 복원도 파일 앱을 통해 직접 확인하고 [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기기·iOS 버전·결과를 기록합니다. **실제 iPhone/홈 화면 검증은 아직 하지 않았으며 Playwright WebKit 통과로 대체하지 않습니다.**

앱 업데이트는 온라인에서 새 버전을 확인한 뒤 적용합니다. 브라우저 데이터 삭제로 업데이트 문제를 해결하려 하기 전에 백업을 보관합니다. 다음 단계는 지정 저장소의 실제 Actions 배포와 최종 HTTPS 주소에서의 iPhone 확인입니다.

## 이번 변경 파일

| 범위                              | 파일                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 배포 자동화                       | `.github/workflows/deploy-pages.yml`                                                                                                      |
| 웹 경로·설치 메타데이터·출처 링크 | `vite.config.ts`, `index.html`, `src/features/wordbooks/WordbooksScreen.tsx`                                                              |
| 기존 오프라인 준비 상태 확인      | `src/platform/useAppRuntime.ts`, `src/platform/webOfflineReady.ts`, `tests/unit/runtime.test.tsx`, `tests/unit/web-offline-ready.test.ts` |
| 프로젝트 경로 검사                | `playwright.pages.config.ts`, `tests/e2e/pages.spec.ts`, `scripts/serve-pages-test.mjs`                                                   |
| 로컬 자료·생성물 제외             | `.gitignore`, `.prettierignore`, `eslint.config.js`                                                                                       |
| 설정·운영 정책                    | `docs/GITHUB_PAGES.md`, `README.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/IPHONE_TEST_CHECKLIST.md`                                    |

학습 콘텐츠·XP·구매·백업 스키마·Android 앱 버전은 이번 웹 배포 준비로 변경하지 않습니다.
