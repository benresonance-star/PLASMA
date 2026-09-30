import { useEffect, useRef, useState } from 'react';
import type { Wall, WallOperation, WallOutput } from '@spds/wall-core';
import { createModel } from '../api-client.js';
import { previewWall, wallRequest, type WallPreview, type WallScope } from '../wall-client.js';
import './wall-workbench.css';

// Browser templates are proposals; server validation and typed operations own acceptance.
function template(polyline: boolean): Wall {
  const id = `wall:${crypto.randomUUID()}`;
  return {
    id,
    kind: 'architecture.wall',
    schemaVersion: '0.1.0',
    createdRevision: 'unaccepted',
    featureRevision: 1,
    systemRef: { id: 'wall-system:two-layer-study', version: '0.1.0' },
    coordinateFrame: 'WORLD_XY_Z_UP',
    units: 'mm',
    segments: [
      { id: `${id}:segment:1`, start: [0, 0], end: [4000, 0] },
      ...(polyline
        ? [
            {
              id: `${id}:segment:2`,
              start: [4000, 0] as [number, number],
              end: [4000, 2400] as [number, number],
            },
          ]
        : []),
    ],
    baseElevationMm: 0,
    heightMm: 2700,
    lateralOffsetMm: 0,
    referenceLine: 'centre',
    orientation: 1,
    layers: [
      {
        id: `${id}:layer:core`,
        materialRef: 'material:study-core@0.1.0',
        function: 'structure',
        thicknessMm: 140,
        bottomMm: 0,
        topMm: 2700,
      },
      {
        id: `${id}:layer:finish`,
        materialRef: 'material:study-finish@0.1.0',
        function: 'finish',
        thicknessMm: 20,
        bottomMm: 0,
        topMm: 2700,
      },
    ],
    openings: [],
    sourceEvidenceRefs: [],
  };
}
type Fields = {
  length: string;
  height: string;
  base: string;
  offset: string;
  core: string;
  finish: string;
  reference: Wall['referenceLine'];
  width: string;
  openingHeight: string;
  sill: string;
  placement: 'centred' | 'start' | 'end';
  jamb: string;
};
function fieldsFor(wall: Wall): Fields {
  const s = wall.segments.at(-1)!,
    o = wall.openings[0];
  return {
    length: String(Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1])),
    height: String(wall.heightMm),
    base: String(wall.baseElevationMm),
    offset: String(wall.lateralOffsetMm),
    core: String(wall.layers[0]!.thicknessMm),
    finish: String(wall.layers[1]!.thicknessMm),
    reference: wall.referenceLine,
    width: String(o?.widthMm ?? 1200),
    openingHeight: String(o?.heightMm ?? 1200),
    sill: String(o?.sillMm ?? 900),
    placement: o?.placement.kind === 'fixed-jamb' ? o.placement.anchor : 'centred',
    jamb: String(o?.placement.kind === 'fixed-jamb' ? o.placement.distanceMm : 600),
  };
}
function WallDrawing({ wall, output }: { wall: Wall; output: WallOutput }) {
  const pts = output.plan.flatMap((p) => p.points),
    xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const xmin = Math.min(...xs) - 400,
    ymin = Math.min(...ys) - 500;
  const width = Math.max(...xs) - xmin + 400,
    height = Math.max(1600, Math.max(...ys) - ymin + 500);
  const last =
    output.elevation.find((s) => s.segmentId === wall.openings[0]?.segmentId) ??
    output.elevation.at(-1)!;
  return (
    <div className="wall-drawings">
      <section>
        <div className="wall-view-label">
          Plan <span>millimetres · reference path dashed</span>
        </div>
        <svg
          role="img"
          aria-label="Layered wall plan"
          viewBox={`${xmin} ${ymin} ${width} ${height}`}
        >
          {output.plan.map((p, i) => (
            <polygon
              key={`${p.layerId}/${p.segmentId}`}
              points={p.points
                .map((x) => `${x[0]},${-x[1] + Math.min(...ys) + Math.max(...ys)}`)
                .join(' ')}
              fill={i % wall.layers.length === 0 ? '#bcc9c4' : '#c98752'}
              stroke="#536d63"
              strokeWidth="8"
            />
          ))}
          {wall.segments.map((s) => (
            <line
              key={s.id}
              x1={s.start[0]}
              y1={-s.start[1] + Math.min(...ys) + Math.max(...ys)}
              x2={s.end[0]}
              y2={-s.end[1] + Math.min(...ys) + Math.max(...ys)}
              stroke="#477a6d"
              strokeDasharray="40 30"
              strokeWidth="10"
            />
          ))}
        </svg>
      </section>
      <section>
        <div className="wall-view-label">
          Elevation{' '}
          <span>
            {wall.openings.length ? 'host segment' : 'last segment'} · rectangular opening
          </span>
        </div>
        <svg
          role="img"
          aria-label="Wall elevation with hosted opening"
          viewBox={`-200 -200 ${last.lengthMm + 400} ${last.heightMm + 700}`}
        >
          <rect
            x="0"
            y="0"
            width={last.lengthMm}
            height={last.heightMm}
            fill="#bcc9c4"
            stroke="#536d63"
            strokeWidth="10"
          />
          {last.opening && (
            <rect
              x={last.opening.leftMm}
              y={last.heightMm - last.opening.sillMm - last.opening.heightMm}
              width={last.opening.widthMm}
              height={last.opening.heightMm}
              fill="#f4f6f1"
              stroke="#477a6d"
              strokeWidth="12"
            />
          )}
          <text
            x={last.lengthMm / 2}
            y={last.heightMm + 300}
            textAnchor="middle"
            fontSize="140"
            fill="#536d63"
          >
            {last.lengthMm.toFixed(0)} mm
          </text>
        </svg>
      </section>
    </div>
  );
}

