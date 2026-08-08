import {
  parseCoordinateFrame,
  translation,
  type CoordinateFrame,
  type FrameTransform,
} from '@spds/coordinate-frames';
import { AssemblyRegistry } from './registry.js';

export interface A01Fixture {
  readonly registry: AssemblyRegistry;
  readonly frames: readonly CoordinateFrame[];
  readonly transforms: readonly FrameTransform[];
  readonly importPlaceholder: {
    readonly id: string;
    readonly kind: 'ImportReference';
    readonly format: 'STEP';
    readonly unitsPendingConfirmation: true;
  };
}

/** A01 semantic assembly fixture — kernel-neutral, no geometry bindings. */
export function buildA01AssemblyFixture(): A01Fixture {
  const registry = new AssemblyRegistry();
  const world = parseCoordinateFrame({
    id: 'frame:world',
    role: 'WORLD',
    parentId: null,
    provenance: { source: 'system' },
  });
  const assembly = parseCoordinateFrame({
    id: 'frame:assembly:a01',
    role: 'ASSEMBLY',
    parentId: world.id,
    provenance: { source: 'a01' },
  });
  const componentFrame = parseCoordinateFrame({
    id: 'frame:component:node',
    role: 'COMPONENT',
    parentId: assembly.id,
    provenance: { source: 'a01' },
  });
  const importFrame = parseCoordinateFrame({
    id: 'frame:import:step-ref',
    role: 'IMPORT',
    parentId: assembly.id,
    provenance: { source: 'import-placeholder' },
  });

  registry.upsertDefinition({
    id: 'def:node-plate',
    kind: 'ComponentDefinition',
    name: 'Node Plate',
    revision: '1.0.0',
    interfaceIds: ['iface:plate:bolt-circle'],
    parameters: { thicknessMm: 12 },
  });
  registry.upsertDefinition({
    id: 'def:clevis',
    kind: 'ComponentDefinition',
    name: 'Clevis',
    revision: '1.0.0',
    interfaceIds: ['iface:clevis:pin'],
    parameters: { pinDiaMm: 16 },
  });

  registry.upsertInterface({
    id: 'iface:plate:bolt-circle',
    kind: 'Interface',
    ownerDefinitionId: 'def:node-plate',
    role: 'bolt-circle',
    selector: 'def:node-plate/face:bolt-circle',
  });
  registry.upsertInterface({
    id: 'iface:clevis:pin',
    kind: 'Interface',
    ownerDefinitionId: 'def:clevis',
    role: 'pin-axis',
    selector: 'def:clevis/axis:pin',
  });

  registry.upsertInstance({
    id: 'inst:plate:01',
    kind: 'ComponentInstance',
    definitionId: 'def:node-plate',
    definitionRevision: '1.0.0',
    frameId: componentFrame.id,
    stableInstanceId: 'stable:plate:01',
  });
  registry.upsertInstance({
    id: 'inst:clevis:01',
    kind: 'ComponentInstance',
    definitionId: 'def:clevis',
    definitionRevision: '1.0.0',
    frameId: 'frame:component:clevis-01',
    stableInstanceId: 'stable:clevis:01',
  });
  registry.upsertInstance({
    id: 'inst:clevis:02',
    kind: 'ComponentInstance',
    definitionId: 'def:clevis',
    definitionRevision: '1.0.0',
    frameId: 'frame:component:clevis-02',
    stableInstanceId: 'stable:clevis:02',
  });

  registry.upsertMate({
    id: 'mate:concentric:01',
    kind: 'Mate',
    mateType: 'concentric',
    a: { instanceId: 'inst:plate:01', selector: 'inst:plate:01/axis:bolt-1' },
    b: { instanceId: 'inst:clevis:01', selector: 'inst:clevis:01/axis:pin' },
  });
  registry.upsertMate({
    id: 'mate:distance:01',
    kind: 'Mate',
    mateType: 'distance',
    a: { instanceId: 'inst:plate:01', selector: 'inst:plate:01/face:mount' },
    b: { instanceId: 'inst:clevis:02', selector: 'inst:clevis:02/face:flange' },
    distanceMm: 20,
  });

  registry.upsertJoint({
    id: 'joint:fixed:01',
    kind: 'Joint',
    jointType: 'fixed',
    mateId: 'mate:concentric:01',
  });

  registry.upsertConnection({
    id: 'conn:bolted:01',
    kind: 'ConnectionIntent',
    connectionType: 'bolted',
    interfaceIds: ['iface:plate:bolt-circle', 'iface:clevis:pin'],
    mateId: 'mate:concentric:01',
    fastenerIds: ['fastener:m12:01', 'fastener:m12:02'],
  });

  const transforms: FrameTransform[] = [
    {
      id: 'xf:assembly-offset',
      sourceFrameId: world.id,
      targetFrameId: assembly.id,
      matrix: translation(0, 0, 1500),
      units: 'mm',
      handedness: 'right',
      upAxis: '+Z',
      provenance: { source: 'a01' },
    },
  ];

  return {
    registry,
    frames: [world, assembly, componentFrame, importFrame],
    transforms,
    importPlaceholder: {
      id: 'import:step:a01-ref',
      kind: 'ImportReference',
      format: 'STEP',
      unitsPendingConfirmation: true,
    },
  };
}
