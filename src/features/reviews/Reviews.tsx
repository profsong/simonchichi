import { Icon } from '../../components/Icon';
import type { AvatarId } from '../../components/Mascot';
import { AvatarRoom } from './AvatarRoom';
import type { RoomSelection } from '../../core/room-catalog';

export function Reviews({
  title,
  learnedCount,
  hasSession,
  avatar,
  busy,
  onStart,
  onWordbooks,
  room,
  ownedItemIds,
  balance,
  rewardMaxXp,
  rewardBasisXp,
  legacyReward,
  onRoomItem,
  roomMessage,
  mistakeCount,
  onMistakes,
}: {
  title: string;
  learnedCount: number;
  hasSession: boolean;
  avatar: AvatarId;
  busy: boolean;
  onStart: () => void;
  onWordbooks: () => void;
  room: RoomSelection;
  ownedItemIds: string[];
  balance: number;
  rewardMaxXp: number;
  rewardBasisXp: number;
  legacyReward: boolean;
  onRoomItem: (id: string) => void;
  roomMessage?: string;
  mistakeCount: number;
  onMistakes: () => void;
}) {
  return (
    <section className="reviews-screen">
      <h1 className="sr-only">복습함</h1>
      <AvatarRoom
        avatar={avatar}
        room={room}
        ownedItemIds={ownedItemIds}
        balance={balance}
        busy={busy}
        onSelect={onRoomItem}
        message={roomMessage}
      />
      <section className="panel review-test-card" aria-label="10단어 복습 테스트">
        <span className="eyebrow">A LITTLE MEMORY BOOST</span>
        <h2>10단어 복습 테스트</h2>
        <p>{title}에서 배운 단어를 다시 만나요.</p>
        <p className="review-test-format">뜻 고르기 5개 + 영어로 쓰기 5개</p>
        <div className="review-xp-offer" data-testid="review-xp-offer">
          <Icon name="gem" size={24} />
          <div>
            <strong>{legacyReward ? '이어서 복습해요' : `최대 +${rewardMaxXp} XP`}</strong>
            <small>
              {legacyReward
                ? '진행 중인 복습은 시작할 때의 보상을 이어가요.'
                : `탐험 ${rewardBasisXp} XP의 30% · 첫 정답 수에 비례`}
            </small>
          </div>
        </div>
        <p className="muted">
          헷갈린 단어를 자주 만나고, 잘 기억한 단어도 가끔 확인해요. 영어로 쓸 때는 첫 글자를 보여
          드려요.
        </p>
        <button
          className="primary wide"
          disabled={busy || (!hasSession && learnedCount < 10)}
          onClick={onStart}
        >
          {hasSession ? '복습 테스트 이어하기' : '10단어 복습 테스트 시작'} <Icon name="arrow" />
        </button>
        <p className="gentle-note">
          {learnedCount < 10
            ? `배운 단어가 ${learnedCount}개예요. 10단어를 배운 뒤 시작할 수 있어요.`
            : '하루 횟수·추가 XP 제한 없이, 원할 때 다시 도전해요.'}
        </p>
      </section>
      <section className="panel mistakes-entry" aria-label="오답 다시 도전">
        <span className="eyebrow">ONE MORE LITTLE STEP</span>
        <h2>오답노트</h2>
        <p>단어 · 문장 · 독해에서 헷갈린 문제 {mistakeCount}개를 모았어요.</p>
        <p className="muted">서로 다른 퀴즈에서 두 번 맞히면 오답노트에서 빠져요.</p>
        <button className="secondary wide" onClick={onMistakes} disabled={busy}>
          오답노트 보기 <Icon name="arrow" />
        </button>
      </section>
      <button className="wordbook-library-link" onClick={onWordbooks}>
        <span className="mini-icon blue">
          <Icon name="book" size={24} />
        </span>
        <span>
          <strong>단어장 둘러보기</strong>
          <small>단어와 한글 뜻을 찾아봐요</small>
        </span>
        <Icon name="arrow" size={19} />
      </button>
    </section>
  );
}
