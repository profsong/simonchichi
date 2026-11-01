import type { CourseDocument } from '../../data/course-schema';
import { Icon } from '../../components/Icon';
export function WorldMap({
  course,
  completedIds,
  onStart,
}: {
  course: CourseDocument;
  completedIds: string[];
  onStart: () => void;
}) {
  const next = course.lessons.find((lesson) => !completedIds.includes(lesson.id));
  const groups = Array.from({ length: Math.ceil(course.lessons.length / 5) }, (_, index) =>
    course.lessons.slice(index * 5, index * 5 + 5),
  );
  return (
    <section className="world-screen">
      <div className="section-top">
        <div>
          <span className="eyebrow">YOUR WORD ADVENTURE</span>
          <h1>모험 지도</h1>
          <p>{course.title}과 함께하는 나만의 여정</p>
        </div>
        <span className="section-emblem">
          <Icon name="map" size={28} />
        </span>
      </div>
      <div className="map-summary" data-testid="course-summary" data-course-id={course.id}>
        <span className="map-summary-icon">
          <Icon name="flag" size={33} />
        </span>
        <div>
          <strong>{course.title}</strong>
          <p>
            {course.vocabulary.length.toLocaleString()}단어 · {course.lessons.length}회 · 회당
            20단어
          </p>
          <small>
            {completedIds.length} / {course.lessons.length}회 완료
          </small>
        </div>
      </div>
      <p className="course-explanation">
        기억 채우기 5단어 → 단어 뜻 테스트 20개 → 문장 해독 2개 → 독해 미션 2개 → 오답만 다시 도전.
        오늘과 설정에서 단어장을 바꾸면 이 지도도 함께 바뀌어요.
      </p>
      <div className="chapter-list">
        {groups.map((lessons, index) => {
          const count = lessons.filter((lesson) => completedIds.includes(lesson.id)).length;
          const current = next
            ? lessons.some((lesson) => lesson.id === next.id)
            : index === groups.length - 1;
          return (
            <details
              className={`chapter-card ${current ? 'chapter-current' : ''}`}
              key={`${course.id}:${index}`}
              open={current}
            >
              <summary>
                <span className="chapter-number">
                  {count === lessons.length ? (
                    <Icon name="check" size={22} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <div>
                  <small>CHAPTER {index + 1}</small>
                  <h2>
                    {lessons[0].number}–{lessons.at(-1)!.number}회 탐험
                  </h2>
                  <p>
                    {count} / {lessons.length}회 완료
                  </p>
                </div>
                <Icon name="arrow" size={19} />
              </summary>
              <div className="chapter-details">
                <div className="course-map-lessons">
                  {lessons.map((lesson) => (
                    <div
                      className={`course-map-lesson ${completedIds.includes(lesson.id) ? 'done' : ''}`}
                      key={lesson.id}
                      data-testid="map-plan"
                      data-plan-id={lesson.id}
                      data-completed={completedIds.includes(lesson.id)}
                    >
                      <span className="mini-icon blue">
                        <Icon
                          name={completedIds.includes(lesson.id) ? 'check' : 'star'}
                          size={21}
                        />
                      </span>
                      <div>
                        <strong>{lesson.title}</strong>
                        <small>
                          {lesson.wordIds
                            .slice(0, 3)
                            .map((id) => course.vocabulary.find((word) => word.id === id)?.headword)
                            .join(' · ')}{' '}
                          외 17단어
                        </small>
                      </div>
                      <span className="sr-only">
                        {completedIds.includes(lesson.id) ? '완료' : '아직 완료하지 않음'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
      <p className="gentle-note">
        단어장마다 진도를 따로 간직해요. 겹치는 단어의 기억과 복습 이력은 함께 이어가요.
      </p>
      <button className="primary wide" onClick={onStart}>
        오늘의 탐험으로 <Icon name="arrow" />
      </button>
    </section>
  );
}
