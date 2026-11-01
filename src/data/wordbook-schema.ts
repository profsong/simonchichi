import { z } from 'zod';
import { reviewStatusSchema } from './content-schema';

const text = z.string().trim().min(1).max(2000);
const identifier = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/)
  .max(200);

export const wordbookSourceSchema = z.strictObject({
  kind: z.enum(['curriculum', 'pdf', 'csv', 'json']),
  filename: text,
  license: text,
  sha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  pageCount: z.number().int().positive().optional(),
});

export const wordbookLocationSchema = z.strictObject({
  row: z.number().int().positive(),
  page: z.number().int().positive().optional(),
  day: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  originalText: z.string().max(10000).optional(),
  sourceGroup: text.optional(),
});

export const definitionProvenanceSchema = z.strictObject({
  sourceId: identifier,
  url: z.url().refine((value) => ['https:', 'http:', 'app:'].includes(new URL(value).protocol)),
  license: text,
  method: z.enum([
    'bulk-dictionary-selection',
    'definition-based-editorial-translation',
    'existing-curriculum',
  ]),
  lookupHeadword: text.optional(),
  notes: z.string().max(10000).optional(),
});

export const wordbookEntrySchema = z
  .strictObject({
    id: identifier,
    headword: z.string().trim().min(1).max(200),
    // A blank source cell is preserved; it is never translated or guessed at import.
    koreanMeaning: z.string().max(2000),
    sourceKoreanMeaning: z.string().max(2000).optional(),
    definitionProvenance: z.array(definitionProvenanceSchema).min(1).max(20).optional(),
    partOfSpeech: text.optional(),
    reviewStatus: reviewStatusSchema,
    source: wordbookLocationSchema,
    notes: z.string().max(10000).optional(),
    uncertainties: z.array(text).max(30).optional(),
  })
  .superRefine((entry, context) => {
    if ((entry.sourceKoreanMeaning !== undefined) !== (entry.definitionProvenance !== undefined))
      context.addIssue({
        code: 'custom',
        message: '추가한 뜻에는 원문 뜻과 뜻 출처가 함께 필요합니다.',
      });
    if (
      entry.reviewStatus === 'approved' &&
      (!entry.koreanMeaning.trim() || entry.uncertainties?.length)
    )
      context.addIssue({
        code: 'custom',
        message: '승인 항목에는 검수한 뜻이 필요하며 미해결 확인 사항이 없어야 합니다.',
      });
  });

export const wordbookDefinitionsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  wordbookId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .max(100),
  sourceSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  version: text,
  entries: z
    .array(
      z.strictObject({
        entryId: identifier,
        headword: z.string().trim().min(1).max(200),
        koreanMeaning: text,
        partOfSpeech: text.optional(),
        definitionProvenance: z.array(definitionProvenanceSchema).min(1).max(20),
        uncertainties: z.array(text).max(30).optional(),
      }),
    )
    .min(1)
    .max(100000),
});

export const wordbookDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .max(100),
    version: text,
    title: text,
    descriptionKo: text.optional(),
    // Append new books with a greater priority. Filename changes cannot reorder ownership.
    priority: z.number().int().nonnegative(),
    source: wordbookSourceSchema,
    entries: z.array(wordbookEntrySchema).min(1).max(100000),
  })
  .superRefine((book, context) => {
    if (new Set(book.entries.map((entry) => entry.id)).size !== book.entries.length)
      context.addIssue({ code: 'custom', path: ['entries'], message: '원문 행 ID가 중복됩니다.' });
    if (book.source.kind === 'pdf' && (!book.source.sha256 || !book.source.pageCount))
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'PDF 출처의 SHA-256과 페이지 수가 필요합니다.',
      });
    for (const [index, entry] of book.entries.entries()) {
      if (
        book.source.kind === 'pdf' &&
        (!entry.source.page || entry.source.page > book.source.pageCount!)
      )
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'source', 'page'],
          message: '원문 페이지를 확인해 주세요.',
        });
    }
  });

export type WordbookDocument = z.infer<typeof wordbookDocumentSchema>;
export type WordbookEntry = z.infer<typeof wordbookEntrySchema>;
export type WordbookSource = z.infer<typeof wordbookSourceSchema>;
export type WordbookLocation = z.infer<typeof wordbookLocationSchema>;
export type DefinitionProvenance = z.infer<typeof definitionProvenanceSchema>;
export type WordbookDefinitions = z.infer<typeof wordbookDefinitionsSchema>;
