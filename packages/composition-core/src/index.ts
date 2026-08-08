export {
  COMPOSITION_LAYER_ORDER,
  CompositionDocumentSchema,
  VariantSetSchema,
  VariantSelectionSchema,
  VariantDimensionSchema,
  ParameterOverrideSchema,
  parseCompositionDocument,
  type CompositionDocument,
  type CompositionLayer,
  type VariantSet,
  type VariantSelection,
  type ParameterOverride,
} from './types.js';
export {
  resolveEffectiveState,
  compareEffectiveStates,
  type EffectiveState,
} from './resolve.js';
