import { describe, expect, it } from 'vitest';
import { GOLDBERG_PATTERN_PUBLISHED_ID, PARAM_D01_LENGTH_ID } from '@spds/ai-interface';
import {
  draftApplyGoldbergPattern,
  draftCreateFolder,
  draftUpdateLengthMm,
  draftUpdatePatternParam,
  pendingSchemaAnnotationIds,
} from './schema-draft.js';
import { appBindPendingDraft, createAppSession } from './app-session.js';

const ctx = {
  modelId: 'model:d01',
  branchId: 'branch:ai:d01',
  headHash: 'hash:abc',
  transactionId: 'txn:1',
};

describe('schema-draft', () => {
  it('drafts length update without mutating meshes', () => {
    const t0 = performance.now();
    const result = draftUpdateLengthMm(ctx, 2100, 1);
    expect(performance.now() - t0).toBeLessThan(5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pending.commands[0]).toEqual({
      op: 'update',
      targetId: PARAM_D01_LENGTH_ID,
      payload: { lengthMm: 2100 },
    });
    const session = createAppSession();
    const meshCount = session.g8.meshes.length;
    const bound = appBindPendingDraft(session, result.pending);
    expect(bound.pendingChangeSet?.commands[0]?.payload).toEqual({ lengthMm: 2100 });
    expect(bound.g8.meshes.length).toBe(meshCount);
  });

  it('drafts folder create and apply_pattern', () => {
    const folder = draftCreateFolder(ctx, { label: 'Bay' }, 2);
    expect(folder.ok).toBe(true);
    if (folder.ok) {
      expect(folder.pending.commands[0]?.op).toBe('create');
    }
    const pattern = draftApplyGoldbergPattern(ctx, undefined, 3);
    expect(pattern.ok).toBe(true);
    if (pattern.ok) {
      expect(pattern.pending.commands[0]?.op).toBe('apply_pattern');
      expect(pendingSchemaAnnotationIds(pattern.pending).has(GOLDBERG_PATTERN_PUBLISHED_ID)).toBe(
        true,
      );
    }
  });

  it('drafts package-owned topology parameters through apply_pattern', () => {
    const result = draftUpdatePatternParam(ctx, { path: 'params.frequency', value: 3 }, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pending.commands[0]).toEqual({
      op: 'apply_pattern',
      targetId: GOLDBERG_PATTERN_PUBLISHED_ID,
      payload: {
        patternId: GOLDBERG_PATTERN_PUBLISHED_ID,
        overrides: [{ path: 'params.frequency', value: 3 }],
      },
    });
  });

  it('fails closed without modelId', () => {
    const result = draftUpdateLengthMm({ modelId: null, branchId: null, headHash: 'hash:x' }, 2100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_MODEL');
  });
});
