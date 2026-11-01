import { getCourses } from '../data/courses';
import type { CourseDocument, CourseWord } from '../data/course-schema';
import type {
  AppMode,
  CourseId,
  LearningSession,
  PracticeAttempt,
  QuestStep,
  ReviewState,
  SessionKind,
} from './types';

export interface CourseQuestPlan {
  planId: string;
  courseId: CourseId;
  courseVersion: string;
  sessionKind: SessionKind;
  courseFlow?: LearningSession['courseFlow'];
  steps: QuestStep[];
  estimatedSeconds: number;
}

export interface CourseQuestOptions {
  course: CourseDocument;
  reviews: ReviewState[];
  attempts: PracticeAttempt[];
  sessions: LearningSession[];
  localDay: string;
  random?: () => number;
}

function study(course: CourseDocument, word: CourseWord, preview = false): QuestStep {
  return {
    id: `course:${course.id}:${preview ? 'preview' : 'study'}:${word.id}`,
    entityId: word.id,
    entityType: 'vocab',
    phase: preview ? 'review' : 'vocab',
    kind: 'study',
    mode: 'recognition',
    title: word.headword,
    prompt: `${preview ? '먼저 만나기 · ' : ''}${word.koreanMeaning}`,
    explanation: word.koreanMeaning,
    ...(word.exampleEn ? { english: word.exampleEn } : {}),
    ...(word.exampleKo ? { translation: word.exampleKo } : {}),
    ...(word.collocations?.length ? { collocations: word.collocations } : {}),
    estimatedSeconds: preview ? 8 : 15,
  };
}

export function meaningTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .replace(/\([^)]*\)/g, '')
        .split(/[;,/·]|또는/)
        .map((part) =>
          part
            .normalize('NFKC')
            .replace(/[^\p{L}\p{N}]/gu, '')
            .replace(/(?:하다|되다|하는|되는|된|한|의)$/u, ''),
        )
        .filter(Boolean),
    ),
  ];
}

const choiceCache = new WeakMap<
  CourseDocument,
  Map<string, { choices: string[]; correctIndex: number }>
>();
function recognitionChoices(course: CourseDocument, word: CourseWord) {
  const cached = choiceCache.get(course)?.get(word.id);
  if (cached) return cached;
  const choices = [word.koreanMeaning];
  const tokens = new Set(meaningTokens(word.koreanMeaning));
  const answers = new Set(word.acceptedAnswers.map((answer) => answer.trim().toLowerCase()));
  const add = (candidate: CourseWord) => {
    const candidateTokens = meaningTokens(candidate.koreanMeaning);
    if (
      candidate.id === word.id ||
      choices.includes(candidate.koreanMeaning) ||
      candidateTokens.some((token) => tokens.has(token)) ||
      candidate.acceptedAnswers.some((answer) => answers.has(answer.trim().toLowerCase()))
    )
      return;
    choices.push(candidate.koreanMeaning);
    candidateTokens.forEach((token) => tokens.add(token));
    candidate.acceptedAnswers.forEach((answer) => answers.add(answer.trim().toLowerCase()));
  };
  const start = course.vocabulary.findIndex((item) => item.id === word.id);
  for (let offset = 1; choices.length < 4 && offset < course.vocabulary.length; offset++) {
    const candidate = course.vocabulary[(start + offset * 17) % course.vocabulary.length];
    add(candidate);
  }
  // A second linear pass also handles small fixture banks and stride factors.
  for (const candidate of course.vocabulary) if (choices.length < 4) add(candidate);
  if (choices.length !== 4) throw new Error('서로 다른 뜻 네 개가 있어야 문제를 만들 수 있어요.');
  // Stable snapshots need deterministic choices, but sequential words should
  // not reveal a repeating A/B/C/D answer-position pattern.
  let positionHash = 2166136261;
  for (const character of `${course.id}:${word.id}`)
    positionHash = Math.imul(positionHash ^ character.charCodeAt(0), 16777619);
  positionHash ^= positionHash >>> 16;
  const correctIndex = (positionHash >>> 0) % 4;
  [choices[0], choices[correctIndex]] = [choices[correctIndex], choices[0]];
  if (!choiceCache.has(course)) choiceCache.set(course, new Map());
  const result = { choices, correctIndex };
  choiceCache.get(course)!.set(word.id, result);
  return result;
}

