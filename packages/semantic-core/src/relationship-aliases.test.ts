import { describe, expect, it } from 'vitest';
import {
  SDI_RELATIONSHIP_TYPES,
  allSdiStoragePairs,
  isCoreOrNamespacedRelation,
  presentationRelationLabel,
  toPresentationRelationType,
  toStorageRelationType,
} from './relationship-aliases.js';

describe('SDI relationship aliases', () => {
  it('round-trips every §7 presentation type through storage', () => {
    for (const { sdi, storage } of allSdiStoragePairs()) {
      expect(toStorageRelationType(sdi)).toBe(storage);
      expect(isCoreOrNamespacedRelation(storage)).toBe(true);
      expect(toPresentationRelationType(storage)).toBe(sdi);
    }
    expect(SDI_RELATIONSHIP_TYPES.length).toBe(23);
  });

  it('passes through unknown namespaced custom types', () => {
    const custom = 'dome.custom-link';
    expect(toStorageRelationType(custom)).toBe(custom);
    expect(toPresentationRelationType(custom)).toBe(custom);
    expect(presentationRelationLabel(custom)).toBe('custom link');
  });

  it('exposes readable labels for graph edges', () => {
    expect(presentationRelationLabel('DEPENDS_ON')).toBe('depends on');
    expect(presentationRelationLabel('depends-on')).toBe('depends on');
    expect(presentationRelationLabel('pattern.drives')).toBe('drives');
  });
});
