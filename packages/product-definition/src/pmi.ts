/** G10A.2 PMI-ready semantic objects attached to persistent selectors. */

export type PmiKind =
  | 'Datum'
  | 'Tolerance'
  | 'ManufacturingFeature'
  | 'InspectionRequirement'
  | 'PMIAnnotation';

export interface PmiObject {
  readonly id: string;
  readonly kind: PmiKind;
  readonly selector: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface PmiStore {
  readonly objects: readonly PmiObject[];
}

export function attachPmi(
  store: PmiStore,
  object: PmiObject,
  options: { readonly selectorAmbiguous: boolean; readonly selectorResolved: boolean },
): PmiStore {
  if (options.selectorAmbiguous) {
    throw new Error('SELECTOR_AMBIGUOUS: cannot attach PMI');
  }
  if (!options.selectorResolved) {
    throw new Error('SELECTOR_UNRESOLVED: cannot attach PMI');
  }
  return { objects: [...store.objects, object] };
}

/** PMI must survive without UI — pure data store. */
export function serializePmi(store: PmiStore): string {
  return JSON.stringify(store.objects);
}

export function deserializePmi(json: string): PmiStore {
  const objects = JSON.parse(json) as PmiObject[];
  return { objects };
}
