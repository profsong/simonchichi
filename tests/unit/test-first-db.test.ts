import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCourseQuest, buildReviewTest } from '../../src/core/course-quest';
import { deriveReviewRewardPolicy } from '../../src/core/rewards';
import type { LearningSession } from '../../src/core/types';
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

vi.mock('../../src/data/courses', async () => {
  const { fixtureCourses: courses } = await import('./course-fixtures');
  return {
    getCourses: () => courses,
    getCourse: (id: string) => courses.find((course) => course.id === id)!,
  };
});
const course = fixtureCourses[0];
const version = '1.0.0-12week-draft';
let db: QuestDatabase;
let count = 0;
let day = '2026-11-02';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  day = '2026-11-02';
  db = new QuestDatabase('demo', `test-first-${count++}`);
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});
async function options() {
  return {
    course,
    reviews: await db.reviews.toArray(),
    sessions: await db.sessions.toArray(),
    attempts: await db.attempts.toArray(),
    localDay: day,
    random: () => 0.25,
  };
}
async function start() {
  return startOrResumeSession(db, buildCourseQuest(await options())!, day, version);
}
async function answer(session: LearningSession, correct = true) {
  const step = session.steps[session.currentQuestionIndex];
  if (step.kind === 'question')
    return submitAnswer(
      db,
      session.sessionId,
      correct ? (step.choices ? String(step.correctIndex) : step.acceptedAnswers![0]) : 'wrong',
      1,
    );
}
async function next(session: LearningSession, correct = true) {
  await answer(session, correct);
  return advanceSession(db, session.sessionId, session.steps[session.currentQuestionIndex].id);
}
async function finish(session: LearningSession) {
  while (session.status === 'in_progress') session = await next(session);
  return session;
}
async function roundtrip() {
  const saved = JSON.parse(await exportBackup(db, version));
  expect(saved.schemaVersion).toBe(6);
  await resetDatabase(db);
  await importBackup(db, JSON.stringify(saved), version);
  expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
  return saved;
}

