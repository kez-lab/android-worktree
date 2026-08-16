import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SeederOptions, SeederResult, SeededFile } from '../types/index.js';
import { fileExists, dirExists, copyFileSafe, createSymlinkSafe, readFileSafe, writeFileSafe } from '../utils/fs.js';

export const DEFAULT_SEED_PATTERNS = [
  'local.properties',
  '**/google-services.json',
  '**/GoogleService-Info.plist',
  '**/*.jks',
  '**/*.keystore',
  '**/key.properties',
  '**/signing.properties',
  '**/secrets.properties',
  '**/secret.properties',
  '**/.env',
  '**/.env.local',
];

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  '.gradle',
  '.idea',
  '.vscode',
  'dist',
  'out',
]);

/**
 * Recursively find candidate files matching seed patterns in sourceRoot.
 */
export function discoverSeedFiles(sourceRoot: string, patterns: string[] = DEFAULT_SEED_PATTERNS): string[] {
  const found: string[] = [];

  function scan(currentDir: string) {
    if (!dirExists(currentDir)) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(sourceRoot, fullPath);

        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          if (matchesPatterns(relPath, patterns)) {
            found.push(relPath);
          }
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  scan(sourceRoot);
  return found;
}

function matchesPatterns(relPath: string, patterns: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const baseName = path.basename(normalized);

  for (const pattern of patterns) {
    const normPattern = pattern.replace(/\\/g, '/');
    if (normPattern === normalized || normPattern === baseName) {
      return true;
    }
    if (normPattern.startsWith('**/')) {
      const targetSuffix = normPattern.slice(3);
      if (targetSuffix.startsWith('*.')) {
        const ext = targetSuffix.slice(1);
        if (baseName.endsWith(ext)) return true;
      } else if (baseName === targetSuffix || normalized.endsWith(`/${targetSuffix}`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normalizes local.properties to ensure a trailing newline exists.
 */
export function sanitizeLocalProperties(filePath: string): void {
  const content = readFileSafe(filePath);
  if (content !== null && !content.endsWith('\n')) {
    writeFileSafe(filePath, content + '\n');
  }
}

/**
 * Seeds sensitive configuration and ignore-listed files from the source root to target worktree.
 */
export function seedWorktree(options: SeederOptions): SeederResult {
  const {
    sourceRoot,
    targetRoot,
    mode = 'copy',
    patterns = DEFAULT_SEED_PATTERNS,
    overwrite = false,
    dryRun = false,
  } = options;

  const candidateRelPaths = discoverSeedFiles(sourceRoot, patterns);
  const seeded: SeededFile[] = [];
  let totalBytes = 0;

  for (const relPath of candidateRelPaths) {
    const src = path.join(sourceRoot, relPath);
    const dest = path.join(targetRoot, relPath);

    if (!fileExists(src)) continue;

    let size = 0;
    try {
      size = fs.statSync(src).size;
    } catch {
      // Ignore
    }

    if (fileExists(dest) && !overwrite) {
      seeded.push({
        relativePath: relPath,
        sourcePath: src,
        targetPath: dest,
        action: 'skipped',
        reason: 'Target file already exists',
        sizeBytes: size,
      });
      continue;
    }

    if (dryRun) {
      seeded.push({
        relativePath: relPath,
        sourcePath: src,
        targetPath: dest,
        action: mode === 'copy' ? 'copied' : 'symlinked',
        sizeBytes: size,
      });
      totalBytes += size;
      continue;
    }

    const success = mode === 'copy' ? copyFileSafe(src, dest) : createSymlinkSafe(src, dest);

    if (success) {
      if (relPath === 'local.properties') {
        sanitizeLocalProperties(dest);
      }
      seeded.push({
        relativePath: relPath,
        sourcePath: src,
        targetPath: dest,
        action: mode === 'copy' ? 'copied' : 'symlinked',
        sizeBytes: size,
      });
      totalBytes += size;
    } else {
      seeded.push({
        relativePath: relPath,
        sourcePath: src,
        targetPath: dest,
        action: 'failed',
        reason: 'Failed to write to destination',
        sizeBytes: size,
      });
    }
  }

  return {
    seeded,
    totalFiles: seeded.filter((s) => s.action === 'copied' || s.action === 'symlinked').length,
    totalBytes,
  };
}
