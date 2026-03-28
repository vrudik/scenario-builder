import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let serverProcess: ChildProcessWithoutNullStreams | null = null;

async function waitForServer(timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/demo-e2e`);
      if (response.ok) {
        return;
      }
    } catch {
      // сервер еще не поднялся
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverEntry = path.join(repoRoot, 'src', 'web', 'server.ts');

describe('Demo API smoke e2e', () => {
  beforeAll(async () => {
    serverProcess = spawn(process.execPath, [tsxCli, serverEntry], {
      cwd: repoRoot,
      env: { ...process.env, PORT: String(PORT) },
      // ignore stdout/stderr — иначе на Windows буфер pipe может забиться и зависнуть дочерний процесс
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    });

    serverProcess.stderr?.on('data', () => {
      // drain
    });

    await waitForServer(platform() === 'win32' ? 35000 : 20000);
  }, platform() === 'win32' ? 55000 : 35000);

  afterAll(() => {
    if (!serverProcess || serverProcess.killed) {
      return;
    }
    const pid = serverProcess.pid;
    try {
      if (platform() === 'win32' && pid) {
        try {
          serverProcess.kill();
        } catch {
          /* ignore */
        }
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch {
      serverProcess.kill();
    }
  });


  it('should expose liveness and readiness endpoints', async () => {
    const healthResponse = await fetch(`${BASE_URL}/healthz`);
    expect(healthResponse.ok).toBe(true);
    const healthBody = await healthResponse.json();

    expect(healthBody.status).toBe('ok');
    expect(typeof healthBody.uptimeSec).toBe('number');

    const readinessResponse = await fetch(`${BASE_URL}/readyz`);
    expect(readinessResponse.ok).toBe(true);
    const readinessBody = await readinessResponse.json();

    expect(readinessBody.status).toBe('ok');
    expect(readinessBody.checks?.staticAssetsAccessible).toBe(true);
    expect(readinessBody.checks?.demoApiAvailable).toBe(true);
  });

  it('should return demo brief payload', async () => {
    const response = await fetch(`${BASE_URL}/api/demo-e2e`);
    expect(response.ok).toBe(true);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.scenario?.id).toBe('demo-order-support');
    expect(Array.isArray(body.instructions)).toBe(true);
    expect(body.presentationMode?.oneClickAction).toBe('POST /api/demo-e2e/presentation-run');
    expect(body.presentationMode?.resetAction).toBe('POST /api/demo-e2e/reset');
  });

  it('should run presentation mode and return KPI/guardrail fields', async () => {
    const response = await fetch(`${BASE_URL}/api/demo-e2e/presentation-run`, {
      method: 'POST'
    });

    expect(response.ok).toBe(true);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.mode).toBe('presentation');
    expect(body.seedApplied).toBe(true);
    expect(body.result?.status).toBe('passed');
    expect(body.result?.metrics?.durationMs).toBeGreaterThan(0);
    expect(body.result?.metrics?.ttfrMs).toBeGreaterThan(0);
    expect(body.result?.metrics?.estimatedCostUsd).toBeGreaterThan(0);
    expect(body.result?.guardrail?.status).toBe('passed');
    expect(Array.isArray(body.result?.guardrail?.checks)).toBe(true);
  });



  it('should return about/trust payload with guardrails and observability snapshot', async () => {
    await fetch(`${BASE_URL}/api/demo-e2e/presentation-run`, { method: 'POST' });

    const response = await fetch(`${BASE_URL}/api/about-trust`);
    expect(response.ok).toBe(true);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.trust?.health?.liveness?.status).toBe('ok');
    expect(body.trust?.health?.readiness?.status).toBe('ok');
    expect(Array.isArray(body.trust?.guardrails?.checks)).toBe(true);
    expect(body.trust?.observability?.totalRuns).toBeGreaterThan(0);
  });

  it('should export demo report in json and pdf-lite formats', async () => {
    await fetch(`${BASE_URL}/api/demo-e2e/presentation-run`, { method: 'POST' });

    const jsonExportResponse = await fetch(`${BASE_URL}/api/demo-e2e/export?format=json`);
    expect(jsonExportResponse.ok).toBe(true);
    expect(jsonExportResponse.headers.get('content-type')).toContain('application/json');

    const jsonExportBody = await jsonExportResponse.json();
    expect(jsonExportBody.success).toBe(true);
    expect(jsonExportBody.report?.latestRun?.executionId).toContain('demo-exec-');
    expect(jsonExportBody.report?.metrics?.totalRuns).toBeGreaterThan(0);

    const pdfLiteResponse = await fetch(`${BASE_URL}/api/demo-e2e/export?format=pdf-lite`);
    expect(pdfLiteResponse.ok).toBe(true);
    expect(pdfLiteResponse.headers.get('content-type')).toContain('text/markdown');

    const pdfLiteBody = await pdfLiteResponse.text();
    expect(pdfLiteBody).toContain('# Demo Run Report (PDF-lite)');
    expect(pdfLiteBody).toContain('## KPI');
    expect(pdfLiteBody).toContain('## Guardrails');
  });

  it('should return metrics and support reset', async () => {
    const metricsResponse = await fetch(`${BASE_URL}/api/demo-e2e/metrics`);
    expect(metricsResponse.ok).toBe(true);
    const metricsBody = await metricsResponse.json();

    expect(metricsBody.success).toBe(true);
    expect(metricsBody.metrics.totalRuns).toBeGreaterThan(0);
    expect(metricsBody.metrics.successRatePct).toBeGreaterThanOrEqual(0);

    const resetResponse = await fetch(`${BASE_URL}/api/demo-e2e/reset`, {
      method: 'POST'
    });
    expect(resetResponse.ok).toBe(true);

    const resetBody = await resetResponse.json();
    expect(resetBody.success).toBe(true);
    expect(resetBody.state.totalRuns).toBe(0);
    expect(resetBody.state.successRatePct).toBe(0);
    expect(resetBody.state.lastRun).toBe(null);
  });
});
