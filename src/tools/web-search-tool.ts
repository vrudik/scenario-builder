/**
 * Web Search Tool
 * 
 * Реализация инструмента для поиска информации в интернете
 * Использует DuckDuckGo API для поиска
 */

import { ToolRequest, ToolResponse } from '../gateway/tool-gateway';
import { RegisteredTool } from '../registry/tool-registry';
import { RiskClass } from '../spec/scenario-spec';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchInputs {
  query: string;
  maxResults?: number;
}

/**
 * Выполнение поиска в интернете
 */
export async function executeWebSearch(
  request: ToolRequest<WebSearchInputs>
): Promise<ToolResponse> {
  const { query, maxResults = 5 } = request.inputs;
  
  try {
    // Используем DuckDuckGo Instant Answer API
    // В production можно использовать Google Custom Search API, Bing API и т.д.
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Search API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Формируем результаты поиска
    const results: WebSearchResult[] = [];
    
    // Добавляем Instant Answer если есть
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText
      });
    }
    
    // Добавляем Related Topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }
    
    // Если результатов мало, используем альтернативный метод
    if (results.length < maxResults) {
      // Fallback: используем простой поиск через HTML парсинг
      // В production здесь можно использовать специализированные API
      const fallbackResults = await fallbackSearch(query, maxResults - results.length);
      results.push(...fallbackResults);
    }
    
    return {
      success: true,
      outputs: {
        results: results.slice(0, maxResults),
        query,
        totalResults: results.length
      },
      metadata: {
        latency: Date.now() - Date.now(), // Будет измерено в gateway
        timestamp: new Date().toISOString(),
        source: 'duckduckgo'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown search error'
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Fallback поиск (упрощенный)
 */
async function fallbackSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  // В production здесь можно использовать другие API или парсинг
  // Для демонстрации возвращаем пустой массив
  return [];
}

/**
 * Регистрация Web Search Tool
 */
export function createWebSearchTool(): RegisteredTool {
  return {
    id: 'web-search-tool',
    name: 'Web Search Tool',
    version: '1.0.0',
    riskClass: RiskClass.LOW,
    requiresApproval: false,
    inputOutput: {
      inputs: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
            default: 5
          }
        },
        required: ['query']
      },
      outputs: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
                snippet: { type: 'string' }
              }
            }
          },
          query: { type: 'string' },
          totalResults: { type: 'number' }
        }
      }
    },
    sla: {
      availability: 0.95,
      latency: { p50: 500, p95: 2000, p99: 5000 },
      maxRetries: 2
    },
    authorization: {
      scopes: [],
      roles: [],
      requiresApproval: false
    },
    idempotency: {
      supported: true
    },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'duckduckgo'
    }
  };
}
