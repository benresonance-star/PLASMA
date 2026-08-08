import { createSpdsError, type SpdsError } from '@spds/failure-taxonomy';
import type { SelectableObject, Selector } from './types.js';

export type ResolutionStatus = 'ok' | 'empty' | 'ambiguous';

export interface ResolutionOk {
  readonly status: 'ok';
  readonly matches: readonly string[];
}

export interface ResolutionFailure {
  readonly status: 'empty' | 'ambiguous';
  readonly matches: readonly string[];
  readonly error: SpdsError;
}

export type ResolutionResult = ResolutionOk | ResolutionFailure;

function matchesAdjacent(
  obj: SelectableObject,
  required: Readonly<Record<string, string>> | undefined,
): boolean {
  if (!required) return true;
  const adj = obj.adjacentTo ?? {};
  for (const [key, value] of Object.entries(required)) {
    if (adj[key] !== value) return false;
  }
  return true;
}

function matchesTags(obj: SelectableObject, tags: readonly string[] | undefined): boolean {
  if (!tags || tags.length === 0) return true;
  const have = new Set(obj.tags ?? []);
  return tags.every((t) => have.has(t));
}

function collectMatches(selector: Selector, universe: readonly SelectableObject[]): string[] {
  switch (selector.semanticType) {
    case 'selection.semantic-query':
      return universe
        .filter(
          (o) =>
            o.semanticType === selector.where.semanticType &&
            matchesAdjacent(o, selector.where.adjacentTo) &&
            matchesTags(o, selector.where.tags),
        )
        .map((o) => o.id);
    case 'selection.sub-element': {
      const owner = universe.find((o) => o.id === selector.owner);
      if (!owner?.subElements) return [];
      const key = selector.path.join('/');
      const target = owner.subElements[key];
      return target ? [target] : [];
    }
    case 'selection.capability':
      return universe
        .filter((o) => (o.capabilities ?? []).includes(selector.capability))
        .map((o) => o.id);
    default: {
      const _exhaustive: never = selector;
      return _exhaustive;
    }
  }
}

export function resolveSelector(
  selector: Selector,
  universe: readonly SelectableObject[],
): ResolutionResult {
  const matches = collectMatches(selector, universe);
  if (matches.length === 0) {
    return {
      status: 'empty',
      matches,
      error: createSpdsError({
        code: 'SELECTOR_UNRESOLVED',
        summary: `Selector ${selector.id} matched no targets`,
        affectedSemanticIds: [selector.id],
        recoverable: true,
        suggestedNextActions: ['Broaden query', 'Check semantic types'],
      }),
    };
  }
  if (matches.length > 1 && selector.semanticType !== 'selection.capability') {
    return {
      status: 'ambiguous',
      matches,
      error: createSpdsError({
        code: 'SELECTOR_AMBIGUOUS',
        summary: `Selector ${selector.id} matched ${matches.length} targets`,
        affectedSemanticIds: [selector.id, ...matches],
        recoverable: true,
        suggestedNextActions: ['Add adjacentTo/tags constraints', 'Use unique owner path'],
        details: { matches },
      }),
    };
  }
  return { status: 'ok', matches };
}
