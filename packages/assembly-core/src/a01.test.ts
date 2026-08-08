import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildA01AssemblyFixture } from './fixture-a01.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('G3D A01 assembly gate', () => {
  it('builds a semantic assembly with definitions, instances, mates, and bolted connection', () => {
    const a01 = buildA01AssemblyFixture();
    const inspector = a01.registry.inspector();
    expect(inspector.definitions).toHaveLength(2);
    expect(inspector.instances).toHaveLength(3);
    expect(inspector.mates.length).toBeGreaterThan(0);
    expect(inspector.connections[0]?.connectionType).toBe('bolted');
    expect(inspector.bom['def:clevis']).toBe(2);
    expect(a01.frames.some((f) => f.role === 'WORLD')).toBe(true);
    expect(a01.importPlaceholder.format).toBe('STEP');

    const plate = a01.registry.getInstance('inst:plate:01')!;
    const stableBefore = plate.stableInstanceId;
    a01.registry.updateDefinitionRevision('def:node-plate', '1.1.0', { thicknessMm: 16 });
    expect(a01.registry.getInstance('inst:plate:01')?.stableInstanceId).toBe(stableBefore);
    expect(a01.registry.getInstance('inst:plate:01')?.definitionRevision).toBe('1.0.0');
  });

  it('contains no geometry-kernel imports in assembly-core sources', () => {
    const srcFiles = ['types.ts', 'registry.ts', 'fixture-a01.ts', 'index.ts'];
    for (const file of srcFiles) {
      const importLines = readFileSync(join(here, file), 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^\s*import\s.+from\s+['"]/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/opencascade|\bocct\b|@spds\/geometry-/i);
      }
    }
  });
});

