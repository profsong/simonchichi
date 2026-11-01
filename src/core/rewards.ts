import type { CourseDocument } from '../data/course-schema';
import { completedCoursePlanIds, learnedCourseWords } from './course-quest';
import type {
  LearningSession,
  PracticeAttempt,
  ReviewRewardPolicy,
  ReviewState,
  RewardEvent,
} from './types';

export function deriveReviewRewardPolicy({
  course,
  sessions,
  reviews,
  localDay,
}: {
  course: CourseDocument;
  sessions: LearningSession[];
  reviews: ReviewState[];
  localDay: string;
}): ReviewRewardPolicy {
  const related = sessions.filter(
    (session) => session.courseId === course.id && session.sessionKind === 'course',
  );
  const completedToday = related
    .filter(
      (session) =>
        session.status === 'completed' && (session.completedDay ?? session.localDay) === localDay,
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  const inProgress = related
    .filter((session) => session.status === 'in_progress')
    .sort((a, b) => (a.createdAt ?? a.updatedAt).localeCompare(b.createdAt ?? b.updatedAt))[0];
  const basis = completedToday ?? inProgress;
  if (basis) {
    const questMaxXp =
      basis.steps.filter((step) => step.kind === 'question' && !step.retestOf).length * 10 + 30;
    return {
      version: 1,
      scoring: 'first-correct-proportion',
      basisCourseId: course.id,
      basisPlanId: basis.planId,
      basisSessionId: basis.sessionId,
      basisKind: completedToday ? 'completed-today' : 'in-progress',
      questMaxXp,
      maxXp: Math.floor((questMaxXp * 30) / 100),
    };
  }
  const completedIds = new Set(completedCoursePlanIds(course, sessions));
  const next = course.lessons.find((lesson) => !completedIds.has(lesson.id));
  const questMaxXp = (24 + Math.min(5, learnedCourseWords(course, reviews).length)) * 10 + 30;
  return {
    version: 1,
    scoring: 'first-correct-proportion',
    basisCourseId: course.id,
    basisPlanId: (next ?? course.lessons.at(-1)!).id,
    basisKind: next ? 'next-plan' : 'course-standard',
    questMaxXp,
    maxXp: Math.floor((questMaxXp * 30) / 100),
  };
}

export function rewardForAttempt(
  attempt: PracticeAttempt,
  priorRewards: RewardEvent[],
  session?: Pick<LearningSession, 'rewardPolicy'>,
): RewardEvent | null {
  if (session?.rewardPolicy) return null;
  const firstId = `question:${attempt.questionId}:first`;
  const first = priorRewards.find((reward) => reward.id === firstId);
  if (attempt.firstTry) {
    if (first) return null;
    // Zero-XP events record wrong first answers so retries cannot become new first rewards.
    return {
      id: firstId,
      sessionId: attempt.sessionId,
      questionId: attempt.questionId,
      kind: 'first',
      xp: attempt.isCorrect ? 10 : 0,
      localDay: attempt.localDay,
    };
  }
  const retryId = `question:${attempt.questionId}:retry`;
  if (
    !attempt.isCorrect ||
    !first ||
    first.xp !== 0 ||
    first.sessionId !== attempt.sessionId ||
    priorRewards.some((reward) => reward.id === retryId)
  )
    return null;
  return {
    id: retryId,
    sessionId: attempt.sessionId,
    questionId: attempt.questionId,
    kind: 'retry',
    xp: 3,
    localDay: attempt.localDay,
  };
}

export function completionReward(
  session: LearningSession,
  priorRewards: RewardEvent[],
  attempts: PracticeAttempt[] = [],
): RewardEvent | null {
  const day = session.completedDay ?? session.localDay;
  if (session.sessionKind === 'review-test' && session.rewardPolicy) {
    const id = `review:${session.sessionId}`;
    const questions = session.steps.filter((step) => step.kind === 'question');
    const first = new Map(
      attempts
        .filter((attempt) => attempt.sessionId === session.sessionId && attempt.firstTry)
        .map((attempt) => [attempt.questionId, attempt]),
    );
    if (
      session.status !== 'completed' ||
      session.currentQuestionIndex !== session.steps.length ||
      questions.length !== 10 ||
      questions.some((question) => !first.has(question.id)) ||
      priorRewards.some((reward) => reward.id === id)
    )
      return null;
    const correct = questions.filter((question) => first.get(question.id)!.isCorrect).length;
    return {
      id,
      sessionId: session.sessionId,
      kind: 'review',
      xp: Math.floor((session.rewardPolicy.maxXp * correct) / questions.length),
      localDay: day,
    };
  }
  const id = `completion:${day}`;
  if (
    session.sessionKind === 'review-test' ||
    session.status !== 'completed' ||
    session.steps.length === 0 ||
    session.currentQuestionIndex !== session.steps.length ||
    priorRewards.some((reward) => reward.id === id)
  )
    return null;
  return {
    id,
    sessionId: session.sessionId,
    kind: 'completion',
    xp: 30,
    localDay: day,
  };
}
