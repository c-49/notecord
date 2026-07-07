import { DateTime } from 'luxon'

/**
 * Formats a note timestamp Discord-style:
 *   - Today    → "Today at 3:45 PM"
 *   - Yesterday → "Yesterday at 3:45 PM"
 *   - Older    → "Jan 4, 2026"
 */
export function formatNoteTimestamp(isoString) {
  const dt = DateTime.fromISO(isoString)
  const now = DateTime.now()

  if (dt.hasSame(now, 'day')) {
    return `Today at ${dt.toFormat('h:mm a')}`
  }
  if (dt.hasSame(now.minus({ days: 1 }), 'day')) {
    return `Yesterday at ${dt.toFormat('h:mm a')}`
  }
  return dt.toFormat('LLL d, yyyy')
}

/**
 * Returns the date label used to group notes into day buckets
 * within the feed (e.g., "Today", "Yesterday", "January 4, 2026").
 */
export function formatDayDivider(isoString) {
  const dt = DateTime.fromISO(isoString)
  const now = DateTime.now()

  if (dt.hasSame(now, 'day')) return 'Today'
  if (dt.hasSame(now.minus({ days: 1 }), 'day')) return 'Yesterday'
  return dt.toFormat('LLLL d, yyyy')
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for groupBy key.
 */
export function getDayKey(isoString) {
  return DateTime.fromISO(isoString).toISODate()
}

/**
 * Converts an <input type="date"> value (YYYY-MM-DD, the user's local
 * calendar day) into half-open [startIso, endIso) UTC bounds. Always
 * normalized to UTC 'Z' form (not .toISO()'s local-offset default) so the
 * exact same strings are safe both as Directus filter values and for direct
 * string/epoch comparison in the offline search matcher.
 */
export function dayBoundsToIso(dateStr) {
  const start = DateTime.fromISO(dateStr, { zone: 'local' }).startOf('day').toUTC()
  const end = start.plus({ days: 1 })
  return { startIso: start.toISO(), endIso: end.toISO() }
}
