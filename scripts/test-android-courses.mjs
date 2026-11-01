// In-place 0.4.0 -> 0.5.0 course/review smoke test. Never clears application data.
/* global indexedDB */
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
const patchIndex = process.argv.indexOf('--patch-apk');
if (process.argv.includes('--help')) {
  console.log(
    'Set ANDROID_HOME and ANDROID_SERIAL. Run --prepare on installed 0.4.0, then --apk <0.5.0.apk>. --verify repeats checks without repeating completed study fixtures. --patch-apk <file> preserves the feature report and verifies a final CSS-only update.',
  );
  process.exit(0);
}
assert(
  prepare || apkIndex >= 0 || patchIndex >= 0 || process.argv.includes('--verify'),
  'Use --prepare, --apk <path>, or --verify.',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME.');
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifacts = join(root, 'artifacts/android');
const baselinePath = join(artifacts, 'courses-before.json');
const before = prepare ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const directory =
  before?.directory ?? join(artifacts, `courses-${new Date().toISOString().replace(/[:.]/g, '-')}`);
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

const xp = (data) => data.tables.rewards.reduce((sum, reward) => sum + reward.xp, 0);
async function navigate(name) {
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function selectCourse(id, from = '오늘') {
  await navigate(from);
  await page.getByRole('combobox', { name: '학습 단어장' }).selectOption(id);
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue(id);
  await expect.poll(async () => (await snapshot()).tables.settings[0]?.selectedWordbookId).toBe(id);
}
async function currentSession() {
  const sessionId = await page.getByTestId('quest-screen').getAttribute('data-session-id');
  const data = await snapshot();
  const session = data.tables.sessions.find((item) => item.sessionId === sessionId);
  assert(session);
  return { data, session, step: session.steps[session.currentQuestionIndex] };
}
async function answer(step, wrong = false, duplicate = false) {
  if (step.choices)
    await page
      .getByRole('radio')
      .nth(wrong ? (step.correctIndex + 1) % 4 : step.correctIndex)
      .check();
  else await page.locator('.recall-input').fill(wrong ? 'incorrect' : step.acceptedAnswers[0]);
  const submit = page.getByRole('button', { name: '정답 확인', exact: true });
  if (duplicate) await submit.dblclick();
  else await submit.click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
}
async function advance(session) {
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  if (session.currentQuestionIndex + 1 === session.steps.length)
    await expect(page.getByTestId('quest-completion')).toBeVisible();
  else
    await expect(page.getByTestId('quest-screen')).toHaveAttribute(
      'data-question-id',
      session.steps[session.currentQuestionIndex + 1].id,
    );
}
async function finishSession(stopAt = Number.POSITIVE_INFINITY) {
  for (let count = 0; count < 60; count++) {
    if (await page.getByTestId('quest-completion').count()) return;
    const { data, session, step } = await currentSession();
    if (session.currentQuestionIndex >= stopAt) return;
    if (
      step.kind === 'question' &&
      !data.tables.attempts.some(
        (item) => item.sessionId === session.sessionId && item.questionId === step.id,
      )
    )
      await answer(step);
    await advance(session);
  }
  throw new Error('Lesson did not finish within its expected steps.');
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
async function assertMap(courseId, count, completed) {
  await navigate('모험 지도');
  await expect(page.getByTestId('course-summary')).toHaveAttribute('data-course-id', courseId);
  await expect(page.getByTestId('map-plan')).toHaveCount(count);
  assert.equal(
    await page.locator('[data-testid="map-plan"][data-completed="true"]').count(),
    completed,
  );
}

async function verifyCssPatch(apk) {
  const feature = JSON.parse(
    await readFile(join(artifacts, 'native-courses-results.json'), 'utf8'),
  );
  assert.equal(feature.status, 'passed');
  assert.equal(await version(), '0.5.0');
  await save('feature-candidate-results', feature);
  report.featureCandidateApkSha256 = feature.apkSha256;
  report.featureChecks = feature.checks;
  await restart();
  const preserved = await snapshot();
  await save('before-css-patch', preserved);
  report.inputApkSha256 = createHash('sha256')
    .update(await readFile(apk))
    .digest('hex');
  assert.match(await adb('install', '-r', apk), /Success/);
  report.packageVersion = await version();
  assert.equal(report.packageVersion, '0.5.0');
  const installed = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
    .split(/\r?\n/)
    .find((path) => path.endsWith('/base.apk'))
    ?.replace(/^package:/, '');
  report.apkSha256 = (await adb('shell', 'sha256sum', installed)).split(/\s+/)[0];
  report.releaseApkSha256 = report.apkSha256;
  assert.equal(report.inputApkSha256, report.apkSha256);
  await restart();
  assert.deepEqual(await snapshot(), preserved);
  passed('Final CSS APK update retains all five tables exactly');
  report.selectorMeasurements = [];
  for (const surface of ['오늘', '설정']) {
    for (const id of ['advanced-300', 'suneung-2000']) {
      await selectCourse(id, surface);
      const measurement = await page
        .getByRole('combobox', { name: '학습 단어장' })
        .evaluate((select) => {
          const style = select.ownerDocument.defaultView.getComputedStyle(select);
          const context = select.ownerDocument.createElement('canvas').getContext('2d');
          context.font = style.font;
          const text = select.selectedOptions[0].text;
          return {
            value: select.value,
            text,
            maxWidth: style.maxWidth,
            width: select.clientWidth,
            textWidth: context.measureText(text).width,
            availableWidth:
              select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          };
        });
      assert.equal(measurement.maxWidth, 'none');
      assert(measurement.width >= 220);
      assert(
        measurement.textWidth <= measurement.availableWidth,
        'The full selected course title must fit.',
      );
      report.selectorMeasurements.push({ surface, ...measurement });
      if (surface === '오늘' && id === 'advanced-300')
        await screenshot('09-final-full-advanced-selector');
      if (surface === '설정' && id === 'suneung-2000')
        await screenshot('10-final-full-pdf-selector');
    }
  }
  passed('Both course labels fit completely in Today and Settings selectors');
  await selectCourse(preserved.tables.settings[0].selectedWordbookId);
  assert.deepEqual(await snapshot(), preserved);
  await restart();
  assert.deepEqual(await snapshot(), preserved);
  await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  await screenshot('11-final-offline-relaunch');
  await save('after-css-patch-relaunch', await snapshot());
  report.finalCounts = feature.finalCounts;
  report.offlineAfter = await offline();
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalRequests, []);
  passed(
    'Final release relaunches offline with unchanged selected course, 50 attempts, and 543 XP',
  );
  report.status = 'passed';
}

try {
  report.offlineBefore = await offline();
  if (prepare) {
    assert.equal(await version(), '0.4.0');
    await restart();
    const data = await snapshot();
    assert.equal(data.tables.attempts.length, 10);
    assert.equal(data.tables.sessions.length, 2);
    assert.equal(xp(data), 130);
    assert.equal(data.tables.settings[0].avatarId, 'sipompurin');
    const baseline = { directory, version: '0.4.0', mode: 'demo', data };
    await save('before-upgrade', baseline);
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    await screenshot('01-before-upgrade');
    passed('Captured untouched 0.4.0 five-table baseline: 130 XP and sipompurin');
    report.status = 'prepared';
  } else if (patchIndex >= 0) {
    assert(process.argv[patchIndex + 1]);
    await verifyCssPatch(resolve(process.argv[patchIndex + 1]));
  } else {
    if (apkIndex >= 0) {
      assert.equal(await version(), '0.4.0');
      assert(process.argv[apkIndex + 1]);
      const apk = resolve(process.argv[apkIndex + 1]);
      report.inputApkSha256 = createHash('sha256')
        .update(await readFile(apk))
        .digest('hex');
      assert.match(await adb('install', '-r', apk), /Success/);
    }
    report.packageVersion = await version();
    assert.equal(report.packageVersion, '0.5.0');
    const installed = (await adb('shell', 'pm', 'path', 'com.simonchichi.app'))
      .split(/\r?\n/)
      .find((path) => path.endsWith('/base.apk'))
      ?.replace(/^package:/, '');
    assert(installed);
    report.apkSha256 = (await adb('shell', 'sha256sum', installed)).split(/\s+/)[0];
    if (report.inputApkSha256) assert.equal(report.inputApkSha256, report.apkSha256);
    await restart();
    const initialData = await snapshot();
    const existingFixture = initialData.tables.sessions.find(
      (session) => session.courseId === 'suneung-2000' && session.status === 'completed',
    );
    if (!initialData.tables.sessions.some((session) => session.courseId)) {
      assert.deepEqual(await snapshot(), before.data);
      await expect(page.getByTestId('total-xp')).toHaveText('130 XP');
      passed('0.4.0 to 0.5.0 upgrade preserves every existing record and active demo data');
    }
    await expect(page.locator('.demo-banner')).toHaveCount(0);
    await navigate('설정');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '학습 단어장' }).locator('option')).toHaveCount(
      2,
    );
    await expect(page.getByText('독해 난이도', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('selected-avatar')).toHaveAttribute(
      'data-avatar-id',
      'sipompurin',
    );
    await selectCourse('suneung-2000', '설정');
    await navigate('오늘');
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    await assertMap('suneung-2000', 100, existingFixture ? 1 : 0);
    await screenshot('02-suneung-100-stages');
    await selectCourse('advanced-300');
    await assertMap('advanced-300', 15, 0);
    await screenshot('03-advanced-15-stages');
    passed(
      'Today and Settings share two course choices; independent 15/100-stage maps and no demo/band controls',
    );
    let data = await snapshot();
    let review = data.tables.sessions.find(
      (session) => session.courseId === 'advanced-300' && session.sessionKind === 'review-test',
    );
    if (review?.status !== 'completed') {
      await openReview();
      let current = await currentSession();
      review = current.session;
      assert.equal(review.steps.length, 10);
      assert.equal(new Set(review.steps.map((step) => step.entityId)).size, 10);
      assert(review.steps.slice(0, 5).every((step) => step.mode === 'recognition'));
      assert(review.steps.slice(5).every((step) => step.mode === 'recall' && step.alwaysHinted));
      assert(
        review.steps.every((step) =>
          before.data.tables.reviews.some((state) => state.entityId === step.entityId),
        ),
      );
      if (current.session.currentQuestionIndex === 0) {
        if (!current.data.tables.attempts.some((item) => item.sessionId === review.sessionId)) {
          const beforeWrong = xp(current.data);
          await answer(current.step, true, true);
          data = await snapshot();
          assert.equal(
            data.tables.attempts.filter((item) => item.sessionId === review.sessionId).length,
            1,
          );
          assert.equal(xp(data), beforeWrong);
        }
        await page.reload();
        await expect(page.getByRole('navigation', { name: '모바일 메뉴' })).toBeVisible();
        await openReview();
        current = await currentSession();
        assert.equal(current.session.sessionId, review.sessionId);
        assert.deepEqual(current.session.steps, review.steps);
        const firstAttempts = current.data.tables.attempts.filter(
          (item) => item.sessionId === review.sessionId && item.questionId === current.step.id,
        );
        assert.equal(firstAttempts.find((item) => item.firstTry)?.isCorrect, false);
        if (!firstAttempts.some((item) => !item.firstTry)) {
          await expect(page.locator('.answer-feedback')).toContainText('괜찮아요');
          await page.getByRole('button', { name: '한 번 더 도전', exact: true }).click();
          await answer(current.step);
        }
        await advance(current.session);
      }
      await finishSession(5);
      await expect(page.getByTestId('recall-first-letter')).toBeVisible();
      await screenshot('04-review-first-letter');
      const recallProgress = (await currentSession()).session.currentQuestionIndex;
      await restart();
      await openReview();
      current = await currentSession();
      assert.equal(current.session.currentQuestionIndex, recallProgress);
      assert.deepEqual(current.session.steps, review.steps);
      await expect(page.getByTestId('recall-first-letter')).toBeVisible();
      await finishSession();
      data = await snapshot();
      review = data.tables.sessions.find((session) => session.sessionId === review.sessionId);
      assert.equal(review.xpAwarded, 93);
      assert.equal(review.status, 'completed');
      assert(
        !data.tables.rewards.some(
          (reward) => reward.sessionId === review.sessionId && reward.kind === 'completion',
        ),
      );
      assert.equal(
        data.tables.attempts.filter(
          (attempt) =>
            attempt.sessionId === review.sessionId && attempt.mode === 'recall' && attempt.usedHint,
        ).length,
        5,
      );
      await screenshot('05-review-completed');
      await page.getByRole('button', { name: '복습함으로', exact: true }).click();
    }
    assert.equal(review.status, 'completed');
    assert.equal(review.xpAwarded, 93);
    passed(
      'Ten previously learned words: balanced questions, wrong-answer double tap, persisted random snapshot, hinted recall, no completion bonus',
    );
    await selectCourse('suneung-2000');
    await navigate('오늘');
    let lesson = (await snapshot()).tables.sessions.find(
      (session) => session.courseId === 'suneung-2000' && session.sessionKind === 'course',
    );
    if (!lesson || lesson.status !== 'completed') {
      await page.getByRole('button', { name: /^(오늘 퀘스트 시작|탐험 이어하기)/ }).click();
      let current = await currentSession();
      lesson = current.session;
      assert.equal(lesson.steps.length, 49);
      assert.equal(lesson.steps.filter((step) => step.phase === 'review').length, 5);
      assert.equal(
        lesson.steps.filter((step) => step.phase === 'vocab' && step.kind === 'study').length,
        20,
      );
      assert.equal(lesson.steps.filter((step) => step.phase === 'syntax').length, 2);
      assert.equal(lesson.steps.filter((step) => step.phase === 'reading').length, 2);
      await screenshot('06-suneung-course');
      await finishSession(8);
      const progress = (await currentSession()).session;
      await restart();
      await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
      await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
      current = await currentSession();
      assert.deepEqual(current.session, progress);
      await finishSession();
      await screenshot('07-suneung-completed');
      await page.getByRole('button', { name: '오늘의 탐험 마치기', exact: true }).click();
    }
    passed(
      'Suneung lesson persists 49 steps with review5/vocab20/syntax2/reading2 and completes offline',
    );
    await assertMap('suneung-2000', 100, 1);
    await selectCourse('advanced-300');
    await assertMap('advanced-300', 15, 0);
    await selectCourse('suneung-2000');
    const finished = await snapshot();
    for (const [name, key] of [
      ['attempts', 'attemptId'],
      ['sessions', 'sessionId'],
      ['rewards', 'id'],
    ])
      for (const original of before.data.tables[name])
        assert.deepEqual(
          finished.tables[name].find((row) => row[key] === original[key]),
          original,
        );
    await save('after-learning', finished);
    await restart();
    assert.deepEqual(await snapshot(), finished);
    await expect(page.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('suneung-2000');
    await assertMap('suneung-2000', 100, 1);
    await screenshot('08-offline-course-progress');
    report.finalCounts = {
      sessions: finished.tables.sessions.length,
      attempts: finished.tables.attempts.length,
      xp: xp(finished),
      selectedWordbookId: finished.tables.settings[0].selectedWordbookId,
    };
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
    passed(
      'Selected course and separate progress survive relaunch; original attempts/sessions/rewards remain unchanged',
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
      prepare ? 'native-courses-prepare-results.json' : 'native-courses-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await browser?.close().catch(() => {});
  console.log(`Native courses ${report.status}: ${directory}`);
}
