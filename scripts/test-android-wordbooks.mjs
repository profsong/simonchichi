// Preserve the installed app: --prepare on 0.2.0, then --apk <0.3.0.apk>.
/* global indexedDB, window, performance */
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

const prepare = process.argv.includes('--prepare');
const apkIndex = process.argv.indexOf('--apk');
if (process.argv.includes('--help')) {
  console.log(
    'ANDROID_HOME=<SDK> ANDROID_SERIAL=<device> node scripts/test-android-wordbooks.mjs --prepare',
  );
  console.log(
    'Then --apk <0.3.0.apk>; --verify repeats read-only checks against the captured baseline. Never clears app data.',
  );
  console.log(
    'Optional --test-preference-retry drops one native startup response to verify recovery.',
  );
  process.exit(0);
}
assert(
  prepare || apkIndex >= 0 || process.argv.includes('--verify'),
  'Use --prepare, --apk <file>, or --verify.',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME or ANDROID_SDK_ROOT.');
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifacts = join(root, 'artifacts', 'android');
const baselinePath = join(artifacts, 'wordbooks-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifacts, `wordbooks-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  artifactDirectory: directory,
  checks: [],
  pageErrors: [],
};
let browser, page;
async function adb(...args) {
  const result = await execute(adbPath, [...serial, ...args], {
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}
const save = (name, value) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(value, null, 2));
const passed = (name) => {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
};
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
async function version() {
  return (await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app')).match(
    /versionName=([^\s]+)/,
  )?.[1];
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
async function openBooks(from = '오늘') {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name: from, exact: true })
    .click();
  await page.getByRole('button', { name: /단어장 둘러보기/ }).click();
  await expect(page.getByTestId('wordbook-card')).toHaveCount(4);
}
async function openPdf() {
  await page.getByRole('button', { name: '수능 단어 2000', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '중복 단어 제외' })).toBeChecked();
  await expect(page.locator('.wordbook-result-count[role="status"]')).toHaveText(
    '1,824개 · 중복 제외 목록',
  );
  await expect(page.getByTestId('wordbook-entry')).toHaveCount(50);
}

