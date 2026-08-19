import { Command } from 'commander';
import pc from 'picocolors';
import {
  listWorktreesWithStats,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  diagnoseProject,
} from './core/worktree.js';
import { seedWorktree } from './core/seeder.js';
import { buildGradleArgs, executeGradleBuild } from './core/runner.js';
import { logger } from './utils/logger.js';
import { getMainRepoRoot, isGitRepo } from './utils/git.js';
import type { TargetAbi } from './types/index.js';

/** Everything after `--` is forwarded to Gradle untouched.
 *
 *  Read from argv rather than commander's operands because the previous filter
 *  kept only arguments that did *not* start with `-`, which is exactly backwards
 *  for a passthrough — every Gradle flag was silently dropped before it could be
 *  forwarded. Taking the tail after `--` also keeps the optional `[path]`
 *  operand unambiguous. */
export function passthroughArgs(argv: string[] = process.argv): string[] {
  const separator = argv.indexOf('--');
  return separator === -1 ? [] : argv.slice(separator + 1);
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('android-worktree')
    .alias('aw')
    .description('🚀 High-performance Git worktree & Gradle build accelerator for Android projects')
    .version('0.1.0');

  // Command: add (create)
  program
    .command('add <branch> [path]')
    .alias('create')
    .description('Create a new git worktree with automatic config seeding and daemon compatibility guard')
    .option('-b, --base <baseBranch>', 'Base branch to branch off from')
    .option('--no-seed', 'Disable automatic seeding of local.properties, keystores, and secrets')
    .option('--no-daemon-check', 'Disable Gradle Daemon compatibility check')
    .option('--dry-run', 'Preview actions without executing')
    .action(async (branch, customPath, options) => {
      try {
        if (!isGitRepo()) {
          logger.error('Current directory is not inside a git repository.');
          process.exit(1);
        }

        // A dry run must not describe work it did not do. It previously printed
        // "Worktree created successfully" and marked every file "(copied)"
        // while creating nothing at all.
        const isDryRun = Boolean(options.dryRun);

        logger.heading(
          isDryRun
            ? `Previewing worktree creation for branch '${branch}' (dry run, nothing is written)...`
            : `Creating Worktree for branch '${branch}'...`
        );
        const result = createWorktree({
          branch,
          path: customPath,
          baseBranch: options.base,
          seed: options.seed,
          checkDaemon: options.daemonCheck,
          dryRun: options.dryRun,
        });

        if (isDryRun) {
          logger.info(`Would create worktree at: ${pc.cyan(result.worktree.path)}`);
        } else {
          logger.success(`Worktree created successfully at: ${pc.cyan(result.worktree.path)}`);
        }

        if (result.seededFiles.length > 0) {
          logger.info(
            isDryRun
              ? `Would seed ${result.seededFiles.length} secret/config files:`
              : `Seeded ${result.seededFiles.length} secret/config files:`
          );
          for (const s of result.seededFiles) {
            const done = s.action === 'copied' || s.action === 'symlinked';
            const statusIcon = done && !isDryRun ? pc.green('✓') : pc.yellow('•');
            const action = isDryRun && done ? `would ${s.action === 'copied' ? 'copy' : 'symlink'}` : s.action;
            console.log(`  ${statusIcon} ${s.relativePath} (${pc.dim(action)})`);
          }
        }

        if (result.daemonReport) {
          if (result.daemonReport.isCompatible) {
            logger.success('Gradle Daemon compatibility: 100% matched. JVM daemon will be reused!');
          } else {
            logger.warn('Gradle Daemon mismatch detected:');
            for (const r of result.daemonReport.risks) {
              console.log(`  ${pc.yellow('!')} ${r.message}`);
              console.log(`    ${pc.dim(`↳ Suggestion: ${r.suggestion}`)}`);
            }
          }
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: list
  program
    .command('list')
    .alias('ls')
    .description('List all git worktrees with build cache and disk usage')
    .action(() => {
      try {
        if (!isGitRepo()) {
          logger.error('Current directory is not inside a git repository.');
          process.exit(1);
        }

        const worktrees = listWorktreesWithStats();
        logger.heading(`Active Git Worktrees (${worktrees.length})`);

        for (const wt of worktrees) {
          const mainTag = wt.isMain ? pc.green('[main]') : pc.dim('[worktree]');
          const branchName = wt.branch ? pc.bold(pc.cyan(wt.branch)) : pc.yellow('(detached)');
          const sizeInfo = wt.buildDirSizeHuman ? pc.dim(`(build: ${wt.buildDirSizeHuman})`) : '';

          console.log(`${mainTag} ${branchName} ${sizeInfo}`);
          console.log(`  ${pc.dim(wt.path)}\n`);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: build (run)
  program
    .command('build [path]')
    .alias('run')
    .description('Execute optimized Gradle build with machine-wide cache and single-ABI injection')
    .option('-t, --task <task>', 'Gradle task to execute', 'assembleDebug')
    .option('-a, --abi <abi>', 'Target ABI (arm64-v8a, armeabi-v7a, x86_64, x86, auto, all)', 'auto')
    .option('--no-build-cache', 'Disable Gradle build cache')
    .option('--cc, --configuration-cache', 'Enable Gradle configuration cache')
    .option('--no-skip-verification', 'Do not skip lint and unit tests')
    .option('--dry-run', 'Print the generated Gradle command without running')
    .allowUnknownOption(true)
    // Operands after `--` are Gradle's, so commander must not reject them as
    // excess. `allowUnknownOption` alone was not enough: it permits unknown
    // *flags* but still enforces the operand count, so `aw build . --stacktrace`
    // failed with "too many arguments for 'build'".
    .allowExcessArguments(true)
    .action((targetPath, options) => {
      try {
        const extraArgs = passthroughArgs();
        const projectDir = targetPath || process.cwd();
        const plan = buildGradleArgs({
          projectDir,
          task: options.task,
          abi: options.abi as TargetAbi,
          buildCache: options.buildCache,
          configurationCache: options.configurationCache,
          skipVerification: options.skipVerification,
          extraArgs,
          dryRun: options.dryRun,
        });

        logger.box('Optimized Gradle Build Plan', [
          `Target Dir : ${projectDir}`,
          `Command    : ${plan.command} ${plan.args.join(' ')}`,
          `Target ABI : ${plan.injectedAbi || 'all architectures'}`,
          `Build Cache: ${plan.buildCacheEnabled ? 'Enabled (Machine-wide)' : 'Disabled'}`,
          `ConfigCache: ${plan.configurationCacheEnabled ? 'Enabled' : 'Disabled'}`,
          `Skipped    : ${plan.skippedTasks.join(', ') || 'None'}`,
        ]);

        if (!options.dryRun) {
          const res = executeGradleBuild({
            projectDir,
            task: options.task,
            abi: options.abi as TargetAbi,
            buildCache: options.buildCache,
            configurationCache: options.configurationCache,
            skipVerification: options.skipVerification,
            extraArgs,
          });

          if (!res.success) {
            process.exit(res.exitCode || 1);
          }
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: remove
  program
    .command('remove <branchOrPath>')
    .alias('rm')
    .description('Safely remove a git worktree and clean up residual files')
    .option('-f, --force', 'Force removal even with untracked/dirty files')
    .option('-D, --delete-branch', 'Delete the local git branch as well')
    .option('--clean-build', 'Clean residual build directories from disk')
    .action((branchOrPath, options) => {
      try {
        if (!isGitRepo()) {
          logger.error('Current directory is not inside a git repository.');
          process.exit(1);
        }

        const res = removeWorktree({
          branchOrPath,
          force: options.force,
          deleteBranch: options.deleteBranch,
          cleanBuildDir: options.cleanBuild,
        });

        logger.success(`Removed worktree at: ${pc.cyan(res.path)}`);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: prune
  program
    .command('prune')
    .description('Prune stale git worktree records')
    .action(() => {
      try {
        const out = pruneWorktrees();
        logger.success('Worktree prune complete.');
        if (out) console.log(pc.dim(out));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: seed
  program
    .command('seed [targetPath]')
    .description('Seed local.properties and secrets from main repo into target directory')
    .option('--symlink', 'Use symlinks instead of copying files')
    .action((targetPath, options) => {
      try {
        const mainRoot = getMainRepoRoot();
        const dest = targetPath || process.cwd();

        logger.heading(`Seeding config from ${pc.cyan(mainRoot)} to ${pc.cyan(dest)}...`);
        const result = seedWorktree({
          sourceRoot: mainRoot,
          targetRoot: dest,
          mode: options.symlink ? 'symlink' : 'copy',
        });

        logger.success(`Successfully seeded ${result.totalFiles} files (${result.totalBytes} bytes).`);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // Command: doctor (diagnose)
  program
    .command('doctor')
    .alias('diagnose')
    .description('Diagnose Gradle Daemons, machine-wide build cache, and Android worktree health')
    .action(() => {
      try {
        logger.heading('🔍 Android Worktree Doctor Diagnostic Report');
        const report = diagnoseProject();

        console.log(`${pc.bold('Git Version:')} ${report.gitVersion}`);
        console.log(`${pc.bold('Repository Root:')} ${report.mainRepoRoot}`);
        console.log(`${pc.bold('Worktrees Count:')} ${report.worktreesCount}`);
        console.log(`${pc.bold('Gradle User Home:')} ${report.daemonDiagnostics.gradleUserHome}`);
        console.log(
          `${pc.bold('Build Cache:')} ${report.daemonDiagnostics.buildCacheSizeHuman} (${report.daemonDiagnostics.buildCacheEntriesCount} entries)`
        );
        console.log(
          `${pc.bold('Active Gradle Daemons:')} ${report.daemonDiagnostics.runningDaemons.length}`
        );

        if (report.daemonDiagnostics.runningDaemons.length > 0) {
          for (const d of report.daemonDiagnostics.runningDaemons) {
            console.log(`  ${pc.cyan('•')} PID ${d.pid} (Gradle v${d.version}) - ${d.status}`);
          }
        }

        console.log(`\n${pc.bold('Connected Android Devices:')} ${report.connectedDevices.length}`);
        for (const dev of report.connectedDevices) {
          console.log(`  ${pc.green('•')} [${dev.id}] ${dev.model} (ABI: ${pc.bold(pc.yellow(dev.abi))})`);
        }

        if (report.recommendations.length > 0) {
          console.log(`\n${pc.bold(pc.yellow('Recommendations:'))}`);
          for (const rec of report.recommendations) {
            console.log(`  ${pc.yellow('!')} ${rec}`);
          }
        } else {
          console.log(`\n${pc.green('✔ Environment is in optimal health!')}`);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  return program;
}
