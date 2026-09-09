import { randomUUID } from 'node:crypto';
import { assertExpectedHead } from '@spds/concurrency-core';
import { createSpdsError } from '@spds/failure-taxonomy';
import { sha256Canonical } from '@spds/reproducibility';
import type { VersionStore } from '@spds/version-core';
import type {
  CandidateRevision,
  DesignCommand,
  DesignTransaction,
  PublicationGateResult,
  PublicationManifest,
} from './types.js';

async function asPromise<T>(value: T | Promise<T>): Promise<T> {
  return await value;
}
export type CompileStage =
  | 'semantic'
  | 'composition'
  | 'pir'
  | 'dag'
  | 'geometry'
  | 'validation';

export interface MockCompileResult {
  readonly pirHash: string;
  readonly dagHash: string;
  readonly validationHash: string;
  readonly artifactHashes: readonly string[];
}

export type CompileAdapter = (input: {
  readonly transactionId: string;
  readonly candidate: CandidateRevision;
  readonly commands: readonly DesignCommand[];
}) => Promise<{
  readonly ok: boolean;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly validationHash: string;
  readonly artifactHashes: readonly string[];
  readonly pipelineHash?: string;
  readonly failAt?: CompileStage;
}>;

export class TransactionEngine {
  private readonly txns = new Map<string, DesignTransaction>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly candidates = new Map<string, CandidateRevision>();
  private readonly manifests = new Map<string, PublicationManifest>();
  private publishedHeadObjects = new Map<string, Record<string, unknown>>();
  private workerGeneration = 1;
  private compileAdapter: CompileAdapter | null = null;

  constructor(private readonly store: VersionStore) {}

  setCompileAdapter(adapter: CompileAdapter | null): void {
    this.compileAdapter = adapter;
  }

  hasCompileAdapter(): boolean {
    return this.compileAdapter !== null;
  }

  getTransaction(id: string): DesignTransaction | undefined {
    return this.txns.get(id);
  }

  getCandidate(id: string): CandidateRevision | undefined {
    return this.candidates.get(id);
  }

  async getPublishedObjects(
    branchId: string,
  ): Promise<ReadonlyMap<string, Record<string, unknown>>> {
    const cached = this.publishedHeadObjects.get(branchId);
    if (cached) {
      return new Map(
        Object.entries(cached).map(([k, v]) => [k, v as Record<string, unknown>] as const),
      );
    }
    const objects = await asPromise(this.store.listObjects(branchId));
    return new Map(objects.map((o) => [String(o['id']), o] as const));
  }

  async begin(input: {
    modelId: string;
    branchId: string;
    actorId: string;
    actorType: 'user' | 'ai' | 'system';
    expectedHeadHash: string;
    idempotencyKey: string;
  }): Promise<DesignTransaction> {
    const existingId = this.byIdempotency.get(input.idempotencyKey);
    if (existingId) {
      return this.txns.get(existingId)!;
    }
    const head = (await asPromise(this.store.getBranchHead(input.branchId))).headHash;
    assertExpectedHead({
      expectedHeadHash: input.expectedHeadHash,
      actualHeadHash: head,
      conflictingActors: [input.actorId],
    });
    const now = new Date().toISOString();
    const txn: DesignTransaction = {
      id: `txn:${randomUUID()}`,
      modelId: input.modelId,
      branchId: input.branchId,
      actorId: input.actorId,
      actorType: input.actorType,
      expectedHeadHash: input.expectedHeadHash,
      idempotencyKey: input.idempotencyKey,
      status: 'open',
      commands: [],
      createdAt: now,
      updatedAt: now,
    };
    this.txns.set(txn.id, txn);
    this.byIdempotency.set(input.idempotencyKey, txn.id);
    return txn;
  }

  appendCommand(txnId: string, command: DesignCommand): DesignTransaction {
    const txn = this.requireOpen(txnId);
    const next: DesignTransaction = {
      ...txn,
      commands: [...txn.commands, command],
      updatedAt: new Date().toISOString(),
    };
    this.txns.set(txnId, next);
    return next;
  }

  abort(txnId: string, reason?: string): DesignTransaction {
    const txn = this.requireMutable(txnId);
    if (txn.candidateRevisionId) this.candidates.delete(txn.candidateRevisionId);
    const next: DesignTransaction = {
      ...txn,
      status: 'aborted',
      updatedAt: new Date().toISOString(),
      ...(reason !== undefined ? { failureStage: reason } : {}),
    };
    this.txns.set(txnId, next);
    return next;
  }

