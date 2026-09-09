import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { ScrollArea } from '../components/ui/scroll-area.js';
import { Switch } from '../components/ui/switch.js';
import { Label } from '../components/ui/label.js';
import type { MeasureLibraryState, SavedMeasurement } from '../measure-library.js';
import {
  clearMeasure,
  formatMeasureQuantity,
  setMeasureMode,
  setMeasureSnap,
  type MeasureToolState,
} from '../measure-tool.js';
import { DraggableHud, type HudPosition } from './DraggableHud.js';

export interface MeasureHudProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly position?: HudPosition | null;
  readonly onPositionChange?: (position: HudPosition) => void;
  readonly tool: MeasureToolState;
  readonly onToolChange: (next: MeasureToolState | ((prev: MeasureToolState) => MeasureToolState)) => void;
  readonly library: MeasureLibraryState;
  readonly onSelect: (id: string | null) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onClearAll: () => void;
  readonly onToggleOverlays: (visible: boolean) => void;
  readonly onToggleListCollapsed: (collapsed: boolean) => void;
}

export function MeasureHud(props: MeasureHudProps) {
  const { tool, library } = props;
  const isAngle = tool.mode === 'angle';
  const isArea = tool.mode === 'faceArea';
  const isDistanceFamily = tool.mode === 'distance' || tool.mode === 'edgeLength';

  return (
    <DraggableHud
      title="Measure"
      open={props.open}
      onOpenChange={props.onOpenChange}
      defaultPosition={{ x: 12, y: 48 }}
      {...(props.position !== undefined ? { position: props.position } : {})}
      {...(props.onPositionChange !== undefined
        ? { onPositionChange: props.onPositionChange }
        : {})}
      className="spds-measure-hud"
      bodyClassName="spds-measure-hud-body"
      testId="measure-hud"
    >
      <div className="spds-measure-toolbar" role="toolbar" aria-label="Measure tools">
        <div className="spds-measure-row" role="group" aria-label="Measure kind">
          <div className="spds-measure-group">
            <Button
              type="button"
              size="sm"
              variant={isDistanceFamily ? 'default' : 'outline'}
              onClick={() => props.onToolChange((s) => setMeasureMode(s, 'distance'))}
            >
              Distance
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isAngle ? 'default' : 'outline'}
              onClick={() => props.onToolChange((s) => setMeasureMode(s, 'angle'))}
            >
              Angle
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isArea ? 'default' : 'outline'}
              onClick={() => props.onToolChange((s) => setMeasureMode(s, 'faceArea'))}
            >
              Area
            </Button>
          </div>
        </div>
        <div className="spds-measure-row" role="group" aria-label="Measure options">
          {isAngle ? (
            <div className="spds-measure-group" aria-label="Angle snap">
              <Button
                type="button"
                size="sm"
                variant={tool.snap === 'edge' ? 'default' : 'outline'}
                onClick={() => props.onToolChange((s) => setMeasureSnap(s, 'edge'))}
              >
                Edge↔Edge
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tool.snap === 'face' ? 'default' : 'outline'}
                onClick={() => props.onToolChange((s) => setMeasureSnap(s, 'face'))}
              >
                Face↔Face
              </Button>
            </div>
          ) : isArea ? (
            <div className="spds-measure-group" aria-label="Area measure options">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => props.onToolChange((s) => setMeasureMode(s, 'faceArea'))}
              >
                Face
              </Button>
            </div>
          ) : (
            <div className="spds-measure-group" aria-label="Distance measure options">
              <Button
                type="button"
                size="sm"
                variant={tool.mode === 'distance' ? 'default' : 'outline'}
                onClick={() => props.onToolChange((s) => setMeasureMode(s, 'distance'))}
              >
                Vertex
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tool.mode === 'edgeLength' ? 'default' : 'outline'}
                onClick={() => props.onToolChange((s) => setMeasureMode(s, 'edgeLength'))}
              >
                Edge
              </Button>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => props.onToolChange((s) => clearMeasure(s))}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="spds-measure-visibility">
        <Switch
          checked={library.overlaysVisible}
          onCheckedChange={props.onToggleOverlays}
          aria-label="Show measurements in viewport"
          id="measure-overlays-visible"
        />
        <Label htmlFor="measure-overlays-visible" className="spds-measure-visibility-label">
          {library.overlaysVisible ? (
            <>
              <Eye className="size-3.5" aria-hidden /> Show measurements
            </>
          ) : (
            <>
              <EyeOff className="size-3.5" aria-hidden /> Hide measurements
            </>
          )}
        </Label>
      </div>

      <p className="spds-meta spds-measure-status">{tool.status}</p>

      <div className="spds-measure-list-panel">
        <div className="spds-measure-list-head">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="spds-measure-list-toggle"
            aria-expanded={!library.listCollapsed}
            onClick={() => props.onToggleListCollapsed(!library.listCollapsed)}
          >
            {library.listCollapsed ? (
              <ChevronRight className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
            Measurements ({library.items.length})
          </Button>
          {library.items.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={props.onClearAll}
              aria-label="Delete all measurements"
            >
              Clear all
            </Button>
          ) : null}
        </div>
        {!library.listCollapsed ? (
          <ScrollArea className="spds-measure-list-scroll">
            {library.items.length === 0 ? (
              <p className="spds-meta spds-measure-list-empty">
                Complete a measure to save it here.
              </p>
            ) : (
              <ul className="spds-measure-list">
                {library.items.map((item) => (
                  <MeasureListItem
                    key={item.id}
                    item={item}
                    selected={library.selectedId === item.id}
                    onSelect={() => props.onSelect(item.id)}
                    onRename={(name) => props.onRename(item.id, name)}
                    onDelete={() => props.onDelete(item.id)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        ) : null}
      </div>
    </DraggableHud>
  );
}

function MeasureListItem(props: {
  readonly item: SavedMeasurement;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
}) {
  return (
    <li
      className={`spds-measure-list-item${props.selected ? ' is-selected' : ''}`}
    >
      <button
        type="button"
        className="spds-measure-list-select"
        onClick={props.onSelect}
        aria-pressed={props.selected}
      >
        <span className="spds-measure-list-kind">{props.item.kind}</span>
        <span className="spds-measure-list-value">
          {formatMeasureQuantity(props.item.result)}
        </span>
      </button>
      <Input
        value={props.item.name}
        aria-label={`Rename ${props.item.name}`}
        onChange={(ev) => props.onRename(ev.target.value)}
        onFocus={props.onSelect}
      />
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Delete ${props.item.name}`}
        onClick={props.onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
