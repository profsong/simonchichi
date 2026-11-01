import { getCatalog } from '../data/catalog';
import type { ContentBank, Vocabulary, VocabularyQuestion } from '../data/content-schema';
import type { AppMode, LearningSession, QuestStep, ReviewState, Settings } from './types';
import { resolveCourseStep } from './course-quest';

function studyStep(word: Vocabulary): QuestStep {
  return {
    id: `study:${word.id}`,
    entityId: word.id,
    entityType: 'vocab',
    phase: 'vocab',
    kind: 'study',
    mode: 'recognition',
    title: word.headword,
    prompt: word.koreanMeaning,
    english: word.exampleEn,
    translation: word.exampleKo,
    collocations: word.collocations,
    explanation: word.englishDefinition,
    estimatedSeconds: word.estimatedSeconds,
  };
}

function recallStep(word: Vocabulary): QuestStep {
  return {
    id: `recall:${word.id}`,
    entityId: word.id,
    entityType: 'vocab',
    phase: 'review',
    kind: 'question',
    mode: 'recall',
    title: '영어로 떠올리기',
    prompt: `‘${word.koreanMeaning}’에 맞는 영어 단어를 입력해 보세요. (${word.partOfSpeech})`,
    acceptedAnswers: word.acceptedAnswers,
    explanation: `${word.headword}: ${word.koreanMeaning}\n${word.exampleEn}\n${word.exampleKo}`,
    hint: `첫 글자는 ${word.headword[0]}입니다.`,
    estimatedSeconds: 30,
  };
}

function vocabularyStep(item: VocabularyQuestion): QuestStep {
  return {
    id: item.id,
    entityId: item.vocabId,
    entityType: 'vocab',
    phase: 'vocab',
    kind: 'question',
    mode: 'recognition',
    title: '뜻과 단어 연결',
    prompt: item.promptKo,
    choices: item.choices,
    correctIndex: item.correctIndex,
    explanation: item.explanationKo,
    hint: item.exampleEn,
    estimatedSeconds: item.estimatedSeconds,
  };
}

/** Only authored answers and evidence enter the immutable quest snapshot. */
export function catalogSteps(bank: ContentBank): QuestStep[] {
  return [
    ...bank.vocabulary.flatMap((word) => [studyStep(word), recallStep(word)]),
    ...bank.vocabularyQuestions.map(vocabularyStep),
    ...bank.syntax.map((item): QuestStep => ({
      id: item.id,
      entityId: item.id,
      entityType: 'syntax',
      phase: 'syntax',
      kind: 'question',
      mode: 'syntax',
      title: '문장의 연결 찾기',
      prompt: item.promptKo,
      english: item.sentenceEn,
      choices: item.choices,
      correctIndex: item.correctIndex,
      explanation: item.explanationKo,
      estimatedSeconds: Math.max(120, item.estimatedSeconds),
    })),
    ...bank.readings.flatMap((passage) =>
      passage.questions.map((item, index): QuestStep => ({
        id: item.id,
        entityId: item.id,
        entityType: 'reading',
        phase: 'reading',
        kind: 'question',
        mode: 'reading',
        title: passage.title,
        prompt: item.promptKo,
        passage: passage.passageEn,
        choices: item.choices,
        correctIndex: item.correctIndex,
        explanation: item.explanationKo,
        evidenceQuote: item.evidenceQuote,
        estimatedSeconds:
          index === 0
            ? Math.ceil(passage.estimatedSeconds * 0.75)
            : Math.floor(passage.estimatedSeconds * 0.25),
      })),
    ),
  ];
}

const indexes = new Map<AppMode, Map<string, QuestStep>>();
export function resolveStep(id: string, mode: AppMode): QuestStep | undefined {
  if (id.startsWith('course:') || id.startsWith('review-test:')) return resolveCourseStep(id, mode);
  if (!indexes.has(mode))
    indexes.set(mode, new Map(catalogSteps(getCatalog(mode)).map((step) => [step.id, step])));
  return indexes.get(mode)?.get(id);
}

