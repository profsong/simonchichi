import { useCallback, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type {
  LearningSession,
  PracticeAttempt,
  ReviewState,
  RewardEvent,
  Settings,
  PurchaseReceipt,
} from '../core/types';
import { defaultSettings } from '../core/types';
import type { QuestDatabase } from '../data/db';

export interface StudyData {
  sessions: LearningSession[];
  attempts: PracticeAttempt[];
  reviews: ReviewState[];
  rewards: RewardEvent[];
  settings: Settings;
  purchases?: PurchaseReceipt[];
}
export function useStudyData(db: QuestDatabase) {
  const [snapshot, setSnapshot] = useState<{ db: QuestDatabase; data: StudyData }>();
  const [error, setError] = useState('');
  const read = useCallback(async (): Promise<StudyData> => {
    const [sessions, attempts, reviews, rewards, settings, purchases] = await Promise.all([
      db.sessions.toArray(),
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.rewards.toArray(),
      db.settings.get('preferences'),
      db.purchases.toArray(),
    ]);
    return {
      sessions,
      attempts,
      reviews,
      rewards,
      purchases,
      settings: settings ?? defaultSettings,
    };
  }, [db]);
  const refresh = useCallback(async () => {
    setSnapshot({ db, data: await read() });
  }, [db, read]);
  useEffect(() => {
    const subscription = liveQuery(read).subscribe({
      next: (data) => {
        setSnapshot({ db, data });
        setError('');
      },
      error: () =>
        setError('기기 저장소를 열지 못했어요. Safari의 저장 공간을 확인한 후 다시 열어 주세요.'),
    });
    return () => subscription.unsubscribe();
  }, [db, read]);
  return { data: snapshot?.db === db ? snapshot.data : undefined, refresh, loadError: error };
}
