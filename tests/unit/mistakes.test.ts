import { describe, expect, it, vi } from 'vitest';
import { courseSteps, makeRetestStep } from '../../src/core/course-quest';
import {
  buildMistakeQuest,
  getActiveMistakes,
  getMistakes,
  mistakeKey,
  validMistakePlan,
} from '../../src/core/mistakes';
import type { LearningSession, PracticeAttempt, QuestStep } from '../../src/core/types';
import { fixtureCourses } from './course-fixtures';

vi.mock('../../src/data/courses', () => ({ getCourses: () => fixtureCourses }));

const steps = courseSteps(fixtureCourses[0]);
const vocabulary = steps.filter((step) => step.kind === 'question' && step.phase === 'vocab');
const word = vocabulary[0];
const syntax = steps.find((step) => step.entityType === 'syntax')!;
const reading = steps.find((step) => step.entityType === 'reading')!;
const date = (second: number) => new Date(Date.UTC(2026, 10, 2, 0, 0, second)).toISOString();

function session(id: string, questions: QuestStep[] = [word]): LearningSession {
  return {
    sessionId: id,
    planId: id,
    localDay: '2026-11-02',
    contentVersion: 'test',
    appMode: 'demo',
    steps: questions,
    currentQuestionIndex: questions.length,
    status: 'completed',
    xpAwarded: 0,
    updatedAt: date(100),
    hintStepIds: [],
  };
}

function answer(
  sessionId: string,
  correct: boolean,
  second: number,
  step = word,
  firstTry = true,
): PracticeAttempt {
  const questionId = step.retestOf ?? step.id;
  return {
    attemptId: `${sessionId}:${questionId}:${firstTry ? 'first' : 'retry'}`,
    sessionId,
    questionId,
    entityId: step.entityId,
    entityType: step.entityType,
    mode: step.mode,
    answer: String(correct ? step.correctIndex : ((step.correctIndex ?? 0) + 1) % 4),
    isCorrect: correct,
    firstTry,
    usedHint: false,
    responseMs: 1000,
    completedAt: date(second),
    localDay: '2026-11-02',
  };
}

describe('derived mistake history', () => {
  it('requires two correct quiz sessions after a wrong answer and ignores older successes', () => {
    const sessions = ['before', 'wrong', 'one', 'two'].map((id) => session(id));
    const attempts = [answer('before', true, 0), answer('wrong', false, 1)];
    expect(getActiveMistakes(attempts, sessions)[0].correctCount).toBe(0);
    attempts.push(answer('one', true, 2));
    expect(getActiveMistakes(attempts, sessions)[0].correctCount).toBe(1);
    attempts.push(answer('two', true, 3));
    expect(getActiveMistakes(attempts, sessions)).toEqual([]);
    expect(getMistakes(attempts, sessions)[0]).toMatchObject({ correctCount: 2, resolved: true });
  });

  it('resets progress on another wrong answer and reopens a previously cleared item', () => {
    const sessions = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => session(id));
    const attempts = [answer('a', false, 0), answer('b', true, 1), answer('c', false, 2)];
    expect(getActiveMistakes(attempts, sessions)[0]).toMatchObject({
      correctCount: 0,
      sourceSessionId: 'c',
    });
    attempts.push(answer('d', true, 3), answer('e', true, 4));
    expect(getActiveMistakes(attempts, sessions)).toEqual([]);
    attempts.push(answer('f', false, 5));
    expect(getActiveMistakes(attempts, sessions)[0]).toMatchObject({
      correctCount: 0,
      sourceSessionId: 'f',
    });
  });

  it('shares a vocabulary mistake across courses and question modes, including hinted recall', () => {
    const shared = courseSteps(fixtureCourses[1]).find(
      (step) => step.mode === 'recall' && step.entityId === word.entityId,
    )!;
    const sessions = [session('a'), session('b', [shared]), session('c')];
    const attempts = [answer('a', false, 0), { ...answer('b', true, 1, shared), usedHint: true }];
    expect(getActiveMistakes(attempts, sessions)[0]).toMatchObject({
      key: `vocab:${word.entityId}`,
      correctCount: 1,
    });
    attempts.push(answer('c', true, 2));
    expect(getActiveMistakes(attempts, sessions)).toEqual([]);
  });

  it('does not count memory and vocabulary answers twice in one quiz', () => {
    const memory = steps.find(
      (step) => step.entityId === word.entityId && step.id.includes('review-recognition'),
    )!;
    const sessions = [session('a'), session('b', [memory, word])];
    const attempts = [answer('a', false, 0), answer('b', true, 1, memory), answer('b', true, 2)];
    expect(getActiveMistakes(attempts, sessions)[0].correctCount).toBe(1);
  });

  it('counts a course tail once, then needs a different quiz to clear the word', () => {
    const tail = makeRetestStep(word);
    const courseSession = { ...session('a', [word, tail]), courseFlow: 'test-first-v1' as const };
    const sessions = [courseSession, session('b')];
    const attempts = [answer('a', false, 0), answer('a', true, 1, tail, false)];
    const state = getActiveMistakes(attempts, sessions)[0];
    expect(state.correctCount).toBe(1);
    expect(state.step).toEqual(word);
    expect(state.step.retestOf).toBeUndefined();
    attempts.push(answer('b', true, 2));
    expect(getActiveMistakes(attempts, sessions)).toEqual([]);
  });

  it('accepts one legacy immediate correction but not replayed or re-identified duplicates', () => {
    const sessions = [session('a')];
    const wrong = answer('a', false, 0);
    const retry = answer('a', true, 1, word, false);
    const attempts = [
      wrong,
      retry,
      { ...retry },
      { ...retry, attemptId: 'other-id', completedAt: date(2) },
    ];
    expect(getActiveMistakes(attempts, sessions)[0].correctCount).toBe(1);
    expect(getMistakes([...attempts].reverse(), sessions)).toEqual(getMistakes(attempts, sessions));
  });

  it('keeps syntax and reading questions separate even when an entity label overlaps', () => {
    const syntaxB = { ...syntax, id: `${syntax.id}:other`, entityId: syntax.entityId };
    const sessions = [
      session('a', [syntax, syntaxB, reading]),
      session('b', [syntax]),
      session('c', [syntax]),
    ];
    const attempts = [
      answer('a', false, 0, syntax),
      answer('a', false, 1, syntaxB),
      answer('a', false, 2, reading),
      answer('b', true, 3, syntax),
      answer('c', true, 4, syntax),
    ];
    expect(
      getActiveMistakes(attempts, sessions)
        .map((item) => item.key)
        .sort(),
    ).toEqual([mistakeKey(attempts[1]), mistakeKey(attempts[2])].sort());
  });

  it('ignores preview cards, missing sessions, mismatched entities and orphan retries', () => {
    const preview = steps.find((step) => step.kind === 'study')!;
    const sessions = [session('a', [word, preview])];
    const attempts = [
      answer('missing', false, 0),
      answer('a', false, 1, preview),
      { ...answer('a', false, 2), entityId: 'incorrect-entity' },
      answer('a', true, 3, word, false),
    ];
    expect(getMistakes(attempts, sessions)).toEqual([]);
  });

  it('counts answers in an unfinished quiz and never mutates input records', () => {
    const sessions = [{ ...session('a'), status: 'in_progress' as const, currentQuestionIndex: 0 }];
    const attempts = [answer('a', false, 0)];
    const before = structuredClone({ attempts, sessions });
    expect(getActiveMistakes(attempts, sessions)).toHaveLength(1);
    expect({ attempts, sessions }).toEqual(before);
  });
});

