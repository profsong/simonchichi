import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppMode } from '../core/types';

const modePreferenceKey = 'simonchichi.content-mode';

class PreferenceReadTimeout extends Error {
  constructor() {
    super('앱 설정 응답을 기다리는 시간이 지났어요.');
    this.name = 'PreferenceReadTimeout';
  }
}

async function readPreference<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PreferenceReadTimeout()), 2000);
      });
      // A missing native callback cannot be cancelled. Race keeps its rejection
      // handled and prevents a late response from replacing a later successful read.
      return await Promise.race([read(), timeout]);
    } catch (error) {
      if (!(error instanceof PreferenceReadTimeout) || attempt === 2) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PreferenceReadTimeout();
}

interface BackupFilesPlugin {
  save(options: { filename: string; json: string }): Promise<{ cancelled?: boolean }>;
}
let backupFiles: BackupFilesPlugin | undefined;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function webAppMode(demoEnabled: boolean, search = location.search): AppMode {
  return demoEnabled && new URLSearchParams(search).get('demo') === '1' ? 'demo' : 'learner';
}

export async function loadAppMode(demoEnabled: boolean): Promise<AppMode> {
  if (!demoEnabled) return 'learner';
  if (!isNativeApp()) return webAppMode(demoEnabled);
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await readPreference(() => Preferences.get({ key: modePreferenceKey }));
  // A native first launch remains in learner mode until an explicit opt-in.
  return value === 'demo' ? 'demo' : 'learner';
}

export async function saveAppMode(next: AppMode, demoEnabled: boolean): Promise<AppMode> {
  const mode = demoEnabled ? next : 'learner';
  if (isNativeApp()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: modePreferenceKey, value: mode });
  } else {
    const url = new URL(location.href);
    if (mode === 'demo') url.searchParams.set('demo', '1');
    else url.searchParams.delete('demo');
    history.replaceState(null, '', url);
  }
  return mode;
}

export async function saveNativeBackup(
  filename: string,
  json: string,
): Promise<{ cancelled?: boolean }> {
  if (!isNativeApp()) throw new Error('앱에서 백업 저장을 열어 주세요.');
  backupFiles ??= registerPlugin<BackupFilesPlugin>('BackupFiles');
  return backupFiles.save({ filename, json });
}
