/** OpenAI-compatible LLM config — keys optional; scripted mode when absent. */

export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly model: string;
  readonly timeoutMs: number;
  readonly configured: boolean;
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const apiKey = env.SPDS_AI_API_KEY?.trim() || null;
  const baseUrl = (env.SPDS_AI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.SPDS_AI_MODEL?.trim() || 'gpt-4.1-mini';
  const timeoutMs = Number(env.SPDS_AI_TIMEOUT_MS ?? 60_000);
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    configured: Boolean(apiKey),
  };
}
