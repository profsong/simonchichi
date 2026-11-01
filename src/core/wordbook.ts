import type { ContentBank, Vocabulary } from '../data/content-schema';
import {
  wordbookDocumentSchema,
  wordbookDefinitionsSchema,
  type DefinitionProvenance,
  type WordbookDefinitions,
  type WordbookDocument,
  type WordbookEntry,
  type WordbookSource,
} from '../data/wordbook-schema';
import type { AppMode } from './types';

/** Typography only: preserve inflection, apostrophes, hyphens and phrase boundaries. */
export function normalizeHeadword(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010\u2011]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Stable across book order/version changes; collisions are rejected, never silently merged. */
export function canonicalWordId(headword: string): string {
  const normalized = normalizeHeadword(headword);
  if (!normalized) throw new Error('빈 표제어는 등록할 수 없습니다.');
  let hash = 14695981039346656037n;
  for (let index = 0; index < normalized.length; index++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(normalized.charCodeAt(index))) * 1099511628211n);
  return `word-${hash.toString(16).padStart(16, '0')}`;
}

export interface WordbookAnnotation extends WordbookEntry {
  bookId: string;
  canonicalId: string;
}
export interface CanonicalWord {
  id: string;
  normalizedHeadword: string;
  headword: string;
  existingVocabularyIds: string[];
  firstBookId: string;
}
export interface RegisteredWordbook extends Omit<WordbookDocument, 'entries'> {
  entries: WordbookAnnotation[];
}
export interface WordbookRegistry {
  books: RegisteredWordbook[];
  words: CanonicalWord[];
}
export interface WordbookSummary {
  id: string;
  title: string;
  descriptionKo?: string;
  version: string;
  priority: number;
  source: WordbookSource;
  originalCount: number;
  uniqueCount: number;
  newCount: number;
  overlapCount: number;
  internalDuplicateCount: number;
  missingMeaningCount: number;
  sourceMissingMeaningCount: number;
  availableCount: number;
}
export interface WordbookWord {
  id: string;
  headword: string;
  koreanMeaning: string;
  sourceKoreanMeaning?: string;
  definitionProvenance?: DefinitionProvenance[];
  partOfSpeech?: string;
  reviewStatus: WordbookEntry['reviewStatus'];
  source: WordbookEntry['source'];
  isOverlap: boolean;
  annotations: WordbookAnnotation[];
  existingVocabularyIds: string[];
  existingMeaning?: { koreanMeaning: string; partOfSpeech?: string; bookId: string };
}
export interface WordbookFilter {
  query?: string;
  view?: 'new' | 'all';
  day?: number;
}

const visible = (entry: WordbookEntry, mode: AppMode) =>
  mode === 'demo' || entry.reviewStatus === 'approved';

/** Complete, versioned gloss overlay; source rows and PDF metadata remain immutable. */
export function mergeWordbookDefinitions(
  source: WordbookDocument,
  definitions: WordbookDefinitions,
): WordbookDocument {
  const book = wordbookDocumentSchema.parse(source);
  const overlay = wordbookDefinitionsSchema.parse(definitions);
  if (
    overlay.wordbookId !== book.id ||
    overlay.sourceSha256.toLowerCase() !== book.source.sha256?.toLowerCase()
  )
    throw new Error('뜻 보완 파일의 단어장 또는 원본 SHA-256이 일치하지 않습니다.');
  const byId = new Map(overlay.entries.map((entry) => [entry.entryId, entry]));
  if (byId.size !== overlay.entries.length || byId.size !== book.entries.length)
    throw new Error('뜻 보완 파일에는 원본의 모든 행이 정확히 한 번 있어야 합니다.');
  const entries = book.entries.map((entry) => {
    const definition = byId.get(entry.id);
    if (!definition || normalizeHeadword(definition.headword) !== normalizeHeadword(entry.headword))
      throw new Error(`뜻 보완 행의 ID 또는 표제어를 확인해 주세요: ${entry.id}`);
    if (
      entry.sourceKoreanMeaning !== undefined ||
      (entry.koreanMeaning.trim() && entry.koreanMeaning !== definition.koreanMeaning)
    )
      throw new Error(`이미 있는 원문 뜻을 덮어쓸 수 없습니다: ${entry.id}`);
    const uncertainties = new Set([
      ...(entry.uncertainties ?? []),
      ...(definition.uncertainties ?? []),
    ]);
    uncertainties.delete('missing-meaning');
    if (definition.partOfSpeech ?? entry.partOfSpeech) uncertainties.delete('missing-pos');
    uncertainties.add('pending-independent-review');
    return {
      ...entry,
      sourceKoreanMeaning: entry.koreanMeaning,
      koreanMeaning: definition.koreanMeaning,
      partOfSpeech: definition.partOfSpeech ?? entry.partOfSpeech,
      definitionProvenance: structuredClone(definition.definitionProvenance),
      reviewStatus: 'draft' as const,
      uncertainties: [...uncertainties],
    };
  });
  return wordbookDocumentSchema.parse({ ...book, version: overlay.version, entries });
}

