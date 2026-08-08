import {
  GeometryRepresentationSchema,
  MeshSchema,
  type GeometryRepresentation,
  type Mesh,
  type ShellRequest,
  type SweepRequest,
  type TessellateRequest,
} from '@spds/geometry-contracts';

export interface GeometryClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class GeometryClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeometryClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(signal?: AbortSignal): Promise<{ status: string; kernel: string; version: string }> {
    return (await this.request('/health', { method: 'GET' }, signal)) as {
      status: string;
      kernel: string;
      version: string;
    };
  }

  async sweep(body: SweepRequest, signal?: AbortSignal): Promise<GeometryRepresentation> {
    const json = await this.request('/v1/sweep', { method: 'POST', body: JSON.stringify(body) }, signal);
    return GeometryRepresentationSchema.parse(json);
  }

  async tessellate(body: TessellateRequest, signal?: AbortSignal): Promise<Mesh> {
    const json = await this.request('/v1/tessellate', { method: 'POST', body: JSON.stringify(body) }, signal);
    return MeshSchema.parse(json);
  }

  async shell(body: ShellRequest, signal?: AbortSignal): Promise<GeometryRepresentation> {
    const json = await this.request('/v1/shell', { method: 'POST', body: JSON.stringify(body) }, signal);
    return GeometryRepresentationSchema.parse(json);
  }

  private async request(path: string, init: RequestInit, outer?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    outer?.addEventListener('abort', onAbort);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        throw Object.assign(new Error(`geometry-service ${res.status}`), { body: json });
      }
      return json;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }
}
