// In-place 0.11 -> 0.12 mistake-note check. Never clears data, answers a question, or adds XP.
// --prepare on 0.11, then --apk <file> --expected-sha256 <hash>.
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
if (process.argv.includes('--help')) {
  console.log(
    'Set ANDROID_HOME and ANDROID_SERIAL. Boot the existing AVD without wiping data, with airplane mode on and Wi-Fi/mobile data off. Run --prepare on 0.11, then --apk <0.12.apk> --expected-sha256 <hash>. Opens and resumes one unanswered mistake quiz. No learning answers or new purchases.',
  );
  process.exit(0);
}
assert(prepare || arg('--apk'), 'Use --prepare or --apk <file>.');
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
const baselinePath = join(artifactRoot, 'mistakes-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifactRoot, `mistakes-${new Date().toISOString().replace(/[:.]/g, '-')}`);
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
    'Read-only upgrade comparison, opening the derived mistake note, and creating/resuming one unanswered mistake quiz. No answers, XP injection, purchases, reset, or native backup picker.',
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

async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}

// Independent audit of the immutable, previously validated native answer ledger.
// This deliberately reads raw IndexedDB rather than calling application helpers.
function existingMistakes(data) {
  const states = new Map();
  for (const attempt of [...data.tables.attempts].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  )) {
    const key = `${attempt.entityType}:${attempt.entityType === 'vocab' ? attempt.entityId : attempt.questionId}`;
    if (!attempt.isCorrect) {
      states.set(key, {
        key,
        questionId: attempt.questionId,
        lastWrongAt: attempt.completedAt,
        correctSessions: new Set(),
      });
    } else if (states.has(key)) {
      states.get(key).correctSessions.add(attempt.sessionId);
    }
  }
  return [...states.values()]
    .filter((state) => state.correctSessions.size < 2)
    .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt) || a.key.localeCompare(b.key))
    .map(({ correctSessions, ...state }) => ({ ...state, correctCount: correctSessions.size }));
}

function assertOnlyUnansweredQuizAdded(data, expectedSessionId) {
  assert.equal(data.version, before.data.version);
  for (const [name, rows] of Object.entries(before.data.tables)) {
    if (name === 'sessions') {
      const originalIds = new Set(rows.map((row) => row.sessionId));
      assert.deepEqual(
        data.tables.sessions.filter((row) => originalIds.has(row.sessionId)),
        rows,
      );
      const added = data.tables.sessions.filter((row) => !originalIds.has(row.sessionId));
      assert.equal(added.length, 1);
      const quiz = added[0];
      assert.equal(quiz.sessionKind, 'mistakes');
      assert.equal(quiz.status, 'in_progress');
      assert.equal(quiz.currentQuestionIndex, 0);
      assert.equal(quiz.xpAwarded, 0);
      assert.equal(quiz.courseId, undefined);
      assert.deepEqual(
        quiz.steps.map((step) => step.id),
        before.mistakes.slice(0, 10).map((item) => item.questionId),
      );
      if (expectedSessionId) assert.equal(quiz.sessionId, expectedSessionId);
    } else {
      assert.deepEqual(data.tables[name], rows, `${name} must remain immutable`);
    }
  }
}

