import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { availableXp } from '../../src/core/economy';
import { defaultRoom } from '../../src/core/room-catalog';
import { defaultSettings } from '../../src/core/types';
import {
  advanceSession,
  exportBackup,
  importBackup,
  purchaseRoomItem,
  QuestDatabase,
  resetDatabase,
  saveSettings,
  startOrResumeSession,
  submitAnswer,
} from '../../src/data/db';
import { resolveStep } from '../../src/core/quest-builder';
import historicalBackup from './fixtures/legacy-v3-native-backup.json';
import historicalRoomBackup from './fixtures/legacy-v4-native-backup.json';
import partialCourseBackup from '../e2e/fixtures/legacy-v4-partial-course-0.7.json';
import historicalLatestBackup from '../e2e/fixtures/legacy-v5-native-0.8.json';
import fundedBackup from '../e2e/fixtures/funded-v6-pricing-test.json';
import { buildCourseQuest } from '../../src/core/course-quest';
import { getCourse } from '../../src/data/courses';

let db: QuestDatabase;
let index = 0;
const version = historicalBackup.contentVersion;
async function fund() {
  await importBackup(db, JSON.stringify(fundedBackup), version);
  return { rewards: await db.rewards.toArray(), purchases: await db.purchases.toArray() };
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  db = new QuestDatabase('demo', `economy-db-${index++}`);
  await importBackup(db, JSON.stringify(historicalBackup), version);
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe('transactional XP purchases', () => {
  it('resumes and completes an actual 0.7 partial 49-step snapshot without replacing it with the new flow', async () => {
    await importBackup(db, JSON.stringify(partialCourseBackup), version);
    const original = (await db.sessions.toArray())[0];
    const plan = buildCourseQuest({
      course: getCourse('advanced-300'),
      sessions: await db.sessions.toArray(),
      reviews: await db.reviews.toArray(),
      attempts: await db.attempts.toArray(),
      localDay: '2026-11-02',
    })!;
    let session = await startOrResumeSession(db, plan, '2026-11-02', version);
    expect(session).toEqual(original);
    expect(session.steps).toHaveLength(49);
    expect(session.currentQuestionIndex).toBe(7);
    expect(session.courseFlow).toBeUndefined();
    while (session.status === 'in_progress') {
      const step = session.steps[session.currentQuestionIndex];
      if (step.kind === 'question')
        await submitAnswer(
          db,
          session.sessionId,
          step.choices ? String(step.correctIndex) : step.acceptedAnswers![0],
          1,
        );
      session = await advanceSession(db, session.sessionId, step.id);
    }
    expect(session.xpAwarded).toBe(270);
    expect(session.steps).toEqual(original.steps);
    expect(session.retestQuestionIds).toBeUndefined();
    const saved = JSON.parse(await exportBackup(db, version));
    expect(saved.schemaVersion).toBe(6);
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(saved), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
  });

  it('preserves actual 0.6 schema4 receipts, ownership, and balance despite higher current prices', async () => {
    await importBackup(db, JSON.stringify(historicalRoomBackup), version);
    for (const table of [
      'attempts',
      'reviews',
      'sessions',
      'rewards',
      'settings',
      'purchases',
    ] as const)
      expect(await db.table(table).toArray()).toEqual(historicalRoomBackup[table]);
    expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(355);
    const oldReceipt = historicalRoomBackup.purchases.find(
      (receipt) => receipt.itemId === 'blue-hoodie',
    )!;
    expect(await purchaseRoomItem(db, 'blue-hoodie')).toEqual(oldReceipt);
    expect(await db.purchases.count()).toBe(3);
    expect(oldReceipt.price).toBe(180);
    const saved = JSON.parse(await exportBackup(db, version));
    expect(saved.schemaVersion).toBe(6);
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(saved), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    const bad = structuredClone(saved);
    bad.purchases[0].pricingVersion = 2;
    await expect(importBackup(db, JSON.stringify(bad), version)).rejects.toThrow();
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
  });

  it('restores all six actual 0.8 schema5 tables without repricing or rewriting any original receipt', async () => {
    await importBackup(db, JSON.stringify(historicalLatestBackup), version);
    for (const table of [
      'attempts',
      'reviews',
      'sessions',
      'rewards',
      'settings',
      'purchases',
    ] as const)
      expect(await db.table(table).toArray()).toEqual(historicalLatestBackup[table]);
    expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(418);
    await expect(purchaseRoomItem(db, 'ocean-window')).rejects.toThrow('XP');
    const saved = JSON.parse(await exportBackup(db, version));
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(saved), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
  });

  it('preserves genuine old review earnings and adds an empty purchases table in a version2 upgrade', async () => {
    const name = db.name;
    await db.delete();
    const old = new Dexie(name);
    old.version(2).stores({
      attempts: 'attemptId, sessionId, questionId, entityId, localDay, completedAt',
      reviews: 'entityId, dueDay',
      sessions: 'sessionId, localDay, status, planId',
      rewards: 'id, sessionId, localDay',
      settings: 'id',
    });
    for (const table of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'] as const)
      await old.table(table).bulkAdd(historicalBackup[table]);
    old.close();
    db = new QuestDatabase('demo', name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.purchases.toArray()).toEqual([]);
    for (const table of ['attempts', 'reviews', 'sessions', 'rewards', 'settings'] as const)
      expect(await db.table(table).toArray()).toEqual(historicalBackup[table]);
    expect(
      (await db.sessions.toArray()).find((session) => session.sessionKind === 'review-test'),
    ).toMatchObject({ xpAwarded: 93 });
    expect(availableXp(await db.rewards.toArray(), [])).toBe(543);
    const saved = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(await db.rewards.toArray()).toEqual(historicalBackup.rewards);
  });

  it('buys and equips once under duplicate taps, and re-equips owned/free items without spending', async () => {
    const original = await fund();
    const originalBalance = availableXp(original.rewards, original.purchases);
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () => purchaseRoomItem(db, 'green-varsity')),
    );
    expect(new Set(receipts.map((receipt) => receipt?.id)).size).toBe(1);
    expect(await db.purchases.count()).toBe(original.purchases.length + 1);
    expect(receipts[0]).toMatchObject({ price: 6000, pricingVersion: 2 });
    expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(
      originalBalance - 6000,
    );
    expect((await db.settings.get('preferences'))?.room?.outfitId).toBe('green-varsity');
    expect(await purchaseRoomItem(db, 'original')).toBeNull();
    expect((await db.settings.get('preferences'))?.room?.outfitId).toBe('original');
    expect(await purchaseRoomItem(db, 'green-varsity')).toEqual(receipts[0]);
    expect(await db.rewards.toArray()).toEqual(original.rewards);
    const saved = await exportBackup(db, version);
    db.close();
    db = new QuestDatabase('demo', db.name);
    expect(await purchaseRoomItem(db, 'green-varsity')).toEqual(receipts[0]);
    await resetDatabase(db);
    await importBackup(db, saved, version);
    expect(await db.purchases.get(receipts[0]!.id)).toEqual(receipts[0]);
    for (const receipt of original.purchases)
      expect(await db.purchases.get(receipt.id)).toEqual(receipt);
    expect((await db.settings.get('preferences'))?.room?.outfitId).toBe('green-varsity');
  });

  it('serializes competing purchases and refuses overspend or an unowned settings bypass', async () => {
    const original = await fund();
    const results = await Promise.allSettled([
      purchaseRoomItem(db, 'star-loft'),
      purchaseRoomItem(db, 'ocean-window'),
      purchaseRoomItem(db, 'bamboo-hideout'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(await db.purchases.count()).toBe(original.purchases.length + 2);
    expect(
      availableXp(await db.rewards.toArray(), await db.purchases.toArray()),
    ).toBeGreaterThanOrEqual(0);
    const before = await exportBackup(db, version);
    await expect(purchaseRoomItem(db, 'night-camp')).rejects.toThrow('XP');
    await expect(purchaseRoomItem(db, 'unknown')).rejects.toThrow();
    await expect(
      saveSettings(db, {
        ...defaultSettings,
        room: { ...defaultRoom, accessoryId: 'flower-crown' },
      }),
    ).rejects.toThrow();
    await expect(
      saveSettings(db, { ...defaultSettings, room: { ...defaultRoom, accessoryId: 'mint-room' } }),
    ).rejects.toThrow();
    expect(await exportBackup(db, version)).toBe(before);
  });

  it('rolls back a receipt when equipping fails and never rewrites earnings', async () => {
    await fund();
    const before = await exportBackup(db, version);
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('Simulated write failure'));
    await expect(purchaseRoomItem(db, 'flower-crown')).rejects.toThrow('Simulated write failure');
    expect(await exportBackup(db, version)).toBe(before);
  });

  it('keeps learning after a purchase chronological through a clock rollback', async () => {
    const original = await fund();
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const purchase = (await purchaseRoomItem(db, 'star-headphones'))!;
    vi.setSystemTime(new Date(2026, 10, 1, 12));
    const step = resolveStep('recall:v-adequate-sense1', 'demo')!;
    const session = await startOrResumeSession(
      db,
      { planId: 'w01-d3', steps: [step] },
      '2026-11-01',
      version,
    );
    expect(session.createdAt! > purchase.createdAt).toBe(true);
    expect(session.localDay).toBe('2026-11-04');
    const attempt = await submitAnswer(db, session.sessionId, 'adequate', 1);
    expect(attempt.completedAt > purchase.createdAt).toBe(true);
    expect(attempt.localDay).toBe('2026-11-04');
    await advanceSession(db, session.sessionId);
    const backup = await exportBackup(db, version);
    await resetDatabase(db);
    await importBackup(db, backup, version);
    expect(await db.purchases.count()).toBe(original.purchases.length + 1);
  });

  it('rejects forged prices, receipts, future earnings, or unowned equipment atomically', async () => {
    await fund();
    await purchaseRoomItem(db, 'star-loft');
    const before = await exportBackup(db, version);
    for (const corrupt of [
      'price',
      'duplicate',
      'id',
      'free',
      'future-earnings',
      'unowned',
      'category',
      'no-ledger',
    ] as const) {
      const backup = JSON.parse(before);
      if (corrupt === 'price') backup.purchases[0].price = 1;
      if (corrupt === 'duplicate') backup.purchases.push(backup.purchases[0]);
      if (corrupt === 'id') backup.purchases[0].id = 'fake';
      if (corrupt === 'free')
        backup.purchases[0] = {
          ...backup.purchases[0],
          id: 'purchase:original',
          itemId: 'original',
          price: 1,
        };
      // 130 XP existed before 2026-11-01. The total543 is sufficient, but at this date it was not.
      if (corrupt === 'future-earnings') backup.purchases[0].createdAt = '2026-10-31T12:00:00.000Z';
      if (corrupt === 'unowned') backup.settings[0].room.outfitId = 'sailor';
      if (corrupt === 'category') backup.settings[0].room.backgroundId = 'original';
      if (corrupt === 'no-ledger') delete backup.purchases;
      await expect(importBackup(db, JSON.stringify(backup), version), corrupt).rejects.toThrow();
      expect(await exportBackup(db, version)).toBe(before);
    }
  });

  it('accepts mixed historical/current receipts only with their exact versioned prices in schema6', async () => {
    const original = await fund();
    const receipt = (await purchaseRoomItem(db, 'star-headphones'))!;
    expect(receipt).toMatchObject({ price: 2500, pricingVersion: 2 });
    for (const old of original.purchases) expect(await db.purchases.get(old.id)).toEqual(old);
    const saved = JSON.parse(await exportBackup(db, version));
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(saved), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    for (const corruption of [
      'missing-version',
      'old-price',
      'wrong-price',
      'unknown-version',
      'explicit-one',
    ] as const) {
      const bad = structuredClone(saved);
      const target = bad.purchases.find((purchase: { id: string }) => purchase.id === receipt.id);
      if (corruption === 'missing-version') delete target.pricingVersion;
      if (corruption === 'old-price') target.price = 160;
      if (corruption === 'wrong-price') target.price = 2501;
      if (corruption === 'unknown-version') target.pricingVersion = 3;
      if (corruption === 'explicit-one') target.pricingVersion = 1;
      await expect(importBackup(db, JSON.stringify(bad), version), corruption).rejects.toThrow();
      expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    }
    for (const schemaVersion of [1, 2, 3, 4, 5]) {
      await expect(
        importBackup(db, JSON.stringify({ ...saved, schemaVersion }), version),
      ).rejects.toThrow();
      expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    }
  });

  it('buys all ten new accessories once and restores them with old receipts while refusing legacy-price disguise', async () => {
    const original = await fund();
    const ids = [
      'mint-ribbon',
      'star-hairpin',
      'moon-hairpin',
      'butterfly-clip',
      'daisy-pin',
      'pearl-headband',
      'heart-sunglasses',
      'mint-scarf',
      'lucky-clover',
      'blue-beret',
    ];
    const receipts = await Promise.all(
      ids.flatMap((id) => [purchaseRoomItem(db, id), purchaseRoomItem(db, id)]),
    );
    for (let index = 0; index < ids.length; index++) {
      expect(receipts[index * 2]).toEqual(receipts[index * 2 + 1]);
      expect(receipts[index * 2]).toMatchObject({
        id: `purchase:${ids[index]}`,
        itemId: ids[index],
        price: 2500,
        pricingVersion: 2,
      });
    }
    expect(await db.purchases.count()).toBe(original.purchases.length + 10);
    expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(
      availableXp(original.rewards, original.purchases) - 25000,
    );
    expect(await db.rewards.toArray()).toEqual(original.rewards);
    for (const old of original.purchases) expect(await db.purchases.get(old.id)).toEqual(old);
    const room = (await db.settings.get('preferences'))!.room!;
    expect(ids).toContain(room.accessoryId);
    const saved = JSON.parse(await exportBackup(db, version));
    expect(saved.schemaVersion).toBe(6);
    await resetDatabase(db);
    await importBackup(db, JSON.stringify(saved), version);
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    for (const id of ids) {
      const forged = structuredClone(saved);
      const receipt = forged.purchases.find(
        (purchase: { itemId: string }) => purchase.itemId === id,
      );
      delete receipt.pricingVersion;
      await expect(importBackup(db, JSON.stringify(forged), version), id).rejects.toThrow();
    }
    expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
    await purchaseRoomItem(db, 'none');
    await purchaseRoomItem(db, ids[0]);
    expect(await db.purchases.toArray()).toEqual(saved.purchases);
    expect((await db.settings.get('preferences'))!.room!.accessoryId).toBe(ids[0]);
  });

  it.each([
    [
      ['nike-hoodie', 7000],
      ['adidas-puffer', 7000],
      ['burberry-coat', 7000],
      ['mint-cardigan', 6000],
    ],
    [
      ['denim-jacket', 6000],
      ['striped-knit', 6000],
      ['lavender-sweater', 6000],
    ],
    [
      ['raincoat', 6000],
      ['cozy-fleece', 6000],
      ['ribbon-dress', 6000],
    ],
  ] as [string, number][][])(
    'buys new outfit group %# once at exact SKU prices and restores mixed schema6 receipts',
    async (...items) => {
      const original = await fund();
      const receipts = await Promise.all(
        items.flatMap(([id]) => [purchaseRoomItem(db, id), purchaseRoomItem(db, id)]),
      );
      for (let index = 0; index < items.length; index++) {
        const [id, price] = items[index];
        expect(receipts[index * 2]).toEqual(receipts[index * 2 + 1]);
        expect(receipts[index * 2]).toMatchObject({
          id: `purchase:${id}`,
          itemId: id,
          price,
          pricingVersion: 2,
        });
      }
      expect(await db.purchases.count()).toBe(original.purchases.length + items.length);
      expect(availableXp(await db.rewards.toArray(), await db.purchases.toArray())).toBe(
        availableXp(original.rewards, original.purchases) -
          items.reduce((sum, [, price]) => sum + price, 0),
      );
      expect(await db.rewards.toArray()).toEqual(original.rewards);
      for (const old of original.purchases) expect(await db.purchases.get(old.id)).toEqual(old);
      const saved = JSON.parse(await exportBackup(db, version));
      expect(saved.schemaVersion).toBe(6);
      await resetDatabase(db);
      await importBackup(db, JSON.stringify(saved), version);
      expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
      for (const [id, price] of items) {
        for (const corruption of ['legacy-version', 'other-outfit-price']) {
          const forged = structuredClone(saved);
          const target = forged.purchases.find(
            (receipt: { itemId: string }) => receipt.itemId === id,
          );
          if (corruption === 'legacy-version') delete target.pricingVersion;
          else target.price = price === 7000 ? 6000 : 7000;
          await expect(
            importBackup(db, JSON.stringify(forged), version),
            `${id} ${corruption}`,
          ).rejects.toThrow();
        }
      }
      expect(JSON.parse(await exportBackup(db, version))).toEqual(saved);
      await purchaseRoomItem(db, 'original');
      await purchaseRoomItem(db, items[0][0]);
      expect(await db.purchases.toArray()).toEqual(saved.purchases);
      expect((await db.settings.get('preferences'))!.room!.outfitId).toBe(items[0][0]);
    },
  );
});
