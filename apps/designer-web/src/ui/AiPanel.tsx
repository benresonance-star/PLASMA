import type { ChangeEvent } from 'react';
import { Sparkles } from 'lucide-react';
import type { GraphFocusCommand } from '@spds/ai-interface';
import type { AgentRunMode } from '../api-client.js';
import type { AiChangesPanelItem, PendingAiChangeSet } from '../app-session.js';
import { pendingChangeSetTargetIds } from '@spds/graph-projection';
import { pendingToDeltaChangeSet } from '../pending-changeset-preview.js';
import type { PendingBiaStrip, PendingImpactView } from '../pending-impact.js';
import { Button } from '../components/ui/button.js';
import { Textarea } from '../components/ui/textarea.js';
import { PanelChrome } from './PanelChrome.js';

export interface AiPanelProps {
  readonly aiIntent: string;
  readonly onAiIntentChange: (value: string) => void;
  readonly agentMode: AgentRunMode;
  readonly onAgentModeChange: (mode: AgentRunMode) => void;
  readonly aiBusy: boolean;
  readonly aiError: string | null;
  readonly whyLine: string;
  readonly aiBranchId: string | null;
  readonly pendingChangeSet: PendingAiChangeSet | null;
  readonly aiChanges: readonly AiChangesPanelItem[];
  readonly impact?: PendingImpactView | null;
  readonly bia?: PendingBiaStrip | null;
  readonly previewStatus?: string | null;
  readonly onRunAgent: () => void;
  readonly onAcceptRebuild: () => void;
  readonly onRejectPending?: () => void;
  readonly onPreviewPending?: () => void;
  readonly onPreviewPendingAndView?: () => void;
  readonly onFocusTargets: (ids: readonly string[]) => void;
  /** Prefer GraphFocusCommand path (read-only nav) when provided. */
  readonly onGraphFocusCommand?: (cmd: GraphFocusCommand) => void;
}

export function AiPanel(props: AiPanelProps) {
  const pendingTargets = props.pendingChangeSet
    ? pendingChangeSetTargetIds(pendingToDeltaChangeSet(props.pendingChangeSet))
    : [];

  const focusPending = () => {
    if (pendingTargets.length === 0) return;
    if (props.onGraphFocusCommand) {
      props.onGraphFocusCommand({ type: 'focusGraph', semanticIds: pendingTargets });
      return;
    }
    props.onFocusTargets(pendingTargets);
  };

  return (
    <PanelChrome
      panel="ai"
      title="AI"
      icon={<Sparkles className="size-3.5 text-muted-foreground" aria-hidden />}
      status={`Branch ${props.pendingChangeSet?.branchId ?? props.aiBranchId ?? '—'} · pending ${props.pendingChangeSet?.changeSetId ?? 'none'}`}
    >
      <Textarea
        className="max-w-full break-words"
        value={props.aiIntent}
        onChange={(ev: ChangeEvent<HTMLTextAreaElement>) =>
          props.onAiIntentChange(ev.target.value)
        }
        rows={3}
      />
      <label className="spds-meta flex items-center gap-2">
        Mode
        <select
          className="spds-select"
          value={props.agentMode}
          disabled={props.aiBusy}
          onChange={(ev: ChangeEvent<HTMLSelectElement>) => {
            const v = ev.target.value;
            if (v === 'scripted' || v === 'llm' || v === 'auto') props.onAgentModeChange(v);
          }}
        >
          <option value="scripted">scripted</option>
          <option value="llm">llm</option>
          <option value="auto">auto</option>
        </select>
      </label>
      <div className="spds-row">
        <Button type="button" size="sm" disabled={props.aiBusy} onClick={() => props.onRunAgent()}>
          <Sparkles data-icon="inline-start" />
          Run agent
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.aiBusy || !props.pendingChangeSet || !props.onPreviewPending}
          onClick={() => props.onPreviewPending?.()}
        >
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.aiBusy || !props.pendingChangeSet || !props.onPreviewPendingAndView}
          onClick={() => props.onPreviewPendingAndView?.()}
        >
          Preview & View
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={props.aiBusy}
          onClick={() => props.onAcceptRebuild()}
        >
          Accept & rebuild
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.aiBusy || !props.pendingChangeSet || !props.onRejectPending}
          onClick={() => props.onRejectPending?.()}
        >
          Reject
        </Button>
      </div>
      {props.aiError ? <p className="spds-error">{props.aiError}</p> : null}
      {props.previewStatus ? <p className="spds-meta">{props.previewStatus}</p> : null}
      <p className="spds-meta">{props.whyLine}</p>
      {props.impact ? (
        <section className="mb-2 text-sm" data-testid="ai-impact-card">
          <h3 className="mb-1 font-medium">Impact</h3>
          <p className="spds-muted">
            Direct: {props.impact.directIds.join(', ') || '—'}
          </p>
          <p className="spds-muted">
            Downstream: {props.impact.downstreamIds.join(', ') || '—'}
          </p>
          <p className="spds-muted">
            Invalidates: {props.impact.invalidatesOn.length} id(s)
          </p>
        </section>
      ) : null}
      {props.bia &&
      (props.bia.before.length > 0 ||
        props.bia.intervention.length > 0 ||
        props.bia.after.length > 0) ? (
        <section className="mb-2 text-sm" data-testid="ai-bia-strip">
          <h3 className="mb-1 font-medium">Before / Intervention / After</h3>
          <p className="spds-muted">Before: {props.bia.before.join('; ') || '—'}</p>
          <p className="spds-muted">
            Intervention: {props.bia.intervention.join('; ') || '—'}
          </p>
          <p className="spds-muted">After: {props.bia.after.join('; ') || '—'}</p>
        </section>
      ) : null}
      <ul className="spds-list">
        {props.aiChanges.map((c) => (
          <li key={c.changeSetId}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-start whitespace-normal text-left h-auto py-2"
              disabled={pendingTargets.length === 0}
              onClick={() => focusPending()}
            >
              {c.changeSetId} · {c.disposition} · cmds {c.commandCount}
              {props.impact
                ? ` · impact ${props.impact.invalidatesOn.length}`
                : pendingTargets.length === 0
                  ? ' · no mesh target'
                  : ''}
            </Button>
          </li>
        ))}
      </ul>
      {pendingTargets.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => focusPending()}
        >
          Highlight pending targets
        </Button>
      ) : null}
    </PanelChrome>
  );
}
