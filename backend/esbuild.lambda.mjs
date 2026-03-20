import { build } from 'esbuild';
import esbuildPluginTsc from 'esbuild-plugin-tsc';

await build({
  entryPoints: ['src/lambda.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist/lambda.js',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  plugins: [
    esbuildPluginTsc({ force: true }),
  ],
  external: [
    // AWS SDK v3 is available in the Lambda runtime
    '@aws-sdk/*',
    '@smithy/*',
    // Optional NestJS packages (loaded dynamically, not used)
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
  ],
});
