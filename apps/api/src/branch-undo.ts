/**
 * Per-branch undo/redo stacks for committed txn groups (plan S25).
 * History is never rewritten — undo applies compensating mutations as new events.
 */

import type { DesignCommand } from '@spds/transaction-core';
import type { VersionStore } from '@spds/version-core';

export interface BranchUndoGroup {
  readonly id: string;
  readonly transactionId: string;
  readonly commands: readonly DesignCommand[];
  readonly beforeHeadHash: string;
  readonly afterHeadHash: string;
}

function asPromise<T>(value: T | Promise<T>): Promise<T> {
  return Promise.resolve(value);
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

export class BranchUndoRegistry {
  private readonly stacks = new Map<
    string,
    { undo: BranchUndoGroup[]; redo: BranchUndoGroup[] }
  >();

  constructor(private readonly store: VersionStore) {}

  private bucket(branchId: string) {
    let b = this.stacks.get(branchId);
    if (!b) {
      b = { undo: [], redo: [] };
      this.stacks.set(branchId, b);
    }
    return b;
  }

  record(branchId: string, group: BranchUndoGroup): void {
    const b = this.bucket(branchId);
    b.undo.push(group);
    b.redo = [];
  }

  canUndo(branchId: string): boolean {
    return this.bucket(branchId).undo.length > 0;
  }

  canRedo(branchId: string): boolean {
    return this.bucket(branchId).redo.length > 0;
  }

  clear(branchId: string): void {
    this.stacks.set(branchId, { undo: [], redo: [] });
  }

  async undo(input: {
    readonly branchId: string;
    readonly actorId: string;
    readonly expectedHeadHash: string;
  }): Promise<{ readonly newHeadHash: string; readonly group: BranchUndoGroup }> {
    const b = this.bucket(input.branchId);
    const group = b.undo[b.undo.length - 1];
    if (!group) {
      throw Object.assign(new Error('Nothing to undo'), { code: 'UNDO_EMPTY' });
    }
    const head = (await asPromise(this.store.getBranchHead(input.branchId))).headHash;
    if (head !== input.expectedHeadHash) {
      throw Object.assign(new Error('HEAD_CONFLICT'), { code: 'HEAD_CONFLICT' });
    }
    let nextHead = head;
    for (const cmd of [...group.commands].reverse()) {
      const compensating = cmd.compensating;
      if (!compensating) {
        throw Object.assign(new Error('Missing compensating command'), {
          code: 'COMPENSATING_REQUIRED',
        });
      }
      const event = await asPromise(
        this.store.applyMutation({
          branchId: input.branchId,
          actor: { type: 'user', id: input.actorId },
          command: `UNDO:${compensating.type}`,
          expectedHeadHash: nextHead,
          targetIds: [...cmd.targetIds],
          mutate: (objects) => {
            applyCompensating(objects, compensating.type, compensating.payload);
            return [...cmd.targetIds];
          },
        }),
      );
      nextHead = event.afterHash;
    }
    b.undo.pop();
    b.redo.push(group);
    return { newHeadHash: nextHead, group };
  }

  async redo(input: {
    readonly branchId: string;
    readonly actorId: string;
    readonly expectedHeadHash: string;
  }): Promise<{ readonly newHeadHash: string; readonly group: BranchUndoGroup }> {
    const b = this.bucket(input.branchId);
    const group = b.redo[b.redo.length - 1];
    if (!group) {
      throw Object.assign(new Error('Nothing to redo'), { code: 'REDO_EMPTY' });
    }
    const head = (await asPromise(this.store.getBranchHead(input.branchId))).headHash;
    if (head !== input.expectedHeadHash) {
      throw Object.assign(new Error('HEAD_CONFLICT'), { code: 'HEAD_CONFLICT' });
    }
    let nextHead = head;
    for (const cmd of group.commands) {
      const event = await asPromise(
        this.store.applyMutation({
          branchId: input.branchId,
          actor: { type: 'user', id: input.actorId },
          command: `REDO:${cmd.type}`,
          expectedHeadHash: nextHead,
          targetIds: [...cmd.targetIds],
          mutate: (objects) => {
            applyForward(objects, cmd);
            return [...cmd.targetIds];
          },
        }),
      );
      nextHead = event.afterHash;
    }
    b.redo.pop();
    b.undo.push(group);
    return { newHeadHash: nextHead, group };
  }
}
