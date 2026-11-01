// In-place 0.10 -> 0.11 outfit expansion check. Never clears data, answers a question, or adds XP.
// --prepare on 0.10, then --apk <file> --expected-sha256 <hash>.
/* global indexedDB, navigator */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect as playwrightExpect } from '@playwright/test';

const arg = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const prepare = process.argv.includes('--prepare');
const verify = process.argv.includes('--verify');
if (process.argv.includes('--help')) {
  console.log(
    'Set ANDROID_HOME and ANDROID_SERIAL. Boot the existing AVD without wiping data, with airplane mode on and Wi-Fi/mobile data off. Run --prepare on 0.10, then --apk <0.11.apk> --expected-sha256 <hash>. --verify only repeats read-only final assertions. No learning or new purchases.',
  );
  process.exit(0);
}
assert(prepare || verify || arg('--apk'), 'Use --prepare, --apk <file>, or --verify.');
assert(process.env.ANDROID_HOME, 'Set ANDROID_HOME.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adbPath = join(
  process.env.ANDROID_HOME,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifactRoot = join(root, 'artifacts', 'android');
const baselinePath = join(artifactRoot, 'outfits-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifactRoot, `outfits-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  artifactDirectory: directory,
  device: 'Android emulator only; no physical personal device',
  checks: [],
  pageErrors: [],
  externalRequests: [],
  scope:
    'Read-only record checks and free re-equipping owned items. No answers, XP injection, new purchases, reset, or native backup-picker interaction.',
};
let browser, page;
const save = (name, data) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(data, null, 2));
const passed = (name) => {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
};
async function adb(...args) {
  return (
    await execute(adbPath, [...serial, ...args], {
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  ).stdout.trim();
}
async function packageInfo() {
  const dump = await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app');
  const installedPath = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
    .split(/\r?\n/)
    .find((path) => path.endsWith('/base.apk'))
    ?.replace(/^package:/, '');
  assert(installedPath);
  return {
    version: dump.match(/versionName=([^\s]+)/)?.[1],
    code: Number(dump.match(/versionCode=(\d+)/)?.[1]),
    sha256: (await adb('shell', 'sha256sum', installedPath)).split(/\s+/)[0],
  };
}
async function offline() {
  const state = Object.fromEntries(
    await Promise.all(
      ['airplane_mode_on', 'wifi_on', 'mobile_data'].map(async (key) => [
        key,
        await adb('shell', 'settings', 'get', 'global', key),
      ]),
    ),
  );
  assert.deepEqual(state, { airplane_mode_on: '1', wifi_on: '0', mobile_data: '0' });
  return state;
}
async function restart() {
  await browser?.close().catch(() => {});
  await adb('shell', 'am', 'force-stop', 'com.simonchichi.app');
  await adb('shell', 'am', 'start', '-W', '-n', 'com.simonchichi.app/.MainActivity');
  let lastError;
  for (let index = 0; index < 40; index++) {
    try {
      const pid = (await adb('shell', 'pidof', 'com.simonchichi.app')).split(/\s+/)[0];
      assert.match(pid, /^\d+$/);
      await adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', {
        noDefaults: true,
        timeout: 3000,
      });
      page = browser
        .contexts()[0]
        ?.pages()
        .find((item) => /^https?:\/\/localhost(?:\/|$)/.test(item.url()));
      assert(page);
      page.on('pageerror', (value) => report.pageErrors.push(String(value)));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== 'localhost')
          report.externalRequests.push(request.url());
      });
      await expect(page.getByRole('navigation', { name: '모바일 메뉴' })).toBeVisible();
      return;
    } catch (error) {
      lastError = error;
      await browser?.close().catch(() => {});
      await delay(500);
    }
  }
  throw lastError;
}
async function snapshot() {
  const data = await page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('english-quest-demo');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = [...db.objectStoreNames].sort();
      const transaction = db.transaction(names, 'readonly');
      const tables = Object.fromEntries(
        await Promise.all(
          names.map(
            (name) =>
              new Promise((resolveRows, reject) => {
                const request = transaction.objectStore(name).getAll();
                request.onsuccess = () => resolveRows([name, request.result]);
                request.onerror = () => reject(request.error);
              }),
          ),
        ),
      );
      return { version: db.version, tables };
    } finally {
      db.close();
    }
  });
  // Same JSON representation as saved baselines, including optional undefined fields.
  return JSON.parse(JSON.stringify(data));
}
async function screenshot(name) {
  if (!page) return;
  await delay(1200);
  await page.screenshot({ path: join(directory, `${name}-webview.png`) });
  await delay(300);
  const result = await execute(adbPath, [...serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    timeout: 25_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  await writeFile(join(directory, `${name}.png`), result.stdout);
}
const premiumOutfitIds = ['nike-hoodie', 'adidas-puffer', 'burberry-coat'];
const newOutfitIds = [
  ...premiumOutfitIds,
  'mint-cardigan',
  'denim-jacket',
  'striped-knit',
  'lavender-sweater',
  'raincoat',
  'cozy-fleece',
  'ribbon-dress',
];
const categories = [
  { label: '배경', slot: 'backgroundId', free: 'mint-room', price: 12000, count: 14 },
  { label: '옷', slot: 'outfitId', free: 'original', price: 6000, count: 4 },
  { label: '액세서리', slot: 'accessoryId', free: 'none', price: 2500, count: 14 },
];
const earned = (data) => data.tables.rewards.reduce((sum, row) => sum + row.xp, 0);
const spent = (data) => data.tables.purchases.reduce((sum, row) => sum + row.price, 0);
function counts(data) {
  return {
    databaseVersion: data.version,
    tables: Object.keys(data.tables).length,
    sessions: data.tables.sessions.length,
    attempts: data.tables.attempts.length,
    purchases: data.tables.purchases.length,
    earnedXp: earned(data),
    spentXp: spent(data),
    availableXp: earned(data) - spent(data),
    avatar: data.tables.settings[0].avatarId,
    selectedCourse: data.tables.settings[0].selectedWordbookId,
    room: data.tables.settings[0].room,
  };
}
function assertBaseline(data) {
  assert.equal(data.version, 30);
  assert.equal(Object.keys(data.tables).length, 6);
  assert.equal(data.tables.sessions.length, 7);
  assert.equal(data.tables.attempts.length, 101);
  assert.equal(data.tables.purchases.length, 4);
  assert.equal(earned(data), 998);
  assert.equal(spent(data), 580);
  assert.equal(earned(data) - spent(data), 418);
  assert.deepEqual(
    Object.fromEntries(data.tables.purchases.map((receipt) => [receipt.itemId, receipt.price])),
    { 'blue-hoodie': 180, 'rain-library': 200, 'round-glasses': 80, 'sky-garden': 120 },
  );
  assert.equal(data.tables.settings[0].avatarId, 'sipompurin');
  assert.equal(data.tables.settings[0].selectedWordbookId, 'suneung-2000');
}
function assertOnlyRoomMayChange(data) {
  for (const [name, rows] of Object.entries(before.data.tables)) {
    if (name !== 'settings')
      assert.deepEqual(data.tables[name], rows, `${name} must remain immutable`);
  }
  const { room: oldRoom, ...oldSettings } = before.data.tables.settings[0];
  const { room: newRoom, ...newSettings } = data.tables.settings[0];
  assert(oldRoom && newRoom);
  assert.deepEqual(newSettings, oldSettings);
}
async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function openShop() {
  await navigate('복습함');
  await expect(page.getByTestId('room-balance')).toContainText('418');
  await page.getByRole('button', { name: '방 꾸미기', exact: true }).click();
  await expect(page.getByTestId('room-shop')).toBeVisible();
}
async function readShop(upgraded) {
  const values = [];
  const receipts = new Map(
    (before?.data.tables.purchases ?? (await snapshot()).tables.purchases).map((receipt) => [
      receipt.itemId,
      receipt.price,
    ]),
  );
  for (const category of categories) {
    await page.getByRole('tab', { name: category.label, exact: true }).click();
    const cards = page.getByTestId('room-item');
    await expect(cards).toHaveCount(upgraded && category.label === '옷' ? 14 : category.count);
    for (const card of await cards.all()) {
      const itemId = await card.getAttribute('data-item-id');
      const owned = (await card.getAttribute('data-owned')) === 'true';
      const equipped = (await card.getAttribute('data-equipped')) === 'true';
      const action = card.getByRole('button');
      const ariaLabel = await action.getAttribute('aria-label');
      const actionPrice = ariaLabel?.match(/([\d,]+)\s*XP/)?.[1];
      const row = {
        itemId,
        category: category.label,
        owned,
        equipped,
        action: ariaLabel,
        actionPrice: actionPrice ? Number(actionPrice.replaceAll(',', '')) : null,
        historicalPaidPrice: receipts.get(itemId) ?? null,
        disabled: await action.isDisabled(),
        text: await card.innerText(),
        sceneCount: await card.locator('.avatar-room-scene').count(),
        previewSvgCount: await card.locator('.room-item-preview > svg').count(),
      };
      assert.equal(owned, itemId === category.free || receipts.has(itemId));
      if (category.label === '배경') assert.equal(row.sceneCount, owned ? 1 : 0);
      if (category.label !== '배경') assert.equal(row.previewSvgCount, 1);
      if (!owned) {
        const price = premiumOutfitIds.includes(itemId) ? 7000 : category.price;
        assert.equal(row.actionPrice, price, `Unexpected price for ${itemId}`);
        assert(row.disabled, `${itemId} must be disabled with 418 XP`);
        await expect(card.locator('.room-item-shortfall')).toContainText(
          (price - 418).toLocaleString('ko-KR'),
        );
      }
      if (owned && !equipped) {
        assert.match(ariaLabel, /무료로 장착/);
        await expect(action).toBeEnabled();
      }
      values.push(row);
    }
    if (upgraded)
      await page
        .locator('[data-testid="room-item"][data-owned="false"]')
        .first()
        .getByRole('button')
        .scrollIntoViewIfNeeded();
    await screenshot(`${upgraded ? '03-new' : '01-old'}-${category.slot}`);
  }
  return values;
}
async function equip(category, itemId) {
  await page.getByRole('tab', { name: category.label, exact: true }).click();
  const card = page.locator(`[data-testid="room-item"][data-item-id="${itemId}"]`);
  await expect(card).toHaveAttribute('data-owned', 'true');
  if ((await card.getAttribute('data-equipped')) !== 'true') {
    await expect(card.getByRole('button')).toHaveAccessibleName(/무료로 장착/);
    await card.getByRole('button').dblclick();
  }
  await expect(card).toHaveAttribute('data-equipped', 'true');
  assertOnlyRoomMayChange(await snapshot());
  await expect(page.getByTestId('room-shop-balance')).toContainText('418');
}

try {
  // adb can become available before Android finishes restoring its activities.
  let bootComplete = false;
  for (let index = 0; index < 60; index++) {
    if ((await adb('shell', 'getprop', 'sys.boot_completed')) === '1') {
      bootComplete = true;
      break;
    }
    await delay(500);
  }
  assert(bootComplete, 'Wait for the emulator to finish booting before running the smoke test.');
  report.offlineBefore = await offline();
  if (prepare) {
    report.package = await packageInfo();
    assert.equal(report.package.version, '0.10.0');
    assert.equal(report.package.code, 10);
    await restart();
    const data = await snapshot();
    assertBaseline(data);
    await save('before-six-tables', data);
    await openShop();
    const shop = await readShop(false);
    await save('before-shop', shop);
    await page.getByRole('button', { name: '꾸미기 닫기', exact: true }).click();
    assert.deepEqual(await snapshot(), data);
    await screenshot('02-before-room');
    assert.equal(shop.length, 32);
    assert.equal(shop.filter((row) => row.category === '옷').length, 4);
    assert.equal(shop.filter((row) => row.category === '액세서리').length, 14);
    const baseline = { directory, package: report.package, data, shop };
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    report.baselineCounts = counts(data);
    passed(
      'Untouched 0.10 baseline: six tables, 7 sessions, 101 attempts, 4 historical receipts, 998 earned / 580 spent / 418 available; old UI captured read-only',
    );
    report.status = 'prepared';
  } else {
    if (arg('--apk')) {
      const apk = resolve(arg('--apk'));
      report.inputApkSha256 = createHash('sha256')
        .update(await readFile(apk))
        .digest('hex');
      if (arg('--expected-sha256'))
        assert.equal(report.inputApkSha256, arg('--expected-sha256').toLowerCase());
      assert.match(await adb('install', '-r', apk), /Success/);
    }
    report.package = await packageInfo();
    assert.equal(report.package.version, '0.11.0');
    assert.equal(report.package.code, 11);
    if (report.inputApkSha256) assert.equal(report.package.sha256, report.inputApkSha256);
    if (arg('--expected-sha256'))
      assert.equal(report.package.sha256, arg('--expected-sha256').toLowerCase());
    await restart();
    const upgraded = await snapshot();
    assertBaseline(upgraded);
    assert.deepEqual(upgraded, before.data);
    await save('after-upgrade-six-tables', upgraded);
    passed(
      '0.10 -> 0.11 upgrade preserves all six original tables, stored historic prices, settings and earned/spent XP exactly',
    );
    await openShop();
    const shop = await readShop(true);
    await save('after-shop', shop);
    report.priceAudit = {
      paidBackgroundPrice: 12000,
      paidStandardOutfitPrice: 6000,
      paidPremiumOutfitPrice: 7000,
      paidAccessoryPrice: 2500,
      unownedPaidButtonsVerified: shop.filter((row) => !row.owned).length,
      ownedPaidItemsRetainHistoricReceiptPrice: 4,
      note: 'Owned items expose a free re-equip action rather than a new purchase price. All unowned item prices are verified from the native rendered UI; the complete catalog is also covered by unit tests.',
    };
    assert.equal(report.priceAudit.unownedPaidButtonsVerified, 35);
    assert.equal(shop.length, 42);
    const outfits = shop.filter((row) => row.category === '옷');
    assert.equal(outfits.length, 14);
    const originalIds = new Set(before.shop.map((row) => row.itemId));
    const added = outfits.filter((row) => !originalIds.has(row.itemId));
    assert.deepEqual(added.map((row) => row.itemId).sort(), [...newOutfitIds].sort());
    for (const row of added) {
      assert.equal(row.owned, false);
      assert.equal(row.previewSvgCount, 1);
      assert.equal(row.actionPrice, premiumOutfitIds.includes(row.itemId) ? 7000 : 6000);
      assert.equal(row.disabled, true);
    }
    report.outfitAudit = {
      previousCount: 4,
      currentCount: 14,
      addedIds: added.map((row) => row.itemId),
      nativeNewPurchasePerformed: false,
      reason:
        'Existing actual balance 418 is below 6000/7000; successful new purchases are covered by separate web/unit tests.',
    };
    await page.getByRole('tab', { name: '옷', exact: true }).click();
    for (const id of ['nike-hoodie', 'burberry-coat', 'ribbon-dress']) {
      const card = page.locator(`[data-testid="room-item"][data-item-id="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      await screenshot(`03-new-${id}`);
    }
    assert.deepEqual(await snapshot(), before.data);
    passed(
      'All 14 outfit cards include ten new SVG previews at exact 6000/7000 XP with disabled purchase and 5582/6582 shortfalls; all 42 items preserve existing ownership and preview rules',
    );
    if (!verify) {
      for (const category of categories) {
        const owned = shop.filter(
          (row) => row.category === category.label && row.historicalPaidPrice !== null,
        );
        for (const item of owned) {
          await equip(category, category.free);
          await equip(category, item.itemId);
        }
        await equip(category, before.data.tables.settings[0].room[category.slot]);
      }
      assert.deepEqual(await snapshot(), before.data);
      passed(
        'All four previously purchased items re-equip free after selecting their free default; repeated taps add no receipt or debit and original room is restored',
      );
    }
    await page.getByRole('button', { name: '꾸미기 닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '방 꾸미기', exact: true })).toBeFocused();
    await screenshot('04-unchanged-room');
    await restart();
    const final = await snapshot();
    assert.deepEqual(final, before.data);
    await save('final-six-tables', final);
    await navigate('복습함');
    const scene = page.getByTestId('avatar-room-scene');
    for (const [key, value] of Object.entries(before.data.tables.settings[0].room))
      await expect(scene).toHaveAttribute(`data-${key.replace('Id', '-id')}`, value);
    await expect(scene).toHaveAttribute('data-avatar-id', 'sipompurin');
    await expect(page.getByTestId('room-balance')).toContainText('418');
    await scene.scrollIntoViewIfNeeded();
    await screenshot('05-offline-restored-room');
    await openShop();
    await page.getByRole('tab', { name: '옷', exact: true }).click();
    await expect(page.getByTestId('room-item')).toHaveCount(14);
    await expect(
      page.locator(
        '[data-testid="room-item"][data-item-id="nike-hoodie"] .room-item-preview > svg',
      ),
    ).toHaveCount(1);
    await page.getByRole('button', { name: '꾸미기 닫기', exact: true }).click();
    assert.deepEqual(await snapshot(), before.data);
    await navigate('설정');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    report.serviceWorkerCount = await page.evaluate(async () =>
      navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    );
    assert.equal(report.serviceWorkerCount, 0);
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
    report.finalCounts = counts(final);
    passed(
      'Offline force-stop/relaunch retains all six tables and 418 XP, with no service worker, observed external request, new attempt, reward or purchase',
    );
    report.status = 'passed';
  }
} catch (error) {
  report.status = 'failed';
  report.error = { message: String(error), stack: error?.stack };
  await screenshot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await save(prepare ? 'prepare-results' : verify ? 'verify-results' : 'results', report);
  await writeFile(
    join(
      artifactRoot,
      prepare
        ? 'native-outfits-prepare-results.json'
        : verify
          ? 'native-outfits-verify-results.json'
          : 'native-outfits-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native outfits ${report.status}: ${directory}`);
}
