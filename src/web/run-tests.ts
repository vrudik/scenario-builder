/**
 * Скрипт для запуска тестов и сохранения результатов
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'pending';
  duration?: number;
  error?: string;
}

async function runTests(): Promise<TestResult[]> {
  try {
    console.log('Запуск тестов...');
    const { stdout } = await execAsync('npm test -- --reporter=json --run');
    
    // Парсинг результатов Vitest JSON
    const results: TestResult[] = [];
    
    try {
      const jsonOutput = JSON.parse(stdout);
      if (jsonOutput.testFiles) {
        jsonOutput.testFiles.forEach((file: any) => {
          file.tasks?.forEach((task: any) => {
            results.push({
              name: task.name,
              status: task.result?.state === 'pass' ? 'passed' : 
                      task.result?.state === 'fail' ? 'failed' : 'pending',
              duration: task.result?.duration,
              error: task.result?.errors?.[0]?.message
            });
          });
        });
      }
    } catch (e) {
      // Если не удалось распарсить JSON, создаем базовые результаты
      console.log('Не удалось распарсить результаты тестов, используем базовые данные');
    }
    
    // Сохранение результатов
    const resultsPath = join(process.cwd(), 'test-results.json');
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`Результаты сохранены в ${resultsPath}`);
    
    return results;
  } catch (error: any) {
    console.error('Ошибка при запуске тестов:', error.message);
    return [];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(results => {
    console.log(`Выполнено тестов: ${results.length}`);
    console.log(`Успешно: ${results.filter(r => r.status === 'passed').length}`);
    console.log(`Провалено: ${results.filter(r => r.status === 'failed').length}`);
  });
}

export { runTests };
