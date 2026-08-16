import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverSeedFiles, sanitizeLocalProperties, seedWorktree } from '../src/core/seeder.js';

describe('Seeder Module', () => {
  let tmpDir: string;
  let sourceRoot: string;
  let targetRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-seeder-test-'));
    sourceRoot = path.join(tmpDir, 'source');
    targetRoot = path.join(tmpDir, 'target');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(targetRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should discover seed files like local.properties and google-services.json', () => {
    fs.writeFileSync(path.join(sourceRoot, 'local.properties'), 'sdk.dir=/Users/test/Library/Android/sdk');
    fs.mkdirSync(path.join(sourceRoot, 'app'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'app', 'google-services.json'), '{"project_info": {}}');
    fs.writeFileSync(path.join(sourceRoot, 'app', 'release.keystore'), 'dummy_keystore');
    fs.writeFileSync(path.join(sourceRoot, 'README.md'), '# Hello');

    const discovered = discoverSeedFiles(sourceRoot);
    expect(discovered).toContain('local.properties');
    expect(discovered).toContain(path.join('app', 'google-services.json'));
    expect(discovered).toContain(path.join('app', 'release.keystore'));
    expect(discovered).not.toContain('README.md');
  });

  it('should sanitize local.properties to have a trailing newline', () => {
    const propPath = path.join(sourceRoot, 'local.properties');
    fs.writeFileSync(propPath, 'sdk.dir=/test/sdk'); // No newline at end
    sanitizeLocalProperties(propPath);

    const updated = fs.readFileSync(propPath, 'utf-8');
    expect(updated.endsWith('\n')).toBe(true);
  });

  it('should seed files from source to target worktree', () => {
    fs.writeFileSync(path.join(sourceRoot, 'local.properties'), 'sdk.dir=/test/sdk\n');
    fs.mkdirSync(path.join(sourceRoot, 'app'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'app', 'google-services.json'), '{}');

    const result = seedWorktree({
      sourceRoot,
      targetRoot,
      mode: 'copy',
    });

    expect(result.totalFiles).toBe(2);
    expect(fs.existsSync(path.join(targetRoot, 'local.properties'))).toBe(true);
    expect(fs.existsSync(path.join(targetRoot, 'app', 'google-services.json'))).toBe(true);
  });
});
