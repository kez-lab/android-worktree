import { describe, it, expect } from 'vitest';
import { buildGradleArgs } from '../src/core/runner.js';

describe('Runner Module', () => {
  it('should inject --build-cache and skip verification tasks by default', () => {
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
    expect(plan.args).toContain('-x');
    expect(plan.args).toContain('lint');
    expect(plan.args).toContain('testDebugUnitTest');
  });

  it('should support configuration cache flag', () => {
    const plan = buildGradleArgs({
      configurationCache: true,
      abi: 'all',
    });

    expect(plan.args).toContain('--configuration-cache');
    expect(plan.args.some((a) => a.startsWith('-Pandroid.injected.build.abi='))).toBe(false);
  });
});
