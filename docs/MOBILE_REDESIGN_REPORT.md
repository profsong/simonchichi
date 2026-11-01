# English Quest 모바일 화면 개편 보고서

기준일: 2026-10-23 (KST)

## 구현 내용

파랑·초록을 중심으로 홈, 학습, 완료, 설정 화면을 모바일 앱 형태로 개편했습니다. 화면은 최대 480 CSS px의 한 열을 유지하며 데스크톱에서도 같은 학습 흐름을 중앙에 표시합니다.

- **홈:** 오늘의 단원, 4단계 학습 경로, 함께하는 캐릭터와 퀘스트 시작 버튼. 375px 화면에서 시작 버튼과 하단 탐색에 접근할 수 있습니다.
- **학습:** 진행률과 한 문제를 중심으로 구성하고 앱 헤더·하단 탐색을 숨깁니다. 큰 선택지와 하단 제출·다음 버튼을 제공합니다. 독해 근거는 정답 확인 후 본문 강조와 해설 영역에 표시합니다.
- **완료:** 선택한 친구의 축하 모습, XP·첫 응답 정답·새 단어 수, 다음 복습일을 표시합니다.
- **설정:** 직접 제작한 SVG 친구 루미(하늘 여우), 모모(민트 고양이), 노바(별빛 토끼)를 선택할 수 있습니다. 선택은 IndexedDB와 백업에 저장되며 이전 백업에 선택 값이 없으면 루미를 표시합니다.
- **접근성:** 주요 터치 대상, 키보드 포커스, 입력 글자 크기, safe area와 reduced motion 스타일을 반영했습니다. 실제 기기의 접근성 확인은 별도입니다.

문항의 승인 상태와 학습 저장·보상 규칙을 유지했습니다. 콘텐츠는 여전히 전부 `draft`이며 일반 학습 모드의 승인 콘텐츠는 0개입니다. 검수 전 문제는 개발 빌드에서 명시적으로 선택하는 데모로만 확인합니다.

## 변경 파일

| 영역                    | 주요 파일                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| 앱 구성과 탐색          | `src/app/App.tsx`                                                                                   |
| 홈·지도·복습            | `src/features/home/Today.tsx`, `src/features/home/WorldMap.tsx`, `src/features/reviews/Reviews.tsx` |
| 문제·완료               | `src/features/daily-quest/Quest.tsx`, `src/features/daily-quest/Completion.tsx`                     |
| 설정                    | `src/features/settings/SettingsScreen.tsx`                                                          |
| 캐릭터·아이콘·색상·배치 | `src/components/Mascot.tsx`, `src/components/Icon.tsx`, `src/styles/index.css`                      |
| 아바타 저장·검증        | `src/core/types.ts`, `src/data/db.ts`                                                               |
| 브라우저 검증           | `tests/e2e/quest.spec.ts`                                                                           |

