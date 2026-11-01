import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { QuestStep } from '../../src/core/types';
import legacyNative from './fixtures/legacy-v5-native-0.8.json' with { type: 'json' };
import {
  availableXp,
  chooseCourse,
  courseData,
  currentSession,
  currentStep,
  exportData,
  firstQuestion,
  importData,
  navigation,
  next,
  snapshot,
  totalXp,
} from './helpers';

function item(page: Page, step: QuestStep) {
  return page.locator(
    `[data-testid="mistake-item"][data-mistake-key="${step.entityType}:${step.entityType === 'vocab' ? step.entityId : step.id}"]`,
  );
}

async function openNote(page: Page) {
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByTestId('today-mistakes').click();
  await expect(page.getByRole('heading', { name: '오답노트', exact: true })).toBeVisible();
}

async function answer(page: Page, correct: boolean, double = false) {
  const step = await currentStep(page);
  const courses = await Promise.all([courseData('advanced-300'), courseData('suneung-2000')]);
  if (step.entityType === 'vocab') {
    const word = courses
      .flatMap((course) => course.vocabulary)
      .find((entry) => entry.id === step.entityId);
    expect(word, `Authored vocabulary ${step.entityId}`).toBeDefined();
    if (step.choices) expect(step.choices[step.correctIndex!]).toBe(word!.koreanMeaning);
    else expect(step.acceptedAnswers).toEqual(word!.acceptedAnswers);
  } else {
    const canonical = courses
      .flatMap((course) =>
        course.lessons.flatMap((lesson) => [
          ...lesson.syntax,
          ...lesson.readings.map((entry) => entry.question),
        ]),
      )
      .find((entry) => entry.id === step.id);
    expect(canonical, `Authored question ${step.id}`).toBeDefined();
    expect(step.choices).toEqual(canonical!.choices);
    expect(step.correctIndex).toBe(canonical!.correctIndex);
  }
  if (step.choices) {
    await page
      .getByRole('radio')
      .nth(correct ? step.correctIndex! : (step.correctIndex! + 1) % step.choices.length)
      .check();
  } else {
    await page.getByRole('textbox').fill(correct ? step.acceptedAnswers![0] : 'incorrect');
  }
  const confirm = page.getByRole('button', { name: '정답 확인', exact: true });
  if (double)
    await confirm.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  else await confirm.click();
  await expect(
    page.getByText(correct ? '잘 떠올렸어요!' : '괜찮아요, 함께 확인해요.', { exact: true }),
  ).toBeVisible();
  if (String((await currentSession(page)).sessionKind) === 'mistakes')
    await expect(page.getByRole('button', { name: '한 번 더 도전', exact: true })).toHaveCount(0);
  return step;
}

