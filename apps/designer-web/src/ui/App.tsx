import { useState } from 'react';
import { fetchD01Analyze, fetchD01DisplayMeshes } from '../api-client.js';
import {
  appAnalysisIndicative,
  appApplyAiChange,
  appApplyLiveDisplayMeshes,
  appCommitExactLength,
  appExplorerIds,
  appNavigateIssue,
  appPreviewLength,
  appPrimarySemanticId,
  appSelect,
  appSelectionSynced,
  appSetChrome,
  appSetPanel,
  appSwitchModelKind,
  createAppSession,
  type AppSession,
} from '../app-session.js';
import type { PanelId } from '../shell.js';
import { publicationChromeLabel } from '../viewport.js';
import { ViewportCanvas } from './ViewportCanvas.js';

const PANELS: readonly PanelId[] = [
  'explorer',
  'viewport',
  'inspector',
  'pipeline',
  'validation',
  'history',
  'ai',
  'analysis-mesh',
];

export function App() {
  const [session, setSession] = useState(() => createAppSession());
  const [liveStatus, setLiveStatus] = useState<string>('offline-demo');
  const update = (fn: (s: AppSession) => AppSession) => setSession((s) => fn(s));
  const selected = session.g8.selection.selectedSemanticId;
  const active = session.g8.shell.activePanel;

  const exactRegen = async () => {
    update((s) => appCommitExactLength(s, Date.now()));
    try {
      const live = await fetchD01DisplayMeshes(3);
      update((s) => appApplyLiveDisplayMeshes(s, live.meshes, Date.now()));
      setLiveStatus(`live:${live.source}:${live.pipelineHash.slice(0, 8)}`);
      try {
        const analysis = await fetchD01Analyze(2);
        update((s) => ({ ...s, analysis }));
      } catch {
        /* analysis optional */
      }
    } catch {
      setLiveStatus('offline-demo');
    }
  };

  return (
    <main className="spds-app" data-model={session.modelKind}>
      <header className="spds-header">
        <div>
          <h1>SPDS</h1>
          <p>
            {session.g8.shell.context.modelId} · {session.modelKind.toUpperCase()} ·{' '}
            {session.g8.shell.context.branchName}
          </p>
        </div>
        <div className="spds-actions">
          <button
            type="button"
            className={session.modelKind === 'd01' ? 'is-active' : undefined}
            onClick={() => update((s) => appSwitchModelKind(s, 'd01', Date.now()))}
          >
            D01
          </button>
          <button
            type="button"
            className={session.modelKind === 'f01' ? 'is-active' : undefined}
            onClick={() => update((s) => appSwitchModelKind(s, 'f01', Date.now()))}
          >
            F01
          </button>
          <button
            type="button"
            className={session.g8.chrome === 'candidate' ? 'is-active' : undefined}
            onClick={() => update((s) => appSetChrome(s, 'candidate'))}
          >
            Candidate
          </button>
          <button
            type="button"
            className={session.g8.chrome === 'published' ? 'is-active' : undefined}
            onClick={() => update((s) => appSetChrome(s, 'published'))}
          >
            Published
          </button>
        </div>
      </header>

      <nav className="spds-tabs" aria-label="Panels">
        {PANELS.map((panel) => (
          <button
            key={panel}
            type="button"
            className={active === panel ? 'is-active' : undefined}
            onClick={() => update((s) => appSetPanel(s, panel))}
          >
            {panel}
          </button>
        ))}
      </nav>

      <div className="spds-shell">
        <aside className="spds-panel spds-explorer" aria-label="Explorer">
          <h2>Explorer</h2>
          <ul>
            {appExplorerIds(session).map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={selected === id ? 'is-selected' : undefined}
                  onClick={() => update((s) => appSelect(s, id, 'explorer', Date.now()))}
                >
                  {id}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="spds-panel spds-viewport-panel" aria-label="Viewport">
          {(active === 'viewport' ||
            active === 'explorer' ||
            active === 'inspector' ||
            session.g8.shell.openPanels.includes('viewport')) && (
            <ViewportCanvas
              meshes={session.g8.meshes}
              chrome={session.g8.chrome}
              selectedSemanticId={selected}
              onPickSemantic={(id) => update((s) => appSelect(s, id, 'viewport', Date.now()))}
            />
          )}
        </section>

        <aside className="spds-panel spds-inspector" aria-label="Side panel">
          {active === 'inspector' || active === 'viewport' || active === 'explorer' ? (
            <>
              <h2>Inspector</h2>
              <p className="spds-meta">
                Chrome: {publicationChromeLabel(session.g8.chrome)}
                <br />
                Selection: {selected ?? 'none'}
                <br />
                Sync: {appSelectionSynced(session) ? 'ok' : 'drift'}
                <br />
                Source: {liveStatus}
                <br />
                Why: {session.whyLine}
              </p>
              <label className="spds-field">
                <span>
                  {session.g8.lengthEdit.spec.name} ({session.g8.lengthEdit.spec.unit})
                </span>
                <input
                  type="range"
                  min={session.g8.lengthEdit.spec.min}
                  max={session.g8.lengthEdit.spec.max}
                  step={1}
                  value={session.g8.lengthEdit.draftValue}
                  onChange={(ev) => update((s) => appPreviewLength(s, Number(ev.target.value)))}
                />
                <span>
                  {session.g8.lengthEdit.draftValue} — {session.g8.lengthEdit.statusLabel}
                </span>
              </label>
              <div className="spds-actions">
                <button type="button" onClick={() => void exactRegen()}>
                  Exact regen
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update((s) => appSelect(s, appPrimarySemanticId(), 'inspector', Date.now()))
                  }
                >
                  Select primary
                </button>
              </div>
              {session.g8.measurement ? (
                <p className="spds-meta">
                  Measure: {session.g8.measurement.quantity.toFixed(1)}{' '}
                  {session.g8.measurement.unit}
                </p>
              ) : null}
              <h3>Pattern</h3>
              <p className="spds-meta">
                {session.pattern.name} · params {JSON.stringify(session.pattern.parameters)}
              </p>
              <h3>Dependencies</h3>
              <p className="spds-meta">
                ↑ {session.deps.upstream.join(', ') || '—'}
                <br />↓ {session.deps.downstream.join(', ') || '—'}
              </p>
            </>
          ) : null}

          {active === 'pipeline' ? (
            <>
              <h2>Pipeline</h2>
              <p className="spds-meta">
                DAG {session.pipeline.dagId} · {session.pipeline.totalTimingMs}ms
              </p>
              <ul className="spds-list">
                {session.pipeline.stages.map((stage) => (
                  <li key={stage.id}>
                    <button
                      type="button"
                      onClick={() =>
                        update((s) => appSelect(s, stage.semanticOwner, 'inspector', Date.now()))
                      }
                    >
                      {stage.operator} · {stage.status} · {stage.semanticOwner}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {active === 'validation' ? (
            <>
              <h2>Validation</h2>
              <ul className="spds-list">
                {session.validation.issues.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => update((s) => appNavigateIssue(s, issue.id, Date.now()))}
                    >
                      {issue.severity}: {issue.summary}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="spds-meta">
                Focused: {session.validation.focusedSemanticId ?? 'none'}
              </p>
            </>
          ) : null}

          {active === 'history' ? (
            <>
              <h2>History</h2>
              <ul className="spds-list">
                {session.history.entries.map((e) => (
                  <li key={e.id}>
                    {e.kind}: {e.label} ({e.timestamp})
                  </li>
                ))}
              </ul>
              <p className="spds-meta">
                Compare changed: {session.compare.changedIds.join(', ')}
                <br />
                {session.restore.label}
                <br />
                {session.fork.label}
              </p>
            </>
          ) : null}

          {active === 'ai' ? (
            <>
              <h2>AI changes</h2>
              <ul className="spds-list">
                {session.aiChanges.map((c) => (
                  <li key={c.changeSetId}>
                    {c.changeSetId} · {c.disposition} · {c.commandCount} cmds · {c.attribution}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => update((s) => appApplyAiChange(s))}>
                Apply proposed
              </button>
              <p className="spds-meta">{session.whyLine}</p>
            </>
          ) : null}

          {active === 'analysis-mesh' ? (
            <>
              <h2>Analysis mesh</h2>
              <p className="spds-meta">
                {session.analysis.chromeNote}
                <br />
                Elements: {session.analysis.elementCount}
                <br />
                Indicative: {appAnalysisIndicative(session) ? 'yes' : 'no'}
              </p>
              <ul className="spds-list">
                {session.analysis.groups.map((g) => (
                  <li key={g.name}>
                    {g.role}: {g.name} → {g.semanticIds.join(', ')}
                  </li>
                ))}
              </ul>
              <ul className="spds-list">
                {session.analysis.labels.map((l) => (
                  <li key={l.entityId}>
                    {l.text} (indicative)
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
