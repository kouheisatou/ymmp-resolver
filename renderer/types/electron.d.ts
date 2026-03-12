interface DebugCommand {
  id: string;
  type: string;
  payload: any;
}

interface ElectronAPI {
  openYmmpDialog: () => Promise<string | null>;
  selectFolderDialog: () => Promise<string | null>;
  readYmmp: (filePath: string) => Promise<{ content: string; filePath: string }>;
  saveYmmp: (filePath: string, jsonString: string) => Promise<boolean>;
  scanFolder: (folderPath: string, fileNames: string[]) => Promise<Record<string, string>>;
  onDebugCommand: (callback: (data: DebugCommand) => void) => void;
  sendDebugResponse: (id: string, result: any, error: string | null) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
