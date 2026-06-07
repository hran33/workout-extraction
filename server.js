import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { fetchVideoData } from './src/providers/xiaohongshuProvider.js';
import { normalizeXiaohongshu } from './src/normalizeXiaohongshu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    const file = fs.createWriteStream(destPath);
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

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
        const mediaType = res.headers['content-type']?.split(';')[0] || 'image/jpeg';
        resolve({ data: buf.toString('base64'), mediaType });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let tmpDir;
  let tmpVideo;

  try {
    // 1. Fetch video metadata
    const raw = await fetchVideoData(url);
    const normalized = normalizeXiaohongshu(url, 'rednote-videos-images-download', raw);

    if (!normalized.success) {
      return res.status(422).json({ error: 'Could not extract video from URL', details: raw });
    }

    const videoUrl = normalized.videoUrls[0];
    const caption = normalized.caption;

    // 2. Download video to temp file
    tmpVideo = path.join(os.tmpdir(), `xhs-video-${Date.now()}.mp4`);
    await downloadFile(videoUrl, tmpVideo);

    // 3. Extract frames
    const NUM_FRAMES = 8;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-frames-'));

    const probeOut = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${tmpVideo}"`,
      { encoding: 'utf8' }
    ).trim();
    const duration = parseFloat(probeOut) || 60;
    const interval = duration / (NUM_FRAMES + 1);

    for (let i = 1; i <= NUM_FRAMES; i++) {
      const ts = (interval * i).toFixed(2);
      execSync(
        `ffmpeg -ss ${ts} -i "${tmpVideo}" -frames:v 1 -vf "scale=768:-1" "${tmpDir}/frame${String(i).padStart(2, '0')}.jpg" -y 2>/dev/null`,
        { stdio: 'pipe' }
      );
    }

    const frameFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();

    // 4. Send frames + caption to Claude
    const userContent = [];
    for (const file of frameFiles) {
      const imgData = fs.readFileSync(path.join(tmpDir, file));
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imgData.toString('base64') },
      });
    }

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

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const workout = JSON.parse(text);

    // Build plain text
    const lines = [];
    lines.push(`${workout.workoutType}`);
    lines.push(`Equipment: ${workout.equipment?.join(', ') || 'none'}`);
    lines.push(`Duration: ${workout.estimatedDuration || 'unknown'}`);
    lines.push(`Targets: ${workout.targetMuscles?.join(', ') || 'unknown'}`);
    lines.push('');
    workout.exercises?.forEach((ex, i) => {
      const repsOrDuration = ex.reps ? `${ex.reps} reps` : ex.duration || '';
      const sets = ex.sets ? `${ex.sets} sets x ` : '';
      lines.push(`${i + 1}. ${ex.name} — ${sets}${repsOrDuration}`);
      if (ex.cues) lines.push(`↳ ${ex.cues}`);
      lines.push('');
    });
    if (workout.notes) {
      lines.push(`Notes: ${workout.notes}`);
    }
    const plainText = lines.join('\n');

    // Read frames as base64 before cleanup
    const frames = frameFiles.map(file => {
      const imgData = fs.readFileSync(path.join(tmpDir, file));
      return imgData.toString('base64');
    });

    // Cleanup before sending response
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlink(tmpVideo, () => {});
    tmpDir = null;
    tmpVideo = null;

    const title = workout.workoutType || 'Workout';
    res.json({ success: true, title, text: plainText, frames, workout, caption });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    if (tmpVideo) fs.unlink(tmpVideo, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
