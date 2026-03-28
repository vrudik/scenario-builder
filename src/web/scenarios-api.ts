/**
 * API для работы со сценариями через БД
 * Используется через tsx из server.cjs
 */

import { ScenarioRepository, ExecutionRepository } from '../db/repositories';
import { ScenarioSpecValidator } from '../spec/scenario-spec';
import { TemporalClient } from '../runtime/temporal-client';
import { toUnifiedExecutionStatusFromDb } from '../runtime/unified-execution-status';
import { normalizeTenantId } from '../utils/tenant-id';

// Перенаправляем все логи в stderr
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

console.log = (...args: any[]) => {
  process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.warn = (...args: any[]) => {
  process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.error = (...args: any[]) => {
  process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.info = (...args: any[]) => {
  process.stderr.write('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

async function main() {
  let result: any;
  try {
    const command = process.argv[2];
    const arg3 = process.argv[3] || '{}';
    
    // Если arg3 похож на путь к файлу (содержит слеши или обратные слеши), читаем из файла
    let requestData: any;
    if (arg3.includes('/') || arg3.includes('\\') || arg3.endsWith('.json')) {
      // Это путь к файлу
      const fs = await import('fs');
      const fileContent = fs.readFileSync(arg3, 'utf-8');
      requestData = JSON.parse(fileContent);
    } else {
      // Это JSON строка
      requestData = JSON.parse(arg3);
    }

    const tenantId = normalizeTenantId(requestData._tenantId);
    delete requestData._tenantId;

    const scenarioRepo = new ScenarioRepository();
    const executionRepo = new ExecutionRepository();
    const validator = new ScenarioSpecValidator();

    switch (command) {
      case 'list':
        // GET /api/scenarios
        const { status, limit, offset } = requestData;
        const scenarios = await scenarioRepo.findAll({
          status,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
          tenantId
        });
        result = { success: true, scenarios };
        break;

      case 'get':
        // GET /api/scenarios/:id
        const scenario = await scenarioRepo.findById(requestData.id, tenantId);
        if (!scenario) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Scenario not found' }
          };
        } else {
          result = { success: true, scenario };
        }
        break;

      case 'create':
        // POST /api/scenarios
        const { name, description, spec, version, createdBy } = requestData;
        
        if (!name || !spec) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'name and spec are required' }
          };
          break;
        }

        // Валидация spec
        const validationResult = validator.validate(spec);
        if (!validationResult.valid) {
          result = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: validationResult.errors?.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Invalid scenario spec'
            }
          };
          break;
        }

        const newScenario = await scenarioRepo.create({
          name,
          description,
          spec,
          version,
          createdBy,
          tenantId
        });
        result = { success: true, scenario: newScenario };
        break;

      case 'update':
        // PUT /api/scenarios/:id
        const { id, ...updateData } = requestData;
        
        if (!id) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'id is required' }
          };
          break;
        }

        // Валидация spec, если он обновляется
        if (updateData.spec) {
          const validationResult = validator.validate(updateData.spec);
          if (!validationResult.valid) {
            result = {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: validationResult.errors?.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Invalid scenario spec'
              }
            };
            break;
          }
        }

        const updatedScenario = await scenarioRepo.update(id, tenantId, updateData);
        if (!updatedScenario) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Scenario not found' }
          };
          break;
        }
        result = { success: true, scenario: updatedScenario };
        break;

      case 'delete':
        // DELETE /api/scenarios/:id
        if (!requestData.id) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'id is required' }
          };
          break;
        }

        const deleted = await scenarioRepo.delete(requestData.id, tenantId);
        if (!deleted) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Scenario not found' }
          };
          break;
        }
        result = { success: true };
        break;

      case 'executions':
        // GET /api/scenarios/:id/executions
        const { scenarioId, executionStatus, limit: execLimit, offset: execOffset } = requestData;
        
        if (!scenarioId) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'scenarioId is required' }
          };
          break;
        }

        const executions = await executionRepo.findByScenarioId(scenarioId, tenantId, {
          status: executionStatus,
          limit: execLimit ? parseInt(execLimit, 10) : undefined,
          offset: execOffset ? parseInt(execOffset, 10) : undefined,
        });
        result = { success: true, executions };
        break;

      case 'execution-list-recent': {
        // GET /api/executions?limit=&scenarioId=
        const rawLimit = requestData.limit;
        const parsed =
          rawLimit !== undefined && rawLimit !== null && rawLimit !== ''
            ? parseInt(String(rawLimit), 10)
            : 40;
        const lim = Number.isFinite(parsed) ? parsed : 40;
        const rawSid = requestData.scenarioId;
        const scenarioId =
          typeof rawSid === 'string' && rawSid.trim() !== '' ? rawSid.trim() : undefined;
        const rows = await executionRepo.findRecentSummaries(lim, { scenarioId, tenantId });
        result = {
          success: true,
          executions: rows.map((r) => ({
            executionId: r.executionId,
            scenarioId: r.scenarioId,
            status: r.status,
            runtimeKind: r.runtimeKind,
            currentNodeId: r.currentNodeId,
            temporalStatusName: r.temporalStatusName,
            startedAt: r.startedAt.toISOString(),
            completedAt: r.completedAt?.toISOString() ?? null,
            failedAt: r.failedAt?.toISOString() ?? null
          }))
        };
        break;
      }

      case 'execution':
        // GET /api/executions/:executionId
        const execution = await executionRepo.findByExecutionId(requestData.executionId, tenantId);
        if (!execution) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Execution not found' }
          };
        } else {
          result = { success: true, execution };
        }
        break;

      case 'execution-events':
        // GET /api/executions/:executionId/events
        const events = await executionRepo.getEventHistory(requestData.executionId, tenantId);
        result = { success: true, events };
        break;

      case 'execution-unified-status': {
        // GET /api/executions/:executionId/unified-status
        const eidUnified = requestData.executionId;
        if (!eidUnified) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'executionId is required' }
          };
          break;
        }
        const rowUnified = await executionRepo.findStatusPayloadByExecutionId(eidUnified, tenantId);
        if (!rowUnified) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Execution not found' }
          };
          break;
        }
        let liveDescribe = null;
        const useTemporal =
          process.env.USE_TEMPORAL === 'true' || process.env.USE_TEMPORAL === '1';
        if (rowUnified.runtimeKind === 'temporal' && useTemporal) {
          const addr = process.env.TEMPORAL_ADDRESS?.trim() || 'localhost:7233';
          const tc = new TemporalClient();
          try {
            await tc.connect(addr);
            liveDescribe = await tc.describeScenarioWorkflow(eidUnified);
          } catch (e) {
            console.warn('[execution-unified-status] Temporal describe skipped:', e);
          } finally {
            try {
              await tc.close();
            } catch {
              /* ignore */
            }
          }
        }
        const unifiedStatus = toUnifiedExecutionStatusFromDb(rowUnified, liveDescribe);
        result = { success: true, unifiedStatus };
        break;
      }

      default:
        result = {
          success: false,
          error: { code: 'UNKNOWN_COMMAND', message: `Unknown command: ${command}` }
        };
    }
  } catch (error) {
    // Очищаем сообщение об ошибке от путей к файлам
    let errorMessage = error instanceof Error ? error.message : String(error);
    errorMessage = errorMessage.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
    errorMessage = errorMessage.replace(/\/[^\s"]+/g, '[path]');
    if (errorMessage.length > 500) {
      errorMessage = errorMessage.substring(0, 500) + '...';
    }
    
    result = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: errorMessage
      }
    };
  } finally {
    // Восстанавливаем console методы
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
  }
  
  // Выводим результат в stdout - только валидный JSON, без дополнительных символов
  const jsonOutput = JSON.stringify(result);
  process.stdout.write(jsonOutput + '\n');
}

main().catch(error => {
  // Очищаем сообщение об ошибке от путей к файлам
  let errorMessage = error.message || 'Unknown error';
  
  // Удаляем пути к файлам из сообщения об ошибке
  errorMessage = errorMessage.replace(/[A-Z]:\\[^\s]+/g, '[path]');
  errorMessage = errorMessage.replace(/\/[^\s]+/g, '[path]');
  
  // Ограничиваем длину сообщения
  if (errorMessage.length > 500) {
    errorMessage = errorMessage.substring(0, 500) + '...';
  }
  
  process.stderr.write(`Unhandled error in scenarios-api: ${errorMessage}\n`);
  process.stdout.write(JSON.stringify({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: errorMessage }
  }) + '\n');
  process.exit(1);
});
