/**
 * Путь к OPA: из PATH или скачанный кэш v0.69.0 (как в run-opa-test).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPA_VERSION = '0.69.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          file.close();
          fs.unlinkSync(dest);
          if (!loc) {
            reject(new Error('Redirect without location'));
            return;
          }
          download(loc, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {
          /* ignore */
        }
        reject(err);
      });
  });
}

function opaArtifact() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32') {
    return { name: 'opa.exe', url: `https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_windows_amd64.exe` };
  }
  if (p === 'linux' && a === 'x64') {
    return {
      name: 'opa',
      url: `https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_linux_amd64_static`
    };
  }
  if (p === 'darwin') {
    const slug = a === 'arm64' ? 'darwin_arm64_static' : 'darwin_amd64_static';
    return { name: 'opa', url: `https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_${slug}` };
  }
  throw new Error(`Unsupported platform for auto-download: ${p} ${a}. Install OPA and add to PATH.`);
}

/** @returns {Promise<string>} */
export async function getOpaBinaryPath() {
  const pathCheck = spawnSync('opa', ['version'], { stdio: 'pipe', windowsHide: true });
  if (pathCheck.status === 0) {
    return 'opa';
  }

  const { name, url } = opaArtifact();
  const cacheDir = path.join(os.tmpdir(), 'scenario-builder-opa-cache');
  const opaBin = path.join(cacheDir, `${OPA_VERSION}-${name}`);

  fs.mkdirSync(cacheDir, { recursive: true });

  if (!fs.existsSync(opaBin)) {
    console.error(`[opa-binary] OPA not in PATH; downloading ${url} ...`);
    await download(url, opaBin);
    if (process.platform !== 'win32') {
      fs.chmodSync(opaBin, 0o755);
    }
  }

  return opaBin;
}
