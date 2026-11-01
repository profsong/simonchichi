import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCourseQuest } from '../../src/core/course-quest';
import { buildMistakeQuest, getActiveMistakes } from '../../src/core/mistakes';
import { completionReward, rewardForAttempt } from '../../src/core/rewards';
import { resolveStep } from '../../src/core/quest-builder';
import type { LearningSession, QuestStep } from '../../src/core/types';
import {
  advanceSession,
  exportBackup,
  importBackup,
  markHint,
  QuestDatabase,
  resetDatabase,
  startOrResumeSession,
  submitAnswer,
} from '../../src/data/db';
import { catalog } from '../../src/data/catalog';
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
const day = '2026-11-02';
let db: QuestDatabase;
let ordinal = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  db = new QuestDatabase('demo', `mistakes-${ordinal++}`);
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});
const correctAnswer = (step: QuestStep) =>
  step.choices ? String(step.correctIndex) : step.acceptedAnswers![0];
async function history(database = db) {
  return {
    attempts: await database.attempts.toArray(),
    sessions: await database.sessions.toArray(),
    appMode: database.mode,
  };
}
async function active(database = db) {
  const data = await history(database);
  return getActiveMistakes(data.attempts, data.sessions);
}
async function mistakePlan(database = db) {
  return buildMistakeQuest(await history(database))!;
}
async function seedMistakes() {
  const plan = buildCourseQuest({
    course,
    attempts: [],
    reviews: [],
    sessions: [],
    localDay: day,
  })!;
  let session = await startOrResumeSession(db, plan, day, version);
  // Leave the course in progress, with one wrong vocab, syntax, and reading answer.
  while (session.currentQuestionIndex < 28) {
    const step = session.steps[session.currentQuestionIndex];
    if (step.kind === 'question')
      await submitAnswer(
        db,
        session.sessionId,
        [5, 25, 27].includes(session.currentQuestionIndex) ? 'wrong' : correctAnswer(step),
        10,
      );
    session = await advanceSession(db, session.sessionId, step.id);
  }
  expect((await active()).map((item) => item.entityType).sort()).toEqual([
    'reading',
    'syntax',
    'vocab',
  ]);
  return session;
}
async function finish(session: LearningSession, database = db) {
  while (session.status === 'in_progress') {
    const step = session.steps[session.currentQuestionIndex];
    await submitAnswer(database, session.sessionId, correctAnswer(step), 10);
    session = await advanceSession(database, session.sessionId, step.id);
  }
  return session;
}
async function roundtrip(database = db) {
  const saved = JSON.parse(await exportBackup(database, version));
  expect(saved.schemaVersion).toBe(6);
  await resetDatabase(database);
  await importBackup(database, JSON.stringify(saved), version);
  expect(JSON.parse(await exportBackup(database, version))).toEqual(saved);
  return saved;
}

