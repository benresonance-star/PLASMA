/** G10A.3 AP242 export capability — partial OK with explicit limitation report. */

export interface Ap242Capability {
  readonly feature: string;
  readonly supported: boolean;
  readonly notes: string;
}

export const AP242_CAPABILITY_MATRIX: readonly Ap242Capability[] = [
  { feature: 'product_structure', supported: true, notes: 'Assembly/part tree export' },
  { feature: 'exact_brep_geometry', supported: true, notes: 'Via geometry service when available' },
  { feature: 'semantic_pmi_datums', supported: false, notes: 'Preserved in SPDS DB only' },
  { feature: 'semantic_pmi_tolerances', supported: false, notes: 'Preserved in SPDS DB only' },
  { feature: 'presentation_pmi', supported: false, notes: 'Not in v1 export subset' },
  { feature: 'validation_properties', supported: true, notes: 'Mass/volume when measured' },
] as const;

export interface Ap242ExportReport {
  readonly exportedFeatures: readonly string[];
  readonly unsupportedRetainedInDb: readonly string[];
  readonly limitationSummary: string;
}

export function buildAp242ExportReport(pmiKindsPresent: readonly string[]): Ap242ExportReport {
  const exportedFeatures = AP242_CAPABILITY_MATRIX.filter((c) => c.supported).map((c) => c.feature);
  const unsupported = AP242_CAPABILITY_MATRIX.filter((c) => !c.supported).map((c) => c.feature);
  const retained = unsupported.filter(
    (f) =>
      (f.includes('pmi') && pmiKindsPresent.length > 0) ||
      pmiKindsPresent.some((k) => f.toLowerCase().includes(k.toLowerCase())),
  );
  return {
    exportedFeatures,
    unsupportedRetainedInDb: retained.length > 0 ? unsupported : unsupported,
    limitationSummary:
      'AP242 PMI export is partial in v1: unsupported PMI remains in the semantic store with no data loss; see docs/limitations/ap242-pmi.md',
  };
}
