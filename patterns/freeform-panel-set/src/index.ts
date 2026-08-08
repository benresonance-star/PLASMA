import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePatternDefinition,
  type PatternDefinition,
} from '@spds/pattern-engine';

export function loadFreeformPanelPatternManifest(
  manifestPath = join(dirname(fileURLToPath(import.meta.url)), '../manifest.json'),
): PatternDefinition {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    id: string;
    version: string;
    name: string;
    lifecycle: 'draft' | 'validated' | 'published' | 'deprecated';
    intent: string[];
    applicableTo: string[];
    requires: string[];
    operators: string[];
    parameters: Record<string, { type: string; default?: unknown }>;
  };
  return parsePatternDefinition({
    id: raw.id,
    version: raw.version,
    name: raw.name,
    lifecycle: raw.lifecycle,
    intent: raw.intent,
    applicableTo: raw.applicableTo,
    requires: raw.requires,
    parameters: Object.entries(raw.parameters).map(([name, spec]) => ({ name, ...spec })),
    operatorBindings: raw.operators.map((op) => {
      const [operatorId, operatorVersion = '1.0.0'] = op.split('@');
      return {
        role: operatorId!.includes('trim')
          ? 'trim'
          : operatorId!.includes('shell')
            ? 'shell'
            : 'panelise',
        operatorId: operatorId!,
        operatorVersion,
      };
    }),
  });
}

export const FREEFORM_PATTERN_ID = 'pattern:FreeformPanelSet' as const;
