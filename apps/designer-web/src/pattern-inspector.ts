/** G9.2 Pattern inspector view-model. */

export interface PatternNodeView {
  readonly id: string;
  readonly kind: 'pattern' | 'subpattern' | 'operator' | 'parameter';
  readonly label: string;
  readonly children: readonly string[];
}

export interface PatternInspectorView {
  readonly patternId: string;
  readonly name: string;
  readonly draftOnly: boolean;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly nodes: readonly PatternNodeView[];
  readonly operatorBindings: Readonly<Record<string, string>>;
}

export function buildPatternInspector(input: {
  readonly patternId: string;
  readonly name: string;
  readonly draftOnly?: boolean;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly subpatternIds?: readonly string[];
  readonly operatorBindings?: Readonly<Record<string, string>>;
}): PatternInspectorView {
  const subpatternIds = input.subpatternIds ?? [];
  const operatorBindings = input.operatorBindings ?? {};
  const parameters = input.parameters ?? {};
  const nodes: PatternNodeView[] = [
    {
      id: input.patternId,
      kind: 'pattern',
      label: input.name,
      children: [
        ...Object.keys(parameters).map((k) => `${input.patternId}/param/${k}`),
        ...subpatternIds,
        ...Object.keys(operatorBindings),
      ],
    },
    ...Object.entries(parameters).map(([k, v]) => ({
      id: `${input.patternId}/param/${k}`,
      kind: 'parameter' as const,
      label: `${k}=${String(v)}`,
      children: [] as string[],
    })),
    ...subpatternIds.map((id) => ({
      id,
      kind: 'subpattern' as const,
      label: id,
      children: [] as string[],
    })),
    ...Object.entries(operatorBindings).map(([nodeId, op]) => ({
      id: nodeId,
      kind: 'operator' as const,
      label: `${nodeId} → ${op}`,
      children: [] as string[],
    })),
  ];
  return {
    patternId: input.patternId,
    name: input.name,
    draftOnly: input.draftOnly ?? true,
    parameters,
    nodes,
    operatorBindings,
  };
}

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
