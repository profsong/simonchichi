import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { courseDocumentSchema } from '../src/data/course-schema';

const directory = resolve('src/data/courses');
const courses = readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .map((name) =>
    courseDocumentSchema.parse(JSON.parse(readFileSync(resolve(directory, name), 'utf8'))),
  );
if (courses.length !== 2 || new Set(courses.map((course) => course.id)).size !== 2)
  throw new Error('두 단어장 과정이 모두 필요합니다.');
for (const course of courses) {
  const words = new Map(course.vocabulary.map((word) => [word.id, word]));
  for (const lesson of course.lessons) {
    const targets = new Set(
      [...lesson.syntax, ...lesson.readings].flatMap((item) => item.targetWordIds),
    );
    if (targets.size < 6) throw new Error(`${lesson.id}: 회차 어휘 연결이 부족합니다.`);
    for (const id of targets) if (!words.has(id)) throw new Error(`알 수 없는 표제어: ${id}`);
    for (const reading of lesson.readings) {
      const count = reading.passageEn.split(/\s+/).length;
      if (count < 50 || count > 300) throw new Error(`${reading.id}: 독해 길이를 확인해 주세요.`);
    }
  }
  console.info(
    `${course.title}: ${course.vocabulary.length}단어 / ${course.lessons.length}회 / 구문 ${course.lessons.length * 2}개 / 독해 ${course.lessons.length * 2}개`,
  );
}
console.info('단어장 과정 구조·분량·참조·독해 근거 검사 통과');
