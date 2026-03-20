import { context } from 'esbuild';

const ctx = await context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist/index.js',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['@aws-sdk/*', '@smithy/*'],
  logLevel: 'info',
});

await ctx.watch();
console.log('esbuild watching for changes...');