  async buildCandidate(txnId: string): Promise<CandidateRevision> {
    const txn = this.requireOpen(txnId);
    const listed = await asPromise(this.store.listObjects(txn.branchId));
    const base = Object.fromEntries(listed.map((o) => [String(o['id']), structuredClone(o)]));
    for (const cmd of txn.commands) {
      applyCommand(base, cmd);
    }
    const candidate: CandidateRevision = {
      id: `candidate:${randomUUID()}`,
      transactionId: txnId,
      objects: base,
      published: false,
    };
    this.candidates.set(candidate.id, candidate);
    const next: DesignTransaction = {
      ...txn,
      status: 'validating',
      candidateRevisionId: candidate.id,
      updatedAt: new Date().toISOString(),
    };
    this.txns.set(txnId, next);
    return candidate;
  }

  mockCompile(
    txnId: string,
    options?: { failAt?: CompileStage; workerGeneration?: number },
  ): PublicationManifest {
    const txn = this.txns.get(txnId);
    if (!txn?.candidateRevisionId) {
      throw createSpdsError({
        code: 'SEMANTIC_INVALID',
        summary: 'Candidate required before compile',
        affectedSemanticIds: [txnId],
        recoverable: true,
      });
    }
    const candidate = this.candidates.get(txn.candidateRevisionId)!;
    this.patch(txnId, { status: 'compiling' });

    const stages: CompileStage[] = [
      'semantic',
      'composition',
      'pir',
      'dag',
      'geometry',
      'validation',
    ];
    for (const stage of stages) {
      if (options?.failAt === stage) {
        this.patch(txnId, { status: 'failed', failureStage: stage });
        throw createSpdsError({
          code: 'OPERATOR_FAILED',
          summary: `Injected compile failure at ${stage}`,
          affectedSemanticIds: [txnId],
          recoverable: true,
          operationOrPirId: stage,
        });
      }
    }

    const workerGeneration = options?.workerGeneration ?? this.workerGeneration;
    if (workerGeneration < this.workerGeneration) {
      this.patch(txnId, { status: 'failed', failureStage: 'stale-worker' });
      throw createSpdsError({
        code: 'STALE_RESULT',
        summary: 'Stale worker cannot publish',
        affectedSemanticIds: [txnId],
        recoverable: true,
      });
    }

    const compiled: MockCompileResult = {
      pirHash: sha256Canonical({ pir: candidate.objects }),
      dagHash: sha256Canonical({ dag: Object.keys(candidate.objects).sort() }),
      validationHash: sha256Canonical({ ok: true }),
      artifactHashes: [sha256Canonical({ artifacts: txn.id })],
    };
    const manifest: PublicationManifest = {
      id: `pub:${randomUUID()}`,
      transactionId: txnId,
      snapshotHash: sha256Canonical(candidate.objects),
      pirHash: compiled.pirHash,
      dagHash: compiled.dagHash,
      envHash: sha256Canonical({ node: process.version }),
      validationHash: compiled.validationHash,
      artifactHashes: compiled.artifactHashes,
      workerGeneration,
    };
    this.manifests.set(manifest.id, manifest);
    this.patch(txnId, {
      status: 'gated',
      publicationManifestId: manifest.id,
    });
    return manifest;
  }

  async compile(
    txnId: string,
    options?: { failAt?: CompileStage; workerGeneration?: number },
  ): Promise<PublicationManifest> {
    if (!this.compileAdapter || options?.failAt) {
      return this.mockCompile(txnId, options);
    }
    const txn = this.txns.get(txnId);
    if (!txn?.candidateRevisionId) {
      throw createSpdsError({
        code: 'SEMANTIC_INVALID',
        summary: 'Candidate required before compile',
        affectedSemanticIds: [txnId],
        recoverable: true,
      });
    }
    const candidate = this.candidates.get(txn.candidateRevisionId)!;
    this.patch(txnId, { status: 'compiling' });
    const result = await this.compileAdapter({
      transactionId: txnId,
      candidate,
      commands: txn.commands,
    });
    if (!result.ok) {
      this.patch(txnId, { status: 'failed', failureStage: result.failAt ?? 'geometry' });
      throw createSpdsError({
        code: 'OPERATOR_FAILED',
        summary: `Compile failed at ${result.failAt ?? 'geometry'}`,
        affectedSemanticIds: [txnId],
        recoverable: true,
      });
    }
    const manifest: PublicationManifest = {
      id: `pub:${randomUUID()}`,
      transactionId: txnId,
      snapshotHash: sha256Canonical(candidate.objects),
      pirHash: result.pirHash,
      dagHash: result.dagHash,
      envHash: sha256Canonical({ node: process.version, pipelineHash: result.pipelineHash ?? null }),
      validationHash: result.validationHash,
      artifactHashes: result.artifactHashes,
      workerGeneration: options?.workerGeneration ?? this.workerGeneration,
    };
    this.manifests.set(manifest.id, manifest);
    this.patch(txnId, {
      status: 'gated',
      publicationManifestId: manifest.id,
    });
    return manifest;
  }

