import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { gradeAnswer, sanitizeResponseMs } from '../core/grading';
import { completionReward, deriveReviewRewardPolicy, rewardForAttempt } from '../core/rewards';
import { availableXp, resolveRoom, roomSelectionIsOwned } from '../core/economy';
import { getRoomItem, getRoomItemPrice, roomPricingVersion, roomSlot } from '../core/room-catalog';
import { validateStep } from '../core/quest-builder';
import { buildCourseRetests, validCoursePlan, validCourseRetests } from '../core/course-quest';
import { addDays, localDay, scheduleReview } from '../core/scheduler';
import {
  defaultSettings,
  type AppMode,
  type CourseId,
  type LearningSession,
  type PracticeAttempt,
  type QuestStep,
  type ReviewState,
  type RewardEvent,
  type Settings,
  type SessionKind,
  type PurchaseReceipt,
} from '../core/types';
import { getCatalog } from './catalog';
import { getCourse } from './courses';

export class QuestDatabase extends Dexie {
  readonly mode: AppMode;
  attempts!: Table<PracticeAttempt, string>;
  reviews!: Table<ReviewState, string>;
  sessions!: Table<LearningSession, string>;
  rewards!: Table<RewardEvent, string>;
  settings!: Table<Settings, string>;
  purchases!: Table<PurchaseReceipt, string>;

  constructor(mode: AppMode, name = `english-quest-${mode}`) {
    super(name);
    this.mode = mode;
    this.version(1).stores({
      attempts: 'attemptId, sessionId, questionId, entityId, localDay, completedAt',
      reviews: 'entityId, dueDay',
      sessions: 'sessionId, &localDay, status',
      rewards: 'id, sessionId, localDay',
      settings: 'id',
    });
    // Only the localDay index changes. All existing primary keys and records survive.
    this.version(2).stores({ sessions: 'sessionId, localDay, status, planId' });
    this.version(3).stores({ purchases: 'id, &itemId, createdAt' });
  }
}

const databases = new Map<AppMode, QuestDatabase>();
export function getDatabase(mode: AppMode): QuestDatabase {
  let database = databases.get(mode);
  if (!database) {
    database = new QuestDatabase(mode);
    databases.set(mode, database);
  }
  return database;
}

const invalidData = () => new Error('백업 파일을 확인해 주세요. 현재 기록은 그대로 보관했어요.');
const idSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const instantSchema = z.string().datetime();
const modeSchema = z.enum([
  'recognition',
  'meaning_in_context',
  'recall',
  'cloze',
  'collocation',
  'syntax',
  'paraphrase',
  'reading',
]);
const textSchema = z.string().min(1).max(20000);
const stepSchema = z
  .strictObject({
    id: idSchema,
    entityId: idSchema,
    entityType: z.enum(['vocab', 'syntax', 'reading']),
    phase: z.enum(['review', 'vocab', 'syntax', 'reading', 'retest']),
    kind: z.enum(['study', 'question']),
    mode: modeSchema,
    title: textSchema,
    prompt: textSchema,
    choices: z.array(textSchema).length(4).optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    acceptedAnswers: z.array(textSchema).min(1).max(20).optional(),
    explanation: textSchema,
    english: textSchema.optional(),
    translation: textSchema.optional(),
    collocations: z.array(textSchema).max(20).optional(),
    passage: textSchema.optional(),
    evidenceQuote: textSchema.optional(),
    hint: textSchema.optional(),
    alwaysHinted: z.boolean().optional(),
    retestOf: idSchema.optional(),
    estimatedSeconds: z.number().int().positive().max(720),
  })
  .refine((step) => {
    if (
      step.choices &&
      new Set(step.choices.map((choice) => choice.trim().toLowerCase())).size !== 4
    )
      return false;
    if (step.evidenceQuote && !step.passage?.includes(step.evidenceQuote)) return false;
    if (step.kind === 'study') return true;
    return step.choices
      ? step.correctIndex !== undefined && step.acceptedAnswers === undefined
      : !!step.acceptedAnswers?.length && step.correctIndex === undefined;
  });
