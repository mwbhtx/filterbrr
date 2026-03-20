/**
 * Post-build bundle verification test.
 * Ensures the esbuild output correctly inlines filter-engine exports.
 * Run after `npm run build`: node bundle.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, 'dist/index.js');

// 1. Verify the bundle file exists
let bundleContent;
try {
  bundleContent = readFileSync(bundlePath, 'utf-8');
} catch {
  console.error('FAIL: dist/index.js does not exist. Run `npm run build` first.');
  process.exit(1);
}

// 2. Verify filter-engine functions are inlined (not require'd as external)
const expectedFunctions = [
  'parseSizeStr',
  'torrentMatchesFilter',
  'matchExceptReleases',
  'matchCategoryPattern',
  'runSimulation',
];

for (const fn of expectedFunctions) {
  assert.ok(
    bundleContent.includes(fn),
    `Bundle is missing filter-engine export: ${fn}`,
  );
}

// 3. Verify filter-engine is NOT referenced as an external require
const externalRequire = /require\(["']filter-engine["']\)/;
assert.ok(
  !externalRequire.test(bundleContent),
  'Bundle has an external require("filter-engine") — it should be inlined',
);

// 4. Verify AWS SDK IS external (should not be bundled)
assert.ok(
  !bundleContent.includes('@aws-sdk/client-s3/dist'),
  'Bundle contains @aws-sdk internals — it should be external',
);

console.log('PASS: Bundle correctly inlines filter-engine and externalizes AWS SDK');
