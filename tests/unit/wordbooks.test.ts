import { describe, expect, it } from 'vitest';
import { catalog } from '../../src/data/catalog';
import {
  wordbookDocumentSchema,
  wordbookDefinitionsSchema,
  type WordbookDocument,
  type WordbookDefinitions,
} from '../../src/data/wordbook-schema';
import { getWordbooks, getWordbookWords, wordbookRegistry } from '../../src/data/wordbooks';
import {
  canonicalWordId,
  createWordbookRegistry,
  getCoreCourseSummary,
  getCurriculumChapters,
  mergeWordbookDefinitions,
  normalizeHeadword,
  registerWordbooks,
  searchWordbook,
  summarizeWordbooks,
} from '../../src/core/wordbook';
import importedPdf from '../../src/data/wordbooks/suneung-2000.json';
import originalPdf from '../../content_src/wordbooks/suneung-2000.json';
import importedDefinitions from '../../content_src/wordbooks/definitions/suneung-2000.json';

function book(id: string, priority: number, rows: [string, string][]): WordbookDocument {
  return {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    title: id,
    priority,
    source: { kind: 'json', filename: `${id}.json`, license: 'original' },
    entries: rows.map(([headword, koreanMeaning], index) => ({
      id: `${id}-row-${index + 1}`,
      headword,
      koreanMeaning,
      reviewStatus: 'draft',
      source: { row: index + 1, day: Math.floor(index / 2) + 1 },
    })),
  };
}

describe('conservative word identity', () => {
  it('normalizes Unicode typography, case and whitespace without stemming or losing phrase boundaries', () => {
    expect(normalizeHeadword('  ＡＤＡＰＴ\t ')).toBe('adapt');
    expect(normalizeHeadword('Look\n  after')).toBe('look after');
    expect(normalizeHeadword('worker’s')).toBe("worker's");
    expect(normalizeHeadword('co‑operate')).toBe('co-operate');
    expect(canonicalWordId('co‐operate')).toBe(canonicalWordId('CO-OPERATE'));
    for (const [first, second] of [
      ['re-sign', 'resign'],
      ['co-operate', 'co operate'],
      ['look after', 'lookafter'],
      ['leaf', 'leaves'],
      ['résumé', 'resume'],
      ["worker's", 'workers'],
    ])
      expect(canonicalWordId(first)).not.toBe(canonicalWordId(second));
    expect(() => canonicalWordId(' \n ')).toThrow();
  });
});

describe('fixed authored core curriculum', () => {
  it('maps all 12 chapters to the existing three wordbooks without adding imported words', () => {
    const before = structuredClone(catalog);
    const chapters = getCurriculumChapters(catalog);
    expect(getCoreCourseSummary(catalog)).toEqual({
      id: 'core-curriculum',
      title: '기본 과정',
      wordbookIds: ['curriculum-b1', 'curriculum-b2', 'curriculum-b3'],
      chapterCount: 12,
      stageCount: 60,
      vocabularyCount: 300,
    });
    expect(
      chapters.map((chapter) => [
        chapter.bandCounts.B1,
        chapter.bandCounts.B2,
        chapter.bandCounts.B3,
      ]),
    ).toEqual([
      [20, 5, 0],
      [20, 5, 0],
      [14, 11, 0],
      [14, 11, 0],
      [8, 17, 0],
      [4, 21, 0],
      [0, 21, 4],
      [0, 21, 4],
      [0, 17, 8],
      [0, 10, 15],
      [0, 1, 24],
      [0, 0, 25],
    ]);
    expect(
      chapters.every((chapter) => chapter.vocabularyCount === 25 && chapter.planIds.length === 5),
    ).toBe(true);
    expect(chapters.flatMap((chapter) => chapter.planIds)).toEqual(
      catalog.dailyPlans.map((plan) => plan.id),
    );
    expect(new Set(chapters.flatMap((chapter) => chapter.vocabularyIds))).toEqual(
      new Set(catalog.vocabulary.map((word) => word.id)),
    );
    createWordbookRegistry(catalog.vocabulary, [book('more-words', 200, [['quasar', '퀘이사']])]);
    expect(getCoreCourseSummary(catalog)).toMatchObject({
      chapterCount: 12,
      stageCount: 60,
      vocabularyCount: 300,
    });
    expect(catalog).toEqual(before);
  });
});

