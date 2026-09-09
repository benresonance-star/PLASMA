import { describe, expect, it } from 'vitest';
import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_LENGTH_ID,
} from '@spds/ai-interface';
import { projectSchemaCatalog } from './schema-projection.js';
import {
  nextSchemaSemanticFromRfSelection,
  schemaMarkerColorForRelation,
  schemaProjectionToReactFlow,
  schemaRfClassForNode,
  type SchemaRfNodeData,
} from './schema-reactflow-adapter.js';
import {
  attachSchemaMutateSlice,
  defaultSchemaMutateSlice,
  parseSchemaViewPayload,
} from './schema-view.js';
import type { Node } from '@xyflow/react';

describe('schema-reactflow-adapter', () => {
  it('preserves semantic ids, mutable badge, unique edges', () => {
    const base = parseSchemaViewPayload({
      modelId: 'model:d01',
      live: true,
      kinds: ['Parameter', 'Pattern'],
      relationships: { core: [], sdi: [], sdiToStorage: [] },
      liveTypes: [],
      organisation: { folderCount: 0, folderIds: [] },
      patterns: [GOLDBERG_PATTERN_PUBLISHED_ID],
    });
    const schema = attachSchemaMutateSlice(base!, defaultSchemaMutateSlice());
    const projection = projectSchemaCatalog({ schema, lens: 'mutable' });
    const t0 = performance.now();
    const rf = schemaProjectionToReactFlow(projection, {
      provisionalSemanticIds: new Set([PARAM_D01_LENGTH_ID]),
    });
    expect(performance.now() - t0).toBeLessThan(20);
    expect(rf.nodes.some((n) => n.data.semanticId === PARAM_D01_LENGTH_ID)).toBe(true);
    const paramNode = projection.nodes.find((n) => n.semanticId === PARAM_D01_LENGTH_ID)!;
    expect(schemaRfClassForNode(paramNode, new Set([PARAM_D01_LENGTH_ID]))).toMatch(
      /mutable/,
    );
    expect(schemaRfClassForNode(paramNode, new Set([PARAM_D01_LENGTH_ID]))).toMatch(
      /provisional/,
    );
    const ids = rf.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks drives edges with green marker, geometry flag, and detailed hover', () => {
    const base = parseSchemaViewPayload({
      modelId: 'model:d01',
      live: true,
      kinds: ['Parameter', 'Pattern'],
      relationships: { core: [], sdi: [], sdiToStorage: [] },
      liveTypes: [],
      organisation: { folderCount: 0, folderIds: [] },
      patterns: [GOLDBERG_PATTERN_PUBLISHED_ID],
    });
    const schema = attachSchemaMutateSlice(base!, defaultSchemaMutateSlice());
    const projection = projectSchemaCatalog({ schema, lens: 'full' });
    const rf = schemaProjectionToReactFlow(projection);
    const drives = rf.edges.filter((e) => e.data?.relationType === 'drives');
    expect(drives.length).toBeGreaterThan(0);
    for (const e of drives) {
      expect(e.data?.drivesGeometry).toBe(true);
      expect(e.markerEnd).toMatchObject({ color: '#2ecc71' });
      expect(e.className).toMatch(/schema-rf-edge--drives/);
      expect(e.data?.hoverLabel).toMatch(/drives:/i);
      expect(e.data?.hoverDetail?.length ?? 0).toBeGreaterThan(10);
    }
    expect(rf.nodes.every((n) => n.data.hoverPurpose.length > 10)).toBe(true);
    expect(schemaMarkerColorForRelation('binds')).toBe('#8b939c');
    expect(schemaMarkerColorForRelation('alias')).toBe('#8b939c');
  });

  it('ignores empty RF selection (schema selection guard)', () => {
    const nodes = [
      {
        id: 'schema:view:param:d01:length',
        position: { x: 0, y: 0 },
        data: {
          semanticId: PARAM_D01_LENGTH_ID,
          role: 'parameter' as const,
          label: 'length',
          mutable: true,
          hoverTitle: 'length',
          hoverPurpose: 'Primary length',
          hoverHowToUse: 'Draft update',
        },
      },
    ] as Node<SchemaRfNodeData>[];
    expect(nextSchemaSemanticFromRfSelection(nodes, [], true)).toBeUndefined();
    expect(nextSchemaSemanticFromRfSelection(nodes, [], false)).toBeUndefined();
    expect(
      nextSchemaSemanticFromRfSelection(nodes, ['schema:view:param:d01:length'], false),
    ).toBe(PARAM_D01_LENGTH_ID);
  });
});