export function WallWorkbench() {
  const [scope, setScope] = useState<WallScope | null>(null),
    [walls, setWalls] = useState<Wall[]>([]),
    [selected, setSelected] = useState('');
  const [outputs, setOutputs] = useState<WallOutput[]>([]),
    [pending, setPending] = useState<WallPreview | null>(null);
  const [fields, setFields] = useState<Fields | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const initialized = useRef(false);
  const accepted = walls.find((w) => w.id === selected),
    wall = pending?.wall ?? accepted;
  const output = pending?.output ?? outputs.find((o) => o.wallId === selected);
  async function reload(s: WallScope) {
    const result = await wallRequest<{ headHash: string; walls: Wall[]; outputs: WallOutput[] }>(
      `/walls?modelId=${encodeURIComponent(s.modelId)}&branchId=${encodeURIComponent(s.branchId)}`,
    );
    const next = { ...s, headHash: result.headHash };
    setScope(next);
    setWalls(result.walls);
    setOutputs(result.outputs);
    const choice = result.walls.find((w) => w.id === selected) ?? result.walls[0];
    if (choice) {
      setSelected(choice.id);
      setFields(fieldsFor(choice));
    }
    localStorage.setItem('plasma-wall-scope', JSON.stringify(next));
    setMessage('Accepted study restored. Select a wall to edit.');
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem('plasma-wall-scope');
      if (saved) {
        const parsed = JSON.parse(saved) as WallScope;
        void reload(parsed).catch((e) =>
          setError(`${e.message}. Reconnect the API or start a new study.`),
        );
      }
    } catch {
      setError('Saved study reference is unreadable. Start a new study.');
    }
    // Restore the accepted server state once; local storage holds a reference, not model authority.
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }
  async function stage(operation: WallOperation, active = scope) {
    if (!active) throw new Error('Start a study first.');
    if (pending)
      await wallRequest(`/walls/previews/${encodeURIComponent(pending.transactionId)}/discard`, {
        modelId: active.modelId,
        branchId: active.branchId,
      });
    setPending(null);
    const result = await previewWall(active, operation);
    setPending(result);
    setFields(fieldsFor(result.wall));
    setMessage('Candidate preview. The accepted wall has not changed.');
  }
  async function start() {
    if (pending && scope)
      await wallRequest(`/walls/previews/${encodeURIComponent(pending.transactionId)}/discard`, {
        modelId: scope.modelId,
        branchId: scope.branchId,
      });
    const model = await createModel('Plasma wall study');
    const s = { modelId: model.model.modelId, branchId: model.branchId, headHash: model.headHash };
    setScope(s);
    setPending(null);
    setWalls([]);
    setOutputs([]);
    setSelected('');
    localStorage.setItem('plasma-wall-scope', JSON.stringify(s));
    setMessage('Study created. Choose a wall path to preview.');
  }
  const numberField = (key: keyof Fields, label: string) => (
    <label key={key}>
      {label}
      <div className="wall-number">
        <input
          aria-label={label}
          type="number"
          step="1"
          disabled={busy || !!pending}
          value={String(fields?.[key] ?? '')}
          onChange={(e) => setFields((f) => (f ? { ...f, [key]: e.target.value } : f))}
        />
        <span>mm</span>
      </div>
    </label>
  );
  return (
    <main className="wall-workbench">
      <header className="wall-header">
        <a href="/">PLASMA</a>
        <span>
          Wall workbench <b>Stage 1</b>
        </span>
        <a href="https://plasma-api.vercel.app">Atlas ↗</a>
      </header>
      <div className="wall-intro">
        <div>
          <p className="wall-eyebrow">PATH → PARAMETERS → CANDIDATE → ACCEPT</p>
          <h1>Construction intent, kept editable.</h1>
          <p>
            A two-layer wall study. Dimensions, hosted placement and quantities share one feature
            revision.
          </p>
        </div>
        <button disabled={busy} onClick={() => void run(start)}>
          New study
        </button>
      </div>
      <div className="wall-status" role="status">
        {pending ? 'Preview · not accepted' : scope ? 'Accepted state' : 'No active study'}{' '}
        <span>{message || 'Start a study, then create a wall.'}</span>
      </div>
      {error && (
        <div className="wall-error" role="alert">
          {error}{' '}
          {scope && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setPending(null);
                  await reload(scope);
                  setMessage('Current head reloaded. Preview your change again.');
                })
              }
            >
              Reload accepted state
            </button>
          )}
        </div>
      )}
      <div className="wall-layout">
        <aside className="wall-panel">
          <h2>Study</h2>
          <div className="wall-path-buttons">
            <button
              disabled={!scope || busy || !!pending}
              onClick={() => void run(() => stage({ type: 'CreateWall', wall: template(false) }))}
            >
              + Straight wall
            </button>
            <button
              disabled={!scope || busy || !!pending}
              onClick={() => void run(() => stage({ type: 'CreateWall', wall: template(true) }))}
            >
              + Polyline wall
            </button>
          </div>
          <h3>
            Accepted walls <span>{walls.length}</span>
          </h3>
          {walls.length === 0 && <p className="wall-muted">No accepted walls yet.</p>}
          {walls.map((w, i) => (
            <button
              className={`wall-list-item ${selected === w.id ? 'selected' : ''}`}
              disabled={busy || !!pending}
              key={w.id}
              onClick={() => {
                setSelected(w.id);
                setFields(fieldsFor(w));
              }}
            >
              {`Wall ${i + 1}`}
              <span>
                {w.segments.length} segment{w.segments.length > 1 ? 's' : ''} · revision{' '}
                {w.featureRevision}
              </span>
            </button>
          ))}
          <div className="wall-pin">
            <h3>System pin</h3>
            <p>Two-layer study · 0.1.0</p>
            <small>
              Experimental material definitions. No fire, acoustic or structural performance claim.
            </small>
          </div>
        </aside>
        <section className="wall-model">
          {wall && output ? (
            <>
              <div className="wall-model-heading">
                <h2>{pending ? 'Candidate wall' : 'Accepted wall'}</h2>
                <span>
                  {wall.layers.reduce((s, l) => s + l.thicknessMm, 0)} mm total · r
                  {wall.featureRevision}
                </span>
              </div>
              <WallDrawing wall={wall} output={output} />
              <div className="wall-quantity">
                <h3>
                  Layer quantities <span>Provisional · m³</span>
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Gross</th>
                      <th>Opening</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.quantities.map((q, i) => (
                      <tr key={q.layerId}>
                        <td>{i === 0 ? 'Core' : 'Finish'}</td>
                        <td>{q.grossVolumeM3.toFixed(4)}</td>
                        <td>−{q.openingDeductionM3.toFixed(4)}</td>
                        <td>{q.netVolumeM3.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>{output.conventions}</p>
              </div>
              <div className="wall-gates">
                <h3>Issue gates · closed</h3>
                {output.unresolved.map((x) => (
                  <p key={x}>○ {x}</p>
                ))}
              </div>
            </>
          ) : (
            <div className="wall-empty">
              <span>01</span>
              <h2>Draw the first wall.</h2>
              <p>
                Start a study and choose a straight or polyline path. Preview before acceptance.
              </p>
            </div>
          )}
        </section>
        <aside className="wall-panel wall-inspector">
          <h2>Parameters</h2>
          {wall && fields ? (
            <>
              <div className="wall-field-grid">
                {numberField('length', 'Last segment length')}
                {numberField('height', 'Height')}
                {numberField('base', 'Base elevation')}
                {numberField('offset', 'Lateral offset')}
                {numberField('core', 'Core thickness')}
                {numberField('finish', 'Finish thickness')}
              </div>
              <label>
                Reference line
                <select
                  aria-label="Reference line"
                  disabled={busy || !!pending}
                  value={fields.reference}
                  onChange={(e) =>
                    setFields({ ...fields, reference: e.target.value as Wall['referenceLine'] })
                  }
                >
                  <option value="layer-start">First layer face</option>
                  <option value="centre">Overall centre</option>
                  <option value="layer-end">Last layer face</option>
                </select>
              </label>
              <button
                className="wall-primary"
                disabled={busy || !!pending || !accepted}
                onClick={() =>
                  void run(() =>
                    stage({
                      type: 'SetWallParameters',
                      wallId: wall.id,
                      parameters: {
                        terminalLengthMm: Number(fields.length),
                        heightMm: Number(fields.height),
                        baseElevationMm: Number(fields.base),
                        lateralOffsetMm: Number(fields.offset),
                        referenceLine: fields.reference,
                        layers: [
                          { id: wall.layers[0]!.id, thicknessMm: Number(fields.core) },
                          { id: wall.layers[1]!.id, thicknessMm: Number(fields.finish) },
                        ],
                      },
                    }),
                  )
                }
              >
                Preview parameters
              </button>
              <div className="wall-path-buttons">
                <button
                  disabled={busy || !!pending || !accepted}
                  onClick={() => void run(() => stage({ type: 'ReverseWall', wallId: wall.id }))}
                >
                  Reverse path
                </button>
                <button
                  disabled={busy || !!pending || !accepted}
                  onClick={() =>
                    void run(() => stage({ type: 'MoveWall', wallId: wall.id, delta: [0, 500] }))
                  }
                >
                  Move +500 Y
                </button>
              </div>
              <h3>Hosted opening</h3>
              <div className="wall-field-grid">
                {numberField('width', 'Opening width')}
                {numberField('openingHeight', 'Opening height')}
                {numberField('sill', 'Sill height')}
                {numberField('jamb', 'Jamb distance')}
              </div>
              <label>
                Placement
                <select
                  aria-label="Placement"
                  disabled={busy || !!pending}
                  value={fields.placement}
                  onChange={(e) =>
                    setFields({ ...fields, placement: e.target.value as Fields['placement'] })
                  }
                >
                  <option value="centred">Centred</option>
                  <option value="start">Fixed jamb · start</option>
                  <option value="end">Fixed jamb · end</option>
                </select>
              </label>
              <button
                disabled={busy || !!pending || !accepted}
                onClick={() =>
                  void run(() =>
                    stage({
                      type: 'HostOpening',
                      wallId: wall.id,
                      opening: {
                        id: wall.openings[0]?.id ?? `${wall.id}:opening:1`,
                        hostId: wall.id,
                        segmentId: wall.openings[0]?.segmentId ?? wall.segments.at(-1)!.id,
                        widthMm: Number(fields.width),
                        heightMm: Number(fields.openingHeight),
                        sillMm: Number(fields.sill),
                        placement:
                          fields.placement === 'centred'
                            ? { kind: 'centred' }
                            : {
                                kind: 'fixed-jamb',
                                anchor: fields.placement,
                                distanceMm: Number(fields.jamb),
                              },
                      },
                    }),
                  )
                }
              >
                {wall.openings.length ? 'Preview opening edit' : 'Preview opening'}
              </button>
              {!!wall.openings.length && (
                <button
                  disabled={busy || !!pending}
                  onClick={() =>
                    void run(() =>
                      stage({
                        type: 'RemoveOpening',
                        wallId: wall.id,
                        openingId: wall.openings[0]!.id,
                      }),
                    )
                  }
                >
                  Remove opening
                </button>
              )}
            </>
          ) : (
            <p className="wall-muted">Select a wall to inspect its parameters.</p>
          )}
        </aside>
      </div>
      {pending && scope && (
        <footer className="wall-review">
          <div>
            <b>Review candidate</b>
            <span>
              {pending.affectedIds.length} affected identities · analytical preview · issue gates
              closed
            </span>
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await wallRequest(
                  `/walls/previews/${encodeURIComponent(pending.transactionId)}/discard`,
                  { modelId: scope.modelId, branchId: scope.branchId },
                );
                setPending(null);
                if (accepted) setFields(fieldsFor(accepted));
                setMessage('Candidate discarded. Accepted state unchanged.');
              })
            }
          >
            Discard
          </button>
          <button
            className="wall-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await wallRequest<{
                  headHash: string;
                  wall: Wall;
                  output: WallOutput;
                }>(`/walls/previews/${encodeURIComponent(pending.transactionId)}/commit`, {
                  modelId: scope.modelId,
                  branchId: scope.branchId,
                });
                const next = { ...scope, headHash: result.headHash };
                setScope(next);
                setPending(null);
                setSelected(result.wall.id);
                setFields(fieldsFor(result.wall));
                setWalls((xs) => [...xs.filter((x) => x.id !== result.wall.id), result.wall]);
                setOutputs((xs) => [
                  ...xs.filter((x) => x.wallId !== result.wall.id),
                  result.output,
                ]);
                localStorage.setItem('plasma-wall-scope', JSON.stringify(next));
                setMessage('Feature accepted atomically. Exact and issue gates remain closed.');
              })
            }
          >
            Accept feature
          </button>
        </footer>
      )}
      <div className="wall-footnote">
        {scope
          ? `Branch ${scope.branchId} · head ${scope.headHash.slice(0, 12)}`
          : 'Requires the Plasma API.'}{' '}
        · Server persistence follows the configured version store.
      </div>
    </main>
  );
}
