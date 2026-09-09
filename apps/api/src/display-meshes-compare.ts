import { GeometryClient } from '@spds/geometry-client';
import { buildD01DisplayMeshes, type PipelineDisplayMesh } from '@spds/reference-pipeline';

export interface GeometryServiceLayer {
  readonly meshes: readonly PipelineDisplayMesh[];
  readonly source: 'geometry-occt';
  readonly kernel: string;
  readonly label: string;
}

type CompileMeshesResponse = {
  readonly occt?: {
    readonly meshes: PipelineDisplayMesh[];
    readonly kernel: string;
    readonly label?: string;
  };
  readonly occtNative?: {
    readonly meshes: PipelineDisplayMesh[];
    readonly kernel: string;
    readonly label?: string;
  };
  readonly occtError?: string;
  readonly occtNativeError?: string;
};

function serviceLabelForKernel(kernel: string): string {
  if (kernel === 'occt-native') return 'OCCT native (constructive)';
  if (kernel === 'occt-wasm') return 'OCCT WASM (STEP-tessellated)';
  return `Geometry service (${kernel})`;
}

/**
 * Prefer occt-native when healthy meshes exist; else K2 WASM.
 * Never label exact-adapter as OpenCascade.
 */
export function selectGeometryServiceLayer(
  body: CompileMeshesResponse,
  healthKernel: string,
): GeometryServiceLayer | { readonly error: string } {
  if (body.occtNative?.meshes?.length) {
    const kernel = body.occtNative.kernel || 'occt-native';
    return {
      meshes: body.occtNative.meshes.map((m) => ({
        representationId: m.representationId,
        semanticOwner: m.semanticOwner,
        vertices: m.vertices,
        indices: m.indices,
        triangleCount: m.triangleCount,
        kernel: 'occt-native' as const,
      })),
      source: 'geometry-occt',
      kernel,
      label: body.occtNative.label ?? serviceLabelForKernel(kernel),
    };
  }
  if (body.occt?.meshes?.length) {
    const kernel = body.occt.kernel || healthKernel || 'occt-wasm';
    return {
      meshes: body.occt.meshes.map((m) => ({
        representationId: m.representationId,
        semanticOwner: m.semanticOwner,
        vertices: m.vertices,
        indices: m.indices,
        triangleCount: m.triangleCount,
        kernel: 'occt-wasm' as const,
      })),
      source: 'geometry-occt',
      kernel,
      label: body.occt.label ?? serviceLabelForKernel(kernel),
    };
  }
  const err =
    body.occtNativeError || body.occtError || 'OCCT meshes empty (native unavailable; WASM failed)';
  return { error: err };
}

export async function buildD01DisplayMeshesMaybeCompare(options?: {
  readonly yLimit?: number;
  readonly lengthMmOverride?: number;
  readonly lengthMm?: number;
  readonly armWidthMm?: number;
  readonly structuralDepthMm?: number;
  readonly frequency?: number;
  readonly diameterMm?: number;
  readonly riseRatio?: number;
  readonly compareEngines?: boolean;
  readonly geometryBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<{
  readonly pipelineHash: string;
  readonly pirHash: string;
  readonly compileHash: string;
  readonly meshes: readonly PipelineDisplayMesh[];
  readonly source: 'd01-reference-pipeline';
  readonly parameters: Readonly<Record<string, number>>;
  readonly geometryService?: GeometryServiceLayer;
  readonly geometryServiceError?: string;
}> {
  const lengthMm = options?.lengthMm ?? options?.lengthMmOverride;
  const reference = await buildD01DisplayMeshes({
    yLimit: options?.yLimit ?? 5,
    ...(lengthMm !== undefined ? { lengthMm } : {}),
    ...(options?.armWidthMm !== undefined ? { armWidthMm: options.armWidthMm } : {}),
    ...(options?.structuralDepthMm !== undefined
      ? { structuralDepthMm: options.structuralDepthMm }
      : {}),
    ...(options?.frequency !== undefined ? { frequency: options.frequency } : {}),
    ...(options?.diameterMm !== undefined ? { diameterMm: options.diameterMm } : {}),
    ...(options?.riseRatio !== undefined ? { riseRatio: options.riseRatio } : {}),
  });

  if (!options?.compareEngines) {
    return reference;
  }

  const baseUrl =
    options.geometryBaseUrl ??
    process.env['GEOMETRY_URL'] ??
    process.env['SPDS_GEOMETRY_URL'] ??
    'http://127.0.0.1:7080';
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const client = new GeometryClient({ baseUrl, fetchImpl, timeoutMs: 60_000 });
    const health = await client.health();
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/compile/meshes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compile: reference.compileRequest,
        // Prefer native when present; WASM is the honest K2 fallback.
        kernels: ['occt-native', 'occt-wasm'],
      }),
    });
    if (!res.ok) {
      throw new Error(`compile/meshes ${res.status}`);
    }
    const body = (await res.json()) as CompileMeshesResponse;
    const selected = selectGeometryServiceLayer(body, health.kernel);
    if ('error' in selected) {
      return {
        ...reference,
        geometryServiceError: selected.error,
      };
    }
    return {
      ...reference,
      geometryService: selected,
    };
  } catch (err) {
    return {
      ...reference,
      geometryServiceError: err instanceof Error ? err.message : 'geometry service unavailable',
    };
  }
}
