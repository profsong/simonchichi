import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { chooseCorrectAnswer, exportData, firstQuestion, navigation, snapshot } from './helpers';

const base = '/simonchichi/';

test('project-site assets, install metadata, licenses and worker remain inside their base path', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requested.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  const origin = new URL(page.url()).origin;
  const localUrl = (value: string) => {
    const url = new URL(value, page.url());
    expect(url.origin).toBe(origin);
    expect(url.pathname).toMatch(/^\/simonchichi\//);
    return url.href;
  };
  const assets = await page
    .locator('script[src], link[rel="stylesheet"], link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('src') ?? node.getAttribute('href')!),
    );
  expect(assets.some((asset) => asset.endsWith('.js'))).toBe(true);
  expect(assets.some((asset) => asset.endsWith('.css'))).toBe(true);
  for (const asset of assets) {
    const response = await page.request.get(localUrl(asset));
    expect(response.ok(), asset).toBe(true);
    expect(response.headers()['content-type']).not.toContain('text/html');
  }
  const manifestUrl = localUrl((await page.locator('link[rel="manifest"]').getAttribute('href'))!);
  const manifestResponse = await page.request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe(base);
  expect(manifest.scope).toBe(base);
  expect(manifest.short_name).toBe('시몬치치');
  for (const icon of manifest.icons) {
    const response = await page.request.get(localUrl(new URL(icon.src, manifestUrl).href));
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, scriptURL: registration.active?.scriptURL };
  });
  expect(worker.scope).toBe(`${origin}${base}`);
  expect(worker.scriptURL).toBe(`${origin}${base}sw.js`);
  expect((await page.request.get(worker.scriptURL!)).headers()['content-type']).toContain(
    'javascript',
  );
  // This server never hides escaped root assets behind an index.html fallback.
  expect((await page.request.get(`${origin}/icons/icon-192.png`)).status()).toBe(404);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: /^단어장 둘러보기/ }).click();
  await page.locator('[data-testid="wordbook-card"][data-book-id="suneung-2000"]').click();
  const license = localUrl(
    (await page.getByRole('link', { name: '저작자와 이용 조건 보기' }).getAttribute('href'))!,
  );
  const notice = await page.request.get(license);
  expect(notice.ok()).toBe(true);
  expect(await notice.text()).toContain('WordNet');
  for (const url of requested) localUrl(url);
  expect(errors).toEqual([]);
  await testInfo.attach('pages-install-metadata', {
    body: JSON.stringify({ manifest, worker, assets, license }, null, 2),
    contentType: 'application/json',
  });
});

test('cached project-site resumes a local answer and exports its real backup while offline', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  const step = await firstQuestion(page);
  await chooseCorrectAnswer(page, step);
  await page.getByRole('button', { name: '정답 확인', exact: true }).click();
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  const before = await snapshot(page);
  expect(before.sessions).toHaveLength(1);
  expect(before.attempts).toHaveLength(1);
  expect(before.attempts[0].isCorrect).toBe(true);
  expect(before.rewards.reduce((sum, row) => sum + row.xp, 0)).toBe(10);
  await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  const exported = await exportData(page, testInfo, 'pages-offline-backup.json');
  expect(exported.data.schemaVersion).toBe(6);
  expect(exported.data.appMode).toBe('learner');
  for (const [table, rows] of Object.entries(before))
    expect(exported.data[table as keyof typeof before]).toEqual(rows);
  const cachedNotice = await page.evaluate(async () => {
    const response = await fetch('/simonchichi/licenses/DICTIONARY-ATTRIBUTION.txt');
    return { status: response.status, text: await response.text() };
  });
  expect(cachedNotice.status).toBe(200);
  expect(cachedNotice.text).toContain('WordNet');
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('pages-offline-settings.png') });
});

