import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import type { CourseDocument } from '../../src/data/course-schema';
import type {
  CourseId,
  LearningSession,
  PracticeAttempt,
  PurchaseReceipt,
  QuestStep,
  ReviewState,
  RewardEvent,
  Settings,
} from '../../src/core/types';

export interface Snapshot {
  attempts: PracticeAttempt[];
  reviews: ReviewState[];
  sessions: LearningSession[];
  rewards: RewardEvent[];
  settings: Settings[];
  purchases: PurchaseReceipt[];
}

const courseCache = new Map<CourseId, CourseDocument>();

export async function courseData(id: CourseId) {
  let course = courseCache.get(id);
  if (!course) {
    course = JSON.parse(await readFile(`src/data/courses/${id}.json`, 'utf8')) as CourseDocument;
    courseCache.set(id, course);
  }
  return course;
}

export function navigation(page: Page) {
  return page.getByRole('navigation', { name: '모바일 메뉴' });
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('english-quest-learner');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ['attempts', 'reviews', 'sessions', 'rewards', 'settings', 'purchases'];
    try {
      const transaction = database.transaction(names, 'readonly');
      const entries = await Promise.all(
        names.map(
          (name) =>
            new Promise<[string, unknown[]]>((resolve, reject) => {
              const request = transaction.objectStore(name).getAll();
              request.onsuccess = () => resolve([name, request.result]);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      return Object.fromEntries(entries) as unknown as Snapshot;
    } finally {
      database.close();
    }
  });
}

export async function currentSession(page: Page) {
  const id = await page.getByTestId('quest-screen').getAttribute('data-session-id');
  const session = (await snapshot(page)).sessions.find((item) => item.sessionId === id);
  expect(session, `Saved session ${id}`).toBeDefined();
  return session!;
}

export async function currentStep(page: Page): Promise<QuestStep> {
  const session = await currentSession(page);
  const step = session.steps[session.currentQuestionIndex];
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', step.id);
  return step;
}

export async function chooseCorrectAnswer(page: Page, step: QuestStep) {
  const session = await currentSession(page);
  const course = await courseData(session.courseId!);
  if (step.choices) {
    if (step.phase === 'syntax' || step.phase === 'reading') {
      const canonical = course.lessons
        .flatMap((lesson) => [...lesson.syntax, ...lesson.readings.map((item) => item.question)])
        .find((question) => question.id === step.id);
      expect(canonical, `Authored question ${step.id}`).toBeDefined();
      expect(step.choices).toEqual(canonical!.choices);
      expect(step.correctIndex).toBe(canonical!.correctIndex);
    } else {
      const word = course.vocabulary.find((item) => item.id === step.entityId);
      expect(word, `Learned review word ${step.entityId}`).toBeDefined();
      expect(step.choices[step.correctIndex!]).toBe(word!.koreanMeaning);
      if (session.courseFlow && (step.phase === 'vocab' || step.phase === 'retest')) {
        await expect(page.getByTestId('test-first-word').locator('p[lang="en"]')).toHaveText(
          word!.headword,
        );
        await expect(page.getByRole('radio')).toHaveCount(4);
        await expect(page.getByTestId('study-card')).toHaveCount(0);
        await expect(page.locator('.answer-feedback')).toHaveCount(0);
      }
    }
    await page.getByRole('radio').nth(step.correctIndex!).check();
  } else {
    const word = course.vocabulary.find((item) => item.id === step.entityId);
    expect(word).toBeDefined();
    expect(step.acceptedAnswers).toEqual(word!.acceptedAnswers);
    await page.getByRole('textbox').fill(`  ${word!.acceptedAnswers[0].toUpperCase()}  `);
  }
}

export async function next(page: Page, id: string) {
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
}

export async function firstQuestion(page: Page) {
  for (let count = 0; count < 30; count++) {
    const step = await currentStep(page);
    if (step.kind === 'question') return step;
    await next(page, step.id);
  }
  throw new Error('A course question was not reached.');
}

export function totalXp(data: Snapshot) {
  return data.rewards.reduce((sum, reward) => sum + reward.xp, 0);
}

export function availableXp(data: Snapshot) {
  return totalXp(data) - data.purchases.reduce((sum, purchase) => sum + purchase.price, 0);
}

export async function expectCourseShape(page: Page, courseId: CourseId, lesson: number) {
  const session = await currentSession(page);
  const course = await courseData(courseId);
  expect(session.courseId).toBe(courseId);
  expect(session.sessionKind).toBe('course');
  expect(session.planId).toBe(course.lessons[lesson - 1].id);
  expect(session.courseFlow).toBe('test-first-v1');
  expect(session.steps).toHaveLength(29);
  expect(
    session.steps.filter((step) => step.phase === 'vocab' && step.kind === 'study'),
  ).toHaveLength(0);
  const vocabulary = session.steps.filter(
    (step) => step.phase === 'vocab' && step.kind === 'question',
  );
  expect(vocabulary).toHaveLength(20);
  expect(vocabulary.map((step) => step.entityId)).toEqual(course.lessons[lesson - 1].wordIds);
  expect(session.steps.map((step) => step.phase)).toEqual([
    ...Array(5).fill('review'),
    ...Array(20).fill('vocab'),
    'syntax',
    'syntax',
    'reading',
    'reading',
  ]);
  expect(session.steps.filter((step) => step.phase === 'review')).toHaveLength(5);
  expect(session.steps.filter((step) => step.phase === 'syntax')).toHaveLength(2);
  expect(session.steps.filter((step) => step.phase === 'reading')).toHaveLength(2);
  return session;
}

export async function finishQuest(page: Page, doubleFinal = false) {
  for (let count = 0; count < 60; count++) {
    if (await page.getByTestId('quest-completion').isVisible()) return;
    await expect(page.getByTestId('quest-screen')).toBeVisible();
    const step = await currentStep(page);
    if (
      step.kind === 'question' &&
      (await page.getByRole('button', { name: '정답 확인' }).isVisible())
    ) {
      if (step.evidenceQuote) await expect(page.locator('mark')).toHaveCount(0);
      await chooseCorrectAnswer(page, step);
      await page.getByRole('button', { name: '정답 확인' }).click();
      await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
      if (step.evidenceQuote) {
        await expect(page.locator('mark')).toHaveText(step.evidenceQuote);
        await expect(page.locator('blockquote')).toContainText(step.evidenceQuote);
      }
    }
    if (doubleFinal) {
      const session = await currentSession(page);
      if (session.currentQuestionIndex === session.steps.length - 1) {
        await page.getByRole('button', { name: '다음으로', exact: true }).evaluate((element) => {
          (element as HTMLButtonElement).click();
          (element as HTMLButtonElement).click();
        });
        await expect(page.getByTestId('quest-completion')).toBeVisible();
        return;
      }
    }
    await next(page, step.id);
  }
  throw new Error('The saved session did not finish within its expected steps.');
}

export async function chooseCourse(page: Page, id: CourseId) {
  await page.getByRole('combobox', { name: '학습 단어장', exact: true }).selectOption(id);
  await expect.poll(async () => (await snapshot(page)).settings[0]?.selectedWordbookId).toBe(id);
}

export async function exportData(page: Page, testInfo: TestInfo, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 다운로드', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^시몬치치-learner-.*\.json$/);
  const file = testInfo.outputPath(name);
  await download.saveAs(file);
  return {
    file,
    data: JSON.parse(await readFile(file, 'utf8')) as Snapshot & {
      schemaVersion: number;
      appMode: string;
    },
  };
}

export async function importData(page: Page, data: unknown, name: string) {
  await page.getByLabel('백업 파일 선택', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: '백업으로 복원', exact: true }).click();
}

export async function expectReachableTouchTarget(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  const box = await target.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(
    await target.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const center = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      return center !== null && element.contains(center);
    }),
  ).toBe(true);
}

export async function expectMobileShell(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const shell = await page.locator('.app-shell').boundingBox();
  expect(shell!.width).toBeLessThanOrEqual(480.5);
  expect(Math.abs(shell!.x + shell!.width / 2 - width / 2)).toBeLessThan(1);
  await expect(navigation(page)).toBeVisible();
}

export async function saveScreen(page: Page, project: string, name: string) {
  const folder = 'artifacts/screenshots/outfit-expansion';
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: `${folder}/${project}-${name}.png` });
}
