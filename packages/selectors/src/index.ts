export {
  SELECTOR_KINDS,
  SelectorSchema,
  SemanticQuerySelectorSchema,
  SubElementSelectorSchema,
  CapabilitySelectorSchema,
  parseSelector,
  type Selector,
  type SelectorKind,
  type SelectableObject,
} from './types.js';
export {
  resolveSelector,
  type ResolutionResult,
  type ResolutionStatus,
  type ResolutionOk,
  type ResolutionFailure,
} from './resolve.js';
