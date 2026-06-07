import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';

/**
 * Downloads a video from `videoUrl` and saves it to `destPath`.
 * Returns the destination path on success, throws on failure.
 *
 * @param {string} videoUrl
 * @param {string} destPath  — absolute or relative path, e.g. outputs/videos/slug.mp4
 * @returns {Promise<string>} destPath
 */
export function downloadVideo(videoUrl, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const protocol = videoUrl.startsWith('https') ? https : http;

    const request = protocol.get(videoUrl, (response) => {
      // Follow one level of redirect
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(destPath, () => {});
        downloadVideo(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(
          new Error(
            `Video download failed: HTTP ${response.statusCode} for ${videoUrl}`
          )
        );
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(new Error(`Video download error: ${err.message}`));
    });

    // 60-second timeout
    request.setTimeout(60000, () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, () => {});
      reject(new Error(`Video download timed out for ${videoUrl}`));
    });
  });
}
