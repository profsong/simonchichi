import type { RoomSelection } from '../../core/room-catalog';
import type { StudyData } from '../../app/useStudyData';
import type { LearningSession } from '../../core/types';
import { getCourse } from '../../data/courses';
import { Icon } from '../../components/Icon';
import { Mascot, type AvatarId } from '../../components/Mascot';
import { getActiveMistakes, mistakeKey } from '../../core/mistakes';

export function Completion({
  session,
  data,
  avatar,
  wardrobe,
  completedTodayCount,
  canContinue,
  busy,
  onContinue,
  onHome,
}: {
  session: LearningSession;
  data: StudyData;
  avatar: AvatarId;
  wardrobe?: RoomSelection;
  completedTodayCount: number;
  canContinue: boolean;
  busy: boolean;
  onContinue: () => void;
  onHome: () => void;
}) {
  const words = session.steps.filter(
    (step) =>
      step.phase === 'vocab' &&
      (session.courseFlow ? step.kind === 'question' : step.kind === 'study'),
  );
  const courseWords = session.courseId ? getCourse(session.courseId).vocabulary : [];
  const retests = session.steps.filter((step) => step.phase === 'retest');
  const retestCorrect = retests.filter((step) =>
    data.attempts.some(
      (attempt) =>
        attempt.sessionId === session.sessionId &&
        attempt.questionId === step.retestOf &&
        !attempt.firstTry &&
        attempt.isCorrect,
    ),
  ).length;
  const reviewTest = session.sessionKind === 'review-test';
  const attempts = data.attempts.filter((a) => a.sessionId === session.sessionId && a.firstTry);
  const correct = attempts.filter((a) => a.isCorrect).length;
  const vocabulary = new Set(
    (session.courseId ? getCourse(session.courseId).vocabulary : []).map((word) => word.id),
  );
  const next = data.reviews
    .filter((r) => vocabulary.has(r.entityId))
    .sort((a, b) => a.dueDay.localeCompare(b.dueDay))[0]?.dueDay;
  if (session.sessionKind === 'mistakes') {
    const remaining = new Set(
      getActiveMistakes(data.attempts, data.sessions).map((item) => item.key),
    );
    const cleared = session.steps.filter(
      (step) =>
        !remaining.has(
          mistakeKey({
            entityId: step.entityId,
            entityType: step.entityType,
            questionId: step.id,
          }),
        ),
    ).length;
    return (
      <section
        className="completion"
        data-testid="quest-completion"
        data-session-id={session.sessionId}
        data-session-kind="mistakes"
      >
        <Mascot variant={avatar} wardrobe={wardrobe} mood="celebrate" size={180} />
        <span className="completion-label">A LITTLE STRONGER!</span>
        <h1>오답 퀴즈 완료!</h1>
        <p>
          {correct} / {attempts.length}개 첫 정답 · 오답노트에서 {cleared}개를 지웠어요.
        </p>
        <p className="panel">
          한 번 맞힌 문제는 다음 퀴즈에서 한 번 더 확인해요. 두 번 맞힌 문제는 오답노트에서 빠져요.
        </p>
        <div className="completion-action">
          <button className="primary wide" onClick={onHome} disabled={busy}>
            오답노트로 <Icon name="check" />
          </button>
        </div>
      </section>
    );
  }
  return (
    <section
      className="completion"
      data-testid="quest-completion"
      data-session-id={session.sessionId}
      data-session-kind={session.sessionKind ?? 'legacy'}
    >
      <div className="completion-art">
        <span className="confetti confetti-one" />
        <span className="confetti confetti-two" />
        <span className="confetti confetti-three" />
        <span className="confetti confetti-four" />
        <span className="completion-star star-one">
          <Icon name="spark" size={31} />
        </span>
        <span className="completion-star star-two">
          <Icon name="star" size={25} />
        </span>
        <Mascot variant={avatar} wardrobe={wardrobe} mood="celebrate" size={226} />
      </div>
      <span className="completion-label">QUEST COMPLETE!</span>
      <h1>
        {reviewTest
          ? '기억을 다시 채웠어요!'
          : completedTodayCount > 1
            ? '한 걸음 더 전진했어요!'
            : '오늘은 충분히 했어요'}
      </h1>
      <p>
        {reviewTest
          ? '10단어 복습 완료! 헷갈린 단어는 다음에 더 자주 만나요.'
          : completedTodayCount > 1
            ? `오늘 ${completedTodayCount}번의 탐험을 마쳤어요. 내 속도로 차곡차곡!`
            : '오늘의 기본 탐험 완료! 쉬어도, 조금 더 가도 좋아요.'}
      </p>
      {session.rewardPolicy && (
        <p className="review-reward-summary" data-testid="review-reward-summary">
          {correct} / 10개 첫 정답 · 최대 {session.rewardPolicy.maxXp} XP 중 +{session.xpAwarded} XP
        </p>
      )}
      <div className="completion-rewards">
        <div className="reward-tile reward-xp">
          <Icon name="gem" size={27} />
          <strong>
            +{session.xpAwarded}
            <small> XP</small>
          </strong>
          <span>모은 경험치</span>
        </div>
        <div className="reward-tile reward-correct">
          <Icon name="check" size={27} />
          <strong>
            {correct}
            <small> / {attempts.length}</small>
          </strong>
          <span>첫 응답 정답</span>
        </div>
        {!reviewTest && (
          <div className="reward-tile reward-words">
            <Icon name="book" size={27} />
            <strong>
              {words.length}
              <small>개</small>
            </strong>
            <span>이번 탐험 단어</span>
          </div>
        )}
      </div>
      {retests.length > 0 && (
        <p className="completion-retest-summary" data-testid="retest-summary">
          오답 {retests.length}단어 다시 도전 · {retestCorrect}개 정답
        </p>
      )}
      {!!words.length && (
        <div className="completion-words">
          {words.map((w) => (
            <span className="chip" lang="en" key={w.id}>
              {session.courseFlow
                ? (courseWords.find((word) => word.id === w.entityId)?.headword ?? w.title)
                : w.title}
            </span>
          ))}
        </div>
      )}
      <p className="next-review">
        <Icon name="leaf" size={19} />
        {next ? `다음 복습 ${next.replaceAll('-', '.')}` : '다음 모험에서 또 만나요'}
      </p>
      <div className="completion-action">
        {canContinue && (
          <button className="primary wide" onClick={onContinue} disabled={busy}>
            다음 퀘스트 시작
            <Icon name="arrow" />
          </button>
        )}
        <button
          className={`${canContinue ? 'secondary' : 'primary'} wide`}
          onClick={onHome}
          disabled={busy}
        >
          {reviewTest ? '복습함으로' : '오늘의 탐험 마치기'}
          <Icon name="check" />
        </button>
        <p>
          {reviewTest
            ? '첫 글자 힌트가 있는 쓰기 응답은 독립 회상과 구분해 기록해요.'
            : canContinue
              ? '더 가고 싶을 때만 이어가요. 오늘은 여기까지 해도 충분해요.'
              : '준비된 탐험을 모두 만났어요. 다음 복습일에 다시 만나요!'}
        </p>
      </div>
    </section>
  );
}