export interface CurriculumChapterSummary {
  id: string;
  week: number;
  title: string;
  planIds: string[];
  vocabularyIds: string[];
  vocabularyCount: number;
  bandCounts: { B1: number; B2: number; B3: number };
}

/** The authored core map only follows the canonical curriculum, never added books. */
export function getCurriculumChapters(bank: ContentBank): CurriculumChapterSummary[] {
  const vocabulary = new Map(bank.vocabulary.map((word) => [word.id, word]));
  return [...bank.weekPlans]
    .sort((a, b) => a.week - b.week)
    .map((week) => {
      const bandCounts = { B1: 0, B2: 0, B3: 0 };
      for (const id of week.vocabularyIds) {
        const word = vocabulary.get(id);
        if (word && (word.level === 'B1' || word.level === 'B2' || word.level === 'B3'))
          bandCounts[word.level]++;
      }
      return {
        id: week.id,
        week: week.week,
        title: week.titleKo,
        vocabularyIds: [...week.vocabularyIds],
        vocabularyCount: week.vocabularyIds.length,
        bandCounts,
        planIds: bank.dailyPlans
          .filter((plan) => plan.week === week.week)
          .sort((a, b) => a.day - b.day)
          .map((plan) => plan.id),
      };
    });
}

export function getCoreCourseSummary(bank: ContentBank) {
  const chapters = getCurriculumChapters(bank);
  return {
    id: 'core-curriculum',
    title: '기본 과정',
    wordbookIds: ['curriculum-b1', 'curriculum-b2', 'curriculum-b3'],
    chapterCount: chapters.length,
    stageCount: new Set(chapters.flatMap((chapter) => chapter.planIds)).size,
    vocabularyCount: new Set(chapters.flatMap((chapter) => chapter.vocabularyIds)).size,
  };
}

/** Returns a new registry. Previously registered words/books and their ownership never move. */
export function registerWordbooks(
  registry: WordbookRegistry,
  additions: WordbookDocument[],
): WordbookRegistry {
  const result = structuredClone(registry);
  const byHeadword = new Map(result.words.map((word) => [word.normalizedHeadword, word]));
  const byId = new Map(result.words.map((word) => [word.id, word]));
  const bookIds = new Set(result.books.map((book) => book.id));
  let lastPriority = Math.max(-1, ...result.books.map((book) => book.priority));
  const parsed = additions
    .map((book) => wordbookDocumentSchema.parse(book))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const book of parsed) {
    if (bookIds.has(book.id)) throw new Error(`단어장 ID가 중복됩니다: ${book.id}`);
    if (book.priority <= lastPriority)
      throw new Error(`새 단어장의 priority는 기존 목록보다 커야 합니다: ${book.id}`);
    const entries: WordbookAnnotation[] = [];
    for (const entry of book.entries) {
      const key = normalizeHeadword(entry.headword);
      let word = byHeadword.get(key);
      if (!word) {
        const id = canonicalWordId(key);
        if (byId.has(id)) throw new Error(`표제어 ID 충돌을 확인해 주세요: ${entry.headword}`);
        word = {
          id,
          normalizedHeadword: key,
          headword: entry.headword,
          existingVocabularyIds: [],
          firstBookId: book.id,
        };
        result.words.push(word);
        byHeadword.set(key, word);
        byId.set(id, word);
      } else if (!word.firstBookId) word.firstBookId = book.id;
      entries.push({ ...entry, bookId: book.id, canonicalId: word.id });
    }
    result.books.push({ ...book, entries });
    bookIds.add(book.id);
    lastPriority = book.priority;
  }
  return result;
}

export function createWordbookRegistry(
  vocabulary: Vocabulary[],
  additions: WordbookDocument[] = [],
): WordbookRegistry {
  const words: CanonicalWord[] = [];
  const byHeadword = new Map<string, CanonicalWord>();
  const existingIds = new Set<string>();
  for (const item of [...vocabulary].sort((a, b) => a.id.localeCompare(b.id))) {
    if (existingIds.has(item.id)) throw new Error(`기존 어휘 ID가 중복됩니다: ${item.id}`);
    existingIds.add(item.id);
    const key = normalizeHeadword(item.headword);
    const existing = byHeadword.get(key);
    if (existing) existing.existingVocabularyIds.push(item.id);
    else {
      const word = {
        id: item.id,
        normalizedHeadword: key,
        headword: item.headword,
        existingVocabularyIds: [item.id],
        firstBookId: '',
      };
      words.push(word);
      byHeadword.set(key, word);
    }
  }
  const bands = [
    { level: 'B1', title: 'B1 중등 심화' },
    { level: 'B2', title: 'B2 고등 영어 연결' },
    { level: 'B3', title: 'B3 고등 영어 입문' },
  ] as const;
  const books: WordbookDocument[] = bands.flatMap(({ level, title }, priority) => {
    const items = vocabulary.filter((word) => word.level === level);
    if (!items.length) return [];
    return [
      {
        schemaVersion: 1 as const,
        id: `curriculum-${level.toLowerCase()}`,
        version: '1',
        title,
        priority,
        descriptionKo: '기존 학습 과정의 단어와 진도 ID를 그대로 사용해요.',
        source: { kind: 'curriculum' as const, filename: 'seed-content.json', license: 'original' },
        entries: items.map((word, index) => ({
          id: word.id,
          headword: word.headword,
          koreanMeaning: word.koreanMeaning,
          partOfSpeech: word.partOfSpeech,
          reviewStatus: word.reviewStatus,
          source: {
            row: index + 1,
            day: (word.week - 1) * 5 + word.day,
            sourceGroup: word.sourceGroup,
          },
        })),
      },
    ];
  });
  return registerWordbooks(registerWordbooks({ books: [], words }, books), additions);
}

