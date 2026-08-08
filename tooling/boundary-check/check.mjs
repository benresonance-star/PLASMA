/**
 * Dependency boundary tests (G0.2).
 * Fails if generic packages import OCCT, Gmsh, Three.js, or dome-reference application code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const FORBIDDEN_IMPORT_PATTERNS = [
  /opencascade/i,
  /occt/i,
  /\bgmsh\b/i,
  /three(?:\/|\.js|\b)/i,
  /@react-three\//i,
  /patterns\/dome-reference/,
  /@spds\/dome/,
];

/** Packages that may import kernel/renderer stacks. */
const ALLOWLIST_DIRS = new Set([
  path.join(root, 'services', 'geometry-occt'),
  path.join(root, 'services', 'meshing-adapter'),
  path.join(root, 'apps', 'designer-web'),
]);

const SCAN_ROOTS = [
  path.join(root, 'packages'),
  path.join(root, 'apps', 'api'),
  path.join(root, 'services', 'artifact-store'),
  path.join(root, 'services', 'import-worker'),
  path.join(root, 'services', 'analysis-worker'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isAllowlisted(file) {
  const normalized = path.normalize(file);
  for (const allowed of ALLOWLIST_DIRS) {
    if (normalized.startsWith(path.normalize(allowed) + path.sep)) return true;
  }
  return false;
}

const violations = [];

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    if (isAllowlisted(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const importLines = text
      .split(/\r?\n/)
      .filter((line) => /^\s*(?:import|export)\s.+from\s+['"]/.test(line) || /^\s*require\s*\(/.test(line));
    for (const line of importLines) {
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({ file: path.relative(root, file), line: line.trim(), pattern: String(pattern) });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('[boundary-check] FAILED — forbidden imports in generic packages:');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.line}`);
  }
  process.exit(1);
}

console.log('[boundary-check] OK — no generic package imports OCCT/Gmsh/Three.js/dome-reference');
process.exit(0);
