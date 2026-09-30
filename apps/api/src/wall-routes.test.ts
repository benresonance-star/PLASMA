import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { createWallFixture } from '@spds/wall-core';
import { registerWallRoutes } from './wall-routes.js';

function setup(store = new InMemoryVersionStore(), modelId?: string) {
  const model = modelId ?? store.createModel('Wall evidence study').modelId;
  const branchId = store.getMainBranchId(model),
    headHash = store.getBranchHead(branchId).headHash;
  const app = Fastify();
  registerWallRoutes(app, store);
  const scope = { modelId: model, branchId };
  const preview = (operation: unknown, head = store.getBranchHead(branchId).headHash) =>
    app.inject({
      method: 'POST',
      url: '/walls/preview',
      payload: { ...scope, expectedHeadHash: head, operation },
    });
  const commit = (id: string) =>
    app.inject({
      method: 'POST',
      url: `/walls/previews/${encodeURIComponent(id)}/commit`,
      payload: scope,
    });
  return { app, store, scope, headHash, preview, commit };
}
describe('Wall API feature transactions — scoped evidence for WALL-AT-05', () => {
  it('isolates a preview then accepts feature and outputs in exactly one event', async () => {
    const x = setup();
    const result = await x.preview({ type: 'CreateWall', wall: createWallFixture() });
    expect(result.statusCode).toBe(200);
    expect(x.store.listObjects(x.scope.branchId)).toEqual([]);
    const commit = await x.commit(result.json().transactionId);
    expect(commit.statusCode).toBe(200);
    expect(commit.json().issueReady).toBe(false);
    expect(x.store.listObjects(x.scope.branchId)).toHaveLength(3);
    const events = x.store.listEvents(x.scope.branchId);
    expect(events).toHaveLength(1);
    expect(events[0]!.targetIds).toEqual([
      'wall:study',
      'wall:study:output',
      'wall:study:operation:1',
    ]);
    expect(x.store.getObject(x.scope.branchId, 'wall:study:operation:1')!['operation']).toEqual({
      type: 'CreateWall',
      wall: createWallFixture(),
    });
    await x.app.close();
  });
  it('rejects late candidates and stale base revisions without overwriting accepted state', async () => {
    const x = setup(),
      wall = createWallFixture();
    const a = await x.preview({ type: 'CreateWall', wall }),
      b = await x.preview({ type: 'CreateWall', wall: createWallFixture('wall:other') });
    expect((await x.commit(a.json().transactionId)).statusCode).toBe(200);
    const acceptedHead = x.store.getBranchHead(x.scope.branchId).headHash;
    const late = await x.commit(b.json().transactionId);
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe('HEAD_CONFLICT');
    expect(x.store.getBranchHead(x.scope.branchId).headHash).toBe(acceptedHead);
    expect(x.store.getObject(x.scope.branchId, 'wall:other')).toBeUndefined();
    expect(
      (
        await x.preview(
          { type: 'SetWallParameters', wallId: wall.id, parameters: { heightMm: 3000 } },
          x.headHash,
        )
      ).statusCode,
    ).toBe(409);
    await x.app.close();
  });
  it('rejects invalid opening regeneration without affecting unrelated accepted objects', async () => {
    const x = setup(),
      wall = createWallFixture();
    const a = await x.preview({ type: 'CreateWall', wall });
    await x.commit(a.json().transactionId);
    x.store.upsertObject(
      x.scope.branchId,
      { type: 'user', id: 'u' },
      x.store.getBranchHead(x.scope.branchId).headHash,
      { id: 'unrelated', value: 42 },
    );
    const head = x.store.getBranchHead(x.scope.branchId).headHash;
    const invalid = await x.preview({
      type: 'HostOpening',
      wallId: wall.id,
      opening: {
        id: 'o',
        hostId: wall.id,
        segmentId: wall.segments[0]!.id,
        widthMm: 9000,
        heightMm: 1200,
        sillMm: 900,
        placement: { kind: 'centred' },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(x.store.getBranchHead(x.scope.branchId).headHash).toBe(head);
    expect(x.store.getObject(x.scope.branchId, 'unrelated')).toEqual({
      id: 'unrelated',
      value: 42,
    });
    expect(x.store.listEvents(x.scope.branchId)).toHaveLength(2);
    await x.app.close();
  });
  it('discards previews and requires explicit accept before any mutation', async () => {
    const x = setup(),
      a = await x.preview({ type: 'CreateWall', wall: createWallFixture() });
    expect(
      (
        await x.app.inject({
          method: 'POST',
          url: `/walls/previews/${encodeURIComponent(a.json().transactionId)}/discard`,
          payload: x.scope,
        })
      ).statusCode,
    ).toBe(200);
    expect((await x.commit(a.json().transactionId)).statusCode).toBe(400);
    expect(x.store.getBranchHead(x.scope.branchId).headHash).toBe(x.headHash);
    await x.app.close();
  });
  it('reopens accepted pins, layers, hosts and deterministic outputs with a fresh route instance', async () => {
    const x = setup(),
      wall = createWallFixture();
    const a = await x.preview({ type: 'CreateWall', wall });
    await x.commit(a.json().transactionId);
    const b = await x.preview({
      type: 'HostOpening',
      wallId: wall.id,
      opening: {
        id: 'o',
        hostId: wall.id,
        segmentId: wall.segments[0]!.id,
        widthMm: 1200,
        heightMm: 1200,
        sillMm: 900,
        placement: { kind: 'centred' },
      },
    });
    const accepted = await x.commit(b.json().transactionId);
    await x.app.close();
    const reopened = setup(x.store, x.scope.modelId);
    const read = await reopened.app.inject(
      `/walls?modelId=${encodeURIComponent(x.scope.modelId)}&branchId=${encodeURIComponent(x.scope.branchId)}`,
    );
    expect(read.statusCode).toBe(200);
    expect(read.json().walls[0]).toEqual(accepted.json().wall);
    expect(read.json().outputs[0]).toEqual(accepted.json().output);
    await reopened.app.close();
  });
  it('scopes branch ownership and rejects identity collisions', async () => {
    const x = setup(),
      other = x.store.createModel('Other');
    const mismatch = await x.app.inject({
      method: 'POST',
      url: '/walls/preview',
      payload: {
        ...x.scope,
        modelId: other.modelId,
        expectedHeadHash: x.headHash,
        operation: { type: 'CreateWall', wall: createWallFixture() },
      },
    });
    expect(mismatch.statusCode).toBe(400);
    x.store.upsertObject(x.scope.branchId, { type: 'user', id: 'u' }, x.headHash, {
      id: 'wall:study',
      kind: 'parameter',
      value: 42,
    });
    expect((await x.preview({ type: 'CreateWall', wall: createWallFixture() })).statusCode).toBe(
      400,
    );
    await x.app.close();
  });
  it('branches remain independent while editing the same wall identity', async () => {
    const x = setup(),
      a = await x.preview({ type: 'CreateWall', wall: createWallFixture() });
    await x.commit(a.json().transactionId);
    const branch = x.store.createBranch(x.scope.modelId, 'alternative', x.scope.branchId);
    const p = await x.app.inject({
      method: 'POST',
      url: '/walls/preview',
      payload: {
        modelId: x.scope.modelId,
        branchId: branch.branchId,
        expectedHeadHash: branch.headHash,
        operation: {
          type: 'SetWallParameters',
          wallId: 'wall:study',
          parameters: { heightMm: 3000 },
        },
      },
    });
    expect(
      (
        await x.app.inject({
          method: 'POST',
          url: `/walls/previews/${encodeURIComponent(p.json().transactionId)}/commit`,
          payload: { modelId: x.scope.modelId, branchId: branch.branchId },
        })
      ).statusCode,
    ).toBe(200);
    expect(x.store.getObject(x.scope.branchId, 'wall:study')!['heightMm']).toBe(2700);
    expect(x.store.getObject(branch.branchId, 'wall:study')!['heightMm']).toBe(3000);
    await x.app.close();
  });
});
