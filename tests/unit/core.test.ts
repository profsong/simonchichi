import { describe, expect, it } from 'vitest';
import { approvedCatalog, catalog, getCatalog } from '../../src/data/catalog';
import { contentSchema } from '../../src/data/content-schema';
import { gradeAnswer, sanitizeResponseMs } from '../../src/core/grading';
import { addDays, localDay, scheduleReview } from '../../src/core/scheduler';
import {
  buildQuest,
  catalogSteps,
  getCompletedPlanIds,
  resolveStep,
  validateStep,
} from '../../src/core/quest-builder';
import { completionReward, rewardForAttempt } from '../../src/core/rewards';
import type { LearningSession, PracticeAttempt, ReviewState } from '../../src/core/types';

const attempt = (overrides: Partial<PracticeAttempt> = {}): PracticeAttempt => ({
  attemptId: 'attempt-1',
  sessionId: 'session-1',
  questionId: 'q1',
  entityId: 'v-adapt-sense1',
  entityType: 'vocab',
  mode: 'recall',
  answer: 'adapt',
  isCorrect: true,
  usedHint: false,
  firstTry: true,
  responseMs: 2000,
  completedAt: '2026-10-01T09:00:00.000Z',
  localDay: '2026-10-01',
  ...overrides,
});
const onDay = (day: string, overrides: Partial<PracticeAttempt> = {}) =>
  attempt({ localDay: day, completedAt: `${day}T09:00:00.000Z`, ...overrides });
const review = (entityId: string, overrides: Partial<ReviewState> = {}): ReviewState => ({
  entityId,
  stage: 1,
  dueDay: '2026-10-01',
  correctDays: [],
  activeRecallCorrectDays: [],
  inContextCorrectDays: [],
  delayedSuccess: false,
  mastered: false,
  ...overrides,
});
const quest = (options: Partial<Parameters<typeof buildQuest>[0]> = {}) =>
  buildQuest({ catalog, reviews: [], completedPlanIds: [], localDay: '2026-10-23', ...options });

