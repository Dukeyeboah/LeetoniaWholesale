/** Parse `YYYY-MM-DD` in local calendar (avoid UTC shift). */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Inclusive calendar days between two YYYY-MM-DD strings. */
export function leaveDaysInclusive(startYmd: string, endYmd: string): number {
  const a = parseLocalYmd(startYmd);
  const b = parseLocalYmd(endYmd);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const lo = a <= b ? a : b;
  const hi = a <= b ? b : a;
  const ms = hi.getTime() - lo.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/** Days of leave overlapping a calendar year (inclusive). */
export function leaveDaysOverlappingYear(
  startYmd: string,
  endYmd: string,
  year: number
): number {
  const a = parseLocalYmd(startYmd);
  const b = parseLocalYmd(endYmd);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const lo = a <= b ? a : b;
  const hi = a <= b ? b : a;
  const yStart = new Date(year, 0, 1);
  const yEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  if (hi < yStart || lo > yEnd) return 0;
  const clipLo = lo < yStart ? yStart : lo;
  const clipHi = hi > yEnd ? yEnd : hi;
  return leaveDaysInclusive(toYmd(clipLo), toYmd(clipHi));
}

export function totalLeaveDaysInYear(
  periods: { startDate: string; endDate: string }[],
  year: number
): number {
  return periods.reduce(
    (sum, p) => sum + leaveDaysOverlappingYear(p.startDate, p.endDate, year),
    0
  );
}
