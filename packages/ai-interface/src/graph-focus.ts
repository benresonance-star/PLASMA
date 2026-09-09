/**
 * AI → SDI read-only graph focus commands (SD7).
 * Applying these must never mutate ChangeSets.
 */

export type GraphFocusCommand =
  | { readonly type: 'focusGraph'; readonly semanticIds: readonly string[] }
  | { readonly type: 'explainSelection'; readonly targetId: string }
  | { readonly type: 'showUpstream'; readonly targetId: string; readonly radius: number }
  | { readonly type: 'showDownstream'; readonly targetId: string; readonly radius: number }
  | { readonly type: 'trace'; readonly targetId: string }
  | { readonly type: 'enterPattern'; readonly patternId: string }
  | { readonly type: 'showConstraints'; readonly targetId: string }
  | { readonly type: 'showExecution'; readonly targetId: string };

export function isReadOnlyFocusCommand(_cmd: GraphFocusCommand): true {
  void _cmd;
  return true;
}

export function parseGraphFocusCommand(input: unknown): GraphFocusCommand {
  if (!input || typeof input !== 'object') throw new Error('Invalid GraphFocusCommand');
  const o = input as Record<string, unknown>;
  const type = o.type;
  switch (type) {
    case 'focusGraph': {
      const ids = o.semanticIds;
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
        throw new Error('focusGraph requires semanticIds: string[]');
      }
      return { type, semanticIds: ids };
    }
    case 'explainSelection':
    case 'trace':
    case 'showConstraints':
    case 'showExecution': {
      if (typeof o.targetId !== 'string') throw new Error(`${type} requires targetId`);
      return { type, targetId: o.targetId };
    }
    case 'showUpstream':
    case 'showDownstream': {
      if (typeof o.targetId !== 'string') throw new Error(`${type} requires targetId`);
      const radius = typeof o.radius === 'number' ? o.radius : 1;
      return { type, targetId: o.targetId, radius };
    }
    case 'enterPattern': {
      if (typeof o.patternId !== 'string') throw new Error('enterPattern requires patternId');
      return { type, patternId: o.patternId };
    }
    default:
      throw new Error(`Unknown GraphFocusCommand type: ${String(type)}`);
  }
}
