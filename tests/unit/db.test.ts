import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAvatar } from '../../src/core/avatar';
import { buildQuest, getCompletedPlanIds, resolveStep } from '../../src/core/quest-builder';
import { catalog } from '../../src/data/catalog';
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

const version = '1.0.0-12week-draft';
const day = '2026-10-23';
let db: QuestDatabase;
let counter = 0;
const canonicalStep = (id: string): QuestStep => {
  const step = resolveStep(id, 'demo');
  if (!step) throw new Error(`Missing fixture ${id}`);
  return step;
};
const question = () => canonicalStep('recall:v-adapt-sense1');
const study = () => canonicalStep('study:v-adapt-sense1');
const start = (steps = [question()]) =>
  startOrResumeSession(db, { planId: 'w01-d1', steps }, day, version);

async function finish(session: LearningSession): Promise<LearningSession> {
  let saved = session;
  while (saved.status === 'in_progress') {
    const step = saved.steps[saved.currentQuestionIndex];
    if (step.kind === 'question')
      await submitAnswer(
        db,
        saved.sessionId,
        step.choices ? String(step.correctIndex) : step.acceptedAnswers![0],
        500,
      );
    saved = await advanceSession(db, saved.sessionId, step.id);
  }
  return saved;
}

async function nextPlan(currentDay = day) {
  return buildQuest({
    catalog,
    localDay: currentDay,
    reviews: await db.reviews.toArray(),
    completedPlanIds: (await db.sessions.toArray())
      .filter((session) => session.status === 'completed')
      .map((session) => session.planId),
    reviewedEntityIds: (await db.attempts.where('localDay').equals(currentDay).toArray()).map(
      (attempt) => attempt.entityId,
    ),
  })!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 12));
  db = new QuestDatabase('demo', `test-quest-${counter++}`);
});

afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe('transactional study storage', () => {
  it('creates one session under concurrent starts and resumes it after reopening', async () => {
    const [first, second] = await Promise.all([start(), start()]);
    expect(first.sessionId).toBe(second.sessionId);
    await markHint(db, first.sessionId);
    const name = db.name;
    db.close();
    db = new QuestDatabase('demo', name);
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const resumed = await startOrResumeSession(
      db,
      { planId: 'w01-d2', steps: [] },
      '2026-10-24',
      version,
    );
    expect(resumed.hintStepIds).toEqual([question().id]);
    expect(resumed.sessionId).toBe(first.sessionId);
  });

  it('persists a single answer and reward for fast repeated taps and refresh', async () => {
    const session = await start();
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => submitAnswer(db, session.sessionId, ' ADAPT ', 900)),
    );
    expect(new Set(answers.map((answer) => answer.attemptId)).size).toBe(1);
    expect(await db.attempts.count()).toBe(1);
    expect(await db.rewards.count()).toBe(1);
    expect((await db.sessions.get(session.sessionId))?.xpAwarded).toBe(10);
    const answer = await submitAnswer(db, session.sessionId, 'different answer', 1);
    expect(answer.answer).toBe(' ADAPT ');
    expect(answer.isCorrect).toBe(true);
  });

  it('allows exactly one explicit retry after a wrong answer with no independent mastery', async () => {
    const session = await start();
    const first = await submitAnswer(db, session.sessionId, 'wrong', -1);
    expect(first.responseMs).toBe(0);
    expect(await db.rewards.toArray()).toEqual([expect.objectContaining({ kind: 'first', xp: 0 })]);
    expect((await submitAnswer(db, session.sessionId, 'adapt', 10)).isCorrect).toBe(false);
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => submitAnswer(db, session.sessionId, 'adapt', 300, true)),
    );
    expect(retries.every((attempt) => attempt.isCorrect && !attempt.firstTry)).toBe(true);
    expect(await db.attempts.count()).toBe(2);
    expect((await db.sessions.get(session.sessionId))?.xpAwarded).toBe(3);
    expect(await db.reviews.get(question().entityId)).toMatchObject({
      correctDays: [],
      activeRecallCorrectDays: [],
      mastered: false,
    });
  });

  it('keeps hints across reload and excludes hinted answers from recall evidence', async () => {
    const session = await start();
    await markHint(db, session.sessionId);
    db.close();
    db = new QuestDatabase('demo', db.name);
    const attempt = await submitAnswer(db, session.sessionId, 'adapt', Number.POSITIVE_INFINITY);
    expect(attempt.usedHint).toBe(true);
    expect(attempt.responseMs).toBe(0);
    expect(await db.reviews.get(question().entityId)).toMatchObject({
      activeRecallCorrectDays: [],
      mastered: false,
    });
  });

  it('schedules studied cards without correctness evidence or XP and guards duplicate advance', async () => {
    const secondStudy = canonicalStep('study:v-adequate-sense1');
    const session = await start([study(), secondStudy, question()]);
    await Promise.all(
      Array.from({ length: 4 }, () => advanceSession(db, session.sessionId, study().id)),
    );
    expect((await db.sessions.get(session.sessionId))?.currentQuestionIndex).toBe(1);
    expect(await db.reviews.get(study().entityId)).toMatchObject({
      stage: 1,
      dueDay: '2026-10-24',
      correctDays: [],
      mastered: false,
    });
    expect(await db.rewards.count()).toBe(0);
    expect(await db.attempts.count()).toBe(0);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect((await db.reviews.get(study().entityId))?.dueDay).toBe('2026-10-24');
  });

  it('requires answers before advancing and awards completion only once across reload', async () => {
    const session = await start();
    await expect(advanceSession(db, session.sessionId, question().id)).rejects.toThrow();
    await submitAnswer(db, session.sessionId, 'adapt', 10);
    await Promise.all(
      Array.from({ length: 5 }, () => advanceSession(db, session.sessionId, question().id)),
    );
    db.close();
    db = new QuestDatabase('demo', db.name);
    const resumed = await start();
    expect(resumed.status).toBe('completed');
    expect(resumed.xpAwarded).toBe(40);
    await advanceSession(db, resumed.sessionId);
    expect(
      (await db.rewards.toArray()).filter((event) => event.kind === 'completion'),
    ).toHaveLength(1);
  });

  it('does not farm first rewards by repeating the same question the next day or moving clock backward', async () => {
    const session = await start();
    await submitAnswer(db, session.sessionId, 'adapt', 10);
    await advanceSession(db, session.sessionId);
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const next = await startOrResumeSession(
      db,
      { planId: 'w01-d2', steps: [question()] },
      '2026-10-24',
      version,
    );
    await submitAnswer(db, next.sessionId, 'adapt', 10);
    await advanceSession(db, next.sessionId);
    expect((await db.sessions.get(next.sessionId))?.xpAwarded).toBe(30);
    vi.setSystemTime(new Date(2026, 9, 22, 12));
    expect((await start()).sessionId).toBe(next.sessionId);
    expect(await db.sessions.count()).toBe(2);
  });

  it('clamps attempt chronology when the device clock moves backward mid-session', async () => {
    const second = canonicalStep('recall:v-adequate-sense1');
    const session = await start([question(), second]);
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const first = await submitAnswer(db, session.sessionId, 'adapt', 10);
    await advanceSession(db, session.sessionId);
    vi.setSystemTime(new Date(2026, 9, 22, 12));
    const later = await submitAnswer(db, session.sessionId, 'adequate', 10);
    expect(later.completedAt > first.completedAt).toBe(true);
    expect(later.localDay).toBe(first.localDay);
  });

  it('rejects draft content from learner storage as well as learner selection', async () => {
    const learner = new QuestDatabase('learner', `test-learner-${counter++}`);
    try {
      await expect(
        startOrResumeSession(learner, { planId: 'w01-d1', steps: [question()] }, day, version),
      ).rejects.toThrow();
      expect(await learner.sessions.count()).toBe(0);
    } finally {
      await learner.delete();
    }
  });
});

