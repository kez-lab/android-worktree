import { describe, it, expect } from 'vitest';
import { buildGradleArgs } from '../src/core/runner.js';

describe('Runner Module', () => {
  it('should inject --build-cache, --parallel and the target ABI by default', () => {
    const plan = buildGradleArgs({
      task: 'assembleDebug',
      buildCache: true,
      skipVerification: true,
      abi: 'arm64-v8a',
    });

    expect(plan.args).toContain('assembleDebug');
    expect(plan.args).toContain('--build-cache');
    expect(plan.args).toContain('--parallel');
    expect(plan.args).toContain('-Pandroid.injected.build.abi=arm64-v8a');
  });

  it('should support configuration cache flag', () => {
    const plan = buildGradleArgs({
      configurationCache: true,
      abi: 'all',
    });

    expect(plan.args).toContain('--configuration-cache');
    expect(plan.args.some((a) => a.startsWith('-Pandroid.injected.build.abi='))).toBe(false);
  });

  // `assemble` and `check` are siblings under `build`, so an assemble task never
  // pulls in lint or unit tests. Measured on HMH-Android: `assembleDebug` builds
  // a 955-task graph with zero of them. Excluding them saved nothing and only
  // risked aborting the build on a name the project does not define.
  it('should not exclude verification tasks for assemble-style tasks', () => {
    for (const task of ['assembleDebug', 'assembleRelease', 'installDebug', 'bundleRelease']) {
      const plan = buildGradleArgs({ task, skipVerification: true, abi: 'all' });
      expect(plan.args).not.toContain('-x');
      expect(plan.skippedTasks).toEqual([]);
    }
  });

  it('should exclude verification tasks for tasks that actually run them', () => {
    const plan = buildGradleArgs({ task: 'build', skipVerification: true, abi: 'all' });

    expect(plan.args).toContain('-x');
    expect(plan.skippedTasks).toContain('lint');
    expect(plan.skippedTasks).toContain('testDebugUnitTest');
  });

  it('should honour skipVerification: false', () => {
    const plan = buildGradleArgs({ task: 'build', skipVerification: false, abi: 'all' });

    expect(plan.args).not.toContain('-x');
    expect(plan.skippedTasks).toEqual([]);
  });

  // Regression: Gradle aborts the whole build when -x names a task it cannot
  // find. `aw build` failed on Compose-DateTimePicker (KMP) with
  // "Task 'testReleaseUnitTest' not found in root project 'Compose-Pickers'".
  it('should never exclude tasks that are absent from KMP or library projects', () => {
    for (const task of ['assembleDebug', 'build', 'check']) {
      const plan = buildGradleArgs({ task, skipVerification: true, abi: 'all' });
      expect(plan.skippedTasks).not.toContain('testReleaseUnitTest');
      expect(plan.skippedTasks).not.toContain('lintVitalAnalyzeRelease');
    }
  });
});
