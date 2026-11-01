import { validateStep } from './quest-builder';
import type { AppMode, EntityType, LearningSession, PracticeAttempt, QuestStep } from './types';

export interface Mistake {
  key: string;
  entityId: string;
  entityType: EntityType;
  questionId: string;
  /** Original question, including its authored reading passage and evidence. */
  step: QuestStep;
  correctCount: 0 | 1 | 2;
  resolved: boolean;
  lastWrongAt: string;
  lastAttemptAt: string;
  lastWrongAttemptId: string;
  sourceSessionId: string;
}

export function mistakeKey(
  attempt: Pick<PracticeAttempt, 'entityType' | 'entityId' | 'questionId'>,
) {
  return `${attempt.entityType}:${attempt.entityType === 'vocab' ? attempt.entityId : attempt.questionId}`;
}

/** Derived entirely from existing answer history; no separate mutable mistake ledger. */
export function getMistakes(attempts: PracticeAttempt[], sessions: LearningSession[]): Mistake[] {
  const sessionIndex = new Map(sessions.map((session) => [session.sessionId, session]));
  const states = new Map<string, Mistake>();
  const successfulSessions = new Map<string, Set<string>>();
  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();
  const firstAnswers = new Map<string, PracticeAttempt>();
  const ordered = attempts
    .filter((attempt) => Number.isFinite(Date.parse(attempt.completedAt)))
    .slice()
    .sort(
      (a, b) =>
        a.completedAt.localeCompare(b.completedAt) ||
        Number(b.firstTry) - Number(a.firstTry) ||
        a.attemptId.localeCompare(b.attemptId),
    );

  for (const attempt of ordered) {
    const session = sessionIndex.get(attempt.sessionId);
    const original = session?.steps.find(
      (step) => step.id === attempt.questionId && step.kind === 'question' && !step.retestOf,
    );
    if (!session || !original) continue; // Study/preview cards never create attempts.
    const answered =
      !attempt.firstTry && session.courseFlow
        ? session.steps.find((step) => step.retestOf === attempt.questionId)
        : original;
    if (
      !answered ||
      answered.kind !== 'question' ||
      answered.entityId !== attempt.entityId ||
      answered.entityType !== attempt.entityType ||
      answered.mode !== attempt.mode
    )
      continue;

    const questionSlot = JSON.stringify([attempt.sessionId, attempt.questionId]);
    const slot = JSON.stringify([attempt.sessionId, attempt.questionId, attempt.firstTry]);
    if (seenIds.has(attempt.attemptId) || seenSlots.has(slot)) continue;
    if (!attempt.firstTry) {
      const first = firstAnswers.get(questionSlot);
      if (!first || first.isCorrect) continue;
    }
    seenIds.add(attempt.attemptId);
    seenSlots.add(slot);
    if (attempt.firstTry) firstAnswers.set(questionSlot, attempt);

    const key = mistakeKey(attempt);
    if (!attempt.isCorrect) {
      states.set(key, {
        key,
        entityId: attempt.entityId,
        entityType: attempt.entityType,
        questionId: attempt.questionId,
        step: original,
        correctCount: 0,
        resolved: false,
        lastWrongAt: attempt.completedAt,
        lastAttemptAt: attempt.completedAt,
        lastWrongAttemptId: attempt.attemptId,
        sourceSessionId: attempt.sessionId,
      });
      successfulSessions.set(key, new Set());
      continue;
    }

    const state = states.get(key);
    if (!state) continue;
    state.lastAttemptAt = attempt.completedAt;
    const successes = successfulSessions.get(key)!;
    // A delayed lesson tail may count once after its first wrong answer, but
    // memory + vocabulary + retry in one quiz cannot clear an item twice.
    if (successes.has(attempt.sessionId) || state.resolved) continue;
    successes.add(attempt.sessionId);
    state.correctCount = successes.size >= 2 ? 2 : 1;
    state.resolved = state.correctCount === 2;
  }

  return [...states.values()].sort(
    (a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt) || a.key.localeCompare(b.key),
  );
}

export function getActiveMistakes(
  attempts: PracticeAttempt[],
  sessions: LearningSession[],
): Mistake[] {
  return getMistakes(attempts, sessions).filter((mistake) => !mistake.resolved);
}

export interface MistakeQuestPlan {
  planId: string;
  sessionKind: 'mistakes';
  steps: QuestStep[];
  estimatedSeconds: number;
}

export interface MistakeQuestOptions {
  attempts: PracticeAttempt[];
  sessions: LearningSession[];
  appMode: AppMode;
  limit?: number;
}

function planFingerprint(mistakes: Mistake[]): string {
  const value = JSON.stringify(
    mistakes.map((mistake) => [mistake.key, mistake.lastWrongAttemptId, mistake.correctCount]),
  );
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildMistakeQuest({
  attempts,
  sessions,
  appMode,
  limit = 10,
}: MistakeQuestOptions): MistakeQuestPlan | null {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) return null;
  // Owner-authorized loaded content includes preserved legacy demo snapshots.
  // This whitelist does not change ordinary learner-plan approval rules.
  const sourceMode = appMode === 'learner' ? 'demo' : appMode;
  const selected = getActiveMistakes(attempts, sessions)
    .filter((mistake) => validateStep(mistake.step, sourceMode))
    .slice(0, limit);
  if (!selected.length) return null;
  const steps = selected.map((mistake) => structuredClone(mistake.step));
  return {
    planId: `mistakes:v1:${planFingerprint(selected)}`,
    sessionKind: 'mistakes',
    steps,
    estimatedSeconds: steps.reduce((sum, step) => sum + step.estimatedSeconds, 0),
  };
}

type MistakePlanCandidate = Pick<LearningSession, 'planId' | 'steps'> &
  Partial<
    Pick<
      LearningSession,
      | 'sessionKind'
      | 'courseId'
      | 'courseVersion'
      | 'courseFlow'
      | 'retestQuestionIds'
      | 'rewardPolicy'
    >
  >;

/** Call with history preceding session creation when validating a backup snapshot. */
export function validMistakePlan(
  plan: MistakePlanCandidate,
  attempts: PracticeAttempt[],
  sessions: LearningSession[],
  appMode: AppMode,
): boolean {
  if (
    plan.sessionKind !== 'mistakes' ||
    plan.courseId !== undefined ||
    plan.courseVersion !== undefined ||
    plan.courseFlow !== undefined ||
    plan.retestQuestionIds !== undefined ||
    plan.rewardPolicy !== undefined
  )
    return false;
  const expected = buildMistakeQuest({ attempts, sessions, appMode, limit: plan.steps.length });
  if (!expected || expected.planId !== plan.planId || expected.steps.length !== plan.steps.length)
    return false;
  return plan.steps.every((step, index) => {
    const source = expected.steps[index];
    const keys = new Set([...Object.keys(step), ...Object.keys(source)]);
    return [...keys].every(
      (key) =>
        JSON.stringify(step[key as keyof QuestStep]) ===
        JSON.stringify(source[key as keyof QuestStep]),
    );
  });
}
