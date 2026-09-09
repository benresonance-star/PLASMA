import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePatternDefinition,
  type PatternDefinition,
  type PatternParameterDefinition,
} from '@spds/pattern-engine';

interface PatternPackageManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly lifecycle: 'draft' | 'validated' | 'published' | 'deprecated';
  readonly intent: readonly string[];
  readonly applicableTo: readonly string[];
  readonly requires: readonly string[];
  readonly operators: readonly string[];
  readonly parameters: Readonly<Record<string, Omit<PatternParameterDefinition, 'name'>>>;
}

export function loadGoldbergPatternManifest(
  manifestPath = join(dirname(fileURLToPath(import.meta.url)), '../manifest.json'),
): PatternDefinition {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as PatternPackageManifest;
  return parsePatternDefinition({
    id: raw.id,
    version: raw.version,
    name: raw.name,
    lifecycle: raw.lifecycle,
    intent: [...raw.intent],
    applicableTo: [...raw.applicableTo],
    requires: [...raw.requires],
    parameters: Object.entries(raw.parameters).map(([name, spec]) => ({
      name,
      ...spec,
    })),
    operatorBindings: raw.operators.map((op) => {
      const [operatorId, operatorVersion = '1.0.0'] = op.split('@');
      return {
        role: operatorId!.split('.')[0] ?? 'operator',
        operatorId: operatorId!,
        operatorVersion,
      };
    }),
  });
}

export const GOLDBERG_PATTERN_ID = 'pattern:goldberg-cellular-topology' as const;
export const GOLDBERG_PATTERN_VERSION = '1.0.0' as const;
