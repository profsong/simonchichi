import { catalog } from './catalog';
import { wordbookDocumentSchema } from './wordbook-schema';
import {
  createWordbookRegistry,
  searchWordbook,
  summarizeWordbooks,
  type WordbookFilter,
} from '../core/wordbook';
import type { AppMode } from '../core/types';

// Adding a validated JSON document needs no registry-code edit or runtime network request.
const sources = import.meta.glob('./wordbooks/*.json', { eager: true, import: 'default' });
const sourceRegistry = createWordbookRegistry(
  catalog.vocabulary,
  Object.values(sources).map((source) => wordbookDocumentSchema.parse(source)),
);

// The owner accepts registered books for this private app. Source JSON keeps its
// historical review state; this explicit local policy is separate from that record.
const curriculumBooks = sourceRegistry.books.filter((book) => book.source.kind === 'curriculum');
const advancedBook = {
  ...curriculumBooks[0],
  id: 'advanced-300',
  title: '중등 심화 300',
  priority: 0,
  descriptionKo: 'B1·B2·B3의 기존 300단어를 모은 15회 탐험이에요.',
  entries: curriculumBooks
    .flatMap((book) => book.entries)
    .map((entry) => ({ ...entry, bookId: 'advanced-300' })),
};
export const wordbookRegistry = {
  words: sourceRegistry.words.map((word) => ({
    ...word,
    firstBookId: word.firstBookId.startsWith('curriculum-') ? 'advanced-300' : word.firstBookId,
  })),
  books: [
    advancedBook,
    ...sourceRegistry.books
      .filter((book) => book.source.kind !== 'curriculum')
      .map((book) => ({
        ...book,
        title: book.id === 'suneung-2000' ? '수능 영어 2000' : book.title,
      })),
  ],
};

const ownerAcceptedBooks = true;
function bookVisibility(mode: AppMode): AppMode {
  // Reuse unfiltered visibility for owner-accepted local sources. This does not
  // rewrite source review metadata or put the application into a demo database.
  return ownerAcceptedBooks ? 'demo' : mode;
}

export function getWordbooks(mode: AppMode) {
  return summarizeWordbooks(wordbookRegistry, bookVisibility(mode));
}
export function getWordbookWords(bookId: string, mode: AppMode, filter: WordbookFilter = {}) {
  return searchWordbook(wordbookRegistry, bookId, bookVisibility(mode), filter);
}
export type {
  WordbookSummary,
  WordbookWord,
  WordbookAnnotation,
  WordbookFilter,
} from '../core/wordbook';
