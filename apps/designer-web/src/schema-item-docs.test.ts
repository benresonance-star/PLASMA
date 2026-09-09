import { describe, expect, it } from 'vitest';
import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_LENGTH_ID,
} from '@spds/ai-interface';
import {
  formatSchemaNodeHover,
  lookupSchemaItemDoc,
  lookupSchemaRelationDoc,
} from './schema-item-docs.js';

describe('schema-item-docs', () => {
  it('looks up Parameter / length / Goldberg with non-empty copy', () => {
    const t0 = performance.now();
    expect(lookupSchemaItemDoc('Parameter').purpose.length).toBeGreaterThan(10);
    expect(lookupSchemaItemDoc('parameter.number').howToUse.length).toBeGreaterThan(10);
    expect(lookupSchemaItemDoc(PARAM_D01_LENGTH_ID).purpose).toMatch(/length/i);
    expect(lookupSchemaItemDoc(GOLDBERG_PATTERN_PUBLISHED_ID).purpose).toMatch(/Goldberg/i);
    expect(performance.now() - t0).toBeLessThan(1);
  });

  it('falls back for unknown keys', () => {
    const doc = lookupSchemaItemDoc('totally.unknown.kind');
    expect(doc.purpose).toMatch(/building block/i);
  });

  it('relation and node hover copy are detailed', () => {
    expect(lookupSchemaRelationDoc('drives').purpose).toMatch(/parameter/i);
    expect(lookupSchemaRelationDoc('produces').purpose).toMatch(/live/i);
    const hover = formatSchemaNodeHover({
      semanticId: 'Entity',
      role: 'kind',
      label: 'Entity',
      mutable: false,
    });
    expect(hover.title).toMatch(/Entity/);
    expect(hover.purpose.length).toBeGreaterThan(10);
    expect(hover.howToUse.length).toBeGreaterThan(10);
  });
});
