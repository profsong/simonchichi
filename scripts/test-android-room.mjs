// Native in-place 0.5.0 -> 0.6.0 room/review regression. Never clears application data.
// Use --prepare on 0.5.0, then --apk <file> [--expected-sha256 <hash>].
// --verify only verifies the completed run; it never creates extra review sessions.
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

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const prepare = process.argv.includes('--prepare');
const verify = process.argv.includes('--verify');
if (process.argv.includes('--help')) {
  console.log(
    'Set ANDROID_HOME and ANDROID_SERIAL. Boot the existing AVD without wiping data. Enable airplane mode and disable Wi-Fi/mobile data. Run --prepare on installed 0.5.0, then --apk <0.6.0.apk> --expected-sha256 <hash>. --verify repeats final assertions without earning more XP. No native document-picker interaction.',
  );
  process.exit(0);
}
assert(prepare || verify || arg('--apk'), 'Use --prepare, --apk <file>, or --verify.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME.');
const execute = promisify(execFile);
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifactRoot = join(root, 'artifacts', 'android');
const baselinePath = join(artifactRoot, 'room-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ?? join(artifactRoot, `room-${new Date().toISOString().replace(/[:.]/g, '-')}`);
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
    'Not exercised. All six IndexedDB tables are captured read-only; backup v4 behavior is covered by separate unit/web tests.',
};
let browser, page;
const save = (name, data) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(data, null, 2));
const load = async (name) => JSON.parse(await readFile(join(directory, `${name}.json`), 'utf8'));
const passed = (name, details) => {
  report.checks.push({ name, status: 'passed', ...(details ? { details } : {}) });
  console.log(`PASS: ${name}`);
};
async function adb(...args) {
  const result = await execute(
    adbPath,
    [...(process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []), ...args],
    { encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
  return result.stdout.trim();
}
const version = async () =>
  (await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app')).match(
    /versionName=([^\s]+)/,
  )?.[1];
async function installedHash() {
  const installed = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
    .split(/\r?\n/)
    .find((path) => path.endsWith('/base.apk'))
    ?.replace(/^package:/, '');
  assert(installed);
  return (await adb('shell', 'sha256sum', installed)).split(/\s+/)[0];
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
  for (let attempt = 0; attempt < 40; attempt++) {
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
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => report.pageErrors.push(String(error)));
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
  // Match the persisted baseline's JSON representation. IndexedDB can retain
  // optional own-properties whose value is undefined; JSON artifacts omit them.
  return JSON.parse(JSON.stringify(data));
}
async function screenshot(name) {
  if (!page) return;
  await delay(400);
  const result = await execute(
    adbPath,
    [
      ...(process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []),
      'exec-out',
      'screencap',
      '-p',
    ],
    { encoding: 'buffer', timeout: 25_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  await writeFile(join(directory, `${name}.png`), result.stdout);
}
const earned = (data) => data.tables.rewards.reduce((sum, row) => sum + row.xp, 0);
const spent = (data) => (data.tables.purchases ?? []).reduce((sum, row) => sum + row.price, 0);
const balance = (data) => earned(data) - spent(data);
async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}
function assertFiveTablesExactly(data) {
  for (const [name, rows] of Object.entries(before.data.tables))
    assert.deepEqual(data.tables[name], rows, `Old table ${name} changed during schema upgrade`);
}
function assertLegacyRows(data, includeReviews = false) {
  for (const [name, key] of [
    ['attempts', 'attemptId'],
    ['sessions', 'sessionId'],
    ['rewards', 'id'],
    ...(includeReviews ? [['reviews', 'entityId']] : []),
  ]) {
    for (const original of before.data.tables[name])
      assert.deepEqual(
        data.tables[name].find((row) => row[key] === original[key]),
        original,
        `Original ${name}/${original[key]} changed`,
      );
  }
  for (const [key, value] of Object.entries(before.data.tables.settings[0]))
    assert.deepEqual(data.tables.settings[0][key], value, `Old preference ${key} changed`);
}
async function assertScene(selection) {
  const scene = page.getByTestId('avatar-room-scene');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('data-avatar-id', 'sipompurin');
  for (const [key, value] of Object.entries(selection))
    await expect(scene).toHaveAttribute(`data-${key.replace('Id', '-id')}`, value);
  const bounds = await scene.boundingBox();
  assert(Math.abs(bounds.width - bounds.height) < 1);
  return bounds;
}
const equipped = {
  backgroundId: 'sky-garden',
  outfitId: 'blue-hoodie',
  accessoryId: 'round-glasses',
};
const newReviews = (data) =>
  data.tables.sessions
    .filter(
      (session) =>
        session.sessionKind === 'review-test' &&
        session.rewardPolicy &&
        !before.data.tables.sessions.some((old) => old.sessionId === session.sessionId),
    )
    .sort((a, b) => (a.createdAt ?? a.updatedAt).localeCompare(b.createdAt ?? b.updatedAt));
async function shop() {
  await navigate('복습함');
  await page.getByRole('button', { name: '방 꾸미기', exact: true }).click();
  await expect(page.getByTestId('room-shop')).toBeVisible();
}
async function choose(category, itemId, duplicate = false) {
  await page.getByRole('tab', { name: category, exact: true }).click();
  const card = page.locator(`[data-testid="room-item"][data-item-id="${itemId}"]`);
  if ((await card.getAttribute('data-equipped')) !== 'true') {
    if (duplicate) await card.getByRole('button').dblclick();
    else await card.getByRole('button').click();
  }
  await expect(card).toHaveAttribute('data-equipped', 'true');
}
async function openReview() {
  await navigate('복습함');
  await page
    .getByRole('button', { name: /^(10단어 복습 테스트 시작|복습 테스트 이어하기)/ })
    .click();
  await expect(page.getByTestId('quest-screen')).toHaveAttribute(
    'data-session-kind',
    'review-test',
  );
}
async function currentSession() {
  const id = await page.getByTestId('quest-screen').getAttribute('data-session-id');
  const data = await snapshot();
  const session = data.tables.sessions.find((row) => row.sessionId === id);
  assert(session);
  return { data, session, step: session.steps[session.currentQuestionIndex] };
}
async function answerCurrent(duplicate) {
  const { data, session, step } = await currentSession();
  if (
    data.tables.attempts.some(
      (row) => row.sessionId === session.sessionId && row.questionId === step.id,
    )
  )
    return;
  if (step.choices) await page.getByRole('radio').nth(step.correctIndex).check();
  else {
    await expect(page.getByTestId('recall-first-letter')).toBeVisible();
    await page.locator('.recall-input').fill(step.acceptedAnswers[0]);
  }
  if (duplicate) await page.getByRole('button', { name: '정답 확인', exact: true }).dblclick();
  else await page.getByRole('button', { name: '정답 확인', exact: true }).click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
  const after = await snapshot();
  assert.equal(
    after.tables.attempts.filter(
      (row) => row.sessionId === session.sessionId && row.questionId === step.id,
    ).length,
    1,
  );
  assert.equal(earned(after), earned(data), 'A review question must not produce per-question XP');
}
async function finishReview(sessionId) {
  for (let iteration = 0; iteration < 11; iteration++) {
    if (await page.getByTestId('quest-completion').count()) return;
    const { session } = await currentSession();
    assert.equal(session.sessionId, sessionId);
    await answerCurrent(session.currentQuestionIndex === 0);
    const last = session.currentQuestionIndex === session.steps.length - 1;
    const button = page.getByRole('button', { name: '다음으로', exact: true });
    if (last) await button.dblclick();
    else await button.click();
    if (last) {
      await expect(page.getByTestId('quest-completion')).toBeVisible();
      return;
    }
    await expect(page.getByTestId('quest-screen')).toHaveAttribute(
      'data-question-id',
      session.steps[session.currentQuestionIndex + 1].id,
    );
  }
  throw new Error('Review exceeded 10 questions');
}
function assertFinal(data) {
  assertLegacyRows(data);
  assert.equal(data.version, 30, 'Dexie schema v3 is IndexedDB version 30');
  assert.equal(data.tables.purchases.length, 3);
  assert.equal(spent(data), 380);
  assert.deepEqual(data.tables.settings[0].room, equipped);
  const sessions = newReviews(data);
  assert.equal(sessions.length, 2);
  assert.equal(new Set(sessions.map((session) => session.sessionId)).size, 2);
  for (const session of sessions) {
    assert.equal(session.status, 'completed');
    assert.equal(session.rewardPolicy.maxXp, 96);
    assert.equal(session.rewardPolicy.questMaxXp, 320);
    assert.equal(session.xpAwarded, 96);
    assert.equal(session.steps.length, 10);
    assert.equal(new Set(session.steps.map((step) => step.entityId)).size, 10);
    const attempts = data.tables.attempts.filter((row) => row.sessionId === session.sessionId);
    assert.equal(attempts.length, 10);
    assert(attempts.every((row) => row.firstTry && row.isCorrect));
    assert.equal(attempts.filter((row) => row.mode === 'recall' && row.usedHint).length, 5);
    const rewards = data.tables.rewards.filter((row) => row.sessionId === session.sessionId);
    assert.equal(rewards.length, 1);
    assert.equal(rewards[0].kind, 'review');
    assert.equal(rewards[0].xp, 96);
  }
  assert.equal(data.tables.sessions.length, 6);
  assert.equal(data.tables.attempts.length, 70);
  assert.equal(earned(data), 735);
  assert.equal(balance(data), 355);
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.5.0');
    await restart();
    const data = await snapshot();
    assert.equal(data.version, 20);
    assert.equal(data.tables.sessions.length, 4);
    assert.equal(data.tables.attempts.length, 50);
    assert.equal(earned(data), 543);
    assert.equal(data.tables.settings[0].avatarId, 'sipompurin');
    assert.equal(data.tables.settings[0].selectedWordbookId, 'suneung-2000');
    assert(!data.tables.purchases);
    const baseline = { directory, packageVersion: '0.5.0', apkSha256: await installedHash(), data };
    await save('before-upgrade', baseline);
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    await screenshot('01-before-upgrade');
    passed(
      'Untouched offline 0.5.0 baseline captured: 5 tables, 4 sessions, 50 attempts, 543 XP, sipompurin, suneung selected',
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
    report.packageVersion = await version();
    assert.equal(report.packageVersion, '0.6.0');
    report.apkSha256 = await installedHash();
    if (report.inputApkSha256) assert.equal(report.apkSha256, report.inputApkSha256);
    if (arg('--expected-sha256'))
      assert.equal(report.apkSha256, arg('--expected-sha256').toLowerCase());
    await restart();
    const initial = await snapshot();
    assert.equal(initial.version, 30);
    if (!initial.tables.purchases.length && !newReviews(initial).length) {
      assertFiveTablesExactly(initial);
      await save('after-upgrade', initial);
      passed(
        '0.5 to 0.6 migration preserves all five original tables exactly; only an empty purchases table and schema v3 are added',
      );
      await navigate('복습함');
      report.initialSceneBounds = await assertScene({
        backgroundId: 'mint-room',
        outfitId: 'original',
        accessoryId: 'none',
      });
      await screenshot('02-default-room');
    } else {
      const migration = await load('after-upgrade');
      assertFiveTablesExactly(migration);
      assert.equal(migration.tables.purchases.length, 0);
      passed('Saved migration evidence still proves exact preservation of the five old tables');
    }
    assert.equal(
      await page.evaluate(async () =>
        navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      ),
      0,
    );
    if (!verify) {
      await shop();
      await choose('배경', 'sky-garden', true);
      await choose('옷', 'blue-hoodie', true);
      await choose('액세서리', 'round-glasses', true);
      const purchased = await snapshot();
      assertLegacyRows(purchased, newReviews(purchased).length === 0);
      assert.equal(purchased.tables.purchases.length, 3);
      assert.equal(spent(purchased), 380);
      assert.deepEqual(purchased.tables.settings[0].room, equipped);
      if (!newReviews(purchased).length) {
        assert.equal(earned(purchased), 543);
        assert.equal(balance(purchased), 163);
      }
      await choose('옷', 'original');
      await choose('옷', 'blue-hoodie', true);
      const reequipped = await snapshot();
      assert.deepEqual(reequipped.tables.purchases, purchased.tables.purchases);
      assert.deepEqual(reequipped.tables.rewards, purchased.tables.rewards);
      await screenshot('03-purchased-outfit');
      await page.getByRole('button', { name: '꾸미기 닫기', exact: true }).click();
      await assertScene(equipped);
      await save('after-purchases', reequipped);
      await screenshot('04-equipped-room');
      await restart();
      assert.deepEqual(await snapshot(), reequipped);
      await navigate('복습함');
      await assertScene(equipped);
      passed(
        'Three purchases total 380 XP; earned XP unchanged; duplicate purchase and owned free re-equip preserve receipts; offline relaunch retains room',
      );

      for (let round = 0; round < 2; round++) {
        const existing = newReviews(await snapshot())[round];
        if (existing?.status === 'completed') continue;
        await openReview();
        let current = await currentSession();
        const session = current.session;
        assert.equal(session.rewardPolicy.maxXp, 96);
        assert.equal(session.rewardPolicy.questMaxXp, 320);
        assert.equal(session.steps.length, 10);
        assert.equal(new Set(session.steps.map((step) => step.entityId)).size, 10);
        const saved = await load(`review-${round + 1}-selection`).catch(() => undefined);
        if (saved) {
          assert.equal(session.sessionId, saved.sessionId);
          assert.deepEqual(session.steps, saved.steps);
        } else
          await save(`review-${round + 1}-selection`, {
            sessionId: session.sessionId,
            steps: session.steps,
            rewardPolicy: session.rewardPolicy,
          });
        const priorXp = earned(current.data);
        if (round === 0 && current.session.currentQuestionIndex === 0) {
          await answerCurrent(true);
          const submitted = await snapshot();
          assert.equal(earned(submitted), priorXp);
          await restart();
          await openReview();
          current = await currentSession();
          assert.equal(current.session.sessionId, session.sessionId);
          assert.deepEqual(current.session.steps, session.steps);
          assert.deepEqual(await snapshot(), submitted);
          await expect(page.locator('.answer-feedback')).toBeVisible();
          passed(
            'Double answer submission creates one attempt and zero immediate XP; force-stop resumes the same immutable ten-word snapshot',
          );
        }
        await finishReview(session.sessionId);
        const completed = await snapshot();
        assert.equal(earned(completed), priorXp + 96);
        assert.equal(
          completed.tables.rewards.filter((row) => row.sessionId === session.sessionId).length,
          1,
        );
        await expect(page.getByTestId('review-reward-summary')).toContainText('10 / 10개 첫 정답');
        await expect(page.getByTestId('review-reward-summary')).toContainText('+96 XP');
        await screenshot(`05-review-${round + 1}-completed`);
        await save(`review-${round + 1}-completed`, completed);
        await restart();
        assert.deepEqual(await snapshot(), completed);
        passed(
          `Review round ${round + 1} earns exactly 96 XP once on completion; final double tap and relaunch add nothing`,
        );
      }
    }
    const final = await snapshot();
    assertFinal(final);
    for (let round = 0; round < 2; round++) {
      const saved = await load(`review-${round + 1}-selection`);
      const stored = newReviews(final)[round];
      assert.equal(stored.sessionId, saved.sessionId);
      assert.deepEqual(stored.steps, saved.steps);
      assert.deepEqual(stored.rewardPolicy, saved.rewardPolicy);
    }
    await save('final-six-table-snapshot', final);
    await restart();
    assert.deepEqual(await snapshot(), final);
    await navigate('복습함');
    await assertScene(equipped);
    await expect(page.getByTestId('room-balance')).toContainText('355');
    await screenshot('06-final-offline-room');
    await navigate('설정');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    report.finalCounts = {
      databaseVersion: final.version,
      tables: Object.keys(final.tables).length,
      sessions: final.tables.sessions.length,
      attempts: final.tables.attempts.length,
      purchases: final.tables.purchases.length,
      earnedXp: earned(final),
      spentXp: spent(final),
      availableXp: balance(final),
      selectedCourse: final.tables.settings[0].selectedWordbookId,
      avatar: final.tables.settings[0].avatarId,
      room: final.tables.settings[0].room,
    };
    passed(
      'Two explicit reviews on the same day are allowed, each has one completion reward; final 735 earned / 380 spent / 355 available XP and all six tables persist',
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
    join(artifactRoot, prepare ? 'native-room-prepare-results.json' : 'native-room-results.json'),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native room ${report.status}: ${directory}`);
}
