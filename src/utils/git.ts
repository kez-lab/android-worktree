import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorktreeInfo } from '../types/index.js';
import { fileExists, dirExists } from './fs.js';

export function execGit(args: string[], cwd: string = process.cwd()): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || error.message || '';
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }
}

export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    const out = execGit(['rev-parse', '--is-inside-work-tree'], cwd);
    return out === 'true';
  } catch {
    return false;
  }
}

export function getGitVersion(): string {
  try {
    return execGit(['--version']);
  } catch {
    return 'unknown';
  }
}

export function getRepoRoot(cwd: string = process.cwd()): string {
  return execGit(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * Returns the main (primary) repository root, even when called from inside a git worktree.
 */
export function getMainRepoRoot(cwd: string = process.cwd()): string {
  const toplevel = getRepoRoot(cwd);
  const gitPath = path.join(toplevel, '.git');

  if (fileExists(gitPath)) {
    // In a secondary worktree, .git is a file containing: gitdir: /path/to/main/.git/worktrees/<name>
    const content = fs.readFileSync(gitPath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (match && match[1]) {
      const gitDir = path.resolve(toplevel, match[1]);
      // gitDir is inside <main_repo>/.git/worktrees/<worktree-name>
      // Traverse up to find main .git directory
      const commonDirMatch = gitDir.match(/(.*)[/\\]\.git[/\\]worktrees[/\\]/);
      if (commonDirMatch && commonDirMatch[1]) {
        return commonDirMatch[1];
      }
    }
  }

  return toplevel;
}

export function isSecondaryWorktree(cwd: string = process.cwd()): boolean {
  try {
    const toplevel = getRepoRoot(cwd);
    const gitPath = path.join(toplevel, '.git');
    return fileExists(gitPath);
  } catch {
    return false;
  }
}

export function getWorktrees(cwd: string = process.cwd()): WorktreeInfo[] {
  const mainRoot = getMainRepoRoot(cwd);
  const raw = execGit(['worktree', 'list', '--porcelain'], mainRoot);
  const lines = raw.split('\n');

  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.path) {
        worktrees.push({
          path: path.resolve(current.path),
          head: current.head || '',
          branch: current.branch || null,
          isBare: Boolean(current.isBare),
          isLocked: Boolean(current.isLocked),
          isDetached: Boolean(current.isDetached),
          isMain: worktrees.length === 0,
        });
      }
      current = {};
      continue;
    }

    if (trimmed.startsWith('worktree ')) {
      current.path = trimmed.substring(9).trim();
    } else if (trimmed.startsWith('HEAD ')) {
      current.head = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('branch ')) {
      const fullRef = trimmed.substring(7).trim();
      current.branch = fullRef.replace(/^refs\/heads\//, '');
    } else if (trimmed === 'bare') {
      current.isBare = true;
    } else if (trimmed === 'locked') {
      current.isLocked = true;
    } else if (trimmed === 'detached') {
      current.isDetached = true;
    }
  }

  if (current.path) {
    worktrees.push({
      path: path.resolve(current.path),
      head: current.head || '',
      branch: current.branch || null,
      isBare: Boolean(current.isBare),
      isLocked: Boolean(current.isLocked),
      isDetached: Boolean(current.isDetached),
      isMain: worktrees.length === 0,
    });
  }

  return worktrees;
}