function recognition(
  course: CourseDocument,
  word: CourseWord,
  kind: 'vocab' | 'review' | 'test',
): QuestStep {
  const { choices, correctIndex } = recognitionChoices(course, word);
  return {
    id: `${kind === 'test' ? 'review-test' : 'course'}:${course.id}:${kind === 'review' ? 'review-recognition' : 'recognition'}:${word.id}`,
    entityId: word.id,
    entityType: 'vocab',
    phase: kind === 'vocab' ? 'vocab' : 'review',
    kind: 'question',
    mode: 'recognition',
    title: '뜻을 떠올려요',
    prompt: `‘${word.headword}’의 뜻으로 알맞은 것을 고르세요.`,
    choices,
    correctIndex,
    explanation: `${word.headword}: ${word.koreanMeaning}`,
    estimatedSeconds: 12,
  };
}

/** A single delayed retry keeps the original question identity for XP accounting. */
export function makeRetestStep(original: QuestStep): QuestStep {
  if (
    original.kind !== 'question' ||
    original.phase !== 'vocab' ||
    original.entityType !== 'vocab' ||
    original.mode !== 'recognition' ||
    original.choices?.length !== 4 ||
    original.correctIndex === undefined ||
    !Number.isInteger(original.correctIndex) ||
    original.correctIndex < 0 ||
    original.correctIndex > 3 ||
    original.retestOf
  )
    throw new Error('처음 단어 문제에서만 다시 풀기를 만들 수 있어요.');
  return {
    ...original,
    id: `${original.id}:retest`,
    phase: 'retest',
    retestOf: original.id,
    title: '다시 떠올려요',
    choices: [...original.choices.slice(1), original.choices[0]],
    correctIndex: (original.correctIndex + 3) % 4,
  };
}

function recall(course: CourseDocument, word: CourseWord, test: boolean): QuestStep {
  return {
    id: `${test ? 'review-test' : 'course'}:${course.id}:recall:${word.id}`,
    entityId: word.id,
    entityType: 'vocab',
    phase: 'review',
    kind: 'question',
    mode: 'recall',
    title: test ? '첫 글자를 보고 떠올려요' : '영어로 떠올려요',
    prompt: `‘${word.koreanMeaning}’에 맞는 영어 단어를 입력하세요. (${word.partOfSpeech})`,
    acceptedAnswers: word.acceptedAnswers,
    explanation: `${word.headword}: ${word.koreanMeaning}`,
    hint: `첫 글자: ${word.headword[0]}`,
    ...(test ? { alwaysHinted: true } : {}),
    estimatedSeconds: 20,
  };
}