async function verifyPreferenceRetry() {
  // Register on a dedicated CDP session so the document-start hook can be removed exactly.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${function installFault() {
      const diagnostic = { calls: 0, dropped: 0, firstAt: undefined, lastAt: undefined };
      window.__wordbookPreferenceFault = diagnostic;
      const patched = new WeakSet();
      function wrap(cap) {
        if (!cap || patched.has(cap)) return;
        patched.add(cap);
        let original = cap.nativePromise;
        const intercepted = function (...args) {
          if (
            args[0] === 'Preferences' &&
            args[1] === 'get' &&
            args[2]?.key === 'simonchichi.content-mode'
          ) {
            diagnostic.calls++;
            diagnostic.firstAt ??= performance.now();
            diagnostic.lastAt = performance.now();
            if (diagnostic.calls === 1) {
              diagnostic.dropped++;
              return new Promise(() => {});
            }
          }
          return original.apply(cap, args);
        };
        Object.defineProperty(cap, 'nativePromise', {
          configurable: true,
          get: () => intercepted,
          set: (next) => {
            original = next;
          },
        });
      }
      let capacitor = window.Capacitor;
      wrap(capacitor);
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        get: () => capacitor,
        set: (next) => {
          capacitor = next;
          wrap(next);
        },
      });
    }.toString()})();`,
  });
  try {
    await page.reload();
    await expect(page.locator('.demo-banner')).toBeVisible({ timeout: 8000 });
    const recovered = await page.evaluate(() => ({
      ...window.__wordbookPreferenceFault,
      recoveredAfterMs: performance.now() - window.__wordbookPreferenceFault.firstAt,
    }));
    assert.equal(recovered.dropped, 1, 'Fault injection must drop exactly one initial response.');
    assert(recovered.calls >= 2 && recovered.calls <= 3, 'Recovery must use at most three reads.');
    assert(recovered.recoveredAfterMs < 5000, 'Native startup should recover within five seconds.');
    assert.deepEqual(await snapshot(), before.data);
    report.preferenceRecovery = recovered;
    await screenshot('07-dropped-preference-recovered');
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    await cdp.detach();
  }
  await restart();
  assert.deepEqual(await snapshot(), before.data);
  await openBooks();
  await openPdf();
  passed(
    'Dropped initial native preference response recovers demo within five seconds without changing records',
  );
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.2.0');
    await restart();
    const data = await snapshot();
    assert.equal(data.tables.attempts.length, 10);
    assert.equal(data.tables.sessions.filter((item) => item.status === 'completed').length, 2);
    assert.equal(
      data.tables.rewards.reduce((sum, item) => sum + item.xp, 0),
      130,
    );
    assert.equal(data.tables.settings[0].avatarId, 'sipompurin');
    const captured = { directory, version: '0.2.0', mode: 'demo', data };
    await save('before-upgrade', captured);
    await writeFile(baselinePath, JSON.stringify(captured, null, 2));
    await screenshot('01-before-upgrade');
    passed('Captured original five tables: two completed quests, ten attempts, 130 XP, sipompurin');
    report.status = 'prepared';
  } else {
    if (apkIndex >= 0) {
      assert.equal(await version(), '0.2.0');
      assert(process.argv[apkIndex + 1], 'APK path required.');
      assert.match(await adb('install', '-r', resolve(process.argv[apkIndex + 1])), /Success/);
    }
    report.packageVersion = await version();
    assert.equal(report.packageVersion, '0.3.0');
    const installedApk = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
      .split(/\r?\n/)
      .find((path) => path.endsWith('/base.apk'))
      ?.replace(/^package:/, '');
    assert(installedApk, 'Installed APK path must be available.');
    report.apkSha256 = (await adb('shell', 'sha256sum', installedApk)).split(/\s+/)[0];
    assert.match(report.apkSha256, /^[a-f0-9]{64}$/);
    await restart();
    assert.deepEqual(await snapshot(), before.data);
    passed('In-place 0.3.0 update preserves all five tables, avatar, and demo mode');
    await openBooks();
    await screenshot('02-four-books');
    await openPdf();
    await screenshot('03-pdf-new-words');
    await page.getByRole('button', { name: '더 보기', exact: true }).click();
    await expect(page.getByTestId('wordbook-entry')).toHaveCount(100);
    passed('Four bundled books; PDF defaults to 1824 new words and renders 50 entries per page');
    await page.getByRole('checkbox', { name: '중복 단어 제외' }).uncheck();
    const search = page.getByRole('searchbox', { name: '단어 또는 뜻 검색' });
    await search.fill('adapt');
    const adapt = page.locator('[data-word-id="v-adapt-sense1"]');
    const seed = JSON.parse(await readFile(join(root, 'src/data/seed-content.json'), 'utf8'));
    await expect(adapt).toHaveAttribute('data-overlap', 'true');
    await expect(adapt).toContainText(
      seed.vocabulary.find((item) => item.id === 'v-adapt-sense1').koreanMeaning,
    );
    await expect(adapt).toContainText('PDF 원문 뜻과 구분해요');
    await screenshot('04-linked-adapt');
    await search.fill('provide');
    const provide = page
      .getByTestId('wordbook-entry')
      .filter({ has: page.getByRole('heading', { name: 'provide', exact: true }) });
    await expect(provide).toHaveAttribute('data-overlap', 'false');
    await expect(provide).toContainText('뜻 미제공');
    passed(
      'Overlap adapt retains its original ID and meaning; non-overlap provide honestly shows missing meaning',
    );
    await search.fill('');
    await page.getByRole('combobox', { name: '원문 DAY' }).selectOption('1');
    await expect(page.getByTestId('wordbook-entry')).toHaveCount(40);
    const pdf = JSON.parse(
      await readFile(join(root, 'content_src/wordbooks/suneung-2000.json'), 'utf8'),
    );
    assert.deepEqual(
      await page.getByTestId('wordbook-entry').getByRole('heading').allTextContents(),
      pdf.entries.filter((item) => item.source.day === 1).map((item) => item.headword),
    );
    await screenshot('05-original-day-one');
    passed('DAY 1 shows all 40 original words in exact PDF order');
    await page.reload();
    await expect(page.locator('.demo-banner')).toBeVisible();
    await openBooks('복습함');
    await openPdf();
    assert.deepEqual(await snapshot(), before.data);
    await restart();
    await openBooks();
    await openPdf();
    const after = await snapshot();
    assert.deepEqual(after, before.data);
    await save('after-relaunch', after);
    await screenshot('06-offline-after-relaunch');
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    passed(
      'Offline reload and force-stop retain bundled books; browsing creates no study data or XP',
    );
    if (process.argv.includes('--test-preference-retry')) {
      await verifyPreferenceRetry();
      assert.deepEqual(report.pageErrors, []);
      report.offlineAfter = await offline();
    }
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
      prepare ? 'native-wordbooks-prepare-results.json' : 'native-wordbooks-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native wordbooks ${report.status}: ${directory}`);
}
