import { describe, it, expect } from 'vitest';
import type { WorkflowGraph, WorkflowNode } from '../src/builder/workflow-graph';
import {
  collectIncomingOutputs,
  findNextEdges,
  getRoutingOutputs,
  matchesCondition
} from '../src/runtime/workflow-traversal';

const meta = (): WorkflowGraph['metadata'] => ({
  version: '1',
  compiledAt: new Date().toISOString(),
  specId: 't'
});

const traversal = (): WorkflowGraph['traversal'] => ({
  decision: 'first-match-else-default',
  parallel: 'all-matching',
  default: 'first-match'
});

describe('workflow-traversal', () => {
  it('collectIncomingOutputs merges fan-in', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'action', toolId: 't1' },
        { id: 'b', type: 'action', toolId: 't2' },
        { id: 'c', type: 'action', toolId: 't3' }
      ],
      edges: [
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' }
      ],
      traversal: traversal(),
      metadata: meta()
    };
    const out = collectIncomingOutputs('c', graph, id =>
      id === 'a' ? { x: 1 } : id === 'b' ? { y: 2 } : undefined
    );
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it('getRoutingOutputs uses incoming data for decision nodes', () => {
    const node: WorkflowNode = { id: 'd', type: 'decision' };
    const graph: WorkflowGraph = {
      nodes: [{ id: 'prev', type: 'action', toolId: 't' }, node],
      edges: [{ from: 'prev', to: 'd' }],
      traversal: traversal(),
      metadata: meta()
    };
    const routing = getRoutingOutputs(
      node,
      graph,
      {},
      id => (id === 'prev' ? { approved: true } : undefined)
    );
    expect(routing).toEqual({ approved: true });
  });

  it('matchesCondition supports == and truthy field', () => {
    expect(matchesCondition('approved == true', { approved: true })).toBe(true);
    expect(matchesCondition('approved', { approved: true })).toBe(true);
    expect(matchesCondition('approved', { approved: false })).toBe(false);
  });

  it('findNextEdges picks conditional branch for decision', () => {
    const node: WorkflowNode = { id: 'decision-1', type: 'decision' };
    const graph: WorkflowGraph = {
      nodes: [node],
      edges: [
        { from: 'decision-1', to: 'ok', condition: 'ok == true' },
        { from: 'decision-1', to: 'fallback' }
      ],
      traversal: traversal(),
      metadata: meta()
    };
    const next = findNextEdges(node, graph, { ok: true });
    expect(next).toHaveLength(1);
    expect(next[0].to).toBe('ok');
  });
});
