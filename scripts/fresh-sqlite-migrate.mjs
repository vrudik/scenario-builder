/**
 * Удаляет локальный SQLite-файл(ы) dev.db и заново применяет миграции.
 * Нужен, если раньше использовали `prisma db push` и `migrate deploy` падает
 * (P3009 / «table already exists» / «failed migrations»).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const candidates = [
  'dev.db',
  'dev.db-journal',
  path.join('prisma', 'dev.db'),
  path.join('prisma', 'dev.db-journal')
];

for (const rel of candidates) {
  const p = path.join(root, rel);
  try {
    fs.unlinkSync(p);
    console.log('[fresh-sqlite-migrate] removed', rel);
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      throw e;
    }
  }
}

execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: root });