/** Stable authored snapshots, including the clue that is already visible in a review test. */
const stepCache = new WeakMap<CourseDocument, Map<AppMode, QuestStep[]>>();
export function courseSteps(course: CourseDocument, mode: AppMode = 'demo'): QuestStep[] {
  const cached = stepCache.get(course)?.get(mode);
  if (cached) return cached;
  const steps = [
    ...course.vocabulary.flatMap((word) => [
      study(course, word),
      study(course, word, true),
      recognition(course, word, 'vocab'),
      recognition(course, word, 'review'),
      recognition(course, word, 'test'),
      recall(course, word, false),
      recall(course, word, true),
    ]),
    ...course.lessons.flatMap((lesson) => [
      ...lesson.syntax
        .filter((item) => mode === 'demo' || item.reviewStatus === 'approved')
        .map((item): QuestStep => ({
          id: item.id,
          entityId: item.id,
          entityType: 'syntax',
          phase: 'syntax',
          kind: 'question',
          mode: 'syntax',
          title: '문장을 연결해요',
          prompt: item.promptKo,
          english: item.sentenceEn,
          choices: item.choices,
          correctIndex: item.correctIndex,
          explanation: item.explanationKo,
          estimatedSeconds: 35,
        })),
      ...lesson.readings
        .filter((item) => mode === 'demo' || item.reviewStatus === 'approved')
        .map((item): QuestStep => ({
          id: item.question.id,
          entityId: item.question.id,
          entityType: 'reading',
          phase: 'reading',
          kind: 'question',
          mode: 'reading',
          title: item.title,
          prompt: item.question.promptKo,
          passage: item.passageEn,
          choices: item.question.choices,
          correctIndex: item.question.correctIndex,
          explanation: item.question.explanationKo,
          evidenceQuote: item.question.evidenceQuote,
          estimatedSeconds: 50,
        })),
    ]),
    // Append rather than replace old snapshots: historical study-first sessions
    // still resolve every original card/question ID unchanged.
    ...course.vocabulary.map((word) => makeRetestStep(recognition(course, word, 'vocab'))),
  ];
  if (!stepCache.has(course)) stepCache.set(course, new Map());
  stepCache.get(course)!.set(mode, steps);
  return steps;
}

const indexes = new Map<AppMode, Map<string, QuestStep>>();
export function resolveCourseStep(id: string, mode: AppMode): QuestStep | undefined {
  if (!indexes.has(mode))
    indexes.set(
      mode,
      new Map(
        getCourses()
          .flatMap((course) => courseSteps(course, mode))
          .map((step) => [step.id, step]),
      ),
    );
  return indexes.get(mode)?.get(id);
}

export function learnedCourseWords(course: CourseDocument, reviews: ReviewState[]): CourseWord[] {
  const learned = new Set(reviews.map((review) => review.entityId));
  return course.vocabulary.filter((word) => learned.has(word.id));
}

/** Wrong answers retain priority; repeated successes reduce, but never erase, their chance. */
export function reviewSelectionWeight(
  entityId: string,
  reviews: ReviewState[],
  attempts: PracticeAttempt[],
  day: string,
): number {
  const recent = attempts
    .filter((attempt) => attempt.entityId === entityId && attempt.firstTry)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 5);
  const failures = recent.filter((attempt) => !attempt.isCorrect).length;
  const successes = recent.filter((attempt) => attempt.isCorrect).length;
  const due = reviews.find((review) => review.entityId === entityId)?.dueDay;
  return (
    (1 + failures * 2 + (recent[0] && !recent[0].isCorrect ? 6 : 0) + (due && due <= day ? 2 : 0)) /
    (1 + successes * 0.75)
  );
}

function choose(options: CourseQuestOptions, count: number): CourseWord[] {
  const remaining = learnedCourseWords(options.course, options.reviews).map((word) => ({
    word,
    weight: reviewSelectionWeight(word.id, options.reviews, options.attempts, options.localDay),
  }));
  const selected: CourseWord[] = [];
  while (selected.length < count && remaining.length) {
    const raw = (options.random ?? Math.random)();
    let ticket =
      Math.max(0, Math.min(0.999999999999, Number.isFinite(raw) ? raw : 0)) *
      remaining.reduce((sum, item) => sum + item.weight, 0);
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      ticket -= remaining[i].weight;
      if (ticket < 0) {
        index = i;
        break;
      }
    }
    selected.push(remaining.splice(index, 1)[0].word);
  }
  return selected;
}

export function completedCoursePlanIds(
  course: CourseDocument,
  sessions: LearningSession[],
): string[] {
  const ids = new Set(
    sessions
      .filter(
        (session) =>
          session.courseId === course.id &&
          session.sessionKind === 'course' &&
          session.status === 'completed',
      )
      .map((session) => session.planId),
  );
  return course.lessons.filter((lesson) => ids.has(lesson.id)).map((lesson) => lesson.id);
}

