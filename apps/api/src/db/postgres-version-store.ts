/**
 * Postgres-backed VersionStore — TEXT ids + JSONB branch payload mirroring memory semantics.
 */
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { hashState, type VersionStore } from '@spds/version-core';
import type {
  Actor,
  Branch,
  ChangeEvent,
  ModelRecord,
  SemanticDiff,
  Snapshot,
} from '@spds/version-core';

type BranchRow = {
  branch_id: string;
  model_id: string;
  name: string;
  head_hash: string;
  head_event_id: string | null;
  created_at: Date | string;
  objects: Record<string, Record<string, unknown>>;
  events: ChangeEvent[];
  snapshots: Snapshot[];
};

export class PostgresVersionStore implements VersionStore {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 4 });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  getMainBranchId(modelId: string): string {
    return `branch:${modelId}:main`;
  }

  async createModel(name: string): Promise<ModelRecord> {
    const modelId = `model:${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const model: ModelRecord = { modelId, name, createdAt };
    const branchId = this.getMainBranchId(modelId);
    const emptyHash = hashState({});
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO vs_models (model_id, name, created_at)
        VALUES (${modelId}, ${name}, ${createdAt})
      `;
      await tx`
        INSERT INTO vs_branches (
          branch_id, model_id, name, head_hash, head_event_id, created_at, objects, events, snapshots
        ) VALUES (
          ${branchId}, ${modelId}, ${'main'}, ${emptyHash}, ${null}, ${createdAt},
          ${JSON.stringify({})}::jsonb, ${JSON.stringify([])}::jsonb, ${JSON.stringify([])}::jsonb
        )
      `;
    });
    return model;
  }

  private async loadBranch(branchId: string): Promise<BranchRow> {
    const rows = await this.sql<BranchRow[]>`
      SELECT branch_id, model_id, name, head_hash, head_event_id, created_at, objects, events, snapshots
      FROM vs_branches WHERE branch_id = ${branchId}
    `;
    const row = rows[0];
    if (!row) throw new Error(`Unknown branch: ${branchId}`);
    return {
      ...row,
      objects: (row.objects ?? {}) as Record<string, Record<string, unknown>>,
      events: (row.events ?? []) as ChangeEvent[],
      snapshots: (row.snapshots ?? []) as Snapshot[],
    };
  }

  private async saveBranch(
    row: BranchRow,
    objects: Map<string, Record<string, unknown>>,
    events: ChangeEvent[],
    snapshots: Snapshot[],
    branch: Branch,
  ): Promise<void> {
    await this.sql`
      UPDATE vs_branches SET
        head_hash = ${branch.headHash},
        head_event_id = ${branch.headEventId},
        objects = ${JSON.stringify(Object.fromEntries(objects))}::jsonb,
        events = ${JSON.stringify(events)}::jsonb,
        snapshots = ${JSON.stringify(snapshots)}::jsonb
      WHERE branch_id = ${row.branch_id}
    `;
  }

  async listObjects(branchId: string): Promise<Record<string, unknown>[]> {
    const row = await this.loadBranch(branchId);
    return Object.values(row.objects);
  }

  async getObject(
    branchId: string,
    semanticId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const row = await this.loadBranch(branchId);
    return row.objects[semanticId];
  }

  async getBranchHead(branchId: string): Promise<Branch> {
    const row = await this.loadBranch(branchId);
    return {
      branchId: row.branch_id,
      modelId: row.model_id,
      name: row.name,
      headHash: row.head_hash,
      headEventId: row.head_event_id,
      createdAt:
        typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    };
  }

  async listEvents(branchId: string): Promise<ChangeEvent[]> {
    const row = await this.loadBranch(branchId);
    return [...row.events];
  }

  async applyMutation(input: {
    branchId: string;
    actor: Actor;
    command: string;
    expectedHeadHash: string;
    targetIds: string[];
    reason?: string;
    correlationId?: string;
    mutate: (objects: Map<string, Record<string, unknown>>) => string[];
  }): Promise<ChangeEvent> {
    const row = await this.loadBranch(input.branchId);
    if (row.head_hash !== input.expectedHeadHash) {
      throw new Error(`HEAD_CONFLICT: expected ${input.expectedHeadHash}, got ${row.head_hash}`);
    }
    const objects = new Map(Object.entries(row.objects));
    const beforeHash = row.head_hash;
    const invalidationSet = input.mutate(objects);
    const afterHash = hashState(Object.fromEntries(objects));
    const event: ChangeEvent = {
      eventId: `event:${randomUUID()}`,
      modelId: row.model_id,
      branchId: input.branchId,
      actor: input.actor,
      command: input.command,
      targetIds: input.targetIds,
      beforeHash,
      afterHash,
      timestamp: new Date().toISOString(),
      correlationId: input.correlationId ?? randomUUID(),
      invalidationSet,
      payload: { objectCount: objects.size },
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    };
    const events = [...row.events, event];
    const branch: Branch = {
      branchId: row.branch_id,
      modelId: row.model_id,
      name: row.name,
      headHash: afterHash,
      headEventId: event.eventId,
      createdAt:
        typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    };
    await this.saveBranch(row, objects, events, row.snapshots, branch);
    return event;
  }

  async upsertObject(
    branchId: string,
    actor: Actor,
    expectedHeadHash: string,
    object: Record<string, unknown> & { id: string },
  ): Promise<ChangeEvent> {
    const existing = await this.getObject(branchId, object.id);
    return this.applyMutation({
      branchId,
      actor,
      command: existing ? 'UPDATE' : 'CREATE',
      expectedHeadHash,
      targetIds: [object.id],
      mutate: (objects) => {
        objects.set(object.id, { ...object });
        return [object.id];
      },
    });
  }

  async deleteObject(
    branchId: string,
    actor: Actor,
    expectedHeadHash: string,
    semanticId: string,
  ): Promise<ChangeEvent> {
    return this.applyMutation({
      branchId,
      actor,
      command: 'DELETE',
      expectedHeadHash,
      targetIds: [semanticId],
      mutate: (objects) => {
        if (!objects.delete(semanticId)) {
          throw new Error(`Object not found: ${semanticId}`);
        }
        return [semanticId];
      },
    });
  }

  async snapshot(branchId: string, name?: string): Promise<Snapshot> {
    const row = await this.loadBranch(branchId);
    const objectState = { ...row.objects };
    const snap: Snapshot = {
      snapshotId: `snapshot:${randomUUID()}`,
      modelId: row.model_id,
      branchId,
      stateHash: hashState(objectState),
      state: objectState,
      createdAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      ...(name !== undefined ? { name } : {}),
    };
    const snapshots = [...row.snapshots, snap];
    const branch = await this.getBranchHead(branchId);
    await this.saveBranch(row, new Map(Object.entries(row.objects)), row.events, snapshots, branch);
    return snap;
  }

  async createBranch(modelId: string, name: string, fromBranchId: string): Promise<Branch> {
    const from = await this.loadBranch(fromBranchId);
    const branchId = `branch:${modelId}:${name}`;
    const existing = await this.sql`SELECT 1 FROM vs_branches WHERE branch_id = ${branchId}`;
    if (existing.length) throw new Error(`Branch exists: ${branchId}`);
    const createdAt = new Date().toISOString();
    const objects = { ...from.objects };
    const branch: Branch = {
      branchId,
      modelId,
      name,
      headHash: hashState(objects),
      headEventId: from.head_event_id,
      createdAt,
    };
    await this.sql`
      INSERT INTO vs_branches (
        branch_id, model_id, name, head_hash, head_event_id, created_at, objects, events, snapshots
      ) VALUES (
        ${branchId}, ${modelId}, ${name}, ${branch.headHash}, ${branch.headEventId}, ${createdAt},
        ${JSON.stringify(objects)}::jsonb,
        ${JSON.stringify(from.events)}::jsonb,
        ${JSON.stringify(from.snapshots.map((s) => ({ ...s, branchId })))}::jsonb
      )
    `;
    return branch;
  }

  async restoreToNewHead(
    branchId: string,
    snapshotId: string,
    actor: Actor,
  ): Promise<ChangeEvent> {
    const row = await this.loadBranch(branchId);
    const snap = row.snapshots.find((s) => s.snapshotId === snapshotId);
    if (!snap) throw new Error(`Snapshot not found: ${snapshotId}`);
    return this.applyMutation({
      branchId,
      actor,
      command: 'RESTORE',
      expectedHeadHash: row.head_hash,
      targetIds: [snapshotId],
      reason: `Restore from ${snapshotId}`,
      mutate: (objects) => {
        objects.clear();
        for (const [id, value] of Object.entries(
          snap.state as Record<string, Record<string, unknown>>,
        )) {
          objects.set(id, value);
        }
        return Object.keys(snap.state as object);
      },
    });
  }

  async replay(branchId: string): Promise<{ stateHash: string; eventCount: number }> {
    const row = await this.loadBranch(branchId);
    const stateHash = hashState(row.objects);
    if (stateHash !== row.head_hash) {
      throw new Error('Replay hash mismatch against branch head');
    }
    return { stateHash, eventCount: row.events.length };
  }

  async compareSnapshots(aId: string, bId: string, branchId: string): Promise<SemanticDiff> {
    const row = await this.loadBranch(branchId);
    const a = row.snapshots.find((s) => s.snapshotId === aId);
    const b = row.snapshots.find((s) => s.snapshotId === bId);
    if (!a || !b) throw new Error('Snapshot(s) not found');
    const aIds = new Set(Object.keys(a.state as object));
    const bIds = new Set(Object.keys(b.state as object));
    const addedIds = [...bIds].filter((id) => !aIds.has(id));
    const removedIds = [...aIds].filter((id) => !bIds.has(id));
    const changedIds = [...aIds].filter((id) => {
      if (!bIds.has(id)) return false;
      return (
        hashState((a.state as Record<string, unknown>)[id]) !==
        hashState((b.state as Record<string, unknown>)[id])
      );
    });
    return {
      addedIds,
      removedIds,
      changedIds,
      fromHash: a.stateHash,
      toHash: b.stateHash,
    };
  }
}

export async function createVersionStoreFromEnv(): Promise<{
  store: VersionStore;
  kind: 'memory' | 'postgres';
  close?: () => Promise<void>;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const { InMemoryVersionStore } = await import('@spds/version-core');
    return { store: new InMemoryVersionStore(), kind: 'memory' };
  }
  const store = new PostgresVersionStore(url);
  return { store, kind: 'postgres', close: () => store.close() };
}
