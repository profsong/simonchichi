# 시몬치치 이름·기본 친구 변경 보고서

기준일: 2026-10-23 (KST)

앱의 표시 이름을 **시몬치치**로 바꾸고, 황금빛 털과 검은 후드를 가진 **몬치치**를 기본 친구로 적용했습니다. 사용자가 제공한 참고 이미지를 바탕으로 로컬 SVG를 구성하고 설치용 아이콘을 다시 생성했습니다.

## 변경 내용

- 앱 로고·브라우저 제목·PWA 이름·Safari 설치 제목(`apple-mobile-web-app-title`)·설정의 버전 표시·백업 파일명에 시몬치치를 사용합니다.
- 홈·학습·피드백·완료 화면의 기본 친구와 설정의 첫 선택이 몬치치입니다. 모모·노바도 계속 선택할 수 있습니다.
- 새 설정의 `avatarId`는 `monchichi`입니다. 이전 백업의 필드 누락과 `lumi` 값은 그대로 수용하며 화면에서 몬치치로 표시합니다. 기존 모모·노바 선택과 학습 이력은 보존합니다.
- 기존 IndexedDB 이름과 백업 스키마 1을 유지합니다. 새 백업 파일명은 `시몬치치-모드-날짜.json`입니다.
- 교육 콘텐츠와 승인 상태, 학습 선택·채점·복습·XP 규칙은 유지합니다. 일반 빌드는 승인 콘텐츠만 제공하며, 현재 초안은 명시적인 개발 데모에서 확인합니다.

주요 변경 파일은 `src/app/App.tsx`, `src/features/settings/SettingsScreen.tsx`, `src/features/daily-quest/Quest.tsx`, `src/components/Mascot.tsx`, `src/core/avatar.ts`, `src/core/types.ts`, `src/data/db.ts`, `src/styles/index.css`, `index.html`, `vite.config.ts`, `scripts/generate-icons.ts`와 `public/icons/`입니다. 회귀 검사는 `tests/unit/db.test.ts`, `tests/e2e/quest.spec.ts`, `tests/e2e/production.spec.ts`에 반영했습니다.

## 검증

| 명령                          | 결과                                   |
| ----------------------------- | -------------------------------------- |
| `npm run typecheck`           | 통과                                   |
| `npm run lint`                | 통과                                   |
| `npm run test`                | 64개 통과                              |
| `npm run build`               | 통과                                   |
| `npm run test:e2e`            | Chromium 3개 + WebKit 3개, 총 6개 통과 |
| `npm run test:e2e:production` | Chromium 1개 + WebKit 1개, 총 2개 통과 |

데모 E2E가 `build:demo`를, 일반 배포 E2E가 `build`를 실행했습니다. 마지막 검사는 일반 배포로 종료하여 현재 `dist/`는 일반 학습 빌드입니다. 전체 문제은행을 포함한 번들 크기에 대한 Vite의 500kB 권고 경고는 남아 있습니다.

페이지 제목·로고·manifest의 `short_name`, 새 사용자의 몬치치 기본 선택, 한글 백업 파일명, 노바 선택의 새로고침·백업 복원 유지가 두 브라우저에서 통과했습니다. 기존 필드 누락·`lumi`·`monchichi`·`momo`·`nova` 설정의 백업 복원과 표시 해석은 단위 테스트로 확인했습니다. 퀘스트 전체 완료, 중복 XP 방지, 다음날 복습, 서비스 워커 오프라인 실행, 일반 배포의 초안 차단도 계속 통과했습니다.

375×812·430×932·1440×1000 화면의 가로 넘침과 중앙 배치, 주요 버튼의 44px 크기와 가림 여부를 검사했습니다. 다음은 실제 375×812 viewport 캡처이며 각 화면의 WebKit 파일도 같은 폴더에 보관했습니다.

| 화면           | 캡처                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| 기본 홈        | [시몬치치 홈](../artifacts/screenshots/simonchichi/default-home-375-chromium.png)     |
| 기본 어휘 카드 | [몬치치와 학습](../artifacts/screenshots/simonchichi/default-study-375-chromium.png)  |
| 기본 친구 설정 | [몬치치 선택](../artifacts/screenshots/simonchichi/default-settings-375-chromium.png) |
| 설치 아이콘    | [512px 아이콘](../artifacts/screenshots/simonchichi/app-icon-512.png)                 |

홈의 한글 로고와 검은 후드 캐릭터, 학습 카드의 다음 버튼, 설정의 기본 선택 표시와 아이콘을 이미지로 확인했습니다. **실제 iPhone 검증과 외부 배포는 미실시**입니다.

## iPhone 확인 방법과 다음 범위

`npm run dev` 실행 후 같은 Wi-Fi의 iPhone Safari에서 터미널에 표시된 Network 주소의 4175 포트로 화면을 확인할 수 있습니다. 초안 퀘스트는 설정의 **데모 콘텐츠 사용(검수 전)** 을 켭니다.

홈 화면 이름·아이콘·오프라인 동작 확인에는 HTTPS 주소가 필요합니다. `npm run build:demo` 결과를 별도 HTTPS 체험 주소에서 열고 Safari 공유 → **홈 화면에 추가**를 사용합니다. 기존 설치의 이름과 아이콘은 기기에 캐시될 수 있으므로 변경 여부를 실제 기기에서 확인해야 합니다. 기기 데이터를 지우기 전에는 백업합니다.

다음 범위는 [iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)의 실제 Safari·설치·키보드·VoiceOver 확인과 콘텐츠의 문항별 교육 검수입니다. Playwright WebKit 결과를 실제 iPhone 확인으로 간주하지 않습니다.
