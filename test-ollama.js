// Простой тест Ollama и Agent Runtime
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== Тестирование Agent Runtime с Ollama ===\n');

// Проверка Ollama
console.log('1. Проверка Ollama...');
try {
  const ollamaPath = process.platform === 'win32' 
    ? `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe`
    : 'ollama';
  
  if (existsSync(ollamaPath) || process.platform !== 'win32') {
    const version = execSync(`"${ollamaPath}" --version`, { encoding: 'utf-8' });
    console.log(`   ✅ Ollama найден: ${version.trim()}`);
  } else {
    console.log('   ❌ Ollama не найден');
    process.exit(1);
  }
} catch (error) {
  console.log('   ❌ Ошибка проверки Ollama:', error.message);
  process.exit(1);
}

// Проверка модели
console.log('\n2. Проверка модели...');
try {
  const ollamaPath = process.platform === 'win32' 
    ? `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe`
    : 'ollama';
  
  const models = execSync(`"${ollamaPath}" list`, { encoding: 'utf-8' });
  if (models.includes('llama3.2:1b')) {
    console.log('   ✅ Модель llama3.2:1b найдена');
  } else {
    console.log('   ⚠️  Модель llama3.2:1b не найдена');
    console.log('   Загружаю модель...');
    execSync(`"${ollamaPath}" pull llama3.2:1b`, { stdio: 'inherit' });
  }
} catch (error) {
  console.log('   ❌ Ошибка проверки модели:', error.message);
}

// Запуск теста
console.log('\n3. Запуск теста Agent Runtime...\n');

try {
  const examplePath = join(__dirname, 'examples', 'agent-ollama-example.ts');
  execSync(`npx tsx "${examplePath}"`, { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('\n❌ Ошибка запуска теста:', error.message);
  process.exit(1);
}
