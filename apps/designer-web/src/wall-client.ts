import type { Wall, WallOperation, WallOutput } from '@spds/wall-core';
import { apiBaseUrl } from './api-client.js';
export interface WallScope {
  modelId: string;
  branchId: string;
  headHash: string;
}
export interface WallPreview {
  transactionId: string;
  wall: Wall;
  output: WallOutput;
  affectedIds: string[];
}
export async function wallRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.summary ?? `Wall API ${response.status}`);
  return json as T;
}
export function previewWall(scope: WallScope, operation: WallOperation): Promise<WallPreview> {
  return wallRequest('/walls/preview', {
    modelId: scope.modelId,
    branchId: scope.branchId,
    expectedHeadHash: scope.headHash,
    operation,
  });
}