export function validateStep(step: QuestStep, mode: AppMode): boolean {
  const source = resolveStep(step.id, mode);
  if (!source) return false;
  const allowedPhase =
    step.phase === source.phase ||
    (!step.id.startsWith('course:') &&
      step.phase === 'review' &&
      source.entityType === 'vocab' &&
      source.kind === 'question');
  if (!allowedPhase) return false;
  const keys = new Set([...Object.keys(step), ...Object.keys(source)]);
  return [...keys].every(
    (key) =>
      key === 'phase' ||
      JSON.stringify(step[key as keyof QuestStep]) ===
        JSON.stringify(source[key as keyof QuestStep]),
  );
}

export interface QuestOptions {
  catalog: ContentBank;
  reviews: ReviewState[];
  completedPlanIds: string[];
  localDay: string;
  budgetSeconds?: number;
  readingBand?: Settings['readingBand'];
  /** Entities already answered on this local day, including wrong or hinted attempts. */
  reviewedEntityIds?: string[];
}

/** Completed curriculum stages, independent of calendar days and session count. */
export function getCompletedPlanIds(
  bank: ContentBank,
  reviews: ReviewState[],
  sessions: LearningSession[],
): string[] {
  const finished = sessions.filter((session) => session.status === 'completed');
  const completed = new Set(finished.map((session) => session.planId));
  const completedStudies = new Set(
    finished.flatMap((session) =>
      session.steps.filter((step) => step.kind === 'study').map((step) => step.entityId),
    ),
  );
  const studied = new Set(
    reviews.filter((state) => completedStudies.has(state.entityId)).map((state) => state.entityId),
  );
  return bank.dailyPlans
    .filter(
      (plan) =>
        completed.has(plan.id) ||
        (completed.has(`${plan.id}:partial`) &&
          plan.vocabularyIds.length === 5 &&
          plan.vocabularyIds.every((id) => studied.has(id))),
    )
    .map((plan) => plan.id);
}

