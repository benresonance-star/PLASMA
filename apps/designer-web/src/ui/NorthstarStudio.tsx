import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Box, FileClock, GitBranch, Image as ImageIcon, Link2, MapPinned, Network, ShieldAlert, Upload, X } from 'lucide-react';
import type { FusionContext } from './FusionStudio.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import type { PublicationChrome } from '../viewport.js';
import { ViewportCanvas } from './ViewportCanvas.js';
import { apiBaseUrl } from '../api-client.js';
import { ContinuityInspector } from './ContinuityInspector.js';
import './northstar.css';

type Focus = 'place' | 'design' | 'reason';
type LocalMedia = { readonly file: File; readonly url: string };
interface NorthstarProps {
  readonly onClose: () => void;
  readonly onOpenFusion: () => void;
  readonly fusion: FusionContext | null;
  readonly selectedSemanticId: string | null;
  readonly onSelectSemantic: (id: string) => void;
  readonly meshes: readonly DisplayMeshInput[];
  readonly serviceMeshes: readonly DisplayMeshInput[];
  readonly chrome?: PublicationChrome;
  readonly qaSiteIllustration?: string;
  readonly modelId: string | null;
  readonly branchId: string | null;
  readonly headHash: string | null;
  readonly sessionEvents: readonly { readonly id: string; readonly kind: string; readonly label: string; readonly atMs: number }[];
}
interface ProposedImpact {
  readonly status: string;
  readonly committed: boolean;
  readonly geometryCompiled: boolean;
  readonly parameter: { readonly id: string; readonly before: number; readonly after: number; readonly unit: string };
  readonly loftParameter?: { readonly partId: string; readonly parameter: string; readonly before: number; readonly after: number };
  readonly impactedBuildEntities: readonly string[];
  readonly impactedLoftOccurrences: readonly string[];
  readonly unresolved: readonly string[];
}
interface LinkOption {
  readonly key: string;
  readonly label: string;
  readonly loftAssemblyId: string;
  readonly loftInstanceId: string;
  readonly loftPartId: string;
  readonly loftParameter: string;
}
function short(id: string | null | undefined): string {
  return id ? id.length > 24 ? id.slice(0, 10) + '…' + id.slice(-8) : id : 'not available';
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function NorthstarStudio(props: NorthstarProps) {
  const {
    onClose, onOpenFusion, fusion, selectedSemanticId, onSelectSemantic,
    meshes, serviceMeshes, chrome, modelId, branchId, headHash, sessionEvents, qaSiteIllustration,
  } = props;
  const [focus, setFocus] = useState<Focus>(() => {
    if (typeof window === 'undefined' || !import.meta.env.DEV) return 'design';
    const stage = new URLSearchParams(window.location.search).get('stage');
    return stage === 'F06' ? 'place' : stage === 'F07' || stage === 'F08' ? 'reason' : 'design';
  });
  const [media, setMedia] = useState<LocalMedia | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [parameterId, setParameterId] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [linkKey, setLinkKey] = useState('');
  const [impact, setImpact] = useState<ProposedImpact | null>(null);
  const [impactError, setImpactError] = useState('');
  const [running, setRunning] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [geometryMeshes, setGeometryMeshes] = useState<DisplayMeshInput[]>([]);
  const [geometryInfo, setGeometryInfo] = useState('');
  const [geometryError, setGeometryError] = useState('');
  const [geometryBusy, setGeometryBusy] = useState(false);
  const qaGeomTriggered = useRef(false);
  const [detailSvg, setDetailSvg] = useState<string|null>(null);
  const [siteFit, setSiteFit] = useState<{readonly rmsResidualMm:number;readonly pointCount:number}|null>(null);
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url); }, [media]);
  useEffect(() => { setImpact(null); setImpactError(''); setParameterId(''); setLinkKey(''); setGeometryMeshes([]); setGeometryInfo(''); }, [fusion]);
  useEffect(() => { setGeometryMeshes([]); setGeometryInfo(''); }, [headHash]);

  const preview = fusion?.preview;
  const selection = preview?.objects.find((o) => o.id === selectedSemanticId);
  const edges = useMemo(() =>
    (preview?.relationships ?? []).filter((r) => r.from === selectedSemanticId || r.to === selectedSemanticId).slice(0, 12),
  [preview, selectedSemanticId]);
  const selectedParameter = preview?.parameters.find((p) => p.id === parameterId);
  const selectedLoftOccurrence = preview?.objects.find((o) => o.id === selectedSemanticId && o.semanticType === 'geometry.loft.occurrence');
  const canPreviewGeometry = Boolean(fusion && selectedLoftOccurrence && preview?.bindings.some((b) => b.loftOccurrenceId === selectedLoftOccurrence.id) && modelId && branchId && headHash && !geometryBusy);
  const linkOptions = useMemo((): LinkOption[] => {
    if (!preview || !selectedParameter) return [];
    const options: LinkOption[] = [];
    for (const binding of preview.bindings) {
      if (!selectedParameter.affects.includes(binding.buildEntityId)) continue;
      const occurrence = preview.objects.find((o) => o.id === binding.loftOccurrenceId);
      const partId = occurrence?.metadata?.['sourcePartId'];
      const assemblyId = occurrence?.metadata?.['sourceAssemblyId'];
      const instanceId = occurrence?.metadata?.['sourceInstanceId'];
      if (typeof partId !== 'string' || typeof assemblyId !== 'string' || typeof instanceId !== 'string') continue;
      const part = preview.objects.find((o) =>
        o.semanticType === 'geometry.loft.part' && o.metadata?.['sourcePartId'] === partId);
      const parameters = object(part?.metadata?.['rawParameters']);
      if (!parameters) continue;
      for (const [key, value] of Object.entries(parameters)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        options.push({
          key: JSON.stringify([assemblyId, instanceId, partId, key]),
          label: partId + '.' + key + ' — ' + value + ' (source mm)',
          loftAssemblyId: assemblyId,
          loftInstanceId: instanceId,
          loftPartId: partId,
          loftParameter: key,
        });
      }
    }
    return options;
  }, [preview, selectedParameter]);
  const events = useMemo(() => [...sessionEvents].sort((a,b) => b.atMs - a.atMs).slice(0,8), [sessionEvents]);

  async function addMedia(file: File | undefined) {
    if (!file) return;
    setMediaError('');
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setMediaError('Choose a local photograph or video; 3D scan registration is not yet supported.');
      return;
    }
    if (file.size > 120_000_000) {
      setMediaError('The local preview limit is 120 MB.');
      return;
    }
    setMedia({ file, url: URL.createObjectURL(file) });
  }
  async function proposeChange() {
    if (!fusion || !selectedParameter || !modelId || !branchId || !headHash) return;
    if (!draftValue.trim() || !Number.isFinite(Number(draftValue))) {
      setImpactError('Enter a finite numeric parameter value.');
      return;
    }
    setRunning(true); setImpactError(''); setImpact(null);
    const link = linkOptions.find((x) => x.key === linkKey);
    try {
      const response = await fetch(apiBaseUrl() + '/imports/fusion/changeset-preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          buildProject: fusion.buildProject, loftProject: fusion.loftProject,
          bindings: fusion.bindings,
          expectedSourceHashes: {
            build: fusion.preview.sources.find((s) => s.system === 'build')?.sourceHash,
            loft: fusion.preview.sources.find((s) => s.system === 'loft')?.sourceHash,
          },
          modelId, branchId, expectedHeadHash: headHash,
          buildParameterId: selectedParameter.id,
          nextValue: Number(draftValue),
          ...(link ? { loftLink: {
            loftAssemblyId: link.loftAssemblyId,
            loftInstanceId: link.loftInstanceId,
            loftPartId: link.loftPartId,
            loftParameter: link.loftParameter,
          } } : {}),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(String(object(data)?.['summary'] ?? object(data)?.['failureCode'] ?? 'Proposal rejected'));
      }
      setImpact(data as ProposedImpact);
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Change preview failed');
    } finally {
      setRunning(false);
    }
  }
  const canPropose = Boolean(fusion && modelId && branchId && headHash && selectedParameter && !running);
  async function previewLoftGeometry() {
    if (!fusion || !selectedLoftOccurrence || !modelId || !branchId || !headHash) return;
    setGeometryBusy(true); setGeometryError(''); setGeometryMeshes([]); setGeometryInfo('');
    try {
      const response = await fetch(apiBaseUrl() + '/imports/fusion/geometry-preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          buildProject: fusion.buildProject, loftProject: fusion.loftProject,
          bindings: fusion.bindings, loftOccurrenceId: selectedLoftOccurrence.id,
          expectedSourceHashes: {
            build: fusion.preview.sources.find((s) => s.system === 'build')?.sourceHash,
            loft: fusion.preview.sources.find((s) => s.system === 'loft')?.sourceHash,
          },
          modelId, branchId, expectedHeadHash: headHash,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(String(object(data)?.['summary'] ?? object(data)?.['failureCode'] ?? 'Unsupported Loft solid'));
      const output = data as { readonly meshes: readonly DisplayMeshInput[]; readonly kernel: string; readonly nativeBrep: boolean };
      setGeometryMeshes([...output.meshes]);
      setGeometryInfo(output.kernel + ' mesh · native B-rep not verified · candidate only');
    } catch (err) {
      setGeometryError(err instanceof Error ? err.message : 'Geometry preview failed');
    } finally { setGeometryBusy(false); }
  }
  useEffect(() => {
    if(typeof window==='undefined'||!import.meta.env.DEV||
      new URLSearchParams(window.location.search).get('northstar-qa')!=='1'||
      new URLSearchParams(window.location.search).get('stage')!=='F03'||
      qaGeomTriggered.current||!canPreviewGeometry)return;
    qaGeomTriggered.current=true;
    void previewLoftGeometry();
  }, [canPreviewGeometry, fusion, selectedSemanticId, headHash]);

  return (
    <section className="northstar" data-focus={focus} aria-label="Plasma Northstar spatial studio">
      <div className="northstar-toolbar">
        <div className="northstar-heading">
          <span className="northstar-serial">PL / SPATIAL STUDIO / 02</span>
          <h2>Northstar <span>— a grounded design workspace</span></h2>
        </div>
        <div className="northstar-navigation" aria-label="Focus surface">
          {(['place','design','reason'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={focus === mode}
              className={focus === mode ? 'selected' : ''}
              onClick={() => setFocus(mode)}>{mode}</button>
          ))}
        </div>
        <div className="northstar-actions">
          <button type="button" onClick={onOpenFusion}><Link2 size={14}/> {fusion ? 'Sources linked' : 'Connect sources'}</button>
          <button type="button" aria-label="Return to standard Plasma designer" onClick={onClose}><X size={16}/></button>
        </div>
      </div>

      <div className="northstar-workspaces">
        <section className="northstar-pane northstar-place" aria-label="Place observation">
          <header>
            <div><span className="northstar-index">01 / OBSERVE</span><h3><MapPinned size={17}/> Place</h3></div>
            <span className="northstar-signal pending">{siteFit ? "LOCAL FIT · UNVERIFIED" : "UNREGISTERED"}</span>
          </header>
          <div className="northstar-place-media">
            {media ? (
              <>
                {media.file.type.startsWith('video/')
                  ? <video src={media.url} controls preload="metadata" aria-label="Site capture video"/>
                  : <img src={media.url} alt={'Local site observation: ' + media.file.name}/>}
                <div className="northstar-image-label">SOURCE CAPTURE / LOCAL DEVICE</div>
              </>
            ) : qaSiteIllustration ? (
              <><img src={qaSiteIllustration} alt="Synthetic site diagram for visual QA — not an observed site"/>
                <div className="northstar-image-label">SYNTHETIC SITE ILLUSTRATION · NOT PHOTOGRAPHY</div></>
            ) : (
              <div className="northstar-empty-media">
                <ImageIcon size={32} strokeWidth={1.1}/>
                <strong>Begin with the actual site</strong>
                <p>Add a photograph or video to view observed conditions beside the live model.</p>
              </div>
            )}
          </div>
          <div className="northstar-place-details">
            <div className="northstar-meta"><span>Capture</span><strong>{media?.file.name ?? (qaSiteIllustration ? "QA illustration · not captured" : "No capture loaded")}</strong></div>
            <div className="northstar-meta"><span>Recorded</span><strong>{media ? new Date(media.file.lastModified).toLocaleString() : '—'}</strong></div>
            <div className="northstar-meta"><span>Registration</span><strong>{siteFit ? `Estimated local fit · RMS ${siteFit.rmsResidualMm.toFixed(1)} mm · ${siteFit.pointCount} ties` : "Not surveyed or aligned"}</strong></div>
          </div>
          <label className="northstar-upload">
            <Upload size={15}/> {media ? 'Replace site capture' : 'Open local capture'}
            <input type="file" accept="image/*,video/*" onChange={(e) => void addMedia(e.target.files?.[0])}/>
          </label>
          {mediaError && <p role="alert" className="northstar-error">{mediaError}</p>}
          <p className="northstar-note">Images are references only. No geolocation, Gaussian reconstruction, survey accuracy or as-built assertion is inferred.</p>
        </section>

        <section className="northstar-pane northstar-design" aria-label="Design model">
          <header>
            <div><span className="northstar-index">02 / MODEL</span><h3><Box size={17}/> Design</h3></div>
            <span className="northstar-signal">{meshes.length + serviceMeshes.length} MODEL MESHES</span>
          </header>
          <div className="northstar-viewport">
            <ViewportCanvas
              meshes={meshes} geometryServiceMeshes={[...serviceMeshes, ...geometryMeshes]}
              selectedSemanticId={selectedSemanticId}
              onPickSemantic={onSelectSemantic}
              {...(chrome ? { chrome } : {})}
            />
            {detailSvg && <div className="northstar-sheet-overlay" role="region" aria-label="F05 derived detail sheet">
              <button type="button" onClick={() => setDetailSvg(null)}>Close drawing study</button>
              <img src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(detailSvg)} alt="Loft source-derived construction section, not for construction"/>
            </div>}
            <div className="northstar-viewport-title">
              <span>ACTIVE PLASMA MODEL</span>
              <strong>{short(modelId)}</strong>
            </div>
          </div>
          <div className="northstar-design-footer">
            <div className="northstar-geometry-actions">
              <button type="button" onClick={() => void previewLoftGeometry()} disabled={!canPreviewGeometry}>
                {geometryBusy ? 'Building preview…' : 'Preview selected Loft solid'}</button>
              <span>{geometryInfo || 'Supported: single centred rectangle sketch + extrusion only'}</span>
            </div>
            {geometryError && <p role="alert" className="northstar-error">{geometryError}</p>}
            <div className="northstar-meta"><span>Selected semantic ID</span><strong>{short(selectedSemanticId)}</strong></div>
            <div className="northstar-meta"><span>Imported source geometry</span><strong>Not compiled into this viewport</strong></div>
          </div>
          {preview && <div className="northstar-source-list">
            <div className="northstar-subheading">Source objects / select to inspect</div>
            <div className="northstar-source-scroller">
              {preview.objects.filter((o) => o.semanticType !== 'geometry.loft.project').slice(0,24).map((o) => (
                <button type="button" key={o.id} className={selectedSemanticId === o.id ? 'active' : ''}
                  onClick={() => onSelectSemantic(o.id)}
                  title={o.id}>{o.name} <span>{o.semanticType.replace('geometry.loft.', '')}</span></button>
              ))}
            </div>
          </div>}
        </section>

        <section className="northstar-pane northstar-reason" aria-label="Reason and impact">
          <header>
            <div><span className="northstar-index">03 / TRACE</span><h3><Network size={17}/> Reason</h3></div>
            <span className="northstar-signal pending">EVIDENCE GATED</span>
          </header>
          <div className="northstar-reason-scroll">
            <div className="northstar-selected">
              <div className="northstar-subheading">Current selection</div>
              <strong>{selection?.name ?? short(selectedSemanticId)}</strong>
              <small>{selection?.semanticType ?? 'Select a source object or mesh'}</small>
            </div>
            <div className="northstar-relations">
              <div className="northstar-subheading">Causal / assembly relations ({edges.length})</div>
              {edges.length === 0
                ? <p className="northstar-note">No imported relationships for this selection; load sources to inspect their graph.</p>
                : edges.map((edge) => (
                  <button type="button" key={edge.id} onClick={() =>
                    onSelectSemantic(edge.from === selectedSemanticId ? edge.to : edge.from)}>
                    <span>{edge.relationType}</span>
                    <strong>{short(edge.from === selectedSemanticId ? edge.to : edge.from)}</strong>
                    <ArrowRight size={14}/>
                  </button>))}
            </div>
            <div className="northstar-proposal">
              <div className="northstar-subheading">Design change / F02</div>
              <p className="northstar-note">Draft one typed Build parameter change. A Loft driver is linked only when you explicitly select it.</p>
              <label>Build parameter
                <select value={parameterId} onChange={(e) => {
                  setParameterId(e.target.value); setLinkKey(''); setImpact(null);
                  const p = preview?.parameters.find((item) => item.id === e.target.value);
                  setDraftValue(p ? String(p.quantity.value) : '');
                }}>
                  <option value="">Select parameter</option>
                  {(preview?.parameters ?? []).filter((p) => p.editableBy.includes('user') && p.role !== 'derived')
                    .map((p) => <option value={p.id} key={p.id}>{p.name} · {p.quantity.value} {p.quantity.unit}</option>)}
                </select>
              </label>
              {selectedParameter && <>
                <label>Proposed value ({selectedParameter.quantity.unit})
                  <input type="number" value={draftValue} onChange={(e) => {
                    setDraftValue(e.target.value); setImpact(null);
                  }}/>
                </label>
                <label>Explicit Loft parameter mapping
                  <select value={linkKey} onChange={(e) => { setLinkKey(e.target.value); setImpact(null); }}>
                    <option value="">No Loft driver selected</option>
                    {linkOptions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </label>
              </>}
              {!modelId || !branchId || !headHash
                ? <p className="northstar-note"><ShieldAlert size={13}/> Open a versioned Plasma model to preview a change against its branch head.</p>
                : null}
              <button type="button" disabled={!canPropose} className="northstar-review" onClick={() => void proposeChange()}>
                {running ? 'Reviewing…' : 'Review impact'} <ArrowRight size={15}/>
              </button>
              {impactError && <p role="alert" className="northstar-error">{impactError}</p>}
              {impact && <div className="northstar-impact">
                <strong>PROPOSED — NOT COMMITTED</strong>
                <p>{impact.parameter.before} → {impact.parameter.after} {impact.parameter.unit}</p>
                <small>{impact.impactedBuildEntities.length} Build entities · {impact.impactedLoftOccurrences.length} Loft occurrences</small>
                <ul>{impact.unresolved.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>}
            </div>
            <ContinuityInspector
              fusion={fusion} selectedSemanticId={selectedSemanticId}
              onSelectSemantic={onSelectSemantic}
              modelId={modelId} branchId={branchId} headHash={headHash}
              onDetail={setDetailSvg} onRegistration={setSiteFit}
            />
          </div>
        </section>
      </div>

      <footer className="northstar-worldline">
        <div className="northstar-worldline-label">
          <GitBranch size={17}/>
          <span>04 / WORLDLINE</span>
          <strong>Session history</strong>
          <small>Not an issued revision history</small>
        </div>
        <div className="northstar-events">
          {events.length ? events.map((e) => (
            <button key={e.id} type="button" className={selectedEvent === e.id ? 'selected' : ''}
              onClick={() => setSelectedEvent(e.id)}>
              <FileClock size={13}/> <span>{e.kind}</span>
              <strong>{e.label}</strong>
            </button>
          )) : <span className="northstar-no-events">No session events recorded</span>}
        </div>
        <div className="northstar-current"><span>BRANCH HEAD</span><strong>{short(headHash)}</strong></div>
      </footer>
    </section>
  );
}
