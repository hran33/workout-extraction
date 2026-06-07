/**
 * Normalizes a raw response from the "Rednote Videos Images Download" API
 * into the project's standard shape.
 *
 * Real response shape (confirmed from API test):
 * {
 *   status: "101",
 *   message: "success",
 *   data: {
 *     title: "…full post text including hashtags…",
 *     videoUrl: "https://…" | "",   ← empty string when post has no video
 *     coverUrl: "https://…",
 *     images: ["https://…", …]      ← present on image posts; may be absent on video posts
 *   }
 * }
 *
 * Notes:
 * - The API has no separate caption field; `title` carries the full post text.
 * - The API has no author field in the observed response.
 * - `videoUrl` is an empty string (not null/undefined) when there is no video.
 *
 * @param {string} inputUrl
 * @param {string} providerName
 * @param {object} raw  — raw API response body
 * @returns {object}    — normalized result
 */
export function normalizeXiaohongshu(inputUrl, providerName, raw) {
  const data = raw?.data ?? {};

  const videoUrls = extractVideoUrls(data);
  const imageUrls = extractImageUrls(data);

  // API-level failure: status is not "101" or message is not "success"
  const apiSuccess = raw?.message === 'success' || raw?.status === '101';

  return {
    inputUrl,
    platform: 'xiaohongshu',
    providerUsed: providerName,
    success: apiSuccess && (videoUrls.length > 0 || imageUrls.length > 0),
    canonicalUrl: '',
    title: data?.title ?? '',
    // No separate caption field — the title carries the full post text.
    caption: data?.title ?? '',
    author: '',
    videoUrls,
    imageUrls,
    coverUrl: data?.coverUrl ?? '',
    downloadedVideoPath: '',
    error: apiSuccess ? '' : (raw?.message ?? 'API returned an unexpected response'),
  };
}

function extractVideoUrls(data) {
  // `videoUrl` is a single string; empty string means no video.
  const v = data?.videoUrl;
  if (v && typeof v === 'string' && v.startsWith('http')) {
    return [v];
  }
  return [];
}

function extractImageUrls(data) {
  const imgs = data?.images;
  if (!Array.isArray(imgs)) return [];
  return imgs.filter((u) => typeof u === 'string' && u.startsWith('http'));
}
