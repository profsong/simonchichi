// Read-only 0.3.0 -> 0.4.0 update test. Never clears emulator or application data.
/* global indexedDB, fetch */
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

const prepare = process.argv.includes('--prepare');
const apkIndex = process.argv.indexOf('--apk');
if (process.argv.includes('--help')) {
  console.log(
    'Set ANDROID_HOME and ANDROID_SERIAL. Run --prepare on installed 0.3.0, then --apk <0.4.0.apk>. --verify repeats read-only checks using the saved baseline.',
  );
  process.exit(0);
}
assert(
  prepare || apkIndex >= 0 || process.argv.includes('--verify'),
  'Use --prepare, --apk <path>, or --verify.',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME.');
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifacts = join(root, 'artifacts/android');
const baselinePath = join(artifacts, 'meanings-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifacts, `meanings-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  artifactDirectory: directory,
  checks: [],
  pageErrors: [],
  externalRequests: [],
};
let browser, page;
async function adb(...args) {
  const selected = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
  const result = await execute(
    join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
    [...selected, ...args],
    { encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
  return result.stdout.trim();
}
const save = (name, value) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(value, null, 2));
const passed = (name) => {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
};
const version = async () =>
  (await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app')).match(
    /versionName=([^\s]+)/,
  )?.[1];
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
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const pid = await adb('shell', 'pidof', 'com.simonchichi.app');
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
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => report.pageErrors.push(String(error)));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== 'localhost')
          report.externalRequests.push(request.url());
      });
      await expect(page.locator('.demo-banner')).toBeVisible();
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
  return page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('english-quest-demo');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['attempts', 'reviews', 'sessions', 'rewards', 'settings'];
      const transaction = db.transaction(names, 'readonly');
      return {
        version: db.version,
        tables: Object.fromEntries(
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
        ),
      };
    } finally {
      db.close();
    }
  });
}
async function screenshot(name) {
  await delay(400);
  await page.screenshot({ path: join(directory, `${name}.png`) });
}
async function openMap() {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name: '모험 지도', exact: true })
    .click();
}
async function openPdf() {
  await openMap();
  await page.getByRole('button', { name: '수능 단어 2000 단어장 열기', exact: true }).click();
  await expect(page.getByTestId('definitions-enriched')).toBeVisible();
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.3.0');
    await restart();
    const data = await snapshot();
    assert.equal(data.tables.attempts.length, 10);
    assert.equal(data.tables.sessions.filter((row) => row.status === 'completed').length, 2);
    assert.equal(
      data.tables.rewards.reduce((sum, row) => sum + row.xp, 0),
      130,
    );
    assert.equal(data.tables.settings[0].avatarId, 'sipompurin');
    const baseline = { directory, version: '0.3.0', mode: 'demo', data };
    await save('before-upgrade', baseline);
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    await screenshot('01-before-upgrade');
    passed('Captured original five tables: two quests, ten attempts, 130 XP, sipompurin, demo');
    report.status = 'prepared';
  } else {
    if (apkIndex >= 0) {
      assert.equal(await version(), '0.3.0');
      assert(process.argv[apkIndex + 1], 'APK path required.');
      const apk = resolve(process.argv[apkIndex + 1]);
      report.inputApkSha256 = createHash('sha256')
        .update(await readFile(apk))
        .digest('hex');
      assert.match(await adb('install', '-r', apk), /Success/);
    }
    report.packageVersion = await version();
    assert.equal(report.packageVersion, '0.4.0');
    const installed = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
      .split(/\r?\n/)
      .find((path) => path.endsWith('/base.apk'))
      ?.replace(/^package:/, '');
    assert(installed);
    report.apkSha256 = (await adb('shell', 'sha256sum', installed)).split(/\s+/)[0];
    if (report.inputApkSha256) assert.equal(report.apkSha256, report.inputApkSha256);
    await restart();
    assert.deepEqual(await snapshot(), before.data);
    passed('In-place 0.4.0 update preserves every record, demo preference, and avatar');
    await openMap();
    await expect(page.getByTestId('core-course-summary')).toContainText('12개 챕터');
    await expect(page.getByTestId('core-course-summary')).toContainText('300개 단어 · 60단계');
    await expect(page.locator('.chapter-card')).toHaveCount(12);
    const seed = JSON.parse(await readFile(join(root, 'src/data/seed-content.json'), 'utf8'));
    assert.deepEqual(
      await page
        .getByTestId('map-plan')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-plan-id'))),
      seed.dailyPlans.map((plan) => plan.id),
    );
    assert.equal(await page.locator('[data-testid="map-plan"][data-completed="true"]').count(), 2);
    await screenshot('02-fixed-map-and-separate-book');
    await page.locator('.chapter-card').last().locator('summary').click();
    await expect(page.locator('[data-testid="chapter-wordbooks"][data-chapter="12"]')).toHaveText(
      'B3 25개',
    );
    await screenshot('03-chapter-twelve-band');
    await page.getByTestId('map-wordbook').click();
    await expect(page.getByTestId('definitions-enriched')).toBeVisible();
    passed('Fixed 12-chapter/60-stage/300-word course and B3 chapter 12; PDF opens separately');
    await expect(page.locator('.wordbook-result-count[role="status"]')).toHaveText(
      '1,824개 · 중복 제외 목록',
    );
    await expect(page.getByTestId('wordbook-entry')).toHaveCount(50);
    await page.getByRole('checkbox', { name: '중복 단어 제외' }).uncheck();
    await expect(page.locator('.wordbook-result-count[role="status"]')).toHaveText(
      '2,000개 · 원본 단어 목록',
    );
    await page.getByRole('combobox', { name: '원문 DAY' }).selectOption('1');
    const pdf = JSON.parse(
      await readFile(join(root, 'content_src/wordbooks/suneung-2000.json'), 'utf8'),
    );
    assert.deepEqual(
      await page.getByTestId('wordbook-entry').getByRole('heading').allTextContents(),
      pdf.entries.filter((row) => row.source.day === 1).map((row) => row.headword),
    );
    await expect(page.locator('.wordbook-meaning-missing')).toHaveCount(0);
    passed('PDF shows 2000 original entries, 1824 unique additions, and exact DAY 1 order');
    await page.getByRole('combobox', { name: '원문 DAY' }).selectOption('all');
    const search = page.getByRole('searchbox', { name: '단어 또는 뜻 검색' });
    await search.fill('provide');
    const provide = page
      .getByTestId('wordbook-entry')
      .filter({ has: page.getByRole('heading', { name: 'provide', exact: true }) });
    await expect(provide.locator('.wordbook-meaning')).toContainText('제공하다');
    await provide.locator('summary').click();
    await expect(provide.getByTestId('definition-sources')).toContainText('한국어 위키낱말사전');
    await expect(provide.getByTestId('definition-sources')).toContainText('CC-BY-SA-4.0');
    report.provideSourceLinks = await provide
      .getByRole('link')
      .evaluateAll((items) => items.map((item) => item.href));
    const license = await page.evaluate(async () => {
      const response = await fetch('/licenses/DICTIONARY-ATTRIBUTION.txt');
      return { status: response.status, text: await response.text() };
    });
    assert.equal(license.status, 200);
    assert.match(license.text, /CC-BY-SA-4\.0/);
    assert.match(license.text, /Princeton University/);
    report.licenseAsset = {
      status: license.status,
      sha256: createHash('sha256').update(license.text).digest('hex'),
      source: 'https://localhost/licenses/DICTIONARY-ATTRIBUTION.txt',
    };
    await screenshot('04-provide-meaning-and-source');
    passed('provide has Korean meaning and source credits; bundled license loads while offline');
    await search.fill('vacuum');
    const typo = page
      .getByTestId('wordbook-entry')
      .filter({ has: page.getByRole('heading', { name: 'vaccum', exact: true }) });
    await expect(typo).toContainText('원문 표기 확인');
    await expect(typo).toContainText('vacuum');
    await expect(typo.locator('.wordbook-meaning')).toContainText('진공');
    await screenshot('05-preserved-spelling-caution');
    passed('Dictionary alias vacuum finds original vaccum with a visible spelling caution');
    await page.reload();
    await expect(page.locator('.demo-banner')).toBeVisible();
    await openPdf();
    assert.deepEqual(await snapshot(), before.data);
    await restart();
    await openPdf();
    const after = await snapshot();
    assert.deepEqual(after, before.data);
    await save('after-relaunch', after);
    await screenshot('06-offline-after-relaunch');
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
    passed(
      'Offline reload and force-stop retain meanings and exact original records; browsing creates no XP',
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
  await save(prepare ? 'prepare-results' : 'results', report);
  await writeFile(
    join(
      artifacts,
      prepare ? 'native-meanings-prepare-results.json' : 'native-meanings-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native meanings ${report.status}: ${directory}`);
}
