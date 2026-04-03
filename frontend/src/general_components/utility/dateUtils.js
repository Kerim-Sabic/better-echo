/**
 * Formats a date/time value into a readable string using the `en-US` locale.
 *
 * Accepts either a JavaScript `Date` instance or any value parseable by `new Date(...)`.
 * Returns `"N/A"` for empty or invalid values.
 *
 * @param {Date|string|number|null|undefined} value - Date-like value to format.
 * @returns {string} Formatted date-time string (e.g. `"Mar 11, 2026, 14:08:30"`) or `"N/A"`.
 *
 * @example
 * formatDateTime("2026-03-11T14:08:30Z");
 * // "Mar 11, 2026, 14:08:30"
 *
 * @example
 * formatDateTime(new Date("2026-03-11T14:08:30"));
 * // "Mar 11, 2026, 14:08:30"
 *
 * @example
 * formatDateTime(null);
 * // "N/A"
 */
export const formatDateTime = (value) => {
  if (!value) return "N/A";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // set true if you prefer AM/PM
  }).format(date);
};
