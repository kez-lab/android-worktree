import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { getDefaultWorktreePath } from '../src/core/worktree.js';

describe('Worktree Module', () => {
  it('should generate default worktree path based on parent repo and branch', () => {
    const mainRoot = '/Users/test/StudioProjects/MyAndroidApp';
    const branch = 'feature/login-screen';
    const targetPath = getDefaultWorktreePath(mainRoot, branch);

    expect(targetPath).toBe(
      path.join('/Users/test/StudioProjects', 'MyAndroidApp-worktrees', 'feature-login-screen')
    );
  });
});
