import { useState } from 'react';
import type { StudyData } from '../../app/useStudyData';
import { Icon } from '../../components/Icon';
import { addDays, localDay } from '../../core/scheduler';
import { getCatalog } from '../../data/catalog';
import { completedCoursePlanIds } from '../../core/course-quest';
import { getCourses } from '../../data/courses';
import type { CourseDocument } from '../../data/course-schema';
import { availableXp } from '../../core/economy';

export function ProgressScreen({ data, course }: { data: StudyData; course: CourseDocument }) {
  const [visibleHistory, setVisibleHistory] = useState(10);
  const completed = data.sessions.filter((s) => s.status === 'completed');
  const completedPlans = completedCoursePlanIds(course, data.sessions);
  const history = [...data.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const plans = new Map(getCatalog('demo').dailyPlans.map((p) => [p.id, p]));
  const first = data.attempts.filter((a) => a.firstTry);
  const categories = [
    { title: '뜻 알아보기', mode: ['recognition'], description: '보기에서 뜻을 구별한 기록' },
    {
      title: '직접 떠올리기',
      mode: ['recall', 'cloze'],
      description: '힌트 없이 영어를 떠올린 기록',
    },
    {
      title: '문맥 이해',
      mode: ['meaning_in_context', 'collocation'],
      description: '문맥 속 쓰임을 이해한 기록',
    },
    {
      title: '문장과 독해',
      mode: ['syntax', 'paraphrase', 'reading'],
      description: '문장 구조와 글의 의미를 찾은 기록',
    },
  ];
  const days = new Set(completed.map((s) => s.completedDay ?? s.localDay));
  const xp = data.rewards.reduce((sum, r) => sum + r.xp, 0);
  return (
    <section>
      <div className="section-top">
        <div>
          <span className="eyebrow">LITTLE STEPS, REAL GROWTH</span>
          <h1>내가 쌓은 작은 변화</h1>
          <p>맞힌 개수 너머, 어떻게 기억하는지 살펴봐요.</p>
        </div>
        <span className="section-emblem">
          <Icon name="chart" size={30} />
        </span>
      </div>
      <div className="panel adventure-progress">
        <span className="mini-icon green">
          <Icon name="flag" size={24} />
        </span>
        <div>
          <h2>{course.title}</h2>
          <p>
            <strong data-testid="completed-plan-count">{completedPlans.length}</strong> /{' '}
            {course.lessons.length}회 완료 · 총{' '}
            {completed.filter((session) => session.sessionKind !== 'review-test').length}번의 탐험
          </p>
          <small>하루 기본 탐험 뒤에도 다음 단계로 이어갈 수 있어요.</small>
        </div>
      </div>
      <div className="stats-grid">
        <div className="panel stat">
          <span>탐험한 날</span>
          <strong>
            {days.size}
            <small>일</small>
          </strong>
        </div>
        <div className="panel stat">
          <span>누적 획득 XP</span>
          <strong>
            {xp}
            <small>XP</small>
          </strong>
        </div>
        <div className="panel stat">
          <span>기억이 단단해진 단어</span>
          <strong>
            {data.reviews.filter((r) => r.mastered).length}
            <small>개</small>
          </strong>
        </div>
      </div>
      <section className="panel xp-wallet-summary" aria-label="XP 지갑">
        <h2>나의 XP 지갑</h2>
        <dl>
          <div>
            <dt>사용 가능</dt>
            <dd data-testid="available-xp">{availableXp(data.rewards, data.purchases ?? [])} XP</dd>
          </div>
          <div>
            <dt>누적 획득</dt>
            <dd data-testid="earned-xp">{xp} XP</dd>
          </div>
          <div>
            <dt>꾸미기에 사용</dt>
            <dd data-testid="spent-xp">
              {(data.purchases ?? []).reduce((sum, purchase) => sum + purchase.price, 0)} XP
            </dd>
          </div>
        </dl>
        <p className="muted small">꾸미기에 사용해도 탐험과 숙련 기록은 그대로 남아요.</p>
      </section>
      <div className="panel activity-panel">
        <h2>최근 7일의 발자국</h2>
        <div className="activity-days">
          {Array.from({ length: 7 }, (_, i) => addDays(localDay(), i - 6)).map((day) => (
            <div key={day}>
              <span className={days.has(day) ? 'active-day' : ''}>
                {days.has(day) ? <Icon name="check" /> : '·'}
              </span>
              <small>{day.slice(5).replace('-', '/')}</small>
            </div>
          ))}
        </div>
        <p className="muted small">쉬는 날도 탐험의 일부예요. 연속 기록이나 감점은 없어요.</p>
      </div>
      <div className="metrics-grid">
        {categories.map((c) => {
          const attempts = first.filter(
            (a) => c.mode.includes(a.mode) && (c.title !== '직접 떠올리기' || !a.usedHint),
          );
          const independent = attempts.filter((a) => a.isCorrect && !a.usedHint).length;
          const rate = attempts.length ? Math.round((independent / attempts.length) * 100) : null;
          return (
            <section className="panel metric" key={c.title}>
              <h2>{c.title}</h2>
              <p className="muted">{c.description}</p>
              <strong>{rate === null ? '아직 기록이 없어요' : `${rate}%`}</strong>
              <progress aria-label={c.title} value={rate ?? 0} max={100} />
              <small>{attempts.length}번의 첫 응답 · 힌트 없는 정답 기준</small>
            </section>
          );
        })}
      </div>
      {!!history.length && (
        <section className="panel session-history" aria-label="탐험 기록">
          <h2>차곡차곡 쌓인 탐험</h2>
          <p className="muted small">같은 날 여러 번 전진한 기록도 모두 간직해요.</p>
          <ol>
            {history.slice(0, visibleHistory).map((session) => {
              const plan = plans.get(session.planId.replace(':partial', ''));
              const sessionCourse = getCourses().find((item) => item.id === session.courseId);
              const lesson = sessionCourse?.lessons.find((item) => item.id === session.planId);
              const label =
                session.sessionKind === 'review-test'
                  ? `${sessionCourse?.title ?? ''} · 10단어 복습`
                  : lesson
                    ? `${sessionCourse?.title} · ${lesson.number}회`
                    : plan
                      ? `이전 탐험 · 챕터 ${plan.week} · ${plan.day}단계`
                      : '이전 기억 복습';
              const day = session.completedDay ?? session.localDay;
              return (
                <li
                  key={session.sessionId}
                  data-testid="session-history-item"
                  data-session-id={session.sessionId}
                >
                  <span
                    className={`history-icon ${session.status === 'completed' ? 'history-done' : ''}`}
                  >
                    <Icon name={session.status === 'completed' ? 'check' : 'flag'} size={20} />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {day.replaceAll('-', '.')} ·{' '}
                      {session.status === 'completed' ? '탐험 완료' : '탐험 중'}
                      {session.planId.endsWith(':partial') ? ' · 나눠서 전진' : ''}
                    </small>
                  </div>
                  <span className="history-xp">+{session.xpAwarded} XP</span>
                </li>
              );
            })}
          </ol>
          {history.length > visibleHistory && (
            <button
              className="secondary wide"
              onClick={() => setVisibleHistory((count) => count + 10)}
            >
              이전 탐험 더 보기
            </button>
          )}
        </section>
      )}
      <aside className="gentle-note">
        <Icon name="leaf" />
        <p>
          숙련은 서로 다른 날의 정답, 직접 회상, 문맥 적용, 7일 이상 간격의 성공을 함께 확인해요.
          객관식과 첫 글자 힌트를 사용한 정답만으로 숙련을 판단하지 않아요.
        </p>
      </aside>
    </section>
  );
}
