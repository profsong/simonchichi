import type { QuestStep } from './types';

const normalizeAnswer = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

/** MCQ answers are the string form of the selected zero-based index. */
export function gradeAnswer(step: QuestStep, answer: string): boolean {
  if (step.kind !== 'question') return false;
  if (step.choices) {
    return (
      step.correctIndex !== undefined &&
      /^\d+$/.test(answer) &&
      String(step.correctIndex) === answer
    );
  }
  const normalized = normalizeAnswer(answer);
  return (
    normalized.length > 0 &&
    !!step.acceptedAnswers?.some((accepted) => normalizeAnswer(accepted) === normalized)
  );
}

export function sanitizeResponseMs(value: number): number {
  // Paused tabs and clock changes must not create negative or unbounded timings.
  return Number.isFinite(value) ? Math.min(3_600_000, Math.max(0, Math.round(value))) : 0;
}
