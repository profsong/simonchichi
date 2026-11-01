import type { CourseId } from '../core/types';
import { getCourses } from '../data/courses';
import { Icon } from './Icon';

export function WordbookSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: CourseId;
  onChange: (value: CourseId) => void;
  disabled?: boolean;
}) {
  return (
    <label className="course-picker">
      <span>
        <Icon name="book" size={22} /> 학습 단어장
      </span>
      <select
        aria-label="학습 단어장"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as CourseId)}
      >
        {getCourses().map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </select>
      <small>선택한 단어장으로 오늘의 탐험과 모험 지도를 이어가요.</small>
    </label>
  );
}
