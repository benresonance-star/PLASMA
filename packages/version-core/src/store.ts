import type {
  Actor,
  Branch,
  ChangeEvent,
  ModelRecord,
  SemanticDiff,
  Snapshot,
} from './types.js';

/** Shared surface used by API TransactionEngine and memory/Postgres stores. */
export interface VersionStore {
  createModel(name: string): Promise<ModelRecord> | ModelRecord;
  getMainBranchId(modelId: string): string;
  listObjects(branchId: string): Promise<Record<string, unknown>[]> | Record<string, unknown>[];
  getObject(
    branchId: string,
    semanticId: string,
  ): Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  applyMutation(input: {
    branchId: string;
    actor: Actor;
    command: string;
    expectedHeadHash: string;
    targetIds: string[];
    reason?: string;
    correlationId?: string;
    mutate: (objects: Map<string, Record<string, unknown>>) => string[];
  }): Promise<ChangeEvent> | ChangeEvent;
  upsertObject(
    branchId: string,
    actor: Actor,
    expectedHeadHash: string,
    object: Record<string, unknown> & { id: string },
  ): Promise<ChangeEvent> | ChangeEvent;
  deleteObject(
    branchId: string,
    actor: Actor,
    expectedHeadHash: string,
    semanticId: string,
  ): Promise<ChangeEvent> | ChangeEvent;
  snapshot(branchId: string, name?: string): Promise<Snapshot> | Snapshot;
  createBranch(
    modelId: string,
    name: string,
    fromBranchId: string,
  ): Promise<Branch> | Branch;
  restoreToNewHead(
    branchId: string,
    snapshotId: string,
    actor: Actor,
  ): Promise<ChangeEvent> | ChangeEvent;
  replay(branchId: string): Promise<{ stateHash: string; eventCount: number }> | {
    stateHash: string;
    eventCount: number;
  };
  compareSnapshots(
    aId: string,
    bId: string,
    branchId: string,
  ): Promise<SemanticDiff> | SemanticDiff;
  getBranchHead(branchId: string): Promise<Branch> | Branch;
  listEvents(branchId: string): Promise<ChangeEvent[]> | ChangeEvent[];
}

export async function asPromise<T>(value: T | Promise<T>): Promise<T> {
  return await value;
}
