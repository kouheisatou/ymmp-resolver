import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openYmmpDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open-ymmp'),

  selectFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-folder'),

  readYmmp: (filePath: string): Promise<{ content: string; filePath: string }> =>
    ipcRenderer.invoke('file:read-ymmp', filePath),

  saveYmmp: (filePath: string, jsonString: string): Promise<boolean> =>
    ipcRenderer.invoke('file:save-ymmp', filePath, jsonString),

  scanFolder: (
    folderPath: string,
    fileNames: string[]
  ): Promise<Record<string, string>> =>
    ipcRenderer.invoke('file:scan-folder', folderPath, fileNames),
};

contextBridge.exposeInMainWorld('electronAPI', api);
