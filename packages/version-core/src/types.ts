export type ActorType = 'user' | 'ai' | 'system';

export interface Actor {
  readonly type: ActorType;
  readonly id: string;
}

export interface ChangeEvent {
  readonly eventId: string;
  readonly modelId: string;
  readonly branchId: string;
  readonly actor: Actor;
  readonly command: string;
  readonly targetIds: readonly string[];
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly timestamp: string;
  readonly reason?: string;
  readonly correlationId: string;
  readonly invalidationSet: readonly string[];
  readonly payload: unknown;
}

export interface Snapshot {
  readonly snapshotId: string;
  readonly modelId: string;
  readonly branchId: string;
  readonly name?: string;
  readonly stateHash: string;
  readonly state: unknown;
  readonly createdAt: string;
  readonly schemaVersion: string;
}

export interface Branch {
  readonly branchId: string;
  readonly modelId: string;
  readonly name: string;
  readonly headHash: string;
  readonly headEventId: string | null;
  readonly createdAt: string;
}

export interface ModelRecord {
  readonly modelId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface SemanticDiff {
  readonly addedIds: readonly string[];
  readonly removedIds: readonly string[];
  readonly changedIds: readonly string[];
  readonly fromHash: string;
  readonly toHash: string;
}
