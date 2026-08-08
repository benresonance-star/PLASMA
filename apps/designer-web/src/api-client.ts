import type { DisplayMeshInput } from './mesh-bridge.js';
import type { AnalysisMeshViewModel } from './analysis-mesh-view.js';
import { buildAnalysisMeshView } from './analysis-mesh-view.js';

export function apiBaseUrl(): string {
  return (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '/api';
}

export async function fetchD01DisplayMeshes(yLimit = 5): Promise<{
  readonly pipelineHash: string;
  readonly meshes: readonly DisplayMeshInput[];
  readonly source: string;
}> {
  const res = await fetch(`${apiBaseUrl()}/references/d01/display-meshes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ yLimit }),
  });
  if (!res.ok) throw new Error(`display-meshes ${res.status}`);
  const body = (await res.json()) as {
    pipelineHash: string;
    source: string;
    meshes: DisplayMeshInput[];
  };
  return body;
}

export async function fetchD01Analyze(yLimit = 3): Promise<AnalysisMeshViewModel> {
  const res = await fetch(`${apiBaseUrl()}/references/d01/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ yLimit }),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  const body = (await res.json()) as {
    meshArtifactHash?: string;
    elementCount?: number;
    groupMapping?: Record<string, string[]>;
    viewportLabels?: Array<{ entityId: string; text: string; indicative: true }>;
  };
  return buildAnalysisMeshView({
    meshArtifactHash: body.meshArtifactHash ?? 'mesh:missing',
    elementCount: body.elementCount ?? 0,
    groupMapping: body.groupMapping ?? {},
    labels: body.viewportLabels ?? [],
  });
}
