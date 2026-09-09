import type { ChangeEvent, FocusEvent } from 'react';
import { Box, History, RefreshCw, Upload } from 'lucide-react';
import type { AppSession } from '../app-session.js';
import { appSelectionSynced, appPrimarySemanticId } from '../app-session.js';
import {
  d01ParamKeyFromSemanticId,
  d01ParamSemanticId,
  type D01ParamKey,
} from '../param-selection.js';
import type { PanelId } from '../shell.js';
import { publicationChromeLabel } from '../viewport.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Separator } from '../components/ui/separator.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';
import { PanelChrome } from './PanelChrome.js';

const INSPECTOR_STATUS_TOOLTIP =
  'Publication chrome and live binding status for the active model revision. Candidate means you are editing the working revision; Published reflects the last published state.';

const LENGTH_TOOLTIP =
  'Y length preview for the primary dome member. Drag to scrub a live preview; Exact regen commits a full geometry regenerate at this length.';

const ARM_WIDTH_TOOLTIP =
  'Arm width parameter for the selected D01 member. Focusing this field selects the parameter in the causal lens so you can see upstream/downstream impact.';

const STRUCT_DEPTH_TOOLTIP =
  'Structural depth parameter for the selected D01 member. Focusing this field syncs selection with the causal lens for impact highlighting.';

const MEASURE_TOOLTIP =
  'Measure status mirror. Use the ruler HUD to pick Distance, Angle, or Area; saved measurements appear here and highlight in the viewport when selected.';

const EXACT_REGEN_TOOLTIP =
  'Run an exact geometry regenerate for the current parameters (not just a length preview). Use this when the draft preview must become authoritative tessellation.';

const SELECT_PRIMARY_TOOLTIP =
  'Select the primary semantic object for this model so inspector, viewport, and causal lens share the same anchor.';

const SNAPSHOT_TOOLTIP =
  'Capture a versioned snapshot of the current branch head for history restore later. Does not publish the model.';

const IMPORT_STEP_TOOLTIP =
  'Import a STEP file into the model as geometry/content under the explorer. Useful for bringing external parts into the live substrate.';

const WHAT_IF_TOOLTIP =
  'Transient what-if drafts: Fork clones a draft channel, Run preview regenerates ghost geometry for comparison, Reject discards the draft and restores the baseline.';

const FORK_TOOLTIP =
  'Fork a transient what-if draft from the current parameters without mutating the published or candidate baseline.';

const RUN_PREVIEW_TOOLTIP =
  'Regenerate ghost geometry for the active what-if draft so you can compare impact before accepting changes.';

const REJECT_TOOLTIP =
  'Discard the active what-if draft and restore the baseline model state and viewport.';

const PATTERN_TOOLTIP =
  'Active pattern binding and its parameters. This is the semantic pattern driving the selected structure.';

const DEPENDENCIES_TOOLTIP =
  'Upstream (↑) producers and downstream (↓) dependents of the current selection. Click an id to focus that object in the viewport.';

const FOCUSED_PANELS_TOOLTIP =
  'Jump to specialized right-pane views — pipeline run, validation issues, history/variants, AI changesets, and analysis mesh.';

const FABRICATION_TOOLTIP =
  'Fabrication artifacts produced by publish/pipeline runs, with content hashes and verification status.';

const PANEL_OPEN_TOOLTIPS = {
  pipeline: 'Open the pipeline panel to inspect the latest compile/run hash, stages, and artifacts.',
  validation: 'Open validation to review constraint and rule issues for the current model.',
  history: 'Open history to browse snapshots, restore points, and forks/variants.',
  ai: 'Open the AI panel for agent runs, proposed changesets, and accept/reject flows.',
  'analysis-mesh': 'Open analysis mesh to review derived analysis display for the current model.',
} as const satisfies Record<
  Exclude<PanelId, 'explorer' | 'inspector' | 'viewport' | 'schema'>,
  string
>;

export interface InspectorPanelProps {
  readonly session: AppSession;
  readonly liveStatus: string;
  readonly onPreviewLength: (mm: number) => void;
  readonly onSetArmWidth: (mm: number) => void;
  readonly onSetStructuralDepth: (mm: number) => void;
  readonly onExactRegen: () => void;
  readonly onSelectPrimary: () => void;
  readonly onSnapshot: () => void;
  readonly onImport: () => void;
  readonly onOpenPanel: (panel: PanelId) => void;
  readonly onFocusGeometry: (semanticIds: readonly string[]) => void;
  /** Select a D01 parameter in the shared selection store (syncs causal lens). */
  readonly onSelectParameter?: (semanticId: string) => void;
  readonly measureTool?: {
    readonly mode: string;
    readonly status: string;
    readonly active: { readonly kind: string; readonly provenance: string } | null;
  };
  readonly measureActiveLabel?: string | null;
  readonly measureCompareLabel?: string | null;
  /** Live What-if (F1) — ghost preview channel. */
  readonly whatIfActive?: boolean;
  readonly whatIfStatus?: string;
  readonly onWhatIfFork?: () => void;
  readonly onWhatIfRun?: () => void;
  readonly onWhatIfReject?: () => void;
}

