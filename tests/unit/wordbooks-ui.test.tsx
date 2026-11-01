import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppMode } from '../../src/core/types';
import type { WordbookFilter } from '../../src/core/wordbook';
import { WordbooksScreen } from '../../src/features/wordbooks/WordbooksScreen';

vi.mock('../../src/data/wordbooks', async () => {
  const { createWordbookRegistry, searchWordbook, summarizeWordbooks } =
    await import('../../src/core/wordbook');
  const registry = createWordbookRegistry(
    [],
    [
      {
        schemaVersion: 1,
        id: 'future-bank',
        title: '앞으로 추가한 단어장',
        version: '1',
        priority: 100,
        source: { kind: 'json', filename: 'future-bank.json', license: 'original test fixture' },
        entries: [
          {
            id: 'future-bank-1',
            headword: 'bank',
            koreanMeaning: '은행',
            partOfSpeech: 'noun',
            reviewStatus: 'draft',
            source: { row: 1 },
          },
          {
            id: 'future-bank-2',
            headword: ' BANK ',
            koreanMeaning: '강둑',
            partOfSpeech: 'noun',
            reviewStatus: 'draft',
            source: { row: 2 },
          },
        ],
      },
    ],
  );
  return {
    getWordbooks: (mode: AppMode) => summarizeWordbooks(registry, mode),
    getWordbookWords: (id: string, mode: AppMode, filter: WordbookFilter = {}) =>
      searchWordbook(registry, id, mode, filter),
  };
});

afterEach(cleanup);

it('shows both source meanings in one canonical row when searching a later duplicate meaning', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const user = userEvent.setup();
  render(<WordbooksScreen mode="demo" avatar="monchichi" onSettings={() => undefined} />);
  expect(screen.getByText('JSON', { exact: true })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '앞으로 추가한 단어장' }));
  await user.type(screen.getByRole('searchbox', { name: '단어 또는 뜻 검색' }), '강둑');
  const entries = screen.getAllByTestId('wordbook-entry');
  expect(entries).toHaveLength(1);
  expect(within(entries[0]).getByRole('heading', { name: 'bank' })).toBeVisible();
  expect(within(entries[0]).getByText('은행', { exact: true })).toBeVisible();
  expect(within(entries[0]).getByText('강둑', { exact: true })).toBeVisible();
  expect(entries[0]).toHaveTextContent('원본 2개 항목의 뜻과 출처를 함께 보관해요');
});