async function assertMistakeNote() {
  await expect(page.getByRole('heading', { name: '오답노트', exact: true })).toBeVisible();
  await expect(page.getByTestId('mistake-item')).toHaveCount(before.mistakes.length);
  for (const item of before.mistakes) {
    const row = page.locator(`[data-testid="mistake-item"][data-mistake-key="${item.key}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByLabel(`해제까지 정답 ${item.correctCount} / 2회`)).toBeVisible();
  }
}

try {
  let bootComplete = false;
  for (let index = 0; index < 60; index++) {
    if ((await adb('shell', 'getprop', 'sys.boot_completed')) === '1') {
      bootComplete = true;
      break;
    }
    await delay(500);
  }
  assert(bootComplete, 'Wait for the preserved emulator to finish booting.');
  report.offlineBefore = await offline();
  if (prepare) {
    report.package = await packageInfo();
    assert.equal(report.package.version, '0.11.0');
    assert.equal(report.package.code, 11);
    await restart();
    const data = await snapshot();
    assertBaseline(data);
    const previous = JSON.parse(
      await readFile(join(artifactRoot, 'native-outfits-results.json'), 'utf8'),
    );
    const oldSnapshot = JSON.parse(
      await readFile(join(previous.artifactDirectory, 'final-six-tables.json'), 'utf8'),
    );
    assert.deepEqual(
      data,
      oldSnapshot,
      'Existing 0.11 records must match the previous frozen native audit.',
    );
    const mistakes = existingMistakes(data);
    assert(mistakes.length > 0, 'This preserved baseline has actual historical mistakes.');
    await save('before-six-tables', data);
    await save('before-derived-mistakes', mistakes);
    await navigate('오늘');
    await screenshot('01-before-today');
    assert.deepEqual(await snapshot(), data);
    await writeFile(
      baselinePath,
      JSON.stringify({ directory, package: report.package, data, mistakes }, null, 2),
    );
    report.baselineCounts = counts(data);
    report.existingMistakes = mistakes;
    passed(
      'Untouched 0.11 baseline matches all six previously frozen tables: 7 sessions, 101 attempts, 4 purchases, 998 earned / 580 spent / 418 available',
    );
    report.status = 'prepared';
  } else {
    const apk = resolve(arg('--apk'));
    report.inputApkSha256 = createHash('sha256')
      .update(await readFile(apk))
      .digest('hex');
    if (arg('--expected-sha256'))
      assert.equal(report.inputApkSha256, arg('--expected-sha256').toLowerCase());
    assert.match(await adb('install', '-r', apk), /Success/);
    report.package = await packageInfo();
    assert.equal(report.package.version, '0.12.0');
    assert.equal(report.package.code, 12);
    assert.equal(report.package.sha256, report.inputApkSha256);
    await restart();
    const upgraded = await snapshot();
    assertBaseline(upgraded);
    assert.deepEqual(upgraded, before.data);
    await save('after-upgrade-six-tables', upgraded);
    passed(
      '0.11 -> 0.12 in-place upgrade preserves all six original tables, historical receipts, settings and XP exactly',
    );

    await navigate('오늘');
    const entry = page.getByRole('button', { name: /오답 다시 도전/ });
    await expect(entry).toBeEnabled();
    await entry.click();
    await assertMistakeNote();
    await screenshot('02-existing-mistake-note');
    assert.deepEqual(await snapshot(), before.data);
    await page.getByRole('button', { name: '복습함으로', exact: true }).click();
    await page.getByRole('button', { name: /오답노트 보기/ }).click();
    await assertMistakeNote();
    assert.deepEqual(await snapshot(), before.data);
    passed(
      'Both Today and library entry buttons open actual historical mistakes with correct 0/2 or 1/2 progress; reading the note changes no record',
    );

    await page.getByRole('button', { name: '오답 퀴즈 시작', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장하고 나가기', exact: true })).toBeVisible();
    const started = await snapshot();
    assertOnlyUnansweredQuizAdded(started);
    const quiz = started.tables.sessions.find((row) => row.sessionKind === 'mistakes');
    report.createdQuizId = quiz.sessionId;
    await save('unanswered-quiz-six-tables', started);
    await screenshot('03-unanswered-mistake-quiz');
    await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '오답 퀴즈 이어하기', exact: true }),
    ).toBeVisible();
    assert.deepEqual(await snapshot(), started);
    passed(
      'One canonical mistake quiz can be opened and exited without answering, changing XP, purchases, SRS or any historical record',
    );

    await restart();
    await navigate('오늘');
    await page.getByRole('button', { name: /오답 다시 도전/ }).click();
    await assertMistakeNote();
    await page.getByRole('button', { name: '오답 퀴즈 이어하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장하고 나가기', exact: true })).toBeVisible();
    const restored = await snapshot();
    assert.deepEqual(restored, started);
    assertOnlyUnansweredQuizAdded(restored, quiz.sessionId);
    await screenshot('04-offline-resumed-mistake-quiz');
    await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
    await navigate('설정');
    await expect(page.getByText('앱에 모든 학습 자료가 저장돼요', { exact: true })).toBeVisible();
    report.serviceWorkerCount = await page.evaluate(async () =>
      navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    );
    assert.equal(report.serviceWorkerCount, 0);
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
    await save('final-six-tables', restored);
    report.finalCounts = counts(restored);
    report.existingMistakes = before.mistakes;
    passed(
      'Offline force-stop/relaunch resumes the same unanswered quiz with identical records; no native SW, observed external requests, added answer, reward or purchase',
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
      artifactRoot,
      prepare ? 'native-mistakes-prepare-results.json' : 'native-mistakes-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native mistakes ${report.status}: ${directory}`);
}
