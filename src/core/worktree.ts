import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  WorktreeInfo,
  WorktreeCreateOptions,
  WorktreeCreateResult,
  WorktreeRemoveOptions,
  DoctorReport,
  SeededFile,
} from '../types/index.js';
import {
  execGit,
  getMainRepoRoot,
  getWorktrees,
  getGitVersion,
  isGitRepo,
} from '../utils/git.js';
import { dirExists, getDirectorySizeBytes, formatBytes } from '../utils/fs.js';
import { seedWorktree } from './seeder.js';
import { checkDaemonCompatibility, diagnoseGradleEnvironment } from './daemon.js';
import { getConnectedDevices } from './device.js';

export function listWorktreesWithStats(cwd: string = process.cwd()): WorktreeInfo[] {
  const worktrees = getWorktrees(cwd);

  return worktrees.map((wt) => {
    const buildPath = path.join(wt.path, 'build');
    const dotGradlePath = path.join(wt.path, '.gradle');
    let size = 0;

    if (dirExists(buildPath)) {
      size += getDirectorySizeBytes(buildPath);
    }
    if (dirExists(dotGradlePath)) {
      size += getDirectorySizeBytes(dotGradlePath);
    }

    return {
      ...wt,
      buildDirSizeBytes: size,
      buildDirSizeHuman: size > 0 ? formatBytes(size) : '0 B',
    };
  });
}

export function getDefaultWorktreePath(mainRoot: string, branch: string): string {
  const parentDir = path.dirname(mainRoot);
  const repoName = path.basename(mainRoot);
  const sanitizedBranch = branch.replace(/[/\\:]/g, '-');
  return path.join(parentDir, `${repoName}-worktrees`, sanitizedBranch);
}

export function createWorktree(options: WorktreeCreateOptions, cwd: string = process.cwd()): WorktreeCreateResult {
  const mainRoot = getMainRepoRoot(cwd);
  const {
    branch,
    path: customPath,
    baseBranch,
    createBranch = false,
    seed = true,
    seedPatterns,
    checkDaemon = true,
    dryRun = false,
  } = options;

  const targetPath = path.resolve(customPath || getDefaultWorktreePath(mainRoot, branch));

  if (!dryRun) {
    // 1. Prepare target parent directory
    const targetParent = path.dirname(targetPath);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }

    // 2. Check if branch already exists in git
    const branchExists = isLocalBranchExisting(branch, mainRoot);

    const gitArgs = ['worktree', 'add'];
    if (createBranch || !branchExists) {
      gitArgs.push('-b', branch, targetPath);
      if (baseBranch) {
        gitArgs.push(baseBranch);
      }
    } else {
      gitArgs.push(targetPath, branch);
    }

    execGit(gitArgs, mainRoot);
  }

  // 3. Auto-Seed configuration and secrets
  let seededFiles: SeededFile[] = [];
  if (seed) {
    const seedResult = seedWorktree({
      sourceRoot: mainRoot,
      targetRoot: targetPath,
      patterns: seedPatterns,
      dryRun,
    });
    seededFiles = seedResult.seeded;
  }

  // 4. Check Gradle Daemon compatibility
  let daemonReport;
  if (checkDaemon && !dryRun) {
    daemonReport = checkDaemonCompatibility(mainRoot, targetPath);
  }

  const worktree: WorktreeInfo = {
    path: targetPath,
    head: '',
    branch,
    isBare: false,
    isLocked: false,
    isDetached: false,
    isMain: false,
  };

  return {
    worktree,
    seededFiles,
    daemonReport,
  };
}

export function removeWorktree(options: WorktreeRemoveOptions, cwd: string = process.cwd()): { success: boolean; path: string } {
  const mainRoot = getMainRepoRoot(cwd);
  const worktrees = getWorktrees(mainRoot);

  const target = worktrees.find(
    (wt) => wt.branch === options.branchOrPath || path.resolve(wt.path) === path.resolve(options.branchOrPath)
  );

  if (!target) {
    throw new Error(`Worktree not found for: ${options.branchOrPath}`);
  }

  if (target.isMain) {
    throw new Error('Cannot remove the main repository worktree.');
  }

  const gitArgs = ['worktree', 'remove', target.path];
  if (options.force) {
    gitArgs.push('--force');
  }

  execGit(gitArgs, mainRoot);

  // Optional branch deletion
  if (options.deleteBranch && target.branch) {
    try {
      execGit(['branch', '-D', target.branch], mainRoot);
    } catch {
      // Ignore branch delete error
    }
  }

  // Optional manual leftover cleanup if any
  if (options.cleanBuildDir && dirExists(target.path)) {
    try {
      fs.rmSync(target.path, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }

  return {
    success: true,
    path: target.path,
  };
}

export function pruneWorktrees(cwd: string = process.cwd()): string {
  const mainRoot = getMainRepoRoot(cwd);
  return execGit(['worktree', 'prune', '-v'], mainRoot);
}

export function diagnoseProject(cwd: string = process.cwd()): DoctorReport {
  const isGit = isGitRepo(cwd);
  const mainRoot = isGit ? getMainRepoRoot(cwd) : cwd;
  const worktrees = isGit ? getWorktrees(mainRoot) : [];
  const daemonDiagnostics = diagnoseGradleEnvironment();
  const connectedDevices = getConnectedDevices();

  const recommendations: string[] = [];

  if (daemonDiagnostics.runningDaemons.length > 3) {
    recommendations.push(
      `You have ${daemonDiagnostics.runningDaemons.length} active Gradle Daemons. Consider running './gradlew --stop' to free RAM.`
    );
  }

  if (connectedDevices.length === 0) {
    recommendations.push('No Android device/emulator detected via adb. Build runner will default to arm64-v8a.');
  }

  return {
    gitVersion: getGitVersion(),
    isGitRepo: isGit,
    mainRepoRoot: mainRoot,
    worktreesCount: worktrees.length,
    daemonDiagnostics,
    connectedDevices,
    recommendations,
  };
}

function isLocalBranchExisting(branch: string, cwd: string): boolean {
  try {
    const out = execGit(['branch', '--list', branch], cwd);
    return out.length > 0;
  } catch {
    return false;
  }
}