describe('definition overlay merge', () => {
  function definitionsFixture(): { source: WordbookDocument; definitions: WordbookDefinitions } {
    const source = book('gloss-book', 100, [
      ['bank', ''],
      ['give up', ''],
    ]);
    source.source = {
      kind: 'pdf',
      filename: 'blank.pdf',
      license: 'user-provided',
      sha256: 'a'.repeat(64),
      pageCount: 1,
    };
    source.entries.forEach((entry) => {
      entry.source.page = 1;
      entry.uncertainties = ['missing-meaning', 'missing-pos'];
    });
    return {
      source,
      definitions: {
        schemaVersion: 1,
        wordbookId: source.id,
        sourceSha256: source.source.sha256!,
        version: '1.1.0',
        entries: source.entries.map((entry, index) => ({
          entryId: entry.id,
          headword: entry.headword,
          koreanMeaning: index === 0 ? '은행' : '포기하다',
          ...(index === 0 ? { partOfSpeech: 'noun' } : {}),
          definitionProvenance: [
            {
              sourceId: 'test-dictionary',
              url: `https://example.com/dictionary/${index + 1}`,
              license: 'CC-BY-SA-4.0',
              method: 'bulk-dictionary-selection',
            },
          ],
        })),
      },
    };
  }

  it('adds sourced definitions while preserving all original rows, empty source cells and draft status', () => {
    const { source, definitions } = definitionsFixture();
    const before = structuredClone(source);
    const merged = mergeWordbookDefinitions(source, definitions);
    expect(source).toEqual(before);
    expect(merged.version).toBe('1.1.0');
    expect(merged.source).toEqual(source.source);
    expect(
      merged.entries.map(({ id, headword, source: location }) => ({
        id,
        headword,
        source: location,
      })),
    ).toEqual(
      source.entries.map(({ id, headword, source: location }) => ({
        id,
        headword,
        source: location,
      })),
    );
    expect(
      merged.entries.every(
        (entry) =>
          entry.sourceKoreanMeaning === '' &&
          entry.koreanMeaning.trim() &&
          entry.reviewStatus === 'draft' &&
          entry.uncertainties?.includes('pending-independent-review'),
      ),
    ).toBe(true);
    expect(merged.entries[0].uncertainties).not.toContain('missing-pos');
    expect(merged.entries[1].uncertainties).toContain('missing-pos');
    expect(merged.entries.every((entry) => !entry.uncertainties?.includes('missing-meaning'))).toBe(
      true,
    );
    const registry = createWordbookRegistry(catalog.vocabulary, [merged]);
    expect(summarizeWordbooks(registry, 'demo').at(-1)).toMatchObject({
      missingMeaningCount: 0,
      sourceMissingMeaningCount: 2,
    });
    expect(searchWordbook(registry, source.id, 'learner', { view: 'all' })).toEqual([]);
    expect(searchWordbook(registry, source.id, 'demo', { query: '포기하다' })[0]).toMatchObject({
      koreanMeaning: '포기하다',
      sourceKoreanMeaning: '',
      definitionProvenance: definitions.entries[1].definitionProvenance,
    });
  });

  it.each([
    'book',
    'hash',
    'missing row',
    'duplicate row',
    'unknown row',
    'wrong headword',
    'blank meaning',
    'no provenance',
    'unsafe URL',
  ] as const)('rejects %s overlay corruption without modifying the original', (kind) => {
    const { source, definitions } = definitionsFixture();
    const before = structuredClone(source);
    if (kind === 'book') definitions.wordbookId = 'other';
    if (kind === 'hash') definitions.sourceSha256 = 'b'.repeat(64);
    if (kind === 'missing row') definitions.entries.pop();
    if (kind === 'duplicate row') definitions.entries[1].entryId = definitions.entries[0].entryId;
    if (kind === 'unknown row') definitions.entries[0].entryId = 'unknown';
    if (kind === 'wrong headword') definitions.entries[0].headword = 'different';
    if (kind === 'blank meaning') definitions.entries[0].koreanMeaning = ' ';
    if (kind === 'no provenance') definitions.entries[0].definitionProvenance = [];
    if (kind === 'unsafe URL')
      definitions.entries[0].definitionProvenance[0].url = 'javascript:alert(1)';
    expect(() => mergeWordbookDefinitions(source, definitions)).toThrow();
    expect(source).toEqual(before);
  });

  it('does not overwrite an existing source meaning or silently approve enriched content', () => {
    const { source, definitions } = definitionsFixture();
    source.entries[0].koreanMeaning = '강둑';
    expect(() => mergeWordbookDefinitions(source, definitions)).toThrow('덮어쓸');
    source.entries[0].koreanMeaning = '';
    const merged = mergeWordbookDefinitions(source, definitions);
    merged.entries[0].reviewStatus = 'approved';
    expect(wordbookDocumentSchema.safeParse(merged).success).toBe(false);
    expect(
      wordbookDocumentSchema.safeParse({
        ...merged,
        entries: [{ ...merged.entries[0], sourceKoreanMeaning: undefined }],
      }).success,
    ).toBe(false);
  });
});

