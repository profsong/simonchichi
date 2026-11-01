import { expect, test } from '@playwright/test';
import legacyBackup from './fixtures/legacy-v1-completed-demo.json' with { type: 'json' };
import {
  chooseCorrectAnswer,
  chooseCourse,
  currentSession,
  currentStep,
  expectCourseShape,
  expectMobileShell,
  expectReachableTouchTarget,
  exportData,
  finishQuest,
  firstQuestion,
  importData,
  navigation,
  next,
  saveScreen,
  snapshot,
  totalXp,
} from './helpers';

test('normal learner starts immediately with two persistent courses and an accessible mobile shell', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle('시몬치치 · 나의 영어 모험');
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('advanced-300');
  await expect(page.getByRole('combobox', { name: '학습 단어장' }).locator('option')).toHaveText([
    '중등 심화 300',
    '수능 영어 2000',
  ]);
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  await expect(page.getByText(/콘텐츠 준비|승인된 콘텐츠가 없어요|개발 데모/)).toHaveCount(0);
  for (const width of [320, 375, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectMobileShell(page, width);
    for (const button of await navigation(page).getByRole('button').all())
      await expectReachableTouchTarget(button);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  await saveScreen(page, testInfo.project.name, 'home-375');
  await chooseCourse(page, 'suneung-2000');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
  await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /독해|읽기/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /^몬치치/ })).toBeChecked();
  await page.getByRole('radio', { name: /^시폼푸린/ }).click();
  await expect(page.getByTestId('selected-avatar')).toHaveAttribute('data-avatar-id', 'sipompurin');
  await chooseCourse(page, 'advanced-300');
  await page.reload();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^시폼푸린/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('advanced-300');
  await saveScreen(page, testInfo.project.name, 'settings-375');
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await expect(page.getByRole('button', { name: '10단어 복습 테스트 시작' })).toBeDisabled();
  await expect(page.getByText('배운 단어가 0개예요.', { exact: false })).toBeVisible();
  const room = page.getByTestId('avatar-room');
  await expect(room).toHaveAttribute('data-avatar-id', 'sipompurin');
  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    const scene = await page.getByTestId('avatar-room-scene').boundingBox();
    expect(scene).not.toBeNull();
    expect(Math.abs(scene!.width - scene!.height)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    await room.evaluate((element) => {
      const testCard = document.querySelector('.review-test-card')!;
      const library = document.querySelector('.wordbook-library-link')!;
      return (
        Boolean(element.compareDocumentPosition(testCard) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        Boolean(testCard.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    }),
  ).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await saveScreen(page, testInfo.project.name, 'room-initial-375');
});

test('a 29-step all-correct course has no vocabulary study cards or retest and survives schema-6 backup restore', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('radio', { name: /^시치와레/ }).click();
  await expect(page.getByTestId('selected-avatar')).toHaveAttribute('data-avatar-id', 'sichiware');
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  const session = await expectCourseShape(page, 'advanced-300', 1);
  expect(
    session.steps.filter((step) => step.phase === 'review').every((step) => step.kind === 'study'),
  ).toBe(true);
  await expect(navigation(page)).toHaveCount(0);
  await expectReachableTouchTarget(page.getByRole('button', { name: '다음으로', exact: true }));
  await saveScreen(page, testInfo.project.name, 'study-375');
  const step = await firstQuestion(page);
  await chooseCorrectAnswer(page, step);
  const submit = page.getByRole('button', { name: '정답 확인', exact: true });
  await submit.focus();
  await expect(submit).toBeFocused();
  await expectReachableTouchTarget(submit);
  await saveScreen(page, testInfo.project.name, 'question-375');
  await submit.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  const answered = await snapshot(page);
  expect(answered.attempts).toHaveLength(1);
  expect(totalXp(answered)).toBe(10);
  await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', step.id);
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(answered);
  await finishQuest(page);
  await expect(
    page.getByRole('heading', { name: '오늘은 충분히 했어요', exact: true }),
  ).toBeVisible();
  await saveScreen(page, testInfo.project.name, 'completion-375');
  const completed = await snapshot(page);
  expect(completed.attempts).toHaveLength(24);
  expect(completed.sessions[0].status).toBe('completed');
  expect(completed.sessions[0].currentQuestionIndex).toBe(29);
  expect(completed.sessions[0].retestQuestionIds).toEqual([]);
  await expect(page.locator('.reward-words strong')).toHaveText(/20\s*개/);
  await expect(page.locator('.completion-words .chip')).toHaveCount(20);
  expect(totalXp(completed)).toBe(270);
  expect(completed.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  expect(completed.reviews.every((review) => !review.mastered)).toBe(true);
  await page.getByRole('button', { name: '오늘의 탐험 마치기' }).click();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  const backup = await exportData(page, testInfo, 'course-backup.json');
  expect(backup.data.schemaVersion).toBe(6);
  expect(backup.data.appMode).toBe('learner');
  for (const name of [
    'attempts',
    'reviews',
    'sessions',
    'rewards',
    'settings',
    'purchases',
  ] as const)
    expect(backup.data[name]).toEqual(completed[name]);
  await page.getByRole('button', { name: '학습 기록 초기화', exact: true }).click();
  await expect(page.getByRole('button', { name: '영구 삭제' })).toBeDisabled();
  await page.getByRole('textbox', { name: '초기화 확인' }).fill('초기화');
  await page.getByRole('button', { name: '영구 삭제' }).click();
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
  expect((await snapshot(page)).sessions).toHaveLength(0);
  await importData(page, backup.data, 'restore-course.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(completed);
  await expect(page.getByRole('radio', { name: /^시치와레/ })).toBeChecked();
  await importData(page, { ...backup.data, schemaVersion: 999 }, 'unsupported.json');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await snapshot(page)).toEqual(completed);
  await page.reload();
  await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
  await expect(page.locator(`[data-plan-id="${session.planId}"]`)).toHaveAttribute(
    'data-completed',
    'true',
  );
  await navigation(page).getByRole('button', { name: '성장 기록', exact: true }).click();
  await expect(page.getByTestId('completed-plan-count')).toHaveText('1');
  await expect(page.getByTestId('session-history-item')).toHaveCount(1);
});

test('the cached normal app completes and retains a full course without a network', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  await expectCourseShape(page, 'advanced-300', 1);
  await finishQuest(page);
  const before = await snapshot(page);
  expect(before.attempts).toHaveLength(24);
  await page.reload();
  await expect(page.getByTestId('total-xp')).toHaveText('270 XP');
  expect(await snapshot(page)).toEqual(before);
  await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
  await expect(page.locator('[data-testid="map-plan"][data-completed="true"]')).toHaveCount(1);
});

