const XHS_PATTERNS = [
  /xhslink\.com/i,
  /xiaohongshu\.com/i,
  /rednote\.com/i,
];

/**
 * Returns true if the URL looks like a Xiaohongshu / RedNote link.
 * @param {string} url
 * @returns {boolean}
 */
export function isXiaohongshuUrl(url) {
  return XHS_PATTERNS.some((pattern) => pattern.test(url));
}