export function buildQuest({
  catalog: bank,
  reviews,
  completedPlanIds,
  localDay,
  budgetSeconds = 720,
  readingBand = 'auto',
  reviewedEntityIds = [],
}: QuestOptions): { planId: string; steps: QuestStep[]; estimatedSeconds: number } | null {
  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0) return null;
  const learnedIds = new Set(reviews.map((state) => state.entityId));
  const reviewedToday = new Set(reviewedEntityIds);
  const plan = [...bank.dailyPlans]
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .find(
      (item) =>
        !completedPlanIds.includes(item.id) &&
        !(
          completedPlanIds.includes(`${item.id}:partial`) &&
          item.vocabularyIds.every((id) => learnedIds.has(id))
        ),
    );
  const index = new Map(catalogSteps(bank).map((step) => [step.id, step]));
  const vocabulary = new Map(bank.vocabulary.map((word) => [word.id, word]));
  const due = reviews
    .filter(
      (state) =>
        state.dueDay <= localDay &&
        vocabulary.has(state.entityId) &&
        !reviewedToday.has(state.entityId) &&
        !state.correctDays.includes(localDay),
    )
    .sort(
      (a, b) =>
        a.dueDay.localeCompare(b.dueDay) ||
        a.stage - b.stage ||
        a.entityId.localeCompare(b.entityId),
    );
  if (!plan) {
    const steps = due
      .slice(0, 8)
      .map((state) => index.get(`recall:${state.entityId}`)!)
      .filter(Boolean);
    const selected: QuestStep[] = [];
    let estimatedSeconds = 0;
    for (const step of steps)
      if (estimatedSeconds + step.estimatedSeconds <= budgetSeconds) {
        selected.push(step);
        estimatedSeconds += step.estimatedSeconds;
      }
    return selected.length
      ? { planId: `review:${localDay}`, steps: selected, estimatedSeconds }
      : null;
  }
  const syntax = index.get(plan.syntaxId);
  let reading = bank.readings.find((item) => item.id === plan.readingId);
  if (readingBand !== 'auto') {
    // Prefer unseen passages before repeating one that happened to be nearest.
    const seenQuestions = new Set(reviews.map((state) => state.entityId));
    const seen = (passage: ContentBank['readings'][number]) =>
      passage.questions.some((question) => seenQuestions.has(question.id));
    reading =
      [...bank.readings]
        .filter((item) => item.level === readingBand)
        .sort(
          (a, b) =>
            Number(seen(a)) - Number(seen(b)) ||
            Math.abs(a.week - plan.week) - Math.abs(b.week - plan.week) ||
            Number(b.id === plan.readingId) - Number(a.id === plan.readingId) ||
            a.day - b.day,
        )[0] ?? reading;
  }
  if (!syntax || !reading) return null;
  const readingSteps = reading.questions.map((item) => index.get(item.id)!);
  const fixedSteps = [syntax, ...readingSteps];
  let used = fixedSteps.reduce((sum, step) => sum + step.estimatedSeconds, 0);
  const newWords = plan.vocabularyIds
    .filter((id) => !learnedIds.has(id))
    .map((id) => vocabulary.get(id))
    .filter((word): word is Vocabulary => !!word);
  const cards = newWords.map(studyStep);
  const mcqs = bank.vocabularyQuestions.filter((item) => plan.vocabularyIds.includes(item.vocabId));
  const minVocabCost = (cards[0]?.estimatedSeconds ?? 0) + (mcqs[0]?.estimatedSeconds ?? 0);
  // Reject an impossibly small budget instead of dropping syntax or passage evidence.
  if (used + minVocabCost > budgetSeconds) return null;
  const reviewSteps: QuestStep[] = [];
  for (const [position, state] of due.slice(0, 8).entries()) {
    const recognition = bank.vocabularyQuestions.find(
      (item) => item.vocabId === state.entityId && item.type === 'vocab_en_to_ko',
    );
    const base =
      position % 3 === 2 && recognition
        ? vocabularyStep(recognition)
        : recallStep(vocabulary.get(state.entityId)!);
    const step: QuestStep = { ...base, phase: 'review' };
    if (used + minVocabCost + step.estimatedSeconds > budgetSeconds) break;
    reviewSteps.push(step);
    used += step.estimatedSeconds;
  }
  const vocabSteps: QuestStep[] = [];
  const maximumNew = due.length > 8 ? 2 : 5;
  for (const card of cards.slice(0, maximumNew)) {
    if (used + card.estimatedSeconds + (mcqs[0]?.estimatedSeconds ?? 0) > budgetSeconds) break;
    vocabSteps.push(card);
    used += card.estimatedSeconds;
  }
  const taughtIds = new Set(vocabSteps.map((step) => step.entityId));
  const testedWords = new Set<string>();
  for (const item of mcqs) {
    if (testedWords.size === 2) break;
    if (
      !taughtIds.has(item.vocabId) ||
      testedWords.has(item.vocabId) ||
      reviewSteps.some((step) => step.id === item.id)
    )
      continue;
    if (used + item.estimatedSeconds > budgetSeconds) continue;
    vocabSteps.push(vocabularyStep(item));
    testedWords.add(item.vocabId);
    used += item.estimatedSeconds;
  }
  // A partial plan stays eligible next day; stored study states carry forward the omitted words.
  const allScheduledCardsCovered =
    cards.every((card) => taughtIds.has(card.entityId)) && plan.vocabularyIds.length === 5;
  return {
    planId: allScheduledCardsCovered ? plan.id : `${plan.id}:partial`,
    steps: [...reviewSteps, ...vocabSteps, ...fixedSteps],
    estimatedSeconds: used,
  };
}
