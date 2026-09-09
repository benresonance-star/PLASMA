import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createSpdsError } from '@spds/failure-taxonomy';
import { sha256Canonical } from '@spds/reproducibility';
import type {
  GeometryRepresentation,
  MeasureRequest,
  MeasureResult,
  Mesh,
  ShellRequest,
  SweepRequest,
  TessellateRequest,
} from '@spds/geometry-contracts';
import { ExactKernelAdapter } from './exact-kernel.js';

type Vec3 = [number, number, number];

export interface OcctStepImportSolid {
  readonly shapeId: string;
  readonly name: string;
  readonly mesh: Mesh;
  readonly representation: GeometryRepresentation;
}

export interface OcctStepImportResult {
  readonly success: boolean;
  readonly solidCount: number;
  readonly solids: readonly OcctStepImportSolid[];
  readonly kernel: 'occt-wasm';
  readonly parametricClaim: 'reference-only';
}

interface OcctMeshNode {
  readonly name?: string;
  readonly attributes?: {
    readonly position?: { readonly array?: ArrayLike<number> };
  };
  readonly index?: { readonly array?: ArrayLike<number> };
}

interface OcctModule {
  ReadStepFile(
    buffer: Uint8Array,
    params: Record<string, unknown> | null,
  ): { success?: boolean; meshes?: OcctMeshNode[] } | null;
}

type OcctFactory = (opts?: { wasmBinary?: Buffer }) => Promise<OcctModule>;

/**
 * OCCT WASM kernel (occt-import-js) — real STEP→mesh via OpenCascade WASM.
 * Constructive ops (sweep/shell) delegate to ExactKernelAdapter until full
 * OCCT B-rep API surface is wired; STEP import uses live WASM.
 */
export class OcctWasmKernel {
  readonly kernelId = 'occt-wasm' as const;
  readonly version = '0.1.0-occt-import-js';
  private readonly exact = new ExactKernelAdapter();
  private occt: OcctModule | null = null;
  private initError: string | null = null;

  health() {
    return {
      status: this.initError ? 'degraded' : 'ok',
      service: 'geometry-kernel',
      kernel: this.kernelId,
      version: this.version,
      binding: 'occt-import-js-wasm',
      wasmReady: this.occt !== null,
      ...(this.initError ? { initError: this.initError } : {}),
    };
  }

