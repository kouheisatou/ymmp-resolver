export interface AssetEntry {
  fileName: string;
  originalPath: string;
  newPath: string;
  itemIndices: { timelineIndex: number; itemIndex: number }[];
  type: string;
}

export interface YmmpData {
  raw: any;
  projectFilePath: string;
  assets: AssetEntry[];
}

const ITEM_TYPES_WITH_FILE = [
  'YukkuriMovieMaker.Project.Items.VideoItem',
  'YukkuriMovieMaker.Project.Items.ImageItem',
  'YukkuriMovieMaker.Project.Items.AudioItem',
];

function getBasename(windowsPath: string): string {
  const parts = windowsPath.split(/[\\/]/);
  return parts[parts.length - 1];
}

function getShortType(fullType: string): string {
  const match = fullType.match(/\.(\w+Item),/);
  return match ? match[1] : fullType;
}

export function parseYmmp(jsonString: string): YmmpData {
  const raw = JSON.parse(jsonString);
  const projectFilePath = raw.FilePath || '';

  const pathMap = new Map<string, AssetEntry>();

  const timelines = raw.Timelines || [];
  for (let ti = 0; ti < timelines.length; ti++) {
    const items = timelines[ti].Items || [];
    for (let ii = 0; ii < items.length; ii++) {
      const item = items[ii];
      const itemType = item['$type'] || '';
      const filePath = item.FilePath;
      if (!filePath) continue;

      const matchesType = ITEM_TYPES_WITH_FILE.some((t) =>
        itemType.startsWith(t)
      );
      if (!matchesType) continue;

      const existing = pathMap.get(filePath);
      if (existing) {
        existing.itemIndices.push({ timelineIndex: ti, itemIndex: ii });
      } else {
        pathMap.set(filePath, {
          fileName: getBasename(filePath),
          originalPath: filePath,
          newPath: '',
          type: getShortType(itemType),
          itemIndices: [{ timelineIndex: ti, itemIndex: ii }],
        });
      }
    }
  }

  return {
    raw,
    projectFilePath,
    assets: Array.from(pathMap.values()),
  };
}

export function applyNewPaths(data: YmmpData): string {
  const raw = data.raw;
  for (const asset of data.assets) {
    const newPath = asset.newPath.trim();
    if (!newPath) continue;
    for (const idx of asset.itemIndices) {
      raw.Timelines[idx.timelineIndex].Items[idx.itemIndex].FilePath = newPath;
    }
  }
  return JSON.stringify(raw, null, 2);
}
