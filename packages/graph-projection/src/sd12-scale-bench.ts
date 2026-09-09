/**
 * SD12 / Part G scale bench harness — promotes generators + cache + budget asserts.
 */

import { IndexedSemanticGraph } from '@spds/semantic-query';
import { aggregateByFamily } from './aggregates.js';
import {
  assertProjectionBudget,
  generateSyntheticGraph,
} from './generators.js';
import {
  createProjectionCache,
  type ProjectionCacheKey,
} from './projection-cache.js';
import {
  layoutCausalColumns,
  projectCausalNeighbourhood,
} from './project.js';
import type { GraphProjection } from './types.js';

export type ScaleSize = 1000 | 10000 | 100000;

/** Absolute budgets from SDI SD12.2 / plan Part G table. */
export const SD12_BUDGETS = {
  1000: { projectMs: 20, layoutMs: 50, highlightMs: 50 },
  10000: { projectMs: 50, layoutMs: 150, highlightMs: 100 },
  100000: { projectMs: 100, layoutMs: 300, highlightMs: 150 },
  cacheHitMs: 2,
  maxProjectedNodes: 500,
} as const;

export interface ScaleBenchTimings {
  readonly size: ScaleSize;
  readonly generateMs: number;
  readonly projectMs: number;
  readonly layoutMs: number;
  readonly highlightMs: number;
  readonly projectedNodes: number;
  readonly objectCount: number;
  readonly edgeCount: number;
}

export interface ScaleGraphBundle {
  readonly size: ScaleSize;
  readonly graph: IndexedSemanticGraph;
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly relationType: string;
  }[];
  readonly objectCount: number;
  readonly edgeCount: number;
  readonly generateMs: number;
  readonly focusId: string;
}

export function assertSyntheticConnectivity(
  size: ScaleSize,
  bundle: {
    readonly objectCount: number;
    readonly edgeCount: number;
    readonly edges: readonly { readonly from: string; readonly to: string }[];
  },
): void {
  if (bundle.objectCount !== size) {
    throw new Error(`Expected ${size} objects, got ${bundle.objectCount}`);
  }
  // param→pattern + pattern→each entity
  const expectedEdges = size - 1;
  if (bundle.edgeCount !== expectedEdges) {
    throw new Error(`Expected ${expectedEdges} edges, got ${bundle.edgeCount}`);
  }
  const fromPattern = bundle.edges.filter((e) => e.from === 'pattern:synth').length;
  if (fromPattern !== size - 2) {
    throw new Error(`Expected ${size - 2} produces edges, got ${fromPattern}`);
  }
}

export function buildScaleGraph(size: ScaleSize): ScaleGraphBundle {
  const t0 = performance.now();
  const synth = generateSyntheticGraph(size);
  const graph = new IndexedSemanticGraph(
    synth.objects.map((o) => ({
      id: o.id,
      semanticType: o.semanticType,
    })),
  );
  const generateMs = performance.now() - t0;
  return {
    size,
    graph,
    edges: synth.edges,
    objectCount: synth.objects.length,
    edgeCount: synth.edges.length,
    generateMs,
    focusId: 'component:synth:00000',
  };
}

/**
 * Project r≤2 without expanding the full sibling star (keeps ≤500 projected on large graphs).
 * Aggregate as a safety net if a dense projection slips through.
 */
export function projectScaleNeighbourhood(bundle: ScaleGraphBundle): GraphProjection {
  const raw = projectCausalNeighbourhood({
    graph: bundle.graph,
    dependencyEdges: bundle.edges,
    focusObjectIds: [bundle.focusId],
    highlightObjectIds: [bundle.focusId],
    radius: 2,
    depth: 'system',
    expandPatternContext: false,
    projectionId: `proj:sd12:${bundle.size}`,
  });
  const projected =
    raw.nodes.length > SD12_BUDGETS.maxProjectedNodes
      ? aggregateByFamily(raw, { threshold: 8 })
      : raw;
  assertProjectionBudget(projected.nodes.length, SD12_BUDGETS.maxProjectedNodes);
  return projected;
}

export function runScaleBench(size: ScaleSize): ScaleBenchTimings {
  const bundle = buildScaleGraph(size);
  assertSyntheticConnectivity(size, bundle);

  const tProject = performance.now();
  const projected = projectScaleNeighbourhood(bundle);
  const projectMs = performance.now() - tProject;

  const layoutInput = projected.nodes.map((n) => ({
    semanticId: n.semanticId,
    semanticType: n.semanticType,
    projectionRole: n.projectionRole,
    family: n.family,
    summary: n.summary,
    label: n.label,
  }));
  const tLayout = performance.now();
  const positions = layoutCausalColumns(layoutInput);
  const layoutMs = performance.now() - tLayout;
  if (positions.size !== projected.nodes.length) {
    throw new Error('Layout did not position all projected nodes');
  }

  const tHighlight = performance.now();
  const highlighted = projectCausalNeighbourhood({
    graph: bundle.graph,
    dependencyEdges: bundle.edges,
    focusObjectIds: [bundle.focusId],
    highlightObjectIds: ['param:synth:length', bundle.focusId],
    radius: 2,
    depth: 'system',
    expandPatternContext: false,
    projectionId: `proj:sd12:${bundle.size}:hl`,
  });
  const highlightMs = performance.now() - tHighlight;
  if (!highlighted.nodes.some((n) => n.projectionRole === 'focus')) {
    throw new Error('Highlight pass produced no focus role');
  }

  return {
    size,
    generateMs: bundle.generateMs,
    projectMs,
    layoutMs,
    highlightMs,
    projectedNodes: projected.nodes.length,
    objectCount: bundle.objectCount,
    edgeCount: bundle.edgeCount,
  };
}

export function assertScaleBudgets(timings: ScaleBenchTimings): void {
  const budget = SD12_BUDGETS[timings.size];
  if (timings.projectedNodes > SD12_BUDGETS.maxProjectedNodes) {
    throw new Error(
      `Projected ${timings.projectedNodes} > ${SD12_BUDGETS.maxProjectedNodes}`,
    );
  }
  if (timings.projectMs > budget.projectMs) {
    throw new Error(
      `Projection ${timings.projectMs.toFixed(2)}ms > ${budget.projectMs}ms @ ${timings.size}`,
    );
  }
  if (timings.layoutMs > budget.layoutMs) {
    throw new Error(
      `Layout ${timings.layoutMs.toFixed(2)}ms > ${budget.layoutMs}ms @ ${timings.size}`,
    );
  }
  if (timings.highlightMs > budget.highlightMs) {
    throw new Error(
      `Highlight ${timings.highlightMs.toFixed(2)}ms > ${budget.highlightMs}ms @ ${timings.size}`,
    );
  }
}

/** Warm cache then measure hit latency (must be < 2 ms). */
export function measureCacheHitMs(iterations = 50): number {
  const bundle = buildScaleGraph(1000);
  const projection = projectScaleNeighbourhood(bundle);
  const cache = createProjectionCache();
  const key: ProjectionCacheKey = {
    modelVersion: 'v-bench',
    focusIds: [bundle.focusId],
    radius: 2,
    depth: 'system',
    lenses: ['patterns', 'entities'],
  };
  cache.set(key, projection);
  // Warm
  cache.get(key);
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const hit = cache.get(key);
    if (!hit) throw new Error('Expected cache hit');
  }
  return (performance.now() - t0) / iterations;
}

export function regressionExceeded(
  measuredMs: number,
  baselineMs: number,
  maxIncrease = 0.2,
): boolean {
  if (baselineMs <= 0) return false;
  return measuredMs > baselineMs * (1 + maxIncrease);
}
