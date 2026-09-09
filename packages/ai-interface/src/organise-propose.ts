/**
 * Pure (no LLM) organise ChangeSet builders for propose → accept path.
 * Propose never mutates model state — callers must accept via API.
 */

import type { ChangeSet, ChangeSetCommand } from './tools.js';
import { validateChangeSet } from './tools.js';

export interface OrganiseProposeMove {
  readonly op: 'create_group' | 'connect';
  readonly targetId?: string;
  readonly label?: string;
  readonly parentId: string;
}

/** Build create_group / connect commands for a multi-move organise proposal. */
export function buildOrganiseProposeCommands(
  moves: readonly OrganiseProposeMove[],
): readonly ChangeSetCommand[] {
  return moves.map((move) => {
    switch (move.op) {
      case 'create_group':
        return {
          op: 'create_group' as const,
          ...(move.targetId !== undefined ? { targetId: move.targetId } : {}),
          payload: {
            parentId: move.parentId,
            ...(move.label !== undefined ? { label: move.label } : {}),
            ...(move.targetId !== undefined ? { groupId: move.targetId } : {}),
          },
        };
      case 'connect':
        return {
          op: 'connect' as const,
          targetId: move.targetId ?? '',
          payload: {
            parentId: move.parentId,
            relationType: 'part-of' as const,
          },
        };
      default: {
        const _exhaustive: never = move.op;
        throw new Error(`Unknown organise move ${_exhaustive}`);
      }
    }
  });
}

/** Fixture: 10 alternating create_group / connect moves (C2c). */
export function buildTenMoveOrganiseFixture(modelId: string): readonly OrganiseProposeMove[] {
  return Array.from({ length: 10 }, (_, i) =>
    i % 2 === 0
      ? {
          op: 'create_group' as const,
          targetId: `folder:bench:${i}`,
          label: `Folder ${i}`,
          parentId: modelId,
        }
      : {
          op: 'connect' as const,
          targetId: `component:y:${String(i).padStart(4, '0')}`,
          parentId: `folder:bench:${i - 1}`,
        },
  );
}

export function proposeOrganiseChangeSet(input: {
  readonly changeSetId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly transactionId: string;
  readonly moves: readonly OrganiseProposeMove[];
}): { readonly ok: true; readonly changeSet: ChangeSet } | { readonly ok: false; readonly reason: string } {
  const commands = buildOrganiseProposeCommands(input.moves);
  const changeSet: ChangeSet = {
    changeSetId: input.changeSetId,
    branchId: input.branchId,
    expectedHeadHash: input.expectedHeadHash,
    transactionId: input.transactionId,
    commands,
    actor: 'ai',
    disposition: 'proposed',
  };
  const v = validateChangeSet(changeSet);
  if (!v.ok) return { ok: false, reason: v.reason ?? 'invalid organise ChangeSet' };
  return { ok: true, changeSet };
}
