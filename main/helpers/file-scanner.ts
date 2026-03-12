import fs from 'fs';
import path from 'path';

function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // skip inaccessible dirs
  }
  return results;
}

/**
 * Scan a folder recursively and find files matching the given filenames.
 * Returns a map of { originalFileName -> foundAbsolutePath }.
 */
export function scanFolder(folderPath: string, fileNames: string[]): Record<string, string> {
  const allFiles = walkDir(folderPath);
  const result: Record<string, string> = {};
  const lowerNameSet = new Map<string, string>();

  for (const fn of fileNames) {
    lowerNameSet.set(fn.toLowerCase(), fn);
  }

  for (const filePath of allFiles) {
    const basename = path.basename(filePath).toLowerCase();
    if (lowerNameSet.has(basename)) {
      const originalName = lowerNameSet.get(basename)!;
      if (!result[originalName]) {
        result[originalName] = filePath;
      }
    }
  }

  return result;
}
