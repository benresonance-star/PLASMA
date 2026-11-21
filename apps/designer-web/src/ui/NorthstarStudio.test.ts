import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NorthstarStudio } from './NorthstarStudio.js';

vi.mock('./ViewportCanvas.js', () => ({
  ViewportCanvas: () => createElement('div', { 'data-testid': 'live-geometry-viewport' }),
}));
vi.mock('../api-client.js', () => ({
  apiBaseUrl: () => '/api',
}));

describe('Northstar grounded-workspace HTML smoke', () => {
  it('exposes place, design, reason and actual session Worldline, without invented registration', () => {
    const html = renderToStaticMarkup(createElement(NorthstarStudio, {
      onClose: () => undefined,
      onOpenFusion: () => undefined,
      fusion: null,
      selectedSemanticId: 'entity:actual:window',
      onSelectSemantic: () => undefined,
      meshes: [],
      serviceMeshes: [],
      modelId: 'model:hotel',
      branchId: 'branch:hotel',
      headHash: 'hash:actual-revision-42',
      sessionEvents: [{ id: 'event:1', kind: 'selection', label: 'Selected a real component', atMs: 100 }],
    }));
    expect(html).toContain('Place');
    expect(html).toContain('Design');
    expect(html).toContain('Reason');
    expect(html).toContain('WORLDLINE');
    expect(html).toContain('UNREGISTERED');
    expect(html).toContain('No capture loaded');
    expect(html).toContain('Selected a real component');
    expect(html).toContain('hash:actual-revision-42');
    expect(html).toContain('live-geometry-viewport');
    expect(html).toContain('Not an issued revision history');
  });
});
