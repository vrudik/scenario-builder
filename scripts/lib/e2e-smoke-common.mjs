/**
 * Общие утилиты для e2e-smoke / e2e-smoke-opa.
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

/**
 * @param {number} port
 * @param {string} [host]
 */
export function assertPortFree(port, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', (err) => {
      const e = /** @type {NodeJS.ErrnoException} */ (err);
      if (e.code === 'EADDRINUSE') {
        reject(
          new Error(
            `[e2e-smoke] порт ${port} (${host}) занят. Остановите процесс, который его слушает, и повторите.`
          )
        );
      } else {
        reject(err);
      }
    });
    s.listen(port, host, () => {
      s.close(() => resolve());
    });
  });
}

/**
 * @param {string} url
 * @param {{ timeoutMs: number }} opts
 */
export async function waitForHttpOk(url, opts) {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        return;
      }
    } catch {
      /* ещё не готов */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`[e2e-smoke] нет ответа ${url} за ${opts.timeoutMs} ms`);
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} tag
 */
export function watchChildExit(child, tag) {
  let doReject;
  const onExit = (code, signal) => {
    doReject(
      new Error(
        `[${tag}] процесс завершился до готовности (code=${code}, signal=${signal ?? ''})`
      )
    );
  };
  const p = new Promise((_, reject) => {
    doReject = reject;
    child.once('exit', onExit);
  });
  return {
    p,
    cancel: () => {
      child.removeListener('exit', onExit);
    }
  };
}

/**
 * @param {import('node:child_process').ChildProcess | null | undefined} server
 */
export function stopSpawnedChild(server) {
  if (!server || server.killed || server.exitCode != null) {
    return;
  }
  try {
    server.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32' && server.pid) {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true
    });
  }
}
