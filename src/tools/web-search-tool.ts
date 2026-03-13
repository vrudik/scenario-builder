/**
 * Web Search Tool
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

interface DuckDuckGoTopic {
  Text?: string;
  FirstURL?: string;
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  Heading?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
}

export async function executeWebSearch(request: ToolRequest): Promise<ToolResponse> {
  const { query, maxResults = 5 } = request.inputs as unknown as WebSearchInputs;

  try {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const startTime = Date.now();

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'scenario-builder/1.0' }
    });

    if (!response.ok) {
      throw new Error(`Search API returned ${response.status}`);
    }

    const data = (await response.json()) as DuckDuckGoResponse;
    const results: WebSearchResult[] = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
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

    if (results.length < maxResults) {
      const fallbackResults = await fallbackSearch(_querySafe(query), maxResults - results.length);
      results.push(...fallbackResults);
    }

    return {
      success: true,
      outputs: {
        results: results.slice(0, maxResults),
        query,
        totalResults: results.length
      },
      metadata: { latency: Date.now() - startTime, timestamp: new Date().toISOString() }
    };
  } catch (error) {
    return {
      success: false,
      error: { code: 'SEARCH_ERROR', message: error instanceof Error ? error.message : 'Unknown search error' },
      metadata: { latency: 0, timestamp: new Date().toISOString() }
    };
  }
}

function _querySafe(query: string): string {
  return query;
}

async function fallbackSearch(_query: string, _maxResults: number): Promise<WebSearchResult[]> {
  return [];
}

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
          query: { type: 'string', description: 'Search query string' },
          maxResults: { type: 'number', default: 5 }
        },
        required: ['query']
      },
      outputs: {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object' } },
          query: { type: 'string' },
          totalResults: { type: 'number' }
        }
      }
    },
    sla: { availability: 0.95, latency: { p50: 500, p95: 2000, p99: 5000 }, maxRetries: 2 },
    authorization: { scopes: [], roles: [], requiresApproval: false },
    idempotency: { supported: true },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'duckduckgo'
    }
  };
}
