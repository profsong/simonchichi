import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSchema } from '../src/data/content-schema';
import { wordbookDefinitionsSchema, wordbookDocumentSchema } from '../src/data/wordbook-schema';
import {
  createWordbookRegistry,
  mergeWordbookDefinitions,
  summarizeWordbooks,
} from '../src/core/wordbook';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(root, 'content_src', 'wordbooks');
const targetDirectory = join(root, 'src', 'data', 'wordbooks');
const definitionsDirectory = join(sourceDirectory, 'definitions');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((argument) => argument !== '--check'))
  throw new Error('Usage: tsx scripts/sync-wordbooks.ts [--check]');

const sourceFiles = (await readdir(sourceDirectory))
  .filter((file) => file.endsWith('.json'))
  .sort();
const originalDocuments = await Promise.all(
  sourceFiles.map(async (file) => {
    const raw: unknown = JSON.parse(await readFile(join(sourceDirectory, file), 'utf8'));
    return wordbookDocumentSchema.parse(raw);
  }),
);
const definitionFiles = (await readdir(definitionsDirectory).catch(() => [] as string[]))
  .filter((file) => file.endsWith('.json'))
  .sort();
const definitions = await Promise.all(
  definitionFiles.map(async (file) =>
    wordbookDefinitionsSchema.parse(
      JSON.parse(await readFile(join(definitionsDirectory, file), 'utf8')),
    ),
  ),
);
const byBook = new Map(definitions.map((item) => [item.wordbookId, item]));
if (byBook.size !== definitions.length) throw new Error('같은 단어장의 뜻 보완 파일이 중복됩니다.');
for (const overlay of definitions)
  if (!originalDocuments.some((book) => book.id === overlay.wordbookId))
    throw new Error(`원본 단어장이 없는 뜻 보완 파일입니다: ${overlay.wordbookId}`);
const documents = originalDocuments.map((book) => {
  const overlay = byBook.get(book.id);
  return overlay ? mergeWordbookDefinitions(book, overlay) : book;
});
const seed = contentSchema.parse(
  JSON.parse(await readFile(join(root, 'src', 'data', 'seed-content.json'), 'utf8')),
);
const registry = createWordbookRegistry(seed.vocabulary, documents);
// Refuse stale generated books; never silently erase a source or a published list.
const targetFiles = (await readdir(targetDirectory).catch(() => [] as string[])).filter((file) =>
  file.endsWith('.json'),
);
const expectedFiles = new Set(documents.map((book) => `${book.id}.json`));
for (const file of targetFiles)
  if (!expectedFiles.has(file)) throw new Error(`원본이 없는 생성 단어장입니다: ${file}`);

if (!check) await mkdir(targetDirectory, { recursive: true });
for (const book of documents) {
  const path = join(targetDirectory, `${book.id}.json`);
  const expected = `${JSON.stringify(book, null, 2)}\n`;
  if (check) {
    if ((await readFile(path, 'utf8').catch(() => '')) !== expected)
      throw new Error(`생성 파일이 최신이 아닙니다. 단어장 동기화를 실행해 주세요: ${book.id}`);
  } else await writeFile(path, expected, 'utf8');
}

console.log(
  JSON.stringify(
    {
      status: check ? 'validated' : 'synced',
      canonicalWordCount: registry.words.length,
      existingVocabularyIds: registry.words.flatMap((word) => word.existingVocabularyIds).length,
      books: summarizeWordbooks(registry, 'demo').map(
        ({
          id,
          originalCount,
          uniqueCount,
          newCount,
          overlapCount,
          internalDuplicateCount,
          missingMeaningCount,
          sourceMissingMeaningCount,
        }) => ({
          id,
          originalCount,
          uniqueCount,
          newCount,
          overlapCount,
          internalDuplicateCount,
          missingMeaningCount,
          sourceMissingMeaningCount,
        }),
      ),
    },
    null,
    2,
  ),
);
