import { parsePatternDefinition, type PatternDefinition } from './pattern.js';

export class PatternRegistry {
  private readonly patterns = new Map<string, PatternDefinition>();

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }

  register(input: unknown): PatternDefinition {
    const pattern = parsePatternDefinition(input);
    const key = this.key(pattern.id, pattern.version);
    if (this.patterns.has(key)) {
      throw new Error(`Pattern already registered: ${key}`);
    }
    this.patterns.set(key, pattern);
    return pattern;
  }

  get(id: string, version: string): PatternDefinition {
    const pattern = this.patterns.get(this.key(id, version));
    if (!pattern) throw new Error(`Pattern not found: ${id}@${version}`);
    return pattern;
  }

  /** Published versions are immutable — edit creates a new version. */
  fork(id: string, version: string, newVersion: string, patch: Partial<PatternDefinition>): PatternDefinition {
    const parent = this.get(id, version);
    if (parent.lifecycle === 'published' && patch.lifecycle === 'published' && newVersion === version) {
      throw new Error('Cannot mutate published pattern in place');
    }
    return this.register({
      ...parent,
      ...patch,
      version: newVersion,
      parentId: `${id}@${version}`,
      lifecycle: patch.lifecycle ?? 'draft',
    });
  }

  instantiate(id: string, version: string, instanceId: string): { instanceId: string; pattern: PatternDefinition } {
    const pattern = this.get(id, version);
    return { instanceId, pattern };
  }
}
