import { describe, expect, it, vi } from 'vitest';
import type { LearningSession, PracticeAttempt } from '../../src/core/types';
import {
  buildCourseQuest,
  buildCourseRetests,
  buildReviewTest,
  completedCoursePlanIds,
  courseSteps,
  meaningTokens,
  makeRetestStep,
  reviewSelectionWeight,
  validCoursePlan,
  validCourseRetests,
} from '../../src/core/course-quest';
import { fixtureCourse, fixtureCourses, learned } from './course-fixtures';
import { gradeAnswer } from '../../src/core/grading';

vi.mock('../../src/data/courses', async () => ({ getCourses: () => fixtureCourses }));
const day = '2026-11-02';
const options = (course = fixtureCourse('advanced-300')) => ({
  course,
  reviews: [],
  attempts: [],
  sessions: [],
  localDay: day,
  random: () => 0.42,
});
const completed = (plan: NonNullable<ReturnType<typeof buildCourseQuest>>) =>
  ({
    ...plan,
    status: 'completed',
    sessionId: plan.planId,
    localDay: day,
    contentVersion: 'test',
    appMode: 'demo',
    currentQuestionIndex: plan.steps.length,
    xpAwarded: 0,
    updatedAt: '2026-11-02T12:00:00.000Z',
    hintStepIds: [],
  }) satisfies LearningSession;
const attempt = (entityId: string, correct: boolean, index: number): PracticeAttempt => ({
  attemptId: `a${index}`,
  sessionId: 's',
  questionId: `q${index}`,
  entityId,
  entityType: 'vocab',
  mode: 'recognition',
  answer: '',
  isCorrect: correct,
  usedHint: false,
  firstTry: true,
  responseMs: 1,
  completedAt: `2026-11-02T00:00:${String(index).padStart(2, '0')}.000Z`,
  localDay: day,
});

describe('isolated course assembly', () => {
  it.each(['advanced-300', 'suneung-2000'] as const)(
    'keeps every %s word in exactly one 20-word stage',
    (id) => {
      const course = fixtureCourse(id);
      const config = options(course);
      const sessions: LearningSession[] = [];
      const wordIds: string[] = [];
      for (const lesson of course.lessons) {
        const plan = buildCourseQuest({ ...config, sessions })!;
        expect(plan.planId).toBe(lesson.id);
        expect(plan.steps).toHaveLength(29);
        expect(plan.courseFlow).toBe('test-first-v1');
        expect(validCoursePlan(plan, day)).toBe(true);
        expect(
          plan.steps
            .slice(0, 5)
            .every(
              (step) =>
                step.phase === 'review' &&
                step.kind === 'study' &&
                step.prompt.startsWith('먼저 만나기'),
            ),
        ).toBe(true);
        wordIds.push(
          ...plan.steps
            .filter((step) => step.phase === 'vocab' && step.kind === 'question')
            .map((step) => step.entityId),
        );
        expect(plan.steps.filter((step) => step.phase === 'syntax')).toHaveLength(2);
        expect(plan.steps.filter((step) => step.phase === 'reading')).toHaveLength(2);
        expect(
          plan.steps
            .slice(5, 25)
            .every(
              (step) =>
                step.kind === 'question' &&
                step.choices?.length === 4 &&
                step.mode === 'recognition',
            ),
        ).toBe(true);
        expect(plan.steps.some((step) => step.phase === 'vocab' && step.kind === 'study')).toBe(
          false,
        );
        sessions.push(completed(plan));
      }
      expect(wordIds).toEqual(course.vocabulary.map((word) => word.id));
      expect(buildCourseQuest({ ...config, sessions })).toBeNull();
      expect(
        completedCoursePlanIds(
          course,
          sessions.map((session) => ({ ...session, courseId: undefined })),
        ),
      ).toEqual([]);
      expect(courseSteps(course)).toBe(courseSteps(course));
    },
  );

  it('excludes overlapping Korean senses and accepted English answers from distractors', () => {
    const course = fixtureCourse('advanced-300');
    course.vocabulary[0].koreanMeaning = '존경하다; 존중하다';
    course.vocabulary[17].koreanMeaning = '존경; 평가하다';
    course.vocabulary[34].acceptedAnswers = ['adapt'];
    const questions = courseSteps(course).filter(
      (step) => step.mode === 'recognition' && step.kind === 'question',
    );
    const first = questions[0];
    expect(first.choices).not.toContain(course.vocabulary[17].koreanMeaning);
    expect(first.choices).not.toContain(course.vocabulary[34].koreanMeaning);
    for (const question of questions) {
      const tokens = question.choices!.flatMap(meaningTokens);
      expect(new Set(tokens).size).toBe(tokens.length);
      expect(new Set(question.choices).size).toBe(4);
    }
  });
});

