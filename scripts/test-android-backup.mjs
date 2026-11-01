// Run after test-android.mjs has released the emulator in Settings / completed demo mode.
// Exercises real Android document-picker UI; does not reset or alter learning records.
/* global indexedDB */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect as playwrightExpect } from '@playwright/test';

if (process.argv.includes('--help')) {
  console.log('ANDROID_HOME=<SDK> ANDROID_SERIAL=<device> node scripts/test-android-backup.mjs');
  console.log(
    'Requires launched debug APK with a completed demo quest. Tests native Cancel + Save and verifies exported JSON without resetting records.',
  );
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME or ANDROID_SDK_ROOT.');
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const serialArgs = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifactRoot = join(root, 'artifacts', 'android');
const runDirectory = join(
  artifactRoot,
  `backup-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
await mkdir(runDirectory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  checks: [],
  nativeImportChooser: 'Not exercised; this focused smoke preserves existing records.',
};
let browser;

async function adb(...args) {
  const result = await execute(adbPath, [...serialArgs, ...args], {
    encoding: 'utf8',
    timeout: 25_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}
function passed(name) {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
}
async function screenshot(name) {
  // Allow the Android compositor to present the frame asserted by the WebView.
  await delay(300);
  const result = await execute(adbPath, [...serialArgs, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  await writeFile(join(runDirectory, `${name}.png`), result.stdout);
}
async function nativeNodes(name) {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/simonchichi-backup-window.xml');
  const xml = await adb('exec-out', 'cat', '/sdcard/simonchichi-backup-window.xml');
  if (name) await writeFile(join(runDirectory, `${name}.xml`), xml);
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        value
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&'),
      ]),
    ),
  );
}
async function waitNative(predicate, name) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const nodes = await nativeNodes(name);
    const match = nodes.find(predicate);
    if (match) return { nodes, match };
    await delay(400);
  }
  throw new Error(`Native UI target unavailable: ${name}`);
}
async function tap(node) {
  const bounds = node.bounds
    ?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
    ?.slice(1)
    .map(Number);
  assert(bounds, `Missing native bounds for ${node.text || node['content-desc']}`);
  await adb(
    'shell',
    'input',
    'tap',
    String(Math.floor((bounds[0] + bounds[2]) / 2)),
    String(Math.floor((bounds[1] + bounds[3]) / 2)),
  );
}
const isPicker = (node) => /\.documentsui$/.test(node.package ?? '');
const isDownloads = (node) => /^(Downloads|다운로드)$/i.test(node.text ?? '');
async function downloads() {
  const names = await adb('shell', 'ls', '-1', '/sdcard/Download');
  return names ? names.split(/\r?\n/) : [];
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('english-quest-demo');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ['attempts', 'reviews', 'sessions', 'rewards', 'settings'];
    try {
      const transaction = db.transaction(names, 'readonly');
      return Object.fromEntries(
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
    } finally {
      db.close();
    }
  });
}

try {
  const pid = (await adb('shell', 'pidof', 'com.simonchichi.app')).split(/\s+/)[0];
  assert.match(pid, /^\d+$/, 'Launch the debug APK first.');
  await adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
  const page = browser
    .contexts()[0]
    ?.pages()
    .find((candidate) => /^https?:\/\/localhost(?:\/|$)/.test(candidate.url()));
  assert(page, 'Capacitor WebView must be available.');
  page.setDefaultTimeout(15_000);
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name: '설정', exact: true })
    .click();
  await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toBeChecked();
  const before = await snapshot(page);
  assert(
    before.sessions.some((session) => session.status === 'completed') && before.attempts.length > 0,
    'Complete a demo quest before this smoke test.',
  );
  await writeFile(join(runDirectory, 'before.json'), JSON.stringify(before, null, 2));
  const beforeFiles = await downloads();
  const save = page.getByRole('button', { name: '백업 파일 저장', exact: true });

  await save.click();
  await waitNative(isPicker, '01-cancel-picker');
  await screenshot('01-cancel-picker');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  const cancelMessage = page.getByText('저장을 취소했어요. 학습 기록은 그대로 있어요.', {
    exact: true,
  });
  try {
    await expect(cancelMessage).toBeVisible({ timeout: 3000 });
  } catch (error) {
    // Some keyboards consume the first Back; never send an extra Back to the app itself.
    if (!(await nativeNodes()).some(isPicker)) throw error;
    await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
  await expect(cancelMessage).toBeVisible();
  assert.deepEqual(await snapshot(page), before);
  assert.deepEqual(await downloads(), beforeFiles);
  await screenshot('02-cancel-confirmed');
  passed('Native document picker cancellation is reassuring and preserves all records/files');

  await save.click();
  let { nodes } = await waitNative(isPicker, '03-save-picker');
  if (!nodes.some(isDownloads)) {
    const menu = nodes.find((node) =>
      /Show roots|Open navigation drawer|위치 표시|탐색 창/i.test(node['content-desc'] ?? ''),
    );
    assert(menu, 'Document picker must expose its storage location menu.');
    await tap(menu);
    const location = await waitNative(isDownloads, '04-storage-locations');
    await tap(location.match);
  }
  const saveControl = await waitNative(
    (node) => /^(SAVE|저장)$/i.test(node.text ?? '') && node.enabled === 'true',
    '05-save-downloads',
  );
  await screenshot('03-save-downloads');
  await tap(saveControl.match);
  await expect(
    page.getByText('선택한 위치에 백업 파일을 저장했어요.', { exact: true }),
  ).toBeVisible();
  const newFiles = (await downloads()).filter((name) => !beforeFiles.includes(name));
  assert.equal(newFiles.length, 1, `Expected one new Downloads backup, found ${newFiles}`);
  assert.match(newFiles[0], /\.json$/i);
  const backupPath = join(runDirectory, 'exported-backup.json');
  await adb('pull', `/sdcard/Download/${newFiles[0]}`, backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.schemaVersion, 2);
  assert.equal(backup.appMode, 'demo');
  const seed = JSON.parse(await readFile(join(root, 'src', 'data', 'seed-content.json'), 'utf8'));
  assert.equal(backup.contentVersion, seed.contentVersion);
  for (const table of Object.keys(before))
    assert.deepEqual(backup[table], before[table], `Exported ${table} must match stored records.`);
  assert.deepEqual(await snapshot(page), before);
  await screenshot('04-save-confirmed');
  report.savedFilename = newFiles[0];
  report.attempts = before.attempts.length;
  report.xp = before.rewards.reduce((sum, reward) => sum + reward.xp, 0);
  report.airplaneMode = await adb('shell', 'settings', 'get', 'global', 'airplane_mode_on');
  assert.equal(report.airplaneMode, '1', 'Device should remain in airplane mode.');
  passed(
    'Native Save writes a UTF-8 JSON backup in Downloads with exact attempts/reviews/sessions/rewards/settings',
  );
  passed('Offline backup leaves the completed quest and XP unchanged');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { message: String(error), stack: error?.stack };
  await screenshot('failure').catch(() => {});
  await nativeNodes('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.artifactDirectory = runDirectory;
  const json = JSON.stringify(report, null, 2);
  await writeFile(join(runDirectory, 'results.json'), json);
  await writeFile(join(artifactRoot, 'native-backup-results.json'), json);
  if (browser) await browser.close().catch(() => {});
  console.log(
    `Native backup ${report.status}: ${join(artifactRoot, 'native-backup-results.json')}`,
  );
}
