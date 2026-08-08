import { describe, expect, it } from 'vitest';
import { parseTopologyMapping, parseTopologyNode } from './domains.js';

describe('G3B.1 topology domains', () => {
  it('models design/product/geometric separately', () => {
    expect(parseTopologyNode({ domain: 'design', id: 'cell:h:0017', kind: 'cell' }).domain).toBe(
      'design',
    );
    expect(parseTopologyNode({ domain: 'product', id: 'part:panel:01', kind: 'part' }).domain).toBe(
      'product',
    );
    expect(
      parseTopologyNode({ domain: 'geometric', id: 'geom:face:stable-01', kind: 'face' }).domain,
    ).toBe('geometric');
  });

  it('allows many-to-many mappings and rejects same-domain confusion', () => {
    const a = parseTopologyMapping({
      id: 'map:1',
      fromDomain: 'design',
      fromId: 'member:01',
      toDomain: 'product',
      toId: 'part:a',
      relation: 'implements',
    });
    const b = parseTopologyMapping({
      id: 'map:2',
      fromDomain: 'design',
      fromId: 'member:01',
      toDomain: 'product',
      toId: 'part:b',
      relation: 'implements',
    });
    expect(a.fromId).toBe(b.fromId);
    expect(a.toId).not.toBe(b.toId);
    expect(() =>
      parseTopologyMapping({
        id: 'map:bad',
        fromDomain: 'design',
        fromId: 'a',
        toDomain: 'design',
        toId: 'b',
        relation: 'implements',
      }),
    ).toThrow(/Cross-domain/);
  });
});
