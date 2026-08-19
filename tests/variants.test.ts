import { describe, it, expect } from 'vitest';
import { parseVariants, flavorSpan, resolveVariant, assembleTaskFor } from '../src/core/variants.js';

// Verbatim shape of `./gradlew tasks --all -q` on a two-dimension fixture
// (tier: free/paid, env: dev/stage) with a library module alongside the app.
const TASKS_OUTPUT = `
Build tasks
-----------
assemble - Assembles the outputs of this project.
assembleDebug - Assembles main outputs for all Debug variants.
assembleFreeDev - Assembles main outputs for all FreeDev variants.
app:assembleFreeDevDebug - Assembles main output for variant freeDevDebug
app:assembleFreeDevDebugAndroidTest - Assembles main output for variant freeDevDebugAndroidTest
app:assembleFreeDevDebugUnitTest - Assembles main output for variant freeDevDebugUnitTest
app:assembleFreeStageDebug - Assembles main output for variant freeStageDebug
app:assemblePaidDevDebug - Assembles main output for variant paidDevDebug
app:assemblePaidStageDebug - Assembles main output for variant paidStageDebug
app:assembleFreeDevRelease - Assembles main output for variant freeDevRelease
lib:assembleDebug - Assembles main output for variant debug
lib:assembleRelease - Assembles main output for variant release
`;

describe('Variant discovery', () => {
  const variants = parseVariants(TASKS_OUTPUT);

  // `assembleFreeDev` reads like a variant but is an aggregate over four of
  // them, which is why the description decides rather than the task name.
  it('keeps only per-variant tasks, not aggregates', () => {
    expect(variants.map((v) => v.name)).not.toContain('Debug');
    expect(variants.map((v) => v.name)).toContain('freeDevDebug');
    expect(variants.some((v) => v.assembleTask === 'assembleFreeDev')).toBe(false);
  });

  it('drops test components', () => {
    expect(variants.map((v) => v.name)).not.toContain('freeDevDebugAndroidTest');
    expect(variants.map((v) => v.name)).not.toContain('freeDevDebugUnitTest');
  });

  it('qualifies tasks with their module', () => {
    const freeDevDebug = variants.find((v) => v.name === 'freeDevDebug');
    expect(freeDevDebug?.module).toBe(':app');
    expect(freeDevDebug?.assembleTask).toBe(':app:assembleFreeDevDebug');
  });

  // A library module's `debug` and the app's `freeDevDebug` are different
  // things that must not collapse into one entry.
  it('keeps same-named variants from different modules apart', () => {
    const debugs = variants.filter((v) => v.name === 'debug');
    expect(debugs).toHaveLength(1);
    expect(debugs[0]?.module).toBe(':lib');
  });
});

describe('flavorSpan', () => {
  const variants = parseVariants(TASKS_OUTPUT);

  it('reports the module that builds several variants at once', () => {
    const span = flavorSpan('assembleDebug', variants);
    expect(span).toHaveLength(1);
    expect(span[0]?.module).toBe(':app');
    expect(span[0]?.variants.map((v) => v.name).sort()).toEqual([
      'freeDevDebug',
      'freeStageDebug',
      'paidDevDebug',
      'paidStageDebug',
    ]);
  });

  // A 29-module project where every library defines its own `debug` is ordinary
  // structure, not something picking a variant would change.
  it('stays silent when each module has a single variant for the build type', () => {
    const flat = parseVariants(`
core:assembleDebug - Assembles main output for variant debug
data:assembleDebug - Assembles main output for variant debug
app:assembleDebug - Assembles main output for variant debug
`);
    expect(flavorSpan('assembleDebug', flat)).toEqual([]);
  });

  it('treats a module-qualified task as naming exactly one variant', () => {
    expect(flavorSpan(':app:assembleFreeDevDebug', variants)).toEqual([]);
  });
});

describe('resolveVariant', () => {
  const variants = parseVariants(TASKS_OUTPUT);

  it('resolves a unique name to its module-qualified task', () => {
    expect(resolveVariant('freeDevDebug', variants)).toEqual({
      ok: true,
      task: ':app:assembleFreeDevDebug',
    });
  });

  it('rejects an unknown name and offers the real ones', () => {
    const result = resolveVariant('nope', variants);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  // Discovery can fail (no wrapper, Gradle error); guessing the task and
  // letting Gradle report it beats refusing to build.
  it('falls back to the unqualified task when discovery found nothing', () => {
    expect(resolveVariant('freeDevDebug', [])).toEqual({
      ok: true,
      task: 'assembleFreeDevDebug',
    });
  });

  it('capitalises the variant for the fallback task name', () => {
    expect(assembleTaskFor('freeDevDebug')).toBe('assembleFreeDevDebug');
  });
});
