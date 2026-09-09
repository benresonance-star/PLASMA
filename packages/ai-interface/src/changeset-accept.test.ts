import { describe, expect, it } from 'vitest';
import {
  changeSetHasPatternParamRule,
  changeSetToSemanticCommands,
  isOrganiseOnlyLowerResult,
  LENGTH_MM_MAX,
  LENGTH_MM_MIN,
} from './changeset-accept.js';
import { GOLDBERG_PATTERN_PUBLISHED_ID } from './id-map.js';
import type { ChangeSet } from './tools.js';

function baseCs(commands: ChangeSet['commands']): ChangeSet {
  return {
    changeSetId: 'cs:t',
    branchId: 'branch:ai-agent',
    expectedHeadHash: 'head:1',
    transactionId: 'txn:t',
    commands,
    actor: 'ai',
    disposition: 'proposed',
  };
}

describe('changeSetToSemanticCommands', () => {
  it('lowers update+lengthMm to UPDATE envelope', () => {
    const r = changeSetToSemanticCommands(
      baseCs([{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2300 } }]),
    );
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('geometry');
    expect(r.geometryRegen).toBe(true);
    expect(r.lengthMmOverride).toBe(2300);
    expect(r.geometryParams).toEqual({ lengthMm: 2300 });
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0]?.command).toBe('UPDATE');
    expect(r.envelopes[0]?.actorType).toBe('ai');
    expect(r.envelopes[0]?.payload.value).toBe(2300);
    expect(r.envelopes[0]?.payload.id).toBe('param:d01:length');
    expect(r.organiseOps).toEqual([]);
  });

  it('lowers multi-param updates (T3)', () => {
    const r = changeSetToSemanticCommands(
      baseCs([
        { op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2100 } },
        { op: 'update', targetId: 'param:d01:armWidth', payload: { armWidthMm: 100 } },
        {
          op: 'update',
          targetId: 'param:d01:structuralDepth',
          payload: { value: 160 },
        },
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.geometryParams).toEqual({
      lengthMm: 2100,
      armWidthMm: 100,
      structuralDepthMm: 160,
    });
    expect(r.envelopes).toHaveLength(3);
  });

  it('clamps lengthMm to domain', () => {
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 9000 } }]),
      ).lengthMmOverride,
    ).toBe(LENGTH_MM_MAX);
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 1 } }]),
      ).lengthMmOverride,
    ).toBe(LENGTH_MM_MIN);
  });

  it('rejects delete, unknown pattern, and fabricationReady', () => {
    expect(
      changeSetToSemanticCommands(baseCs([{ op: 'create', targetId: 'y:demo:01', payload: {} }]))
        .failureCode,
    ).toBe('KIND_NOT_ALLOWLISTED');
    expect(
      changeSetToSemanticCommands(baseCs([{ op: 'delete', targetId: 'y:demo:01' }])).failureCode,
    ).toBe('UNSUPPORTED_OP');
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'apply_pattern', targetId: 'pattern:geodesic', payload: {} }]),
      ).failureCode,
    ).toBe('UNKNOWN_PATTERN');
    expect(
      changeSetToSemanticCommands(
        baseCs([
          {
            op: 'update',
            targetId: 'y:demo:01',
            payload: { fabricationReady: true, lengthMm: 2300 },
          },
        ]),
      ).failureCode,
    ).toBe('CHANGESET_INVALID');
  });

  it('rejects missing lengthMm and unknown targets', () => {
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'y:demo:01', payload: { foo: 1 } }]),
      ).failureCode,
    ).toBe('MISSING_PARAM');
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'y:other', payload: { lengthMm: 2300 } }]),
      ).failureCode,
    ).toBe('UNKNOWN_TARGET');
  });

  it('accepts allowlisted create folder and Parameter (T4)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i += 1) {
      const r = changeSetToSemanticCommands(
        baseCs([
          {
            op: 'create',
            targetId: `folder:ai:batch-${i}`,
            payload: {
              kind: 'Entity',
              semanticType: 'ui.folder',
              name: `Folder ${i}`,
              parentId: 'model:d01',
            },
          },
        ]),
        { modelId: 'model:d01' },
      );
      expect(r.ok).toBe(true);
    }
    expect(performance.now() - t0).toBeLessThan(20);

    const folder = changeSetToSemanticCommands(
      baseCs([
        {
          op: 'create',
          targetId: 'folder:ai:bay',
          payload: {
            kind: 'Entity',
            semanticType: 'ui.folder',
            name: 'Bay',
            parentId: 'model:d01',
          },
        },
      ]),
      { modelId: 'model:d01' },
    );
    expect(folder.ok).toBe(true);
    expect(folder.mode).toBe('create');
    expect(isOrganiseOnlyLowerResult(folder)).toBe(true);
    expect(folder.geometryRegen).toBe(false);
    expect(folder.organiseOps[0]).toMatchObject({
      kind: 'create_group',
      groupId: 'folder:ai:bay',
      label: 'Bay',
    });

    const param = changeSetToSemanticCommands(
      baseCs([
        {
          op: 'create',
          targetId: 'param:ai:stub-1',
          payload: {
            kind: 'Parameter',
            semanticType: 'parameter.number',
            name: 'Stub length',
            path: 'stubMm',
            value: 100,
          },
        },
      ]),
    );
    expect(param.ok).toBe(true);
    expect(param.mode).toBe('create');
    expect(isOrganiseOnlyLowerResult(param)).toBe(true);
    expect(param.createdParameters?.[0]).toMatchObject({
      id: 'param:ai:stub-1',
      path: 'stubMm',
      value: 100,
    });

    expect(
      changeSetToSemanticCommands(
        baseCs([
          {
            op: 'create',
            targetId: 'affector:ai:1',
            payload: { kind: 'Affector', semanticType: 'affector.demo', name: 'Nope' },
          },
        ]),
      ).failureCode,
    ).toBe('KIND_NOT_ALLOWLISTED');
  });

  it('lowers apply_pattern for Goldberg with geometry regen (T5)', () => {
    const t0 = performance.now();
    const r = changeSetToSemanticCommands(
      baseCs([
        {
          op: 'apply_pattern',
          targetId: GOLDBERG_PATTERN_PUBLISHED_ID,
          payload: {
            frequency: 2,
            lengthMm: 2100,
          },
        },
      ]),
    );
    expect(performance.now() - t0).toBeLessThan(5);
    expect(r.ok).toBe(true);
    expect(r.geometryRegen).toBe(true);
    expect(r.appliedPatternId).toBe(GOLDBERG_PATTERN_PUBLISHED_ID);
    expect(r.patternInstanceId).toBe('pattern-instance:d01-reference');
    expect(r.geometryParams?.lengthMm).toBe(2100);
    expect(r.envelopes.some((e) => e.command === 'APPLY')).toBe(true);
    expect(changeSetHasPatternParamRule(baseCs([{ op: 'apply_pattern', targetId: GOLDBERG_PATTERN_PUBLISHED_ID }]))).toBe(
      true,
    );
    expect(
      changeSetHasPatternParamRule(
        baseCs([{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2100 } }]),
      ),
    ).toBe(false);
  });

  it('lowers create_group + connect without mutating until accept', () => {
    const t0 = performance.now();
    const r = changeSetToSemanticCommands(
      baseCs([
        {
          op: 'create_group',
          targetId: 'folder:bay',
          payload: { label: 'Bay', parentId: 'model:d01' },
        },
        {
          op: 'connect',
          targetId: 'component:y:0000',
          payload: { parentId: 'folder:bay', relationType: 'part-of' },
        },
      ]),
      { modelId: 'model:d01' },
    );
    expect(performance.now() - t0).toBeLessThan(20);
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('organise');
    expect(isOrganiseOnlyLowerResult(r)).toBe(true);
    expect(r.lengthMmOverride).toBeUndefined();
    expect(r.organiseOps).toHaveLength(2);
    expect(r.organiseOps[0]).toMatchObject({
      kind: 'create_group',
      label: 'Bay',
      parentId: 'model:d01',
      groupId: 'folder:bay',
    });
    expect(r.organiseOps[1]).toMatchObject({
      kind: 'connect',
      nodeId: 'component:y:0000',
      newParentId: 'folder:bay',
      relationType: 'part-of',
    });
    expect(r.envelopes.map((e) => e.command)).toEqual(['CREATE', 'CONNECT']);
  });

  it('marks mixed geometry + organise', () => {
    const r = changeSetToSemanticCommands(
      baseCs([
        { op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2100 } },
        {
          op: 'connect',
          targetId: 'component:y:0000',
          payload: { parentId: 'folder:bay' },
        },
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('mixed');
    expect(r.lengthMmOverride).toBe(2100);
    expect(r.organiseOps).toHaveLength(1);
  });

  it('propose-style 10-move organise lower stays under 20ms', () => {
    const commands = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? ({
            op: 'create_group' as const,
            payload: { label: `F${i}`, parentId: 'model:d01' },
          } as const)
        : ({
            op: 'connect' as const,
            targetId: `component:y:${String(i).padStart(4, '0')}`,
            payload: { parentId: 'folder:bay' },
          } as const),
    );
    const t0 = performance.now();
    const r = changeSetToSemanticCommands(baseCs(commands), { modelId: 'model:d01' });
    expect(performance.now() - t0).toBeLessThan(20);
    expect(r.ok).toBe(true);
    expect(r.organiseOps).toHaveLength(10);
  });
});
