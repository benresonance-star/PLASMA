import { describe, expect, it } from 'vitest';
import { downstream, upstream, walkNeighbourhood } from './neighbourhood.js';

const edges = [
  { from: 'param:a', to: 'pattern:p', relationType: 'pattern.drives' },
  { from: 'pattern:p', to: 'component:y:1', relationType: 'produces' },
  { from: 'component:y:1', to: 'part:panel:1', relationType: 'produces' },
  { from: 'noise', to: 'other', relationType: 'part-of' },
];

describe('neighbourhood walk', () => {
  it('respects radius 0/1/2', () => {
    expect(upstream(edges, 'part:panel:1', 0)).toEqual([]);
    expect(upstream(edges, 'part:panel:1', 1)).toEqual(['component:y:1']);
    expect(upstream(edges, 'part:panel:1', 2)).toEqual(['component:y:1', 'pattern:p']);
    expect(downstream(edges, 'param:a', 2)).toEqual(['component:y:1', 'pattern:p']);
  });

  it('filters relation types and is cycle-safe', () => {
    const cyclic = [
      ...edges,
      { from: 'part:panel:1', to: 'param:a', relationType: 'depends-on' },
    ];
    const up = walkNeighbourhood(cyclic, 'part:panel:1', 'upstream', { radius: 10 });
    expect(up.ids).toContain('param:a');
    expect(upstream(edges, 'part:panel:1', 1, ['produces'])).toEqual(['component:y:1']);
    expect(upstream(edges, 'part:panel:1', 2, ['produces'])).toEqual([
      'component:y:1',
      'pattern:p',
    ]);
  });
});

