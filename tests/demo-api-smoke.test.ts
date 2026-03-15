import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

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

describe('Demo API smoke e2e', () => {
  beforeAll(async () => {
    serverProcess = spawn('npx', ['tsx', 'src/web/server.ts'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe'
    });

    serverProcess.stderr.on('data', () => {
      // глушим шум, но оставляем поток подключенным
    });

    await waitForServer();
  }, 30000);

  afterAll(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
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
