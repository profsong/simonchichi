// Two phases retain real 0.1.0 app data: --prepare, then --apk <0.2.0.apk>.
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
  console.log(
    'ANDROID_HOME=<SDK> ANDROID_SERIAL=<device> node scripts/test-android-upgrade.mjs --prepare',
  );
  console.log(
    'Then run with --apk <0.2.0.apk>. Requires the original completed 0.1.0 demo quest; never clears data.',
  );
  process.exit(0);
}
const preparing = process.argv.includes('--prepare');
const apk = process.argv[process.argv.indexOf('--apk') + 1];
assert(preparing || process.argv.includes('--apk'), 'Choose --prepare or --apk <file>.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME or ANDROID_SDK_ROOT.');
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const serialArgs = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
const execute = promisify(execFile);
const expect = playwrightExpect.configure({ timeout: 15_000 });
const artifactRoot = join(root, 'artifacts', 'android');
const baselinePath = join(artifactRoot, 'upgrade-before.json');
const before = preparing ? undefined : JSON.parse(await readFile(baselinePath, 'utf8'));
const runDirectory =
  before?.artifactDirectory ??
  join(artifactRoot, `upgrade-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(runDirectory, { recursive: true });
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  artifactDirectory: runDirectory,
  checks: [],
  pageErrors: [],
};
const seed = JSON.parse(await readFile(join(root, 'src', 'data', 'seed-content.json'), 'utf8'));
const questions = new Map(
  [
    ...seed.vocabularyQuestions,
    ...seed.syntax,
    ...seed.readings.flatMap((item) => item.questions),
  ].map((item) => [item.id, item]),
);
let connection;

async function adb(...args) {
  const { stdout } = await execute(adbPath, [...serialArgs, ...args], {
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}
function passed(name) {
  report.checks.push({ name, status: 'passed' });
  console.log(`PASS: ${name}`);
}
async function offline() {
  const state = {
    airplane: await adb('shell', 'settings', 'get', 'global', 'airplane_mode_on'),
    wifi: await adb('shell', 'settings', 'get', 'global', 'wifi_on'),
    mobile: await adb('shell', 'settings', 'get', 'global', 'mobile_data'),
  };
  assert.equal(state.airplane, '1');
  assert.equal(state.wifi, '0');
  assert.notEqual(state.mobile, '1');
  return state;
}
async function packageVersion() {
  const dump = await adb('shell', 'dumpsys', 'package', 'com.simonchichi.app');
  return {
    name: dump.match(/versionName=([^\s]+)/)?.[1],
    code: Number(dump.match(/versionCode=(\d+)/)?.[1]),
  };
}
async function connect() {
  let error;
  for (let retry = 0; retry < 40; retry++) {
    let browser;
    try {
      const pid = await adb('shell', 'pidof', 'com.simonchichi.app');
      assert.match(pid, /^\d+$/);
      await adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', {
        noDefaults: true,
        timeout: 3000,
      });
      const page = browser
        .contexts()[0]
        ?.pages()
        .find((item) => /^https?:\/\/localhost(?:\/|$)/.test(item.url()));
      assert(page);
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (item) => report.pageErrors.push(String(item)));
      return { browser, page };
    } catch (caught) {
      error = caught;
      await browser?.close().catch(() => {});
      await delay(500);
    }
  }
  throw error;
}
async function restart() {
  await connection?.browser.close().catch(() => {});
  await adb('shell', 'am', 'force-stop', 'com.simonchichi.app');
  await adb('shell', 'am', 'start', '-W', '-n', 'com.simonchichi.app/.MainActivity');
  connection = await connect();
  await expect(connection.page.locator('.demo-banner')).toBeVisible();
  return connection.page;
}
const nav = (page) => page.getByRole('navigation', { name: '모바일 메뉴' });
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('english-quest-demo');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['attempts', 'reviews', 'sessions', 'rewards', 'settings'];
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
}
async function saveJson(name, value) {
  await writeFile(join(runDirectory, `${name}.json`), JSON.stringify(value, null, 2));
}
async function screenshot(name) {
  await delay(400);
  const { stdout } = await execute(adbPath, [...serialArgs, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  await writeFile(join(runDirectory, `${name}.png`), stdout);
}
async function finishQuest(page) {
  for (let count = 0; count < 40; count++) {
    if (await page.getByTestId('quest-completion').isVisible()) return;
    const screen = page.getByTestId('quest-screen');
    await expect(screen).toBeVisible();
    const id = await screen.getAttribute('data-question-id');
    const state = await snapshot(page);
    const step = state.tables.sessions
      .find((session) => session.status === 'in_progress')
      ?.steps.find((item) => item.id === id);
    assert(step, `Missing current step ${id}`);
    if (
      step.kind === 'question' &&
      (await page.getByRole('button', { name: '정답 확인', exact: true }).isVisible())
    ) {
      if (step.choices) {
        const question = questions.get(step.id);
        assert(question, `Missing authored question ${id}`);
        assert.deepEqual(step.choices, question.choices);
        assert.equal(step.correctIndex, question.correctIndex);
        await page.getByRole('radio').nth(question.correctIndex).check();
      } else {
        const word = seed.vocabulary.find((item) => item.id === step.entityId);
        assert(word);
        await page.getByRole('textbox').fill(word.acceptedAnswers[0]);
      }
      await page.getByRole('button', { name: '정답 확인', exact: true }).click();
      await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '다음으로', exact: true }).click();
    await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
  }
  throw new Error('Quest did not complete within 40 steps.');
}

try {
  report.offlineBefore = await offline();
  if (preparing) {
    report.package = await packageVersion();
    assert.equal(report.package.name, '0.1.0');
    let page = await restart();
    await nav(page).getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toBeChecked();
    await saveJson('original-before-avatar', await snapshot(page));
    await page.getByRole('radio', { name: '모모', exact: true }).click();
    await expect(page.getByRole('radio', { name: '모모', exact: true })).toBeChecked();
    await expect.poll(async () => (await snapshot(page)).tables.settings[0]?.avatarId).toBe('momo');
    const baseline = await snapshot(page);
    assert.equal(baseline.version, 10);
    assert.equal(baseline.tables.attempts.length, 5);
    assert.equal(baseline.tables.sessions.length, 1);
    assert.equal(baseline.tables.sessions[0].status, 'completed');
    assert.equal(
      baseline.tables.rewards.reduce((sum, item) => sum + item.xp, 0),
      80,
    );
    await screenshot('01-old-momo');
    const saved = {
      ...baseline,
      package: report.package,
      mode: 'demo',
      artifactDirectory: runDirectory,
      capturedAt: new Date().toISOString(),
    };
    await saveJson('before-upgrade', saved);
    await writeFile(baselinePath, JSON.stringify(saved, null, 2));
    passed('Original 0.1.0 offline records captured with legacy momo avatar, 5 attempts and 80 XP');
    report.status = 'prepared';
  } else {
    assert.equal(
      (await packageVersion()).name,
      '0.1.0',
      'Upgrade test must start from the original installed APK.',
    );
    await adb('shell', 'am', 'force-stop', 'com.simonchichi.app');
    const installed = await adb('install', '-r', resolve(apk));
    assert.match(installed, /Success/);
    report.package = await packageVersion();
    assert.deepEqual(report.package, { name: '0.2.0', code: 2 });
    let page = await restart();
    await nav(page).getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toBeChecked();
    await expect(page.getByRole('radio', { name: '시치와레', exact: true })).toBeChecked();
    await expect(page.getByTestId('selected-avatar')).toHaveAttribute(
      'data-avatar-id',
      'sichiware',
    );
    const migrated = await snapshot(page);
    assert.equal(migrated.version, 20);
    assert.deepEqual(migrated.tables, before.tables, 'Every v1 record must survive unchanged.');
    await saveJson('after-upgrade', migrated);
    await screenshot('02-migrated-sichiware');
    passed(
      'APK replacement migrates IndexedDB v1 to v2 with all five tables identical; demo and legacy momo selection survive',
    );

    await nav(page).getByRole('button', { name: '오늘', exact: true }).click();
    await page.getByRole('button', { name: '다음 퀘스트 시작', exact: true }).dblclick();
    await expect(page.getByTestId('quest-screen')).toBeVisible();
    const started = await snapshot(page);
    assert.equal(started.tables.sessions.length, 2);
    const extra = started.tables.sessions.find(
      (item) => item.sessionId !== before.tables.sessions[0].sessionId,
    );
    assert.equal(extra.planId, 'w01-d2');
    assert.equal(extra.localDay, before.tables.sessions[0].localDay);
    assert.equal(extra.status, 'in_progress');
    await saveJson('extra-started', started);
    await screenshot('03-extra-quest');
    passed('Repeated next-quest tap creates exactly one same-day w01-d2 session');

    await finishQuest(page);
    await expect(page.getByText('한 걸음 더 전진했어요!', { exact: true })).toBeVisible();
    const completed = await snapshot(page);
    assert.equal(completed.tables.sessions.filter((item) => item.status === 'completed').length, 2);
    assert.equal(completed.tables.attempts.length, 10);
    assert.equal(completed.tables.rewards.filter((item) => item.kind === 'completion').length, 1);
    assert.equal(
      completed.tables.rewards.reduce((sum, item) => sum + item.xp, 0),
      130,
    );
    assert.deepEqual(
      completed.tables.sessions.find(
        (item) => item.sessionId === before.tables.sessions[0].sessionId,
      ),
      before.tables.sessions[0],
    );
    await saveJson('extra-completed', completed);
    await screenshot('04-extra-completed');
    passed('Extra quest completes with 130 total XP and one daily completion bonus');

    page = await restart();
    assert.deepEqual(await snapshot(page), completed);
    await nav(page).getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('radio', { name: '시폼푸린', exact: true }).click();
    await expect(page.getByRole('radio', { name: '시폼푸린', exact: true })).toBeChecked();
    await expect
      .poll(async () => (await snapshot(page)).tables.settings[0]?.avatarId)
      .toBe('sipompurin');
    const selected = await snapshot(page);
    page = await restart();
    assert.deepEqual(await snapshot(page), selected);
    await nav(page).getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('radio', { name: '시폼푸린', exact: true })).toBeChecked();
    await expect(page.getByTestId('selected-avatar')).toHaveAttribute(
      'data-avatar-id',
      'sipompurin',
    );
    await saveJson('after-relaunch', selected);
    await screenshot('05-sipompurin-persisted');
    await page
      .getByRole('button', { name: '백업 파일 저장', exact: true })
      .scrollIntoViewIfNeeded();
    passed(
      'Force-stop/relaunch preserves both completed quests and new sipompurin avatar selection',
    );
    report.offlineAfter = await offline();
    assert.deepEqual(report.pageErrors, []);
    report.attempts = selected.tables.attempts.length;
    report.xp = selected.tables.rewards.reduce((sum, item) => sum + item.xp, 0);
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
  await saveJson(preparing ? 'prepare-results' : 'results', report);
  await writeFile(
    join(
      artifactRoot,
      preparing ? 'native-upgrade-prepare-results.json' : 'native-upgrade-results.json',
    ),
    JSON.stringify(report, null, 2),
  );
  await connection?.browser.close().catch(() => {});
  console.log(`Native upgrade ${report.status}: ${runDirectory}`);
}
