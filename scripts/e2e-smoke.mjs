/**
 * Локальный E2E: prisma migrate deploy → node server.cjs → npm run smoke:agent → остановка сервера.
 *
 * Требования: из корня репозитория, зависимости установлены (`npm ci` / `npm install`), свободен порт 3000.
 *
 * Env:
 *   E2E_SKIP_MIGRATE=1  — пропустить migrate deploy
 *   E2E_SMOKE_STARTUP_MS — таймаут ожидания /api/status (мс), по умолчанию 60000
 *   SMOKE_TENANT, SMOKE_BASE_URL — пробрасываются в smoke:agent (BASE перезапишется на http://127.0.0.1:3000)
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  assertPortFree,
  stopSpawnedChild,
  waitForHttpOk,
  watchChildExit
} from './lib/e2e-smoke-common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 3000;
const STATUS_URL = `http://127.0.0.1:${PORT}/api/status`;
const STARTUP_MS = Number.parseInt(process.env.E2E_SMOKE_STARTUP_MS || '60000', 10) || 60000;

async function main() {
  process.chdir(root);

  const skipMig =
    process.env.E2E_SKIP_MIGRATE === '1' || process.env.E2E_SKIP_MIGRATE === 'true';
  if (!skipMig) {
    console.error('[e2e-smoke] npx prisma migrate deploy …');
    const mig = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: root,
      stdio: 'inherit',
      shell: true
    });
    if (mig.status !== 0) {
      console.error('[e2e-smoke] migrate deploy завершился с ошибкой');
      process.exit(mig.status ?? 1);
    }
  } else {
    console.error('[e2e-smoke] пропуск миграций (E2E_SKIP_MIGRATE)');
  }

  try {
    await assertPortFree(PORT, '0.0.0.0');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.error(`[e2e-smoke] запуск node server.cjs (ожидаем порт ${PORT}) …`);
  const server = spawn('node', ['server.cjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env }
  });

  const exitW = watchChildExit(server, 'e2e-smoke');
  let exitCode = 1;
  try {
    await Promise.race([
      waitForHttpOk(STATUS_URL, { timeoutMs: STARTUP_MS }),
      exitW.p
    ]);
    exitW.cancel();

    console.error('[e2e-smoke] npm run smoke:agent …');
    const smokeEnv = {
      ...process.env,
      SMOKE_BASE_URL: `http://127.0.0.1:${PORT}`
    };
    const smoke = spawnSync('npm', ['run', 'smoke:agent'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: smokeEnv
    });
    exitCode = smoke.status === null ? 1 : smoke.status;
  } catch (e) {
    exitW.cancel();
    console.error(e instanceof Error ? e.message : e);
    exitCode = 1;
  } finally {
    stopSpawnedChild(server);
  }

  if (exitCode === 0) {
    console.error('[e2e-smoke] PASS');
  } else {
    console.error('[e2e-smoke] FAIL (код ' + exitCode + ')');
  }
  process.exit(exitCode);
}

main();