describe('dedicated mistake quiz persistence', () => {
  it('keeps course progress separate and clears mistakes after two saved quiz rounds without XP or duplicate submissions', async () => {
    const originalCourse = await seedMistakes();
    const originalAttempts = await db.attempts.toArray();
    const originalRewards = await db.rewards.toArray();
    const plan = await mistakePlan();
    const starts = await Promise.all(
      Array.from({ length: 6 }, () => startOrResumeSession(db, plan, day, version)),
    );
    expect(new Set(starts.map((session) => session.sessionId)).size).toBe(1);
    let session = starts[0];
    expect(session.sessionKind).toBe('mistakes');
    expect(session.courseId).toBeUndefined();
    expect(session.steps).toEqual(plan.steps);
    expect(await db.sessions.count()).toBe(2);
    await markHint(db, session.sessionId);
    const answers = await Promise.all(
      Array.from({ length: 6 }, () =>
        submitAnswer(db, session.sessionId, correctAnswer(session.steps[0]), 10),
      ),
    );
    expect(new Set(answers.map((answer) => answer.attemptId)).size).toBe(1);
    expect(answers[0].usedHint).toBe(true);
    expect(rewardForAttempt(answers[0], [], session)).toBeNull();
    expect((await active())[0].correctCount).toBe(1);
    const databaseName = db.name;
    db.close();
    db = new QuestDatabase('demo', databaseName);
    expect((await startOrResumeSession(db, await mistakePlan(), day, version)).sessionId).toBe(
      session.sessionId,
    );
    await roundtrip(); // Partially answered snapshot, including the hint, remains valid.
    session = await finish((await db.sessions.get(session.sessionId))!);
    expect((await active()).every((item) => item.correctCount === 1)).toBe(true);
    expect(session.xpAwarded).toBe(0);
    expect(completionReward(session, [], answers)).toBeNull();
    await roundtrip();
    vi.setSystemTime(new Date(2026, 10, 1, 1)); // Clock rollback cannot backdate the next round.
    const successorPlan = await mistakePlan();
    const successors = await Promise.all(
      Array.from({ length: 3 }, () =>
        startOrResumeSession(db, successorPlan, '2026-11-01', version, {
          continueFromSessionId: session.sessionId,
        }),
      ),
    );
    expect(new Set(successors.map((item) => item.sessionId)).size).toBe(1);
    expect(successors[0].localDay).toBe(day);
    expect(successors[0].createdAt! > session.updatedAt).toBe(true);
    await finish(successors[0]);
    expect(await active()).toEqual([]);
    expect(await mistakePlan()).toBeNull();
    expect(await db.sessions.get(originalCourse.sessionId)).toEqual(originalCourse);
    for (const attempt of originalAttempts)
      expect(await db.attempts.get(attempt.attemptId)).toEqual(attempt);
    expect(await db.rewards.toArray()).toEqual(originalRewards);
    expect(await db.purchases.count()).toBe(0);
    const final = await roundtrip();
    const overlapped = structuredClone(final);
    const secondRound = overlapped.sessions.find(
      (item: LearningSession) => item.sessionId === successors[0].sessionId,
    );
    // All first-round answers already exist, so the selected questions are still
    // plausible; nevertheless another round cannot start before completion commits.
    secondRound.createdAt = session.updatedAt;
    await expect(importBackup(db, JSON.stringify(overlapped), version)).rejects.toThrow();
    expect(JSON.parse(await exportBackup(db, version))).toEqual(final);
  });

  it('resets progress on another wrong answer and refuses an immediate retry in a mistake quiz', async () => {
    await seedMistakes();
    const first = await finish(await startOrResumeSession(db, await mistakePlan(), day, version));
    let second = await startOrResumeSession(db, await mistakePlan(), day, version, {
      continueFromSessionId: first.sessionId,
    });
    const wrong = second.steps[0];
    await submitAnswer(db, second.sessionId, 'wrong', 10);
    await expect(
      submitAnswer(db, second.sessionId, correctAnswer(wrong), 10, true),
    ).rejects.toThrow();
    expect((await active()).find((item) => item.entityId === wrong.entityId)?.correctCount).toBe(0);
    second = await advanceSession(db, second.sessionId, wrong.id);
    second = await finish(second);
    expect(await active()).toHaveLength(1);
    const third = await finish(
      await startOrResumeSession(db, await mistakePlan(), day, version, {
        continueFromSessionId: second.sessionId,
      }),
    );
    expect((await active())[0].correctCount).toBe(1);
    await finish(
      await startOrResumeSession(db, await mistakePlan(), day, version, {
        continueFromSessionId: third.sessionId,
      }),
    );
    expect(await active()).toEqual([]);
    await roundtrip();
  });

  it('rejects unearned or altered quiz plans and invalid restoration without replacing current records', async () => {
    const question = resolveStep(
      `course:${course.id}:recognition:${course.vocabulary[0].id}`,
      'demo',
    )!;
    await expect(
      startOrResumeSession(
        db,
        { planId: 'mistakes:v1:forged', sessionKind: 'mistakes', steps: [question] },
        day,
        version,
      ),
    ).rejects.toThrow();
    await seedMistakes();
    const plan = await mistakePlan();
    await expect(
      startOrResumeSession(db, { ...plan, courseId: course.id }, day, version),
    ).rejects.toThrow();
    const malformed = structuredClone(plan);
    malformed.steps[0].correctIndex = (malformed.steps[0].correctIndex! + 1) % 4;
    await expect(startOrResumeSession(db, malformed, day, version)).rejects.toThrow();
    const session = await startOrResumeSession(db, plan, day, version);
    await submitAnswer(db, session.sessionId, correctAnswer(session.steps[0]), 10);
    const good = JSON.parse(await exportBackup(db, version));
    for (const corrupt of [
      'answer',
      'plan',
      'creation-time',
      'retry',
      'daily-bonus',
      'old-schema',
    ]) {
      const bad = structuredClone(good);
      const target = bad.sessions.find(
        (item: LearningSession) => item.sessionId === session.sessionId,
      );
      if (corrupt === 'answer')
        target.steps[0].correctIndex = (target.steps[0].correctIndex + 1) % 4;
      if (corrupt === 'plan') target.planId = 'mistakes:v1:forged';
      if (corrupt === 'creation-time') target.createdAt = bad.sessions[0].createdAt;
      if (corrupt === 'retry') {
        const attempt = bad.attempts.find(
          (item: { sessionId: string }) => item.sessionId === session.sessionId,
        );
        attempt.firstTry = false;
        attempt.attemptId = attempt.attemptId.replace(/:first$/, ':retry');
      }
      if (corrupt === 'daily-bonus') {
        target.xpAwarded = 30;
        bad.rewards.push({
          id: `completion:${day}`,
          sessionId: target.sessionId,
          kind: 'completion',
          xp: 30,
          localDay: day,
        });
      }
      if (corrupt === 'old-schema') bad.schemaVersion = 5;
      await expect(importBackup(db, JSON.stringify(bad), version), corrupt).rejects.toThrow();
      expect(JSON.parse(await exportBackup(db, version))).toEqual(good);
    }
  });

  it('allows an owner-restored legacy wrong answer to be reviewed without mutating its original records', async () => {
    const legacy = resolveStep(catalog.vocabularyQuestions[0].id, 'demo')!;
    const original = await startOrResumeSession(
      db,
      { planId: catalog.dailyPlans[0].id, steps: [legacy] },
      day,
      version,
    );
    await submitAnswer(db, original.sessionId, 'wrong', 10);
    await advanceSession(db, original.sessionId, legacy.id);
    const saved = JSON.parse(await exportBackup(db, version));
    const owner = new QuestDatabase('learner', `mistakes-owner-${ordinal++}`);
    try {
      await importBackup(owner, JSON.stringify(saved), version);
      const quiz = await startOrResumeSession(owner, await mistakePlan(owner), day, version);
      expect(quiz.steps[0]).toEqual(legacy);
      await finish(quiz, owner);
      for (const attempt of saved.attempts)
        expect(await owner.attempts.get(attempt.attemptId)).toEqual(attempt);
      expect(await owner.rewards.toArray()).toEqual(saved.rewards);
      await roundtrip(owner);
    } finally {
      await owner.delete();
    }
  });
});