describe('bundled wordbooks and original curriculum', () => {
  it('merges the three bands while preserving all 300 existing IDs and meanings', () => {
    expect(
      getWordbooks('demo')
        .slice(0, 1)
        .map(({ id, originalCount, newCount }) => ({ id, originalCount, newCount })),
    ).toEqual([{ id: 'advanced-300', originalCount: 300, newCount: 300 }]);
    for (const item of catalog.vocabulary) {
      const row = getWordbookWords('advanced-300', 'learner').find((word) => word.id === item.id);
      expect(row).toMatchObject({
        id: item.id,
        headword: item.headword,
        koreanMeaning: item.koreanMeaning,
        existingVocabularyIds: [item.id],
      });
    }
    expect(wordbookRegistry.words.flatMap((word) => word.existingVocabularyIds).sort()).toEqual(
      catalog.vocabulary.map((word) => word.id).sort(),
    );
    expect(catalog.vocabulary.every((word) => word.reviewStatus === 'draft')).toBe(true);
  });

  it('loads all 2000 sourced Korean definitions while preserving the blank PDF cells and word identities', () => {
    const summary = getWordbooks('demo').find((item) => item.id === 'suneung-2000');
    expect(summary).toMatchObject({
      originalCount: 2000,
      uniqueCount: 2000,
      newCount: 1824,
      overlapCount: 176,
      internalDuplicateCount: 0,
      missingMeaningCount: 0,
      sourceMissingMeaningCount: 2000,
      availableCount: 1824,
    });
    expect(wordbookRegistry.words).toHaveLength(2124);
    const rows = getWordbookWords('suneung-2000', 'demo', { view: 'all' });
    expect(rows).toHaveLength(2000);
    expect(
      rows.every(
        (row) =>
          /[가-힣]/u.test(row.koreanMeaning) &&
          row.sourceKoreanMeaning === '' &&
          Boolean(row.partOfSpeech?.trim()) &&
          Boolean(row.definitionProvenance?.length) &&
          row.reviewStatus === 'draft',
      ),
    ).toBe(true);
    expect(
      rows.every(
        (row) =>
          row.annotations[0].uncertainties?.includes('pending-independent-review') &&
          !row.annotations[0].uncertainties?.includes('missing-meaning') &&
          !row.annotations[0].uncertainties?.includes('missing-pos'),
      ),
    ).toBe(true);
    const document = wordbookDocumentSchema.parse(importedPdf);
    const sourceDocument = wordbookDocumentSchema.parse(originalPdf);
    expect(sourceDocument.version).toBe('1.0.0');
    expect(
      sourceDocument.entries.every(
        (entry) =>
          entry.koreanMeaning === '' &&
          entry.partOfSpeech === undefined &&
          entry.sourceKoreanMeaning === undefined &&
          entry.definitionProvenance === undefined &&
          entry.reviewStatus === 'draft',
      ),
    ).toBe(true);
    expect(document).toEqual(
      mergeWordbookDefinitions(
        sourceDocument,
        wordbookDefinitionsSchema.parse(importedDefinitions),
      ),
    );
    expect(document.entries.map(({ id, headword, source }) => ({ id, headword, source }))).toEqual(
      sourceDocument.entries.map(({ id, headword, source }) => ({ id, headword, source })),
    );
    const originalRegistry = createWordbookRegistry(catalog.vocabulary, [sourceDocument]);
    expect(rows.map((row) => row.id)).toEqual(
      searchWordbook(originalRegistry, 'suneung-2000', 'demo', { view: 'all' }).map(
        (row) => row.id,
      ),
    );
    expect(document.source).toMatchObject({
      kind: 'pdf',
      pageCount: 25,
      sha256: 'f6fa1e48e07fe59ed20329aa84f89e5b022dea82223a555757a56fb599c3f102',
    });
    expect(rows[0].source).toMatchObject({
      page: 1,
      day: 1,
      row: 1,
      column: 1,
      originalText: '1 provide',
    });
    expect(getWordbookWords('suneung-2000', 'demo', { view: 'all', day: 50 })).toHaveLength(40);
  });

  it('keeps source spelling issues explicit and preserves verified common senses after dictionary selection', () => {
    const rows = getWordbookWords('suneung-2000', 'demo', { view: 'all' });
    for (const [headword, lookupHeadword, flag] of [
      ['vaccum', 'vacuum', 'source-headword-spelling'],
      ['lagacy', 'legacy', 'source-spelling-check'],
    ]) {
      const row = rows.find((word) => word.headword === headword)!;
      expect(row).toBeDefined();
      expect(
        row.definitionProvenance?.some((source) => source.lookupHeadword === lookupHeadword),
      ).toBe(true);
      expect(row.annotations[0].uncertainties).toContain(flag);
      expect(row.reviewStatus).toBe('draft');
    }
    for (const [headword, meaning, partOfSpeech] of [
      ['broad', '넓은', 'adjective'],
      ['lately', '최근', 'adverb'],
      ['mature', '성숙', 'adjective'],
      ['vigor', '활력', 'noun'],
      ['except', '제외', 'preposition'],
    ]) {
      const row = rows.find((word) => word.headword === headword)!;
      expect(row.koreanMeaning).toContain(meaning);
      expect(row.partOfSpeech).toContain(partOfSpeech);
    }
  });

  it('hides overlaps by default and searches linked meanings without relabeling them as PDF meanings', () => {
    expect(
      getWordbookWords('suneung-2000', 'demo', { query: 'adapt' }).some(
        (word) => word.headword === 'adapt',
      ),
    ).toBe(false);
    const linked = getWordbookWords('suneung-2000', 'demo', {
      query: '적응하다',
      view: 'all',
    }).find((word) => word.headword === 'adapt');
    expect(linked).toMatchObject({
      id: 'v-adapt-sense1',
      isOverlap: true,
      sourceKoreanMeaning: '',
      existingMeaning: { bookId: 'advanced-300', koreanMeaning: '적응하다' },
    });
    expect(linked?.koreanMeaning).toMatch(/[가-힣]/u);
    expect(linked?.definitionProvenance?.length).toBeGreaterThan(0);
    expect(linked?.annotations).toHaveLength(1);
  });

  it('makes both owner-accepted books available without changing historical source approval', () => {
    expect(getWordbooks('learner').map((item) => item.title)).toEqual([
      '중등 심화 300',
      '수능 영어 2000',
    ]);
    expect(getWordbooks('learner').map((item) => item.availableCount)).toEqual([300, 1824]);
    expect(getWordbookWords('advanced-300', 'learner')).toHaveLength(300);
    expect(getWordbookWords('suneung-2000', 'learner', { view: 'all' })).toHaveLength(2000);
    expect(originalPdf.entries.every((entry) => entry.reviewStatus === 'draft')).toBe(true);
    expect(importedPdf.entries.every((entry) => entry.reviewStatus === 'draft')).toBe(true);
    expect(getWordbookWords('unknown-book', 'learner')).toEqual([]);
  });
});

