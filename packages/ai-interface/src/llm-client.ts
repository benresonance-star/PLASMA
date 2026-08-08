/**
 * OpenAI-compatible Chat Completions client (tools support).
 * No SDK dependency — works with OpenAI, Azure-compatible, Ollama, LM Studio.
 */

import type { LlmConfig } from './llm-config.js';

export interface LlmChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly LlmToolCall[];
}

export interface LlmToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface LlmToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface LlmChatResult {
  readonly message: LlmChatMessage;
  readonly finishReason: string | null;
}

export type LlmFetch = typeof fetch;

export async function chatWithTools(input: {
  readonly config: LlmConfig;
  readonly messages: readonly LlmChatMessage[];
  readonly tools: readonly LlmToolDefinition[];
  readonly fetchImpl?: LlmFetch;
}): Promise<LlmChatResult> {
  if (!input.config.apiKey) {
    throw new Error('SPDS_AI_API_KEY not configured');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.config.timeoutMs);
  try {
    const res = await fetchImpl(`${input.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.config.apiKey}`,
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: 'auto',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: LlmToolCall[];
        };
      }>;
    };
    const choice = json.choices?.[0];
    if (!choice?.message) throw new Error('LLM response missing choices[0].message');
    return {
      finishReason: choice.finish_reason ?? null,
      message: {
        role: 'assistant',
        content: choice.message.content ?? null,
        ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
