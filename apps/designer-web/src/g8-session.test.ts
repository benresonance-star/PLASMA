import { describe, expect, it } from 'vitest';
import {
  createG8Session,
  g8ApplyLiveMeshes,
  g8CommitExactLength,
  g8ExplorerIds,
  g8PreviewLength,
  g8PrimarySemanticId,
  g8Select,
  g8SelectionSynced,
  g8SetChrome,
} from './g8-session.js';
import type { DisplayMeshInput } from './mesh-bridge.js';

function stubArm(id: string, length: number): DisplayMeshInput {
  return {
    representationId: `r:${id}`,
    semanticOwner: id,
    vertices: [
      [0, 0, 0],
      [length, 0, 0],
      [length, 10, 0],
      [0, 10, 0],
    ],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

describe('G8 gate — parameter edit → exact regen preserves selection', () => {
  it('wires shell surfaces, preview, exact regen, and semantic measurement', () => {
    let session = createG8Session(0);
    expect(session.shell.context.modelId).toBe('model:d01');
    expect(g8ExplorerIds()).toContain(g8PrimarySemanticId());

    session = g8Select(session, g8PrimarySemanticId(), 'explorer', 10);
    expect(g8SelectionSynced(session)).toBe(true);
    expect(session.selection.sources.viewport).toBe(g8PrimarySemanticId());

    session = g8SetChrome(session, 'candidate');
    session = g8PreviewLength(session, 2600);
    expect(session.lengthEdit.mode).toBe('preview');
    expect(session.meshes[0]!.semanticOwner).toBe(g8PrimarySemanticId());
    expect(session.measurement?.quantity).toBe(2600);

    session = g8CommitExactLength(session, 20);
    expect(session.lengthEdit.mode).toBe('validated');
    expect(session.lengthEdit.spec.value).toBe(2600);
    expect(session.regenGeneration).toBe(1);
    expect(session.selection.selectedSemanticId).toBe(g8PrimarySemanticId());
    expect(session.measurement?.quantity).toBe(2600);
    expect(session.overlay?.result.anchorA.startsWith('semantic:')).toBe(true);

    session = g8PreviewLength(session, 9999);
    expect(session.lengthEdit.mode).toBe('domain-error');
    session = g8CommitExactLength(session, 30);
    expect(session.regenGeneration).toBe(1);
  });

  it('keeps multi-mesh live geometry while previewing length', () => {
    let session = createG8Session(0);
    const live = [stubArm('y:a', 2000), stubArm('y:b', 2000), stubArm('y:c', 2000)];
    session = g8ApplyLiveMeshes(session, live, 2000, 5);
    expect(session.meshSource).toBe('live');
    expect(session.meshes).toHaveLength(3);

    session = g8PreviewLength(session, 3000);
    expect(session.meshSource).toBe('live');
    expect(session.meshes).toHaveLength(3);
    expect(session.meshes[0]!.vertices[1]![0]).toBeCloseTo(3000);
    expect(session.measurement?.quantity).toBe(3000);

    session = g8CommitExactLength(session, 10);
    expect(session.meshSource).toBe('live');
    expect(session.meshes).toHaveLength(3);
    expect(session.lengthEdit.spec.value).toBe(3000);
  });
});
