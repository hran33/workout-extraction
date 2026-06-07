/**
 * test-extract-video.js — extract workout outline from video frames + caption via Claude.
 *
 * Usage:  node test-extract-video.js [path/to/raw.json]
 *
 * Requires ANTHROPIC_API_KEY in .env and ffmpeg on PATH.
 */

import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawPath = process.argv[2] ??
  path.join(__dirname, 'outputs/raw/xhslink-com-o-6JbYbJjfipz.json');

if (!fs.existsSync(rawPath)) {
  console.error(`Raw file not found: ${rawPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const data = raw?.data ?? raw;
const caption = data?.title ?? '';

// Find the downloaded video
const slug = path.basename(rawPath, '.json');
const videoPath = path.join(__dirname, 'outputs/videos', `${slug}.mp4`);

if (!fs.existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  console.error('Run `node src/index.js` first to download the video.');
  process.exit(1);
}

// Extract evenly-spaced frames into a temp dir
const NUM_FRAMES = 8;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-frames-'));

// Get video duration in seconds
const probeOut = execSync(
  `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${videoPath}"`,
  { encoding: 'utf8' }
).trim();
const duration = parseFloat(probeOut) || 60;
const interval = duration / (NUM_FRAMES + 1);

console.log(`Video duration: ${duration.toFixed(1)}s — extracting ${NUM_FRAMES} frames…`);

for (let i = 1; i <= NUM_FRAMES; i++) {
  const ts = (interval * i).toFixed(2);
  execSync(
    `ffmpeg -ss ${ts} -i "${videoPath}" -frames:v 1 -vf "scale=768:-1" "${tmpDir}/frame${String(i).padStart(2,'0')}.jpg" -y 2>/dev/null`,
    { stdio: 'pipe' }
  );
}

const frameFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();
console.log(`Extracted ${frameFiles.length} frames.`);

if (frameFiles.length === 0) {
  console.error('No frames extracted — is the video file valid?');
  process.exit(1);
}

// Build Claude message content
const userContent = [];

// Add all frames
for (const file of frameFiles) {
  const imgData = fs.readFileSync(path.join(tmpDir, file));
  userContent.push({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: imgData.toString('base64') },
  });
}

// Add caption + prompt
userContent.push({
  type: 'text',
  text: `The images above are evenly-spaced frames from a Xiaohongshu (RedNote) fitness video.

Post caption: "${caption}"

Please analyze the frames and caption to produce a detailed, structured workout outline. Return JSON with this exact shape:

{
  "workoutType": "",
  "targetMuscles": [],
  "equipment": [],
  "estimatedDuration": "",
  "exercises": [
    {
      "name": "",
      "sets": null,
      "reps": null,
      "duration": "",
      "cues": ""
    }
  ],
  "notes": ""
}

For each exercise you can identify from the frames, fill in name, sets/reps/duration if visible, and any form cues shown. If a field cannot be determined, use null or empty string. Return only valid JSON, no markdown fences.`,
});

console.log('\nSending frames to Claude…\n');

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 2048,
  thinking: { type: 'adaptive' },
  messages: [{ role: 'user', content: userContent }],
});

// Clean up temp frames
fs.rmSync(tmpDir, { recursive: true });

const text = response.content.find((b) => b.type === 'text')?.text ?? '';

console.log('--- Claude response ---\n');
console.log(text);

try {
  const parsed = JSON.parse(text);
  console.log('\n--- Parsed workout outline ---\n');
  console.log(JSON.stringify(parsed, null, 2));

  // Save result
  const outPath = path.join(__dirname, 'outputs', `${slug}-workout.json`);
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
  console.log(`\nSaved to ${outPath}`);
} catch {
  console.log('\n(Response was not pure JSON — shown as-is above)');
}
