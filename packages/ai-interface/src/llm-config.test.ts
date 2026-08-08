import { describe, expect, it } from 'vitest';
import { loadLlmConfig } from './llm-config.js';

describe('loadLlmConfig', () => {
  it('is not configured without API key', () => {
    const c = loadLlmConfig({});
    expect(c.configured).toBe(false);
    expect(c.apiKey).toBeNull();
    expect(c.baseUrl).toBe('https://api.openai.com/v1');
    expect(c.model).toBe('gpt-4.1-mini');
  });

  it('reads optional overrides when key present', () => {
    const c = loadLlmConfig({
      SPDS_AI_API_KEY: ' sk-test ',
      SPDS_AI_BASE_URL: 'http://localhost:11434/v1/',
      SPDS_AI_MODEL: 'llama3.2',
      SPDS_AI_TIMEOUT_MS: '12000',
    });
    expect(c.configured).toBe(true);
    expect(c.apiKey).toBe('sk-test');
    expect(c.baseUrl).toBe('http://localhost:11434/v1');
    expect(c.model).toBe('llama3.2');
    expect(c.timeoutMs).toBe(12_000);
  });
});
