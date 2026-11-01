// In-place 0.7 -> 0.8 test-first course check. Never clears application data.
// --prepare on 0.7, then --apk <file> --expected-sha256 <hash>. --verify is read-only.
/* global indexedDB, navigator, structuredClone */
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
const baselinePath = join(artifactRoot, 'test-first-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ??
  join(artifactRoot, `test-first-${new Date().toISOString().replace(/[:.]/g, '-')}`);
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
    'Not exercised. Native six-table persistence is checked; schema5 backup import/export is covered by separate unit/web tests.',
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

async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}
const newSession = (data) =>
  data.tables.sessions.find(
    (session) =>
      session.courseFlow === 'test-first-v1' &&
      !before.data.tables.sessions.some((old) => old.sessionId === session.sessionId),
  );
async function current() {
  const data = await snapshot();
  const session = newSession(data);
  assert(session);
  return { data, session, step: session.steps[session.currentQuestionIndex] };
}
async function openCourse() {
  await navigate('오늘');
  await page
    .getByRole('button', { name: /^(탐험 이어하기|다음 퀘스트 시작|오늘 퀘스트 시작)/ })
    .click();
  await expect(page.getByTestId('quest-screen')).toBeVisible();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute('data-session-kind', 'course');
}
function assertOldRecords(data) {
  for (const [table, key] of [
    ['attempts', 'attemptId'],
    ['sessions', 'sessionId'],
    ['rewards', 'id'],
  ])
    for (const original of before.data.tables[table])
      assert.deepEqual(
        data.tables[table].find((row) => row[key] === original[key]),
        original,
      );
  assert.deepEqual(data.tables.purchases, before.data.tables.purchases);
  assert.deepEqual(data.tables.settings, before.data.tables.settings);
}
async function answerCurrent(correct, duplicate = false) {
  const { data, session, step } = await current();
  const prior = data.tables.attempts.find(
    (row) =>
      row.sessionId === session.sessionId &&
      row.questionId === (step.retestOf ?? step.id) &&
      row.firstTry === !step.retestOf,
  );
  if (prior) return prior;
  assert.equal(step.kind, 'question');
  await expect(page.locator('.answer-feedback')).toHaveCount(0);
  if (step.choices) {
    await expect(page.getByRole('radio')).toHaveCount(4);
    await page
      .getByRole('radio')
      .nth(correct ? step.correctIndex : (step.correctIndex + 1) % 4)
      .check();
  } else await page.locator('.recall-input').fill(correct ? step.acceptedAnswers[0] : 'wrong');
  if (duplicate) await page.getByRole('button', { name: '정답 확인', exact: true }).dblclick();
  else await page.getByRole('button', { name: '정답 확인', exact: true }).click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
  const after = await snapshot();
  const attempts = after.tables.attempts.filter(
    (row) =>
      row.sessionId === session.sessionId &&
      row.questionId === (step.retestOf ?? step.id) &&
      row.firstTry === !step.retestOf,
  );
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].isCorrect, correct);
  if (!correct)
    await expect(page.getByRole('button', { name: '한 번 더 도전', exact: true })).toHaveCount(0);
  if (step.retestOf) assert.equal(earned(after) - earned(data), correct ? 3 : 0);
  return attempts[0];
}
async function advance(duplicate = false) {
  const { session } = await current();
  const beforeIndex = session.currentQuestionIndex;
  const button = page.getByRole('button', { name: '다음으로', exact: true });
  if (duplicate) await button.dblclick();
  else await button.click();
  await expect
    .poll(async () => (await current()).session.currentQuestionIndex)
    .toBe(beforeIndex + 1);
}
function assertFinal(data) {
  assertOldRecords(data);
  const session = newSession(data);
  assert(session);
  assert.equal(data.version, 30);
  assert.equal(data.tables.sessions.length, 7);
  assert.equal(data.tables.attempts.length, 101);
  assert.equal(session.status, 'completed');
  assert.equal(session.steps.length, 31);
  assert.equal(session.currentQuestionIndex, 31);
  assert.equal(session.planId, 'course:suneung-2000:stage:002');
  const original = session.steps.slice(5, 25);
  assert.equal(original.length, 20);
  assert(original.every((step) => step.kind === 'question' && step.phase === 'vocab'));
  assert.deepEqual(
    session.retestQuestionIds,
    original.slice(0, 2).map((step) => step.id),
  );
  const attempts = data.tables.attempts.filter((row) => row.sessionId === session.sessionId);
  assert.equal(attempts.filter((row) => row.firstTry).length, 29);
  assert.equal(attempts.filter((row) => row.firstTry && !row.isCorrect).length, 2);
  const tail = attempts.filter((row) => !row.firstTry);
  assert.equal(tail.length, 2);
  assert.equal(tail.filter((row) => row.isCorrect).length, 1);
  const rewards = data.tables.rewards.filter((row) => row.sessionId === session.sessionId);
  assert.deepEqual(
    rewards
      .filter((row) => row.kind === 'retry')
      .map((row) => ({ questionId: row.questionId, xp: row.xp })),
    [{ questionId: original[0].id, xp: 3 }],
  );
  assert(!rewards.some((row) => row.questionId?.endsWith(':retest')));
  const bonus = before.data.tables.rewards.some(
    (row) => row.kind === 'completion' && row.localDay === session.completedDay,
  )
    ? 0
    : 30;
  assert.equal(
    rewards.filter((row) => row.kind === 'completion').reduce((sum, row) => sum + row.xp, 0),
    bonus,
  );
  assert.equal(
    session.xpAwarded,
    rewards.reduce((sum, row) => sum + row.xp, 0),
  );
  assert.equal(earned(data), earned(before.data) + session.xpAwarded);
  assert.equal(spent(data), 580);
  return session;
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.7.0');
    await restart();
    const data = await snapshot();
    const old = JSON.parse(
      await readFile(join(artifactRoot, 'native-backgrounds-results.json'), 'utf8'),
    );
    assert.deepEqual(
      data,
      JSON.parse(
        await readFile(join(old.artifactDirectory, 'final-six-table-snapshot.json'), 'utf8'),
      ),
    );
    assert.equal(earned(data), 735);
    assert.equal(spent(data), 580);
    assert.equal(data.tables.sessions.length, 6);
    assert.equal(data.tables.attempts.length, 70);
    const baseline = { directory, packageVersion: '0.7.0', apkSha256: await installedHash(), data };
    await save('before-upgrade', baseline);
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    await screenshot('01-before-upgrade');
    passed(
      'Untouched 0.7 baseline exactly matches all six prior tables: 735 earned / 580 spent / 155 available XP',
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
    assert.equal(report.packageVersion, '0.8.0');
    report.apkSha256 = await installedHash();
    if (report.inputApkSha256) assert.equal(report.apkSha256, report.inputApkSha256);
    if (arg('--expected-sha256')) assert.equal(report.apkSha256, arg('--expected-sha256'));
    await restart();
    const initial = await snapshot();
    if (!newSession(initial)) {
      assert.deepEqual(initial, before.data);
      await save('after-upgrade', initial);
    } else
      assert.deepEqual(
        JSON.parse(await readFile(join(directory, 'after-upgrade.json'), 'utf8')),
        before.data,
      );
    passed(
      'In-place 0.7 -> 0.8 preserves all six original tables including purchases and equipped room',
    );
    assert.equal(
      await page.evaluate(async () =>
        navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      ),
      0,
    );
    if (!verify && newSession(initial)?.status !== 'completed') {
      await openCourse();
      let state = await current();
      assert.equal(state.session.courseFlow, 'test-first-v1');
      assert.equal(state.session.planId, 'course:suneung-2000:stage:002');
      assert.equal(
        state.session.steps.slice(0, 29).filter((step) => step.kind === 'study').length,
        0,
      );
      assert.equal(
        state.session.steps
          .slice(5, 25)
          .filter((step) => step.phase === 'vocab' && step.kind === 'question').length,
        20,
      );
      const originals = structuredClone(state.session.steps.slice(0, 29));
      while (state.session.currentQuestionIndex < 29) {
        const index = state.session.currentQuestionIndex;
        assert.equal(state.session.steps.length, 29);
        assert.equal(state.session.retestQuestionIds, undefined);
        if (index >= 5 && index < 25) {
          await expect(page.getByTestId('test-first-word')).toBeVisible();
          await expect(page.getByTestId('study-card')).toHaveCount(0);
        }
        if (index === 5) await screenshot('02-vocabulary-test-before-answer');
        await answerCurrent(index !== 5 && index !== 6, index === 5);
        if (index === 5) await screenshot('03-first-wrong-feedback-without-immediate-retry');
        if (index === 28) {
          const answered = await current();
          assert.equal(answered.session.retestQuestionIds, undefined);
          assert.equal(
            answered.data.tables.rewards.filter(
              (row) => row.sessionId === answered.session.sessionId && row.kind === 'completion',
            ).length,
            0,
          );
          await save('before-tail-append', answered.data);
        }
        await advance(index === 28);
        state = await current();
      }
      assert.deepEqual(state.session.retestQuestionIds, [originals[5].id, originals[6].id]);
      assert.equal(state.session.steps.length, 31);
      await save('fixed-tail', state.data);
      passed(
        'Five memory questions and twenty vocabulary MCQs precede syntax/reading; only the two initial vocabulary mistakes append once after reading',
      );
      const queue = structuredClone(state.session.steps);
      if (state.session.currentQuestionIndex === 29) {
        assert.notEqual(state.step.correctIndex, originals[5].correctIndex);
        await answerCurrent(true, true);
        await screenshot('04-first-retest-correct');
        const mid = await snapshot();
        await save('answered-mid-tail', mid);
        await restart();
        assert.deepEqual(await snapshot(), mid);
        await openCourse();
        state = await current();
        assert.equal(state.session.currentQuestionIndex, 29);
        assert.deepEqual(state.session.steps, queue);
        await expect(page.locator('.answer-feedback')).toContainText('잘 떠올렸어요');
        await advance();
        state = await current();
      }
      assert.equal(state.session.currentQuestionIndex, 30);
      assert.deepEqual(state.session.steps, queue);
      await answerCurrent(false, true);
      await expect(page.getByRole('button', { name: '한 번 더 도전', exact: true })).toHaveCount(0);
      await advance(true);
      await expect(page.getByTestId('quest-completion')).toBeVisible();
      await expect(page.getByTestId('retest-summary')).toContainText(
        '오답 2단어 다시 도전 · 1개 정답',
      );
      await expect(page.locator('.reward-words')).toContainText('20');
      await screenshot('05-completed-test-first-lesson');
      passed(
        'Rotated retest correct answer earns only the original retry +3; wrong second retest earns 0; double taps and mid-tail relaunch preserve one fixed queue',
      );
    }
    const final = await snapshot();
    const session = assertFinal(final);
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
    await expect(page.getByTestId('room-balance')).toContainText(
      String(earned(final) - spent(final)),
    );
    await expect(page.getByText('최대 +96 XP', { exact: true })).toBeVisible();
    await page.getByTestId('avatar-room-scene').scrollIntoViewIfNeeded();
    await screenshot('06-final-offline-room');
    await navigate('설정');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    report.finalCounts = {
      tables: 6,
      databaseVersion: final.version,
      sessions: final.tables.sessions.length,
      attempts: final.tables.attempts.length,
      purchases: final.tables.purchases.length,
      earnedXp: earned(final),
      spentXp: spent(final),
      availableXp: earned(final) - spent(final),
      newSessionXp: session.xpAwarded,
      firstAttemptXp: final.tables.rewards
        .filter((reward) => reward.sessionId === session.sessionId && reward.kind === 'first')
        .reduce((sum, reward) => sum + reward.xp, 0),
      completionBonusXp: final.tables.rewards
        .filter((reward) => reward.sessionId === session.sessionId && reward.kind === 'completion')
        .reduce((sum, reward) => sum + reward.xp, 0),
      retestRetryXp: 3,
      retestCount: 2,
      courseFlow: session.courseFlow,
      room: final.tables.settings[0].room,
      avatar: final.tables.settings[0].avatarId,
      selectedCourse: final.tables.settings[0].selectedWordbookId,
    };
    passed(
      'Completion bonus is awarded at the final tail at most once; old earnings/receipts remain immutable and offline relaunch preserves the completed 31-step session',
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
      prepare ? 'native-test-first-prepare-results.json' : 'native-test-first-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native test-first ${report.status}: ${directory}`);
}