const sessionSchema = z.strictObject({
  sessionId: idSchema,
  localDay: daySchema,
  planId: idSchema,
  contentVersion: textSchema,
  appMode: z.enum(['learner', 'demo']),
  steps: z.array(stepSchema).min(1).max(100),
  currentQuestionIndex: z.number().int().min(0).max(100),
  status: z.enum(['in_progress', 'completed']),
  completedDay: daySchema.optional(),
  xpAwarded: z.number().int().min(0),
  updatedAt: instantSchema,
  hintStepIds: z.array(idSchema).max(100),
  courseId: z.enum(['advanced-300', 'suneung-2000']).optional(),
  sessionKind: z.enum(['course', 'review-test']).optional(),
  courseVersion: textSchema.optional(),
  courseFlow: z.literal('test-first-v1').optional(),
  retestQuestionIds: z.array(idSchema).max(20).optional(),
  createdAt: instantSchema.optional(),
  studyEvents: z
    .array(z.strictObject({ stepId: idSchema, completedAt: instantSchema, localDay: daySchema }))
    .max(100)
    .optional(),
  rewardPolicy: z
    .strictObject({
      version: z.literal(1),
      scoring: z.literal('first-correct-proportion'),
      basisCourseId: z.enum(['advanced-300', 'suneung-2000']),
      basisPlanId: idSchema,
      basisSessionId: idSchema.optional(),
      basisKind: z.enum(['completed-today', 'in-progress', 'next-plan', 'course-standard']),
      questMaxXp: z.number().int().positive().max(1000),
      maxXp: z.number().int().positive().max(300),
    })
    .optional(),
});
const attemptSchema = z.strictObject({
  attemptId: idSchema,
  sessionId: idSchema,
  questionId: idSchema,
  entityId: idSchema,
  entityType: z.enum(['vocab', 'syntax', 'reading']),
  mode: modeSchema,
  answer: z.string().max(1000),
  isCorrect: z.boolean(),
  usedHint: z.boolean(),
  firstTry: z.boolean(),
  responseMs: z.number().int().min(0),
  completedAt: instantSchema,
  localDay: daySchema,
});
const reviewSchema = z.strictObject({
  entityId: idSchema,
  stage: z.number().int().min(0).max(5),
  dueDay: daySchema,
  correctDays: z.array(daySchema),
  activeRecallCorrectDays: z.array(daySchema),
  inContextCorrectDays: z.array(daySchema),
  lastAttemptAt: instantSchema.optional(),
  lastSuccessDay: daySchema.optional(),
  delayedSuccess: z.boolean(),
  mastered: z.boolean(),
});
const rewardSchema = z.strictObject({
  id: idSchema,
  sessionId: idSchema,
  questionId: idSchema.optional(),
  kind: z.enum(['first', 'retry', 'completion', 'review']),
  xp: z.number().int().min(0).max(300),
  localDay: daySchema,
});
const settingsSchema = z.strictObject({
  id: z.literal('preferences'),
  sound: z.boolean(),
  theme: z.enum(['forest', 'night']),
  readingBand: z.enum(['auto', 'B1', 'B2', 'B3']),
  avatarId: z.enum(['monchichi', 'sichiware', 'sipompurin', 'lumi', 'momo', 'nova']).optional(),
  selectedWordbookId: z.enum(['advanced-300', 'suneung-2000']).optional(),
  room: z
    .strictObject({ backgroundId: idSchema, outfitId: idSchema, accessoryId: idSchema })
    .optional(),
});
const purchaseSchema = z.strictObject({
  id: idSchema,
  itemId: idSchema,
  price: z.number().int().positive(),
  createdAt: instantSchema,
  pricingVersion: z.literal(2).optional(),
});
const backupSchema = z.strictObject({
  schemaVersion: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  contentVersion: textSchema,
  appMode: z.enum(['learner', 'demo']),
  exportedAt: instantSchema,
  attempts: z.array(attemptSchema).max(100000),
  reviews: z.array(reviewSchema).max(10000),
  sessions: z.array(sessionSchema).max(10000),
  rewards: z.array(rewardSchema).max(100000),
  settings: z.array(settingsSchema).max(1),
  purchases: z.array(purchaseSchema).max(1000).optional(),
});
type Backup = z.infer<typeof backupSchema>;

function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

function attemptId(sessionId: string, questionId: string, firstTry: boolean): string {
  return `${sessionId}:${questionId}:${firstTry ? 'first' : 'retry'}`;
}

function stepAttemptId(sessionId: string, step: QuestStep): string {
  return attemptId(sessionId, step.retestOf ?? step.id, !step.retestOf);
}

function initialStudyReview(entityId: string, day: string): ReviewState {
  return {
    entityId,
    stage: 1,
    dueDay: addDays(day, 1),
    correctDays: [],
    activeRecallCorrectDays: [],
    inContextCorrectDays: [],
    delayedSuccess: false,
    mastered: false,
  };
}

function validPlanId(planId: string, day: string, mode: AppMode): boolean {
  if (planId === `review:${day}`) return true;
  const sourceId = planId.endsWith(':partial') ? planId.slice(0, -8) : planId;
  return getCatalog(mode).dailyPlans.some((plan) => plan.id === sourceId);
}

async function requireSession(db: QuestDatabase, sessionId: string): Promise<LearningSession> {
  const session = await db.sessions.get(sessionId);
  if (!session || session.appMode !== db.mode)
    throw new Error('학습 기록을 찾지 못했어요. 홈에서 다시 열어 주세요.');
  return session;
}

