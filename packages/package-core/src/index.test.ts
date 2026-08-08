import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ADVERSARIAL_CASES,
  auditReferencePipeline,
  buildF01Fixture,
  buildReferenceCompletenessSuite,
  runAdversarialCompositionSuite,
  scaleTierPolicy,
  targetsCapability,
  validatePackageManifest,
} from './index.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('G14 extensibility', () => {
  it('validates F01 freeform package without dome-specific imports', () => {
    const f01 = buildF01Fixture();
    expect(f01.usesDomeImports).toBe(false);
    expect(validatePackageManifest(f01.packageManifest).ok).toBe(true);
    expect(targetsCapability(f01.packageManifest, 'panelisation')).toBe(true);
    expect(auditReferencePipeline(f01.pipeline).ok).toBe(true);

    const blocked = {
      ...f01.packageManifest,
      adminApproved: false,
    };
    expect(validatePackageManifest(blocked).ok).toBe(false);

    for (const file of ['manifest.ts', 'fixture-f01.ts', 'index.ts']) {
      const text = readFileSync(join(here, file), 'utf8');
      expect(text).not.toMatch(/dome-reference|@spds\/dome/i);
    }
  });
});

describe('G14A/G14B reference and adversarial hooks', () => {
  it('covers D01/A01/F01 without layer bypass and fails adversarially without hang', () => {
    const suite = buildReferenceCompletenessSuite();
    expect(suite.map((r) => r.modelId).sort()).toEqual(['A01', 'D01', 'F01']);
    expect(suite.every((r) => !r.bypassDetected)).toBe(true);

    const results = runAdversarialCompositionSuite(DEFAULT_ADVERSARIAL_CASES);
    expect(results.every((r) => r.status === 'structured-fail' && r.timedOut === false)).toBe(true);
    expect(scaleTierPolicy('B1-L').requiresPagination).toBe(true);
  });
});
