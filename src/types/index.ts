export type TargetAbi = 'arm64-v8a' | 'armeabi-v7a' | 'x86_64' | 'x86' | 'all';

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isLocked: boolean;
  isDetached: boolean;
  isMain: boolean;
  buildDirSizeHuman?: string;
  buildDirSizeBytes?: number;
}

export interface WorktreeCreateOptions {
  branch: string;
  path?: string;
  baseBranch?: string;
  createBranch?: boolean;
  seed?: boolean;
  seedPatterns?: string[];
  checkDaemon?: boolean;
  dryRun?: boolean;
}

export interface WorktreeCreateResult {
  worktree: WorktreeInfo;
  seededFiles: SeededFile[];
  daemonReport?: DaemonCompatibilityReport;
}

export interface WorktreeRemoveOptions {
  branchOrPath: string;
  force?: boolean;
  cleanBuildDir?: boolean;
  deleteBranch?: boolean;
}

export interface SeededFile {
  relativePath: string;
  sourcePath: string;
  targetPath: string;
  action: 'copied' | 'symlinked' | 'skipped' | 'failed';
  reason?: string;
  sizeBytes?: number;
}

export interface SeederOptions {
  sourceRoot: string;
  targetRoot: string;
  mode?: 'copy' | 'symlink';
  patterns?: string[];
  overwrite?: boolean;
  dryRun?: boolean;
}

export interface SeederResult {
  seeded: SeededFile[];
  totalFiles: number;
  totalBytes: number;
}

export interface GradleConfig {
  jvmArgs?: string;
  gradleVersion?: string;
  javaVersion?: string;
  buildCacheEnabled?: boolean;
  configurationCacheEnabled?: boolean;
}

export interface DaemonForkRisk {
  type: 'gradle_version' | 'jvm_args' | 'java_home' | 'system_prop';
  severity: 'high' | 'medium' | 'low';
  message: string;
  mainValue?: string;
  worktreeValue?: string;
  suggestion: string;
}

export interface DaemonCompatibilityReport {
  isCompatible: boolean;
  risks: DaemonForkRisk[];
  mainConfig: GradleConfig;
  worktreeConfig: GradleConfig;
}

export interface RunningDaemon {
  pid: number;
  version: string;
  status: 'idle' | 'busy' | 'canceled' | 'unknown';
  jvmArgs?: string;
  lastUsed?: Date;
}

export interface DaemonDiagnosticResult {
  runningDaemons: RunningDaemon[];
  gradleUserHome: string;
  buildCacheDir: string;
  buildCacheSizeBytes: number;
  buildCacheSizeHuman: string;
  buildCacheEntriesCount: number;
}

export interface ConnectedDevice {
  id: string;
  model: string;
  abi: TargetAbi;
  isEmulator: boolean;
  state: 'device' | 'offline' | 'unauthorized';
}

export interface BuildOptions {
  projectDir?: string;
  task?: string;
  abi?: TargetAbi | 'auto';
  buildCache?: boolean;
  configurationCache?: boolean;
  skipVerification?: boolean;
  parallel?: boolean;
  extraArgs?: string[];
  dryRun?: boolean;
}

export interface BuildCommandResult {
  command: string;
  args: string[];
  injectedAbi?: TargetAbi;
  buildCacheEnabled: boolean;
  configurationCacheEnabled: boolean;
  skippedTasks: string[];
}

export interface DoctorReport {
  gitVersion: string;
  isGitRepo: boolean;
  mainRepoRoot: string;
  worktreesCount: number;
  daemonDiagnostics: DaemonDiagnosticResult;
  connectedDevices: ConnectedDevice[];
  recommendations: string[];
}