test('same-day continuation and switching courses preserve separate maps, sessions and one daily bonus', async ({
  page,
}) => {
  test.setTimeout(210_000);
  await page.goto('/');
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  const first = await expectCourseShape(page, 'advanced-300', 1);
  await finishQuest(page);
  const continueButton = page.getByRole('button', { name: '다음 퀘스트 시작', exact: true });
  await continueButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  const second = await expectCourseShape(page, 'advanced-300', 2);
  expect(second.sessionId).not.toBe(first.sessionId);
  expect((await snapshot(page)).sessions).toHaveLength(2);
  expect(
    second.steps
      .filter((step) => step.phase === 'review')
      .every((step) => step.kind === 'question'),
  ).toBe(true);
  const question = await firstQuestion(page);
  await chooseCorrectAnswer(page, question);
  await page.getByRole('button', { name: '정답 확인' }).click();
  await next(page, question.id);
  const advancedPartial = await currentSession(page);
  await page.getByRole('button', { name: '저장하고 나가기' }).click();
  await chooseCourse(page, 'suneung-2000');
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  const suneung = await expectCourseShape(page, 'suneung-2000', 1);
  const pdfQuestion = await firstQuestion(page);
  await chooseCorrectAnswer(page, pdfQuestion);
  await page.getByRole('button', { name: '정답 확인' }).click();
  await next(page, pdfQuestion.id);
  const pdfPartial = await currentSession(page);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
  await page.getByRole('button', { name: '탐험 이어하기' }).click();
  expect(await currentSession(page)).toEqual(pdfPartial);
  await page.getByRole('button', { name: '저장하고 나가기' }).click();
  await chooseCourse(page, 'advanced-300');
  await page.getByRole('button', { name: '탐험 이어하기' }).click();
  expect(await currentSession(page)).toEqual(advancedPartial);
  await finishQuest(page);
  const result = await snapshot(page);
  expect(result.sessions.filter((item) => item.status === 'completed')).toHaveLength(2);
  expect(result.sessions.find((item) => item.sessionId === suneung.sessionId)).toEqual(pdfPartial);
  expect(result.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  expect(totalXp(result)).toBe(result.sessions.reduce((sum, item) => sum + item.xpAwarded, 0));
  await page.getByRole('button', { name: '오늘의 탐험 마치기' }).click();
  await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
  await expect(page.getByTestId('map-plan')).toHaveCount(15);
  await expect(page.locator('[data-testid="map-plan"][data-completed="true"]')).toHaveCount(2);
  await navigation(page).getByRole('button', { name: '성장 기록', exact: true }).click();
  await expect(page.getByTestId('completed-plan-count')).toHaveText('2');
  await expect(page.getByTestId('session-history-item')).toHaveCount(3);
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await chooseCourse(page, 'suneung-2000');
  await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
  await expect(page.getByTestId('map-plan')).toHaveCount(100);
  await expect(page.locator('[data-testid="map-plan"][data-completed="true"]')).toHaveCount(0);
});

test('review tests persist ten learned choices and count five first-letter recalls as assisted', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  await finishQuest(page);
  await page.getByRole('button', { name: '오늘의 탐험 마치기' }).click();
  const before = await snapshot(page);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: '10단어 복습 테스트 시작' }).click();
  const review = await currentSession(page);
  expect(review.sessionKind).toBe('review-test');
  expect(review.rewardPolicy).toMatchObject({
    version: 1,
    scoring: 'first-correct-proportion',
    basisCourseId: 'advanced-300',
    basisKind: 'completed-today',
    questMaxXp: 270,
    maxXp: 81,
  });
  expect(review.steps).toHaveLength(10);
  expect(new Set(review.steps.map((step) => step.entityId)).size).toBe(10);
  expect(
    review.steps.every((step) => before.reviews.some((state) => state.entityId === step.entityId)),
  ).toBe(true);
  expect(review.steps.filter((step) => step.mode === 'recognition')).toHaveLength(5);
  expect(review.steps.filter((step) => step.mode === 'recall' && step.alwaysHinted)).toHaveLength(
    5,
  );
  const wrong = await currentStep(page);
  await page
    .getByRole('radio')
    .nth((wrong.correctIndex! + 1) % 4)
    .check();
  await page.getByRole('button', { name: '정답 확인' }).click();
  await expect(page.getByRole('button', { name: '다음으로', exact: true })).toBeVisible();
  const afterWrong = await snapshot(page);
  expect(totalXp(afterWrong)).toBe(totalXp(before));
  await page.reload();
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: '복습 테스트 이어하기' }).click();
  expect((await currentSession(page)).steps).toEqual(review.steps);
  expect(await snapshot(page)).toEqual(afterWrong);
  await next(page, wrong.id);
  while ((await currentStep(page)).mode !== 'recall') {
    const step = await currentStep(page);
    await chooseCorrectAnswer(page, step);
    await page.getByRole('button', { name: '정답 확인' }).click();
    await next(page, step.id);
  }
  const recall = await currentStep(page);
  await expect(page.getByTestId('recall-first-letter').locator('strong')).toHaveText(
    recall.acceptedAnswers![0][0],
  );
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('textbox').focus();
  await expect(page.getByRole('textbox')).toBeFocused();
  await chooseCorrectAnswer(page, recall);
  await expectReachableTouchTarget(page.getByRole('button', { name: '정답 확인' }));
  await saveScreen(page, testInfo.project.name, 'recall-375');
  await finishQuest(page, true);
  await expect(page.getByTestId('quest-completion')).toHaveAttribute(
    'data-session-kind',
    'review-test',
  );
  await expect(page.getByRole('heading', { name: '기억을 다시 채웠어요!' })).toBeVisible();
  const after = await snapshot(page);
  const attempts = after.attempts.filter((attempt) => attempt.sessionId === review.sessionId);
  expect(attempts).toHaveLength(10);
  expect(
    attempts.filter((attempt) => attempt.mode === 'recall').every((attempt) => attempt.usedHint),
  ).toBe(true);
  expect(
    after.reviews.every((state) => state.activeRecallCorrectDays.length === 0 && !state.mastered),
  ).toBe(true);
  expect(after.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  const firstReviewRewards = after.rewards.filter((reward) => reward.id.startsWith('review:'));
  expect(firstReviewRewards).toHaveLength(1);
  expect(firstReviewRewards[0]).toMatchObject({
    id: `review:${review.sessionId}`,
    kind: 'review',
    xp: 72,
  });
  expect(totalXp(after)).toBe(totalXp(before) + 72);
  expect(after.rewards.filter((reward) => reward.sessionId === review.sessionId)).toHaveLength(1);

  expect(
    after.sessions.filter(
      (session) => session.sessionKind === 'course' && session.status === 'completed',
    ),
  ).toHaveLength(1);
  await page.getByRole('button', { name: '복습함으로' }).click();
  await navigation(page).getByRole('button', { name: '성장 기록', exact: true }).click();
  await expect(page.getByTestId('completed-plan-count')).toHaveText('1');
  await expect(page.getByTestId('session-history-item')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('total-xp')).toHaveText('342 XP');
  expect(await snapshot(page)).toEqual(after);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: '10단어 복습 테스트 시작' }).click();
  const second = await currentSession(page);
  expect(second.sessionId).not.toBe(review.sessionId);
  expect(second.localDay).toBe(review.localDay);
  await finishQuest(page, true);
  const twice = await snapshot(page);
  expect(twice.rewards.filter((reward) => reward.id.startsWith('review:'))).toHaveLength(2);
  expect(twice.rewards.find((reward) => reward.id === `review:${second.sessionId}`)).toMatchObject({
    kind: 'review',
    xp: 81,
  });
  expect(totalXp(twice)).toBe(423);
  expect(
    twice.sessions.filter(
      (session) => session.sessionKind === 'review-test' && session.status === 'completed',
    ),
  ).toHaveLength(2);
  await page.reload();
  await expect(page.getByTestId('total-xp')).toHaveText('423 XP');
  expect(await snapshot(page)).toEqual(twice);
});

test('an original schema-1 demo backup restores into the current app without claiming new-course completion', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await importData(page, legacyBackup, 'original-legacy-backup.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('total-xp')).toHaveText('80 XP');
  const restored = await snapshot(page);
  expect(restored.attempts).toEqual(legacyBackup.attempts);
  expect(restored.reviews).toEqual(legacyBackup.reviews);
  expect(restored.rewards).toEqual(legacyBackup.rewards);
  expect(restored.sessions).toEqual(
    legacyBackup.sessions.map((session) => ({ ...session, appMode: 'learner' })),
  );
  const backup = await exportData(page, testInfo, 'legacy-migrated.json');
  expect(backup.data.schemaVersion).toBe(6);
  expect(backup.data.appMode).toBe('learner');
  await importData(page, backup.data, 'legacy-roundtrip.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(restored);
  await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
  await expect(page.getByTestId('map-plan')).toHaveCount(15);
  await expect(page.locator('[data-testid="map-plan"][data-completed="true"]')).toHaveCount(0);
  await navigation(page).getByRole('button', { name: '성장 기록', exact: true }).click();
  await expect(page.getByTestId('completed-plan-count')).toHaveText('0');
  await expect(page.getByTestId('session-history-item')).toContainText('이전 탐험');
});
