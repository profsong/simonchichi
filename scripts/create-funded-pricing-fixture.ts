// Test-only synthetic learning, using the same canonical grading/storage APIs as the app.
// Does not inject XP or touch a browser/device database. Run: npx tsx scripts/create-funded-pricing-fixture.ts
import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { LearningSession } from '../src/core/types';
import { createServer } from 'vite';

// The real course catalogue uses Vite's import.meta.glob. Load its normal
// transformed modules without creating a web listener, then close the loader.
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});
const {
  advanceSession,
  exportBackup,
  importBackup,
  QuestDatabase,
  startOrResumeSession,
  submitAnswer,
} = (await loader.ssrLoadModule('/src/data/db.ts')) as typeof import('../src/data/db');
const { buildReviewTest } = (await loader.ssrLoadModule(
  '/src/core/course-quest.ts',
)) as typeof import('../src/core/course-quest');
const { getCourse } = (await loader.ssrLoadModule(
  '/src/data/courses.ts',
)) as typeof import('../src/data/courses');
await loader.close();

const actualDate = Date;
const fixed = Date.parse('2026-11-02T03:00:00.000Z');
globalThis.Date = new Proxy(actualDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [fixed]);
  },
  apply() {
    return new actualDate(fixed).toString();
  },
  get(target, property) {
    return property === 'now' ? () => fixed : Reflect.get(target, property);
  },
});
const db = new QuestDatabase('learner', 'synthetic-pricing-fixture-memory-only');
const source = new URL('../tests/e2e/fixtures/legacy-v5-native-0.8.json', import.meta.url);
const output = new URL('../tests/e2e/fixtures/funded-v6-pricing-test.json', import.meta.url);
const reportPath = new URL('../artifacts/pricing/funded-fixture-generation.json', import.meta.url);
const version = '1.0.0-12week-draft';
let rounds = 0;
try {
  await importBackup(db, await readFile(source, 'utf8'), version);
  const course = getCourse('suneung-2000');
  const day = '2026-11-02';
  const balance = async () =>
    (await db.rewards.toArray()).reduce((sum, row) => sum + row.xp, 0) -
    (await db.purchases.toArray()).reduce((sum, row) => sum + row.price, 0);
  let previous: LearningSession | undefined;
  while ((await balance()) < 30_000) {
    const plan = buildReviewTest({
      course,
      reviews: await db.reviews.toArray(),
      attempts: await db.attempts.toArray(),
      sessions: await db.sessions.toArray(),
      localDay: day,
      random: () => 0.25,
    })!;
    let session = await startOrResumeSession(
      db,
      plan,
      day,
      version,
      previous ? { continueFromSessionId: previous.sessionId } : undefined,
    );
    while (session.status === 'in_progress') {
      const step = session.steps[session.currentQuestionIndex];
      await submitAnswer(
        db,
        session.sessionId,
        step.choices ? String(step.correctIndex) : step.acceptedAnswers![0],
        1000,
      );
      session = await advanceSession(db, session.sessionId, step.id);
    }
    previous = session;
    rounds++;
    if (rounds % 100 === 0) console.log(`Generated ${rounds} canonical review rounds`);
  }
  const exported = await exportBackup(db, version);
  // Validation includes replaying grading, rewards, SRS, prices, and ownership.
  await importBackup(db, exported, version);
  await writeFile(output, exported, 'utf8');
  await mkdir(new URL('../artifacts/pricing/', import.meta.url), { recursive: true });
  const result = {
    status: 'passed',
    synthetic: true,
    source: source.pathname,
    output: output.pathname,
    method:
      'Imported unchanged actual 0.8 baseline, then canonical buildReviewTest/startOrResumeSession/submitAnswer/advanceSession calls only; no injected XP.',
    fixedClock: new Date().toISOString(),
    newReviewRounds: rounds,
    schemaVersion: 6,
    balanceXp: await balance(),
    sessions: await db.sessions.count(),
    attempts: await db.attempts.count(),
    purchases: await db.purchases.count(),
  };
  await writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result));
} finally {
  await db.delete();
  globalThis.Date = actualDate;
}