export function buildCourseQuest(options: CourseQuestOptions): CourseQuestPlan | null {
  const { course } = options;
  const completed = new Set(completedCoursePlanIds(course, options.sessions));
  const lesson = course.lessons.find((item) => !completed.has(item.id));
  if (!lesson) return null;
  const words = lesson.wordIds.map((id) => course.vocabulary.find((word) => word.id === id)!);
  const selected = choose(options, 5);
  const reviews = selected.map((word, index) =>
    index % 2 ? recall(course, word, false) : recognition(course, word, 'review'),
  );
  const preview = words
    .filter((word) => !selected.some((selectedWord) => selectedWord.id === word.id))
    .slice(0, 5 - reviews.length)
    .map((word) => study(course, word, true));
  const index = new Map(courseSteps(course).map((step) => [step.id, step]));
  const steps = [
    ...reviews,
    ...preview,
    ...words.map((word) => recognition(course, word, 'vocab')),
    ...lesson.syntax.map((item) => index.get(item.id)!),
    ...lesson.readings.map((item) => index.get(item.question.id)!),
  ];
  return {
    planId: lesson.id,
    courseId: course.id,
    courseVersion: course.version,
    sessionKind: 'course',
    courseFlow: 'test-first-v1',
    steps,
    estimatedSeconds: steps.reduce((sum, step) => sum + step.estimatedSeconds, 0),
  };
}

/** Only the first answer to this session's original twenty vocabulary questions counts. */
export function buildCourseRetests(
  session: Pick<LearningSession, 'sessionId' | 'sessionKind' | 'courseFlow' | 'steps'>,
  attempts: PracticeAttempt[],
): QuestStep[] {
  if (session.sessionKind !== 'course' || session.courseFlow !== 'test-first-v1') return [];
  const firstAttempts = new Map<string, PracticeAttempt>();
  attempts
    .filter((attempt) => attempt.sessionId === session.sessionId && attempt.firstTry)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .forEach((attempt) => {
      if (!firstAttempts.has(attempt.questionId)) firstAttempts.set(attempt.questionId, attempt);
    });
  return session.steps.slice(5, 25).flatMap((step) => {
    const attempt = firstAttempts.get(step.id);
    return attempt && !attempt.isCorrect ? [makeRetestStep(step)] : [];
  });
}

/** The queue is absent before the final reading advance, then fixed even if it is empty. */
export function validCourseRetests(session: LearningSession, attempts: PracticeAttempt[]): boolean {
  if (session.courseFlow !== 'test-first-v1')
    return session.retestQuestionIds === undefined && session.steps.every((step) => !step.retestOf);
  if (session.sessionKind !== 'course') return false;
  const baseLength = 29;
  if (session.retestQuestionIds === undefined)
    return (
      session.steps.length === baseLength &&
      session.currentQuestionIndex < baseLength &&
      session.status === 'in_progress'
    );
  if (session.currentQuestionIndex < baseLength) return false;
  const original = session.steps.slice(5, 25);
  if (
    original.length !== 20 ||
    original.some(
      (step) =>
        step.kind !== 'question' ||
        step.phase !== 'vocab' ||
        step.entityType !== 'vocab' ||
        step.mode !== 'recognition' ||
        step.choices?.length !== 4 ||
        step.correctIndex === undefined ||
        !Number.isInteger(step.correctIndex) ||
        step.correctIndex < 0 ||
        step.correctIndex > 3 ||
        step.retestOf,
    ) ||
    original.some(
      (step) =>
        !attempts.some(
          (attempt) =>
            attempt.sessionId === session.sessionId &&
            attempt.questionId === step.id &&
            attempt.firstTry,
        ),
    )
  )
    return false;
  const expected = buildCourseRetests(session, attempts);
  const tail = session.steps.slice(baseLength);
  return (
    expected.length === session.retestQuestionIds.length &&
    expected.length === tail.length &&
    expected.every(
      (step, index) =>
        session.retestQuestionIds![index] === step.retestOf &&
        [...new Set([...Object.keys(step), ...Object.keys(tail[index])])].every(
          (key) =>
            JSON.stringify(step[key as keyof QuestStep]) ===
            JSON.stringify(tail[index][key as keyof QuestStep]),
        ),
    )
  );
}

