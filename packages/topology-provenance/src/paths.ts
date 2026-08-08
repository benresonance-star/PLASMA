import { createSpdsError } from '@spds/failure-taxonomy';
import { resolveSelector, type SelectableObject, parseSelector } from '@spds/selectors';

const PATH_SEGMENT = /^[A-Za-z0-9_.:-]+$/;

export function parseSemanticPath(path: string): { owner: string; segments: string[] } {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Semantic path must be owner/seg/... got: ${path}`);
  }
  const owner = parts[0]!;
  const segments = parts.slice(1);
  if (!owner.includes(':')) {
    throw new Error(`Owner must be a semantic id, got: ${owner}`);
  }
  for (const seg of segments) {
    if (!PATH_SEGMENT.test(seg)) {
      throw new Error(`Invalid path segment: ${seg}`);
    }
  }
  return { owner, segments };
}

export type PersistentRefState =
  | { readonly status: 'resolved'; readonly targetId: string; readonly path: string }
  | { readonly status: 'unresolved'; readonly path: string; readonly reason: string }
  | { readonly status: 'ambiguous'; readonly path: string; readonly matches: readonly string[] };

/** Resolve a persistent sub-element path against a regenerated universe. */
export function resolvePersistentPath(
  path: string,
  universe: readonly SelectableObject[],
): PersistentRefState {
  const { owner, segments } = parseSemanticPath(path);
  const selector = parseSelector({
    id: `selector:path:${path}`,
    kind: 'Selector',
    semanticType: 'selection.sub-element',
    owner,
    path: segments,
  });
  const result = resolveSelector(selector, universe);
  if (result.status === 'ok') {
    return { status: 'resolved', targetId: result.matches[0]!, path };
  }
  if (result.status === 'ambiguous') {
    return { status: 'ambiguous', path, matches: result.matches };
  }
  return {
    status: 'unresolved',
    path,
    reason: result.error.summary,
  };
}

/**
 * Controlled regeneration survival: approved edits keep identity when remap present;
 * ambiguous remaps fail visibly.
 */
export function surviveRegeneration(input: {
  readonly path: string;
  readonly before: readonly SelectableObject[];
  readonly after: readonly SelectableObject[];
  readonly remap?: Readonly<Record<string, string>>;
}): PersistentRefState {
  const before = resolvePersistentPath(input.path, input.before);
  if (before.status !== 'resolved') return before;

  const remappedTarget = input.remap?.[before.targetId] ?? before.targetId;
  const afterUniverse = input.after.map((obj) => {
    if (!obj.subElements) return obj;
    const nextSubs: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.subElements)) {
      nextSubs[k] = input.remap?.[v] ?? v;
    }
    return { ...obj, subElements: nextSubs };
  });

  const after = resolvePersistentPath(input.path, afterUniverse);
  if (after.status === 'resolved' && after.targetId === remappedTarget) {
    return after;
  }
  if (after.status === 'ambiguous') {
    throw createSpdsError({
      code: 'SELECTOR_AMBIGUOUS',
      summary: `Selector survival ambiguous for ${input.path}`,
      affectedSemanticIds: [input.path, ...after.matches],
      recoverable: true,
      details: { matches: after.matches },
    });
  }
  return {
    status: 'unresolved',
    path: input.path,
    reason: `Identity did not survive regeneration for ${input.path}`,
  };
}
