const SEMANTIC_ID_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9._-]*)+$/;

export type SemanticId = string & { readonly __brand: 'SemanticId' };

export function isSemanticId(value: string): value is SemanticId {
  return SEMANTIC_ID_PATTERN.test(value);
}

export function parseSemanticId(value: string): SemanticId {
  if (!isSemanticId(value)) {
    throw new Error(`Invalid semantic ID: ${value}`);
  }
  return value;
}

export function formatSemanticId(parts: readonly string[]): SemanticId {
  if (parts.length < 2 || parts.some((p) => !p)) {
    throw new Error('Semantic ID requires at least kind and local parts');
  }
  return parseSemanticId(parts.join(':'));
}