  async publicationGate(txnId: string): Promise<PublicationGateResult> {
    const txn = this.txns.get(txnId);
    if (!txn || txn.status !== 'gated' || !txn.publicationManifestId) {
      return { ok: false, reason: 'not-gated' };
    }
    const head = (await asPromise(this.store.getBranchHead(txn.branchId))).headHash;
    if (head !== txn.expectedHeadHash) {
      return { ok: false, reason: 'HEAD_CONFLICT' };
    }
    return { ok: true };
  }

  async commit(txnId: string): Promise<DesignTransaction> {
    const gate = await this.publicationGate(txnId);
    if (!gate.ok) {
      this.abort(txnId, gate.reason);
      throw createSpdsError({
        code: gate.reason === 'HEAD_CONFLICT' ? 'HEAD_CONFLICT' : 'PUBLICATION_BLOCKED',
        summary: `Publication blocked: ${gate.reason ?? 'unknown'}`,
        affectedSemanticIds: [txnId],
        recoverable: true,
      });
    }
    const txn = this.txns.get(txnId)!;
    const candidate = this.candidates.get(txn.candidateRevisionId!)!;
    let head = txn.expectedHeadHash;
    for (const cmd of txn.commands) {
      const event = await asPromise(
        this.store.applyMutation({
          branchId: txn.branchId,
          actor: { type: txn.actorType, id: txn.actorId },
          command: cmd.type,
          expectedHeadHash: head,
          targetIds: [...cmd.targetIds],
          mutate: (objects) => {
            const asRecord = Object.fromEntries(objects);
            applyCommand(asRecord, cmd);
            objects.clear();
            for (const [k, v] of Object.entries(asRecord)) {
              objects.set(k, v as Record<string, unknown>);
            }
            return [...cmd.targetIds];
          },
        }),
      );
      head = event.afterHash;
    }
    this.publishedHeadObjects.set(
      txn.branchId,
      structuredClone(candidate.objects) as Record<string, unknown>,
    );
    const committed: DesignTransaction = {
      ...txn,
      status: 'committed',
      updatedAt: new Date().toISOString(),
    };
    this.txns.set(txnId, committed);
    return committed;
  }

  bumpWorkerGeneration(): number {
    this.workerGeneration += 1;
    return this.workerGeneration;
  }

  private requireOpen(txnId: string): DesignTransaction {
    const txn = this.txns.get(txnId);
    if (!txn || (txn.status !== 'open' && txn.status !== 'validating')) {
      throw createSpdsError({
        code: 'SEMANTIC_INVALID',
        summary: `Transaction ${txnId} is not open`,
        affectedSemanticIds: [txnId],
        recoverable: false,
      });
    }
    return txn;
  }

  private requireMutable(txnId: string): DesignTransaction {
    const txn = this.txns.get(txnId);
    if (!txn || txn.status === 'committed') {
      throw createSpdsError({
        code: 'SEMANTIC_INVALID',
        summary: `Transaction ${txnId} cannot be mutated`,
        affectedSemanticIds: [txnId],
        recoverable: false,
      });
    }
    return txn;
  }

  private patch(
    txnId: string,
    patch: Partial<
      Pick<
        DesignTransaction,
        'status' | 'failureStage' | 'publicationManifestId' | 'candidateRevisionId'
      >
    >,
  ): void {
    const txn = this.txns.get(txnId)!;
    this.txns.set(txnId, {
      ...txn,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
}

function applyCommand(objects: Record<string, unknown>, cmd: DesignCommand): void {
  switch (cmd.type) {
    case 'SET_PARAMETER': {
      const id = String(cmd.payload['id'] ?? cmd.targetIds[0]);
      const prev = (objects[id] as Record<string, unknown> | undefined) ?? { id };
      const path = typeof cmd.payload['path'] === 'string' ? cmd.payload['path'] : undefined;
      const value = cmd.payload['value'];
      objects[id] =
        path === 'lengthMm'
          ? { ...prev, id, lengthMm: value, value }
          : { ...prev, id, value };
      break;
    }
    case 'CREATE_OBJECT': {
      const id = String(cmd.payload['id'] ?? cmd.targetIds[0]);
      objects[id] = { ...(cmd.payload['object'] as object), id };
      break;
    }
    case 'DELETE_OBJECT': {
      const id = String(cmd.payload['id'] ?? cmd.targetIds[0]);
      delete objects[id];
      break;
    }
    case 'APPLY_PATTERN':
    case 'AI_CHANGESET': {
      const patch = (cmd.payload['objects'] as Record<string, unknown> | undefined) ?? {};
      for (const [id, obj] of Object.entries(patch)) objects[id] = obj;
      break;
    }
    default: {
      const _exhaustive: never = cmd.type;
      void _exhaustive;
    }
  }
}
