# 12개 챕터에 들어 있는 단어

> 이 문서는 0.4.0까지의 기록입니다. 현재 0.5.0의 두 단어장·15/100회차·일반 실행 정책은 [현재 사용 안내](USER_GUIDE.md)와 [과정 개편 보고서](WORDBOOK_COURSES_REPORT.md)를 따릅니다.

기준: `src/data/seed-content.json`의 기존 12주·60일 커리큘럼입니다. 각 챕터는 25단어와 5단계로 구성되며, 전체는 B1 80개·B2 140개·B3 80개, 총 300개입니다. 아래 순서는 원본 `weekPlans.vocabularyIds` 순서입니다.

**수능 단어 2000은 이 12개 챕터에 자동으로 들어가지 않습니다.** 별도 단어장 2,000개 중 176개는 기존 300개와 겹치고 1,824개는 추가 표제어입니다. 네 단어장을 합쳐 중복을 뺀 표제어는 2,124개지만, 기본 모험의 분량은 계속 300개입니다.

B1·B2·B3는 내부 난이도 구분입니다. 각 챕터에는 여러 밴드가 섞여 있으며 공인 CEFR 등급을 뜻하지 않습니다. 콘텐츠의 교육 검수 전 상태도 유지합니다.

## 챕터 1. 학습 루틴과 핵심 정보

25개 · B1 20 / B2 5 / B3 0

progress, practice, complete, avoid, improve, clarify, include, challenge, benefit, focus, attempt, accurate, organize, adapt, compare, strategy, review, curious, effort, achieve, develop, notice, alter, approach, adequate

## 챕터 2. 다의어와 문맥

25개 · B1 20 / B2 5 / B3 0

brief, ambiguity, feature, combine, apply, nuance, consider, convey, detail, choice, diverse, anticipate, habit, arrange, connect, complex, literal, describe, behavior, replace, efficient, attend, context, prefer, express

## 챕터 3. 문장 구조 해독 I

25개 · B1 14 / B2 11 / B3 0

follow, emphasize, refer, sequence, expand, contain, assumption, support, function, relative, explain, subject, assess, belong, predicate, apparent, phrase, restrict, qualify, subordinate, relate, depend, mention, modify, separate

## 챕터 4. 문장 구조 해독 II

25개 · B1 14 / B2 11 / B3 0

except, whether, conditional, while, otherwise, involve, require, conclude, attain, regardless, instead, indicate, allow, limit, whereas, identify, collapse, occur, prior, despite, within, concession, exception, flexible, unless

## 챕터 5. 원인·결과·환경

25개 · B1 8 / B2 17 / B3 0

damage, accelerate, fluctuate, increase, consistent, decrease, cause, contribute, mechanism, conflict, contrast, release, carbon, emission, consequence, sustain, affect, proportion, prevent, environment, disrupt, accumulate, consume, result, adaptation

## 챕터 6. 근거와 판단

25개 · B1 4 / B2 21 / B3 0

verify, demonstrate, criterion, belief, alternative, factor, reliable, empathy, valid, decline, infer, detect, capacity, purpose, rational, perception, priority, attribute, justify, decision, convince, debate, evidence, crucial, bias

## 챕터 7. 글의 논리 I

25개 · B1 0 / B2 21 / B3 4

logical, emerge, enable, claim, thus, premise, persuade, rebut, disagree, determine, objection, evidence-based, encounter, concede, fallacy, reasoning, argument, refute, qualitative, assert, corroborate, counterargument, acknowledge, therefore, distinct

## 챕터 8. 글의 논리 II

25개 · B1 0 / B2 21 / B3 4

underlying, subtext, inference, interpretation, convention, assume, transition, reference, ambiguously, background, structure, substitute, analyze, implicit, cohesion, enhance, explicit, unify, generate, establish, evident, evaluate, distinguish, continuity, signal

## 챕터 9. 주제·제목·요지

25개 · B1 0 / B2 17 / B3 8

issue, articulate, conventional, fundamental, outline, summarize, essential, abstract, overall, highlight, major, objective, overarching, interpret, perspective, concept, conclusion, elaborate, synthesize, integrate, viewpoint, maintain, theme, illustrate, central

## 챕터 10. 빈칸·문장 연결

25개 · B1 0 / B2 10 / B3 15

predict, deduce, irrelevant, constrain, coincide, deliberate, inevitable, deviation, eliminate, correspond, preserve, reluctant, compelling, tentative, appropriate, significant, allocate, extrapolate, plausible, contrary, relevant, dilemma, contradict, hypothesis, inhibit

## 챕터 11. 복합 상황의 의사결정

25개 · B1 0 / B2 1 / B3 24

viable, infrastructure, comprehensive, incentive, constraint, scarcity, feasible, mitigate, resilience, aggregate, transform, contingent, autonomous, coherent, compensate, trade-off, heterogeneous, interdependence, disparity, equitable, adverse, empirical, advocate, cognitive, credible

## 챕터 12. 종합 독해와 재진단

25개 · B1 0 / B2 0 / B3 25

diminish, robust, optimize, sustainable, longitudinal, innovative, replicate, paradox, provisional, causal, exposure, uncertainty, imply, counterintuitive, marginal, implement, compromise, deteriorate, derive, pragmatic, adaptive, ethical, perceive, accountability, cumulative

## 단어장이 더 늘어날 때

현재 구현은 기존 모험과 단어장 탐색을 구분합니다. 새 자료를 등록하면 단어장 목록·검색·중복 연결이 확장되고, 기존 12챕터의 배정·문항·완료 기록은 유지됩니다. 단어장을 읽는 것으로 퀘스트 XP나 숙련 기록을 추가하지 않습니다.

추후 새 단어장을 퀘스트로 구성하려면 그 자료용 코스 ID·단계 배정·검수된 뜻과 문제를 따로 정의하는 방식이 적합합니다. 기본 12챕터를 매번 늘리거나 기존 단계에 미검수 자료를 끼워 넣지 않습니다. 책별 코스 전환·진도 지도는 후속 기능이며 현재 이미 구현된 것으로 표시하지 않습니다.

단어장 등록과 재빌드 방법은 [단어장 가져오기 안내](WORDBOOK_IMPORT_REPORT.md), 일상 사용법은 [사용 안내](USER_GUIDE.md)를 참고하세요.