describe('content safety and catalog', () => {
  it('validates the complete authored bank without approving it', () => {
    expect(contentSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.vocabulary).toHaveLength(300);
    expect(catalog.vocabularyQuestions).toHaveLength(600);
    expect(catalog.readings).toHaveLength(60);
    expect(catalog.vocabulary.every((word) => word.reviewStatus === 'draft')).toBe(true);
    expect(getCatalog('learner').vocabulary).toHaveLength(0);
    expect(getCatalog('learner').dailyPlans).toHaveLength(0);
    expect(quest({ catalog: getCatalog('learner') })).toBeNull();
  });

  it.each([
    'duplicate choice',
    'no answer',
    'empty explanation',
    'missing evidence',
    'no license',
    'unknown ref',
    'duplicate id',
  ] as const)('rejects %s', (kind) => {
    const broken = structuredClone(catalog);
    if (kind === 'duplicate choice')
      broken.syntax[0].choices[1] = ` ${broken.syntax[0].choices[0]} `;
    if (kind === 'no answer') broken.syntax[0].correctIndex = 4;
    if (kind === 'empty explanation') broken.syntax[0].explanationKo = ' ';
    if (kind === 'missing evidence')
      broken.readings[0].questions[0].evidenceQuote = 'This sentence was never in the passage.';
    if (kind === 'no license') broken.vocabulary[0].license = '';
    if (kind === 'unknown ref') broken.dailyPlans[0].syntaxId = 'not-a-real-question';
    if (kind === 'duplicate id') broken.syntax[0].id = broken.vocabulary[0].id;
    expect(contentSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects multiple explicitly accepted answers in a vocabulary MCQ', () => {
    const broken = structuredClone(catalog);
    const question = broken.vocabularyQuestions.find((q) => q.type === 'vocab_ko_to_en')!;
    const word = broken.vocabulary.find((v) => v.id === question.vocabId)!;
    word.acceptedAnswers.push(question.choices[(question.correctIndex + 1) % 4]);
    expect(contentSchema.safeParse(broken).success).toBe(false);
  });

  it('requires a vocabulary question and its parent both approved, reading inherits passage status', () => {
    const source = structuredClone(catalog);
    source.vocabularyQuestions[0].reviewStatus = 'approved';
    source.readings[0].reviewStatus = 'approved';
    expect(approvedCatalog(source).vocabularyQuestions).toHaveLength(0);
    expect(approvedCatalog(source).readings[0].questions).toHaveLength(2);
    source.vocabulary.find(
      (word) => word.id === source.vocabularyQuestions[0].vocabId,
    )!.reviewStatus = 'approved';
    expect(approvedCatalog(source).vocabularyQuestions).toHaveLength(1);
  });

  it('retains an approved subset of a plan without exposing its draft cards', () => {
    const source = structuredClone(catalog);
    const plan = source.dailyPlans[0];
    source.vocabulary.find((word) => word.id === plan.vocabularyIds[0])!.reviewStatus = 'approved';
    source.syntax.find((item) => item.id === plan.syntaxId)!.reviewStatus = 'approved';
    source.readings.find((item) => item.id === plan.readingId)!.reviewStatus = 'approved';
    const filtered = approvedCatalog(source);
    expect(filtered.dailyPlans[0].vocabularyIds).toHaveLength(1);
    expect(filtered.vocabulary.every((word) => word.reviewStatus === 'approved')).toBe(true);
    expect(quest({ catalog: filtered })?.planId).toBe(`${plan.id}:partial`);
  });
});

describe('grading', () => {
  it('accepts explicit typed variants, whitespace and case, but no fuzzy matches', () => {
    const step = resolveStep('recall:v-adapt-sense1', 'demo')!;
    expect(gradeAnswer(step, '  ADAPT  ')).toBe(true);
    expect(gradeAnswer(step, 'adopt')).toBe(false);
    expect(gradeAnswer(step, '')).toBe(false);
    expect(gradeAnswer({ ...step, acceptedAnswers: ['look after'] }, ' look   AFTER ')).toBe(true);
  });

  it('grades canonical MCQ indices and never a study card', () => {
    const item = catalog.syntax[0];
    const step = resolveStep(item.id, 'demo')!;
    expect(gradeAnswer(step, String(item.correctIndex))).toBe(true);
    expect(gradeAnswer(step, item.choices[item.correctIndex])).toBe(false);
    expect(gradeAnswer(step, String((item.correctIndex + 1) % 4))).toBe(false);
    expect(gradeAnswer(resolveStep('study:v-adapt-sense1', 'demo')!, 'adapt')).toBe(false);
  });

  it('sanitizes response time without rewarding speed', () => {
    expect(sanitizeResponseMs(-10)).toBe(0);
    expect(sanitizeResponseMs(Number.NaN)).toBe(0);
    expect(sanitizeResponseMs(Infinity)).toBe(0);
    expect(sanitizeResponseMs(99.7)).toBe(100);
    expect(sanitizeResponseMs(9e12)).toBe(3_600_000);
  });
});

describe('local-calendar SRS', () => {
  it('uses the device date across midnight and handles month/year boundaries', () => {
    expect(localDay(new Date(2026, 9, 23, 23, 59, 59))).toBe('2026-10-23');
    expect(localDay(new Date(2026, 9, 24, 0, 0, 0))).toBe('2026-10-24');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('schedules first success tomorrow and distinct-day recall on 3 then 7 day intervals', () => {
    const first = scheduleReview(undefined, onDay('2026-10-01'));
    expect(first).toMatchObject({ stage: 1, dueDay: '2026-10-02', mastered: false });
    const second = scheduleReview(first, onDay('2026-10-02'));
    expect(second).toMatchObject({ stage: 2, dueDay: '2026-10-05' });
    expect(scheduleReview(second, onDay('2026-10-05'))).toMatchObject({
      stage: 3,
      dueDay: '2026-10-12',
    });
  });

  it('does not give active recall or mastery for recognition-only performance', () => {
    let state: ReviewState | undefined;
    for (const day of ['2026-10-01', '2026-10-04', '2026-10-11', '2026-10-18'])
      state = scheduleReview(state, onDay(day, { mode: 'recognition' }));
    expect(state).toMatchObject({
      stage: 1,
      activeRecallCorrectDays: [],
      inContextCorrectDays: [],
      mastered: false,
    });
  });

  it('requires separate days, active production, context and a real seven-day interval', () => {
    let state = scheduleReview(undefined, onDay('2026-10-01'));
    state = scheduleReview(state, onDay('2026-10-04', { mode: 'cloze' }));
    expect(state.mastered).toBe(false);
    state = scheduleReview(state, onDay('2026-10-11'));
    expect(state).toMatchObject({ mastered: true, delayedSuccess: true });
    const wrong = scheduleReview(state, onDay('2026-10-12', { isCorrect: false }));
    expect(wrong).toMatchObject({
      stage: 2,
      dueDay: '2026-10-13',
      mastered: false,
      delayedSuccess: false,
    });
  });

  it('does not count hints, retries or repeated same-day answers as independent progress', () => {
    const first = scheduleReview(undefined, onDay('2026-10-01'));
    const hint = scheduleReview(first, onDay('2026-10-02', { usedHint: true }));
    expect(hint).toMatchObject({
      stage: 0,
      dueDay: '2026-10-03',
      correctDays: ['2026-10-01'],
      mastered: false,
    });
    const retry = scheduleReview(
      hint,
      onDay('2026-10-02', { firstTry: false, completedAt: '2026-10-02T09:01:00.000Z' }),
    );
    expect(retry.stage).toBe(0);
    expect(retry.correctDays).toEqual(['2026-10-01']);
    const sameDay = scheduleReview(
      first,
      onDay('2026-10-01', { completedAt: '2026-10-01T09:02:00.000Z' }),
    );
    expect(sameDay.stage).toBe(1);
    expect(sameDay.correctDays).toHaveLength(1);
  });

  it('ignores replayed/older events and does not shorten a future due day after early success', () => {
    const state = scheduleReview(undefined, onDay('2026-10-03'));
    expect(scheduleReview(state, onDay('2026-10-02', { isCorrect: false }))).toEqual(state);
    expect(scheduleReview(state, onDay('2026-10-03'))).toEqual(state);
    const future = { ...state, dueDay: '2026-11-01' };
    expect(scheduleReview(future, onDay('2026-10-04')).dueDay).toBe('2026-11-01');
  });

  it('does not turn an immediate quiz after study into another interval or active recall success', () => {
    const studied = review('v-adapt-sense1', { stage: 1, dueDay: '2026-10-02' });
    const recognition = scheduleReview(studied, onDay('2026-10-01', { mode: 'recognition' }));
    expect(recognition).toMatchObject({
      stage: 1,
      dueDay: '2026-10-02',
      correctDays: ['2026-10-01'],
      activeRecallCorrectDays: [],
      mastered: false,
    });
    const repeat = scheduleReview(
      recognition,
      onDay('2026-10-01', {
        mode: 'cloze',
        questionId: 'another-question',
        completedAt: '2026-10-01T09:01:00.000Z',
      }),
    );
    expect(repeat).toMatchObject({
      stage: 1,
      activeRecallCorrectDays: [],
      inContextCorrectDays: [],
      mastered: false,
    });
  });
});

describe('quest selection', () => {
  it('builds five study cards, canonical vocabulary MCQs, syntax and two evidence-backed reading questions', () => {
    const result = quest()!;
    expect(result.steps.filter((step) => step.kind === 'study')).toHaveLength(5);
    expect(
      result.steps.filter((step) => step.phase === 'vocab' && step.kind === 'question'),
    ).toHaveLength(2);
    expect(result.steps.filter((step) => step.phase === 'syntax')).toHaveLength(1);
    expect(result.steps.filter((step) => step.phase === 'reading')).toHaveLength(2);
    expect(result.steps.every((step) => validateStep(step, 'demo'))).toBe(true);
    expect(result.estimatedSeconds).toBeLessThanOrEqual(720);
    for (const step of result.steps.filter((step) => step.phase === 'reading'))
      expect(step.passage).toContain(step.evidenceQuote);
  });

  it('prioritizes due items, mixes recall and recognition and maintains subject diversity under load', () => {
    const due = catalog.vocabulary.slice(30, 50).map((word) => review(word.id));
    const future = review(catalog.vocabulary[100].id, { dueDay: '2026-10-24' });
    const result = quest({ reviews: [...due, future] })!;
    expect(result.steps[0].phase).toBe('review');
    expect(result.steps.some((step) => step.entityId === future.entityId)).toBe(false);
    expect(new Set(result.steps.map((step) => step.phase))).toEqual(
      new Set(['review', 'vocab', 'syntax', 'reading']),
    );
    expect(
      new Set(result.steps.filter((step) => step.phase === 'review').map((step) => step.mode)),
    ).toEqual(new Set(['recall', 'recognition']));
    expect(result.steps.filter((step) => step.kind === 'study').length).toBeLessThanOrEqual(2);
    expect(result.planId).toBe('w01-d1:partial');
    expect(result.estimatedSeconds).toBeLessThanOrEqual(720);
  });

  it('carries omitted new words forward instead of completing their daily plan', () => {
    const due = catalog.vocabulary.slice(30, 50).map((word) => review(word.id));
    const first = quest({ reviews: due })!;
    const studied = first.steps
      .filter((step) => step.kind === 'study')
      .map((step) => review(step.entityId, { dueDay: '2026-10-25' }));
    const second = quest({
      reviews: studied,
      completedPlanIds: [first.planId],
      localDay: '2026-10-24',
    })!;
    expect(second.planId).toBe('w01-d1');
    expect(second.steps.filter((step) => step.kind === 'study')).toHaveLength(3);
    expect(
      second.steps
        .filter((step) => step.kind === 'study')
        .every((step) => !studied.some((state) => state.entityId === step.entityId)),
    ).toBe(true);
  });

  it('continues an unfinished partial plan the same day and skips an exhausted approved subset', () => {
    const first = quest({ budgetSeconds: 450 })!;
    const learned = first.steps
      .filter((step) => step.kind === 'study')
      .map((step) => review(step.entityId, { dueDay: '2026-10-24' }));
    const remaining = quest({ reviews: learned, completedPlanIds: [first.planId] })!;
    expect(remaining.planId).toBe('w01-d1');
    expect(remaining.steps.filter((step) => step.kind === 'study')).toHaveLength(
      5 - learned.length,
    );
    const subset = structuredClone(catalog);
    subset.dailyPlans[0].vocabularyIds = subset.dailyPlans[0].vocabularyIds.slice(0, 1);
    const known = [review(subset.dailyPlans[0].vocabularyIds[0], { dueDay: '2026-10-24' })];
    expect(
      quest({ catalog: subset, reviews: known, completedPlanIds: ['w01-d1:partial'] })?.planId,
    ).toBe('w01-d2');
    // When newly approved cards become available, the unfinished earlier plan returns.
    expect(quest({ reviews: known, completedPlanIds: ['w01-d1:partial'] })?.planId).toBe('w01-d1');
  });

  it('excludes already answered due entities from optional quests even after a wrong or hinted answer', () => {
    const due = catalog.vocabulary.slice(30, 42).map((word) => review(word.id));
    const alreadyAnswered = due.slice(0, 8).map((state) => state.entityId);
    const result = quest({ reviews: due, reviewedEntityIds: alreadyAnswered })!;
    expect(
      result.steps.filter((step) => step.phase === 'review').map((step) => step.entityId),
    ).toEqual(
      due
        .slice(8)
        .map((state) => state.entityId)
        .sort(),
    );
    expect(result.steps.filter((step) => step.kind === 'study')).toHaveLength(5);
  });

  it('ends after the bank is complete unless unpracticed due reviews remain', () => {
    const completedPlanIds = catalog.dailyPlans.map((plan) => plan.id);
    expect(quest({ completedPlanIds })).toBeNull();
    const due = review(catalog.vocabulary[0].id);
    expect(quest({ completedPlanIds, reviews: [due] })?.planId).toBe('review:2026-10-23');
    expect(
      quest({ completedPlanIds, reviews: [due], reviewedEntityIds: [due.entityId] }),
    ).toBeNull();
  });

  it('counts a stage split across sessions only after all its study segments finish', () => {
    const plan = quest()!;
    const cards = plan.steps.filter((step) => step.kind === 'study');
    const segment = (id: string, steps: typeof cards): LearningSession => ({
      sessionId: id,
      localDay: '2026-10-23',
      planId: `${plan.planId}:partial`,
      contentVersion: catalog.contentVersion,
      appMode: 'demo',
      steps,
      currentQuestionIndex: steps.length,
      status: 'completed',
      xpAwarded: 0,
      updatedAt: '2026-10-23T09:00:00Z',
      hintStepIds: [],
    });
    const first = segment('quest-2026-10-23', cards.slice(0, 2));
    const second = segment('quest-2026-10-23:2', cards.slice(2));
    const states = cards.map((step) => review(step.entityId));
    expect(
      getCompletedPlanIds(catalog, states, [first, { ...second, status: 'in_progress' }]),
    ).toEqual([]);
    expect(getCompletedPlanIds(catalog, states, [first, second])).toEqual([plan.planId]);
    const approvedSubset = structuredClone(catalog);
    approvedSubset.dailyPlans[0].vocabularyIds = cards.slice(0, 2).map((step) => step.entityId);
    expect(getCompletedPlanIds(approvedSubset, states, [first])).toEqual([]);
  });

  it('keeps both vocabulary MCQ directions recognition and never synthesizes context evidence', () => {
    const steps = catalogSteps(catalog);
    for (const item of catalog.vocabularyQuestions)
      expect(steps.find((step) => step.id === item.id)?.mode).toBe('recognition');
    expect(steps.some((step) => ['cloze', 'meaning_in_context'].includes(step.mode))).toBe(false);
  });

  it('skips completed plans and follows the selected reading band', () => {
    const result = quest({ completedPlanIds: ['w01-d1'], readingBand: 'B3' })!;
    expect(result.planId).toBe('w01-d2');
    const readingIds = new Set(
      catalog.readings.filter((p) => p.level === 'B3').flatMap((p) => p.questions.map((q) => q.id)),
    );
    expect(
      result.steps
        .filter((step) => step.phase === 'reading')
        .every((step) => readingIds.has(step.id)),
    ).toBe(true);
  });

  it('does not repeat the same nearest passage every day when a reading band is selected', () => {
    const first = quest({ readingBand: 'B3' })!;
    const readingReviews = first.steps
      .filter((step) => step.phase === 'reading')
      .map((step) => review(step.entityId));
    const second = quest({
      readingBand: 'B3',
      completedPlanIds: [first.planId],
      reviews: readingReviews,
    })!;
    const previousIds = new Set(readingReviews.map((state) => state.entityId));
    expect(
      second.steps
        .filter((step) => step.phase === 'reading')
        .every((step) => !previousIds.has(step.id)),
    ).toBe(true);
  });

  it('prioritizes long overdue vocabulary and excludes syntax/reading states from review slots', () => {
    const recent = catalog.vocabulary
      .slice(30, 39)
      .map((word) => review(word.id, { dueDay: '2026-10-23', stage: 0 }));
    const overdue = review(catalog.vocabulary[60].id, { dueDay: '2026-09-01', stage: 5 });
    const result = quest({
      reviews: [...recent, overdue, review('syn-001'), review('read-001-q1')],
    })!;
    expect(result.steps[0].entityId).toBe(overdue.entityId);
    expect(
      result.steps
        .filter((step) => step.phase === 'review')
        .every((step) => step.entityType === 'vocab'),
    ).toBe(true);
  });

  it('respects tight and invalid budgets and prevents altered question snapshots', () => {
    expect(quest({ budgetSeconds: 10 })).toBeNull();
    expect(quest({ budgetSeconds: NaN })).toBeNull();
    const result = quest({ budgetSeconds: 450 })!;
    expect(result.estimatedSeconds).toBeLessThanOrEqual(450);
    expect(result.planId).toBe('w01-d1:partial');
    const step = result.steps.find((item) => item.kind === 'question')!;
    expect(validateStep({ ...step, correctIndex: 99 }, 'demo')).toBe(false);
    expect(validateStep(step, 'learner')).toBe(false);
  });
});

describe('idempotent rewards', () => {
  it('grants first-answer XP at most once across refreshes, sessions and bosses', () => {
    const first = rewardForAttempt(attempt(), [])!;
    expect(first.xp).toBe(10);
    expect(rewardForAttempt(attempt(), [first])).toBeNull();
    expect(
      rewardForAttempt(attempt({ sessionId: 'boss-session', attemptId: 'different-attempt' }), [
        first,
      ]),
    ).toBeNull();
    expect(rewardForAttempt(attempt({ firstTry: false }), [first])).toBeNull();
  });

  it('records wrong first answers and awards only one corrected retry', () => {
    const wrong = rewardForAttempt(attempt({ isCorrect: false }), [])!;
    expect(wrong.xp).toBe(0);
    expect(rewardForAttempt(attempt({ firstTry: false }), [])).toBeNull();
    const retry = rewardForAttempt(attempt({ firstTry: false }), [wrong])!;
    expect(retry.xp).toBe(3);
    expect(rewardForAttempt(attempt({ firstTry: false }), [wrong, retry])).toBeNull();
    expect(
      rewardForAttempt(attempt({ firstTry: false, sessionId: 'new-session' }), [wrong]),
    ).toBeNull();
    expect(rewardForAttempt(attempt({ sessionId: 'new-session' }), [wrong])).toBeNull();
  });

  it('grants completion once per local calendar day and only after all steps', () => {
    const steps = quest()!.steps;
    const session: LearningSession = {
      sessionId: 'session-1',
      localDay: '2026-10-23',
      planId: 'w01-d1',
      contentVersion: catalog.contentVersion,
      appMode: 'demo',
      steps,
      currentQuestionIndex: steps.length,
      status: 'completed',
      xpAwarded: 0,
      updatedAt: '2026-10-23T10:00:00Z',
      hintStepIds: [],
    };
    const reward = completionReward(session, [])!;
    expect(reward.xp).toBe(30);
    expect(completionReward({ ...session, sessionId: 'second-session' }, [reward])).toBeNull();
    expect(completionReward({ ...session, currentQuestionIndex: 0 }, [])).toBeNull();
    expect(completionReward({ ...session, localDay: '2026-10-24' }, [reward])?.xp).toBe(30);
  });
});
