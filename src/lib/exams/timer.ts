import type { AttemptDocument } from "@/types/domain";

export function effectiveActiveMs(
  attempt: AttemptDocument,
  now = new Date(),
): number {
  const currentSpan =
    attempt.status === "active" && attempt.activeStartedAt
      ? Math.max(0, now.getTime() - attempt.activeStartedAt.getTime())
      : 0;
  return attempt.activeElapsedMs + currentSpan;
}

export function effectivePausedMs(
  attempt: AttemptDocument,
  now = new Date(),
): number {
  const currentPause =
    attempt.status === "paused" && attempt.pausedAt
      ? Math.max(0, now.getTime() - attempt.pausedAt.getTime())
      : 0;
  return attempt.pausedElapsedMs + currentPause;
}

export function remainingMs(
  attempt: AttemptDocument,
  durationMs: number,
  now = new Date(),
): number {
  return Math.max(0, durationMs - effectiveActiveMs(attempt, now));
}

export function hasExpired(
  attempt: AttemptDocument,
  durationMs: number,
  now = new Date(),
): boolean {
  return (
    attempt.status === "active" &&
    (remainingMs(attempt, durationMs, now) <= 0 ||
      (!!attempt.deadlineAt && attempt.deadlineAt <= now))
  );
}
