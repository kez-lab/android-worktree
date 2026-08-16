import * as fs from 'node:fs';
import * as path from 'node:path';

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function readFileSafe(filePath: string): string | null {
  try {
    if (fileExists(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function writeFileSafe(filePath: string, content: string): boolean {
  try {
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function copyFileSafe(source: string, destination: string): boolean {
  try {
    const parentDir = path.dirname(destination);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(source, destination);
    return true;
  } catch {
    return false;
  }
}

export function createSymlinkSafe(source: string, destination: string): boolean {
  try {
    const parentDir = path.dirname(destination);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    fs.symlinkSync(source, destination);
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function getDirectorySizeBytes(dirPath: string): number {
  if (!dirExists(dirPath)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // Ignore inaccessible files
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }
  return total;
}

export function countFiles(dirPath: string): number {
  if (!dirExists(dirPath)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  } catch {
    // Ignore
  }
  return count;
}
