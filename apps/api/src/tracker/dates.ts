const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day of `date` as 'YYYY-MM-DD'. Never depends on the machine timezone. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC day `days` after `date` (negative goes back). */
export function utcDayOffset(date: Date, days: number): string {
  return utcDay(new Date(date.getTime() + days * DAY_MS));
}

/** Instant `days` before `date`; fractional days are allowed. */
export function daysAgo(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS);
}
