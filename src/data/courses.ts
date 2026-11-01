import { courseDocumentSchema } from './course-schema';
import type { CourseId } from '../core/types';
export type { CourseDocument, CourseLesson, CourseWord } from './course-schema';

const sources = import.meta.glob('./courses/*.json', { eager: true, import: 'default' });
const courses = Object.values(sources).map((source) => courseDocumentSchema.parse(source));

export function getCourses() {
  return [...courses].sort((a, b) => (a.id === b.id ? 0 : a.id === 'advanced-300' ? -1 : 1));
}
export function getCourse(id: CourseId) {
  const course = courses.find((item) => item.id === id);
  if (!course) throw new Error('단어장 자료를 확인해 주세요.');
  return course;
}
export function getCourseForPlan(planId: string) {
  return courses.find((course) => course.lessons.some((lesson) => lesson.id === planId));
}
export function findCourseWord(id: string) {
  return courses.flatMap((course) => course.vocabulary).find((word) => word.id === id);
}