describe('canonical mistake quiz assembly', () => {
  it('includes all question types with original choices, passage evidence and IDs', () => {
    const questions = [word, syntax, reading];
    const sessions = [session('source', questions)];
    const attempts = questions.map((step, index) => answer('source', false, index, step));
    const plan = buildMistakeQuest({ attempts, sessions, appMode: 'learner' })!;
    expect(plan.sessionKind).toBe('mistakes');
    expect(plan.steps).toEqual([...questions].reverse());
    expect(plan.steps[0].evidenceQuote).toBe(reading.evidenceQuote);
    expect(plan.steps[0]).not.toBe(reading);
    expect(validMistakePlan(plan, attempts, sessions, 'learner')).toBe(true);
    expect(
      buildMistakeQuest({ attempts: [...attempts].reverse(), sessions, appMode: 'learner' }),
    ).toEqual(plan);
  });

  it('selects at most ten distinct mistakes and respects the smaller available count', () => {
    const questions = vocabulary.slice(0, 12);
    const sessions = [session('source', questions)];
    const attempts = questions.map((step, index) => answer('source', false, index, step));
    const options = { attempts, sessions, appMode: 'demo' as const };
    expect(buildMistakeQuest(options)?.steps).toHaveLength(10);
    expect(new Set(buildMistakeQuest(options)?.steps.map((step) => step.entityId)).size).toBe(10);
    expect(buildMistakeQuest({ ...options, limit: 3 })?.steps).toEqual(
      questions.slice(9).reverse(),
    );
    expect(buildMistakeQuest({ ...options, limit: 0 })).toBeNull();
    expect(buildMistakeQuest({ ...options, limit: 11 })).toBeNull();
    expect(buildMistakeQuest({ ...options, attempts: [] })).toBeNull();
  });

  it('rejects changed answers, reordered queues, extra reward metadata, or resolved history', () => {
    const sessions = [session('a', [word, syntax]), session('b'), session('c')];
    const attempts = [answer('a', false, 0), answer('a', false, 1, syntax)];
    const plan = buildMistakeQuest({ attempts, sessions, appMode: 'demo' })!;
    expect(
      validMistakePlan({ ...plan, steps: [...plan.steps].reverse() }, attempts, sessions, 'demo'),
    ).toBe(false);
    expect(
      validMistakePlan(
        {
          ...plan,
          steps: plan.steps.map((step) => ({
            ...step,
            correctIndex: ((step.correctIndex ?? 0) + 1) % 4,
          })),
        },
        attempts,
        sessions,
        'demo',
      ),
    ).toBe(false);
    expect(
      validMistakePlan({ ...plan, courseId: 'advanced-300' }, attempts, sessions, 'demo'),
    ).toBe(false);
    expect(validMistakePlan({ ...plan, retestQuestionIds: [] }, attempts, sessions, 'demo')).toBe(
      false,
    );
    expect(
      validMistakePlan(
        plan,
        [...attempts, answer('b', true, 2), answer('c', true, 3)],
        sessions,
        'demo',
      ),
    ).toBe(false);
    // The same immutable snapshot remains valid against its creation-time history.
    expect(validMistakePlan(plan, attempts, sessions, 'demo')).toBe(true);
  });
});
