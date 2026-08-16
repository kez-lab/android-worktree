import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseGradleProperties,
  parseGradleWrapperVersion,
  checkDaemonCompatibility,
} from '../src/core/daemon.js';

describe('Daemon Module', () => {
  let tmpDir: string;
  let mainRoot: string;
  let worktreeRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-daemon-test-'));
    mainRoot = path.join(tmpDir, 'main');
    worktreeRoot = path.join(tmpDir, 'worktree');
    fs.mkdirSync(mainRoot, { recursive: true });
    fs.mkdirSync(worktreeRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should parse gradle.properties for jvmargs and caching', () => {
    const propsContent = `
# Comment
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
org.gradle.caching=true
org.gradle.configuration-cache=true
`;
    fs.writeFileSync(path.join(mainRoot, 'gradle.properties'), propsContent);

    const config = parseGradleProperties(mainRoot);
    expect(config.jvmArgs).toBe('-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    expect(config.buildCacheEnabled).toBe(true);
    expect(config.configurationCacheEnabled).toBe(true);
  });

  it('should parse gradle-wrapper.properties for gradle version', () => {
    const wrapperDir = path.join(mainRoot, 'gradle', 'wrapper');
    fs.mkdirSync(wrapperDir, { recursive: true });
    fs.writeFileSync(
      path.join(wrapperDir, 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\n'
    );

    const version = parseGradleWrapperVersion(mainRoot);
    expect(version).toBe('8.7');
  });

  it('should detect Daemon fork risk when gradle versions differ', () => {
    const mainWrapper = path.join(mainRoot, 'gradle', 'wrapper');
    const wtWrapper = path.join(worktreeRoot, 'gradle', 'wrapper');
    fs.mkdirSync(mainWrapper, { recursive: true });
    fs.mkdirSync(wtWrapper, { recursive: true });

    fs.writeFileSync(
      path.join(mainWrapper, 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\n'
    );
    fs.writeFileSync(
      path.join(wtWrapper, 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip\n'
    );

    const report = checkDaemonCompatibility(mainRoot, worktreeRoot);
    expect(report.isCompatible).toBe(false);
    expect(report.risks.some((r) => r.type === 'gradle_version')).toBe(true);
  });

  it('should report compatible when gradle versions and jvmargs match', () => {
    const mainWrapper = path.join(mainRoot, 'gradle', 'wrapper');
    const wtWrapper = path.join(worktreeRoot, 'gradle', 'wrapper');
    fs.mkdirSync(mainWrapper, { recursive: true });
    fs.mkdirSync(wtWrapper, { recursive: true });

    fs.writeFileSync(
      path.join(mainWrapper, 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\n'
    );
    fs.writeFileSync(
      path.join(wtWrapper, 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\n'
    );

    fs.writeFileSync(path.join(mainRoot, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx4g\n');
    fs.writeFileSync(path.join(worktreeRoot, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx4g\n');

    const report = checkDaemonCompatibility(mainRoot, worktreeRoot);
    expect(report.isCompatible).toBe(true);
    expect(report.risks.length).toBe(0);
  });
});
