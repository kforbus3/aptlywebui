// Timezone-aware date formatting shared across the app.
//
// Two hazards this handles:
//  1. Backend timestamps (SQLite) serialize without a timezone suffix, e.g.
//     "2026-07-25T03:04:09". `new Date()` would read those as *local* time and
//     shift them. They are always UTC, so we append "Z" when no zone is present.
//  2. Display must use the admin-configured timezone, not the browser's — so
//     callers pass the configured IANA zone (see lib/settings).

// aptly returns this sentinel for a mirror that has never been downloaded.
const NEVER_PREFIX = "0001-01-01";

export function isNeverDate(value?: string | null): boolean {
  return !value || value.startsWith(NEVER_PREFIX);
}

// Parse a backend/aptly timestamp into a Date, treating zone-less values as UTC.
function toDate(value: string): Date | null {
  let s = value.trim();
  // Has an explicit zone (Z or ±HH:MM) or is an RFC-2822 string? leave it.
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) || /\d{4} \d{2}:\d{2}:\d{2}/.test(s);
  if (!hasZone && /^\d{4}-\d{2}-\d{2}T/.test(s)) s = s + "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Format a timestamp in the given IANA timezone (browser-local if omitted).
export function formatDateTime(value?: string | null, tz?: string): string {
  if (isNeverDate(value)) return "Never";
  const d = toDate(value as string);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    timeZone: tz || undefined,
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
