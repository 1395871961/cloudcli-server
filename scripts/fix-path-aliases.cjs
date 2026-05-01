/**
 * Post-build script: replaces unresolved TypeScript path aliases (@/*) with
 * correct relative paths in all compiled dist-server JS files.
 *
 * Alias mapping (from server/tsconfig.json):
 *   @/* -> server/*   (relative to project root, compiles to dist-server/server/*)
 *
 * So `from '@/foo/bar.js'` in any dist-server file should become a relative
 * path pointing to `dist-server/server/foo/bar.js`.
 */

const fs = require('fs');
const path = require('path');

const DIST_ROOT = path.join(__dirname, '..', 'dist-server');

function* walkJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJs(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

let filesFixed = 0;
let importsFixed = 0;

for (const filePath of walkJs(DIST_ROOT)) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (!src.includes("'@/") && !src.includes('"@/')) continue;

  // Target base: @/* maps to dist-server/server/*
  const aliasBase = path.join(DIST_ROOT, 'server');
  const fileDir = path.dirname(filePath);

  const fixed = src.replace(/(['"])@\/([^'"]+)\1/g, (match, quote, alias) => {
    const targetAbs = path.join(aliasBase, alias);
    let rel = path.relative(fileDir, targetAbs).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    importsFixed++;
    return `${quote}${rel}${quote}`;
  });

  if (fixed !== src) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    filesFixed++;
    console.log('Fixed:', path.relative(DIST_ROOT, filePath));
  }
}

console.log(`\nDone: fixed ${importsFixed} imports in ${filesFixed} files.`);