export interface SessionPlan {
  planId: string;
  steps: QuestStep[];
  courseId?: CourseId;
  sessionKind?: SessionKind;
  courseVersion?: string;
  courseFlow?: 'test-first-v1';
}

export function sessionScope(session: Pick<LearningSession, 'courseId' | 'sessionKind'>): string {
  return session.courseId ? `${session.courseId}:${session.sessionKind}` : 'legacy';
}

const creationOrder = (a: LearningSession, b: LearningSession) =>
  a.localDay.localeCompare(b.localDay) ||
  Number(a.sessionId.split(':')[1] ?? 1) - Number(b.sessionId.split(':')[1] ?? 1);

async function globalTimestamp(db: QuestDatabase, previous?: string): Promise<string> {
  const latest = (await db.sessions.toArray())
    .map((session) => session.updatedAt)
    .sort()
    .at(-1);
  const purchase = await db.purchases.orderBy('createdAt').last();
  return nextTimestamp([previous ?? '', latest ?? '', purchase?.createdAt ?? ''].sort().at(-1));
}

function studyHistory(
  session: LearningSession,
  attempts: PracticeAttempt[],
): NonNullable<LearningSession['studyEvents']> {
  if (session.studyEvents) return session.studyEvents;
  // Original snapshots predate per-study timestamps. Preserve their ordering
  // before the next authored question, then persist this bridge on first write.
  return session.steps.slice(0, session.currentQuestionIndex).flatMap((step, index) => {
    if (step.kind !== 'study') return [];
    const laterIds = new Set(session.steps.slice(index + 1).map((later) => later.id));
    const next = attempts
      .filter(
        (attempt) => attempt.sessionId === session.sessionId && laterIds.has(attempt.questionId),
      )
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))[0];
    return [
      {
        stepId: step.id,
        completedAt: next
          ? new Date(Date.parse(next.completedAt) - 1).toISOString()
          : session.updatedAt,
        localDay: session.localDay,
      },
    ];
  });
}

export async function startOrResumeSession(
  db: QuestDatabase,
  plan: SessionPlan,
  day: string,
  contentVersion: string,
  options?: { continueFromSessionId: string },
): Promise<LearningSession> {
  daySchema.parse(day);
  return db.transaction('rw', db.sessions, db.reviews, db.purchases, async () => {
    const sessions = (await db.sessions.toArray()).sort(creationOrder);
    const scoped = sessions.filter((session) => sessionScope(session) === sessionScope(plan));
    const latest = scoped.at(-1);
    day = [
      day,
      ...(await db.purchases.toArray()).map((purchase) => localDay(new Date(purchase.createdAt))),
      ...sessions.flatMap((session) => [
        session.localDay,
        session.completedDay ?? '',
        localDay(new Date(session.updatedAt)),
      ]),
    ]
      .sort()
      .at(-1)!;
    if (options) {
      const predecessorIndex = scoped.findIndex(
        (session) => session.sessionId === options.continueFromSessionId,
      );
      const predecessor = scoped[predecessorIndex];
      if (!predecessor || predecessor.status !== 'completed')
        throw new Error('진행 중인 탐험을 마친 뒤 다음 단계로 갈 수 있어요.');
      // The completed-session ID is the user's intention token. Repeated or stale
      // clicks always return the same successor, even if that successor is finished.
      const successor = scoped[predecessorIndex + 1];
      if (successor) return successor;
      day = [
        day,
        predecessor.localDay,
        predecessor.completedDay ?? '',
        localDay(new Date(predecessor.updatedAt)),
      ]
        .sort()
        .at(-1)!;
    }
    // Resume unfinished work even across midnight. A backward clock never opens an older day again.
    if (
      !options &&
      latest &&
      (latest.status === 'in_progress' ||
        latest.localDay >= day ||
        localDay(new Date(latest.updatedAt)) >= day)
    )
      return latest;
    if (!plan.steps.length) throw new Error('학습할 콘텐츠가 아직 준비되지 않았어요.');
    if (
      plan.courseId
        ? !validCoursePlan(plan, day)
        : plan.sessionKind ||
          plan.courseVersion ||
          plan.courseFlow ||
          !validPlanId(plan.planId, day, db.mode)
    )
      throw new Error('학습 구성을 다시 확인해 주세요.');
    if (new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length)
      throw new Error('학습 구성을 다시 확인해 주세요.');
    if (plan.steps.some((step) => step.retestOf))
      throw new Error('학습 구성을 다시 확인해 주세요.');
    if (!plan.steps.every((step) => validateStep(step, db.mode)))
      throw new Error('학습 구성을 다시 확인해 주세요.');
    if (plan.sessionKind === 'review-test') {
      const learned = new Set((await db.reviews.toArray()).map((review) => review.entityId));
      if (!plan.steps.every((step) => learned.has(step.entityId)))
        throw new Error('배운 단어가 10개 모이면 복습 테스트를 시작할 수 있어요.');
    }
    const ordinal = sessions.filter((session) => session.localDay === day).length + 1;
    const timestamp = await globalTimestamp(db);
    const session: LearningSession = {
      sessionId: `quest-${day}${ordinal > 1 ? `:${ordinal}` : ''}`,
      localDay: day,
      planId: plan.planId,
      contentVersion,
      appMode: db.mode,
      steps: structuredClone(plan.steps),
      currentQuestionIndex: 0,
      status: 'in_progress',
      xpAwarded: 0,
      updatedAt: timestamp,
      hintStepIds: [],
      createdAt: timestamp,
      studyEvents: [],
      ...(plan.courseId
        ? {
            courseId: plan.courseId,
            sessionKind: plan.sessionKind,
            courseVersion: plan.courseVersion,
            ...(plan.courseFlow ? { courseFlow: plan.courseFlow } : {}),
          }
        : {}),
      ...(plan.sessionKind === 'review-test' && plan.courseId
        ? {
            rewardPolicy: deriveReviewRewardPolicy({
              course: getCourse(plan.courseId),
              sessions,
              reviews: await db.reviews.toArray(),
              localDay: day,
            }),
          }
        : {}),
    };
    sessionSchema.parse(session);
    await db.sessions.add(session);
    return session;
  });
}

