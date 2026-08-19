import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VariantInfo } from '../types/index.js';
import { resolveGradleWrapper } from './runner.js';

/** AGP labels a per-variant task differently from an aggregate one:
 *
 *    assembleDebug            - Assembles main outputs for all Debug variants.
 *    app:assembleFreeDevDebug - Assembles main output for variant freeDevDebug
 *
 *  The singular "output for variant <name>" form is what identifies a real
 *  build variant, which is why the description is parsed rather than the task
 *  name — `assembleFreeDev` reads like a variant but assembles four of them.
 *  Subproject tasks arrive module-qualified and without a leading colon. */
const VARIANT_LINE = /^([A-Za-z0-9_\-.:]+)\s+-\s+Assembles main output for variant (\w+)$/;

const TEST_SUFFIXES = ['AndroidTest', 'UnitTest'];

const DISCOVERY_TIMEOUT_MS = 120_000;

/** Variants the project actually defines, discovered by asking Gradle.
 *
 *  Reading `build.gradle` would not do: flavor dimensions combine into variant
 *  names that only AGP computes, so a two-dimension project with three build
 *  types yields twelve names, none of which appear literally in the script. */
export function discoverVariants(projectDir: string = process.cwd()): VariantInfo[] {
  const result = spawnSync(resolveGradleWrapper(projectDir), ['tasks', '--all', '-q'], {
    cwd: path.resolve(projectDir),
    encoding: 'utf-8',
    timeout: DISCOVERY_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return parseVariants(result.stdout);
}

/** Exported for tests: the parsing is the part with the edge cases. */
export function parseVariants(tasksOutput: string): VariantInfo[] {
  const seen = new Set<string>();
  const variants: VariantInfo[] = [];

  for (const rawLine of tasksOutput.split('\n')) {
    const match = VARIANT_LINE.exec(rawLine.trim());
    if (!match) continue;

    const [, taskPath, name] = match;
    if (!taskPath || !name) continue;
    // `freeDevDebugUnitTest` belongs to the test component, not to anything a
    // developer installs on a device.
    if (TEST_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;

    const segments = taskPath.split(':').filter(Boolean);
    const taskName = segments.pop() as string;
    const modulePath = segments.length > 0 ? `:${segments.join(':')}` : '';

    // Same variant name can exist in several modules (a library module has a
    // plain `debug`, the app has `freeDevDebug`), so identity is module+name.
    const key = `${modulePath}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    variants.push({
      name,
      module: modulePath,
      assembleTask: modulePath === '' ? taskName : `${modulePath}:${taskName}`,
    });
  }

  return variants;
}

/** The task that builds only `variant`, used when discovery found nothing. */
export function assembleTaskFor(variant: string): string {
  return `assemble${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
}

export type VariantResolution =
  | { ok: true; variant: VariantInfo }
  | { ok: false; reason: string; candidates: VariantInfo[] };

/** Compose the task that applies `verbTask`'s action to one variant.
 *
 *  The verb has to be carried over, not assumed. `--variant` used to resolve
 *  straight to the assemble task, so `-t installDebug --variant freeDevDebug`
 *  silently assembled instead of installing, and `-t bundleRelease` produced an
 *  APK where an AAB was asked for — both reported as success. */
export function variantTaskFor(verbTask: string, variant: VariantInfo): string {
  const verb = /^[a-z]+/.exec(verbTask)?.[0] ?? 'assemble';
  const name = `${variant.name.charAt(0).toUpperCase()}${variant.name.slice(1)}`;
  return variant.module === '' ? `${verb}${name}` : `${variant.module}:${verb}${name}`;
}

/** Resolve `--variant` against what the project defines.
 *
 *  Ambiguity is an error rather than a guess: `debug` can name a library
 *  module's variant and nothing in the app, and silently assembling the wrong
 *  module would look like a successful build of the wrong thing. */
export function resolveVariant(variant: string, variants: VariantInfo[]): VariantResolution {
  if (variants.length === 0) {
    // Discovery unavailable — carry the name through unqualified and let Gradle
    // report it if it is wrong.
    return { ok: true, variant: { name: variant, module: '', assembleTask: assembleTaskFor(variant) } };
  }

  const matches = variants.filter((v) => v.name.toLowerCase() === variant.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, variant: matches[0] as VariantInfo };
  }
  if (matches.length === 0) {
    return { ok: false, reason: `Unknown variant '${variant}'.`, candidates: variants };
  }
  return {
    ok: false,
    reason: `Variant '${variant}' exists in ${matches.length} modules.`,
    candidates: matches,
  };
}

/** Modules where a build-type aggregate would build more than one variant.
 *
 *  Grouped by module on purpose. A 29-module Android project has 29 library
 *  modules each defining a `debug` variant, and an unqualified `assembleDebug`
 *  legitimately visits all of them — that is ordinary project structure and
 *  picking a variant does not change it. What a developer can act on is one
 *  module producing several variants at once, which is what flavor dimensions
 *  do: on a two-dimension fixture `assembleDebug` runs 215 tasks and packages
 *  four APKs from `:app`, where `:app:assembleFreeDevDebug` runs 72 and
 *  packages one. */
export function flavorSpan(
  task: string,
  variants: VariantInfo[]
): { module: string; variants: VariantInfo[] }[] {
  // A module-qualified task names one variant in one module.
  if (task.includes(':')) return [];

  const suffix = task.replace(/^assemble/i, '').toLowerCase();
  if (suffix === '') return [];

  const byModule = new Map<string, VariantInfo[]>();
  for (const variant of variants) {
    if (!variant.name.toLowerCase().endsWith(suffix)) continue;
    const bucket = byModule.get(variant.module);
    if (bucket) {
      bucket.push(variant);
    } else {
      byModule.set(variant.module, [variant]);
    }
  }

  return [...byModule.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([module, group]) => ({ module, variants: group }));
}

const FLAVOR_DECLARATION = /\b(productFlavors|flavorDimensions)\b/;

const BUILD_FILE = /^(build\.gradle(\.kts)?|.*\.gradle(\.kts)?)$/;

const SKIP_DIRS = new Set(['build', '.git', '.gradle', '.idea', 'node_modules', 'dist', 'out']);

/** Cheap pre-check for whether asking Gradle is worth 1.4 seconds.
 *
 *  `tasks --all` is the only reliable way to enumerate variants, but it costs a
 *  Gradle invocation on every build, and the answer only ever changes something
 *  for projects that declare flavors. Grepping the build scripts for a flavor
 *  declaration takes milliseconds and is conservative in the right direction:
 *  when in doubt it returns true and the full discovery runs. Convention
 *  plugins are covered because `build-logic`/`buildSrc` sources are scanned
 *  too. */
export function mayHaveFlavors(projectDir: string = process.cwd(), maxDepth = 4): boolean {
  const walk = (dir: string, depth: number): boolean => {
    if (depth > maxDepth) return false;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
    } catch {
      return false;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (walk(full, depth + 1)) return true;
        continue;
      }
      if (!BUILD_FILE.test(entry.name) && !entry.name.endsWith('.kt')) continue;
      try {
        if (FLAVOR_DECLARATION.test(fs.readFileSync(full, 'utf-8'))) return true;
      } catch {
        // Unreadable file tells us nothing; keep looking.
      }
    }
    return false;
  };

  return walk(path.resolve(projectDir), 0);
}
