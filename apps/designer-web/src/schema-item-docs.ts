/**
 * Short purpose/usage copy for Schema detail rail (plan S05).
 */

import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from '@spds/ai-interface';

export interface SchemaItemDoc {
  readonly purpose: string;
  readonly howToUse: string;
}

const FALLBACK: SchemaItemDoc = {
  purpose: 'A schema building block in the live catalog. Exact behaviour depends on its semantic type.',
  howToUse: 'Select related parameters or patterns, then Draft a ChangeSet from the detail rail when the item is mutable.',
};

const DOCS: Readonly<Record<string, SchemaItemDoc>> = {
  Parameter: {
    purpose: 'Numeric or discrete design variables that drive patterns and generated geometry.',
    howToUse: 'Draft an update with a value in domain, Preview the ghost, then Accept to commit on the AI branch.',
  },
  'parameter.number': {
    purpose: 'A continuous numeric parameter (usually millimetres for D01 lengths).',
    howToUse: 'Enter a value within the domain and Draft update — does not change meshes until Accept.',
  },
  Pattern: {
    purpose: 'Reusable generative rules that map parameters into structure and parts.',
    howToUse: 'Inspect intent and rules, then Draft apply_pattern when the published id is allowlisted.',
  },
  Entity: {
    purpose: 'Concrete semantic objects in the model graph (components, parts, outputs).',
    howToUse: 'Use Causal lens for neighbourhood; Schema canvas focuses on types and capabilities.',
  },
  'ui.folder': {
    purpose: 'Organisation folders in the explorer hierarchy (part-of parent relationships).',
    howToUse: 'Draft create with kind ui.folder to propose a new folder without moving geometry.',
  },
  'structural.y-component': {
    purpose: 'Y-network structural member generated from geodesic / Goldberg cellular topology.',
    howToUse: 'Change lengthMm (and related params) via Draft update; Accept regenerates display meshes.',
  },
  'structure.geodesic-dome': {
    purpose: 'Root geodesic structure that owns D01 parameters and pattern instances.',
    howToUse: 'Keep focus here for model-level context; mutate through parameters and patterns.',
  },
  [PARAM_D01_LENGTH_ID]: {
    purpose: 'Primary bay / member length in millimetres for the D01 geodesic demo.',
    howToUse: 'Draft update with lengthMm between 500–4000; Preview shows ghost Ys before Accept.',
  },
  [PARAM_D01_ARM_WIDTH_ID]: {
    purpose: 'Arm width of Y components in millimetres.',
    howToUse: 'Draft update with armWidthMm; Accept rebuilds meshes with the new section.',
  },
  [PARAM_D01_STRUCTURAL_DEPTH_ID]: {
    purpose: 'Structural depth of Y members in millimetres.',
    howToUse: 'Draft update with structuralDepthMm; combine with length for multi-param Accept.',
  },
  [GOLDBERG_PATTERN_PUBLISHED_ID]: {
    purpose: 'Published Goldberg cellular topology pattern that composes the D01 Y-network.',
    howToUse: 'Draft apply_pattern targeting this published id to propose composition overrides.',
  },
  geodesic: {
    purpose: 'Geodesic pattern family used when live pattern ids are not yet hydrated.',
    howToUse: 'Prefer the published Goldberg id for apply_pattern Drafts.',
  },
  'y-network.v1': {
    purpose: 'Operator binding that generates Y-network geometry from pattern rules.',
    howToUse: 'Visible at execution depth; not drafted directly — change parameters or apply_pattern.',
  },
};

export function lookupSchemaItemDoc(key: string): SchemaItemDoc {
  const hit = DOCS[key];
  if (hit) return hit;
  const lower = key.toLowerCase();
  for (const [k, doc] of Object.entries(DOCS)) {
    if (k.toLowerCase() === lower) return doc;
  }
  if (key.startsWith('param:')) {
    return {
      purpose: 'A model parameter that can drive downstream pattern and geometry updates.',
      howToUse: FALLBACK.howToUse,
    };
  }
  if (key.startsWith('pattern:')) {
    return {
      purpose: 'A pattern instance or published pattern base in the catalog.',
      howToUse: 'Draft apply_pattern only when the published base is on the allowlist.',
    };
  }
  if (key.startsWith('folder:')) {
    return DOCS['ui.folder'] ?? FALLBACK;
  }
  return FALLBACK;
}

const RELATION_DOCS: Readonly<Record<string, SchemaItemDoc>> = {
  drives: {
    purpose: 'This parameter feeds the pattern’s generative rules (causal spine).',
    howToUse: 'Change the parameter via Draft/Preview; Accept regenerates downstream geometry.',
  },
  binds: {
    purpose: 'Catalog binding between a schema kind and a concrete type or instance.',
    howToUse: 'Select either end to inspect domains and Draft affordances in the Schema rail.',
  },
  produces: {
    purpose: 'The pattern produces these live semantic types in the current model substrate.',
    howToUse: 'Double-click a component set to reveal instances; open Causal for neighbourhood.',
  },
  member: {
    purpose: 'A concrete component instance belonging to the expanded live-type set.',
    howToUse: 'Select to focus; double-click the set node to hide members again.',
  },
  alias: {
    purpose: 'Maps an SDI presentation relation to the storage relation used in the graph.',
    howToUse: 'Read-only catalog annotation — does not Draft geometry by itself.',
  },
};

/** Hover / detail-rail copy for Schema relationship wires. */
export function lookupSchemaRelationDoc(relationTypeOrLabel: string): SchemaItemDoc {
  const key = relationTypeOrLabel.trim().toLowerCase();
  return (
    RELATION_DOCS[key] ?? {
      purpose: 'A typed relationship in the Schema catalog graph.',
      howToUse: 'Hover ends of the wire to inspect connected kinds, parameters, or live types.',
    }
  );
}

/** Compact multi-line hover body for Schema RF nodes (HelpTooltip / title). */
export function formatSchemaNodeHover(input: {
  readonly semanticId: string;
  readonly role: string;
  readonly label: string;
  readonly mutable: boolean;
  readonly summary?: string;
}): { readonly title: string; readonly purpose: string; readonly howToUse: string } {
  const doc = lookupSchemaItemDoc(input.semanticId);
  const flags = [
    input.role,
    input.mutable ? 'mutable' : 'read-only',
    input.summary,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    title: flags ? `${input.label} (${flags})` : input.label,
    purpose: doc.purpose,
    howToUse: doc.howToUse,
  };
}
