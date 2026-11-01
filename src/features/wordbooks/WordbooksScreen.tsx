import type { RoomSelection } from '../../core/room-catalog';
import { useMemo, useState } from 'react';
import type { AppMode } from '../../core/types';
import { Icon } from '../../components/Icon';
import { MascotMark, type AvatarId } from '../../components/Mascot';
import { getWordbooks, getWordbookWords } from '../../data/wordbooks';

const PAGE_SIZE = 50;

export function WordbooksScreen({
  mode,
  avatar,
  wardrobe,
  initialBookId,
}: {
  mode: AppMode;
  avatar: AvatarId;
  wardrobe?: RoomSelection;
  onSettings?: () => void;
  initialBookId?: string;
}) {
  const [bookId, setBookId] = useState<string | undefined>(initialBookId);
  const [query, setQuery] = useState('');
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);
  const [day, setDay] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const books = useMemo(() => getWordbooks(mode), [mode]);
  const book = books.find((item) => item.id === bookId);
  const original = useMemo(
    () => (bookId ? getWordbookWords(bookId, mode, { view: 'all' }) : []),
    [bookId, mode],
  );
  const matching = useMemo(
    () =>
      bookId
        ? getWordbookWords(bookId, mode, {
            query,
            view: excludeDuplicates ? 'new' : 'all',
            ...(day === 'all' ? {} : { day: Number(day) }),
          })
        : [],
    [bookId, mode, query, excludeDuplicates, day],
  );
  const words = matching;
  const days = [
    ...new Set(
      original
        .flatMap((word) => word.annotations.map((entry) => entry.source.day))
        .filter((value): value is number => value !== undefined),
    ),
  ].sort((a, b) => a - b);
  function openBook(next?: string) {
    setBookId(next);
    setQuery('');
    setExcludeDuplicates(true);
    setDay('all');
    setVisibleCount(PAGE_SIZE);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (!book)
    return (
      <section className="wordbooks-screen">
        <div className="section-top">
          <div>
            <span className="eyebrow">MY WORD COLLECTION</span>
            <h1>단어장</h1>
            <p>새로운 단어도, 내가 만난 단어도.</p>
          </div>
          <span className="wordbooks-friend">
            <MascotMark variant={avatar} wardrobe={wardrobe} size={58} />
          </span>
        </div>
        <div className="wordbook-library-summary">
          <div>
            <strong>
              {books.length}
              <small>권</small>
            </strong>
            <span>나의 단어장</span>
          </div>
          <div>
            <strong>
              {books.reduce((sum, item) => sum + item.newCount, 0).toLocaleString()}
              <small>개</small>
            </strong>
            <span>중복을 뺀 단어</span>
          </div>
        </div>
        <div className="wordbook-cards">
          {books.map((item, index) => (
            <button
              className={`wordbook-card wordbook-color-${index % 4}`}
              key={item.id}
              data-testid="wordbook-card"
              data-book-id={item.id}
              onClick={() => openBook(item.id)}
              aria-label={item.title}
            >
              <span className="wordbook-cover">
                <Icon name="book" size={28} />
                <small>
                  {item.source.kind === 'curriculum'
                    ? '300'
                    : item.source.kind === 'pdf'
                      ? '2000'
                      : item.source.kind.toUpperCase()}
                </small>
              </span>
              <span className="wordbook-card-copy">
                <strong>{item.title}</strong>
                <span>새 단어 {item.newCount.toLocaleString()}개</span>
                <small>
                  원본 {item.originalCount.toLocaleString()}개
                  {item.overlapCount ? ` · 기존 중복 ${item.overlapCount}개 연결` : ' · 중복 없음'}
                </small>
              </span>
              <Icon name="arrow" size={19} />
            </button>
          ))}
        </div>
        <aside className="wordbook-note">
          <Icon name="leaf" size={22} />
          <p>
            같은 단어는 하나로 모아요. 새 단어장에서는 이미 있는 단어를 기본으로 제외하고, 원래
            출처와 뜻은 함께 보관해요.
          </p>
        </aside>
      </section>
    );

  return (
    <section className="wordbooks-screen wordbook-detail" data-book-id={book.id}>
      <button className="text-button wordbook-back" onClick={() => openBook()}>
        <Icon name="arrow" size={18} />
        단어장 목록으로
      </button>
      <div className="section-top">
        <div>
          <span className="eyebrow">MY WORD COLLECTION</span>
          <h1>{book.title}</h1>
          <p>
            {book.sourceMissingMeaningCount > 0 && book.missingMeaningCount === 0
              ? '원문의 영어 단어에 사전 자료로 찾은 한글 대표 뜻을 더했어요.'
              : book.descriptionKo}
          </p>
        </div>
      </div>
      <div className="wordbook-detail-counts">
        <span>
          <strong>{book.originalCount.toLocaleString()}</strong> 원본
        </span>
        <span>
          <strong>{book.newCount.toLocaleString()}</strong> 새 단어
        </span>
        <span>
          <strong>{book.overlapCount.toLocaleString()}</strong> 기존 중복
        </span>
      </div>
      {book.missingMeaningCount > 0 && (
        <p className="wordbook-source-note">
          <Icon name="book" size={20} />
          원문에 한글 뜻이 없는 단어는 ‘뜻 미제공’으로 표시해요. 이미 있는 단어는 기존 단어장의 뜻을
          함께 볼 수 있어요.
        </p>
      )}
      {book.sourceMissingMeaningCount > 0 && book.missingMeaningCount === 0 && (
        <p className="wordbook-source-note" data-testid="definitions-enriched">
          <Icon name="book" size={20} />
          PDF 원문 뜻 칸은 비어 있어요. 아래 한글 뜻은 별도 사전 자료와 영문 정의를 확인해 보강한
          대표 뜻이며, 각 단어에서 출처를 볼 수 있어요.
        </p>
      )}
      <div className="wordbook-filters">
        <label className="wordbook-search">
          <span>단어 또는 뜻 검색</span>
          <input
            type="search"
            value={query}
            placeholder="영단어나 한글 뜻을 찾아봐요"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </label>
        <label className="wordbook-dedupe">
          <input
            type="checkbox"
            checked={excludeDuplicates}
            onChange={(event) => {
              setExcludeDuplicates(event.target.checked);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          <span>중복 단어 제외</span>
        </label>
        {book.source.kind === 'pdf' && days.length > 0 && (
          <label className="wordbook-day">
            <span>원문 DAY</span>
            <select
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="all">전체 DAY</option>
              {days.map((value) => (
                <option key={value} value={value}>
                  DAY {value}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="wordbook-result-count" role="status">
        {words.length.toLocaleString()}개
        {query.trim()
          ? ' 검색 결과'
          : excludeDuplicates
            ? ' · 중복 제외 목록'
            : ' · 원본 단어 목록'}
      </p>
      {words.length > 0 ? (
        <>
          <ol className="wordbook-entries">
            {words.slice(0, visibleCount).map((word) => (
              <li
                className="wordbook-entry"
                key={word.id}
                data-testid="wordbook-entry"
                data-word-id={word.id}
                data-overlap={word.isOverlap}
              >
                <div className="wordbook-entry-top">
                  <h2 lang="en">{word.headword}</h2>
                  {word.isOverlap && (
                    <span className="wordbook-linked">
                      <Icon name="check" size={13} />
                      기존 단어장과 연결
                    </span>
                  )}
                </div>
                {word.partOfSpeech && <small className="wordbook-pos">{word.partOfSpeech}</small>}
                {[
                  ...new Set(
                    (word.definitionProvenance ?? [])
                      .filter(
                        (source) =>
                          source.lookupHeadword &&
                          source.lookupHeadword.toLowerCase() !== word.headword.toLowerCase(),
                      )
                      .map((source) => source.lookupHeadword!),
                  ),
                ].map((spelling) => (
                  <p className="wordbook-caution" key={spelling}>
                    {word.annotations.some((entry) =>
                      entry.uncertainties?.some((flag) => flag.includes('spelling')),
                    )
                      ? '원문 표기 확인'
                      : '사전 조회 표제어'}
                    : <span lang="en">{word.headword}</span> → <strong lang="en">{spelling}</strong>
                    . 원문을 보존하고 사전의 표제어로 뜻을 찾았어요.
                  </p>
                ))}
                {word.annotations.some((entry) =>
                  entry.uncertainties?.some((flag) => flag.includes('offensive')),
                ) && (
                  <p className="wordbook-caution">
                    용법 주의: 사람을 부르는 표현으로 쓰면 낡고 모욕적으로 받아들여져요.
                  </p>
                )}
                {word.annotations.some((item) => item.koreanMeaning.trim()) ? (
                  [
                    ...new Map(
                      word.annotations
                        .filter((item) => item.koreanMeaning.trim())
                        .map((item) => [`${item.partOfSpeech ?? ''}:${item.koreanMeaning}`, item]),
                    ).values(),
                  ].map((item) => (
                    <p
                      className="wordbook-meaning"
                      key={`${item.partOfSpeech ?? ''}:${item.koreanMeaning}`}
                    >
                      {item.partOfSpeech && item.partOfSpeech !== word.partOfSpeech
                        ? `${item.partOfSpeech} · `
                        : ''}
                      {item.koreanMeaning}
                    </p>
                  ))
                ) : (
                  <p className={!word.existingMeaning ? 'wordbook-meaning-missing' : ''}>
                    {word.existingMeaning?.koreanMeaning || '뜻 미제공'}
                  </p>
                )}
                {!word.koreanMeaning && word.existingMeaning && (
                  <small className="wordbook-existing-meaning">
                    {books.find((item) => item.id === word.existingMeaning?.bookId)?.title ??
                      '기존 단어장'}
                    의 뜻 · PDF 원문 뜻과 구분해요
                  </small>
                )}
                {word.source.page && (
                  <small className="wordbook-provenance">
                    {word.source.day ? `DAY ${word.source.day} · ` : ''}
                    {word.source.row}번 · PDF {word.source.page}쪽
                  </small>
                )}
                {word.annotations.length > 1 && (
                  <small className="wordbook-provenance">
                    원본 {word.annotations.length}개 항목의 뜻과 출처를 함께 보관해요
                  </small>
                )}
                {word.annotations.some((entry) => entry.definitionProvenance?.length) && (
                  <details className="wordbook-definition-sources" data-testid="definition-sources">
                    <summary>뜻 출처</summary>
                    <p>
                      PDF 원문에 없던 뜻을 별도로 보강했어요. 문맥에 따라 뜻이 달라질 수 있어요.
                    </p>
                    <ul>
                      {[
                        ...new Map(
                          word.annotations
                            .flatMap((entry) => entry.definitionProvenance ?? [])
                            .map((source) => [
                              `${source.sourceId}:${source.url}:${source.method}`,
                              source,
                            ]),
                        ).values(),
                      ].map((source, index) => (
                        <li key={`${source.sourceId}:${index}`}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.sourceId.startsWith('kowiktionary')
                              ? '한국어 위키낱말사전'
                              : source.sourceId.includes('wordnet')
                                ? 'Princeton WordNet'
                                : source.sourceId.includes('wiktionary') ||
                                    source.sourceId.includes('en-ko')
                                  ? '영어 Wiktionary'
                                  : source.sourceId}
                            <span aria-hidden="true"> ↗</span>
                          </a>
                          <small>
                            {source.method === 'definition-based-editorial-translation'
                              ? '영문 정의를 확인해 한국어로 풀이'
                              : '공개 사전의 대표 뜻을 선택·정리'}{' '}
                            · {source.license}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {words.length > visibleCount && (
            <button
              className="secondary wide wordbook-more"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              더 보기
            </button>
          )}
          <p className="wordbook-result-count">
            {Math.min(visibleCount, words.length).toLocaleString()} /{' '}
            {words.length.toLocaleString()}개 표시
          </p>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-book">
            <Icon name="book" size={36} />
          </span>
          <h2>표시할 단어가 없어요</h2>
          <p>
            검색어나 원문 DAY를 바꿔 보세요. 중복 단어 제외를 해제하면 이미 있는 단어도 볼 수
            있어요.
          </p>
        </div>
      )}
      {book.source.filename && (
        <p className="wordbook-source-file">출처 · {book.source.filename}</p>
      )}
      {book.sourceMissingMeaningCount > book.missingMeaningCount && (
        <p className="wordbook-source-file">
          보강한 뜻은 Wiktionary·WordNet 자료를 바탕으로 정리했어요.{' '}
          <a
            className="source-license-link"
            href={`${import.meta.env.BASE_URL}licenses/DICTIONARY-ATTRIBUTION.txt`}
            target="_blank"
            rel="noreferrer"
          >
            저작자와 이용 조건 보기
          </a>
        </p>
      )}
    </section>
  );
}