export function buildReviewTest(options: CourseQuestOptions): CourseQuestPlan | null {
  if (learnedCourseWords(options.course, options.reviews).length < 10) return null;
  const selected = choose(options, 10);
  const steps = selected.map((word, index) =>
    index < 5 ? recognition(options.course, word, 'test') : recall(options.course, word, true),
  );
  return {
    planId: `review-test:${options.course.id}:${options.localDay}`,
    courseId: options.course.id,
    courseVersion: options.course.version,
    sessionKind: 'review-test',
    steps,
    estimatedSeconds: steps.reduce((sum, step) => sum + step.estimatedSeconds, 0),
  };
}

/** Validate immutable snapshots against their course, never against caller-supplied answers. */
export function validCoursePlan(
  plan: {
    planId: string;
    courseId?: CourseId;
    courseVersion?: string;
    sessionKind?: SessionKind;
    courseFlow?: LearningSession['courseFlow'];
    retestQuestionIds?: string[];
    steps: QuestStep[];
  },
  day: string,
): boolean {
  const course = getCourses().find((item) => item.id === plan.courseId);
  if (!course || plan.courseVersion !== course.version) return false;
  const vocabulary = new Map(course.vocabulary.map((word) => [word.id, word]));
  if (plan.sessionKind === 'review-test')
    return (
      plan.planId === `review-test:${course.id}:${day}` &&
      plan.courseFlow === undefined &&
      plan.retestQuestionIds === undefined &&
      plan.steps.length === 10 &&
      new Set(plan.steps.map((step) => step.entityId)).size === 10 &&
      plan.steps.every((step, index) => {
        const word = vocabulary.get(step.entityId);
        return (
          !!word &&
          step.id ===
            (index < 5 ? recognition(course, word, 'test') : recall(course, word, true)).id
        );
      })
    );
  const lesson = course.lessons.find((item) => item.id === plan.planId);
  if (plan.sessionKind !== 'course' || !lesson) return false;
  const testFirst = plan.courseFlow === 'test-first-v1';
  if (!testFirst && (plan.courseFlow !== undefined || plan.retestQuestionIds !== undefined))
    return false;
  const baseLength = testFirst ? 29 : 49;
  const retestIds = plan.retestQuestionIds ?? [];
  if (plan.steps.length !== baseLength + retestIds.length) return false;
  const originalIds = lesson.wordIds.map((id) => `course:${course.id}:recognition:${id}`);
  if (
    new Set(retestIds).size !== retestIds.length ||
    retestIds.some(
      (id, index) =>
        !originalIds.includes(id) ||
        (index > 0 && originalIds.indexOf(id) <= originalIds.indexOf(retestIds[index - 1])),
    ) ||
    plan.steps
      .slice(baseLength)
      .some(
        (step, index) =>
          step.id !== `${retestIds[index]}:retest` ||
          step.phase !== 'retest' ||
          step.retestOf !== retestIds[index],
      )
  )
    return false;
  const expected = [
    ...lesson.wordIds.flatMap((id) =>
      testFirst
        ? [`course:${course.id}:recognition:${id}`]
        : [`course:${course.id}:study:${id}`, `course:${course.id}:recognition:${id}`],
    ),
    ...lesson.syntax.map((item) => item.id),
    ...lesson.readings.map((item) => item.question.id),
  ];
  return (
    plan.steps.slice(5, baseLength).every((step, index) => step.id === expected[index]) &&
    new Set(plan.steps.slice(0, 5).map((step) => step.entityId)).size === 5 &&
    plan.steps
      .slice(0, 5)
      .every(
        (step) =>
          vocabulary.has(step.entityId) &&
          (step.id === `course:${course.id}:review-recognition:${step.entityId}` ||
            step.id === `course:${course.id}:recall:${step.entityId}` ||
            (step.id === `course:${course.id}:preview:${step.entityId}` &&
              lesson.wordIds.includes(step.entityId))),
      )
  );
}
