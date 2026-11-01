import { describe, expect, it } from 'vitest';
import { buildCourseQuest, buildReviewTest } from '../../src/core/course-quest';
import {
  availableXp,
  ownedRoomItemIds,
  resolveRoom,
  roomSelectionIsOwned,
} from '../../src/core/economy';
import {
  completionReward,
  deriveReviewRewardPolicy,
  rewardForAttempt,
} from '../../src/core/rewards';
import {
  defaultRoom,
  getRoomItemPrice,
  roomItems,
  roomPricingVersion,
} from '../../src/core/room-catalog';
import type { LearningSession, PracticeAttempt, PurchaseReceipt } from '../../src/core/types';
import { fixtureCourses, learned } from './course-fixtures';

const course = fixtureCourses[0];
const day = '2026-11-02';
const options = { course, reviews: [], attempts: [], sessions: [], localDay: day };
const plan = buildCourseQuest(options)!;
function lesson(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    ...plan,
    sessionId: `quest-${day}`,
    localDay: day,
    contentVersion: 'test',
    appMode: 'demo',
    status: 'in_progress',
    currentQuestionIndex: 0,
    xpAwarded: 0,
    hintStepIds: [],
    createdAt: `${day}T01:00:00.000Z`,
    updatedAt: `${day}T01:00:00.000Z`,
    ...overrides,
  };
}

describe('review reward basis and proportional earnings', () => {
  it('uses the first completed lesson today ahead of an in-progress lesson in the selected course', () => {
    const first = lesson({ status: 'completed', completedDay: day });
    const later = lesson({
      sessionId: 'later',
      steps: Array(29).fill(plan.steps.find((step) => step.kind === 'question')!),
    });
    const other = lesson({ courseId: 'suneung-2000', status: 'completed', completedDay: day });
    expect(deriveReviewRewardPolicy({ ...options, sessions: [other, later, first] })).toMatchObject(
      { basisSessionId: first.sessionId, basisKind: 'completed-today', questMaxXp: 270, maxXp: 81 },
    );
    expect(deriveReviewRewardPolicy({ ...options, sessions: [other, later] })).toMatchObject({
      basisSessionId: 'later',
      basisKind: 'in-progress',
      questMaxXp: 320,
      maxXp: 96,
    });
  });

  it('derives a next-lesson full score from actual learned memory slots, including partial pools', () => {
    expect(deriveReviewRewardPolicy(options)).toMatchObject({ basisKind: 'next-plan', maxXp: 81 });
    expect(
      deriveReviewRewardPolicy({
        ...options,
        reviews: course.vocabulary.slice(0, 2).map((word) => learned(word.id)),
      }),
    ).toMatchObject({ maxXp: 87 });
    const reviews = course.vocabulary.slice(0, 10).map((word) => learned(word.id));
    expect(deriveReviewRewardPolicy({ ...options, reviews })).toMatchObject({ maxXp: 96 });
    const completed = course.lessons.map((item) =>
      lesson({ planId: item.id, status: 'completed', completedDay: '2026-11-01' }),
    );
    expect(deriveReviewRewardPolicy({ ...options, reviews, sessions: completed })).toMatchObject({
      basisKind: 'course-standard',
      basisPlanId: course.lessons.at(-1)!.id,
      maxXp: 96,
    });
  });

  it.each([0, 1, 5, 9, 10])(
    'grants floor(maximum × %s/10), ignoring correct retries and awarding once',
    (correctCount) => {
      const reviews = course.vocabulary.slice(0, 10).map((word) => learned(word.id));
      const reviewPlan = buildReviewTest({ ...options, reviews, random: () => 0.3 })!;
      const session = lesson({
        ...reviewPlan,
        status: 'completed',
        currentQuestionIndex: 10,
        rewardPolicy: deriveReviewRewardPolicy(options),
      });
      const attempts: PracticeAttempt[] = session.steps.map((step, index) => ({
        attemptId: `first-${index}`,
        sessionId: session.sessionId,
        questionId: step.id,
        entityId: step.entityId,
        entityType: 'vocab',
        mode: step.mode,
        answer: 'test',
        isCorrect: index < correctCount,
        usedHint: true,
        firstTry: true,
        responseMs: 0,
        localDay: day,
        completedAt: `${day}T02:00:00.000Z`,
      }));
      const retry = { ...attempts[0], attemptId: 'retry', firstTry: false, isCorrect: true };
      expect(rewardForAttempt(attempts[0], [], session)).toBeNull();
      expect(rewardForAttempt(retry, [], session)).toBeNull();
      const reward = completionReward(session, [], [...attempts, retry])!;
      expect(reward).toMatchObject({ kind: 'review', xp: Math.floor((81 * correctCount) / 10) });
      expect(completionReward(session, [reward], attempts)).toBeNull();
      expect(completionReward({ ...session, status: 'in_progress' }, [], attempts)).toBeNull();
      expect(completionReward(session, [], attempts.slice(1))).toBeNull();
    },
  );
});

