/**
 * SDI §7 presentation vocabulary ↔ core / namespaced storage relationType.
 * Storage remains kebab-case (or namespaced); UI may show SDI tokens / labels.
 */

import { CORE_RELATIONSHIP_TYPES, type CoreRelationshipType } from './relationships.js';

/** Spec §7 presentation types (uppercase). */
export const SDI_RELATIONSHIP_TYPES = [
  'GENERATES',
  'DERIVES_FROM',
  'DEPENDS_ON',
  'DRIVES',
  'CONSTRAINS',
  'LIMITS',
  'AFFECTS',
  'MODIFIES',
  'APPLIES_TO',
  'CONTAINS',
  'COMPOSES',
  'SPECIALISES',
  'INHERITS',
  'OVERRIDES',
  'REFERENCES',
  'MEASURES',
  'VALIDATES',
  'INVALIDATES',
  'FABRICATES_AS',
  'REPRESENTS',
  'EXECUTES_AS',
  'INPUT_TO',
  'OUTPUT_OF',
] as const;

export type SdiRelationshipType = (typeof SDI_RELATIONSHIP_TYPES)[number];

/** Preferred storage form for each SDI presentation type. */
export const SDI_TO_STORAGE: Readonly<Record<SdiRelationshipType, string>> = {
  GENERATES: 'produces',
  DERIVES_FROM: 'generated-from',
  DEPENDS_ON: 'depends-on',
  DRIVES: 'pattern.drives',
  CONSTRAINS: 'governed-by',
  LIMITS: 'constraint.limits',
  AFFECTS: 'affected-by',
  MODIFIES: 'pattern.modifies',
  APPLIES_TO: 'pattern.applies-to',
  CONTAINS: 'part-of',
  COMPOSES: 'pattern.composes',
  SPECIALISES: 'pattern.specialises',
  INHERITS: 'pattern.inherits',
  OVERRIDES: 'pattern.overrides',
  REFERENCES: 'pattern.references',
  MEASURES: 'measure.measures',
  VALIDATES: 'validation.validates',
  INVALIDATES: 'validation.invalidates',
  FABRICATES_AS: 'manufactured-as',
  REPRESENTS: 'represented-by',
  EXECUTES_AS: 'execution.executes-as',
  INPUT_TO: 'execution.input-to',
  OUTPUT_OF: 'execution.output-of',
};

const STORAGE_TO_SDI: ReadonlyMap<string, SdiRelationshipType> = (() => {
  const map = new Map<string, SdiRelationshipType>();
  for (const sdi of SDI_RELATIONSHIP_TYPES) {
    map.set(SDI_TO_STORAGE[sdi], sdi);
  }
  // Additional core aliases that share a presentation family.
  map.set('requires', 'DEPENDS_ON');
  map.set('connects-to', 'REFERENCES');
  map.set('bounds', 'LIMITS');
  map.set('adjacent-to', 'REFERENCES');
  map.set('analysed-as', 'REPRESENTS');
  return map;
})();

const SDI_SET = new Set<string>(SDI_RELATIONSHIP_TYPES);

export function isSdiRelationshipType(value: string): value is SdiRelationshipType {
  return SDI_SET.has(value);
}

/** Map SDI token or storage string → canonical storage relationType. */
export function toStorageRelationType(sdiOrStorage: string): string {
  if (isSdiRelationshipType(sdiOrStorage)) return SDI_TO_STORAGE[sdiOrStorage];
  const upper = sdiOrStorage.toUpperCase();
  if (isSdiRelationshipType(upper)) return SDI_TO_STORAGE[upper];
  return sdiOrStorage;
}

/** Map storage relationType → SDI presentation token when known. */
export function toPresentationRelationType(storage: string): SdiRelationshipType | string {
  return STORAGE_TO_SDI.get(storage) ?? storage;
}

/** Human edge label (lowercase words) for graph chrome. */
export function presentationRelationLabel(storageOrSdi: string): string {
  const sdi = isSdiRelationshipType(storageOrSdi)
    ? storageOrSdi
    : toPresentationRelationType(toStorageRelationType(storageOrSdi));
  if (typeof sdi === 'string' && isSdiRelationshipType(sdi)) {
    return sdi.toLowerCase().replace(/_/g, ' ');
  }
  // Fallback: last segment of namespaced / kebab storage.
  const raw = String(sdi);
  const leaf = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  return leaf.replace(/-/g, ' ');
}

/** Round-trip helper for tests: every §7 type has a storage form. */
export function allSdiStoragePairs(): ReadonlyArray<{
  readonly sdi: SdiRelationshipType;
  readonly storage: string;
}> {
  return SDI_RELATIONSHIP_TYPES.map((sdi) => ({ sdi, storage: SDI_TO_STORAGE[sdi] }));
}

export function isCoreOrNamespacedRelation(storage: string): boolean {
  if ((CORE_RELATIONSHIP_TYPES as readonly string[]).includes(storage)) return true;
  return /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(storage);
}

export type { CoreRelationshipType };