test('installed cache survives online HTML404 hosting and failed worker updates, but a fresh client cannot install', async ({
  page,
  context,
  browser,
}, testInfo) => {
  const appUrl = new URL(base, testInfo.project.use.baseURL!).href;
  const origin = new URL(appUrl).origin;
  const clientCookie = {
    name: 'pages-test-client',
    value: randomUUID(),
    url: `${origin}/`,
    httpOnly: true,
    sameSite: 'Strict' as const,
  };
  await context.addCookies([clientCookie]);
  await context.setOffline(false);
  await page.goto(appUrl);
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const assets = await page
    .locator('script[src], link[rel="stylesheet"], link[rel="manifest"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('src') ?? node.getAttribute('href')!),
    );
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  await chooseCorrectAnswer(page, await firstQuestion(page));
  await page.getByRole('button', { name: '정답 확인', exact: true }).click();
  await expect(page.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  const before = await snapshot(page);
  expect(before.attempts).toHaveLength(1);
  expect(before.rewards.reduce((sum, row) => sum + row.xp, 0)).toBe(10);

  const controlUrl = `${origin}/__pages-test__/hosting`;
  const switched = await context.request.post(controlUrl, {
    headers: { 'x-pages-test-state': 'missing' },
  });
  expect(switched.ok()).toBe(true);
  // API requests bypass the worker and prove that the origin is online but absent.
  const origin404s = [];
  for (const path of [
    base,
    ...assets,
    `${base}sw.js`,
    `${base}licenses/DICTIONARY-ATTRIBUTION.txt`,
  ]) {
    const url = new URL(path, appUrl).href;
    const response = await context.request.get(url);
    expect(response.status(), url).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('GitHub Pages site');
    origin404s.push(url);
  }
  await page.close();
  const reopened = await context.newPage();
  const navigationResponse = await reopened.goto(appUrl);
  expect(navigationResponse?.status()).toBe(200);
  expect(await reopened.evaluate(() => navigator.onLine)).toBe(true);
  await reopened.getByRole('button', { name: '탐험 이어하기', exact: true }).click();
  await expect(reopened.getByText('잘 떠올렸어요!', { exact: true })).toBeVisible();
  expect(await snapshot(reopened)).toEqual(before);
  const priorWorker404s = (await (await context.request.get(controlUrl)).json()).requests.filter(
    (request: { pathname: string }) => request.pathname === `${base}sw.js`,
  ).length;
  const update = await reopened.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const original = registration.active;
    let failed = false;
    let error = '';
    try {
      await registration.update();
    } catch (value) {
      failed = true;
      error = String(value);
    }
    return {
      failed,
      error,
      activeUnchanged: registration.active === original,
      activeState: registration.active?.state,
      scriptURL: registration.active?.scriptURL,
      controller: navigator.serviceWorker.controller?.scriptURL,
    };
  });
  expect(update.failed).toBe(true);
  expect(update.activeUnchanged).toBe(true);
  expect(update.activeState).toBe('activated');
  expect(update.scriptURL).toBe(`${origin}${base}sw.js`);
  expect(update.controller).toBe(update.scriptURL);
  const hosting = await (await context.request.get(controlUrl)).json();
  expect(
    hosting.requests.filter((request: { pathname: string }) => request.pathname === `${base}sw.js`)
      .length,
  ).toBeGreaterThan(priorWorker404s);
  await reopened.getByRole('button', { name: '저장하고 나가기', exact: true }).click();
  await navigation(reopened).getByRole('button', { name: '설정', exact: true }).click();
  await expect(reopened.getByText('오프라인 준비 완료', { exact: true })).toBeVisible();
  const exported = await exportData(reopened, testInfo, 'pages-online404-backup.json');
  expect(exported.data.schemaVersion).toBe(6);
  for (const [table, rows] of Object.entries(before))
    expect(exported.data[table as keyof typeof before]).toEqual(rows);
  const license = await reopened.evaluate(async () => {
    const response = await fetch('/simonchichi/licenses/DICTIONARY-ATTRIBUTION.txt');
    return { status: response.status, text: await response.text() };
  });
  expect(license.status).toBe(200);
  expect(license.text).toContain('WordNet');
  expect(await snapshot(reopened)).toEqual(before);
  await reopened.screenshot({ path: testInfo.outputPath('pages-online404-cached-settings.png') });

  const fresh = await browser.newContext();
  try {
    await fresh.addCookies([clientCookie]);
    const freshPage = await fresh.newPage();
    const response = await freshPage.goto(appUrl);
    expect(response?.status()).toBe(404);
    await expect(freshPage.getByRole('heading', { name: '404', exact: true })).toBeVisible();
    await expect(freshPage.getByRole('navigation', { name: '모바일 메뉴' })).toHaveCount(0);
    expect(
      await freshPage.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    ).toBe(0);
  } finally {
    await fresh.close();
  }
  await testInfo.attach('online404-hosting-evidence', {
    body: JSON.stringify(
      {
        online: true,
        origin404s,
        cachedNavigationStatus: navigationResponse?.status(),
        update,
        hosting,
        freshClientStatus: 404,
        attemptsPreserved: before.attempts.length,
        xpPreserved: 10,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
