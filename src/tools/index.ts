/**
 * Tools Module
 * 
 * Экспорт всех доступных инструментов
 */

export * from './web-search-tool';
export * from './database-query-tool';
export * from './api-call-tool';

import { createWebSearchTool } from './web-search-tool';
import { createDatabaseQueryTool } from './database-query-tool';
import { createApiCallTool } from './api-call-tool';
import { RegisteredTool } from '../registry/tool-registry';
import { ToolGateway } from '../gateway/tool-gateway';
import { executeWebSearch } from './web-search-tool';
import { executeDatabaseQuery } from './database-query-tool';
import { executeApiCall } from './api-call-tool';

/**
 * Регистрация всех инструментов в Tool Registry и Tool Gateway
 */
export function registerAllTools(
  registry: { register(tool: RegisteredTool): void },
  gateway: ToolGateway
): void {
  // Web Search Tool
  const webSearchTool = createWebSearchTool();
  registry.register(webSearchTool);
  gateway.registerTool(
    webSearchTool.id,
    webSearchTool,
    executeWebSearch as any
  );
  
  // Database Query Tool
  const dbQueryTool = createDatabaseQueryTool();
  registry.register(dbQueryTool);
  gateway.registerTool(
    dbQueryTool.id,
    dbQueryTool,
    executeDatabaseQuery as any
  );
  
  // API Call Tool
  const apiCallTool = createApiCallTool();
  registry.register(apiCallTool);
  gateway.registerTool(
    apiCallTool.id,
    apiCallTool,
    executeApiCall as any
  );
}

/**
 * Получить все зарегистрированные инструменты
 */
export function getAllTools(): RegisteredTool[] {
  return [
    createWebSearchTool(),
    createDatabaseQueryTool(),
    createApiCallTool()
  ];
}
