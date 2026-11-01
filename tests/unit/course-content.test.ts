import { describe, expect, it } from 'vitest';
import { getCourses } from '../../src/data/courses';
import { catalog } from '../../src/data/catalog';
import pdf from '../../content_src/wordbooks/suneung-2000.json';
import {
  buildCourseQuest,
  buildCourseRetests,
  buildReviewTest,
  courseSteps,
  meaningTokens,
  validCoursePlan,
  validCourseRetests,
} from '../../src/core/course-quest';
import { validateStep } from '../../src/core/quest-builder';
import { gradeAnswer } from '../../src/core/grading';
import type { LearningSession, PracticeAttempt } from '../../src/core/types';
import { learned } from './course-fixtures';

describe('bundled course content integration', () => {
  it('retains all original vocabulary IDs and PDF row order across 15 and 100 stages', () => {
    const courses = getCourses();
    expect(courses.map((course) => course.id)).toEqual(['advanced-300', 'suneung-2000']);
    expect(courses[0].vocabulary.map((word) => word.id)).toEqual(
      catalog.vocabulary.map((word) => word.id),
    );
    expect(courses[1].vocabulary.map((word) => word.sourceEntryId)).toEqual(
      pdf.entries.map((word) => word.id),
    );
    expect(courses[1].vocabulary.map((word) => word.sourceHeadword)).toEqual(
      pdf.entries.map((word) => word.headword),
    );
    expect(courses.map((course) => course.lessons.length)).toEqual([15, 100]);
  });

  it('produces canonical learner questions with one keyed answer and disjoint Korean choice senses', () => {
    for (const course of getCourses()) {
      const steps = courseSteps(course, 'learner');
      for (const step of steps) {
        expect(validateStep(step, 'learner'), step.id).toBe(true);
        if (step.choices) {
          expect(
            step.choices.filter((_, index) => gradeAnswer(step, String(index))),
            step.id,
          ).toHaveLength(1);
          if (step.mode === 'recognition') {
            const tokens = step.choices.flatMap(meaningTokens);
            expect(new Set(tokens).size, step.id).toBe(tokens.length);
          }
        }
        if (step.passage) expect(step.passage, step.id).toContain(step.evidenceQuote);
      }
    }
  });

  it('builds all 115 immutable lesson snapshots and a balanced test using their actual learned IDs', () => {
    for (const course of getCourses()) {
      const sessions: LearningSession[] = [];
      const options = {
        course,
        reviews: [],
        attempts: [],
        sessions,
        localDay: '2026-11-02',
        random: () => 0.37,
      };
      for (const lesson of course.lessons) {
        const plan = buildCourseQuest(options)!;
        expect(plan.planId).toBe(lesson.id);
        expect(plan.steps).toHaveLength(29);
        expect(
          plan.steps
            .slice(5, 25)
            .every((step) => step.phase === 'vocab' && step.kind === 'question'),
        ).toBe(true);
        expect(validCoursePlan(plan, options.localDay)).toBe(true);
        expect(plan.steps.every((step) => validateStep(step, 'learner'))).toBe(true);
        sessions.push({
          ...plan,
          sessionId: lesson.id,
          localDay: options.localDay,
          contentVersion: catalog.contentVersion,
          appMode: 'learner',
          status: 'completed',
          currentQuestionIndex: plan.steps.length,
          xpAwarded: 0,
          updatedAt: '2026-11-02T12:00:00.000Z',
          hintStepIds: [],
        });
      }
      expect(buildCourseQuest(options)).toBeNull();
      const review = buildReviewTest({
        ...options,
        reviews: course.vocabulary.slice(0, 10).map((word) => learned(word.id)),
      })!;
      expect(validCoursePlan(review, options.localDay)).toBe(true);
      expect(review.steps.filter((step) => step.alwaysHinted)).toHaveLength(5);
      expect(review.steps.every((step) => validateStep(step, 'learner'))).toBe(true);
    }
  });

  it('resolves a canonical one-time retest for all twenty words in every real lesson, while retaining old cards', () => {
    for (const course of getCourses()) {
      const completed: LearningSession[] = [];
      const registry = new Map(courseSteps(course).map((step) => [step.id, step]));
      for (const lesson of course.lessons) {
        const day = '2026-11-02';
        const plan = buildCourseQuest({
          course,
          reviews: [],
          attempts: [],
          sessions: completed,
          localDay: day,
          random: () => 0.3,
        })!;
        const base: LearningSession = {
          ...plan,
          sessionId: lesson.id,
          localDay: day,
          contentVersion: catalog.contentVersion,
          appMode: 'learner',
          status: 'in_progress',
          currentQuestionIndex: 28,
          xpAwarded: 0,
          updatedAt: `${day}T12:00:00.000Z`,
          hintStepIds: [],
        };
        const attempts: PracticeAttempt[] = base.steps
          .slice(5, 25)
          .map((step, index) => ({
            attemptId: `${lesson.id}:${index}`,
            sessionId: base.sessionId,
            questionId: step.id,
            entityId: step.entityId,
            entityType: 'vocab',
            mode: 'recognition',
            answer: String((step.correctIndex! + 1) % 4),
            isCorrect: false,
            firstTry: true,
            usedHint: false,
            responseMs: 100,
            completedAt: `${day}T12:00:${String(index).padStart(2, '0')}.000Z`,
            localDay: day,
          }));
        const tail = buildCourseRetests(base, attempts);
        expect(tail).toHaveLength(20);
        expect(tail.every((step) => validateStep(step, 'learner'))).toBe(true);
        const queued: LearningSession = {
          ...base,
          currentQuestionIndex: 29,
          retestQuestionIds: tail.map((step) => step.retestOf!),
          steps: [...base.steps, ...tail],
        };
        expect(validCoursePlan(queued, day)).toBe(true);
        expect(validCourseRetests(queued, attempts)).toBe(true);
        const oldSteps = [
          ...base.steps.slice(0, 5),
          ...base.steps
            .slice(5, 25)
            .flatMap((step) => [registry.get(`course:${course.id}:study:${step.entityId}`)!, step]),
          ...base.steps.slice(25),
        ];
        expect(validCoursePlan({ ...base, courseFlow: undefined, steps: oldSteps }, day)).toBe(
          true,
        );
        expect(oldSteps.every((step) => validateStep(step, 'learner'))).toBe(true);
        completed.push({
          ...queued,
          status: 'completed',
          currentQuestionIndex: queued.steps.length,
        });
      }
    }
  });
});
