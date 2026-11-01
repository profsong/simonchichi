import { readFileSync } from 'node:fs';
import { contentSchema } from '../src/data/content-schema';

const raw: unknown = JSON.parse(
  readFileSync(new URL('../src/data/seed-content.json', import.meta.url), 'utf8'),
);
const result = contentSchema.safeParse(raw);
if (!result.success) {
  console.error('Content validation failed:', result.error.issues);
  process.exit(1);
}
const bank = result.data;
const counts = {
  vocabulary: bank.vocabulary.length,
  vocabularyQuestions: bank.vocabularyQuestions.length,
  syntax: bank.syntax.length,
  readings: bank.readings.length,
  readingQuestions: bank.readings.flatMap((p) => p.questions).length,
  diagnostic: bank.diagnostic.items.length,
  diagnosticPassages: bank.diagnostic.passages.length,
  dailyPlans: bank.dailyPlans.length,
  weekPlans: bank.weekPlans.length,
  bossQuests: bank.bossQuests.length,
};
const expected = {
  vocabulary: 300,
  vocabularyQuestions: 600,
  syntax: 60,
  readings: 60,
  readingQuestions: 120,
  diagnostic: 30,
  diagnosticPassages: 4,
  dailyPlans: 60,
  weekPlans: 12,
  bossQuests: 12,
};
const errors: string[] = [];
for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
  if (counts[key] !== expected[key])
    errors.push(`${key}: expected ${expected[key]}, got ${counts[key]}`);
}
for (const plan of bank.dailyPlans) {
  if (plan.vocabularyIds.length !== 5 || plan.readingQuestionIds.length !== 2)
    errors.push(`${plan.id}: expected 5 vocabulary cards and 2 reading questions`);
}
for (const field of ['vocabularyIds', 'syntaxId', 'readingId'] as const) {
  const ids = bank.dailyPlans.flatMap((plan) => plan[field]);
  if (new Set(ids).size !== ids.length)
    errors.push(`Repeated daily curriculum reference: ${field}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.info(
  'PASS: content structure, stable IDs, references, choices, passage evidence, and curriculum counts.',
);
console.info(counts);
console.info(
  `Approved vocabulary: ${bank.vocabulary.filter((word) => word.reviewStatus === 'approved').length}/300. Structural checks do not grant educational approval.`,
);
