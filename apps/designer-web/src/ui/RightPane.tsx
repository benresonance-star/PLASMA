import type { AppSession } from '../app-session.js';
import { appAnalysisIndicative } from '../app-session.js';
import type { AgentRunMode } from '../api-client.js';
import { rightPaneForPanel } from '../right-pane.js';
import type { PanelId } from '../shell.js';
import type { GraphFocusCommand } from '@spds/ai-interface';
import type { PendingBiaStrip, PendingImpactView } from '../pending-impact.js';
import type { SchemaDraftContext, SchemaDraftResult } from '../schema-draft.js';
import type { SchemaViewModel } from '../schema-view.js';
import { AiPanel } from './AiPanel.js';
import { AnalysisPanel } from './AnalysisPanel.js';
import { HistoryPanel } from './HistoryPanel.js';
import { InspectorPanel } from './InspectorPanel.js';
import { PipelinePanel } from './PipelinePanel.js';
import { SchemaPanel } from './SchemaPanel.js';
import { ValidationPanel } from './ValidationPanel.js';

export interface RightPaneProps {
  readonly activePanel: PanelId;
  readonly session: AppSession;
  readonly liveStatus: string;
  readonly aiIntent: string;
  readonly onAiIntentChange: (value: string) => void;
  readonly agentMode: AgentRunMode;
  readonly onAgentModeChange: (mode: AgentRunMode) => void;
  readonly aiBusy: boolean;
  readonly aiError: string | null;
  readonly onPreviewLength: (mm: number) => void;
  readonly onSetArmWidth: (mm: number) => void;
  readonly onSetStructuralDepth: (mm: number) => void;
  readonly onExactRegen: () => void;
  readonly onSelectPrimary: () => void;
  readonly onSnapshot: () => void;
  readonly onImport: () => void;
  readonly onOpenPanel: (panel: PanelId) => void;
  readonly onFocusGeometry: (semanticIds: readonly string[]) => void;
  readonly onSelectParameter?: (semanticId: string) => void;
  readonly onNavigateIssue: (issueId: string) => void;
  readonly onRestore: () => void;
  readonly onFork: () => void;
  readonly onRunAgent: () => void;
  readonly onAcceptRebuild: () => void;
  readonly onRejectPending?: () => void;
  readonly onPreviewPending?: () => void;
  readonly onPreviewPendingAndView?: () => void;
  readonly pendingImpact?: PendingImpactView | null;
  readonly pendingBia?: PendingBiaStrip | null;
  readonly previewStatus?: string | null;
  readonly onRefreshAnalysis?: () => void;
  readonly schemaView?: SchemaViewModel | null;
  readonly schemaStatus?: string;
  readonly selectedSchemaId?: string | null;
  readonly schemaDraftContext?: SchemaDraftContext;
  readonly onRefreshSchema?: () => void;
  readonly onSelectSchemaId?: (semanticId: string) => void;
  readonly onClearSchemaSelection?: () => void;
  readonly onSchemaDraftPending?: (result: SchemaDraftResult) => void;
  readonly onGraphFocusCommand?: (cmd: GraphFocusCommand) => void;
  readonly measureTool?: {
    readonly mode: string;
    readonly status: string;
    readonly active: { readonly kind: string; readonly provenance: string } | null;
  };
  readonly measureActiveLabel?: string | null;
  readonly measureCompareLabel?: string | null;
  readonly whatIfActive?: boolean;
  readonly whatIfStatus?: string;
  readonly onWhatIfFork?: () => void;
  readonly onWhatIfRun?: () => void;
  readonly onWhatIfReject?: () => void;
}

