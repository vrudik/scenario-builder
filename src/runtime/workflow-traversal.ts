/**
 * Чистые функции обхода workflow-графа.
 * Используются Orchestrator и Temporal workflow (deterministic).
 */

import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '../builder/workflow-graph';

/**
 * Outputs предшественников узла: один предшественник или merge при fan-in.
 */
export function collectIncomingOutputs(
  nodeId: string,
  graph: WorkflowGraph,
  getOutputs: (fromNodeId: string) => Record<string, unknown> | undefined
): Record<string, unknown> {
  const incoming = graph.edges.filter(e => e.to === nodeId);
  if (incoming.length === 0) {
    return {};
  }

  if (incoming.length === 1) {
    return getOutputs(incoming[0].from) ?? {};
  }

  const merged: Record<string, unknown> = {};
  for (const edge of incoming) {
    const outputs = getOutputs(edge.from);
    if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
      Object.assign(merged, outputs);
    }
  }
  return merged;
}

/**
 * Для decision/parallel у узла часто нет собственных outputs — условия на рёбрах
 * оцениваем по объединённым выходам предшественников.
 */
export function getRoutingOutputs(
  node: WorkflowNode,
  graph: WorkflowGraph,
  currentResultOutputs: Record<string, unknown> | undefined,
  getStoredOutputs: (nodeId: string) => Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (currentResultOutputs && Object.keys(currentResultOutputs).length > 0) {
    return currentResultOutputs;
  }
  if (node.type === 'decision' || node.type === 'parallel') {
    const merged = collectIncomingOutputs(node.id, graph, getStoredOutputs);
    return Object.keys(merged).length > 0 ? merged : currentResultOutputs;
  }
  return currentResultOutputs;
}

export function findNextEdges(
  currentNode: WorkflowNode,
  graph: WorkflowGraph,
  outputs?: Record<string, unknown>
): WorkflowEdge[] {
  const outgoingEdges = graph.edges.filter(edge => edge.from === currentNode.id);

  if (outgoingEdges.length === 0) {
    return [];
  }

  const conditionalEdges = outgoingEdges.filter(edge => edge.condition);
  const defaultEdges = outgoingEdges.filter(edge => !edge.condition);

  if (currentNode.type === 'decision') {
    for (const edge of conditionalEdges) {
      if (matchesCondition(edge.condition, outputs)) {
        return [edge];
      }
    }

    return defaultEdges.length > 0 ? [defaultEdges[0]] : [];
  }

  if (currentNode.type === 'parallel') {
    const matchedConditional = conditionalEdges.filter(edge => matchesCondition(edge.condition, outputs));
    return [...matchedConditional, ...defaultEdges];
  }

  const firstConditional = conditionalEdges.find(edge => matchesCondition(edge.condition, outputs));
  if (firstConditional) {
    return [firstConditional];
  }

  return defaultEdges.length > 0 ? [defaultEdges[0]] : [];
}

export function matchesCondition(
  condition: string | undefined,
  outputs?: Record<string, unknown>
): boolean {
  if (!condition) {
    return true;
  }

  const normalized = condition.trim();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  const equalsMatch = normalized.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=)\s*(.+)$/);
  if (equalsMatch) {
    const [, field, operator, rawExpected] = equalsMatch;
    const actual = getOutputValue(outputs, field!);
    const expected = parseConditionValue(rawExpected!.trim());
    return operator === '==' ? actual === expected : actual !== expected;
  }

  const value = getOutputValue(outputs, normalized);
  return Boolean(value);
}

export function getOutputValue(outputs: Record<string, unknown> | undefined, path: string): unknown {
  if (!outputs) {
    return undefined;
  }

  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, outputs);
}

export function parseConditionValue(value: string): unknown {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'null') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value !== '') {
    return numeric;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
