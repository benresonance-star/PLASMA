import type { Operator } from './types.js';

export class OperatorRegistry {
  private readonly operators = new Map<string, Operator<unknown, unknown>>();

  register<I, O>(operator: Operator<I, O>): void {
    const key = `${operator.id}@${operator.version}`;
    if (this.operators.has(key)) {
      throw new Error(`Operator already registered: ${key}`);
    }
    this.operators.set(key, operator as Operator<unknown, unknown>);
  }

  get<I, O>(id: string, version: string): Operator<I, O> {
    const key = `${id}@${version}`;
    const op = this.operators.get(key);
    if (!op) throw new Error(`Operator not found: ${key}`);
    return op as Operator<I, O>;
  }

  list(): string[] {
    return [...this.operators.keys()].sort();
  }
}
