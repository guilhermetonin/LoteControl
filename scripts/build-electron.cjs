const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-electron');
fs.mkdirSync(output, { recursive: true });

Promise.all([
  esbuild.build({
    entryPoints: [path.join(root, 'electron', 'main.cjs')],
    outfile: path.join(output, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'sql.js'],
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: [path.join(root, 'electron', 'preload.ts')],
    outfile: path.join(output, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
  }),
]).then(() => console.log('Electron main e preload compilados.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