describe('validated backup replacement', () => {
  async function completedBackup(): Promise<string> {
    const session = await start([study(), question()]);
    await advanceSession(db, session.sessionId);
    await submitAnswer(db, session.sessionId, 'wrong', 50);
    await submitAnswer(db, session.sessionId, 'adapt', 50, true);
    await advanceSession(db, session.sessionId);
    return exportBackup(db, version);
  }

  it.each([undefined, 'lumi', 'monchichi', 'momo', 'nova', 'sichiware', 'sipompurin'] as const)(
    'restores records and %s avatar settings without migrating saved preferences',
    async (avatarId) => {
      await db.settings.put({
        id: 'preferences',
        sound: true,
        theme: 'night',
        readingBand: 'B2',
        ...(avatarId ? { avatarId } : {}),
      });
      const backup = await completedBackup();
      await resetDatabase(db);
      expect(await db.attempts.count()).toBe(0);
      expect((await db.settings.get('preferences'))?.avatarId).toBe('monchichi');
      await importBackup(db, backup, version);
      expect(await db.attempts.count()).toBe(2);
      expect((await db.sessions.toArray())[0]).toMatchObject({
        status: 'completed',
        xpAwarded: 33,
      });
      const restored = JSON.parse(await exportBackup(db, version));
      const original = JSON.parse(backup);
      delete restored.exportedAt;
      delete original.exportedAt;
      expect(restored).toEqual(original);
      const restoredAvatar = (await db.settings.get('preferences'))?.avatarId;
      expect(restoredAvatar).toBe(avatarId);
      expect(resolveAvatar(restoredAvatar)).toBe(
        avatarId === 'momo' || avatarId === 'sichiware'
          ? 'sichiware'
          : avatarId === 'nova' || avatarId === 'sipompurin'
            ? 'sipompurin'
            : 'monchichi',
      );
    },
  );

  it.each([
    [
      'schema version',
      (data: Record<string, unknown>) => {
        data.schemaVersion = 999;
      },
    ],
    [
      'content version',
      (data: Record<string, unknown>) => {
        data.contentVersion = 'other';
      },
    ],
    [
      'mode',
      (data: Record<string, unknown>) => {
        data.appMode = 'learner';
      },
    ],
    [
      'unknown table',
      (data: Record<string, unknown>) => {
        data.accounts = [];
      },
    ],
    [
      'unknown avatar',
      (data: Record<string, unknown>) => {
        data.settings = [
          {
            id: 'preferences',
            sound: false,
            theme: 'forest',
            readingBand: 'auto',
            avatarId: 'unknown',
          },
        ];
      },
    ],
    [
      'duplicate attempt',
      (data: Record<string, unknown>) => {
        const attempts = data.attempts as unknown[];
        attempts.push(attempts[0]);
      },
    ],
    [
      'reward XP',
      (data: Record<string, unknown>) => {
        (data.rewards as { xp: number }[])[0].xp = 29;
      },
    ],
    [
      'invented mastery',
      (data: Record<string, unknown>) => {
        (data.reviews as { mastered: boolean }[])[0].mastered = true;
      },
    ],
    [
      'changed answer key',
      (data: Record<string, unknown>) => {
        (data.sessions as { steps: QuestStep[] }[])[0].steps[1].acceptedAnswers = ['wrong'];
      },
    ],
    [
      'unknown question ID',
      (data: Record<string, unknown>) => {
        (data.sessions as { steps: QuestStep[] }[])[0].steps[1].id = 'invented';
      },
    ],
    [
      'unknown plan ID',
      (data: Record<string, unknown>) => {
        (data.sessions as { planId: string }[])[0].planId = 'invented';
      },
    ],
    [
      'orphan attempt',
      (data: Record<string, unknown>) => {
        (data.attempts as { sessionId: string }[])[0].sessionId = 'quest-1999-01-01';
      },
    ],
  ])('rejects %s corruption without altering existing records', async (_name, corrupt) => {
    const backup = await completedBackup();
    const data = JSON.parse(backup) as Record<string, unknown>;
    corrupt(data);
    await expect(importBackup(db, JSON.stringify(data), version)).rejects.toThrow(
      '현재 기록은 그대로',
    );
    expect(await exportBackup(db, version)).toBe(backup);
  });

  it('rejects malformed JSON without clearing the database', async () => {
    await start();
    await expect(importBackup(db, '{invalid', version)).rejects.toThrow();
    expect(await db.sessions.count()).toBe(1);
  });

  it('rolls back all replacement writes when storage fails during import', async () => {
    const backup = await completedBackup();
    await db.settings.put({ id: 'preferences', sound: true, theme: 'night', readingBand: 'B3' });
    const before = await exportBackup(db, version);
    vi.spyOn(db.rewards, 'bulkAdd').mockRejectedValueOnce(new Error('Simulated storage failure'));
    await expect(importBackup(db, backup, version)).rejects.toThrow('Simulated storage failure');
    expect(await exportBackup(db, version)).toBe(before);
  });
});

