/**
 * XHS Ingestion Spike — entry point
 *
 * Usage:  node src/index.js
 * Config: copy .env.example to .env and fill in your API keys.
 * Input:  urls.txt  (one URL per line; lines starting with # are skipped)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Table from 'cli-table3';

import { isXiaohongshuUrl } from './isXiaohongshuUrl.js';
import { normalizeXiaohongshu } from './normalizeXiaohongshu.js';
import { downloadVideo } from './downloadVideo.js';
import { slugify } from './utils/slugify.js';

// ── paths ──────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URLS_FILE = path.join(ROOT, 'urls.txt');
const RAW_DIR = path.join(ROOT, 'outputs', 'raw');
const VIDEOS_DIR = path.join(ROOT, 'outputs', 'videos');
const RESULTS_FILE = path.join(ROOT, 'outputs', 'results.json');

// ── provider ───────────────────────────────────────────────────────────────
const providerName = process.env.PROVIDER ?? 'xiaohongshuProvider';
let provider;
try {
  provider = await import(`./providers/${providerName}.js`);
} catch {
  console.error(`❌ Could not load provider: src/providers/${providerName}.js`);
  process.exit(1);
}

// ── setup output dirs ──────────────────────────────────────────────────────
fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

// ── read URLs ──────────────────────────────────────────────────────────────
if (!fs.existsSync(URLS_FILE)) {
  console.error('❌ urls.txt not found. Create it and add one URL per line.');
  process.exit(1);
}

const urls = fs
  .readFileSync(URLS_FILE, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

if (urls.length === 0) {
  console.error('❌ urls.txt has no URLs. Add at least one URL and try again.');
  process.exit(1);
}

console.log(`\n🔍 Processing ${urls.length} URL(s)…\n`);

// ── process each URL ───────────────────────────────────────────────────────
const results = [];

for (const url of urls) {
  const slug = slugify(url);
  const rawPath = path.join(RAW_DIR, `${slug}.json`);
  const videoPath = path.join(VIDEOS_DIR, `${slug}.mp4`);

  console.log(`▶  ${url}`);

  // 1. Validate platform
  if (!isXiaohongshuUrl(url)) {
    const result = makeErrorResult(url, 'Not a Xiaohongshu / RedNote URL');
    console.log(`   ❌ ${result.error}\n`);
    results.push(result);
    continue;
  }

  let raw;

  // 2. Call extraction provider
  try {
    raw = await provider.fetchVideoData(url);
    fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
    console.log(`   ✅ Raw response saved → outputs/raw/${slug}.json`);
  } catch (err) {
    const result = makeErrorResult(
      url,
      `Extraction provider failed: ${err.message}`
    );
    console.log(`   ❌ ${result.error}\n`);
    results.push(result);
    continue;
  }

  // 3. Normalize
  const result = normalizeXiaohongshu(url, provider.PROVIDER_NAME, raw);

  // 4. Download first video
  if (result.videoUrls.length > 0) {
    try {
      await downloadVideo(result.videoUrls[0], videoPath);
      result.downloadedVideoPath = videoPath;
      console.log(`   ✅ Video downloaded → outputs/videos/${slug}.mp4`);
    } catch (err) {
      result.error = `Video download failed: ${err.message}`;
      console.log(`   ⚠️  ${result.error}`);
    }
  } else if (result.imageUrls.length === 0) {
    result.success = false;
    result.error = 'No video URL found in provider response';
    console.log(`   ⚠️  ${result.error}`);
  }

  console.log('');
  results.push(result);
}

// ── save combined results ──────────────────────────────────────────────────
fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
console.log(`💾 All results saved → outputs/results.json\n`);

// ── print summary table ────────────────────────────────────────────────────
const table = new Table({
  head: [
    'URL',
    'success',
    'providerUsed',
    'hasVideo',
    'videoDownloaded',
    'hasCaption',
    'error',
  ],
  colWidths: [40, 9, 26, 10, 16, 11, 35],
  wordWrap: true,
});

for (const r of results) {
  table.push([
    truncate(r.inputUrl, 38),
    r.success ? '✅' : '❌',
    r.providerUsed ?? '',
    r.videoUrls?.length > 0 ? '✅' : '❌',
    r.downloadedVideoPath ? '✅' : '❌',
    r.caption ? '✅' : '❌',
    truncate(r.error ?? '', 33),
  ]);
}

console.log(table.toString());

// ── helpers ────────────────────────────────────────────────────────────────
function makeErrorResult(inputUrl, error) {
  return {
    inputUrl,
    platform: 'xiaohongshu',
    providerUsed: provider.PROVIDER_NAME ?? '',
    success: false,
    canonicalUrl: '',
    title: '',
    caption: '',
    author: '',
    videoUrls: [],
    imageUrls: [],
    coverUrl: '',
    downloadedVideoPath: '',
    error,
  };
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
