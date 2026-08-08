import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const FixtureManifestSchema = z.object({
  modelId: z.enum(['D01', 'A01', 'F01']),
  name: z.string().min(1),
  layers: z.array(z.string().min(1)).min(4),
  publishedBaseId: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  operators: z.array(z.string().min(1)).min(1),
  determinismClass: z.enum(['D0', 'D1', 'D2', 'D3']),
  frames: z.array(z.string()).optional(),
  packageId: z.string().optional(),
  usesDomeImports: z.boolean().optional(),
});

export type FixtureManifest = z.infer<typeof FixtureManifestSchema>;

export function parseFixtureManifest(input: unknown): FixtureManifest {
  return FixtureManifestSchema.parse(input);
}

export function loadFixtureManifests(fixturesDir?: string): readonly FixtureManifest[] {
  const root =
    fixturesDir ??
    join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures');
  return (['d01.json', 'a01.json', 'f01.json'] as const).map((file) =>
    parseFixtureManifest(JSON.parse(readFileSync(join(root, file), 'utf8'))),
  );
}
