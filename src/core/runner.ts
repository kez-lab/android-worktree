import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import type { BuildOptions, BuildCommandResult, TargetAbi } from '../types/index.js';
import { fileExists } from '../utils/fs.js';
import { detectPrimaryTargetAbi } from './device.js';

/** Verification tasks worth excluding, and only these.
 *
 *  `testReleaseUnitTest` and `lintVitalAnalyzeRelease` used to be in this list.
 *  They are not: Gradle aborts the entire build when `-x` names a task it cannot
 *  find, and neither exists in a KMP or library-only project. Reproduced on
 *  Compose-DateTimePicker, where the default `aw build` failed with
 *  "Task 'testReleaseUnitTest' not found in root project 'Compose-Pickers'".
 *  These two are also the pair the README documents. */
const VERIFICATION_TASKS = ['lint', 'testDebugUnitTest'] as const;

/** Whether a task can drag verification into its graph at all.
 *
 *  `assemble` and `check` are siblings under `build`, so an assemble-style task
 *  never pulls in lint or unit tests and excluding them removes nothing.
 *  Measured on HMH-Android: `assembleDebug` produces a 955-task graph
 *  containing zero lint or unit-test tasks. Emitting `-x` there was pure
 *  downside — no work saved, and a build that dies outright if a name happens
 *  not to exist in this project. */
function pullsInVerification(task: string): boolean {
  const leaf = task.slice(task.lastIndexOf(':') + 1);
  return !/^(assemble|install|bundle|package)/i.test(leaf);
}

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
  if (skipVerification && pullsInVerification(task)) {
    for (const t of VERIFICATION_TASKS) {
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

  // `shell` only where it is unavoidable. With `shell: true` Node concatenates
  // argv into one command string with no quoting, so a task name or passthrough
  // argument containing `;` or `$(...)` runs as a separate command — verified:
  // `-t 'assembleDebug; echo PWNED'` executed the echo. Windows still needs it
  // because `gradlew.bat` cannot be spawned directly.
  const result = spawnSync(buildPlan.command, buildPlan.args, {
    cwd: projectDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return {
    success: result.status === 0,
    exitCode: result.status,
  };
}