export async function submitAnswer(
  db: QuestDatabase,
  sessionId: string,
  answer: string,
  responseMs: number,
  retry = false,
): Promise<PracticeAttempt> {
  return db.transaction(
    'rw',
    [db.sessions, db.attempts, db.reviews, db.rewards, db.purchases],
    async () => {
      const session = await requireSession(db, sessionId);
      const step = session.steps[session.currentQuestionIndex];
      if (session.status !== 'in_progress' || step?.kind !== 'question')
        throw new Error('다음 학습 화면에서 답해 주세요.');
      const questionId = step.retestOf ?? step.id;
      if (session.courseFlow && retry && !step.retestOf)
        throw new Error('첫 답은 저장했어요. 단어 재시험은 독해 뒤에 만나요.');
      retry = !!step.retestOf || retry;
      const first = await db.attempts.get(attemptId(sessionId, questionId, true));
      if (!retry && first) return first;
      if (retry && (!first || first.isCorrect)) {
        if (first) return first;
        throw new Error('먼저 답을 제출해 주세요.');
      }
      const id = attemptId(sessionId, questionId, !retry);
      const existing = await db.attempts.get(id);
      if (existing) return existing;
      if (answer.length > 1000) throw new Error('답을 조금 짧게 입력해 주세요.');
      const history = studyHistory(
        session,
        await db.attempts.where('sessionId').equals(sessionId).toArray(),
      );
      const latestAttempt = await db.attempts.orderBy('completedAt').last();
      const timestamp = await globalTimestamp(db, session.updatedAt);
      const attempt: PracticeAttempt = {
        attemptId: id,
        sessionId,
        questionId,
        entityId: step.entityId,
        entityType: step.entityType,
        mode: step.mode,
        answer,
        isCorrect: gradeAnswer(step, answer),
        usedHint: !!step.alwaysHinted || session.hintStepIds.includes(step.id),
        firstTry: !retry,
        responseMs: sanitizeResponseMs(responseMs),
        completedAt: timestamp,
        localDay: [
          session.localDay,
          localDay(),
          localDay(new Date(timestamp)),
          latestAttempt?.localDay ?? '',
        ]
          .sort()
          .at(-1)!,
      };
      const review = scheduleReview(await db.reviews.get(step.entityId), attempt);
      const reward = rewardForAttempt(attempt, await db.rewards.toArray(), session);
      await db.attempts.add(attempt);
      await db.reviews.put(review);
      if (reward) await db.rewards.add(reward);
      await db.sessions.update(sessionId, {
        xpAwarded: session.xpAwarded + (reward?.xp ?? 0),
        updatedAt: attempt.completedAt,
        studyEvents: history,
      });
      return attempt;
    },
  );
}

export async function markHint(db: QuestDatabase, sessionId: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.attempts, db.purchases, async () => {
    const session = await requireSession(db, sessionId);
    const step = session.steps[session.currentQuestionIndex];
    if (
      session.status !== 'in_progress' ||
      step?.kind !== 'question' ||
      session.hintStepIds.includes(step.id)
    )
      return;
    if (await db.attempts.get(stepAttemptId(sessionId, step))) return;
    await db.sessions.update(sessionId, {
      hintStepIds: [...session.hintStepIds, step.id],
      updatedAt: await globalTimestamp(db, session.updatedAt),
      studyEvents: studyHistory(
        session,
        await db.attempts.where('sessionId').equals(sessionId).toArray(),
      ),
    });
  });
}

