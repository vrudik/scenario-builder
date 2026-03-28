import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Без shell: `node` + `prisma/build/index.js` и `tsx/dist/cli.mjs` — стабильнее на Windows CI
 * (нет зависимости от `tsx.cmd` / `npx` / cmd.exe и кавычек в путях).
 */
describe('Scenarios API', () => {
  const repoRoot = path.join(__dirname, '..');
  const dbPath = path.join(repoRoot, 'test.db');
  const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const scriptPath = path.join(repoRoot, 'src', 'web', 'scenarios-api.ts');

  const testEnv = () => ({ ...process.env, DATABASE_URL: `file:${dbPath}` });

  const execOpts = {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true as const
  };

  async function runPrismaDbPush(): Promise<void> {
    await execFileAsync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
      ...execOpts,
      env: testEnv()
    });
  }

  async function runScenariosApi(args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, scriptPath, ...args],
      {
        ...execOpts,
        env: testEnv()
      }
    );
    const err = stderr?.trim();
    return err ? `${stdout}\n${err}` : stdout;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = `file:${dbPath}`;
    await runPrismaDbPush();
  }, 90000);

  afterAll(() => {
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch {
        /* ignore */
      }
    }
  });

  function parseJsonFromOutput(output: string): any {
    const lines = output.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      if (
        trimmed.startsWith('[LOG]') ||
        trimmed.startsWith('[WARN]') ||
        trimmed.startsWith('[ERROR]') ||
        trimmed.startsWith('[INFO]') ||
        trimmed.includes('prisma:query') ||
        trimmed.includes('prisma:') ||
        trimmed.startsWith('node.exe') ||
        trimmed.startsWith('node ') ||
        trimmed.startsWith('At line:') ||
        trimmed.startsWith('+ CategoryInfo:') ||
        trimmed.includes('RemoteException') ||
        trimmed.includes('NativeCommandError') ||
        trimmed.startsWith('& "') ||
        trimmed.startsWith('C:\\Program Files') ||
        trimmed.startsWith('At C:') ||
        trimmed.startsWith('At ') ||
        trimmed.includes('CategoryInfo') ||
        trimmed.includes('FullyQualifiedErrorId') ||
        trimmed.startsWith('[path]') ||
        trimmed.includes('"[path]"') ||
        /^\s*\+.*CategoryInfo/.test(trimmed) ||
        /^\s*\+.*FullyQualifiedErrorId/.test(trimmed) ||
        trimmed.startsWith('tsx.cmd') ||
        trimmed.startsWith('At ')
      ) {
        continue;
      }

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && 'success' in parsed) {
            return parsed;
          }
        } catch {
          continue;
        }
      }
    }

    let jsonStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (
        trimmed.startsWith('{') &&
        !trimmed.startsWith('[LOG]') &&
        !trimmed.startsWith('[WARN]') &&
        !trimmed.startsWith('[ERROR]') &&
        !trimmed.startsWith('[INFO]') &&
        !trimmed.includes('prisma:query') &&
        !trimmed.includes('prisma:') &&
        !trimmed.startsWith('node.exe') &&
        !trimmed.startsWith('node ') &&
        !trimmed.startsWith('At line:') &&
        !trimmed.startsWith('+ CategoryInfo:') &&
        !trimmed.includes('RemoteException') &&
        !trimmed.includes('NativeCommandError') &&
        !trimmed.startsWith('& "') &&
        !trimmed.startsWith('C:\\Program Files') &&
        !trimmed.startsWith('At C:') &&
        !trimmed.startsWith('At ') &&
        !trimmed.includes('CategoryInfo') &&
        !trimmed.includes('FullyQualifiedErrorId') &&
        !trimmed.startsWith('[path]') &&
        !trimmed.includes('"[path]"') &&
        !/^\s*\+.*CategoryInfo/.test(trimmed) &&
        !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
        !trimmed.startsWith('tsx.cmd')
      ) {
        jsonStartIndex = i;
        break;
      }
    }

    if (jsonStartIndex !== -1) {
      let braceCount = 0;
      const jsonLines: string[] = [];

      for (let i = jsonStartIndex; i < lines.length; i++) {
        const line = lines[i];
        jsonLines.push(line);

        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }

        if (braceCount === 0) {
          const jsonStr = jsonLines.join('\n').trim();
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object' && 'success' in parsed) {
              return parsed;
            }
          } catch {
            /* invalid */
          }
          break;
        }
      }
    }

    throw new Error('No valid JSON found in output. First 500 chars: ' + output.substring(0, 500));
  }

  it('should list scenarios (empty list)', async () => {
    const out = await runScenariosApi(['list', '{}']);
    const result = parseJsonFromOutput(out);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.scenarios)).toBe(true);
  }, 30000);

  it('should create a scenario', async () => {
    const testSpec = {
      name: 'Test Scenario',
      description: 'Test Description',
      spec: {
        id: 'test-scenario-1',
        name: 'Test Scenario',
        goal: 'Test goal',
        triggers: [],
        allowedActions: [],
        workflow: {
          nodes: [
            { id: 'start', type: 'start' },
            { id: 'end', type: 'end' }
          ],
          edges: []
        }
      }
    };

    const tempFile = path.join(repoRoot, `temp-test-create-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(testSpec), 'utf-8');

    try {
      const out = await runScenariosApi(['create', tempFile]);
      const result = parseJsonFromOutput(out);
      if (!result.success) {
        console.error('Create scenario failed:', JSON.stringify(result, null, 2));
        console.error('Full output (first 2000 chars):', out.substring(0, 2000));
        console.error('All lines:', out.split('\n').slice(0, 20));
      }
      expect(result.success).toBe(true);
      expect(result.scenario).toBeDefined();
      expect(result.scenario.name).toBe('Test Scenario');
      expect(result.scenario.description).toBe('Test Description');
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }, 30000);

  it('should get a scenario by id', async () => {
    const testSpec = {
      name: 'Test Scenario for Get',
      description: 'Test Description',
      spec: {
        id: 'test-scenario-get',
        name: 'Test Scenario for Get',
        goal: 'Test goal for get',
        triggers: [],
        allowedActions: [],
        workflow: {
          nodes: [
            { id: 'start', type: 'start' },
            { id: 'end', type: 'end' }
          ],
          edges: []
        }
      }
    };

    const tempCreateFile = path.join(repoRoot, `temp-test-create-get-${Date.now()}.json`);
    fs.writeFileSync(tempCreateFile, JSON.stringify(testSpec), 'utf-8');

    try {
      const createOut = await runScenariosApi(['create', tempCreateFile]);
      const createResult = parseJsonFromOutput(createOut);
      expect(createResult.success).toBe(true);
      expect(createResult.scenario).toBeDefined();
      const scenarioId = createResult.scenario.id;

      const tempGetFile = path.join(repoRoot, `temp-test-get-${Date.now()}.json`);
      fs.writeFileSync(tempGetFile, JSON.stringify({ id: scenarioId }), 'utf-8');

      try {
        const getOut = await runScenariosApi(['get', tempGetFile]);
        const getResult = parseJsonFromOutput(getOut);
        expect(getResult.success).toBe(true);
        expect(getResult.scenario).toBeDefined();
        expect(getResult.scenario.id).toBe(scenarioId);
        expect(getResult.scenario.name).toBe('Test Scenario for Get');
      } finally {
        if (fs.existsSync(tempGetFile)) {
          fs.unlinkSync(tempGetFile);
        }
      }
    } finally {
      if (fs.existsSync(tempCreateFile)) {
        fs.unlinkSync(tempCreateFile);
      }
    }
  }, 30000);
});
