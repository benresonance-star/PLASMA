import { createSpdsError } from '@spds/failure-taxonomy';
import { computeInvalidationSet } from '@spds/dependency-graph';
import type { PirDocument, PirOperation } from '@spds/parametric-ir';
import { sha256Canonical } from '@spds/reproducibility';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';

export type NodeStatus = 'pending' | 'running' | 'cached' | 'succeeded' | 'failed';
export type CacheStatus = 'miss' | 'hit' | 'invalidated';

export interface DagNode {
  readonly id: string;
  readonly operator: string;
  readonly semanticOwner: string;
  readonly dependsOn: readonly string[];
  readonly invalidationEdges: readonly string[];
  readonly inputHash: string;
  readonly cacheKey: string;
  readonly expectedOutputType: string;
  readonly tolerancePolicyVersion: string;
  status: NodeStatus;
  cacheStatus: CacheStatus;
  timingMs?: number;
  diagnostics: string[];
}

export interface ExecutionDag {
  readonly id: string;
  readonly pirHash: string;
  readonly nodes: readonly DagNode[];
  readonly topoOrder: readonly string[];
  readonly dagHash: string;
}

export interface CompilerConfig {
  readonly compilerVersion: string;
  readonly scheduleMode: 'sequential' | 'parallel-ready';
}

function topoSort(ops: readonly PirOperation[]): string[] {
  const byId = new Map(ops.map((o) => [o.id, o]));
  const indeg = new Map<string, number>();
  for (const op of ops) indeg.set(op.id, 0);
  for (const op of ops) {
    for (const dep of op.dependsOn) {
      if (!byId.has(dep)) {
        throw createSpdsError({
          code: 'DEPENDENCY_CYCLE',
          summary: `Missing dependency ${dep} for ${op.id}`,
          affectedSemanticIds: [op.id, dep],
          recoverable: false,
        });
      }
      indeg.set(op.id, (indeg.get(op.id) ?? 0) + 1);
    }
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const op of ops) {
      if (!op.dependsOn.includes(id)) continue;
      const next = (indeg.get(op.id) ?? 0) - 1;
      indeg.set(op.id, next);
      if (next === 0) {
        queue.push(op.id);
        queue.sort();
      }
    }
  }
  if (order.length !== ops.length) {
    throw createSpdsError({
      code: 'DEPENDENCY_CYCLE',
      summary: 'PIR operations contain a dependency cycle',
      affectedSemanticIds: ops.map((o) => o.id),
      recoverable: false,
    });
  }
  return order;
}

export function buildCacheKey(input: {
  operator: string;
  inputHash: string;
  tolerancePolicyVersion: string;
  compilerConfig: CompilerConfig;
}): string {
  return sha256Canonical({
    operator: input.operator,
    inputHash: input.inputHash,
    tolerancePolicyVersion: input.tolerancePolicyVersion,
    compilerConfig: input.compilerConfig,
  });
}

export function buildExecutionDag(
  pir: PirDocument,
  pirHash: string,
  compilerConfig: CompilerConfig = {
    compilerVersion: 'execution-dag@0.0.0',
    scheduleMode: 'sequential',
  },
): ExecutionDag {
  const topoOrder = topoSort(pir.operations);
  const nodes: DagNode[] = pir.operations.map((op) => {
    const inputHash = sha256Canonical(op.inputs);
    const cacheKey = buildCacheKey({
      operator: op.operator,
      inputHash,
      tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
      compilerConfig,
    });
    return {
      id: op.id,
      operator: op.operator,
      semanticOwner: op.semanticOwner,
      dependsOn: [...op.dependsOn],
      invalidationEdges: [...op.dependsOn],
      inputHash,
      cacheKey,
      expectedOutputType: op.produces?.role ?? 'unknown',
      tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
      status: 'pending',
      cacheStatus: 'miss',
      diagnostics: [],
    };
  });

  const dag = {
    id: `dag:${pir.id}`,
    pirHash,
    nodes,
    topoOrder,
    dagHash: '',
  };
  const dagHash = sha256Canonical({
    id: dag.id,
    pirHash: dag.pirHash,
    topoOrder: dag.topoOrder,
    nodes: nodes.map((n) => ({
      id: n.id,
      operator: n.operator,
      semanticOwner: n.semanticOwner,
      dependsOn: n.dependsOn,
      inputHash: n.inputHash,
      cacheKey: n.cacheKey,
      expectedOutputType: n.expectedOutputType,
      tolerancePolicyVersion: n.tolerancePolicyVersion,
    })),
  });
  return { ...dag, dagHash };
}

export function planIncrementalInvalidation(
  dag: ExecutionDag,
  changedNodeIds: readonly string[],
): readonly string[] {
  const edges = dag.nodes.flatMap((n) => n.dependsOn.map((from) => ({ from, to: n.id })));
  return computeInvalidationSet(edges, changedNodeIds);
}

/** Mock run: records cache hit/miss and succeeds in topo order. */
export function runMockDag(
  dag: ExecutionDag,
  cache: Map<string, unknown>,
): ExecutionDag {
  const byId = new Map(dag.nodes.map((n) => [n.id, { ...n, diagnostics: [...n.diagnostics] }]));
  for (const id of dag.topoOrder) {
    const node = byId.get(id)!;
    const start = Date.now();
    if (cache.has(node.cacheKey)) {
      node.cacheStatus = 'hit';
      node.status = 'cached';
      node.diagnostics.push('cache-hit');
    } else {
      node.cacheStatus = 'miss';
      node.status = 'succeeded';
      cache.set(node.cacheKey, { ok: true, nodeId: node.id });
      node.diagnostics.push('cache-miss-computed');
    }
    node.timingMs = Math.max(0, Date.now() - start);
  }
  return {
    ...dag,
    nodes: dag.topoOrder.map((id) => byId.get(id)!),
  };
}
