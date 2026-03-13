import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

describe('Scenarios API', () => {
  const dbPath = path.join(__dirname, '..', 'test.db');
  const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', tsxBin);
  const scriptPath = path.join(__dirname, '..', 'src', 'web', 'scenarios-api.ts');
  
  beforeAll(async () => {
    // Устанавливаем переменную окружения для тестовой БД
    process.env.DATABASE_URL = `file:${dbPath}`;

    // Синхронизируем схему с тестовой БД без миграций
    await execAsync(`npx prisma db push --skip-generate`, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
    });
  }, 60000);

  afterAll(() => {
    // Очищаем тестовую БД после тестов
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        // Игнорируем ошибки удаления
      }
    }
  });

  function parseJsonFromOutput(output: string): any {
    // Фильтруем строки PowerShell и находим JSON
    // JSON может быть многострочным, поэтому нужно правильно его собрать
    const lines = output.trim().split('\n').filter(line => line.trim());
    
    // Сначала пробуем найти JSON в одной строке
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Пропускаем строки с логами и служебными сообщениями PowerShell
      if (trimmed.startsWith('[LOG]') || trimmed.startsWith('[WARN]') || 
          trimmed.startsWith('[ERROR]') || trimmed.startsWith('[INFO]') ||
          trimmed.includes('prisma:query') || trimmed.includes('prisma:') ||
          trimmed.startsWith('node.exe') || trimmed.startsWith('node ') ||
          trimmed.startsWith('At line:') || trimmed.startsWith('+ CategoryInfo:') ||
          trimmed.includes('RemoteException') || trimmed.includes('NativeCommandError') ||
          trimmed.startsWith('& "') || trimmed.startsWith('C:\\Program Files') ||
          trimmed.startsWith('At C:') || trimmed.startsWith('At ') ||
          trimmed.includes('CategoryInfo') || trimmed.includes('FullyQualifiedErrorId') ||
          trimmed.startsWith('[path]') || trimmed.includes('"[path]"') ||
          /^\s*\+.*CategoryInfo/.test(trimmed) || /^\s*\+.*FullyQualifiedErrorId/.test(trimmed) ||
          trimmed.startsWith('tsx.cmd') || trimmed.startsWith('At ')) {
        continue;
      }
      
      // Проверяем, что это валидный JSON (начинается с { и заканчивается })
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && 'success' in parsed) {
            return parsed;
          }
        } catch (e) {
          // Не валидный JSON в одной строке, продолжаем
          continue;
        }
      }
    }
    
    // Если не нашли в одной строке, пробуем собрать многострочный JSON
    // Ищем строку, начинающуюся с {
    let jsonStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('{') && 
          !trimmed.startsWith('[LOG]') && !trimmed.startsWith('[WARN]') &&
          !trimmed.startsWith('[ERROR]') && !trimmed.startsWith('[INFO]') &&
          !trimmed.includes('prisma:query') && !trimmed.includes('prisma:') &&
          !trimmed.startsWith('node.exe') && !trimmed.startsWith('node ') &&
          !trimmed.startsWith('At line:') && !trimmed.startsWith('+ CategoryInfo:') &&
          !trimmed.includes('RemoteException') && !trimmed.includes('NativeCommandError') &&
          !trimmed.startsWith('& "') && !trimmed.startsWith('C:\\Program Files') &&
          !trimmed.startsWith('At C:') && !trimmed.startsWith('At ') &&
          !trimmed.includes('CategoryInfo') && !trimmed.includes('FullyQualifiedErrorId') &&
          !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"') &&
          !/^\s*\+.*CategoryInfo/.test(trimmed) && !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
          !trimmed.startsWith('tsx.cmd')) {
        jsonStartIndex = i;
        break;
      }
    }
    
    if (jsonStartIndex !== -1) {
      // Собираем JSON из строк, начиная с найденной
      let braceCount = 0;
      let jsonLines: string[] = [];
      
      for (let i = jsonStartIndex; i < lines.length; i++) {
        const line = lines[i];
        jsonLines.push(line);
        
        // Подсчитываем скобки
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        // Если скобки сбалансированы, JSON собран
        if (braceCount === 0) {
          const jsonStr = jsonLines.join('\n').trim();
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object' && 'success' in parsed) {
              return parsed;
            }
          } catch (e) {
            // Не валидный JSON
          }
          break;
        }
      }
    }
    
    throw new Error('No valid JSON found in output. First 500 chars: ' + output.substring(0, 500));
  }

  it('should list scenarios (empty list)', async () => {
    const { stdout } = await execAsync(
      `"${tsxPath}" "${scriptPath}" "list" "{}"`,
      { 
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
      }
    );
    
    const result = parseJsonFromOutput(stdout);
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
    
    // Создаем временный файл для передачи данных
    const tempFile = path.join(__dirname, '..', `temp-test-create-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(testSpec), 'utf-8');
    
    try {
      const { stdout } = await execAsync(
        `"${tsxPath}" "${scriptPath}" "create" "${tempFile}"`,
        { 
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
        }
      );
      
      const result = parseJsonFromOutput(stdout);
      if (!result.success) {
        console.error('Create scenario failed:', JSON.stringify(result, null, 2));
        console.error('Full stdout (first 2000 chars):', stdout.substring(0, 2000));
        console.error('All stdout lines:', stdout.split('\n').slice(0, 20));
      }
      expect(result.success).toBe(true);
      expect(result.scenario).toBeDefined();
      expect(result.scenario.name).toBe('Test Scenario');
      expect(result.scenario.description).toBe('Test Description');
    } finally {
      // Удаляем временный файл
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }, 30000);

  it('should get a scenario by id', async () => {
    // Сначала создаем сценарий
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
    
    // Создаем временный файл для создания сценария
    const tempCreateFile = path.join(__dirname, '..', `temp-test-create-get-${Date.now()}.json`);
    fs.writeFileSync(tempCreateFile, JSON.stringify(testSpec), 'utf-8');
    
    try {
      const { stdout: createStdout } = await execAsync(
        `"${tsxPath}" "${scriptPath}" "create" "${tempCreateFile}"`,
        { 
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
        }
      );
      
      const createResult = parseJsonFromOutput(createStdout);
      expect(createResult.success).toBe(true);
      expect(createResult.scenario).toBeDefined();
      const scenarioId = createResult.scenario.id;
      
      // Создаем временный файл для получения сценария
      const tempGetFile = path.join(__dirname, '..', `temp-test-get-${Date.now()}.json`);
      fs.writeFileSync(tempGetFile, JSON.stringify({ id: scenarioId }), 'utf-8');
      
      try {
        // Теперь получаем сценарий
        const { stdout: getStdout } = await execAsync(
          `"${tsxPath}" "${scriptPath}" "get" "${tempGetFile}"`,
          { 
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, DATABASE_URL: `file:${dbPath}` }
          }
        );
        
        const getResult = parseJsonFromOutput(getStdout);
        expect(getResult.success).toBe(true);
        expect(getResult.scenario).toBeDefined();
        expect(getResult.scenario.id).toBe(scenarioId);
        expect(getResult.scenario.name).toBe('Test Scenario for Get');
      } finally {
        // Удаляем временный файл для get
        if (fs.existsSync(tempGetFile)) {
          fs.unlinkSync(tempGetFile);
        }
      }
    } finally {
      // Удаляем временный файл для create
      if (fs.existsSync(tempCreateFile)) {
        fs.unlinkSync(tempCreateFile);
      }
    }
  }, 30000);
});