describe('delayed first-pass vocabulary retests', () => {
  function prepared() {
    const config = options();
    const plan = buildCourseQuest(config)!;
    const session: LearningSession = {
      ...completed(plan),
      sessionId: 'new-session',
      status: 'in_progress',
      currentQuestionIndex: 28,
    };
    const attempts = plan.steps.slice(5, 25).map((step, index): PracticeAttempt => ({
      ...attempt(step.entityId, ![1, 7, 19].includes(index), index),
      attemptId: `${session.sessionId}:${step.id}:first`,
      sessionId: session.sessionId,
      questionId: step.id,
    }));
    return { config, plan, session, attempts };
  }

  it('selects only this session’s first wrong vocabulary answers in original order', () => {
    const { session, attempts } = prepared();
    const original = session.steps.slice(5, 25);
    const noise: PracticeAttempt[] = [
      { ...attempts[0], attemptId: 'other-session', sessionId: 'elsewhere', isCorrect: false },
      { ...attempts[7], attemptId: 'corrected-immediately', firstTry: false, isCorrect: true },
      {
        ...attempts[0],
        attemptId: 'memory-wrong',
        questionId: session.steps[0].id,
        isCorrect: false,
      },
      {
        ...attempts[0],
        attemptId: 'syntax-wrong',
        questionId: session.steps[25].id,
        entityType: 'syntax',
        isCorrect: false,
      },
      {
        ...attempts[0],
        attemptId: 'reading-wrong',
        questionId: session.steps[28].id,
        entityType: 'reading',
        isCorrect: false,
      },
    ];
    const tail = buildCourseRetests(session, [...noise, ...attempts.toReversed()]);
    expect(tail.map((step) => step.retestOf)).toEqual([
      original[1].id,
      original[7].id,
      original[19].id,
    ]);
    expect(tail.map((step) => step.id)).toEqual(
      [original[1], original[7], original[19]].map((step) => `${step.id}:retest`),
    );
    expect(tail.every((step) => step.phase === 'retest')).toBe(true);
    expect(buildCourseRetests({ ...session, courseFlow: undefined }, attempts)).toEqual([]);
    expect(buildCourseRetests({ ...session, sessionKind: 'review-test' }, attempts)).toEqual([]);
  });

  it('moves choices without changing the keyed Korean meaning and keeps the source immutable', () => {
    const { plan } = prepared();
    const source = plan.steps[5];
    const before = structuredClone(source);
    const tail = makeRetestStep(source);
    expect(source).toEqual(before);
    expect(tail.choices).toEqual([...source.choices!.slice(1), source.choices![0]]);
    expect(tail.correctIndex).not.toBe(source.correctIndex);
    expect(tail.choices![tail.correctIndex!]).toBe(source.choices![source.correctIndex!]);
    expect(tail.choices!.filter((_, index) => gradeAnswer(tail, String(index)))).toHaveLength(1);
    expect(() => makeRetestStep(tail)).toThrow();
    expect(() => makeRetestStep(plan.steps[25])).toThrow();
  });

  it('freezes exactly the wrong set after reading and rejects omission, additions, reordering and altered answers', () => {
    const { session, attempts } = prepared();
    expect(validCourseRetests(session, attempts)).toBe(true);
    const tail = buildCourseRetests(session, attempts);
    const queued: LearningSession = {
      ...session,
      currentQuestionIndex: 29,
      retestQuestionIds: tail.map((step) => step.retestOf!),
      steps: [...session.steps, ...tail],
    };
    expect(validCoursePlan(queued, day)).toBe(true);
    expect(validCourseRetests(queued, attempts)).toBe(true);
    expect(validCourseRetests({ ...queued, currentQuestionIndex: 28 }, attempts)).toBe(false);
    expect(validCourseRetests({ ...session, currentQuestionIndex: 29 }, attempts)).toBe(false);
    expect(validCourseRetests({ ...session, status: 'completed' }, attempts)).toBe(false);
    expect(
      validCourseRetests(
        {
          ...queued,
          retestQuestionIds: queued.retestQuestionIds!.slice(1),
          steps: [...session.steps, ...tail.slice(1)],
        },
        attempts,
      ),
    ).toBe(false);
    expect(
      validCourseRetests({ ...queued, retestQuestionIds: [], steps: session.steps }, attempts),
    ).toBe(false);
    const reversed = {
      ...queued,
      retestQuestionIds: queued.retestQuestionIds!.toReversed(),
      steps: [...session.steps, ...tail.toReversed()],
    };
    expect(validCoursePlan(reversed, day)).toBe(false);
    expect(validCourseRetests(reversed, attempts)).toBe(false);
    const tampered = structuredClone(queued);
    tampered.steps[29].correctIndex = (tampered.steps[29].correctIndex! + 1) % 4;
    expect(validCourseRetests(tampered, attempts)).toBe(false);
    expect(validCourseRetests(queued, attempts.slice(1))).toBe(false);
    const afterRetry = [
      ...attempts,
      { ...attempts[1], attemptId: 'tail-correct', firstTry: false, isCorrect: true },
    ];
    expect(buildCourseRetests(queued, afterRetry)).toEqual(tail);
    expect(validCourseRetests(queued, afterRetry)).toBe(true);
  });

  it.each([0, 20])('handles %i first-pass mistakes with no recursive retest', (wrongCount) => {
    const { session, attempts } = prepared();
    const first = attempts.map((value, index) => ({ ...value, isCorrect: index >= wrongCount }));
    const tail = buildCourseRetests(session, first);
    const final: LearningSession = {
      ...session,
      status: 'completed',
      currentQuestionIndex: 29 + wrongCount,
      retestQuestionIds: tail.map((step) => step.retestOf!),
      steps: [...session.steps, ...tail],
    };
    expect(tail).toHaveLength(wrongCount);
    expect(validCoursePlan(final, day)).toBe(true);
    expect(validCourseRetests(final, first)).toBe(true);
    const retries = first
      .slice(0, wrongCount)
      .map((value) => ({ ...value, attemptId: `${value.attemptId}:retry`, firstTry: false }));
    expect(buildCourseRetests(final, [...first, ...retries])).toEqual(tail);
  });

  it('keeps historical 49-step study-first snapshots valid without new metadata', () => {
    const { config, session } = prepared();
    const registry = new Map(courseSteps(config.course).map((step) => [step.id, step]));
    const legacy: LearningSession = {
      ...session,
      courseFlow: undefined,
      steps: [
        ...session.steps.slice(0, 5),
        ...session.steps
          .slice(5, 25)
          .flatMap((step) => [
            registry.get(`course:${config.course.id}:study:${step.entityId}`)!,
            step,
          ]),
        ...session.steps.slice(25),
      ],
    };
    expect(legacy.steps).toHaveLength(49);
    expect(validCoursePlan(legacy, day)).toBe(true);
    expect(validCourseRetests(legacy, [])).toBe(true);
    expect(validCoursePlan({ ...legacy, courseFlow: 'test-first-v1' }, day)).toBe(false);
    expect(validCoursePlan({ ...session, courseFlow: undefined }, day)).toBe(false);
    expect(validCoursePlan({ ...legacy, retestQuestionIds: [] }, day)).toBe(false);
    const standalone = buildReviewTest({
      ...config,
      reviews: config.course.vocabulary.slice(0, 10).map((word) => learned(word.id)),
    })!;
    expect(standalone.courseFlow).toBeUndefined();
    expect(validCoursePlan(standalone, day)).toBe(true);
    expect(validCoursePlan({ ...standalone, courseFlow: 'test-first-v1' }, day)).toBe(false);
  });
});

