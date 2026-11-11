// Bundles the worker into one ESM file. better-sqlite3 stays external (native module),
// and the Drizzle migrations are copied next to the bundle.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: 'linked',
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});

cpSync('../../packages/core/drizzle', 'dist/drizzle', { recursive: true });
