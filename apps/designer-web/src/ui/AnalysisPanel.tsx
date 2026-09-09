import { ChartColumn } from 'lucide-react';
import type { AnalysisMeshViewModel } from '../analysis-mesh-view.js';
import { Button } from '../components/ui/button.js';
import { PanelChrome } from './PanelChrome.js';

export const ANALYSIS_COPY = {
  indicative: 'Computational / indicative — not a certification claim',
  /** Positive certification language that must not appear as authority. */
  forbidden: ['certified', 'approved by', 'officially certified'] as const,
} as const;

export interface AnalysisPanelProps {
  readonly analysis: AnalysisMeshViewModel;
  readonly indicative: boolean;
  readonly onRefresh?: () => void;
  readonly onFocusGroup: (semanticIds: readonly string[]) => void;
}

export function AnalysisPanel(props: AnalysisPanelProps) {
  return (
    <PanelChrome
      panel="analysis-mesh"
      title="Analysis"
      icon={<ChartColumn className="size-3.5 text-muted-foreground" aria-hidden />}
      status={props.indicative ? ANALYSIS_COPY.indicative : props.analysis.chromeNote}
    >
      <p className="spds-meta">
        {props.analysis.meshArtifactHash} · elements {props.analysis.elementCount} ·{' '}
        {props.indicative ? 'indicative' : 'authoritative'}
      </p>
      {props.onRefresh ? (
        <Button type="button" size="sm" variant="outline" onClick={() => props.onRefresh?.()}>
          Refresh analysis
        </Button>
      ) : null}
      <section className="spds-section">
        <h3>Groups</h3>
        <ul className="spds-list">
          {props.analysis.groups.map((g) => (
            <li key={g.name}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start whitespace-normal text-left h-auto py-2"
                disabled={g.semanticIds.length === 0}
                onClick={() => props.onFocusGroup(g.semanticIds)}
              >
                {g.name} · {g.role} · {g.semanticIds.length} owners
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <p className="spds-meta">{ANALYSIS_COPY.indicative}</p>
    </PanelChrome>
  );
}
