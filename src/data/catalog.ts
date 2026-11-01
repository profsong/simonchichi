import seed from './seed-content.json';
import { contentSchema, type ContentBank } from './content-schema';
import type { AppMode } from '../core/types';

// Structural validation never grants educational approval.
export const catalog: ContentBank = contentSchema.parse(seed);
export const contentVersion = catalog.contentVersion;

export function approvedCatalog(source: ContentBank): ContentBank {
  const vocabulary = source.vocabulary.filter((item) => item.reviewStatus === 'approved');
  const vocabIds = new Set(vocabulary.map((item) => item.id));
  const syntax = source.syntax.filter((item) => item.reviewStatus === 'approved');
  const syntaxIds = new Set(syntax.map((item) => item.id));
  // Reading question approval deliberately inherits the parent passage.
  const readings = source.readings.filter((item) => item.reviewStatus === 'approved');
  const readingIds = new Set(readings.map((item) => item.id));
  const passages = source.diagnostic.passages.filter((item) => item.reviewStatus === 'approved');
  const passageIds = new Set(passages.map((item) => item.id));
  return {
    ...source,
    vocabulary,
    vocabularyQuestions: source.vocabularyQuestions.filter(
      (item) => item.reviewStatus === 'approved' && vocabIds.has(item.vocabId),
    ),
    syntax,
    readings,
    diagnostic: {
      ...source.diagnostic,
      passages,
      items: source.diagnostic.items.filter(
        (item) =>
          item.reviewStatus === 'approved' &&
          (item.type !== 'reading' || passageIds.has(item.passageId)),
      ),
    },
    weekPlans: source.weekPlans.map((plan) => ({
      ...plan,
      vocabularyIds: plan.vocabularyIds.filter((id) => vocabIds.has(id)),
      syntaxIds: plan.syntaxIds.filter((id) => syntaxIds.has(id)),
      readingIds: plan.readingIds.filter((id) => readingIds.has(id)),
    })),
    dailyPlans: source.dailyPlans
      .map((plan) => ({
        ...plan,
        vocabularyIds: plan.vocabularyIds.filter((id) => vocabIds.has(id)),
      }))
      .filter(
        (plan) =>
          plan.vocabularyIds.length > 0 &&
          syntaxIds.has(plan.syntaxId) &&
          readingIds.has(plan.readingId),
      ),
    bossQuests: source.bossQuests.filter(
      (plan) =>
        plan.reviewStatus === 'approved' &&
        plan.vocabularyIds.every((id) => vocabIds.has(id)) &&
        plan.syntaxIds.every((id) => syntaxIds.has(id)) &&
        readingIds.has(plan.readingId),
    ),
  };
}

const learnerCatalog = approvedCatalog(catalog);

/** The application entry point must restrict the explicit demo mode to developer builds. */
export function getCatalog(mode: AppMode): ContentBank {
  return mode === 'demo' ? catalog : learnerCatalog;
}