describe('room ownership and spendable XP', () => {
  it('preserves historical prices and validates version2 accessory and mixed outfit prices', () => {
    const historicalPrices = {
      'mint-room': 0,
      'sky-garden': 120,
      'ocean-window': 240,
      'star-loft': 360,
      'rain-library': 200,
      'bamboo-hideout': 260,
      'cloud-cabin': 280,
      'coral-studio': 320,
      'moon-observatory': 400,
      'winter-chalet': 360,
      'spring-greenhouse': 300,
      'seaside-lighthouse': 440,
      'music-studio': 340,
      'night-camp': 380,
      original: 0,
      'blue-hoodie': 180,
      'green-varsity': 300,
      sailor: 420,
      none: 0,
      'round-glasses': 80,
      'star-headphones': 160,
      'flower-crown': 240,
    };
    const newAccessories = [
      'mint-ribbon',
      'star-hairpin',
      'moon-hairpin',
      'butterfly-clip',
      'daisy-pin',
      'pearl-headband',
      'heart-sunglasses',
      'mint-scarf',
      'lucky-clover',
      'blue-beret',
    ];
    const newOutfitPrices: Record<string, number> = {
      'nike-hoodie': 7000,
      'adidas-puffer': 7000,
      'burberry-coat': 7000,
      'mint-cardigan': 6000,
      'denim-jacket': 6000,
      'striped-knit': 6000,
      'lavender-sweater': 6000,
      raincoat: 6000,
      'cozy-fleece': 6000,
      'ribbon-dress': 6000,
    };
    expect(roomPricingVersion).toBe(2);
    expect(roomItems).toHaveLength(42);
    expect(new Set(roomItems.map((item) => item.id))).toEqual(
      new Set([
        ...Object.keys(historicalPrices),
        ...newAccessories,
        ...Object.keys(newOutfitPrices),
      ]),
    );
    for (const [id, price] of Object.entries(historicalPrices))
      expect(getRoomItemPrice(id, 1)).toBe(price);
    expect(roomItems.filter((item) => item.category === 'accessory')).toHaveLength(14);
    expect(roomItems.filter((item) => item.price > 0)).toHaveLength(39);
    expect(roomItems.filter((item) => item.category === 'outfit')).toHaveLength(14);
    for (const [id, price] of Object.entries(newOutfitPrices)) {
      expect(getRoomItemPrice(id, 1)).toBeUndefined();
      expect(getRoomItemPrice(id, 2)).toBe(price);
      expect(roomItems.find((item) => item.id === id)?.category).toBe('outfit');
    }
    for (const id of newAccessories) {
      expect(getRoomItemPrice(id, 1)).toBeUndefined();
      expect(getRoomItemPrice(id, 2)).toBe(2500);
      expect(roomItems.find((item) => item.id === id)?.category).toBe('accessory');
    }
    expect(roomItems.filter((item) => item.price === 0).map((item) => item.id)).toEqual([
      'mint-room',
      'original',
      'none',
    ]);
    for (const item of roomItems.filter((item) => item.price > 0)) {
      expect(item.price).toBe(
        newOutfitPrices[item.id] ??
          { background: 12000, outfit: 6000, accessory: 2500 }[item.category],
      );
      expect(getRoomItemPrice(item.id, 2)).toBe(item.price);
    }
    expect(getRoomItemPrice('unknown', 1)).toBeUndefined();
    expect(getRoomItemPrice('unknown', 2)).toBeUndefined();
  });

  it('keeps default room free, resolves valid slots, and separates spending from earnings', () => {
    const purchases: PurchaseReceipt[] = [
      {
        id: 'purchase:round-glasses',
        itemId: 'round-glasses',
        price: 80,
        createdAt: `${day}T01:00:00.000Z`,
      },
    ];
    expect(resolveRoom()).toEqual(defaultRoom);
    expect(resolveRoom({ outfitId: 'round-glasses', accessoryId: 'round-glasses' })).toEqual({
      ...defaultRoom,
      accessoryId: 'round-glasses',
    });
    expect(ownedRoomItemIds(purchases)).toEqual(
      new Set(['mint-room', 'original', 'none', 'round-glasses']),
    );
    expect(roomSelectionIsOwned({ ...defaultRoom, accessoryId: 'round-glasses' }, purchases)).toBe(
      true,
    );
    expect(roomSelectionIsOwned({ ...defaultRoom, outfitId: 'sailor' }, purchases)).toBe(false);
    expect(
      availableXp(
        [{ id: 'first', sessionId: 'session', kind: 'first', xp: 100, localDay: day }],
        purchases,
      ),
    ).toBe(20);
  });
});
