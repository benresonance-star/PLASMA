/** G14 Package manifest + capability-based extensibility. */

export interface PackageCapability {
  readonly name: string;
  readonly version: string;
}

export interface PackageManifest {
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly namespace: string;
  readonly capabilities: readonly PackageCapability[];
  readonly operators: readonly string[];
  readonly patterns: readonly string[];
  readonly semanticTypes: readonly string[];
  /** Executable operator packages require admin approval — not AI ChangeSet alone. */
  readonly executableOperators: boolean;
  readonly adminApproved: boolean;
}

export function validatePackageManifest(manifest: PackageManifest): {
  readonly ok: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  if (!manifest.packageId.startsWith('@')) errors.push('packageId must be scoped');
  if (!manifest.namespace.includes('.')) errors.push('namespace must be dotted extension namespace');
  if (manifest.capabilities.length === 0) errors.push('capabilities required');
  if (manifest.executableOperators && !manifest.adminApproved) {
    errors.push('Executable operator packages require administrative approval (§5B.18)');
  }
  return { ok: errors.length === 0, errors };
}

export function canActivatePackage(manifest: PackageManifest): boolean {
  return validatePackageManifest(manifest).ok;
}

/** Capability-based targeting — generic UI uses capabilities, not dome-specific types. */
export function targetsCapability(
  manifest: PackageManifest,
  capability: string,
): boolean {
  return manifest.capabilities.some((c) => c.name === capability);
}