describe('test-first course persistence', () => {
  it('completes an all-correct 29-step lesson with a fixed empty queue and no vocabulary cards', async () => {
    const session = await start();
    expect(session.courseFlow).toBe('test-first-v1');
    expect(session.steps).toHaveLength(29);
    expect(
      session.steps
        .slice(5, 25)
        .every((step) => step.kind === 'question' && step.phase === 'vocab'),
    ).toBe(true);
    const done = await finish(session);
    expect(done).toMatchObject({
      status: 'completed',
      currentQuestionIndex: 29,
      xpAwarded: 270,
      retestQuestionIds: [],
    });
    expect(done.studyEvents).toHaveLength(5); // Only the first-ever memory previews.
    expect(await db.attempts.count()).toBe(24);
    expect(
      (await db.reviews.toArray()).filter((review) =>
        course.lessons[0].wordIds.includes(review.entityId),
      ),
    ).toHaveLength(20);
    await Promise.all([advanceSession(db, done.sessionId), advanceSession(db, done.sessionId)]);
    expect(
      (await db.rewards.toArray()).filter((reward) => reward.kind === 'completion'),
    ).toHaveLength(1);
    await roundtrip();
  });

  it('fixes only the original vocabulary mistakes once, grades rotated tail choices, and pays retry XP after reload', async () => {
    await finish(await start());
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    day = '2026-11-03';
    let session = await start();
    const original = structuredClone(session.steps);
    const wrong = new Set([0, 5, 7, 25, 28]); // Memory, two words, syntax, and reading.
    while (session.currentQuestionIndex < 28) {
      const index = session.currentQuestionIndex;
      await answer(session, !wrong.has(index));
      if (index === 5)
        await expect(
          submitAnswer(db, session.sessionId, String(original[5].correctIndex), 1, true),
        ).rejects.toThrow('재시험');
      session = await advanceSession(db, session.sessionId, original[index].id);
    }
    await answer(session, false);
    expect((await db.sessions.get(session.sessionId))?.retestQuestionIds).toBeUndefined();
    const queued = await Promise.all(
      Array.from({ length: 5 }, () => advanceSession(db, session.sessionId, original[28].id)),
    );
    expect(queued.every((saved) => saved.currentQuestionIndex === 29)).toBe(true);
    session = queued[0];
    expect(session.retestQuestionIds).toEqual([original[5].id, original[7].id]);
    expect(session.steps).toHaveLength(31);
    expect(session.status).toBe('in_progress');
    expect(session.xpAwarded).toBe(240);
    expect(
      (await db.rewards.toArray()).filter(
        (reward) => reward.localDay === day && reward.kind === 'completion',
      ),
    ).toHaveLength(0);
    await roundtrip();
    db.close();
    db = new QuestDatabase('demo', db.name);
    session = await start();
    expect(session.retestQuestionIds).toEqual([original[5].id, original[7].id]);
    const policy = deriveReviewRewardPolicy(await options());
    expect(policy).toMatchObject({ basisKind: 'in-progress', questMaxXp: 320, maxXp: 96 });
    const review = await startOrResumeSession(db, buildReviewTest(await options())!, day, version);
    expect(review.rewardPolicy).toEqual(policy);
    const tail = session.steps[29];
    expect(tail.correctIndex).not.toBe(original[5].correctIndex);
    await expect(advanceSession(db, session.sessionId, tail.id)).rejects.toThrow();
    const answers = await Promise.all(
      Array.from({ length: 5 }, () =>
        submitAnswer(db, session.sessionId, String(tail.correctIndex), 1),
      ),
    );
    expect(new Set(answers.map((attempt) => attempt.attemptId)).size).toBe(1);
    expect(answers[0]).toMatchObject({
      attemptId: `${session.sessionId}:${original[5].id}:retry`,
      questionId: original[5].id,
      firstTry: false,
      isCorrect: true,
    });
    expect(await db.reviews.get(tail.entityId)).toMatchObject({
      correctDays: [],
      activeRecallCorrectDays: [],
      mastered: false,
    });
    await roundtrip(); // Answered but not advanced tail is a valid resume boundary.
    session = await advanceSession(db, session.sessionId, tail.id);
    session = await finish(session);
    expect(session.xpAwarded).toBe(276);
    expect(session.retestQuestionIds).toEqual([original[5].id, original[7].id]);
    expect(session.steps).toHaveLength(31);
    const rewards = await db.rewards.where('sessionId').equals(session.sessionId).toArray();
    expect(rewards.filter((reward) => reward.kind === 'retry')).toHaveLength(2);
    expect(
      rewards
        .filter((reward) => reward.kind === 'retry')
        .every((reward) => reward.xp === 3 && !reward.questionId?.endsWith(':retest')),
    ).toBe(true);
    await Promise.all([
      advanceSession(db, session.sessionId),
      advanceSession(db, session.sessionId),
    ]);
    expect((await db.sessions.get(session.sessionId))?.xpAwarded).toBe(276);
    expect(deriveReviewRewardPolicy(await options())).toMatchObject({
      basisKind: 'completed-today',
      questMaxXp: 320,
      maxXp: 96,
    });
    await roundtrip(); // The separate review keeps its original in-progress basis.
  });

  it('handles all twenty vocabulary mistakes without adding another tail after wrong retest answers', async () => {
    let session = await start();
    while (session.currentQuestionIndex < 29)
      session = await next(
        session,
        session.currentQuestionIndex < 5 || session.currentQuestionIndex >= 25,
      );
    expect(session.retestQuestionIds).toHaveLength(20);
    expect(session.steps).toHaveLength(49);
    while (session.status === 'in_progress') {
      const tail = session.steps[session.currentQuestionIndex];
      const wrong = await answer(session, false);
      const resubmitted = await submitAnswer(
        db,
        session.sessionId,
        String(tail.correctIndex),
        1,
        true,
      );
      expect(resubmitted).toEqual(wrong);
      session = await advanceSession(db, session.sessionId, tail.id);
    }
    expect(session.xpAwarded).toBe(70);
    expect(session.steps).toHaveLength(49);
    expect(await db.attempts.count()).toBe(44);
    expect((await db.rewards.toArray()).filter((reward) => reward.kind === 'retry')).toEqual([]);
    await roundtrip();
  });

  it('rejects changed queue, rotated grading, early retry timestamps, and forged tail XP atomically', async () => {
    let session = await start();
    while (session.currentQuestionIndex < 29)
      session = await next(session, ![5, 7].includes(session.currentQuestionIndex));
    await answer(session);
    const saved = await exportBackup(db, version);
    for (const corruption of [
      'queue',
      'tail-key',
      'original-index',
      'early-time',
      'first-xp',
      'early-queue',
      'schema4',
    ] as const) {
      const bad = JSON.parse(saved);
      const target = bad.sessions[0];
      const retry = bad.attempts.find((attempt: { firstTry: boolean }) => !attempt.firstTry);
      if (corruption === 'queue') target.retestQuestionIds.reverse();
      if (corruption === 'tail-key') target.steps[29].correctIndex = target.steps[5].correctIndex;
      if (corruption === 'original-index') retry.answer = String(target.steps[5].correctIndex);
      if (corruption === 'early-time')
        retry.completedAt = new Date(Date.parse(target.createdAt) + 1).toISOString();
      if (corruption === 'first-xp') {
        const reward = bad.rewards.find((reward: { kind: string }) => reward.kind === 'retry');
        reward.kind = 'first';
        reward.xp = 10;
        target.xpAwarded += 7;
      }
      if (corruption === 'early-queue') target.currentQuestionIndex = 28;
      if (corruption === 'schema4') bad.schemaVersion = 4;
      await expect(importBackup(db, JSON.stringify(bad), version), corruption).rejects.toThrow();
      expect(await exportBackup(db, version)).toBe(saved);
    }
  });
});
