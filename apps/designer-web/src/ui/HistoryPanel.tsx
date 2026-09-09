import { History } from 'lucide-react';
import type { CompareViewModel, RestoreForkAction } from '../history-view.js';
import { historyEventLabel } from '../history-delta-ui.js';
import { Button } from '../components/ui/button.js';
import { PanelChrome } from './PanelChrome.js';

export interface HistoryPanelProps {
  readonly timeline: readonly { readonly id: string; readonly label: string; readonly kind?: string }[];
  readonly variants: readonly {
    readonly id: string;
    readonly kind: 'variant';
    readonly label: string;
  }[];
  readonly fallbackEntries: readonly { readonly id: string; readonly label: string }[];
  readonly compare: CompareViewModel;
  readonly restore: RestoreForkAction;
  readonly fork: RestoreForkAction;
  readonly historyFromStore: boolean;
  readonly onSnapshot: () => void;
  readonly onFocusIds: (ids: readonly string[]) => void;
  readonly onRestore: () => void;
  readonly onFork: () => void;
}

function timelineKind(kind: string | undefined): 'history' | 'variant' {
  return kind === 'variant' || kind === 'fork' ? 'variant' : 'history';
}

export function HistoryPanel(props: HistoryPanelProps) {
  const historyEntries = props.timeline.length
    ? props.timeline.map((t) => ({
        id: t.id,
        label: historyEventLabel({
          kind: timelineKind(t.kind),
          label: t.label,
        }),
      }))
    : props.fallbackEntries.map((e) => ({
        id: e.id,
        label: historyEventLabel({ kind: 'history', label: e.label }),
      }));
  const variantEntries = props.variants.map((v) => ({
    id: v.id,
    label: historyEventLabel({ kind: 'variant', label: v.label }),
  }));
  const bindLabel = props.historyFromStore
    ? 'Live history store'
    : 'Local/demo timeline (restore updates history; fork is variant-only)';

  return (
    <PanelChrome
      panel="history"
      title="History"
      icon={<History className="size-3.5 text-muted-foreground" aria-hidden />}
      status={bindLabel}
    >
      <div className="spds-row">
        <Button type="button" size="sm" onClick={() => props.onSnapshot()}>
          Snapshot
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => props.onRestore()}>
          {props.restore.label}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => props.onFork()}>
          {props.fork.label}
        </Button>
      </div>
      {!props.historyFromStore ? (
        <p className="spds-meta">Demo binding — restore/fork do not rewrite remote branch heads.</p>
      ) : null}

      <section className="spds-section">
        <h3>Timeline</h3>
        <ul className="spds-list">
          {historyEntries.map((e) => (
            <li key={e.id} className="spds-meta">
              {e.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="spds-section">
        <h3>Variants</h3>
        {variantEntries.length === 0 ? (
          <p className="spds-meta">No variants — Fork creates a variant without appending history.</p>
        ) : (
          <ul className="spds-list">
            {variantEntries.map((e) => (
              <li key={e.id} className="spds-meta">
                {e.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="spds-section">
        <h3>Compare</h3>
        <p className="spds-meta">
          {props.compare.fromHash.slice(0, 8)} → {props.compare.toHash.slice(0, 8)} ·{' '}
          {props.compare.previewVsExact}
        </p>
        <ul className="spds-list">
          {props.compare.changedIds.map((id) => (
            <li key={id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => props.onFocusIds([id])}
              >
                changed · {id}
              </Button>
            </li>
          ))}
          {props.compare.addedIds.map((id) => (
            <li key={id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => props.onFocusIds([id])}
              >
                added · {id}
              </Button>
            </li>
          ))}
          {props.compare.removedIds.map((id) => (
            <li key={`rm-${id}`} className="spds-meta">
              removed · {id}
            </li>
          ))}
        </ul>
        {props.compare.changedIds.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => props.onFocusIds(props.compare.changedIds)}
          >
            Highlight all changed
          </Button>
        ) : null}
      </section>
    </PanelChrome>
  );
}
