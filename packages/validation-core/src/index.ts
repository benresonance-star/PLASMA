/** Validation issue model — shared by navigator UI and fabrication gates. */

export type ValidationSeverity = 'info' | 'warn' | 'fail';
export type ObjectUiState = 'valid' | 'warn' | 'fail' | 'preview' | 'stale';

export interface ValidationIssue {
  readonly id: string;
  readonly code: string;
  readonly severity: ValidationSeverity;
  readonly summary: string;
  readonly affectedSemanticIds: readonly string[];
  readonly stage?: string;
}

export interface ValidationReport {
  readonly modelId: string;
  readonly branchId: string;
  readonly issues: readonly ValidationIssue[];
  readonly generatedAt: string;
}

export function objectUiStateFromIssues(
  issues: readonly ValidationIssue[],
  options?: { readonly preview?: boolean; readonly stale?: boolean },
): ObjectUiState {
  if (options?.stale) return 'stale';
  if (options?.preview) return 'preview';
  if (issues.some((i) => i.severity === 'fail')) return 'fail';
  if (issues.some((i) => i.severity === 'warn')) return 'warn';
  return 'valid';
}

export function issuesForSemantic(
  report: ValidationReport,
  semanticId: string,
): readonly ValidationIssue[] {
  return report.issues.filter((i) => i.affectedSemanticIds.includes(semanticId));
}

export function buildValidationReport(input: {
  readonly modelId: string;
  readonly branchId: string;
  readonly issues: readonly ValidationIssue[];
  readonly generatedAt?: string;
}): ValidationReport {
  return {
    modelId: input.modelId,
    branchId: input.branchId,
    issues: input.issues,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
