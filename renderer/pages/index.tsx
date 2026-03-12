import { useState, useCallback } from 'react';
import { parseYmmp, applyNewPaths, AssetEntry, YmmpData } from '../lib/ymmp-parser';

type AppState = 'empty' | 'loaded' | 'saving';

export default function Home() {
  const [state, setState] = useState<AppState>('empty');
  const [ymmpData, setYmmpData] = useState<YmmpData | null>(null);
  const [ymmpFilePath, setYmmpFilePath] = useState<string>('');
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [scanning, setScanning] = useState(false);

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.electronAPI.openYmmpDialog();
    if (!filePath) return;

    setStatusMessage('Loading...');
    try {
      const { content } = await window.electronAPI.readYmmp(filePath);
      const data = parseYmmp(content);
      setYmmpData(data);
      setYmmpFilePath(filePath);
      setAssets(data.assets.map((a) => ({ ...a })));
      setState('loaded');
      setStatusMessage(`Loaded: ${data.assets.length} asset(s) found`);
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  }, []);

  const handleAutoRelink = useCallback(async () => {
    if (!assets.length) return;

    const folderPath = await window.electronAPI.selectFolderDialog();
    if (!folderPath) return;

    setScanning(true);
    setStatusMessage('Scanning folder...');

    try {
      const fileNames = assets.map((a) => a.fileName);
      const found = await window.electronAPI.scanFolder(folderPath, fileNames);

      const updated = assets.map((asset) => {
        const foundPath = found[asset.fileName];
        if (foundPath) {
          return { ...asset, newPath: foundPath };
        }
        return { ...asset };
      });

      setAssets(updated);
      const foundCount = Object.keys(found).length;
      setStatusMessage(
        `Scan complete: ${foundCount}/${assets.length} file(s) found`
      );
    } catch (err) {
      setStatusMessage(`Scan error: ${err}`);
    } finally {
      setScanning(false);
    }
  }, [assets]);

  const handleSave = useCallback(async () => {
    if (!ymmpData) return;

    setState('saving');
    setStatusMessage('Saving...');

    try {
      const dataToSave: YmmpData = {
        ...ymmpData,
        assets: assets,
      };
      const jsonString = applyNewPaths(dataToSave);
      await window.electronAPI.saveYmmp(ymmpFilePath, jsonString);
      setStatusMessage('Saved successfully!');
    } catch (err) {
      setStatusMessage(`Save error: ${err}`);
    } finally {
      setState('loaded');
    }
  }, [ymmpData, assets, ymmpFilePath]);

  const handleNewPathChange = useCallback(
    (index: number, value: string) => {
      setAssets((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], newPath: value };
        return next;
      });
    },
    []
  );

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
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      {asset.originalPath}
                    </span>
                  </td>
                  <td>
                    <input
                      className={`retro-input ${
                        asset.newPath
                          ? 'status-found'
                          : ''
                      }`}
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
