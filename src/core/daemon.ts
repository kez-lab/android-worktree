import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  GradleConfig,
  DaemonCompatibilityReport,
  DaemonForkRisk,
  DaemonDiagnosticResult,
  RunningDaemon,
} from '../types/index.js';
import { fileExists, dirExists, readFileSafe, formatBytes, getDirectorySizeBytes, countFiles } from '../utils/fs.js';

export function getGradleUserHome(): string {
  if (process.env.GRADLE_USER_HOME) {
    return path.resolve(process.env.GRADLE_USER_HOME);
  }
  return path.join(os.homedir(), '.gradle');
}

export function parseGradleProperties(projectRoot: string): GradleConfig {
  const propsPath = path.join(projectRoot, 'gradle.properties');
  const content = readFileSafe(propsPath);
  const config: GradleConfig = {};

  if (!content) return config;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();

    if (key === 'org.gradle.jvmargs') {
      config.jvmArgs = val;
    } else if (key === 'org.gradle.caching') {
      config.buildCacheEnabled = val === 'true';
    } else if (key === 'org.gradle.configuration-cache') {
      config.configurationCacheEnabled = val === 'true';
    } else if (key === 'org.gradle.java.home') {
      config.javaVersion = val;
    }
  }

  return config;
}

export function parseGradleWrapperVersion(projectRoot: string): string | undefined {
  const wrapperPropsPath = path.join(projectRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const content = readFileSafe(wrapperPropsPath);
  if (!content) return undefined;

  const match = content.match(/distributionUrl=.*gradle-([0-9.]+)-(bin|all)\.zip/);
  if (match && match[1]) {
    return match[1];
  }
  return undefined;
}

export function extractGradleConfig(projectRoot: string): GradleConfig {
  const props = parseGradleProperties(projectRoot);
  const wrapperVersion = parseGradleWrapperVersion(projectRoot);
  return {
    ...props,
    gradleVersion: wrapperVersion,
  };
}

/**
 * Compares two Gradle configurations to check for Daemon forking risks.
 */
export function checkDaemonCompatibility(mainRoot: string, worktreeRoot: string): DaemonCompatibilityReport {
  const mainConfig = extractGradleConfig(mainRoot);
  const worktreeConfig = extractGradleConfig(worktreeRoot);
  const risks: DaemonForkRisk[] = [];

  // 1. Check Gradle Version (High Risk)
  if (mainConfig.gradleVersion && worktreeConfig.gradleVersion && mainConfig.gradleVersion !== worktreeConfig.gradleVersion) {
    risks.push({
      type: 'gradle_version',
      severity: 'high',
      message: `Gradle version mismatch (Main: v${mainConfig.gradleVersion} vs Worktree: v${worktreeConfig.gradleVersion})`,
      mainValue: mainConfig.gradleVersion,
      worktreeValue: worktreeConfig.gradleVersion,
      suggestion: 'Different Gradle versions will always spawn separate Gradle Daemons, increasing memory overhead.',
    });
  }

  // 2. Check JVM Args (Medium Risk)
  if (mainConfig.jvmArgs && worktreeConfig.jvmArgs && mainConfig.jvmArgs !== worktreeConfig.jvmArgs) {
    risks.push({
      type: 'jvm_args',
      severity: 'medium',
      message: 'org.gradle.jvmargs mismatch between main and worktree',
      mainValue: mainConfig.jvmArgs,
      worktreeValue: worktreeConfig.jvmArgs,
      suggestion: 'Different jvmargs cause Gradle to fork a separate daemon for each configuration.',
    });
  }

  // 3. Check Java Home
  if (mainConfig.javaVersion && worktreeConfig.javaVersion && mainConfig.javaVersion !== worktreeConfig.javaVersion) {
    risks.push({
      type: 'java_home',
      severity: 'high',
      message: 'org.gradle.java.home mismatch',
      mainValue: mainConfig.javaVersion,
      worktreeValue: worktreeConfig.javaVersion,
      suggestion: 'Different JVM runtimes require separate daemon processes.',
    });
  }

  return {
    isCompatible: risks.length === 0,
    risks,
    mainConfig,
    worktreeConfig,
  };
}

/**
 * Diagnoses running Gradle daemons and machine-wide build cache.
 */
export function diagnoseGradleEnvironment(): DaemonDiagnosticResult {
  const gradleUserHome = getGradleUserHome();
  const daemonBaseDir = path.join(gradleUserHome, 'daemon');
  const buildCacheDir = path.join(gradleUserHome, 'caches', 'build-cache-1');

  const runningDaemons: RunningDaemon[] = [];

  if (dirExists(daemonBaseDir)) {
    try {
      const versionDirs = fs.readdirSync(daemonBaseDir, { withFileTypes: true });
      for (const vDir of versionDirs) {
        if (!vDir.isDirectory()) continue;
        const vPath = path.join(daemonBaseDir, vDir.name);
        const daemonFiles = fs.readdirSync(vPath);

        for (const file of daemonFiles) {
          if (file.endsWith('.out.log')) {
            const pidStr = file.replace('.out.log', '').match(/daemon-(\d+)/)?.[1];
            if (pidStr) {
              const pid = parseInt(pidStr, 10);
              let status: RunningDaemon['status'] = 'idle';
              try {
                process.kill(pid, 0); // Check if process is alive
                status = 'idle';
              } catch {
                status = 'canceled'; // Process dead
              }

              if (status !== 'canceled') {
                runningDaemons.push({
                  pid,
                  version: vDir.name,
                  status,
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore daemon read errors
    }
  }

  const buildCacheSizeBytes = getDirectorySizeBytes(buildCacheDir);
  const buildCacheEntriesCount = countFiles(buildCacheDir);

  return {
    runningDaemons,
    gradleUserHome,
    buildCacheDir,
    buildCacheSizeBytes,
    buildCacheSizeHuman: formatBytes(buildCacheSizeBytes),
    buildCacheEntriesCount,
  };
}
