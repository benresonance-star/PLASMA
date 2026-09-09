import type { GraphFocusCommand } from '@spds/ai-interface';
import type { SemanticDepth } from '@spds/graph-projection';

export type GraphFocusApplication = {
  readonly selectedSemanticId: string | null;
  readonly highlightedIds: readonly string[];
  readonly depth: SemanticDepth;
  readonly enterPatternId: string | null;
  readonly openLens: boolean;
};

/** Map SD7 focus commands onto designer session intents (read-only). */
export function applyGraphFocusCommand(cmd: GraphFocusCommand): GraphFocusApplication {
  switch (cmd.type) {
    case 'focusGraph':
      return {
        selectedSemanticId: cmd.semanticIds[0] ?? null,
        highlightedIds: cmd.semanticIds,
        depth: 'system',
        enterPatternId: null,
        openLens: true,
      };
    case 'explainSelection':
    case 'trace':
    case 'showConstraints':
      return {
        selectedSemanticId: cmd.targetId,
        highlightedIds: [cmd.targetId],
        depth: 'system',
        enterPatternId: null,
        openLens: true,
      };
    case 'showUpstream':
    case 'showDownstream':
      return {
        selectedSemanticId: cmd.targetId,
        highlightedIds: [cmd.targetId],
        depth: 'system',
        enterPatternId: null,
        openLens: true,
      };
    case 'enterPattern':
      return {
        selectedSemanticId: cmd.patternId,
        highlightedIds: [cmd.patternId],
        depth: 'system',
        enterPatternId: cmd.patternId,
        openLens: true,
      };
    case 'showExecution':
      return {
        selectedSemanticId: cmd.targetId,
        highlightedIds: [cmd.targetId],
        depth: 'execution',
        enterPatternId: null,
        openLens: true,
      };
    default: {
      const _exhaustive: never = cmd;
      return _exhaustive;
    }
  }
}
