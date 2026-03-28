/**
 * Запуск `opa test policies/`: сначала бинарь из PATH, иначе — скачивание OPA v0.69.0 (как в CI).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOpaBinaryPath } from './lib/get-opa-binary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const opaPath = await getOpaBinaryPath();
const r = spawnSync(opaPath, ['test', 'policies/'], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
