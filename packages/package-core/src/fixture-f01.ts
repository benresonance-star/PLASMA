/**
 * G14 / G14A F01 freeform fixture — semantic-only proof that the platform
 * is not secretly hard-coded to the dome.
 */

import {
  canActivatePackage,
  type PackageManifest,
  validatePackageManifest,
} from './manifest.js';

export interface F01FreeformPanel {
  readonly id: string;
  readonly kind: 'ext.freeform.Panel';
  readonly surfaceId: string;
  readonly trimCurveIds: readonly string[];
  readonly shellThicknessMm: number;
  readonly localFrameId: string;
  readonly fabId: string;
}

export interface F01Fixture {
  readonly modelId: string;
  readonly packageManifest: PackageManifest;
  readonly panels: readonly F01FreeformPanel[];
  readonly pipeline: readonly ('semantic' | 'composition' | 'pir' | 'dag')[];
  readonly usesDomeImports: false;
}

export function buildF01Fixture(): F01Fixture {
  const packageManifest: PackageManifest = {
    packageId: '@spds/ext-freeform-panels',
    name: 'freeform-panels',
    version: '0.1.0',
    namespace: 'ext.freeform',
    capabilities: [
      { name: 'panelisation', version: '1' },
      { name: 'shell', version: '1' },
      { name: 'local-frames', version: '1' },
    ],
    operators: ['trim.surface', 'shell.offset', 'panelise.uv'],
    patterns: ['pattern:FreeformPanelSet'],
    semanticTypes: ['ext.freeform.Panel', 'ext.freeform.Surface'],
    executableOperators: true,
    adminApproved: true,
  };
  const validation = validatePackageManifest(packageManifest);
  if (!validation.ok || !canActivatePackage(packageManifest)) {
    throw new Error(`F01 package invalid: ${validation.errors.join('; ')}`);
  }
  return {
    modelId: 'model:F01',
    packageManifest,
    panels: [
      {
        id: 'panel:F01:01',
        kind: 'ext.freeform.Panel',
        surfaceId: 'surf:F01:nurbs',
        trimCurveIds: ['curve:trim:a', 'curve:trim:b'],
        shellThicknessMm: 4,
        localFrameId: 'frame:panel:01',
        fabId: 'fab:F01:01',
      },
    ],
    pipeline: ['semantic', 'composition', 'pir', 'dag'],
    usesDomeImports: false,
  };
}

/** Architecture exception audit — fail if a reference model bypasses layers. */
export function auditReferencePipeline(pipeline: readonly string[]): {
  readonly ok: boolean;
  readonly missing: readonly string[];
} {
  const required = ['semantic', 'composition', 'pir', 'dag'] as const;
  const missing = required.filter((s) => !pipeline.includes(s));
  return { ok: missing.length === 0, missing };
}
