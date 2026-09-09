import { formatMeasureQuantity, type MeasurePick, type MeasureToolState } from './measure-tool.js';
import type { SavedMeasurement } from './measure-library.js';
import { buildAngleViz, type MeasureOverlayInput } from './ui/three-scene.js';

function overlayFromPicks(input: {
  readonly kind: MeasureToolState['mode'];
  readonly snap: MeasureToolState['snap'];
  readonly picks: readonly MeasurePick[];
  readonly label: string;
  readonly finished: boolean;
  readonly emphasized?: boolean;
}): MeasureOverlayInput | null {
  if (input.kind === 'idle' || input.picks.length === 0) return null;
  const picks = input.picks;
  const finished = input.finished;
  const angleViz =
    input.kind === 'angle' &&
    finished &&
    picks.length >= 2 &&
    picks[0]?.extents
      ? buildAngleViz({
          snap: input.snap === 'face' ? 'face' : 'edge',
          pathA: picks[0].featurePath,
          pathB: picks[1]!.featurePath,
          extents: picks[0].extents,
          ...(picks[0].segment ? { segmentA: picks[0].segment } : {}),
          ...(picks[1]?.segment ? { segmentB: picks[1].segment } : {}),
        })
      : null;

  return {
    kind: input.kind,
    points:
      input.kind === 'edgeLength' && picks[0]?.segment
        ? picks[0].segment
        : picks.map((p) => p.worldPoint),
    ...(input.kind === 'angle' && !angleViz
      ? {
          directions: picks
            .map((p) => p.direction)
            .filter((d): d is readonly [number, number, number] => Boolean(d)),
        }
      : {}),
    ...(angleViz ? { angleViz } : {}),
    ...(input.kind === 'faceArea' && picks[0]?.extents && finished
      ? {
          faceHighlight: {
            featurePath: picks[0].featurePath,
            extents: picks[0].extents,
          },
        }
      : {}),
    ...(input.kind === 'angle' && input.snap === 'face' && picks[0]?.extents
      ? {
          faceHighlights: [
            {
              featurePath: picks[0].featurePath,
              extents: picks[0].extents,
              role: 'primary' as const,
            },
            ...(picks[1]
              ? [
                  {
                    featurePath: picks[1].featurePath,
                    extents: picks[1].extents ?? picks[0].extents,
                    role: 'secondary' as const,
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(input.kind === 'angle' && input.snap === 'edge' && picks[0]?.segment
      ? {
          edgeHighlights: [
            {
              start: picks[0].segment[0],
              end: picks[0].segment[1],
              role: 'primary' as const,
            },
            ...(picks[1]?.segment
              ? [
                  {
                    start: picks[1].segment[0],
                    end: picks[1].segment[1],
                    role: 'secondary' as const,
                  },
                ]
              : []),
          ],
        }
      : {}),
    label: input.label,
    ...(input.emphasized !== undefined ? { emphasized: input.emphasized } : {}),
  };
}

/** Live draft overlay while picking / just completed (before library save). */
export function buildDraftMeasureOverlay(
  tool: MeasureToolState,
): MeasureOverlayInput | null {
  if (tool.picks.length === 0 || tool.mode === 'idle') return null;
  const finished = Boolean(tool.active && !tool.pending);
  return overlayFromPicks({
    kind: tool.mode,
    snap: tool.snap,
    picks: tool.picks,
    label: finished && tool.active ? formatMeasureQuantity(tool.active) : '',
    finished,
    emphasized: true,
  });
}

export function buildSavedMeasureOverlay(
  item: SavedMeasurement,
  emphasized: boolean,
): MeasureOverlayInput | null {
  return overlayFromPicks({
    kind: item.kind,
    snap: item.snap,
    picks: item.picks,
    label: emphasized ? formatMeasureQuantity(item.result) : '',
    finished: true,
    emphasized,
  });
}
