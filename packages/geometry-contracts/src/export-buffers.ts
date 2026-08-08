/**
 * G10.2 — deterministic CAD-ish binary buffers from tessellated solids.
 * Real OCCT STEP remains adapter-owned; STL/GLB here are integrity-addressable binaries.
 */

export function meshToAsciiStl(input: {
  readonly name: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number]>;
  readonly indices: readonly number[];
}): Uint8Array {
  const lines = [`solid ${input.name}`];
  for (let i = 0; i + 2 < input.indices.length; i += 3) {
    const a = input.vertices[input.indices[i]!]!;
    const b = input.vertices[input.indices[i + 1]!]!;
    const c = input.vertices[input.indices[i + 2]!]!;
    lines.push('  facet normal 0 0 0');
    lines.push('    outer loop');
    lines.push(`      vertex ${a[0]} ${a[1]} ${a[2]}`);
    lines.push(`      vertex ${b[0]} ${b[1]} ${b[2]}`);
    lines.push(`      vertex ${c[0]} ${c[1]} ${c[2]}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push(`endsolid ${input.name}`);
  return new TextEncoder().encode(lines.join('\n'));
}

/** Minimal glTF/GLB JSON wrapper (not full binary GLB chunking) stored as .glb payload bytes. */
export function meshToGlbJson(input: {
  readonly name: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number]>;
  readonly indices: readonly number[];
}): Uint8Array {
  const payload = {
    asset: { version: '2.0', generator: 'spds-exact-adapter' },
    meshes: [
      {
        name: input.name,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
          },
        ],
      },
    ],
    accessors: [
      { count: input.vertices.length, type: 'VEC3' },
      { count: input.indices.length, type: 'SCALAR' },
    ],
    buffers: [
      {
        byteLength: input.vertices.length * 12 + input.indices.length * 4,
        uri: 'data:application/octet-stream;base64,',
      },
    ],
    positions: input.vertices,
    indices: input.indices,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

/** ISO-10303-ish STEP text placeholder embedding semantic owners (not full B-rep). */
export function representationsToStepText(owners: readonly string[]): Uint8Array {
  const body = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('SPDS exact-adapter export'),'2;1');",
    "FILE_NAME('spds-export.stp','',('SPDS'),(''),'','','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
    'ENDSEC;',
    'DATA;',
    ...owners.map(
      (o, i) =>
        `#${i + 1}=MANIFOLD_SOLID_BREP('${o}',#${i + 1000});`,
    ),
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
  return new TextEncoder().encode(body);
}
