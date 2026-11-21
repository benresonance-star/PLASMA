import { useState } from 'react';
import { apiBaseUrl } from '../api-client.js';

type SourceObject = Record<string, unknown>;
export interface FusionPreview {
  readonly status: 'preview-only';
  readonly publicationReady: false;
  readonly geometryStatus: string;
  readonly sources: readonly { readonly system: string; readonly projectId: string; readonly sourceHash: string }[];
  readonly objects: readonly { readonly id: string; readonly name: string; readonly semanticType: string }[];
  readonly parameters: readonly unknown[];
  readonly relationships: readonly unknown[];
  readonly bindings: readonly { readonly buildEntityId: string; readonly loftOccurrenceId: string }[];
  readonly unresolved: readonly string[];
}

export interface FusionContext {
  readonly preview: FusionPreview;
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly { readonly buildEntityId: string; readonly loftAssemblyId: string; readonly loftInstanceId: string }[];
}
function object(input: unknown): SourceObject | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as SourceObject) : null;
}
function sourceElements(input: unknown): Array<{ id: string; name: string }> {
  const graph = object(object(input)?.['authoritativeGraph']);
  const entities = graph?.['entities'];
  if (!Array.isArray(entities)) return [];
  return entities.flatMap((raw) => {
    const e = object(raw);
    return typeof e?.['id'] === 'string' && typeof e['name'] === 'string'
      ? [{ id: e['id'], name: e['name'] }] : [];
  });
}
function sourceOccurrences(input: unknown): Array<{ assembly: string; instance: string }> {
  const assemblies = object(input)?.['assemblies'];
  if (!Array.isArray(assemblies)) return [];
  return assemblies.flatMap((raw) => {
    const assembly = object(raw);
    if (typeof assembly?.['id'] !== 'string' || !Array.isArray(assembly['instances'])) return [];
    return assembly['instances'].flatMap((item: unknown) => {
      const inst = object(item);
      return typeof inst?.['id'] === 'string' && typeof inst['partId'] === 'string'
        ? [{ assembly: assembly['id'] as string, instance: inst['id'] }] : [];
    });
  });
}

