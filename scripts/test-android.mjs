// Run against a freshly installed debug APK, already launched in airplane mode.
// This script never clears app data, installs an APK, or opens the native backup picker.
/* global indexedDB, window, navigator, location */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { chromium, expect as playwrightExpect } from '@playwright/test';

if (process.argv.includes('--help')) {
  console.log('ANDROID_HOME=<SDK> ANDROID_SERIAL=<device> node scripts/test-android.mjs');
  console.log(
    'Requires fresh com.simonchichi.app debug APK, launched after airplane mode ON and Wi-Fi/mobile data OFF. Uses CDP port 9222. Does not erase data or test the native backup picker.',
  );
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME or ANDROID_SDK_ROOT to the installed Android SDK.');
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
await access(adbPath);
const execute = promisify(execFile);
const serial = process.env.ANDROID_SERIAL;
const appId = 'com.simonchichi.app';
const endpoint = 'http://127.0.0.1:9222';
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifactRoot = join(root, 'artifacts', 'android');
const runDirectory = join(artifactRoot, `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(runDirectory, { recursive: true });
const seed = JSON.parse(await readFile(join(root, 'src', 'data', 'seed-content.json'), 'utf8'));
const authoredQuestions = new Map(
  [
    ...seed.vocabularyQuestions,
    ...seed.syntax,
    ...seed.readings.flatMap((passage) => passage.questions),
  ].map((question) => [question.id, question]),
);

const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  appId,
  endpoint,
  artifactDirectory: runDirectory,
  checks: [],
  pageErrors: [],
  externalRequests: [],
  nativeBackupPicker: 'Not exercised here; requires separate native picker verification.',
};
let connection;

async function adb(...args) {
  const result = await execute(adbPath, [...(serial ? ['-s', serial] : []), ...args], {
    encoding: 'utf8',
    timeout: 25_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}
const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
function passed(name, details) {
  report.checks.push({ name, status: 'passed', ...(details ? { details } : {}) });
  console.log(`PASS: ${name}`);
}
async function airplaneState() {
  return {
    airplaneMode: await adb('shell', 'settings', 'get', 'global', 'airplane_mode_on'),
    wifiEnabled: await adb('shell', 'settings', 'get', 'global', 'wifi_on'),
    mobileData: await adb('shell', 'settings', 'get', 'global', 'mobile_data'),
  };
}
function assertOffline(state) {
  assert.equal(
    state.airplaneMode,
    '1',
    'Enable Android airplane mode before the first app launch.',
  );
  assert.equal(state.wifiEnabled, '0', 'Wi-Fi must remain off during the native offline test.');
  assert.notEqual(
    state.mobileData,
    '1',
    'Mobile data must remain off during the native offline test.',
  );
}
async function screenshot(name) {
  // DOM assertions can resolve before the native compositor presents the new frame.
  await delay(300);
  const result = await execute(
    adbPath,
    [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
    {
      encoding: 'buffer',
      timeout: 20_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  await writeFile(join(runDirectory, `${name}.png`), result.stdout);
}
async function saveSnapshot(page, name) {
  const data = await snapshot(page);
  await writeFile(join(runDirectory, `${name}.json`), JSON.stringify(data, null, 2));
  return data;
}
function observe(page) {
  page.on('pageerror', (error) => report.pageErrors.push(String(error)));
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:\/\//.test(url) && !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
      report.externalRequests.push(url);
    }
  });
}
async function connect() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    let browser;
    try {
      const pid = (await adb('shell', 'pidof', appId)).split(/\s+/)[0];
      assert.match(pid, /^\d+$/, 'The app must already be launched on the target Android device.');
      await adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      // Android WebView does not implement browser-context/download management.
      browser = await chromium.connectOverCDP(endpoint, { timeout: 3_000, noDefaults: true });
      const context = browser.contexts()[0];
      const page = context
        ?.pages()
        .find((candidate) => /^https?:\/\/localhost(?:\/|$)/.test(candidate.url()));
      assert(page, 'Waiting for the Capacitor localhost WebView page.');
      page.setDefaultTimeout(15_000);
      observe(page);
      await page.waitForLoadState('domcontentloaded');
      return { browser, page, pid };
    } catch (error) {
      lastError = error;
      if (browser) await browser.close().catch(() => {});
      await delay(500);
    }
  }
  throw new Error(`Could not connect to the launched WebView: ${lastError}`);
}
async function restart() {
  if (connection) await connection.browser.close().catch(() => {});
  await adb('shell', 'am', 'force-stop', appId);
  await adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
  connection = await connect();
  return connection.page;
}
function navigation(page) {
  return page.getByRole('navigation', { name: '모바일 메뉴' });
}
async function snapshot(page, mode = 'demo') {
  return page.evaluate(async (databaseName) => {
    const database = await new Promise((resolveDatabase, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolveDatabase(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ['attempts', 'reviews', 'sessions', 'rewards', 'settings'];
    try {
      const transaction = database.transaction(names, 'readonly');
      const entries = await Promise.all(
        names.map(
          (name) =>
            new Promise((resolveEntry, reject) => {
              const request = transaction.objectStore(name).getAll();
              request.onsuccess = () => resolveEntry([name, request.result]);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      return Object.fromEntries(entries);
    } finally {
      database.close();
    }
  }, `english-quest-${mode}`);
}
async function currentStep(page) {
  const id = await page.getByTestId('quest-screen').getAttribute('data-question-id');
  const data = await snapshot(page);
  const step = data.sessions
    .find((session) => session.status === 'in_progress')
    ?.steps.find((item) => item.id === id);
  assert(step, `Missing saved quest step ${id}`);
  return step;
}
async function answerCorrectly(page, step) {
  if (step.choices) {
    const authored = authoredQuestions.get(step.id);
    assert(authored, `Unknown canonical question ${step.id}`);
    assert.deepEqual(step.choices, authored.choices, `Choices changed for ${step.id}`);
    assert.equal(step.correctIndex, authored.correctIndex);
    await page.getByRole('radio').nth(authored.correctIndex).check();
  } else {
    const word = seed.vocabulary.find((item) => item.id === step.entityId);
    assert(word, `Unknown recall entity ${step.entityId}`);
    await page.getByRole('textbox').fill(`  ${word.acceptedAnswers[0].toUpperCase()}  `);
  }
}
async function next(page, id) {
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
}
async function finishQuest(page) {
  let evidenceCaptured = false;
  for (let count = 0; count < 40; count++) {
    if (await page.getByText('오늘은 충분히 했어요', { exact: true }).isVisible()) return;
    await expect(page.getByTestId('quest-screen')).toBeVisible();
    const step = await currentStep(page);
    if (
      step.kind === 'question' &&
      (await page.getByRole('button', { name: '정답 확인', exact: true }).isVisible())
    ) {
      if (step.evidenceQuote) await expect(page.locator('mark')).toHaveCount(0);
      await answerCorrectly(page, step);
      await page.getByRole('button', { name: '정답 확인', exact: true }).click();
      await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
      if (step.evidenceQuote) {
        assert(
          step.passage.includes(step.evidenceQuote),
          'Reading evidence must occur in the passage.',
        );
        await expect(page.locator('mark')).toHaveText(step.evidenceQuote);
        await expect(page.locator('blockquote')).toContainText(step.evidenceQuote);
        if (!evidenceCaptured) {
          await page.locator('blockquote').scrollIntoViewIfNeeded();
          await screenshot('04-reading-evidence');
          evidenceCaptured = true;
        }
      }
    }
    await next(page, step.id);
  }
  throw new Error('Quest did not finish within 40 steps.');
}

try {
  const packageDump = await adb('shell', 'dumpsys', 'package', appId);
  report.device = {
    serial: await adb('get-serialno'),
    model: await adb('shell', 'getprop', 'ro.product.model'),
    androidVersion: await adb('shell', 'getprop', 'ro.build.version.release'),
    sdk: await adb('shell', 'getprop', 'ro.build.version.sdk'),
    emulator: (await adb('shell', 'getprop', 'ro.boot.qemu')) === '1',
    internetPermissionPresent: packageDump.includes('android.permission.INTERNET'),
  };
  report.offlineBefore = await airplaneState();
  assertOffline(report.offlineBefore);
  passed('Android airplane mode enabled, Wi-Fi and mobile data disabled', report.offlineBefore);

  connection = await connect();
  let page = connection.page;
  await expect(page.getByText('현재 승인된 콘텐츠가 없어요.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true })).toHaveCount(0);
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  const learner = await snapshot(page, 'learner');
  assert.equal(
    learner.sessions.length,
    0,
    'Run against a fresh installed test app; this script does not clear records.',
  );
  assert.equal(learner.attempts.length, 0);
  await screenshot('01-first-launch-learner');
  passed('First native launch stays in learner mode and hides all draft questions');

  report.nativeRuntime = await page.evaluate(async () => ({
    native: window.Capacitor?.isNativePlatform?.(),
    platform: window.Capacitor?.getPlatform?.(),
    serviceWorkerCount:
      'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    serviceWorkerController:
      'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller),
    navigatorOnline: navigator.onLine,
    origin: location.origin,
  }));
  assert.equal(report.nativeRuntime.native, true);
  assert.equal(report.nativeRuntime.platform, 'android');
  assert.equal(report.nativeRuntime.serviceWorkerCount, 0);
  assert.equal(report.nativeRuntime.serviceWorkerController, false);
  passed('Capacitor Android runtime has no service worker registration or controller');

  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByText('앱에 모든 학습 자료가 저장돼요', { exact: true })).toBeVisible();
  const optIn = page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' });
  await expect(optIn).not.toBeChecked();
  await optIn.click();
  await expect(optIn).toBeChecked();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true })).toBeEnabled();
  await screenshot('02-demo-opt-in-offline');
  passed('Explicit demo opt-in unlocks bundled draft quest while offline');

  await page.getByRole('button', { name: '오늘 퀘스트 시작', exact: true }).click();
  let step = await currentStep(page);
  while (step.kind === 'study') {
    await next(page, step.id);
    step = await currentStep(page);
  }
  await answerCorrectly(page, step);
  await page.getByRole('button', { name: '정답 확인', exact: true }).dblclick();
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  const answered = await saveSnapshot(page, 'first-answer');
  assert.equal(answered.attempts.length, 1);
  assert.equal(answered.rewards.length, 1);
  assert.equal(answered.rewards[0].xp, 10);
  await screenshot('03-answer-once');
  passed('Repeated answer tap produces one attempt and one 10-XP reward');

  await page.reload();
  await page.getByRole('button', { name: '이어서 탐험하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', step.id);
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  assert.deepEqual(await snapshot(page), answered);
  passed('Page reload preserves first answer and reward without duplicates');

  page = await restart();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.getByRole('button', { name: '이어서 탐험하기', exact: true }).click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-question-id', step.id);
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  assert.deepEqual(await snapshot(page), answered);
  passed('Force-stop and relaunch restore demo preference and unfinished quest');

  await finishQuest(page);
  await expect(page.getByText('오늘은 충분히 했어요', { exact: true })).toBeVisible();
  const finished = await saveSnapshot(page, 'completed');
  const session = finished.sessions[0];
  assert.equal(session.status, 'completed');
  assert.equal(
    finished.attempts.length,
    session.steps.filter((item) => item.kind === 'question').length,
  );
  assert.equal(finished.rewards.filter((reward) => reward.kind === 'completion').length, 1);
  assert.equal(session.xpAwarded, finished.attempts.length * 10 + 30);
  assert.equal(new Set(finished.rewards.map((reward) => reward.id)).size, finished.rewards.length);
  assert(finished.reviews.every((review) => !review.mastered));
  const studyIds = session.steps
    .filter((item) => item.kind === 'study')
    .map((item) => item.entityId);
  assert.equal(studyIds.length, 5);
  const tomorrow = new Date(Date.parse(`${session.localDay}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const id of studyIds)
    assert.equal(finished.reviews.find((review) => review.entityId === id)?.dueDay, tomorrow);
  await screenshot('05-quest-completed');
  passed('Entire offline quest completes with authored reading evidence and next-day reviews', {
    attempts: finished.attempts.length,
    xp: session.xpAwarded,
    reviewWords: studyIds.length,
  });

  page = await restart();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.getByRole('button', { name: '오늘의 탐험 돌아보기', exact: true }).click();
  await expect(page.getByText('오늘은 충분히 했어요', { exact: true })).toBeVisible();
  assert.deepEqual(await saveSnapshot(page, 'after-relaunch'), finished);
  await screenshot('06-completion-after-relaunch');
  passed('Second force-stop and relaunch preserve completed session and all recorded data');

  await page.getByRole('button', { name: '오늘의 탐험 마치기', exact: true }).click();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toBeChecked();
  await expect(page.getByRole('button', { name: '백업 파일 저장', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '백업 파일 저장', exact: true }).scrollIntoViewIfNeeded();
  await screenshot('07-native-backup-ready');
  report.offlineAfter = await airplaneState();
  assertOffline(report.offlineAfter);
  assert.deepEqual(report.pageErrors, [], 'No uncaught WebView JavaScript errors are expected.');
  assert.deepEqual(
    report.externalRequests,
    [],
    'The offline lesson must not request external services.',
  );
  passed(
    'Device remains in airplane mode; native backup action is available for separate picker verification',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { message: String(error), stack: error?.stack };
  await screenshot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2);
  await writeFile(join(runDirectory, 'results.json'), json);
  await writeFile(join(artifactRoot, 'native-smoke-results.json'), json);
  if (connection) await connection.browser.close().catch(() => {});
  console.log(`Native smoke ${report.status}: ${join(artifactRoot, 'native-smoke-results.json')}`);
}
