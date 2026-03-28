/**
 * Scenario Repository
 *
 * Репозиторий для работы со сценариями (изоляция по tenantId).
 */

import { prisma } from '../index';
import { ScenarioSpec } from '../../spec';

export interface CreateScenarioInput {
  name: string;
  description?: string;
  spec: ScenarioSpec;
  version?: string;
  createdBy?: string;
  /** Multi-tenant; по умолчанию default */
  tenantId?: string;
}

export interface UpdateScenarioInput {
  name?: string;
  description?: string;
  spec?: ScenarioSpec;
  version?: string;
  status?: 'draft' | 'active' | 'archived';
}

export class ScenarioRepository {
  async create(input: CreateScenarioInput) {
    return prisma.scenario.create({
      data: {
        name: input.name,
        description: input.description,
        spec: JSON.stringify(input.spec),
        version: input.version || '1.0.0',
        createdBy: input.createdBy,
        tenantId: input.tenantId ?? 'default'
      }
    });
  }

  async findById(id: string, tenantId: string) {
    const scenario = await prisma.scenario.findFirst({
      where: { id, tenantId }
    });

    if (!scenario) {
      return null;
    }

    return {
      ...scenario,
      spec: JSON.parse(scenario.spec) as ScenarioSpec
    };
  }

  async findAll(options?: {
    status?: string;
    limit?: number;
    offset?: number;
    tenantId?: string;
  }) {
    const tenantId = options?.tenantId ?? 'default';
    const scenarios = await prisma.scenario.findMany({
      where: {
        tenantId,
        ...(options?.status ? { status: options.status } : {})
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { createdAt: 'desc' }
    });

    return scenarios.map((s) => {
      try {
        return {
          ...s,
          spec: typeof s.spec === 'string' ? JSON.parse(s.spec) : s.spec
        };
      } catch (error) {
        console.error(`Failed to parse spec for scenario ${s.id}:`, error);
        return {
          ...s,
          spec: s.spec
        };
      }
    });
  }

  async update(id: string, tenantId: string, input: UpdateScenarioInput) {
    const existing = await prisma.scenario.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.spec !== undefined) updateData.spec = JSON.stringify(input.spec);
    if (input.version !== undefined) updateData.version = input.version;
    if (input.status !== undefined) updateData.status = input.status;

    const updated = await prisma.scenario.update({
      where: { id },
      data: updateData
    });

    return {
      ...updated,
      spec: JSON.parse(updated.spec) as ScenarioSpec
    };
  }

  async delete(id: string, tenantId: string) {
    const existing = await prisma.scenario.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return null;
    }
    return prisma.scenario.delete({
      where: { id }
    });
  }
}
