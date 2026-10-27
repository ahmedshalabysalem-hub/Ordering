import { describe, expect, it } from "vitest";
import { afterFailedAttempt, isLocked, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/server/auth/lockout";

const now = new Date("2026-10-27T12:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe("account lockout", () => {
  it("counts failures without locking below the limit", () => {
    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      state = afterFailedAttempt(state, now);
      expect(state).toEqual({ failedLoginCount: i, lockedUntil: null });
    }
  });

  it(`locks for ${LOCKOUT_MINUTES} minutes on the ${MAX_FAILED_ATTEMPTS}th failure`, () => {
    const state = afterFailedAttempt({ failedLoginCount: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null }, now);
    expect(state.lockedUntil).toEqual(minutes(LOCKOUT_MINUTES));
    expect(isLocked(state, now)).toBe(true);
    expect(isLocked(state, minutes(LOCKOUT_MINUTES))).toBe(false);
  });

  it("starts a fresh count after a lock expires", () => {
    const expired = { failedLoginCount: MAX_FAILED_ATTEMPTS, lockedUntil: minutes(-1) };
    expect(isLocked(expired, now)).toBe(false);
    expect(afterFailedAttempt(expired, now)).toEqual({ failedLoginCount: 1, lockedUntil: null });
  });

  it("does not shorten an active lock", () => {
    const locked = { failedLoginCount: MAX_FAILED_ATTEMPTS, lockedUntil: minutes(10) };
    expect(afterFailedAttempt(locked, now).lockedUntil).toEqual(minutes(LOCKOUT_MINUTES));
  });
});
