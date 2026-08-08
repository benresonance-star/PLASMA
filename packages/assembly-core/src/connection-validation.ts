/** G11.5 Connection validation — edge distance / clearance hooks. */

export type ConnectionValidationSeverity = 'warn' | 'fail';

export interface ConnectionValidationIssue {
  readonly code: 'EDGE_DISTANCE' | 'CLEARANCE' | 'INTERFERENCE';
  readonly severity: ConnectionValidationSeverity;
  readonly connectionId: string;
  readonly summary: string;
}

export interface ConnectionValidationInput {
  readonly connectionId: string;
  readonly edgeDistanceMm: number;
  readonly minEdgeDistanceMm: number;
  readonly clearanceMm: number;
  readonly minClearanceMm: number;
  readonly interferes: boolean;
}

export function validateConnection(input: ConnectionValidationInput): ConnectionValidationIssue[] {
  const issues: ConnectionValidationIssue[] = [];
  if (input.edgeDistanceMm < input.minEdgeDistanceMm) {
    issues.push({
      code: 'EDGE_DISTANCE',
      severity: 'fail',
      connectionId: input.connectionId,
      summary: `Edge distance ${input.edgeDistanceMm}mm < min ${input.minEdgeDistanceMm}mm`,
    });
  }
  if (input.clearanceMm < input.minClearanceMm) {
    issues.push({
      code: 'CLEARANCE',
      severity: 'warn',
      connectionId: input.connectionId,
      summary: `Clearance ${input.clearanceMm}mm below preferred ${input.minClearanceMm}mm`,
    });
  }
  if (input.interferes) {
    issues.push({
      code: 'INTERFERENCE',
      severity: 'fail',
      connectionId: input.connectionId,
      summary: 'Connection geometry interferes',
    });
  }
  return issues;
}

export function fabricationReadyBlocked(issues: readonly ConnectionValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'fail');
}
