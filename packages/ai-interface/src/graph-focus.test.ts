import { describe, expect, it } from 'vitest';
import { isReadOnlyFocusCommand, parseGraphFocusCommand } from './graph-focus.js';

describe('SDI SD7 GraphFocusCommand', () => {
  it('parses read-only navigation commands', () => {
    const cmds = [
      parseGraphFocusCommand({ type: 'focusGraph', semanticIds: ['component:y:0000'] }),
      parseGraphFocusCommand({ type: 'explainSelection', targetId: 'component:y:0000' }),
      parseGraphFocusCommand({ type: 'showUpstream', targetId: 'component:y:0000', radius: 2 }),
      parseGraphFocusCommand({ type: 'enterPattern', patternId: 'pattern:d01:y-network' }),
      parseGraphFocusCommand({ type: 'showExecution', targetId: 'component:y:0000' }),
    ];
    for (const cmd of cmds) {
      expect(isReadOnlyFocusCommand(cmd)).toBe(true);
    }
    expect(() => parseGraphFocusCommand({ type: 'mutateModel' })).toThrow();
  });
});
