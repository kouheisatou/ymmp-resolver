interface ElectronAPI {
  openYmmpDialog: () => Promise<string | null>;
  selectFolderDialog: () => Promise<string | null>;
  readYmmp: (filePath: string) => Promise<{ content: string; filePath: string }>;
  saveYmmp: (filePath: string, jsonString: string) => Promise<boolean>;
  scanFolder: (
    folderPath: string,
    fileNames: string[]
  ) => Promise<Record<string, string>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
