/**
 * G0A.2 licence inventory check — ensures register doc exists and
 * contains required dependency rows. Full SPDX scanning lands later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registerPath = path.join(root, 'docs/governance/dependency-licence-register.md');

if (!fs.existsSync(registerPath)) {
  console.error('[licence:check] missing dependency-licence-register.md');
  process.exit(1);
}

const text = fs.readFileSync(registerPath, 'utf8');
const required = ['postgres', 'minio', 'OpenCascade', 'Gmsh', 'typescript'];
const missing = required.filter((name) => !text.includes(name));
if (missing.length > 0) {
  console.error('[licence:check] register missing required entries:', missing.join(', '));
  process.exit(1);
}

if (!text.includes('AGPL') && !text.includes('server-only')) {
  console.error('[licence:check] register must discuss distribution-sensitive licences');
  process.exit(1);
}

console.log('[licence:check] OK — dependency/licence register present with required rows');
process.exit(0);
