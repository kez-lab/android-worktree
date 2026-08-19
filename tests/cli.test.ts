import { describe, it, expect } from 'vitest';
import { passthroughArgs } from '../src/cli.js';

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
});
