import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import type { BuildOptions, BuildCommandResult, TargetAbi } from '../types/index.js';
import { fileExists } from '../utils/fs.js';
import { detectPrimaryTargetAbi } from './device.js';

export function resolveGradleWrapper(projectDir: string = process.cwd()): string {
  const isWindows = process.platform === 'win32';
  const gradlewName = isWindows ? 'gradlew.bat' : 'gradlew';
  const gradlewPath = path.join(projectDir, gradlewName);

  if (fileExists(gradlewPath)) {
    return isWindows ? gradlewPath : `./${gradlewName}`;
  }
  return 'gradle';
}

export function buildGradleArgs(options: BuildOptions = {}): BuildCommandResult {
  const {
    task = 'assembleDebug',
    abi = 'auto',
    buildCache = true,
    configurationCache = false,
    skipVerification = true,
    parallel = true,
    extraArgs = [],
  } = options;

  const args: string[] = [task];
  const skippedTasks: string[] = [];

  // 1. Machine-wide build cache
  if (buildCache) {
    args.push('--build-cache');
  }

  // 2. Configuration cache
  if (configurationCache) {
    args.push('--configuration-cache');
  }

  // 3. Parallel execution
  if (parallel) {
    args.push('--parallel');
  }

  // 4. Target ABI injection
  let targetAbi: TargetAbi | undefined;
  if (abi === 'auto') {
    targetAbi = detectPrimaryTargetAbi();
  } else if (abi !== 'all') {
    targetAbi = abi;
  }

  if (targetAbi) {
    args.push(`-Pandroid.injected.build.abi=${targetAbi}`);
  }

  // 5. Skip non-essential verification tasks in debug dev cycles
  if (skipVerification) {
    const tasksToSkip = ['lint', 'testDebugUnitTest', 'testReleaseUnitTest', 'lintVitalAnalyzeRelease'];
    for (const t of tasksToSkip) {
      args.push('-x', t);
      skippedTasks.push(t);
    }
  }

  // 6. Append user extra args
  args.push(...extraArgs);

  return {
    command: resolveGradleWrapper(options.projectDir),
    args,
    injectedAbi: targetAbi,
    buildCacheEnabled: buildCache,
    configurationCacheEnabled: configurationCache,
    skippedTasks,
  };
}

export function executeGradleBuild(options: BuildOptions = {}): { success: boolean; exitCode: number | null } {
  const projectDir = options.projectDir ? path.resolve(options.projectDir) : process.cwd();
  const buildPlan = buildGradleArgs({ ...options, projectDir });

  if (options.dryRun) {
    return { success: true, exitCode: 0 };
  }

  const result = spawnSync(buildPlan.command, buildPlan.args, {
    cwd: projectDir,
    stdio: 'inherit',
    shell: true,
  });

  return {
    success: result.status === 0,
    exitCode: result.status,
  };
}
