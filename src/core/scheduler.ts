import type { PracticeAttempt, ReviewState } from './types';

export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  // Calendar arithmetic in UTC avoids DST and never converts a local day into an instant.
  const result = new Date(Date.UTC(year, month - 1, date + amount));
  return result.toISOString().slice(0, 10);
}

const intervals = [1, 1, 3, 7, 14, 30];
const unique = (days: string[], day: string) => [...new Set([...days, day])].sort();

export function scheduleReview(
  previous: ReviewState | undefined,
  attempt: PracticeAttempt,
): ReviewState {
  const state: ReviewState = previous
    ? { ...previous }
    : {
        entityId: attempt.entityId,
        stage: 0,
        dueDay: attempt.localDay,
        correctDays: [],
        activeRecallCorrectDays: [],
        inContextCorrectDays: [],
        delayedSuccess: false,
        mastered: false,
      };
  // Replays and older imported events cannot move the live schedule backwards.
  if (state.lastAttemptAt && attempt.completedAt <= state.lastAttemptAt) return state;
  const independent = attempt.isCorrect && !attempt.usedHint && attempt.firstTry;
  const activeRecall = attempt.mode === 'recall' || attempt.mode === 'cloze';
  const contextual = ['meaning_in_context', 'cloze', 'collocation'].includes(attempt.mode);
  if (!independent) {
    // A retry is feedback, never another independent failure or success.
    if (attempt.firstTry) {
      state.stage = Math.max(0, state.stage - 1);
      state.delayedSuccess = false;
    }
    state.dueDay = addDays(attempt.localDay, 1);
    state.lastSuccessDay = undefined;
    state.mastered = false;
  } else {
    const sameDaySuccess = state.correctDays.includes(attempt.localDay);
    if (!sameDaySuccess) {
      // Recognition establishes a first review; only active production advances intervals.
      state.stage =
        state.stage === 0 ? 1 : activeRecall ? Math.min(5, state.stage + 1) : state.stage;
      state.dueDay = [state.dueDay, addDays(attempt.localDay, intervals[state.stage])]
        .sort()
        .at(-1)!;
      state.correctDays = unique(state.correctDays, attempt.localDay);
      if (
        activeRecall &&
        state.lastSuccessDay &&
        attempt.localDay >= addDays(state.lastSuccessDay, 7)
      )
        state.delayedSuccess = true;
      state.lastSuccessDay = attempt.localDay;
      // Seeing an answer earlier today makes a later question on that same sense
      // practice, not fresh evidence of independent production or context use.
      if (activeRecall)
        state.activeRecallCorrectDays = unique(state.activeRecallCorrectDays, attempt.localDay);
      if (contextual)
        state.inContextCorrectDays = unique(state.inContextCorrectDays, attempt.localDay);
    }
    state.mastered =
      state.correctDays.length >= 3 &&
      state.activeRecallCorrectDays.length >= 2 &&
      state.inContextCorrectDays.length >= 1 &&
      state.delayedSuccess;
  }
  state.lastAttemptAt = attempt.completedAt;
  return state;
}
