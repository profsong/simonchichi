import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCourseQuest, buildReviewTest } from '../../src/core/course-quest';
import { resolveStep } from '../../src/core/quest-builder';
import type { CourseId, LearningSession } from '../../src/core/types';
import {
  advanceSession,
  exportBackup,
  importBackup,
  QuestDatabase,
  resetDatabase,
  startOrResumeSession,
  submitAnswer,
} from '../../src/data/db';
import { fixtureCourses } from './course-fixtures';
import historicalBackup from './fixtures/legacy-v2-demo-backup.json';

vi.mock('../../src/data/courses', async () => {
  const { fixtureCourses: courses } = await import('./course-fixtures');
  return {
    getCourses: () => courses,
    getCourse: (id: string) => courses.find((course) => course.id === id)!,
  };
});
let db: QuestDatabase;
let index = 0;
const version = '1.0.0-12week-draft';
const day = '2026-11-02';
const course = (id: CourseId = 'advanced-300') => fixtureCourses.find((item) => item.id === id)!;
async function options(id: CourseId = 'advanced-300', localDay = day) {
  return {
    course: course(id),
    reviews: await db.reviews.toArray(),
    attempts: await db.attempts.toArray(),
    sessions: await db.sessions.toArray(),
    localDay,
    random: () => 0.23,
  };
}
async function start(id: CourseId = 'advanced-300') {
  // Keep the historical storage regression on genuine 49-step card snapshots.
  // The separate test-first suite exercises newly generated 29-step sessions.
  const plan = buildCourseQuest(await options(id))!;
  const lesson = course(id).lessons.find((item) => item.id === plan.planId)!;
  const steps = [
    ...plan.steps.slice(0, 5),
    ...lesson.wordIds.flatMap((wordId) => [
      resolveStep(`course:${id}:study:${wordId}`, 'demo')!,
      resolveStep(`course:${id}:recognition:${wordId}`, 'demo')!,
    ]),
    ...lesson.syntax.map((item) => resolveStep(item.id, 'demo')!),
    ...lesson.readings.map((item) => resolveStep(item.question.id, 'demo')!),
  ];
  return startOrResumeSession(db, { ...plan, courseFlow: undefined, steps }, day, version);
}
async function next(session: LearningSession, correct = true) {
  const step = session.steps[session.currentQuestionIndex];
  if (step.kind === 'question')
    await submitAnswer(
      db,
      session.sessionId,
      correct ? (step.choices ? String(step.correctIndex) : step.acceptedAnswers![0]) : 'incorrect',
      25,
    );
  return advanceSession(db, session.sessionId, step.id);
}
async function finish(session: LearningSession) {
  while (session.status === 'in_progress') session = await next(session);
  return session;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  db = new QuestDatabase('demo', `course-db-${index++}`);
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe('course storage and historical backups', () => {
  it('restores the actual 0.4.0 demo backup without changing any of its five tables', async () => {
    await importBackup(db, JSON.stringify(historicalBackup), version);
    for (const name of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'] as const)
      expect(await db.table(name).toArray()).toEqual(historicalBackup[name]);
    expect((await db.rewards.toArray()).reduce((sum, reward) => sum + reward.xp, 0)).toBe(130);
    const saved = await exportBackup(db, version);
    expect(JSON.parse(saved).schemaVersion).toBe(6);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    for (const name of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'] as const)
      expect(await db.table(name).toArray()).toEqual(historicalBackup[name]);
  });

  it('ports a verified old demo backup into the owner database and keeps subsequent exports restorable', async () => {
    const owner = new QuestDatabase('learner', `owner-import-${index++}`);
    try {
      await importBackup(owner, JSON.stringify(historicalBackup), version);
      expect(await owner.attempts.toArray()).toEqual(historicalBackup.attempts);
      expect(await owner.reviews.toArray()).toEqual(historicalBackup.reviews);
      expect(await owner.rewards.toArray()).toEqual(historicalBackup.rewards);
      expect(await owner.settings.toArray()).toEqual(historicalBackup.settings);
      expect(await owner.sessions.toArray()).toEqual(
        historicalBackup.sessions.map((session) => ({ ...session, appMode: 'learner' })),
      );
      const saved = await exportBackup(owner, version);
      expect(JSON.parse(saved).appMode).toBe('learner');
      await resetDatabase(owner);
      await importBackup(owner, saved, version);
      expect(await exportBackup(owner, version)).toBe(saved);
      const tampered = structuredClone(historicalBackup);
      tampered.attempts[0].isCorrect = !tampered.attempts[0].isCorrect;
      await expect(importBackup(owner, JSON.stringify(tampered), version)).rejects.toThrow();
      expect(await exportBackup(owner, version)).toBe(saved);
      await expect(
        startOrResumeSession(
          owner,
          { planId: 'w01-d1', steps: [resolveStep('recall:v-adapt-sense1', 'demo')!] },
          '2026-11-03',
          version,
        ),
      ).rejects.toThrow();
      expect(await db.sessions.count()).toBe(0);
    } finally {
      await owner.delete();
    }
  });

  it('imports an unmodified version2 legacy shape and preserves it beside new course sessions', async () => {
    await finish(
      await startOrResumeSession(
        db,
        {
          planId: 'w01-d1',
          steps: [
            resolveStep('study:v-adapt-sense1', 'demo')!,
            resolveStep('recall:v-adapt-sense1', 'demo')!,
          ],
        },
        day,
        version,
      ),
    );
    const old = JSON.parse(await exportBackup(db, version));
    old.schemaVersion = 2;
    for (const session of old.sessions) {
      delete session.createdAt;
      delete session.studyEvents;
    }
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(old), version);
    const original = await db.sessions.toArray();
    await start();
    expect((await db.sessions.toArray()).filter((session) => !session.courseId)).toEqual(original);
    const roundtrip = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, roundtrip, version);
    expect((await db.sessions.toArray()).filter((session) => !session.courseId)).toEqual(original);
  });

  it('uses the completed course session as a stable continuation token across other-course activity', async () => {
    const first = await finish(await start());
    let other = await start('suneung-2000');
    const plan = buildCourseQuest(await options())!;
    const nextSession = await startOrResumeSession(db, plan, day, version, {
      continueFromSessionId: first.sessionId,
    });
    other = await next(other);
    const repeated = await startOrResumeSession(db, plan, day, version, {
      continueFromSessionId: first.sessionId,
    });
    expect(repeated.sessionId).toBe(nextSession.sessionId);
    expect(repeated.planId).toBe(course().lessons[1].id);
    expect((await start('suneung-2000')).sessionId).toBe(other.sessionId);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(await db.sessions.count()).toBe(3);
  });

  it('isolates concurrent starts by course and leaves legacy records untouched', async () => {
    const legacy = await startOrResumeSession(
      db,
      { planId: 'w01-d1', steps: [resolveStep('recall:v-adapt-sense1', 'demo')!] },
      day,
      version,
    );
    const original = await db.sessions.get(legacy.sessionId);
    const [advanced, duplicate, pdf] = await Promise.all([start(), start(), start('suneung-2000')]);
    expect(advanced.sessionId).toBe(duplicate.sessionId);
    expect(pdf.sessionId).not.toBe(advanced.sessionId);
    expect(await db.sessions.get(legacy.sessionId)).toEqual(original);
    await next(advanced);
    expect((await start()).currentQuestionIndex).toBe(1);
    expect((await start('suneung-2000')).currentQuestionIndex).toBe(0);
    const backup = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, backup, version);
    expect(await db.sessions.count()).toBe(3);
  });

  it('reconstructs SRS when legacy and two courses interleave studies, answers, and clock rollback', async () => {
    let legacy = await startOrResumeSession(
      db,
      {
        planId: 'w01-d1',
        steps: [
          resolveStep('study:v-adapt-sense1', 'demo')!,
          resolveStep('recall:v-adapt-sense1', 'demo')!,
        ],
      },
      day,
      version,
    );
    legacy = await next(legacy);
    // Emulate a genuine pre-upgrade record without mutating its learning history.
    delete legacy.createdAt;
    delete legacy.studyEvents;
    await db.sessions.put(legacy);
    let advanced = await start();
    advanced = await next(advanced);
    const pdf = await start('suneung-2000');
    await next(pdf, false);
    vi.setSystemTime(new Date(2026, 10, 1, 12));
    advanced = await next(advanced);
    await finish(legacy);
    await db.settings.put({
      id: 'preferences',
      sound: false,
      theme: 'forest',
      readingBand: 'auto',
      selectedWordbookId: 'suneung-2000',
    });
    const backup = JSON.parse(await exportBackup(db, version));
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(backup), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(backup);
    expect((await start()).sessionId).toBe(advanced.sessionId);
    expect((await start('suneung-2000')).sessionId).toBe(pdf.sessionId);
    expect((await db.settings.get('preferences'))?.selectedWordbookId).toBe('suneung-2000');
  });

  it('saves the random test and reward snapshot, forces visible hints, and rewards each completed round once', async () => {
    await finish(await start());
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    const nextDay = '2026-11-03';
    const plan = buildReviewTest(await options('advanced-300', nextDay))!;
    const [first, duplicate] = await Promise.all([
      startOrResumeSession(db, plan, nextDay, version),
      startOrResumeSession(db, plan, nextDay, version),
    ]);
    expect(duplicate.sessionId).toBe(first.sessionId);
    let test = first;
    for (let count = 0; count < 5; count++) test = await next(test);
    db.close();
    db = new QuestDatabase('demo', db.name);
    const resumed = await startOrResumeSession(
      db,
      { ...plan, steps: [...plan.steps].reverse() },
      nextDay,
      version,
    );
    expect(resumed.steps).toEqual(plan.steps);
    const recall = resumed.steps[5];
    const submissions = await Promise.all(
      [1, 2, 3].map(() => submitAnswer(db, resumed.sessionId, recall.acceptedAnswers![0], 10)),
    );
    expect(new Set(submissions.map((attempt) => attempt.attemptId)).size).toBe(1);
    expect(submissions[0].usedHint).toBe(true);
    expect((await db.reviews.get(recall.entityId))?.activeRecallCorrectDays).toEqual([]);
    test = await finish(await advanceSession(db, resumed.sessionId, recall.id));
    expect(test.xpAwarded).toBe(96);
    expect(
      (await db.rewards.toArray()).some(
        (reward) => reward.kind === 'completion' && reward.localDay === nextDay,
      ),
    ).toBe(false);
    const repeated = await finish(
      await startOrResumeSession(db, plan, nextDay, version, {
        continueFromSessionId: test.sessionId,
      }),
    );
    expect(repeated.xpAwarded).toBe(96);
    const backup = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, backup, version);
    expect((await db.sessions.get(repeated.sessionId))?.status).toBe('completed');
  });

  it('rejects wrong course metadata or a hidden first-letter clue without replacing records', async () => {
    await finish(await start());
    const plan = buildReviewTest(await options())!;
    const review = await startOrResumeSession(db, plan, day, version);
    const original = await exportBackup(db, version);
    for (const change of ['course', 'hint', 'study'] as const) {
      const backup = JSON.parse(original);
      const target = backup.sessions.find(
        (session: LearningSession) => session.sessionId === review.sessionId,
      );
      if (change === 'course') target.courseId = 'suneung-2000';
      if (change === 'hint') target.steps[5].alwaysHinted = false;
      if (change === 'study')
        backup.sessions[0].studyEvents[0].completedAt = '2099-01-01T00:00:00.000Z';
      await expect(importBackup(db, JSON.stringify(backup), version)).rejects.toThrow();
      expect(await exportBackup(db, version)).toBe(original);
    }
  });

  it('freezes the entry basis across course completion and pays only first-answer proportion once', async () => {
    let lesson = await start();
    while (lesson.currentQuestionIndex < 30) lesson = await next(lesson);
    const plan = buildReviewTest(await options())!;
    let review = await startOrResumeSession(db, plan, day, version);
    expect(review.rewardPolicy).toMatchObject({
      basisKind: 'in-progress',
      basisSessionId: lesson.sessionId,
      questMaxXp: 270,
      maxXp: 81,
    });
    const locked = review.rewardPolicy;
    const first = review.steps[0];
    const answer = String(first.correctIndex);
    await Promise.all([
      submitAnswer(db, review.sessionId, 'incorrect', 1),
      submitAnswer(db, review.sessionId, answer, 1),
    ]);
    await Promise.all([
      submitAnswer(db, review.sessionId, answer, 1, true),
      submitAnswer(db, review.sessionId, answer, 1, true),
    ]);
    expect(await db.rewards.where('sessionId').equals(review.sessionId).count()).toBe(0);
    review = await advanceSession(db, review.sessionId, first.id);
    await finish(lesson);
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    db.close();
    db = new QuestDatabase('demo', db.name);
    review = await startOrResumeSession(db, plan, '2026-11-03', version);
    expect(review.rewardPolicy).toEqual(locked);
    review = await finish(review);
    expect(review.xpAwarded).toBe(72);
    await Promise.all([advanceSession(db, review.sessionId), advanceSession(db, review.sessionId)]);
    expect(await db.rewards.where('sessionId').equals(review.sessionId).toArray()).toEqual([
      expect.objectContaining({ id: `review:${review.sessionId}`, kind: 'review', xp: 72 }),
    ]);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect((await db.sessions.get(review.sessionId))?.rewardPolicy).toEqual(locked);
    for (const key of ['maxXp', 'basisKind', 'basisSessionId'] as const) {
      const bad = JSON.parse(saved);
      const target = bad.sessions.find(
        (session: LearningSession) => session.sessionId === review.sessionId,
      );
      target.rewardPolicy[key] =
        key === 'maxXp' ? 96 : key === 'basisKind' ? 'completed-today' : 'quest-fake';
      await expect(importBackup(db, JSON.stringify(bad), version)).rejects.toThrow();
      expect(JSON.parse(await exportBackup(db, version))).toEqual(JSON.parse(saved));
    }
  });

  it('resumes an older policy-free review without changing its first-answer reward accounting', async () => {
    await finish(await start());
    const plan = buildReviewTest(await options())!;
    const newReview = await startOrResumeSession(db, plan, day, version);
    // Model the pre-0.6 entry snapshot, before it has generated any review rewards.
    const old = JSON.parse(await exportBackup(db, version));
    old.schemaVersion = 3;
    delete old.purchases;
    delete old.sessions.find(
      (session: LearningSession) => session.sessionId === newReview.sessionId,
    ).rewardPolicy;
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(old), version);
    const resumed = await startOrResumeSession(db, plan, day, version);
    expect(resumed.rewardPolicy).toBeUndefined();
    const completed = await finish(resumed);
    expect(completed.xpAwarded).toBe(100);
    expect(
      (await db.rewards.where('sessionId').equals(completed.sessionId).toArray()).every(
        (reward) => reward.kind === 'first',
      ),
    ).toBe(true);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect((await db.sessions.get(completed.sessionId))?.xpAwarded).toBe(100);
  });

  it('persists a zero-XP completion for an all-wrong review and does not replace it after reload', async () => {
    await finish(await start());
    const plan = buildReviewTest(await options())!;
    let review = await startOrResumeSession(db, plan, day, version);
    while (review.status === 'in_progress') review = await next(review, false);
    const expected = [
      {
        id: `review:${review.sessionId}`,
        sessionId: review.sessionId,
        kind: 'review',
        xp: 0,
        localDay: day,
      },
    ];
    expect(await db.rewards.where('sessionId').equals(review.sessionId).toArray()).toEqual(
      expected,
    );
    db.close();
    db = new QuestDatabase('demo', db.name);
    await Promise.all([advanceSession(db, review.sessionId), advanceSession(db, review.sessionId)]);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(await db.rewards.where('sessionId').equals(review.sessionId).toArray()).toEqual(
      expected,
    );
  });
});
