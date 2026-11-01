import { expect, test, type Page } from '@playwright/test';
import sourceWordbook from '../../content_src/wordbooks/suneung-2000.json' with { type: 'json' };

import { chooseCourse, navigation, saveScreen, snapshot } from './helpers';

async function openBooks(page: Page) {
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: /^단어장 둘러보기/ }).click();
  await expect(page.getByRole('heading', { name: '단어장', exact: true })).toBeVisible();
}

async function openBook(page: Page, id: string) {
  await page.locator(`[data-testid="wordbook-card"][data-book-id="${id}"]`).click();
}

test('the normal library contains both accepted books with readable words', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await openBooks(page);
  await expect(page.getByTestId('wordbook-card')).toHaveCount(2);
  for (const [id, title, count] of [
    ['advanced-300', '중등 심화 300', '300'],
    ['suneung-2000', '수능 영어 2000', '2,000'],
  ]) {
    const card = page.locator(`[data-testid="wordbook-card"][data-book-id="${id}"]`);
    await expect(card).toHaveAccessibleName(title);
    await expect(card).toContainText(count);
    await card.click();
    await expect(page.getByTestId('wordbook-entry')).toHaveCount(50);
    await expect(page.getByText('뜻 미제공', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '단어장 목록으로', exact: true }).click();
  }
  await saveScreen(page, testInfo.project.name, 'library-375');
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  await page.getByRole('button', { name: /^단어장 둘러보기/ }).click();
  await expect(page.getByTestId('wordbook-card')).toHaveCount(2);
});

test('wordbooks deduplicate source entries, search meanings, and preserve learning records offline', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  const before = await snapshot(page);

  await openBooks(page);
  await expect(page.getByTestId('wordbook-card')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('wordbook-library-375.png') });
  await openBook(page, 'suneung-2000');
  const excludeDuplicates = page.getByRole('checkbox', { name: '중복 단어 제외', exact: true });
  const search = page.getByRole('searchbox', { name: '단어 또는 뜻 검색', exact: true });
  await expect(excludeDuplicates).toBeChecked();
  await expect(page.getByTestId('wordbook-entry')).toHaveCount(50);
  await expect(page.locator('[data-testid="wordbook-entry"][data-overlap="true"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('suneung-new-words-375.png') });
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByTestId('wordbook-entry')).toHaveCount(100);

  await search.fill('adapt');
  const adapt = page.getByTestId('wordbook-entry').filter({
    has: page.getByText('adapt', { exact: true }),
  });
  await expect(adapt).toHaveCount(0);
  await excludeDuplicates.uncheck();
  await expect(adapt).toHaveCount(1);
  await expect(adapt).toHaveAttribute('data-word-id', 'v-adapt-sense1');
  await expect(adapt).toHaveAttribute('data-overlap', 'true');
  await expect(adapt).toContainText('기존 단어장과 연결');
  await expect(adapt).toContainText('적응하다');
  await search.fill('적응하다');
  await expect(adapt).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('suneung-linked-meaning-375.png') });
  await search.fill('provide');
  const provide = page.getByTestId('wordbook-entry').filter({
    has: page.getByText('provide', { exact: true }),
  });
  await expect(provide).toHaveCount(1);
  await expect(page.getByTestId('definitions-enriched')).toContainText('PDF 원문 뜻 칸은 비어');
  await expect(provide).toContainText('제공하다');
  await expect(provide).not.toContainText('뜻 미제공');
  const sources = provide.getByTestId('definition-sources');
  await sources.getByText('뜻 출처', { exact: true }).click();
  await expect(sources.getByRole('link', { name: /Princeton WordNet/ })).toHaveAttribute(
    'href',
    'https://wordnetweb.princeton.edu/perl/webwn?s=provide',
  );
  await expect(sources).toContainText('WordNet-3.0');
  await expect(sources).toContainText('영문 정의를 확인해 한국어로 풀이');
  await expect(sources.getByRole('link', { name: /한국어 위키낱말사전/ })).toHaveAttribute(
    'href',
    'https://ko.wiktionary.org/wiki/provide#영어',
  );
  await provide.scrollIntoViewIfNeeded();
  await saveScreen(page, testInfo.project.name, 'provide-sourced-meaning-375');
  await search.fill('제공하다');
  await expect(provide).toHaveCount(1);
  await search.fill('vacuum');
  const vacuum = page.getByTestId('wordbook-entry').filter({
    has: page.getByRole('heading', { name: 'vaccum', exact: true }),
  });
  await expect(vacuum).toHaveCount(1);
  await expect(vacuum).toContainText('원문 표기 확인');
  await expect(vacuum).toContainText('진공');
  await search.fill('legacy');
  const legacy = page.getByTestId('wordbook-entry').filter({
    has: page.getByRole('heading', { name: 'lagacy', exact: true }),
  });
  await expect(legacy).toHaveCount(1);
  await expect(legacy).toContainText('원문 표기 확인');
  await expect(legacy).toContainText('유산');
  await search.fill('retarded');
  await expect(page.getByTestId('wordbook-entry')).toContainText('용법 주의');
  await expect(page.getByTestId('wordbook-entry')).toContainText('발달이 지연된');
  await search.fill('');
  const day = page.getByRole('combobox', { name: '원문 DAY', exact: true });
  await expect(day.locator('option')).toHaveCount(51);
  await day.selectOption('1');
  await expect(page.getByTestId('wordbook-entry')).toHaveCount(40);
  expect(await page.getByTestId('wordbook-entry').getByRole('heading').allTextContents()).toEqual(
    sourceWordbook.entries.filter((entry) => entry.source.day === 1).map((entry) => entry.headword),
  );
  await expect(page.getByText('뜻 미제공', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await snapshot(page)).toEqual(before);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await openBooks(page);
  await openBook(page, 'suneung-2000');
  await expect(page.getByTestId('wordbook-entry')).toHaveCount(50);
  await expect(excludeDuplicates).toBeChecked();
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
  expect(await snapshot(page)).toEqual(before);
});

test('the selected book has its own 15 or 100 lesson map including all source words', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  for (const [id, title, count, wordCount] of [
    ['advanced-300', '중등 심화 300', 15, '300'],
    ['suneung-2000', '수능 영어 2000', 100, '2,000'],
  ] as const) {
    await chooseCourse(page, id);
    await navigation(page).getByRole('button', { name: '모험 지도', exact: true }).click();
    const summary = page.getByTestId('course-summary');
    await expect(summary).toHaveAttribute('data-course-id', id);
    await expect(summary).toContainText(title);
    await expect(summary).toContainText(`${wordCount}단어`);
    await expect(summary).toContainText(`${count}회`);
    await expect(page.getByTestId('map-plan')).toHaveCount(count);
    expect(
      await page
        .getByTestId('map-plan')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-plan-id'))),
    ).toEqual(
      Array.from(
        { length: count },
        (_, index) => `course:${id}:stage:${String(index + 1).padStart(3, '0')}`,
      ),
    );
    await expect(page.locator('[data-testid="map-plan"][data-completed="true"]')).toHaveCount(0);
    await saveScreen(page, testInfo.project.name, `${id}-map-375`);
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  }
  expect((await snapshot(page)).sessions).toHaveLength(0);
  await expect(page.getByTestId('total-xp')).toHaveText('0 XP');
});
