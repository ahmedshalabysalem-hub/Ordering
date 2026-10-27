// Account lockout after repeated failed sign-ins (ADR-009).

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export type LockState = { failedLoginCount: number; lockedUntil: Date | null };

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** State after one more failed attempt. An expired lock starts a fresh count. */
export function afterFailedAttempt(state: LockState, now: Date): LockState {
  const base = state.lockedUntil && !isLocked(state, now) ? 0 : state.failedLoginCount;
  const failedLoginCount = base + 1;
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    return { failedLoginCount, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) };
  }
  return { failedLoginCount, lockedUntil: state.lockedUntil && isLocked(state, now) ? state.lockedUntil : null };
}
