import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/android-worktree': 'bin/android-worktree.ts',
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
