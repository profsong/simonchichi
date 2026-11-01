import { z } from 'zod';

const text = z.string().trim().min(1);
const id = text;
const level = z.enum(['B0', 'B1', 'B2', 'B3', 'B4']);
export const reviewStatusSchema = z.enum(['draft', 'validated', 'approved']);
const metadata = {
  id,
  level,
  license: text,
  reviewStatus: reviewStatusSchema,
  version: z.number().int().positive(),
};
const scheduled = {
  ...metadata,
  tags: z.array(text).min(1),
  estimatedSeconds: z.number().int().positive(),
  week: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(5),
};
const normalize = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const uniqueStrings = (values: string[]) => new Set(values.map(normalize)).size === values.length;
const choices = z.array(text).length(4).refine(uniqueStrings, '선택지가 중복됩니다.');
const question = {
  id,
  promptKo: text,
  choices,
  correctIndex: z.number().int().min(0).max(3),
  explanationKo: text,
};

export const vocabularySchema = z
  .object({
    ...scheduled,
    type: z.literal('vocab'),
    headword: text,
    senseId: text,
    partOfSpeech: text,
    koreanMeaning: text,
    englishDefinition: text,
    exampleEn: text,
    exampleKo: text,
    collocations: z.array(text).min(1),
    acceptedAnswers: z.array(text).min(1).refine(uniqueStrings, '허용 답이 중복됩니다.'),
    distractors: z.array(text).length(3),
    sourceGroup: text,
    dailyOrder: z.number().int().min(1).max(5),
  })
  .strict()
  .superRefine((word, ctx) => {
    if (!uniqueStrings([word.koreanMeaning, ...word.distractors])) {
      ctx.addIssue({
        code: 'custom',
        path: ['distractors'],
        message: '정답과 오답은 서로 달라야 합니다.',
      });
    }
  });
export const vocabularyQuestionSchema = z
  .object({
    ...scheduled,
    ...question,
    type: z.enum(['vocab_en_to_ko', 'vocab_ko_to_en']),
    vocabId: id,
    exampleEn: text,
  })
  .strict();
export const syntaxSchema = z
  .object({
    ...scheduled,
    ...question,
    type: z.literal('syntax'),
    sentenceEn: text,
    focus: text,
    sourceGroup: text,
  })
  .strict();
const readingQuestionSchema = z
  .object({
    ...question,
    type: z.literal('reading'),
    questionType: text.optional(),
    evidenceQuote: text,
  })
  .strict();
export const readingSchema = z
  .object({
    ...scheduled,
    type: z.literal('reading'),
    title: text,
    passageEn: text,
    wordCount: z.number().int().positive(),
    questions: z.array(readingQuestionSchema).length(2),
    sourceGroup: text,
  })
  .strict()
  .superRefine((passage, ctx) => {
    if (passage.wordCount !== passage.passageEn.split(/\s+/).length) {
      ctx.addIssue({
        code: 'custom',
        path: ['wordCount'],
        message: '지문 단어 수가 일치하지 않습니다.',
      });
    }
    passage.questions.forEach((item, index) => {
      if (!passage.passageEn.includes(item.evidenceQuote)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'evidenceQuote'],
          message: '근거가 본문에 없습니다.',
        });
      }
    });
  });
const diagnosticQuestionSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...metadata,
      ...question,
      type: z.literal('vocab'),
      focus: text,
      headword: text,
      exampleEn: text,
    })
    .strict(),
  z
    .object({ ...metadata, ...question, type: z.literal('syntax'), focus: text, sentenceEn: text })
    .strict(),
  z
    .object({
      ...metadata,
      ...question,
      type: z.literal('reading'),
      focus: text,
      passageId: id,
      evidenceQuote: text,
    })
    .strict(),
]);
const diagnosticPassageSchema = z
  .object({
    ...metadata,
    title: text,
    passageEn: text,
    wordCount: z.number().int().positive(),
  })
  .strict()
  .refine(
    (passage) => passage.wordCount === passage.passageEn.split(/\s+/).length,
    '진단 지문 단어 수가 일치하지 않습니다.',
  );
const ids = z.array(id).refine(uniqueStrings, '참조 ID가 중복됩니다.');
const weekPlanSchema = z
  .object({
    id,
    week: z.number().int().min(1).max(12),
    titleKo: text,
    vocabFocusKo: text,
    readingGoalKo: text,
    weekdays: z
      .array(z.number().int().min(1).max(5))
      .length(5)
      .refine((days) => new Set(days).size === 5),
    saturday: z.literal('optional_boss'),
    sunday: z.literal('optional_rest_or_review'),
    vocabularyIds: ids.length(25),
    syntaxIds: ids.length(5),
    readingIds: ids.length(5),
  })
  .strict();
const dailyPlanSchema = z
  .object({
    id,
    week: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(5),
    targetMinutes: z.number().positive(),
    contentReviewTarget: z.number().int().nonnegative(),
    phaseDurationsMinutes: z
      .object({
        review: z.number().positive(),
        vocab: z.number().positive(),
        syntax: z.number().positive(),
        reading: z.number().positive(),
      })
      .strict(),
    vocabularyIds: ids.length(5),
    syntaxId: id,
    readingId: id,
    readingQuestionIds: ids.length(2),
    isFixedSchedule: z.literal(false),
    allowSrsAdjustment: z.literal(true),
  })
  .strict();
