import type { RoomSelection } from '../../core/room-catalog';
import { useState } from 'react';
import type { LearningSession, PracticeAttempt, QuestStep } from '../../core/types';
import { Icon } from '../../components/Icon';
import { Mascot, type AvatarId } from '../../components/Mascot';
import { phaseNames } from './phases';
import { getCourse } from '../../data/courses';

function EvidencePassage({ step, reveal }: { step: QuestStep; reveal: boolean }) {
  const passage = step.passage ?? '';
  const index = reveal && step.evidenceQuote ? passage.indexOf(step.evidenceQuote) : -1;
  return (
    <div className="passage" lang="en" tabIndex={0} role="region" aria-label="영어 지문">
      {index < 0 ? (
        passage
      ) : (
        <>
          {passage.slice(0, index)}
          <mark>{step.evidenceQuote}</mark>
          {passage.slice(index + step.evidenceQuote!.length)}
        </>
      )}
    </div>
  );
}
function Speak({ text }: { text: string }) {
  const [unavailable, setUnavailable] = useState(false);
  function speak() {
    if (!('speechSynthesis' in window)) {
      setUnavailable(true);
      return;
    }
    const voice = speechSynthesis
      .getVoices()
      .find((v) => v.localService && v.lang.startsWith('en'));
    if (!voice) {
      setUnavailable(true);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.85;
    utterance.onerror = () => setUnavailable(true);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
  return (
    <>
      <button className="icon-button" onClick={speak} aria-label="발음 듣기">
        <Icon name="sound" />
      </button>
      {unavailable && <small role="status">기기 음성을 사용할 수 없어 텍스트로 학습해요.</small>}
    </>
  );
}
interface Props {
  session: LearningSession;
  attempts: PracticeAttempt[];
  busy: boolean;
  sound: boolean;
  avatar?: AvatarId;
  wardrobe?: RoomSelection;
  onAnswer: (answer: string, responseMs: number, retry: boolean) => void;
  onHint: () => void;
  onNext: (stepId: string) => void;
  onExit: () => void;
}

export function Quest(props: Props) {
  const { session } = props;
  const step = session.steps[session.currentQuestionIndex];
  if (!step) return null;
  const pendingRetestCount = session.courseFlow
    ? session.steps.filter(
        (item) =>
          item.phase === 'vocab' &&
          item.kind === 'question' &&
          props.attempts.some(
            (attempt) =>
              attempt.sessionId === session.sessionId &&
              attempt.questionId === item.id &&
              attempt.firstTry &&
              !attempt.isCorrect,
          ),
      ).length
    : 0;
  return (
    <section
      className="quest-layout lesson-layout"
      data-testid="quest-screen"
      data-session-id={session.sessionId}
      data-question-id={step.id}
      data-session-kind={session.sessionKind ?? 'legacy'}
      data-phase={step.phase}
      data-course-flow={session.courseFlow ?? 'legacy'}
    >
      <h1 className="sr-only">
        {session.sessionKind === 'mistakes' ? '오답 퀴즈' : `${phaseNames[step.phase]} 학습`}
      </h1>
      <div className="lesson-topbar">
        <button
          className="icon-button lesson-close"
          onClick={props.onExit}
          aria-label="저장하고 나가기"
        >
          <Icon name="close" size={24} />
        </button>
        <progress
          className="lesson-progress"
          value={session.currentQuestionIndex}
          max={session.steps.length}
          aria-label={
            session.sessionKind === 'mistakes' ? '오답 퀴즈 진행률' : '오늘 퀘스트 진행률'
          }
          aria-valuetext={`${session.currentQuestionIndex} / ${session.steps.length} 완료`}
        />
        <span
          className="lesson-remaining"
          aria-label={`${session.steps.length - session.currentQuestionIndex}단계 남음`}
        >
          <Icon name="spark" size={22} />
          <span>{session.steps.length - session.currentQuestionIndex}</span>
        </span>
      </div>
      <div className="lesson-stage">
        <span className="lesson-stage-label">
          {session.sessionKind === 'mistakes' ? '오답 다시 도전' : phaseNames[step.phase]}
        </span>
        <span>
          {session.currentQuestionIndex + 1} / {session.steps.length}
        </span>
      </div>
      {session.courseFlow &&
        (step.phase === 'syntax' || step.phase === 'reading') &&
        pendingRetestCount > 0 && (
          <p className="test-first-tail-note">
            문장과 독해를 마치면 헷갈린 {pendingRetestCount}단어를 다시 풀어요.
          </p>
        )}
      {session.rewardPolicy && (
        <p className="review-reward-progress">
          10문제를 마치면 최대 +{session.rewardPolicy.maxXp} XP
        </p>
      )}
      <Question key={`${session.sessionId}:${step.id}`} {...props} step={step} />
    </section>
  );
}

function Question({
  step,
  session,
  attempts,
  busy,
  sound,
  avatar = 'monchichi',
  wardrobe,
  onAnswer,
  onHint,
  onNext,
}: Props & { step: QuestStep }) {
  const [answer, setAnswer] = useState('');
  const [retry, setRetry] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const isRetest = !!step.retestOf;
  const currentAttempts = attempts.filter(
    (a) => a.sessionId === session.sessionId && a.questionId === (step.retestOf ?? step.id),
  );
  const first = currentAttempts.find((a) => a.firstTry);
  const second = currentAttempts.find((a) => !a.firstTry);
  const result = isRetest ? second : (second ?? (retry ? undefined : first));
  const hinted = session.hintStepIds.includes(step.id);
  const isStudy = step.kind === 'study';
  const testFirst = session.courseFlow === 'test-first-v1';
  const testWord =
    testFirst && session.courseId && (step.phase === 'vocab' || isRetest)
      ? getCourse(session.courseId).vocabulary.find((word) => word.id === step.entityId)
      : undefined;
  const answerFormId = `answer-${session.sessionId}-${step.id}`;
  const mood = result
    ? result.isCorrect
      ? 'celebrate'
      : 'encourage'
    : isStudy
      ? 'happy'
      : 'thinking';
  return (
    <article
      className={`lesson-card ${isStudy ? 'study-card lesson-study' : 'lesson-question'} ${result ? 'lesson-answered' : ''}`}
      data-testid={isStudy ? 'study-card' : 'question-card'}
    >
      <div className="lesson-content">
        {isStudy ? (
          <>
            <div className="lesson-companion lesson-study-companion">
              <Mascot
                variant={avatar}
                wardrobe={wardrobe}
                mood={mood}
                size={100}
                className="lesson-mascot"
              />
              <div className="lesson-bubble">
                <p>새로운 단어를 만나 볼까요?</p>
              </div>
            </div>
            <div className="lesson-word-heading">
              <span className="lesson-word-label">NEW WORD</span>
              <h2 className="headword" lang="en">
                {step.title}
              </h2>
              <p className="word-meaning">{step.prompt}</p>
              {sound && step.english && <Speak text={step.english} />}
            </div>
            {!step.prompt.endsWith(step.explanation) && (
              <p className="word-definition">{step.explanation}</p>
            )}
            {step.english && (
              <div className="example lesson-example">
                <p lang="en">{step.english}</p>
                <p>{step.translation}</p>
              </div>
            )}
            {!!step.collocations?.length && (
              <div className="collocations">
                <span>함께 쓰는 표현</span>
                {step.collocations.map((c) => (
                  <span className="chip" key={c} lang="en">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <p className="lesson-study-note">단어의 뜻을 한 번 떠올린 뒤 다음으로 가요.</p>
          </>
        ) : (
          <>
            <div className="lesson-companion">
              <Mascot
                variant={avatar}
                wardrobe={wardrobe}
                mood={mood}
                size={88}
                className="lesson-mascot"
              />
              <div className="lesson-bubble">
                <span className="lesson-question-label">
                  {isRetest
                    ? '헷갈린 단어, 다시 만나요'
                    : step.mode === 'recall'
                      ? '직접 떠올리기'
                      : step.phase === 'reading'
                        ? '글 속에서 찾아봐요'
                        : '함께 풀어봐요'}
                </span>
                <h2 className="question-prompt" id="question-prompt">
                  {testWord ? '이 단어의 한글 뜻을 고르세요.' : step.prompt}
                </h2>
              </div>
            </div>
            {testWord && (
              <div className="test-first-word" data-testid="test-first-word">
                <p lang="en">{testWord.headword}</p>
                {sound && <Speak text={testWord.headword} />}
              </div>
            )}
            {step.passage && (
              <section className="lesson-reading" aria-label="문제의 영어 지문">
                <h3 className="passage-title" lang="en">
                  {step.title}
                </h3>
                <EvidencePassage step={step} reveal={!!result} />
              </section>
            )}
            {step.english && !step.passage && (
              <div className="lesson-sentence">
                <p className="question-english" lang="en">
                  {step.english}
                </p>
                {sound && <Speak text={step.english} />}
              </div>
            )}
            <form
              id={answerFormId}
              className="lesson-answer-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && !result && answer.trim())
                  onAnswer(answer, Date.now() - startedAt, isRetest || retry);
              }}
            >
              {step.choices ? (
                <fieldset className="choices lesson-choices" disabled={busy || !!result}>
                  <legend className="sr-only">답 선택</legend>
                  {step.choices.map((choice, i) => (
                    <label
                      className={`choice lesson-choice ${answer === String(i) || result?.answer === String(i) ? 'selected' : ''} ${result && i === step.correctIndex ? 'correct-choice' : ''} ${result && !result.isCorrect && result.answer === String(i) ? 'learning-choice' : ''}`}
                      key={`${i}:${choice}`}
                    >
                      <input
                        type="radio"
                        name="answer"
                        value={i}
                        checked={result ? result.answer === String(i) : answer === String(i)}
                        onChange={(e) => setAnswer(e.target.value)}
                      />
                      <span className="choice-index">{String.fromCharCode(65 + i)}</span>
                      <span>{choice}</span>
                      {result && i === step.correctIndex && <Icon name="check" size={18} />}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <label className="recall-label lesson-recall">
                  영어 단어를 입력해 주세요
                  <input
                    aria-labelledby="question-prompt"
                    lang="en"
                    className="recall-input"
                    value={result?.answer ?? answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={busy || !!result}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Type your answer"
                  />
                </label>
              )}
              {step.alwaysHinted && step.hint && (
                <p className="recall-first-letter" data-testid="recall-first-letter">
                  첫 글자 힌트 ·{' '}
                  <strong lang="en">{step.hint.replace(/^첫 글자[:：]\s*/, '')}</strong>
                </p>
              )}
              {!step.alwaysHinted && !result && !first && step.hint && (
                <div className="hint-row lesson-hint">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || hinted}
                    onClick={onHint}
                  >
                    {hinted ? '힌트 사용 중' : '힌트 보기'}
                  </button>
                  {hinted && <span role="status">{step.hint}</span>}
                </div>
              )}
            </form>
          </>
        )}
      </div>
      <div
        className={`lesson-action-dock ${result ? (result.isCorrect ? 'lesson-dock-success' : 'lesson-dock-learning') : ''}`}
      >
        {!isStudy && result && (
          <div
            className={`answer-feedback lesson-feedback ${result.isCorrect ? 'success' : 'learning'}`}
            role="status"
            tabIndex={0}
          >
            <div className="lesson-feedback-title">
              <span className="lesson-feedback-icon">
                <Icon name={result.isCorrect ? 'check' : 'book'} size={22} />
              </span>
              <h3>{result.isCorrect ? '잘 떠올렸어요!' : '괜찮아요, 함께 확인해요.'}</h3>
            </div>
            <p>
              <strong>정답</strong>{' '}
              {step.choices
                ? step.choices[step.correctIndex ?? 0]
                : step.acceptedAnswers?.join(' / ')}
            </p>
            <p>{step.explanation}</p>
            {step.evidenceQuote && (
              <blockquote lang="en">
                <span>본문 속 근거</span>“{step.evidenceQuote}”
              </blockquote>
            )}
            {result.usedHint && <small>힌트로 익힌 내용은 다음 복습에서 다시 떠올려 봐요.</small>}
          </div>
        )}
        {isStudy ? (
          <button
            className="primary wide lesson-primary"
            disabled={busy}
            onClick={() => onNext(step.id)}
          >
            다음으로 <Icon name="arrow" />
          </button>
        ) : result ? (
          <div className="answer-actions lesson-answer-actions">
            {!result.isCorrect &&
              !second &&
              !isRetest &&
              !testFirst &&
              session.sessionKind !== 'mistakes' && (
                <button
                  className="secondary lesson-retry"
                  disabled={busy}
                  onClick={() => {
                    setAnswer('');
                    setRetry(true);
                  }}
                >
                  한 번 더 도전
                </button>
              )}
            <button
              className="primary lesson-primary"
              disabled={busy}
              onClick={() => onNext(step.id)}
            >
              다음으로 <Icon name="arrow" />
            </button>
          </div>
        ) : (
          <button
            className="primary wide lesson-primary"
            type="submit"
            form={answerFormId}
            disabled={busy || !answer.trim()}
          >
            정답 확인 <Icon name="check" />
          </button>
        )}
        {!result && <p className="lesson-dock-note">천천히 생각해도 괜찮아요.</p>}
      </div>
    </article>
  );
}
