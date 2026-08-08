import { describe, expect, it } from 'vitest';
import { parseSelector } from './types.js';
import { resolveSelector } from './resolve.js';

const universe = [
  {
    id: 'component:y:0042',
    semanticType: 'structural.y-component',
    tags: ['primary'],
    adjacentTo: { cellType: 'pentagon' },
    capabilities: ['fabricate.panel'],
    subElements: { 'arm:A/terminal:outer/role:mounting-face': 'face:ref:0042-a' },
  },
  {
    id: 'component:y:0043',
    semanticType: 'structural.y-component',
    tags: ['secondary'],
    adjacentTo: { cellType: 'hexagon' },
    capabilities: ['fabricate.panel'],
  },
] as const;

describe('G3A.1 selectors', () => {
  it('resolves a unique semantic query', () => {
    const selector = parseSelector({
      id: 'selector:y-pentagon',
      kind: 'Selector',
      semanticType: 'selection.semantic-query',
      where: {
        semanticType: 'structural.y-component',
        adjacentTo: { cellType: 'pentagon' },
      },
    });
    const result = resolveSelector(selector, universe);
    expect(result.status).toBe('ok');
    expect(result.matches).toEqual(['component:y:0042']);
  });

  it('fails visibly on ambiguity', () => {
    const selector = parseSelector({
      id: 'selector:all-y',
      kind: 'Selector',
      semanticType: 'selection.semantic-query',
      where: { semanticType: 'structural.y-component' },
    });
    const result = resolveSelector(selector, universe);
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.error.code).toBe('SELECTOR_AMBIGUOUS');
    }
  });

  it('matches capability selectors (multi-ok)', () => {
    const selector = parseSelector({
      id: 'selector:fab-panel',
      kind: 'Selector',
      semanticType: 'selection.capability',
      capability: 'fabricate.panel',
    });
    const result = resolveSelector(selector, universe);
    expect(result.status).toBe('ok');
    expect(result.matches).toHaveLength(2);
  });

  it('resolves sub-element paths', () => {
    const selector = parseSelector({
      id: 'selector:mount',
      kind: 'Selector',
      semanticType: 'selection.sub-element',
      owner: 'component:y:0042',
      path: ['arm:A', 'terminal:outer', 'role:mounting-face'],
    });
    const result = resolveSelector(selector, universe);
    expect(result.status).toBe('ok');
    expect(result.matches).toEqual(['face:ref:0042-a']);
  });
});
