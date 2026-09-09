import { describe, expect, it } from 'vitest';
import { SEMANTIC_KINDS } from './kinds.js';
import {
  buildSchemaPayload,
  buildStaticSchema,
  schemaPayloadToAiCatalog,
} from './schema-payload.js';

describe('schema-payload', () => {
  it('static assembler includes all kinds and part-of aliases', () => {
    const t0 = performance.now();
    const staticPart = buildStaticSchema();
    expect(performance.now() - t0).toBeLessThan(5);
    expect(staticPart.kinds.length).toBe(SEMANTIC_KINDS.length);
    expect(staticPart.kinds.length).toBeGreaterThanOrEqual(30);
    expect(staticPart.kinds).toEqual([...SEMANTIC_KINDS]);
    expect(staticPart.relationships.core).toContain('part-of');
    expect(staticPart.relationships.sdi.length).toBeGreaterThan(0);
  });

  it('merges live D01-like types and folder organisation', () => {
    const t0 = performance.now();
    const payload = buildSchemaPayload([
      { id: 'model:d01', semanticType: 'structure.geodesic-dome' },
      { id: 'param:d01:lengthMm', semanticType: 'parameter.number' },
      { id: 'component:y:0000', semanticType: 'structural.y-component' },
      {
        id: 'folder:bay',
        semanticType: 'ui.folder',
        tags: ['ui.folder'],
      },
    ]);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(payload.liveTypes.some((t) => t.semanticType === 'structural.y-component')).toBe(
      true,
    );
    expect(payload.liveTypes.some((t) => t.semanticType === 'parameter.number')).toBe(true);
    expect(payload.organisation.folderCount).toBe(1);
    expect(payload.organisation.folderIds).toEqual(['folder:bay']);
  });

  it('AI catalog rejects hardcoded-only types when live seeded', () => {
    const objects = [
      { id: 'component:y:0000', semanticType: 'structural.y-component' },
      { id: 'pattern:d01:y-network', semanticType: 'pattern.y-network' },
    ];
    const payload = buildSchemaPayload(objects);
    const catalog = schemaPayloadToAiCatalog(payload, objects);
    expect(catalog.schemaTypes.length).toBeGreaterThanOrEqual(30);
    expect(catalog.schemaTypes).toContain('structural.y-component');
    expect(catalog.objects.some((o) => o.id === 'component:y:0000')).toBe(true);
    expect(catalog.schemaTypes).not.toEqual(['Y', 'Pattern']);
  });
});
