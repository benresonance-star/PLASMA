import { describe, expect, it } from 'vitest';
import {
  createG8Session,
  g8CommitExactLength,
  g8ExplorerIds,
  g8PreviewLength,
  g8PrimarySemanticId,
  g8Select,
  g8SelectionSynced,
  g8SetChrome,
} from './g8-session.js';

describe('G8 gate — parameter edit → exact regen preserves selection', () => {
  it('wires shell surfaces, preview, exact regen, and semantic measurement', () => {
    let session = createG8Session(0);
    expect(session.shell.context.modelId).toBe('model:d01');
    expect(g8ExplorerIds()).toContain(g8PrimarySemanticId());

    session = g8Select(session, g8PrimarySemanticId(), 'explorer', 10);
    expect(g8SelectionSynced(session)).toBe(true);
    expect(session.selection.sources.viewport).toBe(g8PrimarySemanticId());

    session = g8SetChrome(session, 'candidate');
    session = g8PreviewLength(session, 260);
    expect(session.lengthEdit.mode).toBe('preview');
    expect(session.meshes[0]!.semanticOwner).toBe(g8PrimarySemanticId());

    session = g8CommitExactLength(session, 20);
    expect(session.lengthEdit.mode).toBe('validated');
    expect(session.lengthEdit.spec.value).toBe(260);
    expect(session.regenGeneration).toBe(1);
    expect(session.selection.selectedSemanticId).toBe(g8PrimarySemanticId());
    expect(session.measurement?.quantity).toBe(260);
    expect(session.overlay?.result.anchorA.startsWith('semantic:')).toBe(true);

    session = g8PreviewLength(session, 999);
    expect(session.lengthEdit.mode).toBe('domain-error');
    session = g8CommitExactLength(session, 30);
    expect(session.regenGeneration).toBe(1);
  });
});
