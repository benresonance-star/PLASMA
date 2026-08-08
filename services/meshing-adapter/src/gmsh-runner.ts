import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export type GmshRunMode = 'gmsh-cli' | 'gmsh-docker' | 'deterministic-fallback';

export interface GmshRunResult {
  readonly mode: GmshRunMode;
  readonly elementCount: number;
  readonly artifactHash: string;
  readonly stdout: string;
}

/**
 * Attempt host Gmsh CLI, then Docker image, else deterministic fallback.
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

    const cli = tryGmshCli(dir, geoPath, mshPath);
    if (cli) return cli;

    const docker = tryGmshDocker(dir);
    if (docker) return docker;

    return deterministicFallback(input, 'gmsh-cli-and-docker-unavailable');
  } catch (err) {
    return deterministicFallback(
      input,
      err instanceof Error ? err.message : 'gmsh-unavailable',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tryGmshCli(dir: string, geoPath: string, mshPath: string): GmshRunResult | null {
  const gmsh = process.env.SPDS_GMSH_BIN ?? 'gmsh';
  const proc = spawnSync(gmsh, ['-3', geoPath, '-o', mshPath, '-format', 'msh22'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (proc.status !== 0) return null;
  return readMshResult(mshPath, 'gmsh-cli', proc.stdout ?? '');
}

function tryGmshDocker(dir: string): GmshRunResult | null {
  if (process.env.SPDS_GMSH_DOCKER === '0') return null;
  // Prefer locally built image from services/meshing-adapter/Dockerfile.gmsh
  // (`docker build -t spds-gmsh -f services/meshing-adapter/Dockerfile.gmsh .`).
  const image = process.env.SPDS_GMSH_IMAGE ?? 'spds-gmsh';
  const proc = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${dir}:/data`,
      image,
      '-3',
      '/data/box.geo',
      '-o',
      '/data/out.msh',
      '-format',
      'msh22',
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (proc.status !== 0) return null;
  return readMshResult(join(dir, 'out.msh'), 'gmsh-docker', proc.stdout ?? '');
}

function readMshResult(mshPath: string, mode: 'gmsh-cli' | 'gmsh-docker', stdout: string): GmshRunResult {
  const msh = readFileSync(mshPath, 'utf8');
  const elementCount = (msh.match(/\$Elements/g) ? countMshElements(msh) : 0) || 1;
  return {
    mode,
    elementCount,
    artifactHash: createHash('sha256').update(msh).digest('hex'),
    stdout,
  };
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
