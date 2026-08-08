import type {
  ComponentDefinition,
  ComponentInstance,
  ConnectionIntent,
  Interface,
  Joint,
  Mate,
} from './types.js';
import {
  ComponentDefinitionSchema,
  ComponentInstanceSchema,
  ConnectionIntentSchema,
  InterfaceSchema,
  JointSchema,
  MateSchema,
} from './types.js';

export class AssemblyRegistry {
  private readonly definitions = new Map<string, ComponentDefinition>();
  private readonly instances = new Map<string, ComponentInstance>();
  private readonly mates = new Map<string, Mate>();
  private readonly joints = new Map<string, Joint>();
  private readonly interfaces = new Map<string, Interface>();
  private readonly connections = new Map<string, ConnectionIntent>();

  upsertDefinition(input: unknown): ComponentDefinition {
    const def = ComponentDefinitionSchema.parse(input);
    this.definitions.set(def.id, def);
    return def;
  }

  /** Definition edits must not change instance identity. */
  updateDefinitionRevision(definitionId: string, revision: string, parameters?: Record<string, unknown>): void {
    const prev = this.definitions.get(definitionId);
    if (!prev) throw new Error(`Unknown definition ${definitionId}`);
    this.definitions.set(definitionId, {
      ...prev,
      revision,
      ...(parameters !== undefined ? { parameters } : {}),
    });
  }

  upsertInstance(input: unknown): ComponentInstance {
    const inst = ComponentInstanceSchema.parse(input);
    this.instances.set(inst.id, inst);
    return inst;
  }

  upsertMate(input: unknown): Mate {
    const mate = MateSchema.parse(input);
    this.mates.set(mate.id, mate);
    return mate;
  }

  upsertJoint(input: unknown): Joint {
    const joint = JointSchema.parse(input);
    this.joints.set(joint.id, joint);
    return joint;
  }

  upsertInterface(input: unknown): Interface {
    const iface = InterfaceSchema.parse(input);
    this.interfaces.set(iface.id, iface);
    return iface;
  }

  upsertConnection(input: unknown): ConnectionIntent {
    const conn = ConnectionIntentSchema.parse(input);
    this.connections.set(conn.id, conn);
    return conn;
  }

  getInstance(id: string): ComponentInstance | undefined {
    return this.instances.get(id);
  }

  listInstances(): ComponentInstance[] {
    return [...this.instances.values()];
  }

  listConnections(): ConnectionIntent[] {
    return [...this.connections.values()];
  }

  bomCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const inst of this.instances.values()) {
      counts[inst.definitionId] = (counts[inst.definitionId] ?? 0) + 1;
    }
    return counts;
  }

  inspector(): {
    definitions: ComponentDefinition[];
    instances: ComponentInstance[];
    mates: Mate[];
    joints: Joint[];
    interfaces: Interface[];
    connections: ConnectionIntent[];
    bom: Record<string, number>;
  } {
    return {
      definitions: [...this.definitions.values()],
      instances: this.listInstances(),
      mates: [...this.mates.values()],
      joints: [...this.joints.values()],
      interfaces: [...this.interfaces.values()],
      connections: this.listConnections(),
      bom: this.bomCounts(),
    };
  }
}