export function FusionStudio({
  open, onClose, onPreview,
}: { readonly open: boolean; readonly onClose: () => void;
  readonly onPreview?: (context: FusionContext) => void }) {
  const [build, setBuild] = useState<unknown>(null);
  const [loft, setLoft] = useState<unknown>(null);
  const [selectedBuild, setSelectedBuild] = useState('');
  const [selectedOccurrence, setSelectedOccurrence] = useState('');
  const [result, setResult] = useState<FusionPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const buildEntities = sourceElements(build);
  const loftInstances = sourceOccurrences(loft);
  async function receiveFile(file: File | undefined, system: 'build' | 'loft'): Promise<void> {
    if (!file) return;
    setError(''); setResult(null);
    if (file.size > 950_000) {
      setError(system + ' file exceeds the 950 KB preview limit'); return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (system === 'build') {
        setBuild(parsed); setSelectedBuild('');
      } else {
        setLoft(parsed); setSelectedOccurrence('');
      }
    } catch {
      setError(system + ': could not parse project JSON');
    }
  }
  async function preview(): Promise<void> {
    if (!build || !loft) return;
    setBusy(true); setError(''); setResult(null);
    const occurrence = loftInstances.find((x) => JSON.stringify([x.assembly, x.instance]) === selectedOccurrence);
    const bindings = selectedBuild && occurrence
      ? [{ buildEntityId: selectedBuild, loftAssemblyId: occurrence.assembly, loftInstanceId: occurrence.instance }]
      : [];
    try {
      const response = await fetch(apiBaseUrl() + '/imports/fusion/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buildProject: build, loftProject: loft, bindings }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const diagnostic = object(payload);
        throw new Error(String(diagnostic?.['summary'] ?? 'Fusion preview rejected'));
      }
      const validated = payload as FusionPreview;
      setResult(validated);
      onPreview?.({ buildProject: build, loftProject: loft, bindings, preview: validated });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fusion preview unavailable');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="presentation" className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 p-3 sm:p-8">
      <section
        role="dialog" aria-modal="true" aria-label="Plasma fusion preview"
        className="mx-auto max-w-5xl rounded-xl border border-border bg-background p-5 shadow-2xl"
      >
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Fusion 01 — Source reconciliation</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Inspect Build semantic records and Loft part occurrences under Plasma identity.
              Nothing is committed or geometrically compiled in this preview.
            </p>
          </div>
          <button type="button" className="rounded border px-3 py-1.5 text-sm"
            onClick={onClose}>Close</button>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="rounded-lg border p-3 text-sm">
            <span className="mb-2 block font-semibold">Build project (.json)</span>
            <input aria-label="Build project JSON" type="file" accept=".json,application/json"
              className="w-full text-xs" onChange={(e) => void receiveFile(e.target.files?.[0], 'build')}/>
            <span className="mt-2 block text-muted-foreground">{buildEntities.length} source building entities</span>
          </label>
          <label className="rounded-lg border p-3 text-sm">
            <span className="mb-2 block font-semibold">Loft project (.loftproj.json)</span>
            <input aria-label="Loft project JSON" type="file" accept=".json,application/json"
              className="w-full text-xs" onChange={(e) => void receiveFile(e.target.files?.[0], 'loft')}/>
            <span className="mt-2 block text-muted-foreground">{loftInstances.length} geometric occurrences</span>
          </label>
        </div>
        <div className="mt-4 rounded-lg border p-4">
          <h3 className="mb-1 font-semibold">Explicit component correspondence</h3>
          <p className="mb-3 text-xs text-muted-foreground">Choose both values to assert one relationship. No objects are auto-matched by name or proximity.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Build semantic element
              <select aria-label="Build semantic element" value={selectedBuild} onChange={(e) => setSelectedBuild(e.target.value)}
                className="mt-1 block w-full rounded border bg-background p-2">
                <option value="">Unbound</option>
                {buildEntities.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}
              </select>
            </label>
            <label className="text-sm">Loft part occurrence
              <select aria-label="Loft part occurrence" value={selectedOccurrence} onChange={(e) => setSelectedOccurrence(e.target.value)}
                className="mt-1 block w-full rounded border bg-background p-2">
                <option value="">Unbound</option>
                {loftInstances.map((x) => <option key={x.assembly + x.instance} value={JSON.stringify([x.assembly, x.instance])}>
                  {x.assembly} / {x.instance}
                </option>)}
              </select>
            </label>
          </div>
          <button type="button" disabled={!build || !loft || busy} onClick={() => void preview()}
            className="mt-4 rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? 'Reconciling…' : 'Preview shared semantic graph'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded border border-destructive p-3 text-sm">{error}</p>}
        {result && (
          <div className="mt-4 space-y-3 rounded-lg border p-4" data-testid="fusion-preview-results">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <strong>Read-only · not published</strong>
              <span>{result.objects.length} objects</span>
              <span>{result.parameters.length} parameters</span>
              <span>{result.relationships.length} relationships</span>
              <span>{result.bindings.length} explicit bindings</span>
            </div>
            <p className="text-xs text-muted-foreground">Geometry: {result.geometryStatus} · Source hashes are recorded for provenance.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Source records</h4>
                {result.sources.map((source) => (
                  <p className="break-all text-xs" key={source.system}>
                    {source.system}: {source.projectId} · SHA-256 {source.sourceHash.slice(0, 16)}…
                  </p>
                ))}
                <h4 className="mb-2 mt-3 text-sm font-semibold">Linked source identities</h4>
                {result.bindings.map((b) => <p className="break-all text-xs" key={b.loftOccurrenceId}>
                  {b.buildEntityId} → {b.loftOccurrenceId}
                </p>)}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Open qualification gates</h4>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  {result.unresolved.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