export function RightPane(props: RightPaneProps) {
  const kind = rightPaneForPanel(props.activePanel);
  const { session } = props;

  switch (kind) {
    case 'inspector':
      return (
        <InspectorPanel
          session={session}
          liveStatus={props.liveStatus}
          onPreviewLength={props.onPreviewLength}
          onSetArmWidth={props.onSetArmWidth}
          onSetStructuralDepth={props.onSetStructuralDepth}
          onExactRegen={props.onExactRegen}
          onSelectPrimary={props.onSelectPrimary}
          onSnapshot={props.onSnapshot}
          onImport={props.onImport}
          onOpenPanel={props.onOpenPanel}
          onFocusGeometry={props.onFocusGeometry}
          {...(props.onSelectParameter !== undefined
            ? { onSelectParameter: props.onSelectParameter }
            : {})}
          {...(props.measureTool !== undefined ? { measureTool: props.measureTool } : {})}
          {...(props.measureActiveLabel !== undefined
            ? { measureActiveLabel: props.measureActiveLabel }
            : {})}
          {...(props.measureCompareLabel !== undefined
            ? { measureCompareLabel: props.measureCompareLabel }
            : {})}
          {...(props.whatIfActive !== undefined ? { whatIfActive: props.whatIfActive } : {})}
          {...(props.whatIfStatus !== undefined ? { whatIfStatus: props.whatIfStatus } : {})}
          {...(props.onWhatIfFork !== undefined ? { onWhatIfFork: props.onWhatIfFork } : {})}
          {...(props.onWhatIfRun !== undefined ? { onWhatIfRun: props.onWhatIfRun } : {})}
          {...(props.onWhatIfReject !== undefined
            ? { onWhatIfReject: props.onWhatIfReject }
            : {})}
        />
      );
    case 'pipeline':
      return (
        <PipelinePanel
          pipeline={session.pipeline}
          {...(session.pipelineRun?.pipelineHash !== undefined
            ? { pipelineHash: session.pipelineRun.pipelineHash }
            : {})}
          live={session.liveBinding.pipelineFromRun}
          onFocusStage={(owner) => {
            if (owner) props.onFocusGeometry([owner]);
          }}
        />
      );
    case 'validation':
      return (
        <ValidationPanel
          validation={session.validation}
          validationFromCompile={session.liveBinding.validationFromCompile}
          onNavigateIssue={props.onNavigateIssue}
        />
      );
    case 'history':
      return (
        <HistoryPanel
          timeline={session.timeline}
          variants={session.variants}
          fallbackEntries={session.history.entries}
          compare={session.compare}
          restore={session.restore}
          fork={session.fork}
          historyFromStore={session.liveBinding.historyFromStore}
          onSnapshot={props.onSnapshot}
          onFocusIds={props.onFocusGeometry}
          onRestore={props.onRestore}
          onFork={props.onFork}
        />
      );
    case 'ai':
      return (
        <AiPanel
          aiIntent={props.aiIntent}
          onAiIntentChange={props.onAiIntentChange}
          agentMode={props.agentMode}
          onAgentModeChange={props.onAgentModeChange}
          aiBusy={props.aiBusy}
          aiError={props.aiError}
          whyLine={session.whyLine}
          aiBranchId={session.aiBranchId}
          pendingChangeSet={session.pendingChangeSet}
          aiChanges={session.aiChanges}
          onRunAgent={props.onRunAgent}
          onAcceptRebuild={props.onAcceptRebuild}
          onFocusTargets={props.onFocusGeometry}
          {...(props.onRejectPending !== undefined
            ? { onRejectPending: props.onRejectPending }
            : {})}
          {...(props.onPreviewPending !== undefined
            ? { onPreviewPending: props.onPreviewPending }
            : {})}
          {...(props.onPreviewPendingAndView !== undefined
            ? { onPreviewPendingAndView: props.onPreviewPendingAndView }
            : {})}
          {...(props.pendingImpact !== undefined ? { impact: props.pendingImpact } : {})}
          {...(props.pendingBia !== undefined ? { bia: props.pendingBia } : {})}
          {...(props.previewStatus !== undefined
            ? { previewStatus: props.previewStatus }
            : {})}
          {...(props.onGraphFocusCommand !== undefined
            ? { onGraphFocusCommand: props.onGraphFocusCommand }
            : {})}
        />
      );
    case 'analysis-mesh':
      return (
        <AnalysisPanel
          analysis={session.analysis}
          indicative={appAnalysisIndicative(session)}
          {...(props.onRefreshAnalysis !== undefined
            ? { onRefresh: props.onRefreshAnalysis }
            : {})}
          onFocusGroup={props.onFocusGeometry}
        />
      );
    case 'schema':
      return (
        <SchemaPanel
          schema={props.schemaView ?? null}
          statusLine={props.schemaStatus ?? 'Schema'}
          selectedSchemaId={props.selectedSchemaId ?? null}
          draftContext={
            props.schemaDraftContext ?? {
              modelId: session.modelId,
              branchId: session.aiBranchId ?? session.branchId,
              headHash: session.headHash,
              transactionId: session.lastTransactionId,
            }
          }
          pattern={session.pattern}
          onRefresh={props.onRefreshSchema ?? (() => undefined)}
          onSelectSemanticId={props.onSelectSchemaId ?? (() => undefined)}
          {...(props.onClearSchemaSelection
            ? { onClearSelection: props.onClearSchemaSelection }
            : {})}
          onDraftPending={props.onSchemaDraftPending ?? (() => undefined)}
        />
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
