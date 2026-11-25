import { z } from 'zod';
import { sha256Canonical } from '@spds/reproducibility';
import type { OcjsModule, OcjsShape } from './occt-js.js';

const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const NativeHlrRequestSchema = z.object({
  representationIds: z.array(z.string().min(1)).min(1).max(32),
  origin: vec, right: vec, down: vec,
}).strict().superRefine((f, ctx) => {
  const dot = f.right[0]*f.down[0] + f.right[1]*f.down[1] + f.right[2]*f.down[2];
  if (new Set(f.representationIds).size !== f.representationIds.length ||
      Math.abs(Math.hypot(...f.right)-1)>1e-9 ||
      Math.abs(Math.hypot(...f.down)-1)>1e-9 || Math.abs(dot)>1e-9)
    ctx.addIssue({ code: 'custom', message: 'Unique sources and orthonormal frame required' });
});
export type NativeHlrRequest = z.infer<typeof NativeHlrRequestSchema>;
type Source = { representationId: string; semanticOwner: string; shape: OcjsShape };
type Point = { X(): number; Y(): number; Z(): number; delete(): void };
type Curve = { GetType(): unknown; FirstParameter(): number; LastParameter(): number; Value(u: number): Point; delete(): void };
type HlrShape = OcjsShape & { IsNull(): boolean; delete(): void };
type Algo = { Add_2(s: OcjsShape,n: number): void; Projector_1(p: unknown): void; Update(): void; Hide_1(): void };
type HlrResult = { VCompound_1(): HlrShape; HCompound_1(): HlrShape; VCompound_2(s: OcjsShape): HlrShape; HCompound_2(s: OcjsShape): HlrShape };
type Bindings = {
  HLRBRep_Algo_1: new () => Algo;
  Handle_HLRBRep_Algo_2: new (a: Algo) => unknown;
  HLRAlgo_Projector_2: new (a: unknown) => unknown;
  gp_Ax2_2: new (p: unknown,n: unknown,r: unknown) => unknown;
  HLRBRep_HLRToShape: new (h: unknown) => HlrResult;
  BRepAdaptor_Curve_2: new (s: OcjsShape) => Curve;
  GeomAbs_CurveType: { GeomAbs_Line: unknown };
};
type Point2 = [number,number];
type Line = { start: Point2; end: Point2 };
let used = false;

/** One-shot diagnostic only: run inside a dedicated child process. The reference
 * HLR bindings use reference-counted handles; repeated in-process ownership and
 * release are not yet verified. Never expose this function as a server route.
 * No mesh fallback, no topology-edit claims, no curved output approximation.
 */
export function projectNativeAssemblyHlrOnce(oc: OcjsModule, input: NativeHlrRequest, sources: readonly Source[], version: string) {
  const frame = NativeHlrRequestSchema.parse(input);
  if (used) throw new Error('Native HLR diagnostic is single-use per process');
  if (sources.length !== frame.representationIds.length ||
      sources.some((s,i)=>s.representationId!==frame.representationIds[i]))
    throw new Error('Native HLR source mismatch');
  const api = oc as OcjsModule & Bindings;
  if (!api.HLRBRep_Algo_1 || !api.Handle_HLRBRep_Algo_2 || !api.HLRAlgo_Projector_2 ||
      !api.gp_Ax2_2 || !api.HLRBRep_HLRToShape || !api.BRepAdaptor_Curve_2)
    throw new Error('Native HLR bindings unavailable');
  used = true;
  const { origin, right: r, down: d } = frame;
  const normal = [d[1]*r[2]-d[2]*r[1],d[2]*r[0]-d[0]*r[2],d[0]*r[1]-d[1]*r[0]] as const;
  const axis = new api.gp_Ax2_2(new oc.gp_Pnt_3(...origin),new oc.gp_Dir_4(...normal),new oc.gp_Dir_4(...r));
  const algo = new api.HLRBRep_Algo_1();
  const handle = new api.Handle_HLRBRep_Algo_2(algo);
  for (const source of sources) algo.Add_2(source.shape,0);
  algo.Projector_1(new api.HLRAlgo_Projector_2(axis)); algo.Update(); algo.Hide_1();
  const result = new api.HLRBRep_HLRToShape(handle);
  function lines(shape: HlrShape): Line[] {
    const out: Line[] = [];
    if (shape.IsNull()) return out;
    const ex = new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE) as InstanceType<OcjsModule['TopExp_Explorer_2']> & { delete(): void };
    try {
      while (ex.More()) {
        const edge = oc.TopoDS.Edge_1(ex.Current()) as OcjsShape & { delete(): void };
        try {
          const curve = new api.BRepAdaptor_Curve_2(edge);
          try {
            if (curve.GetType() !== api.GeomAbs_CurveType.GeomAbs_Line) throw new Error('Curved HLR output unsupported');
            const first=curve.FirstParameter(), last=curve.LastParameter();
            if (!Number.isFinite(first)||!Number.isFinite(last)||first>=last) throw new Error('Invalid HLR edge range');
            const sample = (t:number):Point2 => {
              const p=curve.Value(t);
              try {
                const xy:Point2=[p.X(),-p.Y()];
                if (!xy.every(Number.isFinite)||!Number.isFinite(p.Z())||Math.abs(p.Z())>1e-7) throw new Error('Invalid planar HLR output');
                return xy;
              } finally { p.delete(); }
            };
            const start=sample(first),end=sample(last);
            if(Math.hypot(end[0]-start[0],end[1]-start[1])>1e-9) out.push({start,end});
          } finally { curve.delete(); }
        } finally { edge.delete(); }
        ex.Next();
      }
    } finally { ex.delete(); }
    return out;
  }
  const globalVisible=lines(result.VCompound_1()),globalHidden=lines(result.HCompound_1());
  if(typeof result.VCompound_2!=='function'||typeof result.HCompound_2!=='function') throw new Error('Per-shape HLR extraction unavailable');
  const components=sources.map(s=>({ representationId:s.representationId,semanticOwner:s.semanticOwner,
    visible:lines(result.VCompound_2(s.shape)),hidden:lines(result.HCompound_2(s.shape)) }));
  // Validate that component output covers the same projected segment sets as the
  // global output. Reject differing subdivisions rather than claim ownership.
  const key=(line:Line)=>[line.start,line.end].map(p=>p.map(x=>Math.round(x*1e7)).join(',')).sort().join('|');
  const same=(a:Line[],b:Line[])=>{
    const x=new Set(a.map(key)),y=new Set(b.map(key));
    return x.size===y.size&&[...x].every(s=>y.has(s));
  };
  if(!same(globalVisible,components.flatMap(s=>s.visible))||!same(globalHidden,components.flatMap(s=>s.hidden)))
    throw new Error('Per-component HLR coverage differs from global HLR');
  const payload={kernel:'occt-native' as const,kernelVersion:version,visibility:'classified' as const,
    provenance:'component-only-diagnostic' as const,frame,components,globalCounts:{visible:globalVisible.length,hidden:globalHidden.length}};
  return {...payload,projectionDigest:sha256Canonical(payload)};
}
