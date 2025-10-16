#!/usr/bin/env node
const { build } = require('esbuild');

build({
  entryPoints: ['web/src/timer-widget.ts'],
  outfile: 'web/dist/timer-widget.js',
  bundle: true,
  format: 'esm',
  sourcemap: true,
}).catch((e) => {
  console.error(e);
  process.exit(1);
});


