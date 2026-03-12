import path from 'path';
import { app, ipcMain, dialog, BrowserWindow, protocol, net } from 'electron';
import { scanFolder } from './helpers/file-scanner';
import { startDebugServer, stopDebugServer } from './helpers/debug-server';
import fs from 'fs';
import url from 'url';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  if (isProd) {
    protocol.handle('app', (request) => {
      const pathName = new URL(request.url).pathname;
      const filePath = path.join(__dirname, pathName === '/' ? 'index.html' : pathName);
      return net.fetch(url.pathToFileURL(filePath).toString());
    });
  }

  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#C0C0C0',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isProd) {
    await mainWindow.loadURL('app://./index.html');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/`);
  }
}

app.on('ready', async () => {
  await createWindow();

  if (!isProd && mainWindow) {
    startDebugServer(mainWindow);
  }
});

app.on('window-all-closed', () => {
  stopDebugServer();
  app.quit();
});

// ---- IPC Handlers ----

ipcMain.handle('dialog:open-ymmp', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'YMM4 Project', extensions: ['ymmp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('file:read-ymmp', async (_event, filePath: string) => {
  const buf = fs.readFileSync(filePath);
  let content = buf.toString('utf-8');
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  return { content, filePath };
});

ipcMain.handle(
  'file:save-ymmp',
  async (_event, filePath: string, jsonString: string) => {
    const bom = '\uFEFF';
    fs.writeFileSync(filePath, bom + jsonString, 'utf-8');
    return true;
  }
);

ipcMain.handle(
  'file:scan-folder',
  async (_event, folderPath: string, fileNames: string[]) => {
    return scanFolder(folderPath, fileNames);
  }
);
