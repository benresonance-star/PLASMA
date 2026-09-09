/** G9.2 Pattern inspector — re-exports SD3 projection view-model. */
export {
  buildPatternInspector,
  type PatternInspectorView,
  type PatternNodeView,
} from '@spds/graph-projection';

import { buildPatternInspector, type PatternInspectorView } from '@spds/graph-projection';

/** Edits are draft-only until committed via command layer. */
export function updateDraftParameter(
  view: PatternInspectorView,
  key: string,
  value: unknown,
): PatternInspectorView {
  if (!view.draftOnly) {
    throw new Error('Pattern inspector edits require draft mode');
  }
  return buildPatternInspector({
    patternId: view.patternId,
    name: view.name,
    draftOnly: true,
    parameters: { ...view.parameters, [key]: value },
    subpatternIds: view.nodes.filter((n) => n.kind === 'subpattern').map((n) => n.id),
    operatorBindings: view.operatorBindings,
  });
}
