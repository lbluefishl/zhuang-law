import fs from 'node:fs/promises';
import path from 'node:path';

const IGNORE_NAMES = new Set(['.ds_store', 'thumbs.db']);
const IGNORE_EXTENSIONS = new Set(['.aae']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    const lowerName = entry.name.toLowerCase();
    const ext = path.extname(lowerName);
    if (IGNORE_NAMES.has(lowerName) || IGNORE_EXTENSIONS.has(ext)) continue;
    files.push(full);
  }
  return files;
}

// Sorted so --limit N is deterministic across runs.
export async function discoverFiles(inputDir) {
  const all = await walk(inputDir);
  return all.sort();
}
