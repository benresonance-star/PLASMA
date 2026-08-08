export interface QueryableObject {
  readonly id: string;
  readonly semanticType: string;
  readonly tags?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly edges?: ReadonlyArray<{ readonly type: string; readonly to: string }>;
}

export class IndexedSemanticGraph {
  private readonly byId = new Map<string, QueryableObject>();
  private readonly byType = new Map<string, string[]>();
  private readonly byTag = new Map<string, string[]>();
  private readonly byCapability = new Map<string, string[]>();

  constructor(objects: readonly QueryableObject[] = []) {
    for (const obj of objects) this.upsert(obj);
  }

  upsert(obj: QueryableObject): void {
    this.byId.set(obj.id, obj);
    const typeList = this.byType.get(obj.semanticType) ?? [];
    if (!typeList.includes(obj.id)) typeList.push(obj.id);
    this.byType.set(obj.semanticType, typeList);
    for (const tag of obj.tags ?? []) {
      const list = this.byTag.get(tag) ?? [];
      if (!list.includes(obj.id)) list.push(obj.id);
      this.byTag.set(tag, list);
    }
    for (const cap of obj.capabilities ?? []) {
      const list = this.byCapability.get(cap) ?? [];
      if (!list.includes(obj.id)) list.push(obj.id);
      this.byCapability.set(cap, list);
    }
  }

  get(id: string): QueryableObject | undefined {
    return this.byId.get(id);
  }

  all(): QueryableObject[] {
    return [...this.byId.values()];
  }

  idsByType(semanticType: string): string[] {
    return [...(this.byType.get(semanticType) ?? [])];
  }

  idsByTag(tag: string): string[] {
    return [...(this.byTag.get(tag) ?? [])];
  }

  idsByCapability(capability: string): string[] {
    return [...(this.byCapability.get(capability) ?? [])];
  }
}
