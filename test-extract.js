/**
 * test-extract.js — one-off spike to test workout extraction via Claude.
 *
 * Reads the already-saved raw API response, then sends:
 *   - the post caption (title field)
 *   - the cover image URL
 * to Claude and asks it to produce a structured workout outline.
 *
 * Usage:  node test-extract.js [path/to/raw.json]
 *
 * Requires ANTHROPIC_API_KEY in .env
 */

import 'dotenv/config';
import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default to the video post we just downloaded
const rawPath = process.argv[2] ??
  path.join(__dirname, 'outputs/raw/xhslink-com-o-6JbYbJjfipz.json');

if (!fs.existsSync(rawPath)) {
  console.error(`Raw file not found: ${rawPath}`);
  console.error('Run `node src/index.js` first to populate outputs/raw/');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const data = raw?.data ?? raw;

const caption = data?.title ?? '';
const coverUrl = data?.coverUrl ?? '';

if (!caption && !coverUrl) {
  console.error('No caption or cover image found in raw file.');
  process.exit(1);
}

console.log('--- Input ---');
console.log('Caption:', caption.slice(0, 120) + (caption.length > 120 ? '…' : ''));
console.log('Cover URL:', coverUrl || '(none)');
console.log('\nCalling Claude…\n');

function fetchImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageAsBase64(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = res.headers['content-type']?.split(';')[0] || 'image/jpeg';
        resolve({ data: buf.toString('base64'), mediaType: contentType });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

const client = new Anthropic();

const userContent = [];

// Attach cover image if we have one (download to base64 — XHS blocks direct URL fetching)
if (coverUrl) {
  console.log('Downloading cover image…');
  const { data, mediaType } = await fetchImageAsBase64(coverUrl);
  userContent.push({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data },
  });
}

// Always include the caption
userContent.push({
  type: 'text',
  text: `The following is a Xiaohongshu (RedNote) fitness post caption:\n\n"${caption}"\n\nPlease extract and format a structured workout outline from the image and caption above. Return JSON with this exact shape:\n\n{\n  "workoutType": "",\n  "targetMuscles": [],\n  "equipment": [],\n  "estimatedDuration": "",\n  "exercises": [\n    {\n      "name": "",\n      "sets": null,\n      "reps": null,\n      "duration": "",\n      "cues": ""\n    }\n  ],\n  "notes": ""\n}\n\nIf a field cannot be determined, use null or an empty string. Return only valid JSON, no markdown fences.`,
});

const response = await client.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 1024,
  messages: [{ role: 'user', content: userContent }],
});

const text = response.content.find((b) => b.type === 'text')?.text ?? '';

console.log('--- Claude response ---\n');
console.log(text);

// Try to parse and pretty-print if it's valid JSON
try {
  const parsed = JSON.parse(text);
  console.log('\n--- Parsed workout outline ---\n');
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('\n(Response was not pure JSON — shown as-is above)');
}