export async function advanceSession(
  db: QuestDatabase,
  sessionId: string,
  expectedStepId?: string,
): Promise<LearningSession> {
  // Capture the visible step before the write lock so concurrent calls share one intention.
  const observed = await requireSession(db, sessionId);
  const intendedStep = expectedStepId ?? observed.steps[observed.currentQuestionIndex]?.id;
  return db.transaction(
    'rw',
    [db.sessions, db.attempts, db.rewards, db.reviews, db.purchases],
    async () => {
      const session = await requireSession(db, sessionId);
      const step = session.steps[session.currentQuestionIndex];
      if (session.status === 'completed' || step?.id !== intendedStep) return session;
      if (step.kind === 'question' && !(await db.attempts.get(stepAttemptId(sessionId, step)))) {
        throw new Error('답을 제출한 뒤 다음으로 넘어갈 수 있어요.');
      }
      session.studyEvents = studyHistory(
        session,
        await db.attempts.where('sessionId').equals(sessionId).toArray(),
      );
      session.updatedAt = await globalTimestamp(db, session.updatedAt);
      const latestAttempt = await db.attempts.orderBy('completedAt').last();
      const eventDay = [
        session.localDay,
        localDay(),
        latestAttempt?.localDay ?? '',
        localDay(new Date(session.updatedAt)),
      ]
        .sort()
        .at(-1)!;
      if (step.kind === 'study' && !(await db.reviews.get(step.entityId))) {
        await db.reviews.add(initialStudyReview(step.entityId, eventDay));
      }
      if (step.kind === 'study')
        session.studyEvents.push({
          stepId: step.id,
          completedAt: session.updatedAt,
          localDay: eventDay,
        });
      session.currentQuestionIndex += 1;
      if (
        session.courseFlow &&
        session.retestQuestionIds === undefined &&
        session.currentQuestionIndex === session.steps.length
      ) {
        const tail = buildCourseRetests(
          session,
          await db.attempts.where('sessionId').equals(sessionId).toArray(),
        );
        session.retestQuestionIds = tail.map((question) => question.retestOf!);
        session.steps.push(...tail);
      }
      if (session.currentQuestionIndex === session.steps.length) {
        session.status = 'completed';
        session.completedDay = [
          session.localDay,
          localDay(),
          latestAttempt?.localDay ?? '',
          localDay(new Date(session.updatedAt)),
        ]
          .sort()
          .at(-1)!;
        const reward = completionReward(
          session,
          await db.rewards.toArray(),
          await db.attempts.where('sessionId').equals(sessionId).toArray(),
        );
        if (reward) {
          await db.rewards.add(reward);
          session.xpAwarded += reward.xp;
        }
      }
      await db.sessions.put(session);
      return session;
    },
  );
}

export async function saveSettings(db: QuestDatabase, settings: Settings): Promise<void> {
  await db.transaction('rw', db.settings, db.purchases, async () => {
    const valid = settingsSchema.parse(settings);
    if (!roomSelectionIsOwned(valid.room, await db.purchases.toArray()))
      throw new Error('보유한 아이템을 선택해 주세요.');
    await db.settings.put(valid);
  });
}

/** A receipt and its equipped selection commit together under one write lock. */
export async function purchaseRoomItem(
  db: QuestDatabase,
  itemId: string,
): Promise<PurchaseReceipt | null> {
  const item = getRoomItem(itemId);
  if (!item) throw new Error('아이템을 다시 선택해 주세요.');
  return db.transaction('rw', db.rewards, db.purchases, db.settings, db.sessions, async () => {
    const purchases = await db.purchases.toArray();
    let receipt = purchases.find((purchase) => purchase.itemId === itemId) ?? null;
    if (item.price > 0 && !receipt) {
      if (availableXp(await db.rewards.toArray(), purchases) < item.price)
        throw new Error('XP가 조금 더 모이면 구매할 수 있어요.');
      receipt = {
        id: `purchase:${item.id}`,
        itemId: item.id,
        price: item.price,
        pricingVersion: roomPricingVersion,
        createdAt: await globalTimestamp(db),
      };
      await db.purchases.add(receipt);
      purchases.push(receipt);
    }
    const settings = (await db.settings.get('preferences')) ?? { ...defaultSettings };
    const room = resolveRoom(settings.room);
    room[roomSlot(item.category)] = item.id;
    if (!roomSelectionIsOwned(room, purchases)) throw new Error('보유한 아이템을 선택해 주세요.');
    await db.settings.put({ ...settings, room });
    return receipt;
  });
}

export async function exportBackup(db: QuestDatabase, contentVersion: string): Promise<string> {
  return db.transaction('r', db.tables, async () =>
    JSON.stringify(
      {
        schemaVersion: 6,
        contentVersion,
        appMode: db.mode,
        exportedAt: new Date().toISOString(),
        attempts: await db.attempts.toArray(),
        reviews: await db.reviews.toArray(),
        sessions: await db.sessions.toArray(),
        rewards: await db.rewards.toArray(),
        settings: await db.settings.toArray(),
        purchases: await db.purchases.toArray(),
      },
      null,
      2,
    ),
  );
}