PWA 아이콘과 테마는 `scripts/generate-icons.ts`, `public/icons/icon.svg`, `public/icons/apple-touch-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `index.html`, `vite.config.ts`에 반영했습니다. 사용하지 않는 이전 `src/components/Forest.tsx`는 제거했습니다.

## 실행한 검사

| 명령                          | 결과                                   |
| ----------------------------- | -------------------------------------- |
| `npm run typecheck`           | 통과                                   |
| `npm run lint`                | 통과                                   |
| `npm run test`                | 59개 통과                              |
| `npm run build`               | 통과                                   |
| `npm run test:e2e`            | Chromium 3개 + WebKit 3개, 총 6개 통과 |
| `npm run test:e2e:production` | Chromium 1개 + WebKit 1개, 총 2개 통과 |

데모 E2E는 `build:demo`, 일반 배포 E2E는 `build`를 실행합니다. 마지막 검사는 일반 배포이며 현재 `dist/`는 일반 학습 빌드입니다. 전체 콘텐츠가 포함된 JS 번들에 대한 Vite의 500kB 권고 경고는 남아 있지만 빌드와 오프라인 검사를 통과했습니다.

브라우저 검사에서 다음을 확인했습니다.

- 375×812, 430×932, 1440×1000 화면의 모든 탭에 가로 넘침이 없고 최대 480px 중앙 배치를 유지합니다.
- 주요 탐색·제출·다음 버튼은 44 CSS px 이상이며 버튼 중앙이 다른 요소에 가려지지 않습니다.
- 학습 중 하단 탐색이 사라지고, 375×460 축소 화면에서도 회상 답변 입력과 Enter 제출이 가능합니다.
- 노바 선택 후 새로고침, 백업 다운로드 → 초기화 → 복원으로 친구 선택과 학습 기록이 유지됩니다.
- 빠른 중복 제출, 새로고침 복구, 하루 완료 XP, 다섯 단어의 다음날 복습, 손상된 백업 거절, 데모/일반 기록 분리가 동작합니다.
- 서비스 워커 준비 후 네트워크를 끊어도 전체 퀘스트와 새로고침이 동작합니다.
- 일반 배포는 `?demo=1` 주소로 들어가도 데모 설정이나 초안 퀘스트를 제공하지 않습니다.

## 화면 확인

다음 파일은 긴 페이지를 합친 이미지가 아닌 실제 375×812 viewport 캡처입니다. Chromium과 WebKit 파일을 함께 보관했습니다.

| 화면             | Chromium 캡처                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------- |
| 오늘의 경로      | [홈](../artifacts/screenshots/mobile-redesign/home-demo-375-chromium.png)                 |
| 어휘 선택형 문제 | [문제](../artifacts/screenshots/mobile-redesign/quiz-375-chromium.png)                    |
| 독해 정답·근거   | [독해 피드백](../artifacts/screenshots/mobile-redesign/reading-feedback-375-chromium.png) |
| 퀘스트 완료      | [결과](../artifacts/screenshots/mobile-redesign/complete-375-chromium.png)                |
| 탐험 친구 선택   | [설정](../artifacts/screenshots/mobile-redesign/avatars-375-chromium.png)                 |

홈 경로의 설명과 캐릭터가 겹치던 배치는 조정 후 다시 확인했습니다. 독해 피드백 캡처는 본문을 스크롤한 상태이며 근거와 다음 버튼을 함께 확인할 수 있습니다.

## iPhone 실행과 남은 확인

1. 프로젝트 폴더에서 `npm run dev`를 실행합니다. 같은 Wi-Fi의 iPhone Safari에서 터미널에 표시된 Network 주소의 **4175 포트**로 열어 화면을 확인합니다.
2. 현재 초안 퀘스트 체험은 설정의 **데모 콘텐츠 사용(검수 전)** 을 켜고 진행합니다.
3. 설치·오프라인 검증은 `npm run build:demo`의 `dist/`를 별도 HTTPS 체험 주소에 배포한 뒤 Safari 공유 → **홈 화면에 추가**로 실행합니다. 일반 배포에는 `npm run build` 결과를 사용합니다.
4. 홈 화면 앱을 새로 실행하면 데모를 다시 켜야 할 수 있습니다. 데모 기록은 별도 DB에 남아 있습니다.
5. 실제 키보드, safe area, VoiceOver, 확대 글자, 홈 화면 재실행과 비행기 모드는 [실제 iPhone 체크리스트](IPHONE_TEST_CHECKLIST.md)에 기록합니다.

**실제 iPhone 검증과 외부 배포는 수행하지 않았습니다.** Playwright WebKit과 축소 viewport 검사는 실제 iOS 키보드·Safari·홈 화면 앱의 동작을 증명하지 않습니다.

다음 범위는 실제 iPhone에서 한 번의 전체 학습과 다음날 복습을 확인하고, 제공된 초안을 문항별로 교육 검수하는 것입니다. 진단·주간 보스전·보상형 꾸미기는 후속 단계로 유지합니다.
