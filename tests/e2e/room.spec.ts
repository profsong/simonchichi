import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { roomItems } from '../../src/core/room-catalog';
import {
  availableXp,
  exportData,
  importData,
  navigation,
  saveScreen,
  snapshot,
  totalXp,
  type Snapshot,
} from './helpers';

type Fixture = Snapshot & { schemaVersion: number; appMode: string; exportedAt: string };
async function fixture(name: string): Promise<Fixture> {
  return JSON.parse(await readFile(`tests/e2e/fixtures/${name}`, 'utf8')) as Fixture;
}
async function openShop(page: Page) {
  await page.getByRole('button', { name: '방 꾸미기', exact: true }).click();
  await expect(page.getByTestId('room-shop')).toBeVisible();
}
function item(page: Page, id: string) {
  return page.locator(`[data-testid="room-item"][data-item-id="${id}"]`);
}
async function closeShop(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-shop')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '방 꾸미기', exact: true })).toBeFocused();
}
async function reset(page: Page) {
  await page.getByRole('button', { name: '학습 기록 초기화', exact: true }).click();
  await page.getByRole('textbox', { name: '초기화 확인' }).fill('초기화');
  await page.getByRole('button', { name: '영구 삭제', exact: true }).click();
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
}
const addedAccessoryIds = [
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
] as const;
const addedOutfits = [
  ['nike-hoodie', 7_000],
  ['adidas-puffer', 7_000],
  ['burberry-coat', 7_000],
  ['mint-cardigan', 6_000],
  ['denim-jacket', 6_000],
  ['striped-knit', 6_000],
  ['lavender-sweater', 6_000],
  ['raincoat', 6_000],
  ['cozy-fleece', 6_000],
  ['ribbon-dress', 6_000],
] as const;
const formatXp = (xp: number) => `${xp.toLocaleString('ko-KR')} XP`;

