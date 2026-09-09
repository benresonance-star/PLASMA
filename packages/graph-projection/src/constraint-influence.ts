/**
 * Constraint → affected owners + evaluation status tokens (E2).
 */

export type ConstraintEvalStatus = 'safe' | 'approaching' | 'at_limit' | 'violating';

export interface ConstraintOwnerResolution {
  readonly constraintId: string;
  readonly ownerIds: readonly string[];
  readonly statusByOwner: Readonly<Record<string, ConstraintEvalStatus>>;
}

export interface ConstraintTintToken {
  readonly status: ConstraintEvalStatus;
  /** CSS / hex colour token (distinct per status). */
  readonly colour: string;
  /** Non-colour glyph for a11y (§51). */
  readonly glyph: string;
  readonly label: string;
}

const TINT_TOKENS: Readonly<Record<ConstraintEvalStatus, ConstraintTintToken>> = {
  safe: { status: 'safe', colour: '#3d9a5f', glyph: '○', label: 'safe' },
  approaching: { status: 'approaching', colour: '#c9a227', glyph: '◐', label: 'approaching' },
  at_limit: { status: 'at_limit', colour: '#d97706', glyph: '◑', label: 'at limit' },
  violating: { status: 'violating', colour: '#c23b22', glyph: '●', label: 'violating' },
};

export function constraintTintToken(status: ConstraintEvalStatus): ConstraintTintToken {
  return TINT_TOKENS[status];
}

export function allConstraintTintTokens(): readonly ConstraintTintToken[] {
  return [
    TINT_TOKENS.safe,
    TINT_TOKENS.approaching,
    TINT_TOKENS.at_limit,
    TINT_TOKENS.violating,
  ];
}

function statusFromRatio(ratio: number): ConstraintEvalStatus {
  if (!Number.isFinite(ratio)) return 'safe';
  if (ratio > 1) return 'violating';
  if (ratio >= 0.98) return 'at_limit';
  if (ratio >= 0.8) return 'approaching';
  return 'safe';
}

/**
 * Resolve owners affected by a constraint via dependency edges / explicit targets,
 * then assign deterministic eval status (fixture-friendly until live solver exists).
 */
export function resolveConstraintOwners(input: {
  readonly constraintId: string;
  readonly dependencyEdges: readonly {
    readonly from: string;
    readonly to: string;
    readonly relationType?: string;
  }[];
  readonly explicitTargetIds?: readonly string[];
  /** Optional measured ratio per owner (measured/limit); omit for deterministic demo. */
  readonly ratiosByOwner?: Readonly<Record<string, number>>;
}): ConstraintOwnerResolution {
  const owners = new Set<string>();
  for (const id of input.explicitTargetIds ?? []) {
    if (id && id !== input.constraintId) owners.add(id);
  }
  for (const e of input.dependencyEdges) {
    if (e.from === input.constraintId && e.to) owners.add(e.to);
    if (e.to === input.constraintId && e.from) owners.add(e.from);
  }
  const ownerIds = [...owners].sort();
  const statusByOwner: Record<string, ConstraintEvalStatus> = {};
  for (let i = 0; i < ownerIds.length; i += 1) {
    const id = ownerIds[i]!;
    const ratio =
      input.ratiosByOwner?.[id] ??
      // Deterministic demo ladder so all four statuses appear across fixtures.
      [0.4, 0.85, 0.99, 1.15][i % 4]!;
    statusByOwner[id] = statusFromRatio(ratio);
  }
  return {
    constraintId: input.constraintId,
    ownerIds,
    statusByOwner,
  };
}

/** Apply tint tokens to a mesh-id list (pure; Three wiring lives in designer-web). */
export function buildConstraintTintPass(
  resolution: ConstraintOwnerResolution,
): readonly {
  readonly semanticId: string;
  readonly status: ConstraintEvalStatus;
  readonly colour: string;
  readonly glyph: string;
  readonly label: string;
}[] {
  return resolution.ownerIds.map((semanticId) => {
    const status = resolution.statusByOwner[semanticId] ?? 'safe';
    const token = constraintTintToken(status);
    return {
      semanticId,
      status,
      colour: token.colour,
      glyph: token.glyph,
      label: token.label,
    };
  });
}
