import { expect, test, type Page } from '@playwright/test';
import legacyPartial from './fixtures/legacy-v4-partial-course-0.7.json' with { type: 'json' };
import type { QuestStep } from '../../src/core/types';
import {
  chooseCorrectAnswer,
  currentSession,
  currentStep,
  expectCourseShape,
  exportData,
  finishQuest,
  importData,
  navigation,
  next,
  saveScreen,
  snapshot,
  totalXp,
} from './helpers';

async function answerWrong(page: Page, step: QuestStep) {
  expect(step.choices).toBeDefined();
  await page
    .getByRole('radio')
    .nth((step.correctIndex! + 1) % step.choices!.length)
    .check();
  await page.getByRole('button', { name: '정답 확인', exact: true }).click();
  await expect(page.getByText('괜찮아요, 함께 확인해요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '한 번 더 도전', exact: true })).toHaveCount(0);
}

test('only first-wrong vocabulary returns after reading once, with a persistent partial retest and one retry reward', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true }).click();
  const initial = await expectCourseShape(page, 'advanced-300', 1);
  const vocabulary = initial.steps.filter((step) => step.phase === 'vocab');
  const wrongVocabulary = [vocabulary[0].id, vocabulary[4].id];
  const nonVocabularyWrong = [
    initial.steps.find((step) => step.phase === 'syntax')!.id,
    initial.steps.find((step) => step.phase === 'reading')!.id,
  ];
  const wrongIds = new Set([...wrongVocabulary, ...nonVocabularyWrong]);
  for (const planned of initial.steps) {
    const step = await currentStep(page);
    expect(step.id).toBe(planned.id);
    expect(step.phase).not.toBe('retest');
    if (step.kind === 'question') {
      if (wrongIds.has(step.id)) await answerWrong(page, step);
      else {
        await chooseCorrectAnswer(page, step);
        await page.getByRole('button', { name: '정답 확인', exact: true }).click();
        await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
      }
    } else expect(step.phase).toBe('review');
    expect((await currentSession(page)).steps).toHaveLength(29);
    expect((await currentSession(page)).retestQuestionIds).toBeUndefined();
    if (step.id === initial.steps.at(-1)!.id) {
      const beforeTail = await snapshot(page);
      expect(totalXp(beforeTail)).toBe(200);
      expect(beforeTail.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(0);
      expect(beforeTail.sessions[0].status).toBe('in_progress');
    }
    await next(page, step.id);
  }

  const expanded = await currentSession(page);
  expect(expanded.steps).toHaveLength(31);
  expect(expanded.retestQuestionIds).toEqual(wrongVocabulary);
  const tail = expanded.steps.slice(29);
  expect(tail.map((step) => step.id)).toEqual(wrongVocabulary.map((id) => `${id}:retest`));
  expect(tail.map((step) => step.retestOf)).toEqual(wrongVocabulary);
  expect(tail.every((step) => step.phase === 'retest' && step.kind === 'question')).toBe(true);
  expect(tail.some((step) => nonVocabularyWrong.includes(step.retestOf!))).toBe(false);
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-phase', 'retest');
  await expect(page.locator('.lesson-stage-label')).toHaveText('오답 다시 도전');
  await expect(page.getByRole('button', { name: '정답 확인', exact: true })).toBeVisible();
  await expect(page.getByText('괜찮아요, 함께 확인해요.', { exact: true })).toHaveCount(0);
  await saveScreen(page, testInfo.project.name, 'retest-start-375');
  await chooseCorrectAnswer(page, tail[0]);
  await page.getByRole('button', { name: '정답 확인', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  const firstTailAnswer = await snapshot(page);
  expect(totalXp(firstTailAnswer)).toBe(203);
  expect(firstTailAnswer.attempts.filter((attempt) => !attempt.firstTry)).toHaveLength(1);
  expect(firstTailAnswer.attempts.find((attempt) => !attempt.firstTry)).toMatchObject({
    questionId: wrongVocabulary[0],
    isCorrect: true,
  });
  expect(firstTailAnswer.rewards.filter((reward) => reward.kind === 'retry')).toEqual([
    expect.objectContaining({ id: `question:${wrongVocabulary[0]}:retry`, xp: 3 }),
  ]);
  expect(firstTailAnswer.rewards.some((reward) => reward.questionId?.endsWith(':retest'))).toBe(
    false,
  );
  await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', tail[0].id);
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(firstTailAnswer);
  await next(page, tail[0].id);
  const partialTail = await snapshot(page);
  await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  const backup = await exportData(page, testInfo, 'partial-retest-backup.json');
  expect(backup.data.schemaVersion).toBe(6);
  expect(backup.data.sessions).toEqual(partialTail.sessions);
  await page.getByRole('button', { name: '학습 기록 초기화', exact: true }).click();
  await page.getByRole('textbox', { name: '초기화 확인' }).fill('초기화');
  await page.getByRole('button', { name: '영구 삭제', exact: true }).click();
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
  await importData(page, backup.data, 'restore-partial-retest.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(partialTail);
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', tail[1].id);
  await expect(page.getByRole('button', { name: '정답 확인', exact: true })).toBeVisible();
  await answerWrong(page, await currentStep(page));
  expect((await snapshot(page)).attempts.filter((attempt) => !attempt.firstTry)).toHaveLength(2);
  await saveScreen(page, testInfo.project.name, 'retest-wrong-once-375');
  await page.getByRole('button', { name: '다음으로', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('quest-completion')).toBeVisible();
  const complete = await snapshot(page);
  expect(complete.sessions[0]).toMatchObject({ status: 'completed', currentQuestionIndex: 31 });
  expect(complete.sessions[0].steps).toHaveLength(31);
  expect(complete.attempts).toHaveLength(26);
  expect(complete.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  expect(complete.rewards.filter((reward) => reward.kind === 'retry')).toHaveLength(1);
  expect(totalXp(complete)).toBe(233);
  await expect(page.locator('.reward-words strong')).toHaveText(/20\s*개/);
  await expect(page.locator('.completion-words .chip')).toHaveCount(20);
  await saveScreen(page, testInfo.project.name, 'retest-completion-375');
  await page.reload();
  expect(await snapshot(page)).toEqual(complete);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: '10단어 복습 테스트 시작', exact: true }).click();
  expect((await currentSession(page)).rewardPolicy).toMatchObject({
    questMaxXp: 270,
    maxXp: 81,
    basisKind: 'completed-today',
  });
});

test('an actual 0.7 partial 49-step backup resumes unchanged, then the next course uses 29 steps and excludes memory errors from retest', async ({
  page,
}, testInfo) => {
  test.setTimeout(210_000);
  await page.clock.setFixedTime(new Date(legacyPartial.exportedAt));
  await page.goto('/');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await importData(page, legacyPartial, 'original-0.7-partial.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible();
  const restored = await snapshot(page);
  for (const name of [
    'attempts',
    'reviews',
    'sessions',
    'settings',
    'rewards',
    'purchases',
  ] as const)
    expect(restored[name]).toEqual(legacyPartial[name]);
  const migrated = await exportData(page, testInfo, 'legacy-partial-schema-6.json');
  expect(migrated.data.schemaVersion).toBe(6);
  expect(migrated.data.sessions).toEqual(legacyPartial.sessions);
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  expect((await currentSession(page)).steps).toEqual(legacyPartial.sessions[0].steps);
  expect((await currentSession(page)).courseFlow).toBeUndefined();
  await expect(page.getByTestId('study-card')).toBeVisible();
  await finishQuest(page, true);
  const oldFinished = (await snapshot(page)).sessions[0];
  expect(oldFinished.steps).toEqual(legacyPartial.sessions[0].steps);
  expect(oldFinished.currentQuestionIndex).toBe(49);
  expect(oldFinished.courseFlow).toBeUndefined();
  expect(totalXp(await snapshot(page))).toBe(270);
  await page.getByRole('button', { name: '다음 퀘스트 시작', exact: true }).click();
  await expectCourseShape(page, 'advanced-300', 2);
  const memory = await currentStep(page);
  expect(memory.phase).toBe('review');
  expect(memory.kind).toBe('question');
  await answerWrong(page, memory);
  await finishQuest(page, true);
  const both = await snapshot(page);
  const latest = both.sessions.find((session) => session.courseFlow === 'test-first-v1')!;
  expect(latest.status).toBe('completed');
  expect(latest.steps).toHaveLength(29);
  expect(latest.retestQuestionIds).toEqual([]);
  expect(both.rewards.filter((reward) => reward.kind === 'completion')).toHaveLength(1);
  expect(totalXp(both)).toBe(550);
});
