/**
 * Scenario Repository
 * 
 * Репозиторий для работы со сценариями
 */

import { prisma } from '../index';
import { ScenarioSpec } from '../../spec';

export interface CreateScenarioInput {
  name: string;
  description?: string;
  spec: ScenarioSpec;
  version?: string;
  createdBy?: string;
}

export interface UpdateScenarioInput {
  name?: string;
  description?: string;
  spec?: ScenarioSpec;
  version?: string;
  status?: 'draft' | 'active' | 'archived';
}

export class ScenarioRepository {
  /**
   * Создать новый сценарий
   */
  async create(input: CreateScenarioInput) {
    return prisma.scenario.create({
      data: {
        name: input.name,
        description: input.description,
        spec: JSON.stringify(input.spec),
        version: input.version || '1.0.0',
        createdBy: input.createdBy,
      },
    });
  }

  /**
   * Получить сценарий по ID
   */
  async findById(id: string) {
    const scenario = await prisma.scenario.findUnique({
      where: { id },
    });
    
    if (!scenario) {
      return null;
    }
    
    return {
      ...scenario,
      spec: JSON.parse(scenario.spec) as ScenarioSpec,
    };
  }

  /**
   * Получить все сценарии
   */
  async findAll(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const scenarios = await prisma.scenario.findMany({
      where: options?.status ? { status: options.status } : undefined,
      take: options?.limit,
      skip: options?.offset,
      orderBy: { createdAt: 'desc' },
    });
    
    return scenarios.map(s => {
      try {
        return {
          ...s,
          spec: typeof s.spec === 'string' ? JSON.parse(s.spec) : s.spec,
        };
      } catch (error) {
        // Если не удалось распарсить spec, возвращаем как есть
        console.error(`Failed to parse spec for scenario ${s.id}:`, error);
        return {
          ...s,
          spec: s.spec,
        };
      }
    });
  }

  /**
   * Обновить сценарий
   */
  async update(id: string, input: UpdateScenarioInput) {
    const updateData: any = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.spec !== undefined) updateData.spec = JSON.stringify(input.spec);
    if (input.version !== undefined) updateData.version = input.version;
    if (input.status !== undefined) updateData.status = input.status;
    
    const updated = await prisma.scenario.update({
      where: { id },
      data: updateData,
    });
    
    return {
      ...updated,
      spec: JSON.parse(updated.spec) as ScenarioSpec,
    };
  }

  /**
   * Удалить сценарий
   */
  async delete(id: string) {
    return prisma.scenario.delete({
      where: { id },
    });
  }
}
