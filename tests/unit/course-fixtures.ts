import type { CourseDocument } from '../../src/data/course-schema';
import type { CourseId, ReviewState } from '../../src/core/types';

export function fixtureCourse(id: CourseId): CourseDocument {
  const count = id === 'advanced-300' ? 300 : 2000;
  const vocabulary = Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'v-adapt-sense1' : `fixture-${id}-${index}`,
    sourceEntryId: `source-${id}-${index}`,
    headword: index === 0 ? 'adapt' : `term${index}`,
    sourceHeadword: index === 0 ? 'adapt' : `term${index}`,
    koreanMeaning: index === 0 ? '적응하다' : `뜻${index}`,
    partOfSpeech: 'noun',
    acceptedAnswers: [index === 0 ? 'adapt' : `term${index}`],
  }));
  return {
    schemaVersion: 1,
    id,
    title: id,
    version: 'test-1',
    sourceWordbookIds: [id],
    vocabulary,
    lessons: Array.from({ length: count / 20 }, (_, index) => {
      const planId = `course:${id}:stage:${String(index + 1).padStart(3, '0')}`;
      const words = vocabulary.slice(index * 20, (index + 1) * 20);
      const authored = {
        targetWordIds: [words[0].id],
        license: 'original',
        reviewStatus: 'approved' as const,
      };
      const question = {
        promptKo: '알맞은 답은?',
        choices: ['정답', '오답1', '오답2', '오답3'],
        correctIndex: 0,
        explanationKo: '본문에서 확인해요.',
      };
      return {
        id: planId,
        number: index + 1,
        title: `회차 ${index + 1}`,
        wordIds: words.map((word) => word.id),
        sourceEntryIds: words.map((word) => word.sourceEntryId),
        syntax: [1, 2].map((number) => ({
          ...authored,
          ...question,
          id: `${planId}:syntax:${number}`,
          sentenceEn: 'We adapt.',
          focus: '문장 연결',
        })),
        readings: [1, 2].map((number) => ({
          ...authored,
          id: `${planId}:reading:${number}`,
          title: 'Read',
          passageEn: 'We adapt. We learn.',
          question: {
            ...question,
            id: `${planId}:reading:${number}:q1`,
            evidenceQuote: 'We adapt.',
          },
        })),
      };
    }),
  };
}

export const fixtureCourses = [fixtureCourse('advanced-300'), fixtureCourse('suneung-2000')];
export const learned = (entityId: string): ReviewState => ({
  entityId,
  stage: 1,
  dueDay: '2026-11-02',
  correctDays: [],
  activeRecallCorrectDays: [],
  inContextCorrectDays: [],
  delayedSuccess: false,
  mastered: false,
});
