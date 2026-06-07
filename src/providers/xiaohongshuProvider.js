/**
 * Provider: RapidAPI — Rednote Videos Images Download
 *
 * API: POST https://rednote-videos-images-download.p.rapidapi.com/v1/api/rednote-downloader
 * Body: { "url": "<full xiaohongshu or xhslink URL>" }
 *
 * Response shape:
 *   { status: "101", message: "success", data: { title, videoUrl, coverUrl, images[] } }
 *
 * Required env vars:
 *   RAPIDAPI_KEY  — your RapidAPI key
 *   RAPIDAPI_HOST — rednote-videos-images-download.p.rapidapi.com
 */

import axios from 'axios';

export const PROVIDER_NAME = 'rednote-videos-images-download';

/**
 * @param {string} url  — full Xiaohongshu / RedNote URL
 * @returns {Promise<object>}  raw API response body
 */
export async function fetchVideoData(url) {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;

  if (!apiKey || apiKey === 'your_rapidapi_key_here') {
    throw new Error(
      'RAPIDAPI_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
  if (!apiHost) {
    throw new Error('RAPIDAPI_HOST is not set in .env.');
  }

  const response = await axios.post(
    `https://${apiHost}/v1/api/rednote-downloader`,
    { url },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost,
      },
      timeout: 20000,
    }
  );

  return response.data;
}
