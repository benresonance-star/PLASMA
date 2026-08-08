import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_COMMANDS,
  acceptSemanticCommand,
  isMutatingCommand,
  parseSemanticCommand,
  toDesignCommandPayload,
  toDesignCommandType,
} from './index.js';

describe('E10 semantic-commands vocabulary', () => {
  it('requires expectedHeadHash for mutating commands', () => {
    expect(() =>
      parseSemanticCommand({
        commandId: 'cmd:1',
        command: 'CREATE',
        modelId: 'model:1',
        branchId: 'branch:main',
        actorId: 'user:1',
        payload: { id: 'obj:1' },
      }),
    ).toThrow(/HEAD_CONFLICT/);

    const ok = parseSemanticCommand({
      commandId: 'cmd:2',
      command: 'CREATE',
      modelId: 'model:1',
      branchId: 'branch:main',
      expectedHeadHash: 'head:abc',
      actorId: 'user:1',
      payload: { id: 'obj:1' },
    });
    expect(ok.expectedHeadHash).toBe('head:abc');
    expect(toDesignCommandType('CREATE')).toBe('CREATE_OBJECT');
  });

  it('accepts read/validate without head and covers vocabulary', () => {
    expect(SEMANTIC_COMMANDS).toContain('COMPILE');
    expect(isMutatingCommand('VALIDATE')).toBe(false);
    const accepted = acceptSemanticCommand({
      commandId: 'cmd:v',
      command: 'VALIDATE',
      modelId: 'model:1',
      branchId: 'branch:main',
      actorId: 'user:1',
    });
    expect(accepted.status).toBe('accepted');
    const rejected = acceptSemanticCommand({
      commandId: 'cmd:bad',
      command: 'DELETE',
      modelId: 'model:1',
      branchId: 'branch:main',
      actorId: 'user:1',
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.failureCode).toBe('HEAD_CONFLICT');

    const env = parseSemanticCommand({
      commandId: 'cmd:u',
      command: 'UPDATE',
      modelId: 'model:1',
      branchId: 'branch:main',
      expectedHeadHash: 'h',
      actorId: 'user:1',
      payload: { id: 'param:x', value: 2 },
    });
    expect(toDesignCommandPayload(env)?.type).toBe('SET_PARAMETER');
  });
});
