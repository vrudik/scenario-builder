import { describe, it, expect } from 'vitest';
import { ScenarioRepository } from '../src/db/repositories/scenario-repository';
import { ExecutionRepository } from '../src/db/repositories/execution-repository';

describe('Database Repositories', () => {
  it('should create ScenarioRepository instance', () => {
    const repo = new ScenarioRepository();
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(ScenarioRepository);
  });

  it('should create ExecutionRepository instance', () => {
    const repo = new ExecutionRepository();
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(ExecutionRepository);
  });

  // Дополнительные тесты с моками Prisma будут добавлены после рефакторинга
});
