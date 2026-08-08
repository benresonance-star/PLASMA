export interface OperatorContext {
  readonly correlationId: string;
  readonly tolerancePolicyVersion: string;
}

export interface OperatorResult<O> {
  readonly output: O;
  readonly inputsHash: string;
  readonly outputHash: string;
  readonly operatorVersion: string;
  readonly warnings: readonly string[];
  readonly numericalTolerances: Readonly<Record<string, number>>;
  readonly provenance: Readonly<Record<string, string>>;
}

export interface Operator<I, O> {
  readonly id: string;
  readonly version: string;
  readonly deterministic: boolean;
  validateInput(input: I): void;
  execute(input: I, context: OperatorContext): Promise<OperatorResult<O>>;
}
