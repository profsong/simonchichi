// In-place 0.6 -> 0.7 check. Never clears application data or creates learning records.
// --prepare on 0.6, then --apk <file> --expected-sha256 <hash>. --verify is read-only.
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
assert(
  prepare || verify || arg('--apk'),
  'Use --prepare, --apk <file>, or --verify. Set ANDROID_HOME and ANDROID_SERIAL.',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert(process.env.ANDROID_HOME, 'Set ANDROID_HOME.');
const adbPath = join(
  process.env.ANDROID_HOME,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15000 });
const artifactRoot = join(root, 'artifacts', 'android');
const baselinePath = join(artifactRoot, 'backgrounds-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifactRoot, `backgrounds-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  artifactDirectory: directory,
  device: 'Android emulator only; no physical personal device',
  checks: [],
  pageErrors: [],
  externalRequests: [],
  nativeBackupPicker:
    'Not exercised. Native six-table persistence is checked; schema4 backup import/export is covered by separate unit/web tests.',
};
let browser, page;
const save = (name, data) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(data, null, 2));
const passed = (name) => {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
};
const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
async function adb(...args) {
  return (
    await execute(adbPath, [...serial, ...args], {
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  ).stdout.trim();
}
const version = async () =>
  (await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app')).match(
    /versionName=([^\s]+)/,
  )?.[1];
async function installedHash() {
  const path = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
    .split(/\r?\n/)
    .find((path) => path.endsWith('/base.apk'))
    ?.replace(/^package:/, '');
  assert(path);
  return (await adb('shell', 'sha256sum', path)).split(/\s+/)[0];
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
  let error;
  for (let i = 0; i < 40; i++) {
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
    } catch (value) {
      error = value;
      await browser?.close().catch(() => {});
      await delay(500);
    }
  }
  throw error;
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
      const tx = db.transaction(names, 'readonly');
      return {
        version: db.version,
        tables: Object.fromEntries(
          await Promise.all(
            names.map(
              (name) =>
                new Promise((resolveRows, reject) => {
                  const request = tx.objectStore(name).getAll();
                  request.onsuccess = () => resolveRows([name, request.result]);
                  request.onerror = () => reject(request.error);
                }),
            ),
          ),
        ),
      };
    } finally {
      db.close();
    }
  });
  return JSON.parse(JSON.stringify(data));
}
async function screenshot(name) {
  if (!page) return;
  await delay(1200);
  // Force a WebView paint before adb capture; a headless emulator may otherwise
  // return the previous compositor frame despite the DOM having changed.
  await page.screenshot({ path: join(directory, `${name}-webview.png`) });
  await delay(300);
  const image = await execute(adbPath, [...serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    timeout: 25000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  await writeFile(join(directory, `${name}.png`), image.stdout);
}
const earned = (data) => data.tables.rewards.reduce((sum, row) => sum + row.xp, 0);
const spent = (data) => data.tables.purchases.reduce((sum, row) => sum + row.price, 0);
const card = (id) => page.locator(`[data-testid="room-item"][data-item-id="${id}"]`);
async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function shop() {
  await navigate('복습함');
  await page.getByRole('button', { name: '방 꾸미기', exact: true }).click();
  await expect(page.getByTestId('room-shop')).toBeVisible();
  await page.getByRole('tab', { name: '배경', exact: true }).click();
}
async function assertCardPreviews() {
  await expect(page.getByTestId('room-item')).toHaveCount(14);
  const unowned = page.locator('[data-testid="room-item"][data-owned="false"]');
  assert((await unowned.count()) > 0);
  assert.equal(
    await unowned.locator('.room-item-preview').count(),
    0,
    'Unowned backgrounds must not render a scene preview',
  );
  assert.equal(await unowned.locator('.avatar-room-scene').count(), 0);
  await expect(card('mint-room').locator('.room-item-preview')).toHaveCount(1);
  await expect(card('sky-garden').locator('.room-item-preview')).toHaveCount(1);
}
function assertUnchangedLearning(data) {
  for (const table of ['attempts', 'reviews', 'sessions', 'rewards'])
    assert.deepEqual(
      data.tables[table],
      before.data.tables[table],
      `${table} must not change during room browsing`,
    );
  for (const receipt of before.data.tables.purchases)
    assert.deepEqual(
      data.tables.purchases.find((row) => row.id === receipt.id),
      receipt,
    );
  for (const [key, value] of Object.entries(before.data.tables.settings[0]))
    if (key !== 'room') assert.deepEqual(data.tables.settings[0][key], value);
}
function assertFinal(data) {
  assertUnchangedLearning(data);
  assert.equal(data.version, 30);
  assert.equal(earned(data), 735);
  assert.equal(spent(data), 580);
  assert.equal(data.tables.purchases.length, 4);
  assert.equal(data.tables.sessions.length, 6);
  assert.equal(data.tables.attempts.length, 70);
  assert.deepEqual(data.tables.settings[0].room, {
    ...before.data.tables.settings[0].room,
    backgroundId: 'rain-library',
  });
  assert.equal(data.tables.purchases.find((row) => row.itemId === 'rain-library')?.price, 200);
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.6.0');
    await restart();
    const data = await snapshot();
    const old = JSON.parse(await readFile(join(artifactRoot, 'native-room-results.json'), 'utf8'));
    assert.deepEqual(
      data,
      JSON.parse(
        await readFile(join(old.artifactDirectory, 'final-six-table-snapshot.json'), 'utf8'),
      ),
    );
    assert.equal(data.version, 30);
    assert.equal(earned(data), 735);
    assert.equal(spent(data), 380);
    assert.equal(data.tables.sessions.length, 6);
    assert.equal(data.tables.attempts.length, 70);
    const baseline = { directory, packageVersion: '0.6.0', apkSha256: await installedHash(), data };
    await save('before-upgrade', baseline);
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    await navigate('복습함');
    await screenshot('01-before-upgrade');
    passed(
      '0.6 baseline exactly matches prior six-table evidence: 735 earned / 380 spent / 355 available XP',
    );
    report.status = 'prepared';
  } else {
    if (arg('--apk')) {
      const apk = resolve(arg('--apk'));
      report.inputApkSha256 = createHash('sha256')
        .update(await readFile(apk))
        .digest('hex');
      if (arg('--expected-sha256')) assert.equal(report.inputApkSha256, arg('--expected-sha256'));
      assert.match(await adb('install', '-r', apk), /Success/);
    }
    report.packageVersion = await version();
    assert.equal(report.packageVersion, '0.7.0');
    report.apkSha256 = await installedHash();
    if (report.inputApkSha256) assert.equal(report.apkSha256, report.inputApkSha256);
    if (arg('--expected-sha256')) assert.equal(report.apkSha256, arg('--expected-sha256'));
    await restart();
    const initial = await snapshot();
    if (!initial.tables.purchases.some((row) => row.itemId === 'rain-library')) {
      assert.deepEqual(initial, before.data);
      await save('after-upgrade', initial);
    } else
      assert.deepEqual(
        JSON.parse(await readFile(join(directory, 'after-upgrade.json'), 'utf8')),
        before.data,
      );
    passed(
      'In-place 0.6 -> 0.7 update preserves all six tables, receipts, equipment, and preferences exactly',
    );
    assert.equal(
      await page.evaluate(async () =>
        navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      ),
      0,
    );
    await shop();
    await assertCardPreviews();
    if (!verify && !initial.tables.purchases.some((row) => row.itemId === 'rain-library')) {
      await expect(card('rain-library')).toHaveAttribute('data-owned', 'false');
      await card('rain-library').scrollIntoViewIfNeeded();
      await screenshot('02-fourteen-backgrounds-before-purchase');
      await card('rain-library').getByRole('button').dblclick();
      await expect(card('rain-library')).toHaveAttribute('data-equipped', 'true');
    }
    const purchased = await snapshot();
    assertFinal(purchased);
    await expect(card('rain-library').locator('.room-item-preview')).toHaveCount(1);
    await expect(page.getByTestId('room-shop-balance')).toContainText('155');
    await save('after-purchase', purchased);
    await screenshot('03-owned-rain-library-preview');
    passed(
      'Fourteen background cards hide unowned scenes; buying rain-library once spends 200 XP and reveals its owned preview',
    );
    if (!verify) {
      await card('mint-room').getByRole('button').click();
      await expect(card('mint-room')).toHaveAttribute('data-equipped', 'true');
      await card('rain-library').getByRole('button').click();
      await expect(card('rain-library')).toHaveAttribute('data-equipped', 'true');
      assert.deepEqual(await snapshot(), purchased);
    }
    passed(
      'Free default and owned-background re-equipping preserve all receipts and the 155 XP balance',
    );
    await page.getByRole('button', { name: '꾸미기 닫기', exact: true }).click();
    const final = await snapshot();
    assertFinal(final);
    await save('final-six-table-snapshot', final);
    await restart();
    assert.deepEqual(await snapshot(), final);
    await navigate('복습함');
    await expect(page.getByTestId('avatar-room-scene')).toHaveAttribute(
      'data-background-id',
      'rain-library',
    );
    await expect(page.getByTestId('avatar-room-scene')).toHaveAttribute(
      'data-avatar-id',
      'sipompurin',
    );
    await expect(page.getByTestId('room-balance')).toContainText('155');
    await page.getByTestId('avatar-room-scene').scrollIntoViewIfNeeded();
    await screenshot('04-final-offline-rain-library');
    await navigate('설정');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    report.finalCounts = {
      tables: Object.keys(final.tables).length,
      databaseVersion: final.version,
      sessions: 6,
      attempts: 70,
      purchases: 4,
      earnedXp: earned(final),
      spentXp: spent(final),
      availableXp: earned(final) - spent(final),
      room: final.tables.settings[0].room,
      avatar: final.tables.settings[0].avatarId,
      selectedCourse: final.tables.settings[0].selectedWordbookId,
    };
    passed(
      'Offline force-stop/relaunch preserves all six tables, the new room, old learning records, avatar, and selected course',
    );
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
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
  await save(prepare ? 'prepare-results' : 'results', report);
  await writeFile(
    join(
      artifactRoot,
      prepare ? 'native-backgrounds-prepare-results.json' : 'native-backgrounds-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native backgrounds ${report.status}: ${directory}`);
}
