/**
 * Собирает OPA bundle из policies/ (артефакт для opa run --server <bundle>).
 * Требует бинарь `opa` в PATH (та же версия, что в CI: см. .github/workflows/ci.yml).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const outDir = 'build';
const outFile = `${outDir}/opa-policy-bundle.tar.gz`;

fs.mkdirSync(outDir, { recursive: true });

const r = spawnSync(
  'opa',
  ['build', '-b', 'policies/', '-o', outFile],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