export function searchWordbook(
  registry: WordbookRegistry,
  bookId: string,
  mode: AppMode,
  { query = '', view = 'new', day }: WordbookFilter = {},
): WordbookWord[] {
  const book = registry.books.find((item) => item.id === bookId);
  if (!book) return [];
  const canonical = new Map(registry.words.map((word) => [word.id, word]));
  const groups = new Map<string, WordbookAnnotation[]>();
  for (const entry of book.entries) {
    if (!visible(entry, mode) || (day !== undefined && entry.source.day !== day)) continue;
    const group = groups.get(entry.canonicalId) ?? [];
    group.push(entry);
    groups.set(entry.canonicalId, group);
  }
  const existing = new Map<string, WordbookAnnotation>();
  for (const current of registry.books.filter((item) => item.source.kind === 'curriculum'))
    for (const entry of current.entries)
      if (visible(entry, mode) && entry.koreanMeaning.trim() && !existing.has(entry.canonicalId))
        existing.set(entry.canonicalId, entry);
  const needle = normalizeHeadword(query);
  const result: WordbookWord[] = [];
  for (const [id, annotations] of groups) {
    const word = canonical.get(id)!;
    const isOverlap = word.firstBookId !== bookId;
    if (view === 'new' && isOverlap) continue;
    const entry = annotations[0];
    const fallback = existing.get(id);
    if (
      needle &&
      ![
        ...annotations.flatMap((item) => [
          item.headword,
          item.koreanMeaning,
          item.partOfSpeech ?? '',
          ...(item.definitionProvenance ?? []).map((source) => source.lookupHeadword ?? ''),
        ]),
        fallback?.koreanMeaning ?? '',
      ].some((value) => normalizeHeadword(value).includes(needle))
    )
      continue;
    result.push({
      id,
      headword: entry.headword,
      koreanMeaning: entry.koreanMeaning,
      ...(entry.sourceKoreanMeaning !== undefined
        ? {
            sourceKoreanMeaning: entry.sourceKoreanMeaning,
            definitionProvenance: structuredClone(entry.definitionProvenance),
          }
        : {}),
      partOfSpeech: entry.partOfSpeech,
      reviewStatus: entry.reviewStatus,
      source: structuredClone(entry.source),
      isOverlap,
      annotations: structuredClone(annotations),
      existingVocabularyIds: [...word.existingVocabularyIds],
      ...(fallback && fallback.bookId !== bookId
        ? {
            existingMeaning: {
              koreanMeaning: fallback.koreanMeaning,
              partOfSpeech: fallback.partOfSpeech,
              bookId: fallback.bookId,
            },
          }
        : {}),
    });
  }
  return result;
}

export function summarizeWordbooks(registry: WordbookRegistry, mode: AppMode): WordbookSummary[] {
  const words = new Map(registry.words.map((word) => [word.id, word]));
  return registry.books.map((book) => {
    const ids = new Set(book.entries.map((entry) => entry.canonicalId));
    const newCount = [...ids].filter((id) => words.get(id)?.firstBookId === book.id).length;
    return {
      id: book.id,
      title: book.title,
      descriptionKo: book.descriptionKo,
      version: book.version,
      priority: book.priority,
      source: structuredClone(book.source),
      originalCount: book.entries.length,
      uniqueCount: ids.size,
      newCount,
      overlapCount: ids.size - newCount,
      internalDuplicateCount: book.entries.length - ids.size,
      missingMeaningCount: book.entries.filter((entry) => !entry.koreanMeaning.trim()).length,
      sourceMissingMeaningCount: book.entries.filter(
        (entry) => !(entry.sourceKoreanMeaning ?? entry.koreanMeaning).trim(),
      ).length,
      availableCount: new Set(
        book.entries
          .filter(
            (entry) =>
              visible(entry, mode) && words.get(entry.canonicalId)?.firstBookId === book.id,
          )
          .map((entry) => entry.canonicalId),
      ).size,
    };
  });
}
