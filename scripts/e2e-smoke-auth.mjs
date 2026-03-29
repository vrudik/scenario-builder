/**
 * E2E: server with AUTH_MODE=required — /api/status stays public; authenticated /api/auth/whoami works.
 *
 * Env: E2E_SKIP_MIGRATE, E2E_SMOKE_STARTUP_MS (same as e2e-smoke.mjs)
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  assertPortFree,
  stopSpawnedChild,
  waitForHttpOk,
  watchChildExit,
} from './lib/e2e-smoke-common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 3000;
const STATUS_URL = `http://127.0.0.1:${PORT}/api/status`;
const WHOAMI_URL = `http://127.0.0.1:${PORT}/api/auth/whoami`;
const STARTUP_MS = Number.parseInt(process.env.E2E_SMOKE_STARTUP_MS || '60000', 10) || 60000;
const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD || 'e2e_smoke_auth_pw';

async function main() {
  process.chdir(root);

  const skipMig =
    process.env.E2E_SKIP_MIGRATE === '1' || process.env.E2E_SKIP_MIGRATE === 'true';
  if (!skipMig) {
    const mig = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    if (mig.status !== 0) process.exit(mig.status ?? 1);
  }

  await assertPortFree(PORT, '0.0.0.0');

  const server = spawn('node', ['server.cjs'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      AUTH_MODE: 'required',
      ADMIN_PASSWORD: ADMIN_PW,
    },
  });

  const exitW = watchChildExit(server, 'e2e-smoke-auth');
  try {
    await Promise.race([waitForHttpOk(STATUS_URL, { timeoutMs: STARTUP_MS }), exitW.p]);
    exitW.cancel();

    const pub = await fetch(STATUS_URL);
    if (!pub.ok) throw new Error(`/api/status expected ok without auth, got ${pub.status}`);

    const denied = await fetch(WHOAMI_URL);
    if (denied.status !== 401) throw new Error(`/api/auth/whoami without auth expected 401, got ${denied.status}`);

    const ok = await fetch(WHOAMI_URL, {
      headers: { Authorization: `Bearer ${ADMIN_PW}` },
    });
    if (!ok.ok) throw new Error(`/api/auth/whoami with admin password expected ok, got ${ok.status}`);
    const body = await ok.json();
    if (!body.identity || body.identity.method !== 'admin_password') {
      throw new Error('whoami response missing admin_password identity');
    }

    console.error('[e2e-smoke-auth] PASS');
    process.exitCode = 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    stopSpawnedChild(server);
    process.exit(process.exitCode ?? 1);
  }
}

main();
