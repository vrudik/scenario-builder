/**
 * Mock tool runtime for template-based scenarios.
 * Returns deterministic stub responses from mockConfig.
 */

export interface MockToolConfig {
  [toolId: string]: {
    /** Omitted or undefined → empty object output in executeMockTool */
    response?: unknown;
    delay?: number; // optional simulated delay in ms
  };
}

export function parseMockConfig(json: string | null | undefined): MockToolConfig | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function executeMockTool(
  toolId: string,
  _input: unknown,
  mockConfig: MockToolConfig,
): Promise<{ output: unknown; mocked: true }> {
  const config = mockConfig[toolId];
  if (!config) {
    return { output: { error: `No mock configured for tool: ${toolId}` }, mocked: true };
  }

  if (config.delay && config.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, config.delay));
  }

  return { output: config.response !== undefined ? config.response : {}, mocked: true };
}