describe('learned-word review tests', () => {
  it('requires ten learned words and saves five recognition plus five explicitly hinted recall questions', () => {
    const config = options();
    const reviews = config.course.vocabulary.slice(0, 12).map((word) => learned(word.id));
    expect(buildReviewTest({ ...config, reviews: reviews.slice(0, 9) })).toBeNull();
    const plan = buildReviewTest({ ...config, reviews })!;
    expect(plan.steps).toHaveLength(10);
    expect(new Set(plan.steps.map((step) => step.entityId)).size).toBe(10);
    expect(
      plan.steps.every((step) => reviews.some((review) => review.entityId === step.entityId)),
    ).toBe(true);
    expect(
      plan.steps.slice(0, 5).every((step) => step.mode === 'recognition' && !step.alwaysHinted),
    ).toBe(true);
    expect(
      plan.steps
        .slice(5)
        .every(
          (step) => step.mode === 'recall' && step.alwaysHinted && step.hint?.includes('첫 글자'),
        ),
    ).toBe(true);
    expect(buildReviewTest({ ...config, reviews, random: () => 1 })!.steps).toHaveLength(10);
  });

  it('increases wrong-answer priority and gradually lowers repeated-correct weights without excluding them', () => {
    const id = 'word';
    const reviews = [learned(id)];
    const wrong = reviewSelectionWeight(id, reviews, [attempt(id, false, 1)], day);
    const once = reviewSelectionWeight(id, reviews, [attempt(id, true, 1)], day);
    const often = reviewSelectionWeight(
      id,
      reviews,
      [1, 2, 3, 4, 5].map((index) => attempt(id, true, index)),
      day,
    );
    expect(wrong).toBeGreaterThan(once);
    expect(once).toBeGreaterThan(often);
    expect(often).toBeGreaterThan(0);
    const config = options();
    const words = config.course.vocabulary.slice(0, 20);
    const attempts = words.flatMap((word, index) => [attempt(word.id, index !== 0, 1)]);
    let seed = 17;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const counts = new Map<string, number>();
    for (let sample = 0; sample < 150; sample++)
      for (const step of buildReviewTest({
        ...config,
        reviews: words.map((word) => learned(word.id)),
        attempts,
        random,
      })!.steps)
        counts.set(step.entityId, (counts.get(step.entityId) ?? 0) + 1);
    expect(counts.get(words[0].id)).toBeGreaterThan(counts.get(words[1].id)!);
    expect(words.every((word) => (counts.get(word.id) ?? 0) > 0)).toBe(true);
  });
});
