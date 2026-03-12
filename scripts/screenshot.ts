import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG_PORT = 13456;
const OUTPUT_DIR = path.join(__dirname, '..', 'debug');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'screenshot.png');

function captureScreenshot(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/screenshot`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Server returned status ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const png = Buffer.concat(chunks);
        if (!fs.existsSync(OUTPUT_DIR)) {
          fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        fs.writeFileSync(OUTPUT_PATH, png);
        console.log(`Screenshot saved to ${OUTPUT_PATH}`);
        resolve();
      });
    });
    req.on('error', (err) => {
      reject(
        new Error(
          `Could not connect to debug server. Is the app running in dev mode?\n${err.message}`,
        ),
      );
    });
    req.end();
  });
}

captureScreenshot().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
