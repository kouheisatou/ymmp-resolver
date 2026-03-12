import { useState, useCallback, useEffect, useRef } from 'react';
import { parseYmmp, applyNewPaths, AssetEntry, YmmpData } from '../lib/ymmp-parser';

type AppState = 'empty' | 'loaded' | 'saving';

export default function Home() {
  const [state, setState] = useState<AppState>('empty');
  const [ymmpData, setYmmpData] = useState<YmmpData | null>(null);
  const [ymmpFilePath, setYmmpFilePath] = useState<string>('');
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [scanning, setScanning] = useState(false);

  const stateRef = useRef({ state, ymmpData, ymmpFilePath, assets, statusMessage });
  useEffect(() => {
    stateRef.current = { state, ymmpData, ymmpFilePath, assets, statusMessage };
  }, [state, ymmpData, ymmpFilePath, assets, statusMessage]);

  const loadFile = useCallback(async (filePath: string) => {
    setStatusMessage('Loading...');
    const { content } = await window.electronAPI.readYmmp(filePath);
    const data = parseYmmp(content);
    setYmmpData(data);
    setYmmpFilePath(filePath);
    const newAssets = data.assets.map((a) => ({ ...a }));
    setAssets(newAssets);
    setState('loaded');
    const msg = `Loaded: ${data.assets.length} asset(s) found`;
    setStatusMessage(msg);
    return { assetCount: data.assets.length, filePath, status: msg };
  }, []);

  const relinkFromFolder = useCallback(async (folderPath: string) => {
    const currentAssets = stateRef.current.assets;
    if (!currentAssets.length) throw new Error('No file loaded');

    setScanning(true);
    setStatusMessage('Scanning folder...');

    const fileNames = currentAssets.map((a) => a.fileName);
    const found = await window.electronAPI.scanFolder(folderPath, fileNames);

    const updated = currentAssets.map((asset) => {
      const foundPath = found[asset.fileName];
      if (foundPath) {
        return { ...asset, newPath: foundPath };
      }
      return { ...asset };
    });

    setAssets(updated);
    setScanning(false);
    const foundCount = Object.keys(found).length;
    const msg = `Scan complete: ${foundCount}/${currentAssets.length} file(s) found`;
    setStatusMessage(msg);
    return {
      foundCount,
      totalCount: currentAssets.length,
      found,
      status: msg,
    };
  }, []);

  const saveFile = useCallback(async () => {
    const { ymmpData: data, ymmpFilePath: filePath, assets: currentAssets } = stateRef.current;
    if (!data) throw new Error('No file loaded');

    setState('saving');
    setStatusMessage('Saving...');

    const dataToSave: YmmpData = { ...data, assets: currentAssets };
    const jsonString = applyNewPaths(dataToSave);
    await window.electronAPI.saveYmmp(filePath, jsonString);

    setState('loaded');
    setStatusMessage('Saved successfully!');
    return { filePath, status: 'Saved successfully!' };
  }, []);

  // --- Debug command listener ---
  useEffect(() => {
    if (!window.electronAPI?.onDebugCommand) return;

    window.electronAPI.onDebugCommand(async ({ id, type, payload }) => {
      try {
        let result: any;
        switch (type) {
          case 'get-state': {
            const s = stateRef.current;
            result = {
              appState: s.state,
              filePath: s.ymmpFilePath,
              statusMessage: s.statusMessage,
              assets: s.assets.map((a) => ({
                fileName: a.fileName,
                originalPath: a.originalPath,
                newPath: a.newPath,
                type: a.type,
              })),
            };
            break;
          }
          case 'open':
            result = await loadFile(payload.filePath);
            break;
          case 'relink':
            result = await relinkFromFolder(payload.folderPath);
            break;
          case 'update-asset': {
            const { index, newPath } = payload;
            setAssets((prev) => {
              const next = [...prev];
              if (index >= 0 && index < next.length) {
                next[index] = { ...next[index], newPath };
              }
              return next;
            });
            result = { index, newPath, status: 'updated' };
            break;
          }
          case 'save':
            result = await saveFile();
            break;
          default:
            throw new Error(`Unknown command: ${type}`);
        }
        window.electronAPI.sendDebugResponse(id, result, null);
      } catch (err: any) {
        window.electronAPI.sendDebugResponse(id, null, err.message || String(err));
      }
    });
  }, [loadFile, relinkFromFolder, saveFile]);

  // --- UI event handlers (dialog-based, for manual use) ---

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.electronAPI.openYmmpDialog();
    if (!filePath) return;
    try {
      await loadFile(filePath);
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  }, [loadFile]);

  const handleAutoRelink = useCallback(async () => {
    if (!assets.length) return;
    const folderPath = await window.electronAPI.selectFolderDialog();
    if (!folderPath) return;
    try {
      await relinkFromFolder(folderPath);
    } catch (err) {
      setStatusMessage(`Scan error: ${err}`);
    }
  }, [assets, relinkFromFolder]);

  const handleSave = useCallback(async () => {
    try {
      await saveFile();
    } catch (err) {
      setStatusMessage(`Save error: ${err}`);
    }
  }, [saveFile]);

  const handleNewPathChange = useCallback((index: number, value: string) => {
    setAssets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], newPath: value };
      return next;
    });
  }, []);

  const hasChanges = assets.some((a) => a.newPath.trim() !== '');

  return (
    <div className="retro-window">
      {/* Title Bar */}
      <div className="retro-titlebar">
        <div className="retro-titlebar__icon" />
        <span className="retro-titlebar__text">YMMP Resolver</span>
      </div>

      {/* Toolbar */}
      <div className="retro-toolbar">
        <button className="retro-btn" onClick={handleOpenFile}>
          Open .ymmp
        </button>
        <div className="retro-toolbar__separator" />
        <button
          className="retro-btn"
          onClick={handleAutoRelink}
          disabled={state !== 'loaded' || scanning}
        >
          {scanning ? 'Scanning...' : 'Auto Re-link'}
        </button>
        <div className="retro-toolbar__separator" />
        <button
          className="retro-btn retro-btn--primary"
          onClick={handleSave}
          disabled={state !== 'loaded' || !hasChanges}
        >
          Save
        </button>
        {ymmpFilePath && (
          <>
            <div className="retro-toolbar__separator" />
            <div className="retro-filepath" title={ymmpFilePath}>
              {ymmpFilePath}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {state === 'empty' ? (
        <div className="retro-empty">
          <div className="retro-empty__icon">.ymmp</div>
          <div>Open a .ymmp file to begin</div>
          <button className="retro-btn retro-btn--primary" onClick={handleOpenFile}>
            Open .ymmp File
          </button>
        </div>
      ) : (
        <div className="retro-table-wrapper">
          <table className="retro-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 80 }}>Type</th>
                <th style={{ width: '20%' }}>File Name</th>
                <th style={{ width: '30%' }}>Original Path</th>
                <th>New Path</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, i) => (
                <tr key={asset.originalPath}>
                  <td>{i + 1}</td>
                  <td>
                    <span className="type-badge">{asset.type}</span>
                  </td>
                  <td title={asset.fileName}>{asset.fileName}</td>
                  <td title={asset.originalPath}>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>{asset.originalPath}</span>
                  </td>
                  <td>
                    <input
                      className={`retro-input ${asset.newPath ? 'status-found' : ''}`}
                      value={asset.newPath}
                      onChange={(e) => handleNewPathChange(i, e.target.value)}
                      placeholder="Enter new path or use Auto Re-link"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status Bar */}
      <div className="retro-statusbar">
        <div className="retro-statusbar__section">{statusMessage}</div>
        <div className="retro-statusbar__section">
          {state === 'loaded' ? `${assets.length} asset(s)` : ''}
        </div>
      </div>
    </div>
  );
}
