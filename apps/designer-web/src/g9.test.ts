import { describe, expect, it } from 'vitest';
import { buildPipelineView, drillInStage } from './pipeline-view.js';
import { buildPatternInspector, updateDraftParameter } from './pattern-inspector.js';
import { buildDependencyExplorer } from './dependency-explorer.js';
import { buildValidationNavigator, navigateToIssue } from './validation-navigator.js';
import { buildValidationReport } from '@spds/validation-core';

describe('G9.1 pipeline view', () => {
  it('shows timings and navigable failures', () => {
    const view = buildPipelineView({
      dagId: 'dag:1',
      nodes: [
        {
          id: 'n1',
          operator: 'icosahedron',
          semanticOwner: 'dome:1',
          status: 'succeeded',
          timingMs: 12,
          dependsOn: [],
        },
        {
          id: 'n2',
          operator: 'y-network',
          semanticOwner: 'Y:1',
          status: 'failed',
          timingMs: 5,
          diagnostics: ['BOOLEAN_FAILED'],
          dependsOn: ['n1'],
        },
      ],
    });
    expect(view.totalTimingMs).toBe(17);
    expect(view.failedStageIds).toEqual(['n2']);
    expect(drillInStage(view, 'n2')?.errors).toContain('BOOLEAN_FAILED');
  });
});

describe('G9.2 pattern inspector', () => {
  it('renders graph and allows draft-only edits', () => {
    let view = buildPatternInspector({
      patternId: 'pat:geodesic',
      name: 'geodesic',
      parameters: { frequency: 3 },
      operatorBindings: { 'op:subdivide': 'subdivide.v1' },
    });
    expect(view.nodes.some((n) => n.kind === 'parameter')).toBe(true);
    view = updateDraftParameter(view, 'frequency', 4);
    expect(view.parameters.frequency).toBe(4);
  });
});

describe('G9.3 dependency explorer', () => {
  it('lists upstream and downstream for selection', () => {
    const view = buildDependencyExplorer('Y:1', [
      { from: 'dome:1', to: 'Y:1' },
      { from: 'Y:1', to: 'part:Y1' },
      { from: 'Y:1', to: 'mesh:Y1' },
    ]);
    expect(view.upstream).toEqual(['dome:1']);
    expect(view.downstream).toEqual(['mesh:Y1', 'part:Y1']);
  });
});

describe('G9.4 validation navigator', () => {
  it('navigates failure to affected semantic with color coding', () => {
    const report = buildValidationReport({
      modelId: 'm',
      branchId: 'b',
      issues: [
        {
          id: 'iss:1',
          code: 'FABRICATION_INVALID',
          severity: 'fail',
          summary: 'cut list incomplete',
          affectedSemanticIds: ['Y:9'],
        },
      ],
    });
    let nav = buildValidationNavigator(report);
    expect(nav.colorBySemanticId['Y:9']).toBe('fail');
    nav = navigateToIssue(nav, 'iss:1');
    expect(nav.focusedSemanticId).toBe('Y:9');
  });
});
