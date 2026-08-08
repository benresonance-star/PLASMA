import { describe, expect, it } from 'vitest';
import { changeSetToSemanticCommands, LENGTH_MM_MAX, LENGTH_MM_MIN } from './changeset-accept.js';
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
      baseCs([{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 9 } }]),
    );
    expect(r.ok).toBe(true);
    expect(r.lengthMmOverride).toBe(9);
    expect(r.envelopes).toHaveLength(1);
    expect(r.envelopes[0]?.command).toBe('UPDATE');
    expect(r.envelopes[0]?.actorType).toBe('ai');
    expect(r.envelopes[0]?.payload.value).toBe(9);
  });

  it('clamps lengthMm to domain', () => {
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 100 } }]),
      ).lengthMmOverride,
    ).toBe(LENGTH_MM_MAX);
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'Y:1', payload: { lengthMm: 1 } }]),
      ).lengthMmOverride,
    ).toBe(LENGTH_MM_MIN);
  });

  it('rejects unsupported ops and fabricationReady', () => {
    expect(
      changeSetToSemanticCommands(baseCs([{ op: 'create', targetId: 'y:demo:01', payload: {} }]))
        .failureCode,
    ).toBe('UNSUPPORTED_OP');
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'delete', targetId: 'y:demo:01' }]),
      ).failureCode,
    ).toBe('UNSUPPORTED_OP');
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'apply_pattern', targetId: 'pattern:geodesic', payload: {} }]),
      ).failureCode,
    ).toBe('UNSUPPORTED_OP');
    expect(
      changeSetToSemanticCommands(
        baseCs([
          {
            op: 'update',
            targetId: 'y:demo:01',
            payload: { fabricationReady: true, lengthMm: 8 },
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
    ).toBe('MISSING_LENGTH');
    expect(
      changeSetToSemanticCommands(
        baseCs([{ op: 'update', targetId: 'y:other', payload: { lengthMm: 8 } }]),
      ).failureCode,
    ).toBe('UNKNOWN_TARGET');
  });
});
