import { Label } from '../components/ui/label.js';
import { Switch } from '../components/ui/switch.js';
import { Button } from '../components/ui/button.js';
import { DraggableHud, type HudPosition } from './DraggableHud.js';

export interface EngineLayerState {
  readonly visible: boolean;
  readonly opacity: number;
}

export interface ViewportEngineCompareProps {
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly position?: HudPosition | null;
  readonly onPositionChange?: (position: HudPosition) => void;
  readonly referenceLabel: string;
  readonly serviceLabel: string;
  readonly serviceAvailable: boolean;
  readonly serviceError?: string;
  readonly reference: EngineLayerState;
  readonly geometryService: EngineLayerState;
  readonly onChangeReference: (next: EngineLayerState) => void;
  readonly onChangeService: (next: EngineLayerState) => void;
  readonly onRetryService?: () => void;
  readonly retryBusy?: boolean;
}

export function ViewportEngineCompare(props: ViewportEngineCompareProps) {
  return (
    <DraggableHud
      title="Geometry engines"
      open={props.open}
      {...(props.onOpenChange !== undefined ? { onOpenChange: props.onOpenChange } : {})}
      defaultPosition={{ x: 16, y: 48 }}
      {...(props.position ? { position: props.position } : { defaultAnchor: 'top-right' as const })}
      {...(props.onPositionChange !== undefined
        ? { onPositionChange: props.onPositionChange }
        : {})}
      className="spds-engine-compare"
      testId="viewport-engine-compare"
    >
      <EngineRow
        label={props.referenceLabel}
        state={props.reference}
        onChange={props.onChangeReference}
      />
      <EngineRow
        label={props.serviceLabel}
        state={props.geometryService}
        disabled={!props.serviceAvailable}
        onChange={props.onChangeService}
      />
      {props.serviceError ? (
        <p className="spds-meta spds-engine-compare-error">
          {props.serviceError}
          {!props.serviceAvailable
            ? ' — start geometry-occt on :7080, then Retry'
            : ''}
        </p>
      ) : null}
      <div className="spds-engine-compare-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            props.onChangeReference({ visible: true, opacity: 1 });
            props.onChangeService({ visible: true, opacity: 0 });
          }}
        >
          Solo ref
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!props.serviceAvailable}
          onClick={() => {
            props.onChangeReference({ visible: true, opacity: 0 });
            props.onChangeService({ visible: true, opacity: 1 });
          }}
        >
          Solo svc
        </Button>
        {props.onRetryService ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={props.retryBusy}
            onClick={() => props.onRetryService?.()}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </DraggableHud>
  );
}

function EngineRow(props: {
  readonly label: string;
  readonly state: EngineLayerState;
  readonly disabled?: boolean;
  readonly onChange: (next: EngineLayerState) => void;
}) {
  const id = `engine-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={`spds-engine-row${props.disabled ? ' is-disabled' : ''}`}>
      <div className="spds-engine-row-head">
        <Switch
          checked={props.state.visible}
          disabled={props.disabled}
          onCheckedChange={(visible) => props.onChange({ ...props.state, visible })}
          aria-label={`Toggle ${props.label}`}
        />
        <Label htmlFor={id}>{props.label}</Label>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        disabled={props.disabled || !props.state.visible}
        value={Math.round(props.state.opacity * 100)}
        onChange={(ev) =>
          props.onChange({ ...props.state, opacity: Number(ev.target.value) / 100 })
        }
      />
    </div>
  );
}
