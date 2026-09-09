import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraggableHud } from './DraggableHud.js';

describe('DraggableHud', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(
        DraggableHud,
        { title: 'Measure', open: false, defaultPosition: { x: 12, y: 48 } },
        createElement('span', null, 'body'),
      ),
    );
    expect(html).toBe('');
  });

  it('renders title and body when open', () => {
    const html = renderToStaticMarkup(
      createElement(
        DraggableHud,
        {
          title: 'Measure',
          open: true,
          defaultPosition: { x: 12, y: 48 },
          testId: 'measure-hud',
        },
        createElement('span', null, 'tools'),
      ),
    );
    expect(html).toContain('Measure');
    expect(html).toContain('tools');
    expect(html).toContain('measure-hud');
  });
});
