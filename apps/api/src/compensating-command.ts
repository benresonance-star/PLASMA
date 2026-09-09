/**
 * Attach compensating inverses for DesignCommands (plan S24).
 */

import type { DesignCommand } from '@spds/transaction-core';

export function withCompensating(
  cmd: DesignCommand,
  prior: {
    readonly lengthMm?: number;
    readonly armWidthMm?: number;
    readonly structuralDepthMm?: number;
    readonly priorObject?: Record<string, unknown>;
  },
): DesignCommand {
  if (cmd.compensating) return cmd;

  if (cmd.type === 'SET_PARAMETER') {
    const path = String(cmd.payload['path'] ?? cmd.payload['semanticCommand'] ?? '');
    const id = String(cmd.payload['id'] ?? cmd.targetIds[0] ?? '');
    let priorValue: unknown;
    if (path.includes('length') || id.includes('length')) priorValue = prior.lengthMm;
    else if (path.includes('armWidth') || id.includes('armWidth')) priorValue = prior.armWidthMm;
    else if (path.includes('structuralDepth') || id.includes('structuralDepth')) {
      priorValue = prior.structuralDepthMm;
    } else if (prior.priorObject && 'value' in prior.priorObject) {
      priorValue = prior.priorObject['value'];
    }
    if (priorValue === undefined || !id) {
      return cmd; // fail-open for non-geometry; undo stack record will skip cmds without compensating
    }
    return {
      ...cmd,
      compensating: {
        type: 'RESTORE_OBJECT',
        payload: {
          id,
          object: prior.priorObject ?? { id, value: priorValue, path },
        },
      },
    };
  }

  if (cmd.type === 'CREATE_OBJECT') {
    const id = String(cmd.payload['id'] ?? cmd.targetIds[0] ?? '');
    if (!id) return cmd;
    return {
      ...cmd,
      compensating: {
        type: 'DELETE_OBJECT',
        payload: { id },
      },
    };
  }

  if (cmd.type === 'APPLY_PATTERN' || cmd.type === 'AI_CHANGESET') {
    // Snapshot-based compensate: clear applied patch ids when prior objects unknown.
    const patch = (cmd.payload['objects'] as Record<string, unknown> | undefined) ?? {};
    const ids = Object.keys(patch);
    if (ids.length === 0) return cmd;
    return {
      ...cmd,
      compensating: {
        type: 'CLEAR_OBJECTS',
        payload: { ids },
      },
    };
  }

  return cmd;
}

export function commandsHaveCompensating(commands: readonly DesignCommand[]): boolean {
  return commands.length > 0 && commands.every((c) => Boolean(c.compensating));
}
