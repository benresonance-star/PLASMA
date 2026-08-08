import { describe, expect, it } from 'vitest';
import { compileMockPatternGraph } from './compile.js';
import { PatternRegistry } from './registry.js';

describe('G3 pattern/operator gate', () => {
  it('compiles a semantic pattern graph deterministically with mock operators', async () => {
    const a = await compileMockPatternGraph({ frequency: 2, diameterMm: 20000 });
    const b = await compileMockPatternGraph({ frequency: 2, diameterMm: 20000 });
    expect(a.operatorResult.output).toEqual(b.operatorResult.output);
    expect(a.operatorResult.outputHash).toBe(b.operatorResult.outputHash);
    expect(a.operatorResult.inputsHash).toBe(b.operatorResult.inputsHash);
    expect(a.jobPlan.operatorKeys).toContain('topology.goldberg.mock@1.0.0');
    expect(a.invalidationSet).toContain('topology:cells');
  });

  it('forks published patterns into a new draft version', () => {
    const registry = new PatternRegistry();
    registry.register({
      id: 'pattern:demo',
      version: '1.0.0',
      name: 'Demo',
      lifecycle: 'published',
    });
    const forked = registry.fork('pattern:demo', '1.0.0', '1.1.0', { name: 'Demo v2' });
    expect(forked.lifecycle).toBe('draft');
    expect(forked.parentId).toBe('pattern:demo@1.0.0');
  });
});
