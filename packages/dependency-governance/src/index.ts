export interface DependencyRecord {
  readonly name: string;
  readonly version: string;
  readonly purpose: string;
  readonly license: string;
  readonly linkingModel: string;
  readonly distributionImpact: string;
  readonly serverOnly: boolean;
  readonly optional: boolean;
  readonly replaceableAdapter: boolean;
  readonly securityUpdatePolicy: string;
  readonly source: string;
}

/** Runtime-loaded register is docs-backed in G0A; scanner expands later. */
export const REGISTER_DOC_PATH = 'docs/governance/dependency-licence-register.md' as const;

export function assertLicenseKnown(license: string): void {
  const normalized = license.trim().toLowerCase();
  if (!normalized || normalized === 'unknown' || normalized === 'prohibited') {
    throw new Error(`Unresolved or prohibited licence classification: ${license}`);
  }
}