async function startMistakes(page: Page, expectedLength: number) {
  const before = (await snapshot(page)).sessions.length;
  await page.getByRole('button', { name: '오답 퀴즈 시작', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-session-kind', 'mistakes');
  const session = await currentSession(page);
  expect(session.courseId).toBeUndefined();
  expect(session.steps).toHaveLength(expectedLength);
  expect((await snapshot(page)).sessions).toHaveLength(before + 1);
  return session;
}

async function finishMistakes(page: Page, correct = true) {
  const initial = await currentSession(page);
  for (let index = initial.currentQuestionIndex; index < initial.steps.length; index++) {
    const step = await currentStep(page);
    if (await page.getByRole('button', { name: '정답 확인', exact: true }).isVisible())
      await answer(page, correct, true);
    await page.getByRole('button', { name: '다음으로', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.locator(`[data-question-id="${step.id}"]`)).toHaveCount(0);
  }
  await expect(page.getByTestId('quest-completion')).toHaveAttribute(
    'data-session-kind',
    'mistakes',
  );
  const saved = await snapshot(page);
  const session = saved.sessions.find((entry) => entry.sessionId === initial.sessionId)!;
  expect(session.status).toBe('completed');
  expect(session.xpAwarded).toBe(0);
  expect(
    saved.attempts.filter((entry) => entry.sessionId === session.sessionId && entry.firstTry),
  ).toHaveLength(initial.steps.length);
  expect(
    saved.rewards.filter(
      (entry) => entry.sessionId === session.sessionId && entry.kind === 'completion',
    ),
  ).toHaveLength(0);
  return session;
}

async function capture(page: Page, info: TestInfo, name: string) {
  const folder = 'artifacts/screenshots/mistakes';
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

test('today opens a real mistake note; distinct quiz successes clear it while a new error resets the count', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await openNote(page);
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '오답 퀴즈 시작', exact: true })).toHaveCount(0);
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true }).click();
  const wrong = await firstQuestion(page);
  await answer(page, false, true);
  const original = await currentSession(page);
  await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  // A mistake is available immediately, even before reading or the delayed course retest.
  await openNote(page);
  await expect(item(page, wrong)).toContainText('0 / 2회');
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await capture(page, info, 'today-mistake-before-course-completion');
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await chooseCourse(page, 'suneung-2000');
  await openNote(page);
  await expect(item(page, wrong)).toBeVisible();
  await startMistakes(page, 1);
  await finishMistakes(page);
  const once = await snapshot(page);
  await page.reload();
  await openNote(page);
  await expect(item(page, wrong)).toContainText('1 / 2회');
  expect(
    (await snapshot(page)).sessions.find((session) => session.sessionId === original.sessionId),
  ).toEqual(original);
  expect(
    (await snapshot(page)).rewards.filter((reward) => reward.kind === 'completion'),
  ).toHaveLength(0);

  await startMistakes(page, 1);
  await finishMistakes(page, false);
  await page.reload();
  await openNote(page);
  await expect(item(page, wrong)).toContainText('0 / 2회');
  for (const expectedCount of [1, 0]) {
    await startMistakes(page, 1);
    await finishMistakes(page);
    await page.reload();
    await openNote(page);
    await expect(page.getByTestId('mistake-item')).toHaveCount(expectedCount);
    if (expectedCount) await expect(item(page, wrong)).toContainText('1 / 2회');
  }
  await expect(page.getByRole('button', { name: '오답 퀴즈 시작', exact: true })).toHaveCount(0);
  const cleared = await snapshot(page);
  expect(totalXp(cleared)).toBe(totalXp(once));
  expect(new Set(cleared.rewards.map((reward) => reward.id)).size).toBe(cleared.rewards.length);
  expect(cleared.sessions.find((session) => session.sessionId === original.sessionId)).toEqual(
    original,
  );
  await capture(page, info, 'cleared-after-two-successes');
});