describe('future registration and source annotations', () => {
  const first = () =>
    book('future-one', 100, [
      [' ＡＤＡＰＴ ', '고치다'],
      ['bank', '은행'],
      ['BANK', '강둑'],
      ['co‑operate', '협력하다'],
      ['look after', '돌보다'],
      ['worker’s', '노동자의'],
    ]);
  const second = () =>
    book('future-two', 101, [
      ['Bank', '쌓다'],
      ['co-operate', '협동하다'],
      ['give up', '포기하다'],
      ['look after', '보살피다'],
      ['novel', '소설'],
    ]);

  it('deduplicates across two future books, retains homograph meanings and never overwrites earlier ownership', () => {
    const original = structuredClone(catalog.vocabulary);
    const base = createWordbookRegistry(catalog.vocabulary);
    const once = registerWordbooks(base, [first()]);
    const twice = registerWordbooks(once, [second()]);
    expect(base.books).toHaveLength(3);
    expect(once.books).toHaveLength(4);
    expect(catalog.vocabulary).toEqual(original);
    expect(summarizeWordbooks(twice, 'demo').slice(-2)).toMatchObject([
      {
        id: 'future-one',
        originalCount: 6,
        uniqueCount: 5,
        newCount: 4,
        overlapCount: 1,
        internalDuplicateCount: 1,
      },
      {
        id: 'future-two',
        originalCount: 5,
        uniqueCount: 5,
        newCount: 2,
        overlapCount: 3,
        internalDuplicateCount: 0,
      },
    ]);
    const bank = searchWordbook(twice, 'future-one', 'demo', { query: 'bank' })[0];
    expect(bank.annotations.map((entry) => entry.koreanMeaning)).toEqual(['은행', '강둑']);
    const otherBank = searchWordbook(twice, 'future-two', 'demo', {
      view: 'all',
      query: '쌓다',
    })[0];
    expect(otherBank.id).toBe(bank.id);
    expect(otherBank.koreanMeaning).toBe('쌓다');
    expect(searchWordbook(twice, 'future-two', 'demo').map((word) => word.headword)).toEqual([
      'give up',
      'novel',
    ]);
    expect(searchWordbook(once, 'future-one', 'demo')).toEqual(
      searchWordbook(twice, 'future-one', 'demo'),
    );
  });

  it('uses explicit priority and stable lexical IDs independent of filenames or input order', () => {
    const ascending = createWordbookRegistry(catalog.vocabulary, [first(), second()]);
    const reversed = createWordbookRegistry(catalog.vocabulary, [second(), first()]);
    expect(reversed).toEqual(ascending);
    const renamed = first();
    renamed.id = 'renamed-book';
    renamed.version = '2.0.0';
    renamed.source.filename = 'different-file.json';
    const differentContainer = createWordbookRegistry(catalog.vocabulary, [renamed]);
    expect(searchWordbook(differentContainer, renamed.id, 'demo', { query: 'bank' })[0].id).toBe(
      searchWordbook(ascending, 'future-one', 'demo', { query: 'bank' })[0].id,
    );
    expect(() => registerWordbooks(ascending, [second()])).toThrow('ID');
    expect(() =>
      registerWordbooks(ascending, [book('late-insert', 99, [['zebra', '얼룩말']])]),
    ).toThrow('priority');
    expect(() =>
      createWordbookRegistry(catalog.vocabulary, [first(), { ...second(), priority: 100 }]),
    ).toThrow('priority');
  });

  it('rejects an ID collision instead of merging unrelated words and keeps query results detached', () => {
    const vocabulary = structuredClone(catalog.vocabulary.slice(0, 1));
    vocabulary[0].id = canonicalWordId('quasar');
    expect(() =>
      createWordbookRegistry(vocabulary, [book('collision', 100, [['quasar', '퀘이사']])]),
    ).toThrow('충돌');
    const registry = createWordbookRegistry(catalog.vocabulary, [first()]);
    const selected = searchWordbook(registry, 'future-one', 'demo', { view: 'all', day: 2 });
    expect(selected.map((word) => word.headword)).toEqual(['BANK', 'co‑operate']);
    selected[0].source.row = 999;
    selected[0].annotations[0].koreanMeaning = 'changed';
    expect(
      searchWordbook(registry, 'future-one', 'demo', { query: 'bank' })[0].annotations.map(
        (entry) => entry.koreanMeaning,
      ),
    ).toEqual(['은행', '강둑']);
    expect(registry.books.at(-1)!.entries[2].source.row).toBe(3);
  });

  it('gates approval per source membership and per annotation, including existing-meaning fallback', () => {
    const vocabulary = structuredClone(catalog.vocabulary);
    vocabulary.find((word) => word.id === 'v-adapt-sense1')!.reviewStatus = 'approved';
    const source = first();
    source.entries[1].reviewStatus = 'approved';
    const registry = createWordbookRegistry(vocabulary, [source]);
    const learnerRows = searchWordbook(registry, source.id, 'learner', { view: 'all' });
    expect(learnerRows.map((word) => word.headword)).toEqual(['bank']);
    expect(learnerRows[0].annotations.map((entry) => entry.koreanMeaning)).toEqual(['은행']);
    expect(
      searchWordbook(registry, source.id, 'learner', { query: '적응하다', view: 'all' }),
    ).toEqual([]);
    source.entries[0].reviewStatus = 'approved';
    const reviewed = createWordbookRegistry(vocabulary, [source]);
    expect(
      searchWordbook(reviewed, source.id, 'learner', { query: 'adapt', view: 'all' })[0],
    ).toMatchObject({ koreanMeaning: '고치다', existingMeaning: { koreanMeaning: '적응하다' } });
    vocabulary.find((word) => word.id === 'v-adapt-sense1')!.reviewStatus = 'draft';
    expect(
      searchWordbook(createWordbookRegistry(vocabulary, [source]), source.id, 'learner', {
        query: 'adapt',
        view: 'all',
      })[0].existingMeaning,
    ).toBeUndefined();
  });

  it('rejects duplicate row IDs, invalid source references and approval with missing meaning or unresolved review', () => {
    const duplicate = first();
    duplicate.entries[1].id = duplicate.entries[0].id;
    expect(wordbookDocumentSchema.safeParse(duplicate).success).toBe(false);
    const pdf = structuredClone(importedPdf);
    pdf.entries[0].source.page = 26;
    expect(wordbookDocumentSchema.safeParse(pdf).success).toBe(false);
    const missing = book('blank', 100, [['bank', '']]);
    expect(wordbookDocumentSchema.safeParse(missing).success).toBe(true);
    missing.entries[0].reviewStatus = 'approved';
    expect(wordbookDocumentSchema.safeParse(missing).success).toBe(false);
    missing.entries[0].koreanMeaning = '은행';
    missing.entries[0].uncertainties = ['check-meaning'];
    expect(wordbookDocumentSchema.safeParse(missing).success).toBe(false);
    missing.entries[0].uncertainties = [];
    expect(wordbookDocumentSchema.safeParse(missing).success).toBe(true);
    expect(
      wordbookDocumentSchema.safeParse({
        ...missing,
        entries: [{ ...missing.entries[0], exampleEn: 'Invented.' }],
      }).success,
    ).toBe(false);
  });
});
