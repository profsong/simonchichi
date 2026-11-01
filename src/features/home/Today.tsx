import type { RoomSelection } from '../../core/room-catalog';
import type { CourseDocument } from '../../data/course-schema';
import type { CourseId, LearningSession } from '../../core/types';
import { Icon, type IconName } from '../../components/Icon';
import { Mascot, type AvatarId } from '../../components/Mascot';
import { WordbookSelector } from '../../components/WordbookSelector';

const stages: { title: string; icon: IconName; count: string; description: string }[] = [
  { title: '기억 채우기', icon: 'leaf', count: '5단어', description: '배운 단어를 다시 떠올려요' },
  {
    title: '단어 탐험',
    icon: 'star',
    count: '20단어',
    description: '영어를 보고 한글 뜻부터 골라요',
  },
  { title: '문장 해독', icon: 'spark', count: '2개', description: '이번 단어로 문장을 풀어요' },
  { title: '독해 미션', icon: 'flag', count: '2개', description: '글 속 단어와 근거를 찾아요' },
  {
    title: '오답 다시 도전',
    icon: 'book',
    count: '오답만',
    description: '헷갈린 문제를 모아 두 번 맞혀요',
  },
];
export function Today({
  course,
  session,
  completedCount,
  completedTodayCount,
  avatar,
  wardrobe,
  busy,
  onCourse,
  onStart,
  onContinue,
  onMap,
  onWordbooks,
  onMistakes,
  mistakeCount,
  canContinue,
}: {
  course: CourseDocument;
  session?: LearningSession;
  completedCount: number;
  completedTodayCount: number;
  avatar: AvatarId;
  wardrobe?: RoomSelection;
  busy: boolean;
  onCourse: (id: CourseId) => void;
  onStart: () => void;
  onContinue: () => void;
  onMap: () => void;
  onWordbooks: () => void;
  onMistakes: () => void;
  mistakeCount: number;
  canContinue: boolean;
}) {
  const number =
    course.lessons.find((lesson) => lesson.id === session?.planId)?.number ??
    Math.min(completedCount + 1, course.lessons.length);
  const finished = session?.status === 'completed';
  return (
    <section className="today-screen" data-course-id={course.id}>
      <WordbookSelector value={course.id} onChange={onCourse} disabled={busy} />
      <div className="today-greeting">
        <span className="eyebrow">A LITTLE ADVENTURE, EVERY DAY</span>
        <h1>오늘도 한 걸음, 같이!</h1>
        <p>나만의 속도로 영어 세상을 넓혀요.</p>
      </div>
      <div className="today-hero">
        <div className="hero-copy">
          <span className="hero-kicker">{course.title}</span>
          <h2>{finished ? '멋진 탐험이었어요!' : `${number}번째 단어 탐험`}</h2>
          <p>
            {finished
              ? `오늘 ${completedTodayCount}회 완료! 쉬어도, 더 나아가도 좋아요.`
              : '20단어 뜻을 먼저 골라 보고, 문장과 글에서 연습해요.'}
          </p>
        </div>
        <Mascot
          variant={avatar}
          wardrobe={wardrobe}
          mood={finished ? 'celebrate' : 'happy'}
          size={150}
        />
      </div>
      <div className="today-action">
        {finished && canContinue ? (
          <button className="primary wide" disabled={busy} onClick={onContinue}>
            다음 퀘스트 시작 <Icon name="arrow" />
          </button>
        ) : !finished && completedCount < course.lessons.length ? (
          <button className="primary wide" disabled={busy} onClick={onStart}>
            {session?.status === 'in_progress' ? '탐험 이어하기' : '오늘 퀘스트 시작'}{' '}
            <Icon name="arrow" />
          </button>
        ) : (
          <div className="panel">
            <h2>
              {completedCount === course.lessons.length
                ? '이 단어장을 모두 탐험했어요!'
                : '오늘의 기본 탐험 완료!'}
            </h2>
            <p>복습 테스트로 기억을 다시 채워 보세요.</p>
          </div>
        )}
        <p className="gentle-note">시간 제한은 없어요. 중간에 나가도 이어서 할 수 있어요.</p>
        {session?.status === 'in_progress' && !session.courseFlow && (
          <p className="gentle-note">
            이전에 시작한 탐험은 원래 순서로 이어가요. 다음 탐험부터 테스트를 먼저 해요.
          </p>
        )}
      </div>
      <div className="daily-route" aria-label="매일 학습 루틴">
        {stages.map((stage, index) =>
          stage.title === '오답 다시 도전' ? (
            <button
              className="daily-stage daily-mistakes-button"
              key={stage.title}
              data-testid="today-mistakes"
              disabled={busy}
              onClick={onMistakes}
            >
              <span className="mini-icon green">
                <Icon name="book" size={23} />
              </span>
              <span className="daily-stage-copy">
                <strong>{stage.title}</strong>
                <span>{stage.description}</span>
              </span>
              <b>{mistakeCount}개</b>
              <Icon name="arrow" size={19} />
            </button>
          ) : (
            <div className="daily-stage" key={stage.title}>
              <span className={`mini-icon ${index % 2 ? 'blue' : 'green'}`}>
                <Icon name={stage.icon} size={23} />
              </span>
              <div>
                <strong>{stage.title}</strong>
                <p>{stage.description}</p>
              </div>
              <b>{stage.count}</b>
            </div>
          ),
        )}
      </div>
      <p className="gentle-note">
        처음에는 이번 회차 단어 5개로 기억 채우기를 시작해요. 다음부터 배운 단어를 복습해요.
      </p>
      <button className="map-preview-button" onClick={onMap}>
        <Icon name="map" />
        <span>
          {course.title} 모험 지도
          <small>
            {completedCount} / {course.lessons.length}회 완료 · 회당 20단어
          </small>
        </span>
        <Icon name="arrow" />
      </button>
      <button className="wordbook-library-link" onClick={onWordbooks}>
        <Icon name="book" />
        <span>
          <strong>단어장 둘러보기</strong>
          <small>단어와 한글 뜻을 찾아봐요</small>
        </span>
        <Icon name="arrow" />
      </button>
    </section>
  );
}