test('mixed-domain mistakes survive partial backup and offline continuation without changing the fixed course retest', async ({
  page,
  context,
}, info) => {
  test.setTimeout(210_000);
  await page.goto('/');
  await page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true }).click();
  const original = await currentSession(page);
  const vocabulary = original.steps.filter((step) => step.phase === 'vocab');
  const wrongSteps = [
    vocabulary[0],
    vocabulary[1],
    original.steps.find((step) => step.phase === 'syntax')!,
    original.steps.find((step) => step.phase === 'reading')!,
  ];
  const wrongIds = new Set(wrongSteps.map((step) => step.id));
  for (const planned of original.steps) {
    const step = await currentStep(page);
    expect(step.id).toBe(planned.id);
    if (step.kind === 'question') await answer(page, !wrongIds.has(step.id));
    await next(page, step.id);
  }
  const tail = await currentSession(page);
  expect(tail.retestQuestionIds).toEqual(wrongSteps.slice(0, 2).map((step) => step.id));
  expect(tail.steps).toHaveLength(31);
  await answer(page, true);
  await next(page, `${wrongSteps[0].id}:retest`);
  const pausedCourse = await currentSession(page);
  await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: /^오답노트 보기/ }).click();
  await expect(page.getByTestId('mistake-item')).toHaveCount(4);
  await expect(item(page, wrongSteps[0])).toContainText('1 / 2회');
  for (const [label, count] of [
    ['단어', 2],
    ['문장', 1],
    ['독해', 1],
    ['전체', 4],
  ] as const) {
    await page
      .getByRole('group', { name: '오답 영역' })
      .getByRole('button', { name: new RegExp(`^${label}\\s`) })
      .click();
    await expect(page.getByTestId('mistake-item')).toHaveCount(count);
  }
  await capture(page, info, 'mixed-domain-note');
  const quiz = await startMistakes(page, 4);
  const first = await answer(page, true, true);
  await next(page, first.id);
  const partial = await snapshot(page);
  const pendingStep = (await currentStep(page)).id;
  await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByText('오프라인 준비 완료', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const backup = await exportData(page, info, 'partial-mistakes-schema-6.json');
  expect(backup.data.schemaVersion).toBe(6);
  for (const key of [
    'attempts',
    'reviews',
    'sessions',
    'rewards',
    'settings',
    'purchases',
  ] as const)
    expect(backup.data[key]).toEqual(partial[key]);
  await page.getByRole('button', { name: '학습 기록 초기화', exact: true }).click();
  await page.getByRole('textbox', { name: '초기화 확인' }).fill('초기화');
  await page.getByRole('button', { name: '영구 삭제', exact: true }).click();
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
  await importData(page, backup.data, 'restore-partial-mistakes.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(partial);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await openNote(page);
  await page.getByRole('button', { name: '오답 퀴즈 이어하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-session-id', quiz.sessionId);
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', pendingStep);
  await finishMistakes(page);
  await page.reload();
  await openNote(page);
  await expect(page.getByTestId('mistake-item')).toHaveCount(3);
  await expect(item(page, wrongSteps[0])).toHaveCount(0);
  await startMistakes(page, 3);
  await finishMistakes(page);
  await page.reload();
  await openNote(page);
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  const beforeCourseCompletion = await snapshot(page);
  expect(
    beforeCourseCompletion.sessions.find((session) => session.sessionId === original.sessionId),
  ).toEqual(pausedCourse);
  expect(
    beforeCourseCompletion.rewards.filter((reward) => reward.kind === 'completion'),
  ).toHaveLength(0);
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-phase', 'retest');
  await expect(page.getByTestId('quest-screen')).toHaveAttribute(
    'data-question-id',
    `${wrongSteps[1].id}:retest`,
  );
  await answer(page, true, true);
  await next(page, `${wrongSteps[1].id}:retest`);
  await expect(page.getByTestId('quest-completion')).toHaveAttribute('data-session-kind', 'course');
  const complete = await snapshot(page);
  const finishedCourse = complete.sessions.find(
    (session) => session.sessionId === original.sessionId,
  )!;
  expect(finishedCourse.steps).toEqual(pausedCourse.steps);
  expect(finishedCourse.retestQuestionIds).toEqual(pausedCourse.retestQuestionIds);
  expect(complete.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  expect(new Set(complete.rewards.map((reward) => reward.id)).size).toBe(complete.rewards.length);
  await page.reload();
  expect(await snapshot(page)).toEqual(complete);
  await openNote(page);
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  await capture(page, info, 'offline-cleared-note');
  await context.setOffline(false);
});

test('an original Android backup preserves every learning and purchase record when browsing the new note', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date(legacyNative.exportedAt));
  await page.goto('/');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await importData(page, legacyNative, 'original-native-0.8-schema-5.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  const restored = await snapshot(page);
  expect(restored.sessions).toEqual(
    legacyNative.sessions.map((session) => ({ ...session, appMode: 'learner' })),
  );
  for (const key of ['attempts', 'reviews', 'rewards', 'settings', 'purchases'] as const)
    expect(restored[key]).toEqual(legacyNative[key]);
  expect(totalXp(restored)).toBe(998);
  expect(availableXp(restored)).toBe(418);
  await openNote(page);
  for (const label of ['단어', '문장', '독해', '전체'])
    await page
      .getByRole('group', { name: '오답 영역' })
      .getByRole('button', { name: new RegExp(`^${label}\\s`) })
      .click();
  expect(await snapshot(page)).toEqual(restored);
  await page.reload();
  await openNote(page);
  expect(await snapshot(page)).toEqual(restored);
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  const backup = await exportData(page, info, 'preserved-native-records-schema-6.json');
  expect(backup.data.schemaVersion).toBe(6);
  for (const key of [
    'attempts',
    'reviews',
    'sessions',
    'rewards',
    'settings',
    'purchases',
  ] as const)
    expect(backup.data[key]).toEqual(restored[key]);
});
