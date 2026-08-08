import { useState } from 'react';
import {
  createG8Session,
  g8CommitExactLength,
  g8ExplorerIds,
  g8PreviewLength,
  g8PrimarySemanticId,
  g8Select,
  g8SelectionSynced,
  g8SetChrome,
  g8SetPanel,
  type G8Session,
} from '../g8-session.js';
import { publicationChromeLabel } from '../viewport.js';
import { ViewportCanvas } from './ViewportCanvas.js';

export function App() {
  const [session, setSession] = useState(() => createG8Session(Date.now()));
  const explorerIds = g8ExplorerIds();
  const selected = session.selection.selectedSemanticId;
  const synced = g8SelectionSynced(session);

  const update = (fn: (s: G8Session) => G8Session) => setSession((s) => fn(s));

  return (
    <main className="spds-app" data-layout={session.shell.layoutMode}>
      <header className="spds-header">
        <div>
          <h1>SPDS</h1>
          <p>
            {session.shell.context.modelId} · {session.shell.context.branchName} — viewport shows
            derived geometry only.
          </p>
        </div>
        <div className="spds-actions">
          <button
            type="button"
            className={session.chrome === 'candidate' ? 'is-active' : undefined}
            onClick={() => update((s) => g8SetChrome(s, 'candidate'))}
          >
            Candidate
          </button>
          <button
            type="button"
            className={session.chrome === 'published' ? 'is-active' : undefined}
            onClick={() => update((s) => g8SetChrome(s, 'published'))}
          >
            Published
          </button>
        </div>
      </header>

      <nav className="spds-tabs" aria-label="Panels">
        {(['explorer', 'viewport', 'inspector'] as const).map((panel) => (
          <button
            key={panel}
            type="button"
            className={session.shell.activePanel === panel ? 'is-active' : undefined}
            onClick={() => update((s) => g8SetPanel(s, panel))}
          >
            {panel}
          </button>
        ))}
      </nav>

      <div className="spds-shell">
        {(session.shell.openPanels.includes('explorer') ||
          session.shell.activePanel === 'explorer') && (
          <aside className="spds-panel spds-explorer" aria-label="Explorer">
            <h2>Explorer</h2>
            <ul>
              {explorerIds.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className={selected === id ? 'is-selected' : undefined}
                    onClick={() => update((s) => g8Select(s, id, 'explorer', Date.now()))}
                  >
                    {id}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section className="spds-panel spds-viewport-panel" aria-label="Viewport">
          <ViewportCanvas
            meshes={session.meshes}
            chrome={session.chrome}
            selectedSemanticId={selected}
            onPickSemantic={(id) => update((s) => g8Select(s, id, 'viewport', Date.now()))}
          />
        </section>

        {(session.shell.openPanels.includes('inspector') ||
          session.shell.activePanel === 'inspector') && (
          <aside className="spds-panel spds-inspector" aria-label="Inspector">
            <h2>Inspector</h2>
            <p className="spds-meta">
              Chrome: {publicationChromeLabel(session.chrome)}
              <br />
              Selection: {selected ?? 'none'}
              <br />
              Sync: {synced ? 'ok' : 'drift'}
              <br />
              Regen: {session.regenGeneration}
            </p>

            <label className="spds-field">
              <span>
                {session.lengthEdit.spec.name} ({session.lengthEdit.spec.unit})
              </span>
              <input
                type="range"
                min={session.lengthEdit.spec.min}
                max={session.lengthEdit.spec.max}
                step={1}
                value={session.lengthEdit.draftValue}
                onChange={(ev) => update((s) => g8PreviewLength(s, Number(ev.target.value)))}
              />
              <span>
                {session.lengthEdit.draftValue} — {session.lengthEdit.statusLabel}
              </span>
            </label>

            <div className="spds-actions">
              <button type="button" onClick={() => update((s) => g8CommitExactLength(s, Date.now()))}>
                Exact regen
              </button>
              <button
                type="button"
                onClick={() =>
                  update((s) => g8Select(s, g8PrimarySemanticId(), 'inspector', Date.now()))
                }
              >
                Select Y
              </button>
            </div>

            {session.measurement ? (
              <p className="spds-meta">
                Measure {session.measurement.anchorA} → {session.measurement.anchorB}:{' '}
                {session.measurement.quantity.toFixed(1)} {session.measurement.unit}
              </p>
            ) : null}
          </aside>
        )}
      </div>
    </main>
  );
}
