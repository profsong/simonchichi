import { z } from 'zod';

const text = z.string().trim().min(1);
const ids = z.array(text).refine((rows) => new Set(rows).size === rows.length);
const choices = z
  .array(text)
  .length(4)
  .refine((rows) => new Set(rows.map((row) => row.toLowerCase())).size === 4);
const question = {
  id: text,
  promptKo: text,
  choices,
  correctIndex: z.number().int().min(0).max(3),
  explanationKo: text,
};
const authored = {
  targetWordIds: ids.min(1),
  license: text,
  reviewStatus: z.literal('approved'),
};
export const courseWordSchema = z.object({
  id: text,
  sourceEntryId: text,
  headword: text,
  sourceHeadword: text,
  koreanMeaning: text,
  partOfSpeech: text,
  acceptedAnswers: z.array(text).min(1),
  exampleEn: text.optional(),
  exampleKo: text.optional(),
  collocations: z.array(text).optional(),
});
export const courseLessonSchema = z.object({
  id: text,
  number: z.number().int().positive(),
  title: text,
  wordIds: ids.length(20),
  sourceEntryIds: ids.length(20),
  syntax: z.array(z.object({ ...question, ...authored, sentenceEn: text, focus: text })).length(2),
  readings: z
    .array(
      z.object({
        id: text,
        title: text,
        passageEn: text,
        ...authored,
        question: z.object({ ...question, evidenceQuote: text }),
      }),
    )
    .length(2),
});
export const courseDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.enum(['advanced-300', 'suneung-2000']),
    title: text,
    version: text,
    sourceWordbookIds: ids.min(1),
    vocabulary: z.array(courseWordSchema).min(20),
    lessons: z.array(courseLessonSchema).min(1),
  })
  .superRefine((course, ctx) => {
    const words = new Map(course.vocabulary.map((word) => [word.id, word]));
    const allIds: string[] = [];
    const scheduled: string[] = [];
    course.lessons.forEach((lesson, index) => {
      allIds.push(lesson.id);
      scheduled.push(...lesson.wordIds);
      if (
        lesson.number !== index + 1 ||
        lesson.id !== `course:${course.id}:stage:${String(index + 1).padStart(3, '0')}`
      )
        ctx.addIssue({ code: 'custom', message: '과정 회차 ID와 순서를 확인해 주세요.' });
      const targets = new Set(lesson.wordIds);
      if (lesson.wordIds.some((id) => !words.has(id)))
        ctx.addIssue({ code: 'custom', message: '과정에 없는 단어입니다.' });
      for (const task of [...lesson.syntax, ...lesson.readings]) {
        allIds.push(task.id);
        if (task.targetWordIds.some((id) => !targets.has(id)))
          ctx.addIssue({
            code: 'custom',
            message: '문장·독해는 같은 회차 단어를 사용해야 합니다.',
          });
      }
      for (const reading of lesson.readings) {
        allIds.push(reading.question.id);
        if (!reading.passageEn.includes(reading.question.evidenceQuote))
          ctx.addIssue({ code: 'custom', message: '독해의 근거가 본문에 없습니다.' });
      }
    });
    const count = course.id === 'advanced-300' ? 300 : 2000;
    if (
      course.vocabulary.length !== count ||
      course.lessons.length !== count / 20 ||
      new Set(scheduled).size !== count ||
      words.size !== count ||
      new Set(allIds).size !== allIds.length
    )
      ctx.addIssue({ code: 'custom', message: '단어장별 분량·고유 ID를 확인해 주세요.' });
  });

export type CourseDocument = z.infer<typeof courseDocumentSchema>;
export type CourseWord = z.infer<typeof courseWordSchema>;
export type CourseLesson = z.infer<typeof courseLessonSchema>;
