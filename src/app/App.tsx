import { useMemo, useRef, useState } from 'react';
import { contentVersion } from '../data/catalog';
import { getCourse } from '../data/courses';
import {
  getDatabase,
  startOrResumeSession,
  submitAnswer,
  advanceSession,
  markHint,
  purchaseRoomItem,
  saveSettings as persistSettings,
} from '../data/db';
import {
  buildCourseQuest,
  buildReviewTest,
  completedCoursePlanIds,
  learnedCourseWords,
} from '../core/course-quest';
import { localDay } from '../core/scheduler';
import { resolveAvatar } from '../core/avatar';
import { availableXp, ownedRoomItemIds, resolveRoom } from '../core/economy';
import { deriveReviewRewardPolicy } from '../core/rewards';
import { buildMistakeQuest, getActiveMistakes } from '../core/mistakes';
import type { CourseId, Settings } from '../core/types';
import { Icon, type IconName } from '../components/Icon';
import { MascotMark, Mascot } from '../components/Mascot';
import { Quest } from '../features/daily-quest/Quest';
import { Completion } from '../features/daily-quest/Completion';
import { Today } from '../features/home/Today';
import { WorldMap } from '../features/home/WorldMap';
import { Reviews } from '../features/reviews/Reviews';
import { MistakesScreen } from '../features/reviews/MistakesScreen';
import { WordbooksScreen } from '../features/wordbooks/WordbooksScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { useStudyData } from './useStudyData';
import { useAppRuntime } from '../platform/useAppRuntime';

type Tab = 'today' | 'map' | 'reviews' | 'mistakes' | 'wordbooks' | 'progress' | 'settings';
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: '오늘', icon: 'home' },
  { id: 'map', label: '모험 지도', icon: 'map' },
  { id: 'reviews', label: '복습함', icon: 'book' },
  { id: 'progress', label: '성장 기록', icon: 'trophy' },
  { id: 'settings', label: '설정', icon: 'settings' },
];
const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';

