/**
 * Turns a URL into a filesystem-safe slug for naming output files.
 * e.g. "https://xhslink.com/a/abc123" → "xhslink-com-a-abc123"
 * @param {string} url
 * @returns {string}
 */
export function slugify(url) {
  return url
    .replace(/^https?:\/\//, '')   // strip protocol
    .replace(/[^a-zA-Z0-9]+/g, '-') // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .slice(0, 120);                 // cap length
}
