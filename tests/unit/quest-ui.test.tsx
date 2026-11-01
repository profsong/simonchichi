import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveStep } from '../../src/core/quest-builder';
import { localDay } from '../../src/core/scheduler';
import type { LearningSession, PracticeAttempt, QuestStep } from '../../src/core/types';
import { contentVersion, getCatalog } from '../../src/data/catalog';
import { markHint, QuestDatabase, startOrResumeSession, submitAnswer } from '../../src/data/db';
import { Quest } from '../../src/features/daily-quest/Quest';

let db: QuestDatabase;
let counter = 0;

beforeEach(() => {
  db = new QuestDatabase('demo', `test-quest-ui-${counter++}`);
});

afterEach(async () => {
  cleanup();
  await db.delete();
});

function stepFor(id: string): QuestStep {
  const step = resolveStep(id, 'demo');
  if (!step) throw new Error(`Missing fixture: ${id}`);
  return step;
}

async function sessionFor(step: QuestStep): Promise<LearningSession> {
  return startOrResumeSession(db, { planId: 'w01-d1', steps: [step] }, localDay(), contentVersion);
}

/** Exercise the component contract using committed records, as the application does after refresh. */
function StoredQuest({ initialSession }: { initialSession: LearningSession }) {
  const [session, setSession] = useState(initialSession);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [busy, setBusy] = useState(false);

  async function update(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setSession((await db.sessions.get(session.sessionId))!);
      setAttempts(await db.attempts.toArray());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Quest
      session={session}
      attempts={attempts}
      busy={busy}
      sound={false}
      onAnswer={(answer, responseMs, retry) => {
        void update(() => submitAnswer(db, session.sessionId, answer, responseMs, retry));
      }}
      onHint={() => {
        void update(() => markHint(db, session.sessionId));
      }}
      onNext={() => undefined}
      onExit={() => undefined}
    />
  );
}

describe('quest answer interaction', () => {
  it('lets the learner change a selection before committing exactly that final answer', async () => {
    const question = stepFor(getCatalog('demo').vocabularyQuestions[0].id);
    const session = await sessionFor(question);
    const user = userEvent.setup();
    render(<StoredQuest initialSession={session} />);

    const confirm = screen.getByRole('button', { name: '정답 확인' });
    expect(confirm).toBeDisabled();
    const choices = screen.getAllByRole('radio');
    const wrong = (question.correctIndex! + 1) % choices.length;
    await user.click(choices[wrong]);
    expect(choices[wrong]).toBeChecked();
    await user.click(choices[question.correctIndex!]);
    expect(choices[wrong]).not.toBeChecked();
    expect(choices[question.correctIndex!]).toBeChecked();
    expect(await db.attempts.count()).toBe(0);

    await user.click(confirm);
    expect(await screen.findByText('잘 떠올렸어요!')).toBeInTheDocument();
    expect(await db.attempts.toArray()).toEqual([
      expect.objectContaining({
        answer: String(question.correctIndex),
        isCorrect: true,
        firstTry: true,
      }),
    ]);
    for (const choice of screen.getAllByRole('radio')) expect(choice).toBeDisabled();
    expect(screen.queryByRole('button', { name: '정답 확인' })).not.toBeInTheDocument();
  });

  it('shows the complete passage before answering and reveals its actual evidence only afterward', async () => {
    const question = stepFor(getCatalog('demo').readings[0].questions[0].id);
    const session = await sessionFor(question);
    const user = userEvent.setup();
    const { container } = render(<StoredQuest initialSession={session} />);

    expect(container.querySelector('.passage')?.textContent).toBe(question.passage);
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.queryByText('본문 속 근거')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('radio')[question.correctIndex!]);
    expect(container.querySelector('mark')).toBeNull();
    await user.click(screen.getByRole('button', { name: '정답 확인' }));

    expect(await screen.findByText('본문 속 근거')).toBeInTheDocument();
    expect(container.querySelector('mark')?.textContent).toBe(question.evidenceQuote);
    expect(question.passage).toContain(container.querySelector('mark')?.textContent);
    expect(container.querySelector('blockquote')).toHaveTextContent(question.evidenceQuote!);
  });

  it('restores the displayed hint after reopening and saves the answer as hinted', async () => {
    const question = stepFor('recall:v-adapt-sense1');
    const session = await sessionFor(question);
    const user = userEvent.setup();
    const view = render(<StoredQuest initialSession={session} />);

    await user.click(screen.getByRole('button', { name: '힌트 보기' }));
    expect(await screen.findByText(question.hint!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '힌트 사용 중' })).toBeDisabled();
    view.unmount();
    const name = db.name;
    db.close();
    db = new QuestDatabase('demo', name);
    const restored = (await db.sessions.get(session.sessionId))!;
    render(<StoredQuest initialSession={restored} />);
    expect(screen.getByText(question.hint!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '힌트 사용 중' })).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'adapt');
    await user.click(screen.getByRole('button', { name: '정답 확인' }));
    expect(
      await screen.findByText('힌트로 익힌 내용은 다음 복습에서 다시 떠올려 봐요.'),
    ).toBeInTheDocument();
    expect((await db.attempts.toArray())[0]).toMatchObject({ isCorrect: true, usedHint: true });
    expect(await db.reviews.get(question.entityId)).toMatchObject({
      activeRecallCorrectDays: [],
      mastered: false,
    });
  });

  it('gives reassuring wrong feedback and permits only one persisted retry', async () => {
    const question = stepFor('recall:v-adapt-sense1');
    const session = await sessionFor(question);
    const user = userEvent.setup();
    render(<StoredQuest initialSession={session} />);

    await user.type(screen.getByRole('textbox'), 'wrong');
    await user.click(screen.getByRole('button', { name: '정답 확인' }));
    expect(await screen.findByText('괜찮아요, 함께 확인해요.')).toBeInTheDocument();
    expect((await db.sessions.get(session.sessionId))?.xpAwarded).toBe(0);
    expect(screen.getByRole('textbox')).toHaveValue('wrong');
    await user.click(screen.getByRole('button', { name: '한 번 더 도전' }));
    expect(screen.queryByText('괜찮아요, 함께 확인해요.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    await user.type(screen.getByRole('textbox'), ' ADAPT ');
    await user.click(screen.getByRole('button', { name: '정답 확인' }));

    expect(await screen.findByText('잘 떠올렸어요!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '한 번 더 도전' })).not.toBeInTheDocument();
    await waitFor(async () => expect(await db.attempts.count()).toBe(2));
    expect((await db.attempts.toArray()).filter((attempt) => !attempt.firstTry)).toEqual([
      expect.objectContaining({ answer: ' ADAPT ', isCorrect: true }),
    ]);
    expect((await db.sessions.get(session.sessionId))?.xpAwarded).toBe(3);
    expect(await db.reviews.get(question.entityId)).toMatchObject({
      activeRecallCorrectDays: [],
      mastered: false,
    });
  });
});