export function App() {
  const { native, mode, modeReady, startupError, offlineReady, needRefresh, updateServiceWorker } =
    useAppRuntime(demoEnabled);
  const [tab, setTab] = useState<Tab>('today');
  const [initialWordbookId, setInitialWordbookId] = useState<string>();
  const [inQuest, setInQuest] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState('');
  const [roomMessage, setRoomMessage] = useState('');
  const db = useMemo(() => getDatabase(mode), [mode]);
  const { data, refresh, loadError } = useStudyData(db);
  async function run(action: () => Promise<void>, refreshData = true) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      if (refreshData) await refresh();
    } catch {
      setError(
        '처리하지 못했어요. 기록은 그대로 보관했어요. 백업 파일을 확인하거나 다시 시도해 주세요.',
      );
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Tab) {
    setTab(next);
    setInQuest(false);
    setError('');
    setRoomMessage('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openWordbooks(bookId?: string) {
    setInitialWordbookId(bookId);
    navigate('wordbooks');
  }
  const startupMessage =
    startupError ||
    (native && loadError
      ? '기기 저장소를 열지 못했어요. 앱의 저장 공간을 확인하고 다시 열어 주세요.'
      : loadError);
  if (!modeReady || !data)
    return (
      <main className="startup">
        <Mascot size={150} />
        <h1>
          시몬<span>치치</span>
        </h1>
        <p role="status">{startupMessage || '오늘의 모험을 준비하는 중…'}</p>
        {startupMessage && (
          <button className="primary" onClick={() => location.reload()}>
            다시 열기
          </button>
        )}
      </main>
    );
  const today = localDay();
  const course = getCourse(data.settings.selectedWordbookId ?? 'advanced-300');
  const sessions = [...data.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const courseSessions = sessions.filter(
    (item) => item.courseId === course.id && item.sessionKind === 'course',
  );
  const session =
    courseSessions.find((item) => item.status === 'in_progress') ??
    courseSessions.find((item) => (item.completedDay ?? item.localDay) >= today);
  const reviewSession = sessions.find(
    (item) =>
      item.courseId === course.id &&
      item.sessionKind === 'review-test' &&
      item.status === 'in_progress',
  );
  const focusedSession = sessions.find((item) => item.sessionId === activeSessionId);
  const activeMistakes = getActiveMistakes(data.attempts, data.sessions);
  const mistakeSession = sessions.find(
    (item) => item.sessionKind === 'mistakes' && item.status === 'in_progress',
  );
  const completedToday = data.sessions.filter(
    (item) =>
      item.sessionKind !== 'review-test' &&
      item.sessionKind !== 'mistakes' &&
      item.status === 'completed' &&
      (item.completedDay ?? item.localDay) === today,
  );
  const completedPlanIds = completedCoursePlanIds(course, data.sessions);
  const plan = course.lessons.find((lesson) => !completedPlanIds.includes(lesson.id));
  const learnedWords = learnedCourseWords(course, data.reviews);
  const xp = availableXp(data.rewards, data.purchases ?? []);
  const room = resolveRoom(data.settings.room);
  const ownedItemIds = [...ownedRoomItemIds(data.purchases ?? [])];
  const rewardPolicy = reviewSession
    ? reviewSession.rewardPolicy
    : deriveReviewRewardPolicy({
        course,
        sessions: data.sessions,
        reviews: data.reviews,
        localDay: today,
      });
  const avatar = resolveAvatar(data.settings.avatarId);
  const focused = inQuest && !!focusedSession;
  async function start(continueFromSessionId?: string) {
    await run(async () => {
      const freshPlan = buildCourseQuest({
        course,
        reviews: data!.reviews,
        attempts: data!.attempts,
        sessions: data!.sessions,
        localDay: localDay(),
      });
      if (!freshPlan) return;
      const started = await startOrResumeSession(
        db,
        freshPlan,
        localDay(),
        contentVersion,
        continueFromSessionId ? { continueFromSessionId } : undefined,
      );
      setActiveSessionId(started.sessionId);
      setInQuest(true);
      setTab('today');
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  async function startReview() {
    await run(async () => {
      if (reviewSession) {
        setActiveSessionId(reviewSession.sessionId);
      } else {
        const reviewPlan = buildReviewTest({
          course,
          reviews: data!.reviews,
          attempts: data!.attempts,
          sessions: data!.sessions,
          localDay: localDay(),
        });
        if (!reviewPlan) return;
        const previous = sessions.find(
          (item) =>
            item.courseId === course.id &&
            item.sessionKind === 'review-test' &&
            item.status === 'completed',
        );
        const started = await startOrResumeSession(
          db,
          reviewPlan,
          localDay(),
          contentVersion,
          previous ? { continueFromSessionId: previous.sessionId } : undefined,
        );
        setActiveSessionId(started.sessionId);
      }
      setInQuest(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  async function startMistakes() {
    await run(async () => {
      if (mistakeSession) {
        setActiveSessionId(mistakeSession.sessionId);
      } else {
        const mistakePlan = buildMistakeQuest({
          attempts: data!.attempts,
          sessions: data!.sessions,
          appMode: mode,
        });
        if (!mistakePlan) return;
        const previous = sessions.find(
          (item) => item.sessionKind === 'mistakes' && item.status === 'completed',
        );
        const started = await startOrResumeSession(
          db,
          mistakePlan,
          localDay(),
          contentVersion,
          previous ? { continueFromSessionId: previous.sessionId } : undefined,
        );
        setActiveSessionId(started.sessionId);
      }
      setTab('mistakes');
      setInQuest(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  function selectCourse(id: CourseId) {
    setInQuest(false);
    saveSettings({ ...data!.settings, selectedWordbookId: id });
  }
  function saveSettings(settings: Settings) {
    void run(async () => {
      await persistSettings(db, settings);
    });
  }
  function selectRoomItem(id: string) {
    setRoomMessage('');
    void run(async () => {
      try {
        await purchaseRoomItem(db, id);
      } catch {
        setRoomMessage(
          '꾸미기를 적용하지 못했어요. 사용할 수 있는 XP를 확인하고 다시 시도해 주세요.',
        );
      }
    });
  }
  return (
    <div className={`app-shell theme-${data.settings.theme} ${focused ? 'app-focused' : ''}`}>
      {!focused && (
        <header className="app-topbar">
          <button className="app-logo" aria-label="시몬치치 홈" onClick={() => navigate('today')}>
            <MascotMark size={43} />
            <span>
              시몬<b>치치</b>
              <i aria-hidden="true">✦</i>
            </span>
          </button>
          <div className="app-topbar-actions">
            <span className="xp-badge" title="사용할 수 있는 XP">
              <Icon name="gem" size={22} />
              <span data-testid="total-xp">{xp} XP</span>
            </span>
            <button
              className="profile-button"
              aria-label="탐험 친구 설정"
              onClick={() => navigate('settings')}
            >
              <MascotMark variant={avatar} wardrobe={room} size={39} />
            </button>
          </div>
        </header>
      )}
      <main id="main" className={focused ? 'focus-main' : 'app-main'} tabIndex={-1}>
        {error && (
          <div className="error-message" role="alert">
            <p>{error}</p>
            <button className="text-button" onClick={() => setError('')}>
              닫기
            </button>
          </div>
        )}
        {needRefresh && !inQuest && (
          <div className="update-message">
            <span>새로운 모험이 도착했어요!</span>
            <button className="secondary" onClick={() => void updateServiceWorker(true)}>
              업데이트
            </button>
          </div>
        )}
        {focused && focusedSession.status === 'completed' && (
          <Completion
            session={focusedSession}
            data={data}
            avatar={avatar}
            wardrobe={room}
            completedTodayCount={completedToday.length}
            canContinue={focusedSession?.sessionKind === 'course' && !!plan}
            busy={busy}
            onContinue={() => focusedSession && void start(focusedSession.sessionId)}
            onHome={() =>
              navigate(
                focusedSession?.sessionKind === 'mistakes'
                  ? 'mistakes'
                  : focusedSession?.sessionKind === 'review-test'
                    ? 'reviews'
                    : 'today',
              )
            }
          />
        )}
        {focused && focusedSession.status === 'in_progress' && (
          <Quest
            session={focusedSession}
            attempts={data.attempts}
            busy={busy}
            sound={data.settings.sound}
            avatar={avatar}
            wardrobe={room}
            onExit={() =>
              navigate(
                focusedSession.sessionKind === 'mistakes'
                  ? 'mistakes'
                  : focusedSession.sessionKind === 'review-test'
                    ? 'reviews'
                    : 'today',
              )
            }
            onAnswer={(answer, responseMs, retry) =>
              void run(async () => {
                await submitAnswer(db, focusedSession.sessionId, answer, responseMs, retry);
              })
            }
            onHint={() =>
              void run(async () => {
                await markHint(db, focusedSession.sessionId);
              })
            }
            onNext={(stepId) =>
              void run(async () => {
                await advanceSession(db, focusedSession.sessionId, stepId);
                window.scrollTo({ top: 0, behavior: 'instant' });
              })
            }
          />
        )}
        {tab === 'today' && !focused && (
          <>
            <Today
              course={course}
              session={session}
              completedCount={completedPlanIds.length}
              completedTodayCount={completedToday.length}
              busy={busy}
              avatar={avatar}
              wardrobe={room}
              canContinue={!!plan && session?.status === 'completed'}
              onCourse={selectCourse}
              onStart={() => void start()}
              onContinue={() => session && void start(session.sessionId)}
              onMap={() => navigate('map')}
              onWordbooks={() => openWordbooks()}
              onMistakes={() => navigate('mistakes')}
              mistakeCount={activeMistakes.length}
            />
            {sessions
              .filter(
                (item) =>
                  !item.courseId &&
                  item.sessionKind !== 'mistakes' &&
                  item.status === 'in_progress',
              )
              .map((legacy) => (
                <div className="panel" key={legacy.sessionId}>
                  <p>이전에 시작한 탐험도 이어갈 수 있어요.</p>
                  <button
                    className="secondary wide"
                    onClick={() => {
                      setActiveSessionId(legacy.sessionId);
                      setInQuest(true);
                    }}
                  >
                    이전 탐험 이어하기
                  </button>
                </div>
              ))}
          </>
        )}
        {tab === 'map' && !focused && (
          <WorldMap
            course={course}
            completedIds={completedPlanIds}
            onStart={() => navigate('today')}
          />
        )}
        {tab === 'reviews' && !focused && (
          <Reviews
            title={course.title}
            learnedCount={learnedWords.length}
            hasSession={!!reviewSession}
            avatar={avatar}
            busy={busy}
            onStart={() => void startReview()}
            onWordbooks={() => openWordbooks()}
            room={room}
            ownedItemIds={ownedItemIds}
            balance={xp}
            rewardMaxXp={rewardPolicy?.maxXp ?? 0}
            rewardBasisXp={rewardPolicy?.questMaxXp ?? 0}
            legacyReward={!!reviewSession && !reviewSession.rewardPolicy}
            roomMessage={roomMessage}
            onRoomItem={selectRoomItem}
            mistakeCount={activeMistakes.length}
            onMistakes={() => navigate('mistakes')}
          />
        )}
        {tab === 'mistakes' && !focused && (
          <MistakesScreen
            mistakes={activeMistakes}
            hasSession={!!mistakeSession}
            busy={busy}
            onStart={() => void startMistakes()}
            onBack={() => navigate('reviews')}
          />
        )}
        {tab === 'wordbooks' && !focused && (
          <WordbooksScreen
            mode={mode}
            avatar={avatar}
            initialBookId={initialWordbookId}
            wardrobe={room}
            onSettings={() => navigate('settings')}
          />
        )}
        {tab === 'progress' && !focused && <ProgressScreen data={data} course={course} />}
        {tab === 'settings' && !focused && (
          <SettingsScreen
            db={db}
            mode={mode}
            settings={data.settings}
            busy={busy}
            offlineReady={offlineReady}
            native={native}
            onSettings={saveSettings}
            run={run}
          />
        )}
      </main>
      {!focused && (
        <nav className="mobile-nav" aria-label="모바일 메뉴">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={
                tab === t.id || ((tab === 'wordbooks' || tab === 'mistakes') && t.id === 'reviews')
                  ? 'page'
                  : undefined
              }
              onClick={() => navigate(t.id)}
            >
              <span className={`tab-icon tab-${t.id}`}>
                <Icon name={t.icon} size={28} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
