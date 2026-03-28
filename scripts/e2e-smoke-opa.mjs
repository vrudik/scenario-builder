/**
 * E2E с поднятым OPA: migrate → opa run --server → server.cjs (OPA_URL) → smoke:agent.
 *
 * Env: как e2e-smoke.mjs, плюс:
 *   E2E_OPA_PORT — порт OPA (по умолчанию 8181)
 *   E2E_OPA_STARTUP_MS — ожидание /health OPA (мс), по умолчанию 30000
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
import { getOpaBinaryPath } from './lib/get-opa-binary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 3000;
const OPA_PORT = Number.parseInt(process.env.E2E_OPA_PORT || '8181', 10) || 8181;
const OPA_HEALTH = `http://127.0.0.1:${OPA_PORT}/health`;
const OPA_URL = `http://127.0.0.1:${OPA_PORT}`;
const STATUS_URL = `http://127.0.0.1:${PORT}/api/status`;
const STARTUP_MS = Number.parseInt(process.env.E2E_SMOKE_STARTUP_MS || '60000', 10) || 60000;
const OPA_STARTUP_MS = Number.parseInt(process.env.E2E_OPA_STARTUP_MS || '30000', 10) || 30000;

const POLICY_FILES = [
  path.join(root, 'policies/scenario/tool.rego'),
  path.join(root, 'policies/scenario/lane.rego')
];

async function main() {
  process.chdir(root);

  const skipMig =
    process.env.E2E_SKIP_MIGRATE === '1' || process.env.E2E_SKIP_MIGRATE === 'true';
  if (!skipMig) {
    console.error('[e2e-smoke-opa] npx prisma migrate deploy …');
    const mig = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: root,
      stdio: 'inherit',
      shell: true
    });
    if (mig.status !== 0) {
      console.error('[e2e-smoke-opa] migrate deploy завершился с ошибкой');
      process.exit(mig.status ?? 1);
    }
  } else {
    console.error('[e2e-smoke-opa] пропуск миграций (E2E_SKIP_MIGRATE)');
  }

  let opa = null;
  let server = null;
  let exitCode = 1;

  try {
    await assertPortFree(OPA_PORT, '0.0.0.0');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const opaBin = await getOpaBinaryPath();
  console.error(`[e2e-smoke-opa] запуск OPA на ${OPA_URL} …`);
  opa = spawn(
    opaBin,
    ['run', '--server', `--addr=127.0.0.1:${OPA_PORT}`, ...POLICY_FILES],
    { cwd: root, stdio: 'inherit', env: { ...process.env } }
  );

  const opaExitW = watchChildExit(opa, 'e2e-smoke-opa/opa');
  try {
    await Promise.race([
      waitForHttpOk(OPA_HEALTH, { timeoutMs: OPA_STARTUP_MS }),
      opaExitW.p
    ]);
  } catch (e) {
    opaExitW.cancel();
    console.error(e instanceof Error ? e.message : e);
    stopSpawnedChild(opa);
    process.exit(1);
  }
  opaExitW.cancel();

  try {
    await assertPortFree(PORT, '0.0.0.0');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    stopSpawnedChild(opa);
    process.exit(1);
  }

  console.error(`[e2e-smoke-opa] запуск node server.cjs + OPA_URL=${OPA_URL} …`);
  server = spawn('node', ['server.cjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, OPA_URL }
  });

  const srvExitW = watchChildExit(server, 'e2e-smoke-opa/server');
  try {
    await Promise.race([
      waitForHttpOk(STATUS_URL, { timeoutMs: STARTUP_MS }),
      srvExitW.p
    ]);
    srvExitW.cancel();

    console.error('[e2e-smoke-opa] npm run smoke:agent …');
    const smoke = spawnSync('npm', ['run', 'smoke:agent'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        SMOKE_BASE_URL: `http://127.0.0.1:${PORT}`,
        OPA_URL
      }
    });
    exitCode = smoke.status === null ? 1 : smoke.status;
  } catch (e) {
    srvExitW.cancel();
    console.error(e instanceof Error ? e.message : e);
    exitCode = 1;
  } finally {
    stopSpawnedChild(server);
    stopSpawnedChild(opa);
  }

  if (exitCode === 0) {
    console.error('[e2e-smoke-opa] PASS');
  } else {
    console.error('[e2e-smoke-opa] FAIL (код ' + exitCode + ')');
  }
  process.exit(exitCode);
}

main();