test('fourteen outfits include standard and premium purchases on three companions while historical ownership, backup and offline state persist', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(360_000);
  const legacy = await fixture('legacy-v5-native-0.8.json');
  const funded = await fixture('funded-v6-pricing-test.json');
  expect(legacy.schemaVersion).toBe(5);
  expect(funded.schemaVersion).toBe(6);
  await page.clock.setFixedTime(new Date(funded.exportedAt));
  await page.goto('/');
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await openShop(page);
  const backgrounds = roomItems.filter((entry) => entry.category === 'background');
  expect(backgrounds).toHaveLength(14);
  await expect(page.getByTestId('room-item')).toHaveCount(14);
  for (const background of backgrounds.filter((entry) => entry.price > 0)) {
    expect(background.price).toBe(12_000);
    const entry = item(page, background.id);
    await expect(entry).toHaveAttribute('data-owned', 'false');
    await expect(
      entry.locator(
        'svg, img, picture, canvas, video, .avatar-room-scene, .room-item-preview, .room-item-picture',
      ),
    ).toHaveCount(0);
    await expect(entry.getByRole('heading')).toHaveText(background.name);
    await expect(entry.getByText(background.description, { exact: true })).toBeVisible();
    await expect(entry.getByRole('button')).toHaveAccessibleName(
      `${background.name} 12000 XP로 구매하고 장착`,
    );
    await expect(entry.getByRole('button')).toContainText('12,000 XP');
    await expect(entry.getByRole('button')).toBeDisabled();
  }
  await expect(item(page, 'mint-room').locator('.avatar-room-scene')).toBeVisible();
  await saveScreen(page, testInfo.project.name, 'new-background-prices-375');
  await page.getByRole('tab', { name: '배경', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '액세서리', exact: true })).toBeFocused();
  expect(roomItems).toHaveLength(42);
  expect(roomItems.filter((entry) => entry.price > 0)).toHaveLength(39);
  await expect(page.getByTestId('room-item')).toHaveCount(14);
  for (const id of addedAccessoryIds) {
    const accessory = roomItems.find((entry) => entry.id === id)!;
    expect(accessory.category).toBe('accessory');
    expect(accessory.price).toBe(2_500);
    await expect(item(page, id)).toHaveAttribute('data-owned', 'false');
    await expect(item(page, id).locator('.room-item-preview svg')).toBeVisible();
    await expect(item(page, id).getByRole('heading')).toHaveText(accessory.name);
    await expect(item(page, id).getByText(accessory.description, { exact: true })).toBeVisible();
    await expect(item(page, id).getByRole('button')).toHaveAccessibleName(
      `${accessory.name} 2500 XP로 구매하고 장착`,
    );
    await expect(item(page, id).getByRole('button')).toContainText('2,500 XP');
    await expect(item(page, id).getByRole('button')).toBeDisabled();
  }
  await item(page, 'mint-ribbon').scrollIntoViewIfNeeded();
  await saveScreen(page, testInfo.project.name, 'new-accessories-preview-375');
  await item(page, 'blue-beret').scrollIntoViewIfNeeded();
  await saveScreen(page, testInfo.project.name, 'new-accessories-preview-bottom-375');
  await page.getByRole('tab', { name: '옷', exact: true }).click();
  await expect(item(page, 'sailor').getByRole('button')).toContainText('6,000 XP');
  await expect(item(page, 'sailor').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('room-item')).toHaveCount(14);
  for (const [id, price] of addedOutfits) {
    const outfit = roomItems.find((entry) => entry.id === id)!;
    expect(outfit.category).toBe('outfit');
    expect(outfit.price).toBe(price);
    await expect(item(page, id)).toHaveAttribute('data-owned', 'false');
    await expect(item(page, id).locator('.room-item-preview svg')).toBeVisible();
    await expect(item(page, id).getByRole('heading')).toHaveText(outfit.name);
    await expect(item(page, id).getByText(outfit.description, { exact: true })).toBeVisible();
    await expect(item(page, id).getByRole('button')).toHaveAccessibleName(
      `${outfit.name} ${price} XP로 구매하고 장착`,
    );
    await expect(item(page, id).getByRole('button')).toContainText(formatXp(price));
    await expect(item(page, id).getByRole('button')).toBeDisabled();
  }
  await item(page, 'nike-hoodie').scrollIntoViewIfNeeded();
  await saveScreen(page, testInfo.project.name, 'premium-outfit-previews-375');
  await item(page, 'ribbon-dress').scrollIntoViewIfNeeded();
  await saveScreen(page, testInfo.project.name, 'standard-outfit-previews-375');
  expect((await snapshot(page)).purchases).toEqual([]);
  await closeShop(page);

  // The genuine 0.8 native tables keep their historical prices, with only the
  // established portable-backup appMode conversion when entering learner storage.
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await importData(page, legacy, 'original-0.8-native-backup.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  const old = await snapshot(page);
  for (const table of ['attempts', 'reviews', 'rewards', 'settings', 'purchases'] as const)
    expect(old[table]).toEqual(legacy[table]);
  expect(old.sessions).toEqual(
    legacy.sessions.map((session) => ({ ...session, appMode: 'learner' })),
  );
  expect(totalXp(old)).toBe(998);
  expect(old.purchases.reduce((sum, receipt) => sum + receipt.price, 0)).toBe(580);
  expect(availableXp(old)).toBe(418);
  await expect(page.getByTestId('total-xp')).toHaveText('418 XP');
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await openShop(page);
  await page.getByRole('tab', { name: '배경', exact: true }).click();
  await expect(item(page, 'rain-library').locator('.avatar-room-scene')).toBeVisible();
  await expect(item(page, 'sky-garden').locator('.avatar-room-scene')).toBeVisible();
  await expect(item(page, 'cloud-cabin').getByRole('button')).toBeDisabled();
  await item(page, 'mint-room').getByRole('button').click();
  await item(page, 'sky-garden').getByRole('button').click();
  await item(page, 'rain-library').getByRole('button').click();
  await closeShop(page);
  expect(await snapshot(page)).toEqual(old);
  await saveScreen(page, testInfo.project.name, 'legacy-owned-room-375');
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  const oldExport = await exportData(page, testInfo, 'legacy-prices-schema-6.json');
  expect(oldExport.data.schemaVersion).toBe(6);
  expect(oldExport.data.purchases).toEqual(legacy.purchases);
  await reset(page);
  await importData(page, oldExport.data, 'legacy-prices-roundtrip.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  expect(await snapshot(page)).toEqual(old);

  const restoreTimings: { label: string; milliseconds: number }[] = [];
  // This separate, explicitly synthetic fixture was earned through public DB
  // answer/advance APIs and exported normally; no reward or XP fields were patched.
  let restoreStarted = Date.now();
  await importData(page, funded, 'synthetic-funded-pricing-test.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  restoreTimings.push({
    label: 'synthetic-funded-v6-import',
    milliseconds: Date.now() - restoreStarted,
  });
  const before = await snapshot(page);
  expect(availableXp(before)).toBeGreaterThanOrEqual(15_500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const initialBalance = availableXp(before);
  const initialSpent = before.purchases.reduce((sum, receipt) => sum + receipt.price, 0);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await openShop(page);
  const purchasePlan = [
    ['옷', 'mint-cardigan', 6_000],
    ['옷', 'nike-hoodie', 7_000],
    ['액세서리', 'mint-ribbon', 2_500],
  ] as const;
  let spentNow = 0;
  for (const [category, id, price] of purchasePlan) {
    await page.getByRole('tab', { name: category, exact: true }).click();
    expect(before.purchases.some((receipt) => receipt.itemId === id)).toBe(false);
    expect(roomItems.find((entry) => entry.id === id)?.price).toBe(price);
    await expect(item(page, id).getByRole('button')).toBeEnabled();
    await expect(item(page, id).locator('.room-item-preview svg')).toBeVisible();
    await item(page, id)
      .getByRole('button')
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    spentNow += price;
    await expect(page.getByTestId('room-shop-balance')).toHaveText(
      formatXp(initialBalance - spentNow),
    );
    const state = await snapshot(page);
    expect(state.purchases.filter((receipt) => receipt.itemId === id)).toEqual([
      expect.objectContaining({ id: `purchase:${id}`, itemId: id, price, pricingVersion: 2 }),
    ]);
  }
  await page.getByRole('tab', { name: '옷', exact: true }).click();
  await item(page, 'original').getByRole('button').click();
  for (const id of ['mint-cardigan', 'nike-hoodie']) {
    const outfit = roomItems.find((entry) => entry.id === id)!;
    await expect(item(page, id).getByRole('button')).toHaveAccessibleName(
      `${outfit.name} 무료로 장착`,
    );
    await item(page, id).getByRole('button').click();
  }
  await expect(page.getByTestId('room-shop-balance')).toHaveText(formatXp(initialBalance - 15_500));
  await closeShop(page);
  const purchased = await snapshot(page);
  for (const table of ['attempts', 'reviews', 'sessions', 'rewards'] as const)
    expect(purchased[table]).toEqual(before[table]);
  expect(purchased.purchases).toHaveLength(before.purchases.length + 3);
  expect(totalXp(purchased)).toBe(totalXp(before));
  expect(availableXp(purchased)).toBe(initialBalance - 15_500);
  expect(purchased.settings[0].room).toEqual({
    backgroundId: 'rain-library',
    outfitId: 'nike-hoodie',
    accessoryId: 'mint-ribbon',
  });
  await saveScreen(page, testInfo.project.name, 'new-outfit-purchases-375');
  await navigation(page).getByRole('button', { name: '성장 기록', exact: true }).click();
  await expect(page.getByTestId('earned-xp')).toContainText(String(totalXp(before)));
  await expect(page.getByTestId('spent-xp')).toContainText(String(initialSpent + 15_500));
  await expect(page.getByTestId('available-xp')).toContainText(String(initialBalance - 15_500));
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  for (const [name, id] of [
    ['몬치치', 'monchichi'],
    ['시치와레', 'sichiware'],
    ['시폼푸린', 'sipompurin'],
  ] as const) {
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByTestId('selected-avatar')).toHaveAttribute('data-avatar-id', id);
    await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
    await expect(page.getByTestId('avatar-room')).toHaveAttribute('data-avatar-id', id);
    await expect(page.getByTestId('avatar-room')).toHaveAttribute('data-outfit-id', 'nike-hoodie');
    await expect(page.getByTestId('avatar-room-scene')).toHaveAttribute(
      'data-outfit-id',
      'nike-hoodie',
    );
    await expect(page.getByTestId('avatar-room')).toHaveAttribute(
      'data-accessory-id',
      'mint-ribbon',
    );
    await expect(page.getByTestId('avatar-room-scene')).toHaveAttribute(
      'data-accessory-id',
      'mint-ribbon',
    );
    await saveScreen(page, testInfo.project.name, `nike-hoodie-${id}-375`);
    await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  }
  const final = await snapshot(page);
  const backup = await exportData(page, testInfo, 'new-outfit-backup.json');
  expect(backup.data.schemaVersion).toBe(6);
  for (const table of [
    'attempts',
    'reviews',
    'sessions',
    'settings',
    'rewards',
    'purchases',
  ] as const)
    expect(backup.data[table]).toEqual(final[table]);
  await reset(page);
  restoreStarted = Date.now();
  await importData(page, backup.data, 'new-outfit-restored.json');
  await expect(page.getByText('학습 기록을 복원했어요.', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  restoreTimings.push({
    label: 'mixed-prices-v6-restore',
    milliseconds: Date.now() - restoreStarted,
  });
  await mkdir('artifacts/outfits', { recursive: true });
  await writeFile(
    `artifacts/outfits/restore-timings-${testInfo.project.name}.json`,
    JSON.stringify(
      {
        browser: testInfo.project.name,
        sessions: before.sessions.length,
        attempts: before.attempts.length,
        scope:
          'file selection and confirmation through visible restore completion; wall-clock observation, not a performance threshold',
        restoreTimings,
      },
      null,
      2,
    ) + '\n',
  );
  expect(await snapshot(page)).toEqual(final);
  const tampered = structuredClone(backup.data);
  tampered.purchases.find((receipt) => receipt.itemId === 'nike-hoodie')!.price = 6_000;
  await importData(page, tampered, 'premium-at-standard-price.json');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await snapshot(page)).toEqual(final);
  await importData(
    page,
    { ...backup.data, schemaVersion: 5 },
    'new-prices-disguised-as-old-schema.json',
  );
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await snapshot(page)).toEqual(final);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await expect(page.getByTestId('avatar-room')).toHaveAttribute('data-avatar-id', 'sipompurin');
  await expect(page.getByTestId('avatar-room')).toHaveAttribute(
    'data-background-id',
    'rain-library',
  );
  await expect(page.getByTestId('avatar-room')).toHaveAttribute('data-outfit-id', 'nike-hoodie');
  await expect(page.getByTestId('avatar-room')).toHaveAttribute('data-accessory-id', 'mint-ribbon');
  await expect(page.getByTestId('total-xp')).toHaveText(`${initialBalance - 15_500} XP`);
  expect(await snapshot(page)).toEqual(final);
  await openShop(page);
  await page.getByRole('tab', { name: '배경', exact: true }).click();
  await expect(item(page, 'rain-library').locator('.avatar-room-scene')).toBeVisible();
  await expect(item(page, 'moon-observatory').locator('.room-item-preview')).toHaveCount(0);
  await item(page, 'mint-room').getByRole('button').click();
  await item(page, 'rain-library').getByRole('button').click();
  await closeShop(page);
  expect(await snapshot(page)).toEqual(final);
  await saveScreen(page, testInfo.project.name, 'outfit-restored-offline-375');
});
