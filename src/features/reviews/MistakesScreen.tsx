import { useState } from 'react';
import type { Mistake } from '../../core/mistakes';
import type { EntityType } from '../../core/types';
import { findCourseWord } from '../../data/courses';
import { Icon } from '../../components/Icon';
import '../../styles/mistakes.css';

const categories: { id: EntityType | 'all'; title: string }[] = [
  { id: 'all', title: '전체' },
  { id: 'vocab', title: '단어' },
  { id: 'syntax', title: '문장' },
  { id: 'reading', title: '독해' },
];

export function MistakesScreen({
  mistakes,
  hasSession,
  busy,
  onStart,
  onBack,
}: {
  mistakes: Mistake[];
  hasSession: boolean;
  busy: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const [category, setCategory] = useState<EntityType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const filtered = mistakes.filter((item) => {
    if (category !== 'all' && item.entityType !== category) return false;
    const word = item.entityType === 'vocab' ? findCourseWord(item.entityId) : undefined;
    return `${word?.headword ?? ''} ${word?.koreanMeaning ?? ''} ${item.step.prompt} ${item.step.english ?? ''} ${item.step.title}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  });
  return (
    <section className="mistakes-screen">
      <button className="text-button" onClick={onBack}>
        <Icon name="arrow" size={18} /> 복습함으로
      </button>
      <div className="mistakes-heading">
        <span className="mini-icon blue">
          <Icon name="book" size={28} />
        </span>
        <div>
          <span className="eyebrow">LITTLE STEPS, STRONGER MEMORY</span>
          <h1>오답노트</h1>
        </div>
      </div>
      <section className="panel mistakes-quiz-card" aria-label="오답 퀴즈">
        <h2>{mistakes.length ? `헷갈린 문제 ${mistakes.length}개` : '오답노트가 비었어요!'}</h2>
        <p>
          서로 다른 퀴즈에서 두 번 맞히면 목록에서 빠져요. 다시 틀리면 정답 횟수를 처음부터 세어요.
        </p>
        {mistakes.length > 0 || hasSession ? (
          <>
            <button className="primary wide" disabled={busy} onClick={onStart}>
              {hasSession ? '오답 퀴즈 이어하기' : '오답 퀴즈 시작'} <Icon name="arrow" />
            </button>
            <p className="gentle-note">
              전체 영역에서 한 번에 최대 10문제 · 추가 XP 없이 기억을 채워요.
            </p>
          </>
        ) : (
          <p className="gentle-note">새로 헷갈린 문제가 생기면 이곳에 바로 모아 둘게요.</p>
        )}
      </section>
      {mistakes.length > 0 && (
        <>
          <div className="mistakes-filters" role="group" aria-label="오답 영역">
            {categories.map((item) => (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setVisibleCount(20);
                }}
              >
                {item.title}{' '}
                {item.id === 'all'
                  ? mistakes.length
                  : mistakes.filter((m) => m.entityType === item.id).length}
              </button>
            ))}
          </div>
          <label className="mistakes-search">
            오답 검색
            <input
              type="search"
              value={query}
              placeholder="단어 또는 문제 내용"
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(20);
              }}
            />
          </label>
          <p className="muted" role="status">
            {filtered.length}개 · 최근에 헷갈린 문제부터
          </p>
          <div className="mistakes-list">
            {filtered.slice(0, visibleCount).map((item) => {
              const { step } = item;
              const word = item.entityType === 'vocab' ? findCourseWord(item.entityId) : undefined;
              const answer = step.choices
                ? step.choices[step.correctIndex!]
                : step.acceptedAnswers?.join(' / ');
              return (
                <article
                  className="panel mistake-item"
                  key={item.key}
                  data-testid="mistake-item"
                  data-mistake-key={item.key}
                  data-entity-id={item.entityId}
                  data-entity-type={item.entityType}
                >
                  <div className="mistake-item-top">
                    <span>{categories.find((c) => c.id === item.entityType)?.title}</span>
                    <strong aria-label={`해제까지 정답 ${item.correctCount} / 2회`}>
                      {item.correctCount} / 2회
                    </strong>
                  </div>
                  <h2 lang={word ? 'en' : undefined}>{word?.headword ?? step.title}</h2>
                  <p>{word ? word.koreanMeaning : step.prompt}</p>
                  <details>
                    <summary>문제와 정답 · 설명 보기</summary>
                    <p>{step.prompt}</p>
                    {step.english && <p lang="en">{step.english}</p>}
                    {step.passage && (
                      <p className="mistake-passage" lang="en">
                        {step.passage}
                      </p>
                    )}
                    <p>
                      <strong>정답</strong> {answer}
                    </p>
                    <p>{step.explanation}</p>
                    {step.evidenceQuote && <blockquote lang="en">{step.evidenceQuote}</blockquote>}
                  </details>
                </article>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="panel">조건에 맞는 오답이 없어요.</p>}
          {filtered.length > visibleCount && (
            <button
              className="secondary wide"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              20개 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}