  async ensureReady(): Promise<void> {
    if (this.occt) return;
    if (this.initError) {
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `OCCT WASM unavailable: ${this.initError}`,
        affectedSemanticIds: [],
        recoverable: true,
      });
    }
    try {
      const require = createRequire(import.meta.url);
      const factory = require('occt-import-js') as OcctFactory;
      const pkgDir = dirname(require.resolve('occt-import-js/package.json'));
      const wasmBinary = readFileSync(join(pkgDir, 'dist', 'occt-import-js.wasm'));
      this.occt = await factory({ wasmBinary });
    } catch (err) {
      this.initError = err instanceof Error ? err.message : 'occt-wasm-init-failed';
      throw createSpdsError({
        code: 'GEOMETRY_INVALID',
        summary: `OCCT WASM init failed: ${this.initError}`,
        affectedSemanticIds: [],
        recoverable: true,
      });
    }
  }

  sweep(req: SweepRequest): GeometryRepresentation {
    return this.exact.sweep(req);
  }

  tessellate(req: TessellateRequest): Mesh {
    return this.exact.tessellate(req);
  }

  shell(req: ShellRequest): GeometryRepresentation {
    return this.exact.shell(req);
  }

  get(representationId: string): GeometryRepresentation | undefined {
    return this.exact.get(representationId);
  }

  /**
   * Honest mesh-indicative measure — never claims B-rep for occt-wasm.
   * Uses AABB taxonomy on delegated constructive solids / imported extents.
   */
  measure(req: MeasureRequest): MeasureResult {
    const exactResult = this.exact.measure(req);
    return {
      ...exactResult,
      provenance: 'mesh-indicative',
      engine: {
        layer: req.layer ?? 'geometry-service',
        kernel: this.kernelId,
        label: 'OCCT WASM (mesh-indicative)',
      },
      meshIndicative: exactResult.quantity,
    };
  }

  async importStep(input: {
    readonly bytes: Uint8Array | string;
    readonly semanticOwnerPrefix?: string;
  }): Promise<OcctStepImportResult> {
    await this.ensureReady();
    const buffer =
      typeof input.bytes === 'string' ? Buffer.from(input.bytes, 'utf8') : Buffer.from(input.bytes);
    const result = this.occt!.ReadStepFile(new Uint8Array(buffer), null);
    if (!result?.success || !result.meshes?.length) {
      throw createSpdsError({
        code: 'SEMANTIC_INVALID',
        summary: 'OCCT WASM STEP import produced no meshes',
        affectedSemanticIds: [],
        recoverable: true,
      });
    }

    const prefix = input.semanticOwnerPrefix ?? 'import:step';
    const solids: OcctStepImportSolid[] = result.meshes.map((node, i) => {
      const positions = Array.from(node.attributes?.position?.array ?? []);
      const indices = Array.from(node.index?.array ?? []);
      const vertices: Vec3[] = [];
      for (let p = 0; p + 2 < positions.length; p += 3) {
        vertices.push([positions[p]!, positions[p + 1]!, positions[p + 2]!]);
      }
      const mesh: Mesh = {
        vertices,
        indices,
        maxDeviationMm: 0.5,
      };
      const extents = extentsOf(vertices);
      const owner = `${prefix}/solid:${i}`;
      const pirOperationId = `pir:occt-step:${sha256Canonical({ i, owner }).slice(0, 12)}`;
      const representation: GeometryRepresentation = {
        id: `repr:occt:${sha256Canonical({ owner, pirOperationId }).slice(0, 16)}`,
        semanticOwner: owner,
        pirOperationId,
        kernel: 'occt-wasm',
        validationState: vertices.length > 0 ? 'geometry-generated' : 'geometry-invalid',
        solid: { kind: 'solid', extentsMm: extents },
        mass: {
          volumeMm3: approximateVolume(extents),
          areaMm2: approximateArea(extents),
          centerOfMassMm: centerOf(extents),
        },
        subElementPaths: [`${owner}/face:0`],
        fabricationReady: false,
      };
      return {
        shapeId: owner,
        name: node.name ?? `solid-${i}`,
        mesh,
        representation,
      };
    });

    return {
      success: true,
      solidCount: solids.length,
      solids,
      kernel: 'occt-wasm',
      parametricClaim: 'reference-only',
    };
  }
}

function extentsOf(vertices: readonly Vec3[]): { min: Vec3; max: Vec3 } {
  if (vertices.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: Vec3 = [vertices[0]![0], vertices[0]![1], vertices[0]![2]];
  const max: Vec3 = [vertices[0]![0], vertices[0]![1], vertices[0]![2]];
  for (const v of vertices) {
    min[0] = Math.min(min[0], v[0]);
    min[1] = Math.min(min[1], v[1]);
    min[2] = Math.min(min[2], v[2]);
    max[0] = Math.max(max[0], v[0]);
    max[1] = Math.max(max[1], v[1]);
    max[2] = Math.max(max[2], v[2]);
  }
  return { min, max };
}

function centerOf(e: { min: Vec3; max: Vec3 }): Vec3 {
  return [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, (e.min[2] + e.max[2]) / 2];
}

function approximateVolume(e: { min: Vec3; max: Vec3 }): number {
  return (
    Math.max(0, e.max[0] - e.min[0]) *
    Math.max(0, e.max[1] - e.min[1]) *
    Math.max(0, e.max[2] - e.min[2])
  );
}

function approximateArea(e: { min: Vec3; max: Vec3 }): number {
  const dx = Math.max(0, e.max[0] - e.min[0]);
  const dy = Math.max(0, e.max[1] - e.min[1]);
  const dz = Math.max(0, e.max[2] - e.min[2]);
  return 2 * (dx * dy + dy * dz + dz * dx);
}
