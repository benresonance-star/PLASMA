import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, FileDiff, GitCommitHorizontal, RotateCcw, ShieldAlert } from 'lucide-react';
import type { FusionContext } from './FusionStudio.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { apiBaseUrl } from '../api-client.js';
import './fusion-revision.css';

export interface FusionRevisionLink {
  readonly loftAssemblyId: string;
  readonly loftInstanceId: string;
  readonly loftPartId: string;
  readonly loftParameter: string;
}
interface FusionRevisionProps {
  readonly fusion: FusionContext | null;
  readonly modelId: string | null;
  readonly branchId: string | null;
  readonly headHash: string | null;
  readonly buildParameterId: string;
  readonly nextValue: string;
  readonly link: FusionRevisionLink | null;
  readonly onHeadUpdated: (value: {
    readonly headHash: string;
    readonly eventId: string;
    readonly action: string;
    readonly fusion?: FusionContext;
  }) => void;
  readonly onShowGeometry: (meshes: readonly DisplayMeshInput[], description: string) => void;
  readonly onShowDetail: (svg: string | null) => void;
}
interface SourceHashes { readonly build: string; readonly loft: string }
interface WorkspaceState {
  readonly id: string;
  readonly sourceHashes: SourceHashes;
  readonly revision: number;
}
interface RevisionPreview {
  readonly status: 'coordinated-source-preview';
  readonly candidateHash: string;
  readonly geometry: {
    readonly beforeHash: string; readonly afterHash: string;
    readonly before: readonly DisplayMeshInput[]; readonly after: readonly DisplayMeshInput[];
    readonly nativeBrepValidated: false;
  };
  readonly drawing: {
    readonly before: string; readonly after: string;
    readonly beforeHash: string; readonly afterHash: string;
    readonly scale: '1:5';
  };
  readonly affectedBuildEntities: readonly string[];
  readonly affectedLoftOccurrences: readonly string[];
  readonly warning: string;
}
function object(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function revisionBody(props: FusionRevisionProps, sectionYmm: number) {
  const { fusion, modelId, branchId, headHash, buildParameterId, nextValue, link } = props;
  if (!fusion || !modelId || !branchId || !headHash || !buildParameterId || !link ||
      !nextValue.trim() || !Number.isFinite(Number(nextValue)) ||
      !Number.isFinite(sectionYmm)) {
    throw new Error('Select a versioned model, editable parameter, valid value and explicit Loft driver');
  }
  return {
    modelId, branchId, expectedHeadHash: headHash,
    expectedSourceHashes: {
      build: fusion.preview.sources.find((s) => s.system === 'build')?.sourceHash,
      loft: fusion.preview.sources.find((s) => s.system === 'loft')?.sourceHash,
    },
    buildParameterId, nextValue: Number(nextValue), loftLink: link, sectionYmm,
  };
}

/** F09 review→accept interaction. Only the source bundle changes; never claim
 * whole-building BIM publication, engineering approval or native OCC parity.
 */
export function FusionRevisionWorkbench(props: FusionRevisionProps) {
  const { fusion, modelId, branchId, headHash, link, onHeadUpdated,
    onShowDetail, onShowGeometry } = props;
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [candidate, setCandidate] = useState<RevisionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sectionY, setSectionY] = useState('0');
  const [lookupBusy, setLookupBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setCandidate(null); setError(''); setNotice(''); setWorkspace(null);
    if (!fusion || !modelId || !branchId) return;
    setLookupBusy(true);
    void (async () => {
      try {
        const response = await fetch(
          apiBaseUrl() + '/models/' + encodeURIComponent(modelId) +
          '/branches/' + encodeURIComponent(branchId) + '/objects',
        );
        if (!response.ok) return;
        const data = await response.json() as { objects?: unknown[] };
        const hashes = {
          build: fusion.preview.sources.find((s) => s.system === 'build')?.sourceHash,
          loft: fusion.preview.sources.find((s) => s.system === 'loft')?.sourceHash,
        };
        const found = data.objects?.map(object).find((obj) => {
          if (obj?.['semanticType'] !== 'plasma.fusion.source-workspace') return false;
          const meta = object(obj['metadata']);
          const saved = object(meta?.['sourceHashes']);
          return saved?.['build'] === hashes.build && saved?.['loft'] === hashes.loft;
        });
        if (!active || !found) return;
        const meta = object(found['metadata']);
        const saved = object(meta?.['sourceHashes']);
        if (typeof found['id'] === 'string' && typeof meta?.['revision'] === 'number' &&
            typeof saved?.['build'] === 'string' && typeof saved['loft'] === 'string') {
          setWorkspace({
            id: found['id'], revision: meta['revision'],
            sourceHashes: { build: saved['build'], loft: saved['loft'] },
          });
        }
      } catch {
        // The operator can still attempt to save sources explicitly.
      } finally { if (active) setLookupBusy(false); }
    })();
    return () => { active = false; };
  }, [fusion, modelId, branchId]);

  async function save(): Promise<void> {
    if (!fusion || !modelId || !branchId || !headHash) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(apiBaseUrl() + '/imports/fusion/workspaces', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelId, branchId, expectedHeadHash: headHash,
          buildProject: fusion.buildProject, loftProject: fusion.loftProject,
          bindings: fusion.bindings,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(String(object(payload)?.['summary'] ?? 'Unable to save workspace'));
      const data = payload as {
        workspaceId: string; sourceHashes: SourceHashes; headHash: string; eventId: string;
        revision: number;
      };
      setWorkspace({ id: data.workspaceId, sourceHashes: data.sourceHashes, revision: data.revision });
      setNotice('Linked sources saved as a versioned Plasma source workspace.');
      onHeadUpdated({
        headHash: data.headHash, eventId: data.eventId, action: 'Saved Build / Loft source workspace',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source save rejected');
    } finally { setBusy(false); }
  }
  async function review(): Promise<void> {
    if (!workspace) return;
    setBusy(true); setError(''); setNotice(''); setCandidate(null);
    onShowDetail(null);
    try {
      const body = revisionBody(props, Number(sectionY));
      const response = await fetch(
        apiBaseUrl() + '/imports/fusion/workspaces/' +
        encodeURIComponent(workspace.id) + '/revision-preview', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(String(object(payload)?.['summary'] ?? 'Revision review rejected'));
      const data = payload as RevisionPreview;
      setCandidate(data);
      setNotice('Geometry and 1:5 section regenerated. Proposed only; no version update.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision could not be evaluated');
    } finally { setBusy(false); }
  }
  async function accept(): Promise<void> {
    if (!workspace || !candidate) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = revisionBody(props, Number(sectionY));
      const response = await fetch(
        apiBaseUrl() + '/imports/fusion/workspaces/' +
        encodeURIComponent(workspace.id) + '/revision-accept', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, candidateHash: candidate.candidateHash }),
        });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(String(object(payload)?.['summary'] ?? 'Acceptance rejected'));
      const data = payload as {
        headHash: string; eventId: string; revision: number; sources: {
          buildProject: unknown; loftProject: unknown; bindings: FusionContext['bindings'];
        }; preview: FusionContext['preview'];
      };
      onHeadUpdated({
        headHash: data.headHash, eventId: data.eventId,
        action: 'Accepted source revision ' + data.revision,
        fusion: {
          buildProject: data.sources.buildProject,
          loftProject: data.sources.loftProject,
          bindings: data.sources.bindings,
          preview: data.preview,
        },
      });
      onShowGeometry(candidate.geometry.after, 'Accepted source-derived exact-adapter mesh; native OCC unverified');
      onShowDetail(null);
      setNotice('Source revision ' + data.revision + ' accepted at a new Plasma branch head.');
      setCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acceptance rejected; the existing revision remains intact');
    } finally { setBusy(false); }
  }
  function discard(): void {
    setCandidate(null);
    onShowDetail(null);
    setNotice('Proposed revision discarded without changing the branch head.');
  }
  const enabled = Boolean(workspace && fusion && headHash && link && props.buildParameterId &&
    props.nextValue.trim() && Number.isFinite(Number(props.nextValue)) && !busy);
  return (
    <section className="fusion-revision" aria-label="Controlled parametric source revision" data-testid="fusion-revision-workbench">
      <div className="fusion-revision-heading">
        <GitCommitHorizontal size={16}/>
        <div><strong>F09 / COORDINATED REVISION</strong><span>One design change · three representations · one review</span></div>
      </div>
      <div className="fusion-revision-state" data-testid="fusion-revision-state">
        {workspace ? <><CheckCircle2 size={14}/> Stored source revision {workspace.revision} · linked</>
          : <><ShieldAlert size={14}/> {lookupBusy ? 'Checking workspace…' : 'Sources not yet versioned in Plasma'}</>}
      </div>
      {!workspace && <button className="fusion-revision-action" type="button" onClick={() => void save()}
        disabled={busy || lookupBusy || !fusion || !headHash || !branchId || !modelId || fusion.bindings.length===0}
        data-testid="fusion-save-workspace">Save linked Build / Loft sources to Plasma</button>}
      {workspace && <>
        <label className="fusion-revision-field">Section cut Y (mm)
          <input value={sectionY} type="number" onChange={e => { setSectionY(e.target.value);setCandidate(null); }}
            aria-label="Revision section plane Y"/>
        </label>
        <button className="fusion-revision-action" type="button" data-testid="fusion-revision-review"
          disabled={!enabled} onClick={() => void review()}>
          <ArrowLeftRight size={14}/> {busy ? 'Checking…' : 'Review coordinated design change'}
        </button>
      </>}
      {error && <p className="fusion-revision-error" role="alert">{error}</p>}
      {notice && <p className="fusion-revision-notice" role="status">{notice}</p>}
      {candidate && <div className="fusion-revision-candidate" data-testid="fusion-revision-candidate">
        <div className="fusion-revision-candidate-status">CANDIDATE · NOT COMMITTED</div>
        <div className="fusion-revision-metrics">
          <div><small>Build entities</small><strong>{candidate.affectedBuildEntities.length}</strong></div>
          <div><small>Loft occurrences</small><strong>{candidate.affectedLoftOccurrences.length}</strong></div>
          <div><small>Geometry / section</small><strong>CHANGED</strong></div>
        </div>
        <div className="fusion-revision-links">
          <button type="button" onClick={() => onShowGeometry(candidate.geometry.before,
            'Previous source geometry, exact adapter only')}>Before 3D</button>
          <button type="button" onClick={() => onShowGeometry(candidate.geometry.after,
            'Proposed source geometry, exact adapter only')}>Proposed 3D</button>
          <button type="button" onClick={() => onShowDetail(candidate.drawing.before)}>Before section</button>
          <button type="button" onClick={() => onShowDetail(candidate.drawing.after)}>Proposed section</button>
        </div>
        <div className="fusion-revision-sheets">
          <img alt="Existing non-issued source detail" src={'data:image/svg+xml;charset=utf-8,'+
            encodeURIComponent(candidate.drawing.before)}/>
          <img alt="Proposed non-issued source detail" src={'data:image/svg+xml;charset=utf-8,'+
            encodeURIComponent(candidate.drawing.after)}/>
        </div>
        <p className="fusion-revision-warning">Exact-adapter mesh and 1:5 source study only. No issued drawing, certified detail or native OCC parity.</p>
        <div className="fusion-revision-decision">
          <button type="button" className="reject" onClick={discard}><RotateCcw size={14}/> Discard</button>
          <button type="button" className="accept" data-testid="fusion-revision-accept"
            disabled={busy} onClick={() => void accept()}><FileDiff size={14}/> Accept source revision</button>
        </div>
      </div>}
    </section>
  );
}
