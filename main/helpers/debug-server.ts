import http from 'http';
import { BrowserWindow, ipcMain } from 'electron';

const DEBUG_PORT = 13456;
const COMMAND_TIMEOUT_MS = 30000;
let server: http.Server | null = null;

const pendingCommands = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let commandCounter = 0;

function generateCommandId(): string {
  return `cmd_${++commandCounter}_${Date.now()}`;
}

function sendCommandToRenderer(
  mainWindow: BrowserWindow,
  type: string,
  payload: any,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = generateCommandId();
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Command '${type}' timed out after ${COMMAND_TIMEOUT_MS}ms`));
    }, COMMAND_TIMEOUT_MS);

    pendingCommands.set(id, { resolve, reject, timer });
    mainWindow.webContents.send('debug:command', { id, type, payload });
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: any) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

export function startDebugServer(mainWindow: BrowserWindow) {
  ipcMain.on('debug:response', (_event, { id, result, error }) => {
    const pending = pendingCommands.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCommands.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });

  server = http.createServer(async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';

    // --- Screenshot ---
    if (url === '/screenshot' && method === 'GET') {
      try {
        const image = await mainWindow.webContents.capturePage();
        const png = image.toPNG();
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
        });
        res.end(png);
      } catch (err) {
        jsonResponse(res, 500, { error: `Screenshot failed: ${err}` });
      }
      return;
    }

    // --- Health ---
    if (url === '/health' && method === 'GET') {
      jsonResponse(res, 200, { status: 'ok' });
      return;
    }

    // --- API: Get app state ---
    if (url === '/api/state' && method === 'GET') {
      try {
        const result = await sendCommandToRenderer(mainWindow, 'get-state', {});
        jsonResponse(res, 200, result);
      } catch (err: any) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    // --- API: Open ymmp file ---
    if (url === '/api/open' && method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body.filePath) {
          jsonResponse(res, 400, { error: 'filePath is required' });
          return;
        }
        const result = await sendCommandToRenderer(mainWindow, 'open', {
          filePath: body.filePath,
        });
        jsonResponse(res, 200, result);
      } catch (err: any) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    // --- API: Auto re-link ---
    if (url === '/api/relink' && method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body.folderPath) {
          jsonResponse(res, 400, { error: 'folderPath is required' });
          return;
        }
        const result = await sendCommandToRenderer(mainWindow, 'relink', {
          folderPath: body.folderPath,
        });
        jsonResponse(res, 200, result);
      } catch (err: any) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    // --- API: Update asset path ---
    if (url === '/api/assets' && method === 'PATCH') {
      try {
        const body = JSON.parse(await readBody(req));
        if (body.index === undefined || body.newPath === undefined) {
          jsonResponse(res, 400, { error: 'index and newPath are required' });
          return;
        }
        const result = await sendCommandToRenderer(mainWindow, 'update-asset', {
          index: body.index,
          newPath: body.newPath,
        });
        jsonResponse(res, 200, result);
      } catch (err: any) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    // --- API: Save ---
    if (url === '/api/save' && method === 'POST') {
      try {
        const result = await sendCommandToRenderer(mainWindow, 'save', {});
        jsonResponse(res, 200, result);
      } catch (err: any) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  });

  server.listen(DEBUG_PORT, '127.0.0.1', () => {
    console.log(`[Debug] API server running at http://127.0.0.1:${DEBUG_PORT}`);
  });
}

export function stopDebugServer() {
  if (server) {
    server.close();
    server = null;
  }
  for (const [id, pending] of pendingCommands) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Server stopped'));
    pendingCommands.delete(id);
  }
}
