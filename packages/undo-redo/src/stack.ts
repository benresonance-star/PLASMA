import type { DesignCommand } from '@spds/transaction-core';
import type { InMemoryVersionStore } from '@spds/version-core';

export interface UndoGroup {
  readonly id: string;
  readonly transactionId: string;
  readonly commands: readonly DesignCommand[];
  readonly beforeHeadHash: string;
  readonly afterHeadHash: string;
}

/**
 * Interaction-level undo/redo via compensating commands.
 * Undo of a published transaction creates a new head (history is not rewritten).
 */
export class UndoRedoStack {
  private undoStack: UndoGroup[] = [];
  private redoStack: UndoGroup[] = [];

  constructor(private readonly store: InMemoryVersionStore) {}

  record(group: UndoGroup): void {
    this.undoStack.push(group);
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(branchId: string, actorId: string): string {
    const group = this.undoStack.pop();
    if (!group) throw new Error('Nothing to undo');
    let head = this.store.getBranchHead(branchId).headHash;
    for (const cmd of [...group.commands].reverse()) {
      const compensating = cmd.compensating;
      if (!compensating) continue;
      const event = this.store.applyMutation({
        branchId,
        actor: { type: 'user', id: actorId },
        command: `UNDO:${compensating.type}`,
        expectedHeadHash: head,
        targetIds: cmd.targetIds,
        mutate: (objects) => {
          applyCompensating(objects, compensating.type, compensating.payload);
          return cmd.targetIds;
        },
      });
      head = event.afterHash;
    }
    this.redoStack.push(group);
    return head;
  }

  redo(branchId: string, actorId: string): string {
    const group = this.redoStack.pop();
    if (!group) throw new Error('Nothing to redo');
    let head = this.store.getBranchHead(branchId).headHash;
    for (const cmd of group.commands) {
      const event = this.store.applyMutation({
        branchId,
        actor: { type: 'user', id: actorId },
        command: `REDO:${cmd.type}`,
        expectedHeadHash: head,
        targetIds: cmd.targetIds,
        mutate: (objects) => {
          applyForward(objects, cmd);
          return cmd.targetIds;
        },
      });
      head = event.afterHash;
    }
    this.undoStack.push(group);
    return head;
  }
}

function applyForward(
  objects: Map<string, Record<string, unknown>>,
  cmd: DesignCommand,
): void {
  if (cmd.type === 'SET_PARAMETER' || cmd.type === 'CREATE_OBJECT') {
    const id = String(cmd.payload['id'] ?? cmd.targetIds[0]);
    const object = (cmd.payload['object'] as Record<string, unknown> | undefined) ?? {
      id,
      value: cmd.payload['value'],
    };
    objects.set(id, { ...object, id });
  } else if (cmd.type === 'DELETE_OBJECT') {
    const id = String(cmd.payload['id'] ?? cmd.targetIds[0]);
    objects.delete(id);
  } else if (cmd.type === 'AI_CHANGESET' || cmd.type === 'APPLY_PATTERN') {
    const patch = (cmd.payload['objects'] as Record<string, unknown> | undefined) ?? {};
    for (const [id, obj] of Object.entries(patch)) {
      objects.set(id, obj as Record<string, unknown>);
    }
  }
}

function applyCompensating(
  objects: Map<string, Record<string, unknown>>,
  type: string,
  payload: Record<string, unknown>,
): void {
  if (type === 'RESTORE_OBJECT') {
    const id = String(payload['id']);
    objects.set(id, payload['object'] as Record<string, unknown>);
  } else if (type === 'DELETE_OBJECT') {
    objects.delete(String(payload['id']));
  } else if (type === 'CLEAR_OBJECTS') {
    const ids = (payload['ids'] as string[]) ?? [];
    for (const id of ids) objects.delete(id);
  }
}
