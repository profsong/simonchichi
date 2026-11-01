import { expect, test } from '@playwright/test';
import { navigation, saveScreen, snapshot } from './helpers';

test('ordinary production ignores demo URLs and offers accepted courses without a content gate', async ({
  page,
}, testInfo) => {
  await page.goto('/?demo=1');
  await expect(page).toHaveTitle('시몬치치 · 나의 영어 모험');
  await expect(page.locator('.app-logo')).toContainText('시몬치치');
  await expect(page.locator('.app-logo')).not.toContainText(/English Quest/i);
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await page.request.get(manifestUrl!);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).short_name).toBe('시몬치치');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    '시몬치치',
  );
  await expect(page.getByRole('button', { name: '오늘 퀘스트 시작' })).toBeEnabled();
  const picker = page.getByRole('combobox', { name: '학습 단어장' });
  await expect(picker).toHaveValue('advanced-300');
  expect((await picker.boundingBox())!.width).toBeGreaterThan(250);
  await expect(picker.locator('option:checked')).toHaveText('중등 심화 300');
  await saveScreen(page, testInfo.project.name, 'home-375');
  await expect(page.getByText(/현재 승인된 콘텐츠가 없어요|개발 데모/)).toHaveCount(0);
  await navigation(page).getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '데모 콘텐츠 사용(검수 전)' })).toHaveCount(0);
  await navigation(page).getByRole('button', { name: '복습함', exact: true }).click();
  const roomTrigger = page.getByRole('button', { name: '방 꾸미기', exact: true });
  await roomTrigger.click();
  await expect(page.getByTestId('room-shop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-shop')).not.toBeVisible();
  await expect(roomTrigger).toBeFocused();
  await navigation(page).getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '오늘 퀘스트 시작' }).click();
  await expect(page.getByTestId('study-card')).toBeVisible();
  expect((await snapshot(page)).sessions[0].appMode).toBe('learner');
  await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.getByTestId('study-card')).toBeVisible();
  expect((await snapshot(page)).sessions).toHaveLength(1);
});