const bossSchema = z
  .object({
    id,
    week: z.number().int().min(1).max(12),
    titleKo: text,
    isReview: z.literal(true),
    availability: z.literal('after_day5'),
    vocabularyIds: ids.length(8),
    syntaxIds: ids.length(2),
    readingId: id,
    readingQuestionIds: ids.length(2),
    recommendedMinutes: z.number().positive(),
    scoring: z
      .object({
        correctXp: z.number().int().nonnegative(),
        firstAttemptOnly: z.literal(true),
        noStreakPenalty: z.literal(true),
        reviewNotNew: z.literal(true),
      })
      .strict(),
    reviewStatus: reviewStatusSchema,
  })
  .strict();

export const contentSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: text,
    generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    noticeKo: text,
    levelScaleKo: z.object({ B1: text, B2: text, B3: text }).strict(),
    licenseNotice: text,
    vocabulary: z.array(vocabularySchema),
    vocabularyQuestions: z.array(vocabularyQuestionSchema),
    syntax: z.array(syntaxSchema),
    readings: z.array(readingSchema),
    diagnostic: z
      .object({
        items: z.array(diagnosticQuestionSchema),
        passages: z.array(diagnosticPassageSchema),
        scoringPolicy: z.literal('recommend_level_only'),
      })
      .strict(),
    weekPlans: z.array(weekPlanSchema),
    dailyPlans: z.array(dailyPlanSchema),
    bossQuests: z.array(bossSchema),
  })
  .strict()
  .superRefine((bank, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const allIds = new Set<string>();
    const groups = [
      bank.vocabulary,
      bank.vocabularyQuestions,
      bank.syntax,
      bank.readings,
      bank.readings.flatMap((p) => p.questions),
      bank.diagnostic.items,
      bank.diagnostic.passages,
      bank.weekPlans,
      bank.dailyPlans,
      bank.bossQuests,
    ];
    for (const group of groups)
      for (const item of group) {
        if (allIds.has(item.id)) issue([], `중복 ID: ${item.id}`);
        allIds.add(item.id);
      }
    if (!uniqueStrings(bank.vocabulary.map((v) => v.senseId)))
      issue(['vocabulary'], '뜻 ID가 중복됩니다.');
    const vocabulary = new Map(bank.vocabulary.map((v) => [v.id, v]));
    const syntax = new Map(bank.syntax.map((v) => [v.id, v]));
    const readings = new Map(bank.readings.map((v) => [v.id, v]));
    bank.vocabularyQuestions.forEach((item, index) => {
      const word = vocabulary.get(item.vocabId);
      if (!word) issue(['vocabularyQuestions', index, 'vocabId'], '없는 단어를 참조합니다.');
      else {
        const answer = item.choices[item.correctIndex];
        const expected =
          item.type === 'vocab_en_to_ko' ? [word.koreanMeaning] : word.acceptedAnswers;
        if (!expected.some((value) => normalize(value) === normalize(answer)))
          issue(
            ['vocabularyQuestions', index, 'correctIndex'],
            '정답이 단어의 검수 답과 다릅니다.',
          );
        if (
          item.choices.filter((choice) =>
            expected.some((value) => normalize(value) === normalize(choice)),
          ).length !== 1
        )
          issue(
            ['vocabularyQuestions', index, 'choices'],
            '허용 답에 해당하는 선택지는 정확히 하나여야 합니다.',
          );
      }
    });
    bank.diagnostic.items.forEach((item, index) => {
      if (item.type !== 'reading') return;
      const passage = bank.diagnostic.passages.find((p) => p.id === item.passageId);
      if (!passage || !passage.passageEn.includes(item.evidenceQuote))
        issue(['diagnostic', 'items', index], '진단 지문 또는 근거가 없습니다.');
    });
    bank.weekPlans.forEach((plan, index) => {
      for (const key of ['vocabularyIds', 'syntaxIds', 'readingIds'] as const) {
        const source =
          key === 'vocabularyIds' ? vocabulary : key === 'syntaxIds' ? syntax : readings;
        if (plan[key].some((ref) => source.get(ref)?.week !== plan.week))
          issue(['weekPlans', index, key], '없는 항목 또는 다른 주의 학습 항목을 참조합니다.');
      }
    });
    for (const [name, plans] of [
      ['dailyPlans', bank.dailyPlans],
      ['bossQuests', bank.bossQuests],
    ] as const) {
      plans.forEach((plan, index) => {
        if (plan.vocabularyIds.some((ref) => !vocabulary.has(ref)))
          issue([name, index, 'vocabularyIds'], '없는 단어를 참조합니다.');
        const syntaxIds = 'syntaxId' in plan ? [plan.syntaxId] : plan.syntaxIds;
        if (syntaxIds.some((ref) => syntax.get(ref)?.week !== plan.week))
          issue([name, index, 'syntaxId'], '없는 구문 또는 다른 주의 구문을 참조합니다.');
        if (plan.vocabularyIds.some((ref) => vocabulary.get(ref)?.week !== plan.week))
          issue([name, index, 'vocabularyIds'], '다른 주의 단어를 참조합니다.');
        if (
          'day' in plan &&
          plan.vocabularyIds.some((ref) => vocabulary.get(ref)?.day !== plan.day)
        )
          issue([name, index, 'vocabularyIds'], '다른 날의 새 단어를 참조합니다.');
        const reading = readings.get(plan.readingId);
        if (
          !reading ||
          reading.week !== plan.week ||
          plan.readingQuestionIds.some((ref) => !reading.questions.some((q) => q.id === ref))
        )
          issue([name, index, 'readingQuestionIds'], '지문과 질문 참조가 일치하지 않습니다.');
      });
    }
  });

export type ContentBank = z.infer<typeof contentSchema>;
export type Vocabulary = z.infer<typeof vocabularySchema>;
export type VocabularyQuestion = z.infer<typeof vocabularyQuestionSchema>;
export type Reading = z.infer<typeof readingSchema>;
