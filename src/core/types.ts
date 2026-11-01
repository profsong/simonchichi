import type { RoomSelection } from './room-catalog';

export type AppMode = 'learner' | 'demo';
export type CourseId = 'advanced-300' | 'suneung-2000';
export type SessionKind = 'course' | 'review-test' | 'mistakes';
export type Phase = 'review' | 'vocab' | 'syntax' | 'reading' | 'retest';
export type QuestionMode =
  | 'recognition'
  | 'meaning_in_context'
  | 'recall'
  | 'cloze'
  | 'collocation'
  | 'syntax'
  | 'paraphrase'
  | 'reading';
export type EntityType = 'vocab' | 'syntax' | 'reading';

export interface QuestStep {
  id: string;
  entityId: string;
  entityType: EntityType;
  phase: Phase;
  kind: 'study' | 'question';
  mode: QuestionMode;
  title: string;
  prompt: string;
  choices?: string[];
  correctIndex?: number;
  acceptedAnswers?: string[];
  explanation: string;
  english?: string;
  translation?: string;
  collocations?: string[];
  passage?: string;
  evidenceQuote?: string;
  hint?: string;
  /** The prompt already displays a clue; it cannot count as unaided recall. */
  alwaysHinted?: boolean;
  /** Tail re-answer of an original vocabulary question, stored as its one retry. */
  retestOf?: string;
  estimatedSeconds: number;
}
export interface PracticeAttempt {
  attemptId: string;
  sessionId: string;
  questionId: string;
  entityId: string;
  entityType: EntityType;
  mode: QuestionMode;
  answer: string;
  isCorrect: boolean;
  usedHint: boolean;
  firstTry: boolean;
  responseMs: number;
  completedAt: string;
  localDay: string;
}
export interface ReviewState {
  entityId: string;
  stage: number;
  dueDay: string;
  correctDays: string[];
  activeRecallCorrectDays: string[];
  inContextCorrectDays: string[];
  lastAttemptAt?: string;
  lastSuccessDay?: string;
  delayedSuccess: boolean;
  mastered: boolean;
}
export interface LearningSession {
  sessionId: string;
  localDay: string;
  planId: string;
  contentVersion: string;
  appMode: AppMode;
  steps: QuestStep[];
  currentQuestionIndex: number;
  status: 'in_progress' | 'completed';
  /** Calendar day of completion; absent on legacy records. */
  completedDay?: string;
  xpAwarded: number;
  updatedAt: string;
  hintStepIds: string[];
  /** Absent on the original 60-stage course records, which remain archival. */
  courseId?: CourseId;
  sessionKind?: SessionKind;
  courseVersion?: string;
  courseFlow?: 'test-first-v1';
  /** Absent before the base lesson ends; even an empty queue is fixed once. */
  retestQuestionIds?: string[];
  createdAt?: string;
  studyEvents?: { stepId: string; completedAt: string; localDay: string }[];
  /** Frozen at the start of new review rounds; absent on historical sessions. */
  rewardPolicy?: ReviewRewardPolicy;
}
export interface ReviewRewardPolicy {
  version: 1;
  scoring: 'first-correct-proportion';
  basisCourseId: CourseId;
  basisPlanId: string;
  basisSessionId?: string;
  basisKind: 'completed-today' | 'in-progress' | 'next-plan' | 'course-standard';
  questMaxXp: number;
  maxXp: number;
}
export interface PurchaseReceipt {
  id: string;
  itemId: string;
  price: number;
  createdAt: string;
  /** Missing on immutable original-price receipts; new purchases use policy 2. */
  pricingVersion?: 2;
}
export interface RewardEvent {
  id: string;
  sessionId: string;
  questionId?: string;
  kind: 'first' | 'retry' | 'completion' | 'review';
  xp: number;
  localDay: string;
}
export interface Settings {
  id: 'preferences';
  sound: boolean;
  theme: 'forest' | 'night';
  readingBand: 'auto' | 'B1' | 'B2' | 'B3';
  avatarId?: 'monchichi' | 'sichiware' | 'sipompurin' | 'lumi' | 'momo' | 'nova';
  selectedWordbookId?: CourseId;
  room?: RoomSelection;
}
export const defaultSettings: Settings = {
  id: 'preferences',
  sound: false,
  theme: 'forest',
  readingBand: 'auto',
  avatarId: 'monchichi',
  selectedWordbookId: 'advanced-300',
};
