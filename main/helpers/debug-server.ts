import http from 'http';
import { BrowserWindow } from 'electron';

const DEBUG_PORT = 13456;
let server: http.Server | null = null;

export function startDebugServer(mainWindow: BrowserWindow) {
  server = http.createServer(async (req, res) => {
    if (req.url === '/screenshot') {
      try {
        const image = await mainWindow.webContents.capturePage();
        const png = image.toPNG();
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
        });
        res.end(png);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Screenshot failed: ${err}`);
      }
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(DEBUG_PORT, '127.0.0.1', () => {
    console.log(`[Debug] Screenshot server running at http://127.0.0.1:${DEBUG_PORT}`);
  });
}

export function stopDebugServer() {
  if (server) {
    server.close();
    server = null;
  }
}
