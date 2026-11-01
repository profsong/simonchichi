import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const windows = process.platform === 'win32';
const cacheJdk = join(homedir(), '.cache', 'simonchichi-android', 'jdk');
const candidates = [
  process.env.JAVA_HOME,
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'Android', 'Android Studio', 'jbr'),
  ...(existsSync(cacheJdk)
    ? readdirSync(cacheJdk)
        .sort()
        .reverse()
        .map((name) => join(cacheJdk, name))
    : []),
].filter(Boolean);
const javaHome = candidates.find((folder) =>
  existsSync(join(folder, 'bin', windows ? 'java.exe' : 'java')),
);
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (windows && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
    : join(homedir(), 'Android', 'Sdk'));
if (!javaHome || !existsSync(join(sdk, 'platforms', 'android-36'))) {
  throw new Error(
    'Java 21 이상(JAVA_HOME), Android SDK 36(ANDROID_HOME), build-tools 36.0.0을 먼저 설치해 주세요. docs/ANDROID_INSTALL.md 참고.',
  );
}
const java = join(javaHome, 'bin', windows ? 'java.exe' : 'java');
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 종료 코드: ${result.status}`);
}
// local.properties is intentionally ignored; absolute SDK paths never enter the APK.
writeFileSync(
  join(android, 'local.properties'),
  `sdk.dir=${sdk.replaceAll('\\', '/').replaceAll(':', '\\:')}\n`,
);
run(process.execPath, [
  join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  'scripts/validate-content.ts',
]);
run(process.execPath, [
  join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  'scripts/sync-wordbooks.ts',
  '--check',
]);
run(process.execPath, [
  join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  'scripts/validate-courses.ts',
]);
run(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit']);
run(process.execPath, [
  join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
  '--mode',
  'android-demo',
  '--outDir',
  'dist-android',
]);
run(process.execPath, [
  join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
  'sync',
  'android',
]);
run(
  java,
  [
    '-classpath',
    join(android, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    'org.gradle.wrapper.GradleWrapperMain',
    '--console=plain',
    'assembleDebug',
    ':app:testDebugUnitTest',
  ],
  android,
);
const output = join(root, 'artifacts', 'android');
mkdirSync(output, { recursive: true });
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const filename = `simonchichi-${version}.apk`;
const target = join(output, filename);
copyFileSync(join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'), target);
const hash = createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(`${target}.sha256`, `${hash}  ${filename}\n`);
process.stdout.write(
  `\nAPK: ${target}\nSHA-256: ${hash}\n개인 체험용 디버그 서명 APK입니다. 배포 스토어용 릴리스가 아닙니다.\n`,
);