export function InspectorPanel(props: InspectorPanelProps) {
  const { session } = props;
  const selected = session.g8.selection.selectedSemanticId;
  const selectedParam = d01ParamKeyFromSemanticId(selected);

  const selectParam = (key: D01ParamKey) => {
    props.onSelectParameter?.(d01ParamSemanticId(key));
  };

  const onParamFocus = (key: D01ParamKey) => (_ev: FocusEvent) => {
    selectParam(key);
  };

  return (
    <PanelChrome
      panel="inspector"
      title="Inspector"
      icon={<Box className="size-3.5 text-muted-foreground" aria-hidden />}
      status={`${publicationChromeLabel(session.g8.chrome)} · ${props.liveStatus}`}
    >
      <HelpTooltipScope>
        <HelpTooltip content={INSPECTOR_STATUS_TOOLTIP} asChild={false}>
          <p className="spds-meta">
            Chrome: {publicationChromeLabel(session.g8.chrome)} · Selection: {selected ?? 'none'} ·
            Sync: {appSelectionSynced(session) ? 'ok' : 'drift'} · Pub: {session.publicationStatus}
          </p>
        </HelpTooltip>
        <p className="spds-meta">
          AI branch: {session.pendingChangeSet?.branchId ?? session.aiBranchId ?? '—'} · Tx:{' '}
          {session.lastTransactionId ?? '—'}
        </p>

        <Separator />

        <div
          className={`spds-field${selectedParam === 'lengthMm' ? ' is-param-selected' : ''}`}
          data-param-key="lengthMm"
          onMouseDown={() => selectParam('lengthMm')}
        >
          <HelpTooltip content={LENGTH_TOOLTIP}>
            <Label htmlFor="y-length">Y length (mm)</Label>
          </HelpTooltip>
          <input
            id="y-length"
            type="range"
            min={session.g8.lengthEdit.spec.min}
            max={session.g8.lengthEdit.spec.max}
            value={session.g8.lengthEdit.draftValue}
            onFocus={onParamFocus('lengthMm')}
            onChange={(ev) => {
              selectParam('lengthMm');
              props.onPreviewLength(Number(ev.target.value));
            }}
          />
          <p className="spds-meta">
            {session.g8.lengthEdit.draftValue} — {session.g8.lengthEdit.statusLabel}
          </p>
        </div>

        <div
          className={`spds-field${selectedParam === 'armWidthMm' ? ' is-param-selected' : ''}`}
          data-param-key="armWidthMm"
          onMouseDown={() => selectParam('armWidthMm')}
        >
          <HelpTooltip content={ARM_WIDTH_TOOLTIP}>
            <Label htmlFor="arm-width">Arm width (mm)</Label>
          </HelpTooltip>
          <Input
            id="arm-width"
            type="number"
            min={10}
            max={200}
            value={session.params.armWidthMm}
            onFocus={onParamFocus('armWidthMm')}
            onChange={(ev: ChangeEvent<HTMLInputElement>) => {
              selectParam('armWidthMm');
              props.onSetArmWidth(Number(ev.target.value));
            }}
          />
        </div>

        <div
          className={`spds-field${selectedParam === 'structuralDepthMm' ? ' is-param-selected' : ''}`}
          data-param-key="structuralDepthMm"
          onMouseDown={() => selectParam('structuralDepthMm')}
        >
          <HelpTooltip content={STRUCT_DEPTH_TOOLTIP}>
            <Label htmlFor="struct-depth">Structural depth (mm)</Label>
          </HelpTooltip>
          <Input
            id="struct-depth"
            type="number"
            min={10}
            max={200}
            value={session.params.structuralDepthMm}
            onFocus={onParamFocus('structuralDepthMm')}
            onChange={(ev: ChangeEvent<HTMLInputElement>) => {
              selectParam('structuralDepthMm');
              props.onSetStructuralDepth(Number(ev.target.value));
            }}
          />
        </div>

        {session.g8.measurement ? (
          <p className="spds-meta">
            Param length: {session.g8.measurement.quantity.toFixed(1)} {session.g8.measurement.unit}
          </p>
        ) : null}

        <Separator />
        <section className="spds-section">
          <HelpTooltip content={MEASURE_TOOLTIP} asChild={false}>
            <h3>Measure</h3>
          </HelpTooltip>
          <p className="spds-meta">
            Mode: {props.measureTool?.mode ?? 'idle'}
            {props.measureTool?.active
              ? ` · ${props.measureTool.active.kind} (${props.measureTool.active.provenance})`
              : ''}
          </p>
          {props.measureActiveLabel ? (
            <p className="spds-meta">Active: {props.measureActiveLabel}</p>
          ) : (
            <p className="spds-meta">
              Open the measure HUD from the ruler icon, pick Distance / Angle / Area, and manage saved
              measurements in the list (select to highlight in the viewport).
            </p>
          )}
          {props.measureCompareLabel ? (
            <p className="spds-meta">{props.measureCompareLabel}</p>
          ) : null}
          {props.measureTool?.status ? (
            <p className="spds-meta">{props.measureTool.status}</p>
          ) : null}
        </section>

        <div className="spds-row">
          <HelpTooltip content={EXACT_REGEN_TOOLTIP}>
            <Button type="button" size="sm" onClick={() => props.onExactRegen()}>
              <RefreshCw data-icon="inline-start" />
              Exact regen
            </Button>
          </HelpTooltip>
          <HelpTooltip content={SELECT_PRIMARY_TOOLTIP}>
            <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectPrimary()}>
              Select primary
            </Button>
          </HelpTooltip>
          <HelpTooltip content={SNAPSHOT_TOOLTIP}>
            <Button type="button" size="sm" variant="outline" onClick={() => props.onSnapshot()}>
              <History data-icon="inline-start" />
              Snapshot
            </Button>
          </HelpTooltip>
          <HelpTooltip content={IMPORT_STEP_TOOLTIP}>
            <Button type="button" size="sm" variant="outline" onClick={() => props.onImport()}>
              <Upload data-icon="inline-start" />
              Import STEP
            </Button>
          </HelpTooltip>
        </div>

        <Separator />

        {props.onWhatIfFork ? (
          <section className="spds-section">
            <HelpTooltip content={WHAT_IF_TOOLTIP} asChild={false}>
              <h3>What-if</h3>
            </HelpTooltip>
            <p className="spds-meta">
              {props.whatIfStatus ??
                (props.whatIfActive
                  ? 'Forked — Run preview regenerates ghosts; Reject restores baseline'
                  : 'Fork a transient draft, then Run preview (regenerated geometry)')}
            </p>
            <div className="spds-row">
              <HelpTooltip content={FORK_TOOLTIP}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={props.whatIfActive}
                  onClick={() => props.onWhatIfFork?.()}
                >
                  Fork
                </Button>
              </HelpTooltip>
              <HelpTooltip content={RUN_PREVIEW_TOOLTIP}>
                <Button
                  type="button"
                  size="sm"
                  disabled={!props.whatIfActive}
                  onClick={() => props.onWhatIfRun?.()}
                >
                  Run preview
                </Button>
              </HelpTooltip>
              <HelpTooltip content={REJECT_TOOLTIP}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!props.whatIfActive}
                  onClick={() => props.onWhatIfReject?.()}
                >
                  Reject
                </Button>
              </HelpTooltip>
            </div>
          </section>
        ) : null}

        <section className="spds-section">
          <HelpTooltip content={PATTERN_TOOLTIP} asChild={false}>
            <h3>Pattern</h3>
          </HelpTooltip>
          <p className="spds-meta">{session.pattern.name}</p>
          <pre className="spds-code">{JSON.stringify(session.pattern.parameters, null, 2)}</pre>
        </section>

        <section className="spds-section">
          <HelpTooltip content={DEPENDENCIES_TOOLTIP} asChild={false}>
            <h3>Dependencies</h3>
          </HelpTooltip>
          <p className="spds-meta">
            ↑{' '}
            {session.deps.upstream.length
              ? session.deps.upstream.map((id) => (
                  <Button
                    key={`up-${id}`}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto px-1 py-0"
                    onClick={() => props.onFocusGeometry([id])}
                  >
                    {id}
                  </Button>
                ))
              : '—'}
            <br />↓{' '}
            {session.deps.downstream.length
              ? session.deps.downstream.map((id) => (
                  <Button
                    key={`dn-${id}`}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto px-1 py-0"
                    onClick={() => props.onFocusGeometry([id])}
                  >
                    {id}
                  </Button>
                ))
              : '—'}
          </p>
        </section>

        <section className="spds-section">
          <HelpTooltip content={FOCUSED_PANELS_TOOLTIP} asChild={false}>
            <h3>Focused panels</h3>
          </HelpTooltip>
          <div className="spds-row">
            {(
              [
                ['pipeline', 'Pipeline'],
                ['validation', 'Validation'],
                ['history', 'History'],
                ['ai', 'AI'],
                ['analysis-mesh', 'Analysis'],
              ] as const
            ).map(([id, label]) => (
              <HelpTooltip key={id} content={PANEL_OPEN_TOOLTIPS[id]}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => props.onOpenPanel(id)}
                >
                  Open {label}
                </Button>
              </HelpTooltip>
            ))}
          </div>
          <p className="spds-meta">Primary: {appPrimarySemanticId()}</p>
        </section>

        <section className="spds-section">
          <HelpTooltip content={FABRICATION_TOOLTIP} asChild={false}>
            <h3>Fabrication</h3>
          </HelpTooltip>
          <ul className="spds-list">
            {session.fabArtifacts.map((a) => (
              <li key={a.contentHash} className="spds-meta">
                {a.contentHash.slice(0, 12)} · {a.verified ? 'verified' : 'unverified'}
              </li>
            ))}
          </ul>
        </section>
      </HelpTooltipScope>
    </PanelChrome>
  );
}
