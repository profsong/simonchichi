import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { availableXp } from '../../src/core/economy';
import { buildMistakeQuest, getActiveMistakes } from '../../src/core/mistakes';
import { exportBackup, importBackup, QuestDatabase, resetDatabase } from '../../src/data/db';
import previous from './fixtures/legacy-v6-native-0.11.json';

const tables = ['attempts', 'reviews', 'sessions', 'rewards', 'settings', 'purchases'] as const;
let db: QuestDatabase;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T03:00:00.000Z'));
  db = new QuestDatabase('demo', 'actual-0.11-mistakes-compatibility');
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

it('reads the actual 0.11 Android tables, derives mistakes, and roundtrips backup6 without changing scores, purchases, IDs or progress', async () => {
  // Recorded by the 0.10 -> 0.11 native smoke, not created by this implementation.
  await importBackup(db, JSON.stringify(previous), previous.contentVersion);
  expect(db.verno).toBe(3);
  for (const table of tables) expect(await db.table(table).toArray()).toEqual(previous[table]);
  expect(await db.sessions.count()).toBe(7);
  expect(await db.attempts.count()).toBe(101);
  expect(await db.purchases.count()).toBe(4);
  const rewards = await db.rewards.toArray();
  const purchases = await db.purchases.toArray();
  expect(rewards.reduce((sum, reward) => sum + reward.xp, 0)).toBe(998);
  expect(purchases.reduce((sum, purchase) => sum + purchase.price, 0)).toBe(580);
  expect(availableXp(rewards, purchases)).toBe(418);
  const history = {
    attempts: await db.attempts.toArray(),
    sessions: await db.sessions.toArray(),
    appMode: db.mode,
  };
  expect(getActiveMistakes(history.attempts, history.sessions).length).toBeGreaterThan(0);
  expect(buildMistakeQuest(history)?.sessionKind).toBe('mistakes');
  for (const table of tables) expect(await db.table(table).toArray()).toEqual(previous[table]);
  const exported = JSON.parse(await exportBackup(db, previous.contentVersion));
  expect(exported.schemaVersion).toBe(6);
  for (const table of tables) expect(exported[table]).toEqual(previous[table]);
  await resetDatabase(db);
  await importBackup(db, JSON.stringify(exported), previous.contentVersion);
  for (const table of tables) expect(await db.table(table).toArray()).toEqual(previous[table]);
  expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(418);
});
