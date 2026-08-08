import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface GmshRunResult {
  readonly mode: 'gmsh-cli' | 'deterministic-fallback';
  readonly elementCount: number;
  readonly artifactHash: string;
  readonly stdout: string;
}

/**
 * Attempt container/host Gmsh CLI; fall back to deterministic mesh when unavailable.
 * Keeps Gmsh behind the meshing-adapter boundary (no core package imports).
 */
export function runGmshOrFallback(input: {
  readonly geometryArtifactHash: string;
  readonly elementSizeMm: number;
  readonly algorithm: 'frontal' | 'delaunay' | 'mock';
}): GmshRunResult {
  if (input.algorithm === 'mock') {
    return deterministicFallback(input);
  }
  const gmsh = process.env.SPDS_GMSH_BIN ?? 'gmsh';
  const dir = mkdtempSync(join(tmpdir(), 'spds-gmsh-'));
  try {
    const geoPath = join(dir, 'box.geo');
    const mshPath = join(dir, 'out.msh');
    writeFileSync(
      geoPath,
      [
        'SetFactory("OpenCASCADE");',
        'Box(1) = {0,0,0, 100,40,40};',
        `Mesh.CharacteristicLengthMax = ${input.elementSizeMm};`,
        `Mesh.Algorithm = ${input.algorithm === 'delaunay' ? 5 : 6};`,
      ].join('\n'),
      'utf8',
    );
    const proc = spawnSync(gmsh, ['-3', geoPath, '-o', mshPath, '-format', 'msh22'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (proc.status === 0) {
      const msh = readFileSync(mshPath, 'utf8');
      const elementCount = (msh.match(/\$Elements/g) ? countMshElements(msh) : 0) || 1;
      return {
        mode: 'gmsh-cli',
        elementCount,
        artifactHash: createHash('sha256').update(msh).digest('hex'),
        stdout: proc.stdout ?? '',
      };
    }
    return deterministicFallback(input, proc.stderr ?? proc.error?.message ?? 'gmsh-unavailable');
  } catch (err) {
    return deterministicFallback(
      input,
      err instanceof Error ? err.message : 'gmsh-unavailable',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function countMshElements(msh: string): number {
  const m = msh.match(/\$Elements\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

function deterministicFallback(
  input: {
    readonly geometryArtifactHash: string;
    readonly elementSizeMm: number;
    readonly algorithm: string;
  },
  note = 'fallback',
): GmshRunResult {
  const elementCount = Math.max(1, Math.round(1000 / input.elementSizeMm));
  const payload = JSON.stringify({ ...input, note, mode: 'deterministic-fallback' });
  return {
    mode: 'deterministic-fallback',
    elementCount,
    artifactHash: createHash('sha256').update(payload).digest('hex'),
    stdout: note,
  };
}