function unique<T>(records: T[], key: (record: T) => string): void {
  if (new Set(records.map(key)).size !== records.length) throw invalidData();
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateBackup(backup: Backup, mode: AppMode, contentVersion: string): void {
  if (backup.appMode !== mode || backup.contentVersion !== contentVersion) throw invalidData();
  if (backup.schemaVersion >= 4 && !backup.purchases) throw invalidData();
  const purchases = backup.purchases ?? [];
  if (
    backup.schemaVersion < 6 &&
    purchases.some((purchase) => purchase.pricingVersion !== undefined)
  )
    throw invalidData();
  if (
    backup.schemaVersion < 5 &&
    backup.sessions.some(
      (session) =>
        session.courseFlow ||
        session.retestQuestionIds ||
        session.steps.some((step) => step.retestOf),
    )
  )
    throw invalidData();
  if (
    backup.schemaVersion < 4 &&
    (purchases.length || backup.sessions.some((session) => session.rewardPolicy))
  )
    throw invalidData();
  unique(backup.sessions, (row) => row.sessionId);
  if (backup.schemaVersion === 1) unique(backup.sessions, (row) => row.localDay);
  unique(backup.attempts, (row) => row.attemptId);
  unique(backup.reviews, (row) => row.entityId);
  unique(backup.rewards, (row) => row.id);
  unique(purchases, (row) => row.id);
  unique(purchases, (row) => row.itemId);
  unique(purchases, (row) => row.createdAt);
  const sessions = new Map(backup.sessions.map((session) => [session.sessionId, session]));
  const attempts = new Map(backup.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const attemptsBySession = new Map<string, PracticeAttempt[]>();
  for (const attempt of backup.attempts) {
    const group = attemptsBySession.get(attempt.sessionId) ?? [];
    group.push(attempt);
    attemptsBySession.set(attempt.sessionId, group);
  }
  const orderedSessions = [...backup.sessions].sort(creationOrder);
  const latestSessions = new Map(
    orderedSessions.map((session) => [sessionScope(session), session.sessionId]),
  );
  const sessionsPerDay = new Map<string, number>();
  for (const session of orderedSessions) {
    // Explicit restores can carry archived original-course snapshots into the
    // current owner database. They still must match the immutable source bank;
    // this never permits choosing draft questions for a fresh learner quest.
    const sourceMode = session.courseId ? mode : 'demo';
    const ordinal = (sessionsPerDay.get(session.localDay) ?? 0) + 1;
    sessionsPerDay.set(session.localDay, ordinal);
    if (
      session.sessionId !== `quest-${session.localDay}${ordinal > 1 ? `:${ordinal}` : ''}` ||
      session.appMode !== mode ||
      session.contentVersion !== contentVersion
    )
      throw invalidData();
    if (
      session.courseId
        ? !validCoursePlan(session, session.localDay)
        : session.sessionKind ||
          session.courseVersion ||
          session.courseFlow ||
          !validPlanId(session.planId, session.localDay, sourceMode)
    )
      throw invalidData();
    if (session.courseId && (!session.createdAt || !session.studyEvents)) throw invalidData();
    if (!validCourseRetests(session, attemptsBySession.get(session.sessionId) ?? []))
      throw invalidData();
    if (
      session.rewardPolicy &&
      (session.sessionKind !== 'review-test' || !session.courseId || !session.createdAt)
    )
      throw invalidData();
    if (session.createdAt && session.createdAt > session.updatedAt) throw invalidData();
    unique(session.steps, (step) => step.id);
    if (!session.steps.every((step) => validateStep(step, sourceMode))) throw invalidData();
    unique(session.hintStepIds, (id) => id);
    if (
      session.currentQuestionIndex > session.steps.length ||
      (session.status === 'completed') !== (session.currentQuestionIndex === session.steps.length)
    )
      throw invalidData();
    if (
      session.status === 'in_progress' &&
      session.sessionId !== latestSessions.get(sessionScope(session))
    )
      throw invalidData();
    if (session.studyEvents) {
      unique(session.studyEvents, (event) => event.stepId);
      const studiedSteps = session.steps
        .slice(0, session.currentQuestionIndex)
        .filter((step) => step.kind === 'study');
      if (studiedSteps.length !== session.studyEvents.length) throw invalidData();
      for (const event of session.studyEvents) {
        if (
          !studiedSteps.some((step) => step.id === event.stepId) ||
          event.completedAt > session.updatedAt ||
          (session.createdAt && event.completedAt < session.createdAt) ||
          event.localDay < session.localDay
        )
          throw invalidData();
      }
    }
    if (
      session.completedDay &&
      (session.status !== 'completed' || session.completedDay < session.localDay)
    )
      throw invalidData();
    for (const hint of session.hintStepIds) {
      const index = session.steps.findIndex((step) => step.id === hint && step.kind === 'question');
      if (index < 0 || index > session.currentQuestionIndex) throw invalidData();
    }
    for (let index = 0; index < session.currentQuestionIndex; index++) {
      const step = session.steps[index];
      if (step.kind === 'question' && !attempts.has(stepAttemptId(session.sessionId, step)))
        throw invalidData();
    }
  }
  const derivedReviews = new Map<string, ReviewState>();
  const derivedRewards: RewardEvent[] = [];
  for (const attempt of [...backup.attempts].sort(
    (a, b) => a.completedAt.localeCompare(b.completedAt) || a.attemptId.localeCompare(b.attemptId),
  )) {
    const session = sessions.get(attempt.sessionId);
    const index =
      session?.steps.findIndex((step) =>
        session.courseFlow && !attempt.firstTry
          ? step.retestOf === attempt.questionId
          : step.id === attempt.questionId && !step.retestOf,
      ) ?? -1;
    const step = session?.steps[index];
    if (!session || !step || step.kind !== 'question' || index > session.currentQuestionIndex)
      throw invalidData();
    if (
      attempt.attemptId !==
        attemptId(attempt.sessionId, step.retestOf ?? step.id, attempt.firstTry) ||
      attempt.entityId !== step.entityId ||
      attempt.entityType !== step.entityType ||
      attempt.mode !== step.mode
    )
      throw invalidData();
    if (
      attempt.isCorrect !== gradeAnswer(step, attempt.answer) ||
      attempt.usedHint !== (!!step.alwaysHinted || session.hintStepIds.includes(step.id)) ||
      attempt.responseMs !== sanitizeResponseMs(attempt.responseMs)
    )
      throw invalidData();
    if (
      attempt.localDay < session.localDay ||
      attempt.completedAt > session.updatedAt ||
      (session.createdAt && attempt.completedAt <= session.createdAt)
    )
      throw invalidData();
    if (!attempt.firstTry) {
      const first = attempts.get(attemptId(attempt.sessionId, step.retestOf ?? step.id, true));
      if (
        !first ||
        first.isCorrect ||
        first.completedAt >= attempt.completedAt ||
        first.localDay > attempt.localDay
      )
        throw invalidData();
    }
    const reward = rewardForAttempt(attempt, derivedRewards, session);
    if (reward) derivedRewards.push(reward);
  }
  type TimelineEvent =
    | { kind: 'start'; at: string; session: LearningSession }
    | { kind: 'study'; at: string; entityId: string; day: string }
    | { kind: 'attempt'; at: string; attempt: PracticeAttempt }
    | { kind: 'completion'; at: string; session: LearningSession };
  const timeline: TimelineEvent[] = backup.attempts.map((attempt) => ({
    kind: 'attempt',
    at: attempt.completedAt,
    attempt,
  }));
  unique(backup.attempts, (attempt) => attempt.completedAt);
  for (const session of orderedSessions) {
    const sessionAttempts = attemptsBySession.get(session.sessionId) ?? [];
    const studies = studyHistory(session, sessionAttempts);
    if (session.createdAt) timeline.push({ kind: 'start', at: session.createdAt, session });
    let previousStepAt = session.createdAt ?? '';
    for (
      let index = 0;
      index <= session.currentQuestionIndex && index < session.steps.length;
      index++
    ) {
      const step = session.steps[index];
      if (step.kind === 'study') {
        if (index < session.currentQuestionIndex) {
          const event = studies.find((item) => item.stepId === step.id);
          if (!event || event.completedAt < previousStepAt) throw invalidData();
          previousStepAt = event.completedAt;
          timeline.push({
            kind: 'study',
            at: event.completedAt,
            entityId: step.entityId,
            day: event.localDay,
          });
        }
      } else {
        const tries = session.courseFlow ? [!step.retestOf] : [true, false];
        for (const firstTry of tries) {
          const attempt = attempts.get(
            attemptId(session.sessionId, step.retestOf ?? step.id, firstTry),
          );
          if (attempt) {
            if (attempt.completedAt <= previousStepAt) throw invalidData();
            previousStepAt = attempt.completedAt;
          }
        }
      }
    }
    if (session.status === 'completed') {
      const lastDay =
        sessionAttempts
          .map((attempt) => attempt.localDay)
          .sort()
          .at(-1) ?? session.localDay;
      if (session.completedDay && session.completedDay < lastDay) throw invalidData();
      timeline.push({ kind: 'completion', at: session.updatedAt, session });
    }
  }
  const priority = { start: 0, study: 1, attempt: 2, completion: 3 };
  let previousAttemptDay = '';
  for (const event of timeline.sort(
    (a, b) => a.at.localeCompare(b.at) || priority[a.kind] - priority[b.kind],
  )) {
    if (event.kind === 'study') {
      if (!derivedReviews.has(event.entityId))
        derivedReviews.set(event.entityId, initialStudyReview(event.entityId, event.day));
    } else if (event.kind === 'attempt') {
      if (event.attempt.localDay < previousAttemptDay) throw invalidData();
      previousAttemptDay = event.attempt.localDay;
      derivedReviews.set(
        event.attempt.entityId,
        scheduleReview(derivedReviews.get(event.attempt.entityId), event.attempt),
      );
    } else if (event.kind === 'completion') {
      const reward = completionReward(
        event.session,
        derivedRewards,
        attemptsBySession.get(event.session.sessionId) ?? [],
      );
      if (reward) derivedRewards.push(reward);
    } else if (event.session.courseId) {
      const reviewQuestions =
        event.session.sessionKind === 'review-test'
          ? event.session.steps
          : event.session.steps.slice(0, 5).filter((step) => step.kind === 'question');
      if (reviewQuestions.some((step) => !derivedReviews.has(step.entityId))) throw invalidData();
      if (event.session.rewardPolicy) {
        // Reconstruct the state at review entry. A course completed later was
        // still in progress when this immutable reward basis was selected.
        const historicalSessions = orderedSessions
          .filter((session) => session.createdAt && session.createdAt < event.at)
          .map((session): LearningSession =>
            session.status === 'completed' && session.updatedAt > event.at
              ? { ...session, status: 'in_progress', completedDay: undefined }
              : session,
          );
        const expected = deriveReviewRewardPolicy({
          course: getCourse(event.session.courseId),
          sessions: historicalSessions,
          reviews: [...derivedReviews.values()],
          localDay: event.session.localDay,
        });
        if (canonical(event.session.rewardPolicy) !== canonical(expected)) throw invalidData();
      }
    }
  }
  const sorted = <T>(records: T[], key: (record: T) => string) =>
    [...records].sort((a, b) => key(a).localeCompare(key(b)));
  if (
    canonical(sorted(backup.reviews, (row) => row.entityId)) !==
    canonical(sorted([...derivedReviews.values()], (row) => row.entityId))
  )
    throw invalidData();
  if (
    canonical(sorted(backup.rewards, (row) => row.id)) !==
    canonical(sorted(derivedRewards, (row) => row.id))
  )
    throw invalidData();
  for (const session of backup.sessions) {
    if (
      session.xpAwarded !==
      derivedRewards
        .filter((reward) => reward.sessionId === session.sessionId)
        .reduce((sum, reward) => sum + reward.xp, 0)
    )
      throw invalidData();
  }
  const earnings = derivedRewards.map((reward) => {
    const earnedAt =
      reward.kind === 'first' || reward.kind === 'retry'
        ? attempts.get(attemptId(reward.sessionId, reward.questionId!, reward.kind === 'first'))
            ?.completedAt
        : sessions.get(reward.sessionId)?.updatedAt;
    if (!earnedAt) throw invalidData();
    return { at: earnedAt, xp: reward.xp };
  });
  let spent = 0;
  for (const purchase of [...purchases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const item = getRoomItem(purchase.itemId);
    if (
      !item ||
      item.price <= 0 ||
      getRoomItemPrice(purchase.itemId, purchase.pricingVersion ?? 1) !== purchase.price ||
      purchase.id !== `purchase:${item.id}`
    )
      throw invalidData();
    spent += purchase.price;
    const earned = earnings
      .filter((earning) => earning.at < purchase.createdAt)
      .reduce((sum, earning) => sum + earning.xp, 0);
    if (spent > earned) throw invalidData();
  }
  if (
    availableXp(derivedRewards, purchases) < 0 ||
    !backup.settings.every((settings) => roomSelectionIsOwned(settings.room, purchases))
  )
    throw invalidData();
}

export async function importBackup(
  db: QuestDatabase,
  json: string,
  contentVersion: string,
): Promise<void> {
  let backup: Backup;
  try {
    if (json.length > 20_000_000) throw invalidData();
    backup = backupSchema.parse(JSON.parse(json));
    validateBackup(backup, backup.appMode, contentVersion);
    if (backup.appMode !== db.mode) {
      backup = {
        ...backup,
        appMode: db.mode,
        sessions: backup.sessions.map((session) => ({ ...session, appMode: db.mode })),
      };
      validateBackup(backup, db.mode, contentVersion);
    }
  } catch {
    throw invalidData();
  }
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.attempts.bulkAdd(backup.attempts);
    await db.reviews.bulkAdd(backup.reviews);
    await db.sessions.bulkAdd(backup.sessions);
    await db.rewards.bulkAdd(backup.rewards);
    await db.settings.bulkAdd(backup.settings);
    await db.purchases.bulkAdd(backup.purchases ?? []);
  });
}

export async function resetDatabase(db: QuestDatabase): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.settings.add({ ...defaultSettings });
  });
}
