export interface BenchmarkRecord {
  readonly id: string;
  readonly tier?: string;
  readonly durationMs: number;
  readonly objectCount: number;
  readonly env: {
    readonly node: string;
    readonly platform: string;
  };
  readonly determinismClass: 'D0' | 'D1' | 'D2' | 'D3';
}

export function recordBenchmark(
  partial: Omit<BenchmarkRecord, 'env'> & { env?: BenchmarkRecord['env'] },
): BenchmarkRecord {
  return {
    ...partial,
    env: partial.env ?? {
      node: process.version,
      platform: process.platform,
    },
  };
}
