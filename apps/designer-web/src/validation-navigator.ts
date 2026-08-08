/** G9.4 Validation navigator — click failure → select affected semantic. */

import type { ObjectUiState, ValidationIssue, ValidationReport } from '@spds/validation-core';
import { objectUiStateFromIssues } from '@spds/validation-core';

export interface ValidationNavigatorView {
  readonly issues: readonly ValidationIssue[];
  readonly selectedIssueId: string | null;
  readonly focusedSemanticId: string | null;
  readonly colorBySemanticId: Readonly<Record<string, ObjectUiState>>;
}

export function buildValidationNavigator(report: ValidationReport): ValidationNavigatorView {
  const byId = new Map<string, ValidationIssue[]>();
  for (const issue of report.issues) {
    for (const id of issue.affectedSemanticIds) {
      const list = byId.get(id) ?? [];
      list.push(issue);
      byId.set(id, list);
    }
  }
  const colorBySemanticId: Record<string, ObjectUiState> = {};
  for (const [id, issues] of byId) {
    colorBySemanticId[id] = objectUiStateFromIssues(issues);
  }
  return {
    issues: report.issues,
    selectedIssueId: null,
    focusedSemanticId: null,
    colorBySemanticId,
  };
}

export function navigateToIssue(
  view: ValidationNavigatorView,
  issueId: string,
): ValidationNavigatorView {
  const issue = view.issues.find((i) => i.id === issueId);
  if (!issue) return view;
  return {
    ...view,
    selectedIssueId: issueId,
    focusedSemanticId: issue.affectedSemanticIds[0] ?? null,
  };
}
