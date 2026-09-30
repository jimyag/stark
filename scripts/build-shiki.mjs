// Bundle a lazy-loaded shiki highlighter for the github-file shortcode.
// Output goes to static/js/vendor/shiki.js so Hugo serves it as a static asset.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const theme = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: theme,
  entryPoints: [{ in: 'scripts/shiki-entry.mjs', out: 'shiki' }],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  outdir: 'static/js/vendor',
  logLevel: 'info',
});
