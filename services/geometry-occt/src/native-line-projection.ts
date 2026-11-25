import { z } from 'zod';
import type { OcjsModule, OcjsShape } from './occt-js.js';

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
export const NativeLineProjectionRequestSchema = z.object({
  representationId: z.string().min(1),
  origin: vec3,
  right: vec3,
  down: vec3,
}).strict().superRefine((frame, ctx) => {
  if (Math.abs(Math.hypot(...frame.right) - 1) > 1e-9 ||
      Math.abs(Math.hypot(...frame.down) - 1) > 1e-9 ||
      Math.abs(dot(frame.right, frame.down)) > 1e-9) {
    ctx.addIssue({ code: 'custom', message: 'Projection axes must be orthonormal' });
  }
});
export type NativeLineProjectionRequest = z.infer<typeof NativeLineProjectionRequestSchema>;

type NativePoint = { X(): number; Y(): number; Z(): number; delete(): void };
type CurveAdaptor = {
  GetType(): unknown;
  FirstParameter(): number;
  LastParameter(): number;
  Value(u: number): NativePoint;
  delete(): void;
};
type LineBindings = {
  BRepAdaptor_Curve_2?: new (edge: OcjsShape) => CurveAdaptor;
  GeomAbs_CurveType?: { GeomAbs_Line?: unknown };
};
type Point2 = [number, number];

function coordinates(p: NativePoint): [number, number, number] {
  try {
    const xyz: [number, number, number] = [p.X(), p.Y(), p.Z()];
    if (!xyz.every(Number.isFinite)) throw new Error('Non-finite native curve point');
    return xyz;
  } finally { p.delete(); }
}

export function projectNativeStraightEdge(
  oc: OcjsModule, edge: OcjsShape, frame: NativeLineProjectionRequest,
): { start: Point2; end: Point2 } {
  // Structural check at runtime: the pinned WASM build may not expose this adaptor.
  const bindings = oc as OcjsModule & LineBindings;
  const Adaptor = bindings.BRepAdaptor_Curve_2;
  const lineType = bindings.GeomAbs_CurveType?.GeomAbs_Line;
  if (!Adaptor || lineType === undefined) throw new Error('Native line adaptor unavailable');
  const curve = new Adaptor(edge);
  try {
    if (curve.GetType() !== lineType) throw new Error('Non-linear native edge is unsupported');
    const first = curve.FirstParameter(), last = curve.LastParameter();
    if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) throw new Error('Invalid native edge parameter range');
    const project = (p: [number, number, number]): Point2 => {
      const relative = p.map((x, i) => x - frame.origin[i]!);
      const xy: Point2 = [dot(relative, frame.right), dot(relative, frame.down)];
      if (!xy.every(Number.isFinite)) throw new Error('Non-finite projected point');
      return xy;
    };
    return { start: project(coordinates(curve.Value(first))), end: project(coordinates(curve.Value(last))) };
  } finally { curve.delete(); }
}