describe('optional curriculum continuation', () => {
  it('keeps the daily base completed until explicit continuation and resumes curriculum order next day', async () => {
    const first = await finish(await startOrResumeSession(db, await nextPlan(), day, version));
    expect(first.planId).toBe('w01-d1');
    expect((await startOrResumeSession(db, await nextPlan(), day, version)).sessionId).toBe(
      first.sessionId,
    );
    const second = await finish(
      await startOrResumeSession(db, await nextPlan(), day, version, {
        continueFromSessionId: first.sessionId,
      }),
    );
    expect(second).toMatchObject({ sessionId: `quest-${day}:2`, planId: 'w01-d2', xpAwarded: 50 });
    expect(first.xpAwarded).toBe(80);
    expect(
      (await db.rewards.toArray()).filter((reward) => reward.kind === 'completion'),
    ).toHaveLength(1);
    expect(
      getCompletedPlanIds(catalog, await db.reviews.toArray(), await db.sessions.toArray()),
    ).toEqual(['w01-d1', 'w01-d2']);
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const nextDay = await startOrResumeSession(
      db,
      await nextPlan('2026-10-24'),
      '2026-10-24',
      version,
    );
    expect(nextDay).toMatchObject({ sessionId: 'quest-2026-10-24', planId: 'w01-d3:partial' });
    expect(nextDay.steps.filter((step) => step.phase === 'review')).not.toHaveLength(0);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(JSON.parse(saved));
  });

  it('coalesces rapid continuation and stale requests to the same successor without extra XP', async () => {
    const first = await finish(await start());
    const plan = { planId: 'w01-d2', steps: [question()] };
    const requested = await Promise.all(
      Array.from({ length: 10 }, () =>
        startOrResumeSession(db, plan, day, version, { continueFromSessionId: first.sessionId }),
      ),
    );
    expect(new Set(requested.map((session) => session.sessionId)).size).toBe(1);
    const second = await finish(requested[0]);
    expect(second.xpAwarded).toBe(0);
    expect((await db.reviews.get(question().entityId))?.stage).toBe(1);
    expect((await db.reviews.get(question().entityId))?.activeRecallCorrectDays).toEqual([day]);
    expect(
      (
        await startOrResumeSession(db, plan, day, version, {
          continueFromSessionId: first.sessionId,
        })
      ).sessionId,
    ).toBe(second.sessionId);
    expect(await db.sessions.count()).toBe(2);
    const restored = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, restored, version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(JSON.parse(restored));
  });

  it('rejects a continuation before its predecessor completes', async () => {
    const unfinished = await start();
    await expect(
      startOrResumeSession(db, { planId: 'w01-d2', steps: [question()] }, day, version, {
        continueFromSessionId: unfinished.sessionId,
      }),
    ).rejects.toThrow('마친 뒤');
    expect(await db.sessions.count()).toBe(1);
  });

  it('clamps explicit continuation after a backward clock change to the latest day', async () => {
    const first = await finish(await start());
    vi.setSystemTime(new Date(2026, 9, 22, 12));
    const second = await finish(
      await startOrResumeSession(
        db,
        { planId: 'w01-d2', steps: [question()] },
        '2026-10-22',
        version,
        { continueFromSessionId: first.sessionId },
      ),
    );
    expect(second).toMatchObject({ localDay: day, completedDay: day, xpAwarded: 0 });
    expect(await db.rewards.count()).toBe(2);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(await db.sessions.count()).toBe(2);
  });

  it('awards a cross-midnight completion on the actual day only once', async () => {
    const first = await start();
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const finished = await finish(first);
    expect(finished.completedDay).toBe('2026-10-24');
    const next = await finish(
      await startOrResumeSession(
        db,
        { planId: 'w01-d2', steps: [canonicalStep('recall:v-adequate-sense1')] },
        '2026-10-24',
        version,
        { continueFromSessionId: finished.sessionId },
      ),
    );
    expect(next.xpAwarded).toBe(10);
    expect((await db.rewards.toArray()).filter((reward) => reward.kind === 'completion')).toEqual([
      expect.objectContaining({ id: 'completion:2026-10-24', localDay: '2026-10-24' }),
    ]);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(JSON.parse(saved));
  });

  it('migrates an actual version1 database without changing records or IDs', async () => {
    const first = await finish(await start());
    const oldRecords = JSON.parse(await exportBackup(db, version));
    oldRecords.schemaVersion = 1;
    delete oldRecords.sessions[0].completedDay;
    const name = db.name;
    await db.delete();
    const oldDb = new Dexie(name);
    oldDb.version(1).stores({
      attempts: 'attemptId, sessionId, questionId, entityId, localDay, completedAt',
      reviews: 'entityId, dueDay',
      sessions: 'sessionId, &localDay, status',
      rewards: 'id, sessionId, localDay',
      settings: 'id',
    });
    for (const name of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'])
      await oldDb.table(name).bulkAdd(oldRecords[name]);
    oldDb.close();
    db = new QuestDatabase('demo', name);
    expect(await db.sessions.get(first.sessionId)).toEqual(oldRecords.sessions[0]);
    expect(db.verno).toBe(3);
    await startOrResumeSession(db, { planId: 'w01-d2', steps: [question()] }, day, version, {
      continueFromSessionId: first.sessionId,
    });
    expect(await db.sessions.count()).toBe(2);
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(oldRecords), version);
    for (const name of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'])
      expect(await db.table(name).toArray()).toEqual(oldRecords[name]);
    expect(JSON.parse(await exportBackup(db, version)).schemaVersion).toBe(6);
  });
});
