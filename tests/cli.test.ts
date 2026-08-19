import { describe, it, expect } from 'vitest';
import { argvWithoutPassthrough, passthroughArgs } from '../src/cli.js';

describe('CLI passthrough', () => {
  it('forwards everything after -- to Gradle', () => {
    expect(passthroughArgs(['node', 'aw', 'build', '.', '--', '--stacktrace', '--offline'])).toEqual([
      '--stacktrace',
      '--offline',
    ]);
  });

  it('returns nothing when no separator is present', () => {
    expect(passthroughArgs(['node', 'aw', 'build', '.', '--dry-run'])).toEqual([]);
  });

  // The old filter dropped every argument starting with '-', which silently
  // discarded exactly the Gradle flags a passthrough exists to carry.
  it('keeps flags rather than dropping them', () => {
    const forwarded = passthroughArgs(['node', 'aw', 'build', '--', '-PsomeProp=1', '--info']);
    expect(forwarded).toContain('-PsomeProp=1');
    expect(forwarded).toContain('--info');
  });

  // Commander assigns leftover operands positionally, so it must never see the
  // Gradle tail: `aw build -- --stacktrace` used to resolve the project
  // directory to "--stacktrace".
  it('hides the Gradle tail from the argument parser', () => {
    expect(argvWithoutPassthrough(['node', 'aw', 'build', '--', '--stacktrace'])).toEqual([
      'node',
      'aw',
      'build',
    ]);
  });

  it('leaves argv untouched when there is no separator', () => {
    const argv = ['node', 'aw', 'build', '.', '--dry-run'];
    expect(argvWithoutPassthrough(argv)).toEqual(argv);
  });

  it('splits argv and tail at the same point', () => {
    const argv = ['node', 'aw', 'build', '.', '--', '--info', '-PsomeProp=1'];
    expect(argvWithoutPassthrough(argv)).toEqual(['node', 'aw', 'build', '.']);
    expect(passthroughArgs(argv)).toEqual(['--info', '-PsomeProp=1']);
  });
});
