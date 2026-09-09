/**
 * OpenCascade.js Node entry (N1 binding).
 * Import only from services/geometry-occt (ADR-002).
 */
import initOpenCascade from 'opencascade.js/dist/node.js';

/** Minimal structural typing for the OCJS module surface we use. */
export type OcjsModule = {
  readonly BRepPrimAPI_MakeBox_2: new (dx: number, dy: number, dz: number) => {
    Shape(): OcjsShape;
  };
  readonly BRepBuilderAPI_MakePolygon_4: new (
    p1: unknown,
    p2: unknown,
    p3: unknown,
    p4: unknown,
    close: boolean,
  ) => {
    Wire(): unknown;
  };
  readonly BRepBuilderAPI_MakePolygon_1: new () => {
    Add_1(point: unknown): void;
    Close(): void;
    Wire(): unknown;
  };
  readonly BRepBuilderAPI_MakeFace_15: new (
    wire: unknown,
    onlyPlane: boolean,
  ) => {
    Face(): OcjsShape;
  };
  readonly BRepPrimAPI_MakePrism_1: new (
    shape: OcjsShape,
    vector: unknown,
    copy: boolean,
    canonize: boolean,
  ) => {
    Shape(): OcjsShape;
  };
  readonly BRepPrimAPI_MakeRevol_1: new (
    shape: OcjsShape,
    axis: unknown,
    angle: number,
    copy: boolean,
  ) => {
    Shape(): OcjsShape;
  };
  readonly BRepPrimAPI_MakeRevol_2: new (
    shape: OcjsShape,
    axis: unknown,
    copy: boolean,
  ) => {
    Shape(): OcjsShape;
  };
  readonly BRepOffsetAPI_ThruSections: new (
    isSolid: boolean,
    ruled: boolean,
    pres3d: number,
  ) => {
    AddWire(wire: unknown): void;
    CheckCompatibility(check: boolean): void;
    Build(range: unknown): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly BRepBuilderAPI_Transform_2: new (
    shape: OcjsShape,
    trsf: unknown,
    copy: boolean,
  ) => { Shape(): OcjsShape };
  readonly BRepAlgoAPI_Cut_3: new (
    s1: OcjsShape,
    s2: OcjsShape,
    range: unknown,
  ) => {
    Build(range: unknown): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly BRepAlgoAPI_Fuse_3: new (
    s1: OcjsShape,
    s2: OcjsShape,
    range: unknown,
  ) => {
    Build(range: unknown): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly BRepAlgoAPI_Common_3: new (
    s1: OcjsShape,
    s2: OcjsShape,
    range: unknown,
  ) => {
    Build(range: unknown): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly ChFi3d_FilletShape: {
    readonly ChFi3d_Rational: unknown;
  };
  readonly BRepFilletAPI_MakeFillet: new (
    shape: OcjsShape,
    filletShape: unknown,
  ) => {
    Add_2(radius: number, edge: OcjsShape): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly BRepFilletAPI_MakeChamfer: new (shape: OcjsShape) => {
    Add_2(distance: number, edge: OcjsShape): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly TopTools_ListOfShape_1: new () => {
    Append_1(shape: OcjsShape): void;
  };
  readonly BRepOffset_Mode: {
    readonly BRepOffset_Skin: unknown;
  };
  readonly GeomAbs_JoinType: {
    readonly GeomAbs_Arc: unknown;
  };
  readonly BRepOffsetAPI_MakeThickSolid: new () => {
    MakeThickSolidByJoin(
      shape: OcjsShape,
      closingFaces: unknown,
      offset: number,
      tolerance: number,
      mode: unknown,
      intersection: boolean,
      selfIntersection: boolean,
      join: unknown,
      removeInternalEdges: boolean,
      range: unknown,
    ): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly gp_Pln_3: new (origin: unknown, normal: unknown) => unknown;
  readonly BRepOffsetAPI_DraftAngle_2: new (shape: OcjsShape) => {
    Add(
      face: OcjsShape,
      pullDirection: unknown,
      angleRadians: number,
      neutralPlane: unknown,
      reverse: boolean,
    ): void;
    AddDone(): boolean;
    Build(range: unknown): void;
    IsDone(): boolean;
    Shape(): OcjsShape;
  };
  readonly BRepMesh_IncrementalMesh_2: new (
    shape: OcjsShape,
    linDeflection: number,
    isRelative: boolean,
    angDeflection: number,
    isInParallel: boolean,
  ) => unknown;
  readonly BRepBndLib: { Add(shape: OcjsShape, box: unknown, useTriangulation: boolean): void };
  readonly BRepGProp: {
    VolumeProperties_1(
      shape: OcjsShape,
      props: unknown,
      onlyClosed: boolean,
      skipShared: boolean,
      useTriangulation: boolean,
    ): void;
    SurfaceProperties_1(
      shape: OcjsShape,
      props: unknown,
      skipShared: boolean,
      useTriangulation: boolean,
    ): number;
  };
  readonly BRep_Tool: {
    Triangulation(face: unknown, loc: unknown, meshPurpose: number): {
      IsNull(): boolean;
      get(): {
        NbNodes(): number;
        NbTriangles(): number;
        Node(i: number): { Transformed(trsf: unknown): { X(): number; Y(): number; Z(): number } };
        Triangle(i: number): { Value(i: number): number };
      };
    };
  };
  readonly TopExp_Explorer_2: new (shape: OcjsShape, toFind: unknown, toAvoid: unknown) => {
    More(): boolean;
    Next(): void;
    Current(): unknown;
  };
  readonly TopoDS: {
    Face_1(s: unknown): OcjsShape;
    Edge_1(s: unknown): OcjsShape;
  };
  readonly TopAbs_ShapeEnum: {
    TopAbs_FACE: unknown;
    TopAbs_EDGE: unknown;
    TopAbs_SHAPE: unknown;
  };
  readonly Bnd_Box_1: new () => {
    CornerMin(): { X(): number; Y(): number; Z(): number };
    CornerMax(): { X(): number; Y(): number; Z(): number };
  };
  readonly GProp_GProps_1: new () => {
    Mass(): number;
    CentreOfMass(): { X(): number; Y(): number; Z(): number };
  };
  readonly gp_Trsf_1: new () => {
    SetTranslation_1(v: unknown): void;
    SetTransformation_1(to: unknown, from: unknown): void;
    Multiplied(other: unknown): unknown;
  };
  readonly gp_Vec_4: new (x: number, y: number, z: number) => unknown;
  readonly gp_Pnt_3: new (x: number, y: number, z: number) => unknown;
  readonly gp_Dir_4: new (x: number, y: number, z: number) => unknown;
  readonly gp_Ax3_1: new () => unknown;
  readonly gp_Ax3_4: new (p: unknown, d: unknown) => unknown;
  readonly gp_Ax1_2: new (p: unknown, d: unknown) => unknown;
  readonly Message_ProgressRange_1: new () => unknown;
  readonly TopLoc_Location_1: new () => { Transformation(): unknown };
  readonly STEPControl_Writer_1: new () => {
    Transfer(
      shape: OcjsShape,
      mode: unknown,
      compgraph: boolean,
      progress: unknown,
    ): unknown;
    Write(filename: string): unknown;
  };
  readonly STEPControl_StepModelType: { STEPControl_AsIs: unknown };
  readonly FS: {
    readFile(path: string, opts: { encoding: 'utf8' }): string;
    unlink(path: string): void;
  };
};

export type OcjsShape = object;

let cached: OcjsModule | null = null;
let initPromise: Promise<OcjsModule> | null = null;

export async function loadOcjs(): Promise<OcjsModule> {
  if (cached) return cached;
  if (!initPromise) {
    initPromise = initOpenCascade().then((oc) => {
      cached = oc as unknown as OcjsModule;
      return cached;
    });
  }
  return initPromise;
}
