# XHS Ingestion Spike

A small Node.js CLI for testing whether a Xiaohongshu / RedNote video link can be turned into usable video and caption data.

**This is an ingestion spike only.** No UI, AI extraction, database, or iOS integration.

---

## Prerequisites

- Node.js 20 or later (`node --version`)
- npm (`npm --version`)
- A [RapidAPI](https://rapidapi.com) account with a subscription to a Xiaohongshu downloader API

---

## Setup

### 1. Install dependencies

```bash
cd "workout extraction"
npm install
```

### 2. Configure your API keys

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
RAPIDAPI_KEY=your_rapidapi_key_here
RAPIDAPI_HOST=xiaohongshu-downloader.p.rapidapi.com
PROVIDER=xiaohongshuProvider
```

**Finding a RapidAPI provider:**  
Search [rapidapi.com](https://rapidapi.com) for `xiaohongshu` or `rednote`. Subscribe to any downloader API that accepts a URL and returns video/caption data. Common hosts include:
- `xiaohongshu-downloader.p.rapidapi.com`
- `rednote-downloader.p.rapidapi.com`

Copy the host value from the API's dashboard into `RAPIDAPI_HOST`.

### 3. Add URLs to test

Edit `urls.txt` — one URL per line. Lines starting with `#` are ignored.

```
https://xhslink.com/a/abc123
https://www.xiaohongshu.com/explore/64f1234567890abcdef
```

Supported URL patterns:
- `xhslink.com/…`
- `xiaohongshu.com/…`
- `rednote.com/…`

---

## Run

```bash
node src/index.js
```

---

## Output

| Path | Contents |
|---|---|
| `outputs/raw/{slug}.json` | Raw provider response for each URL |
| `outputs/results.json` | All normalized results in one file |
| `outputs/videos/{slug}.mp4` | Downloaded first video (if available) |

### Normalized result shape

```json
{
  "inputUrl": "https://xhslink.com/a/abc123",
  "platform": "xiaohongshu",
  "providerUsed": "rapidapi-xiaohongshu",
  "success": true,
  "canonicalUrl": "https://www.xiaohongshu.com/explore/…",
  "title": "Workout title",
  "caption": "Full post caption text…",
  "author": "username",
  "videoUrls": ["https://…"],
  "imageUrls": [],
  "coverUrl": "https://…",
  "downloadedVideoPath": "outputs/videos/xhslink-com-a-abc123.mp4",
  "error": ""
}
```

---

## Error handling

| Situation | Behaviour |
|---|---|
| URL is not a Xiaohongshu / RedNote URL | Skipped with error message; rest of batch continues |
| `RAPIDAPI_KEY` not set | Clear error message asking you to configure `.env` |
| Provider API call fails | Error recorded; batch continues |
| No video URL in response | Warning logged; `success` set to `false` |
| Video download fails | Error recorded in result; raw response still saved |

---

## Swapping providers

1. Create a new file in `src/providers/`, e.g. `src/providers/myProvider.js`.
2. Export two things:
   - `export const PROVIDER_NAME = 'my-provider';`
   - `export async function fetchVideoData(url) { … }` — must return the raw API response body.
3. Update `PROVIDER=myProvider` in `.env`.

---

## Project structure

```
.
├── .env.example
├── urls.txt
├── package.json
├── README.md
├── src/
│   ├── index.js                  ← entry point
│   ├── isXiaohongshuUrl.js       ← URL validation
│   ├── normalizeXiaohongshu.js   ← response normalization
│   ├── downloadVideo.js          ← video downloader
│   ├── providers/
│   │   └── xiaohongshuProvider.js  ← RapidAPI provider
│   └── utils/
│       └── slugify.js            ← URL → filename slug
└── outputs/
    ├── raw/        ← raw provider responses (git-ignored)
    ├── videos/     ← downloaded videos (git-ignored)
    └── results.json
```
