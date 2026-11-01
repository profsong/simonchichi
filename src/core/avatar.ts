import type { Settings } from './types';

export type CompanionId = 'monchichi' | 'sichiware' | 'sipompurin';

/** Keep older backups usable without rewriting their learning records. */
export function resolveAvatar(id?: Settings['avatarId'] | CompanionId): CompanionId {
  if (id === 'momo' || id === 'sichiware') return 'sichiware';
  if (id === 'nova' || id === 'sipompurin') return 'sipompurin';
  return 'monchichi';
}
