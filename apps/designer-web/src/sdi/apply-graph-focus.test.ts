import { describe, expect, it } from 'vitest';
import { parseGraphFocusCommand } from '@spds/ai-interface';
import { applyGraphFocusCommand } from './apply-graph-focus.js';

describe('SDI SD7 designer bridge', () => {
  it('maps focus commands without mutation side effects', () => {
    const nav = applyGraphFocusCommand(
      parseGraphFocusCommand({
        type: 'focusGraph',
        semanticIds: ['component:y:0000', 'component:y:0001'],
      }),
    );
    expect(nav.openLens).toBe(true);
    expect(nav.highlightedIds).toHaveLength(2);

    const exec = applyGraphFocusCommand(
      parseGraphFocusCommand({ type: 'showExecution', targetId: 'component:y:0000' }),
    );
    expect(exec.depth).toBe('execution');

    const enter = applyGraphFocusCommand(
      parseGraphFocusCommand({ type: 'enterPattern', patternId: 'pattern:d01:y-network' }),
    );
    expect(enter.enterPatternId).toBe('pattern:d01:y-network');
  });
});
