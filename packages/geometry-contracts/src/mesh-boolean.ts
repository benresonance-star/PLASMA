import type { Mesh } from './dto.js';

type Vec3 = [number, number, number];
type BooleanOperation = 'union' | 'cut' | 'intersect';

const EPSILON = 1e-5;

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3, factor: number): Vec3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(...value);
  if (!(length > EPSILON)) throw new Error('Degenerate Boolean polygon');
  return scale(value, 1 / length);
}

class CsgVertex {
  constructor(readonly position: Vec3) {}

  clone(): CsgVertex {
    return new CsgVertex([...this.position]);
  }

  interpolate(other: CsgVertex, amount: number): CsgVertex {
    return new CsgVertex(
      add(this.position, scale(subtract(other.position, this.position), amount)),
    );
  }
}

class CsgPlane {
  constructor(
    public normal: Vec3,
    public distance: number,
  ) {}

  static fromPoints(a: Vec3, b: Vec3, c: Vec3): CsgPlane {
    const normal = normalize(cross(subtract(b, a), subtract(c, a)));
    return new CsgPlane(normal, dot(normal, a));
  }

  clone(): CsgPlane {
    return new CsgPlane([...this.normal], this.distance);
  }

  flip(): void {
    this.normal = scale(this.normal, -1);
    this.distance = -this.distance;
  }

  splitPolygon(
    polygon: CsgPolygon,
    coplanarFront: CsgPolygon[],
    coplanarBack: CsgPolygon[],
    front: CsgPolygon[],
    back: CsgPolygon[],
  ): void {
    const coplanar = 0;
    const frontType = 1;
    const backType = 2;
    const spanning = 3;
    let polygonType = coplanar;
    const types = polygon.vertices.map((vertex) => {
      const distance = dot(this.normal, vertex.position) - this.distance;
      const type =
        distance < -EPSILON
          ? backType
          : distance > EPSILON
            ? frontType
            : coplanar;
      polygonType |= type;
      return type;
    });

    switch (polygonType) {
      case coplanar:
        (dot(this.normal, polygon.plane.normal) > 0
          ? coplanarFront
          : coplanarBack
        ).push(polygon);
        break;
      case frontType:
        front.push(polygon);
        break;
      case backType:
        back.push(polygon);
        break;
      case spanning: {
        const frontVertices: CsgVertex[] = [];
        const backVertices: CsgVertex[] = [];
        for (let index = 0; index < polygon.vertices.length; index += 1) {
          const next = (index + 1) % polygon.vertices.length;
          const type = types[index]!;
          const nextType = types[next]!;
          const vertex = polygon.vertices[index]!;
          const nextVertex = polygon.vertices[next]!;
          if (type !== backType) frontVertices.push(vertex);
          if (type !== frontType) backVertices.push(vertex.clone());
          if ((type | nextType) === spanning) {
            const direction = subtract(
              nextVertex.position,
              vertex.position,
            );
            const amount =
              (this.distance - dot(this.normal, vertex.position)) /
              dot(this.normal, direction);
            const split = vertex.interpolate(nextVertex, amount);
            frontVertices.push(split);
            backVertices.push(split.clone());
          }
        }
        if (frontVertices.length >= 3) {
          front.push(new CsgPolygon(frontVertices));
        }
        if (backVertices.length >= 3) {
          back.push(new CsgPolygon(backVertices));
        }
        break;
      }
      default: {
        throw new Error(`Unsupported polygon type ${polygonType}`);
      }
    }
  }
}

class CsgPolygon {
  readonly plane: CsgPlane;

  constructor(public vertices: CsgVertex[]) {
    this.plane = CsgPlane.fromPoints(
      vertices[0]!.position,
      vertices[1]!.position,
      vertices[2]!.position,
    );
  }

  clone(): CsgPolygon {
    return new CsgPolygon(this.vertices.map((vertex) => vertex.clone()));
  }

  flip(): void {
    this.vertices.reverse();
    this.plane.flip();
  }
}

class CsgNode {
  private plane: CsgPlane | undefined;
  private front: CsgNode | undefined;
  private back: CsgNode | undefined;
  private polygons: CsgPolygon[] = [];

  constructor(polygons: readonly CsgPolygon[] = []) {
    if (polygons.length > 0) this.build(polygons);
  }

  clone(): CsgNode {
    const node = new CsgNode();
    node.plane = this.plane?.clone();
    node.front = this.front?.clone();
    node.back = this.back?.clone();
    node.polygons = this.polygons.map((polygon) => polygon.clone());
    return node;
  }

  invert(): void {
    for (const polygon of this.polygons) polygon.flip();
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }

  clipPolygons(polygons: readonly CsgPolygon[]): CsgPolygon[] {
    if (!this.plane) return [...polygons];
    let front: CsgPolygon[] = [];
    let back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      this.plane.splitPolygon(polygon, front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return [...front, ...back];
  }

  clipTo(node: CsgNode): void {
    this.polygons = node.clipPolygons(this.polygons);
    this.front?.clipTo(node);
    this.back?.clipTo(node);
  }

  allPolygons(): CsgPolygon[] {
    return [
      ...this.polygons,
      ...(this.front?.allPolygons() ?? []),
      ...(this.back?.allPolygons() ?? []),
    ];
  }

  build(polygons: readonly CsgPolygon[]): void {
    if (polygons.length === 0) return;
    this.plane ??= polygons[0]!.plane.clone();
    const front: CsgPolygon[] = [];
    const back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      this.plane.splitPolygon(
        polygon,
        this.polygons,
        this.polygons,
        front,
        back,
      );
    }
    if (front.length > 0) {
      this.front ??= new CsgNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      this.back ??= new CsgNode();
      this.back.build(back);
    }
  }
}

function meshPolygons(mesh: Mesh): CsgPolygon[] {
  const polygons: CsgPolygon[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const vertices = [
      mesh.vertices[mesh.indices[index]!]!,
      mesh.vertices[mesh.indices[index + 1]!]!,
      mesh.vertices[mesh.indices[index + 2]!]!,
    ].map(
      (position) =>
        new CsgVertex([position[0], position[1], position[2]]),
    );
    try {
      polygons.push(new CsgPolygon(vertices));
    } catch {
      // Ignore zero-area triangles introduced by upstream tessellation.
    }
  }
  return polygons;
}

function operate(
  leftPolygons: readonly CsgPolygon[],
  rightPolygons: readonly CsgPolygon[],
  operation: BooleanOperation,
): CsgPolygon[] {
  const left = new CsgNode(leftPolygons).clone();
  const right = new CsgNode(rightPolygons).clone();
  switch (operation) {
    case 'union':
      left.clipTo(right);
      right.clipTo(left);
      right.invert();
      right.clipTo(left);
      right.invert();
      left.build(right.allPolygons());
      return left.allPolygons();
    case 'cut':
      left.invert();
      left.clipTo(right);
      right.clipTo(left);
      right.invert();
      right.clipTo(left);
      right.invert();
      left.build(right.allPolygons());
      left.invert();
      return left.allPolygons();
    case 'intersect':
      left.invert();
      right.clipTo(left);
      right.invert();
      left.clipTo(right);
      right.clipTo(left);
      left.build(right.allPolygons());
      left.invert();
      return left.allPolygons();
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export function booleanTriangleMeshes(input: {
  readonly left: Mesh;
  readonly right: Mesh;
  readonly operation: BooleanOperation;
}): Mesh {
  const polygons = operate(
    meshPolygons(input.left),
    meshPolygons(input.right),
    input.operation,
  );
  if (polygons.length === 0) {
    throw new Error(`Boolean ${input.operation} produced an empty solid`);
  }
  const vertices: Vec3[] = [];
  const indices: number[] = [];
  const vertexByKey = new Map<string, number>();
  const vertexIndex = (position: Vec3): number => {
    const key = position.map((value) => value.toFixed(8)).join(',');
    const existing = vertexByKey.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(position);
    vertexByKey.set(key, index);
    return index;
  };
  for (const polygon of polygons) {
    const first = vertexIndex(polygon.vertices[0]!.position);
    for (let index = 2; index < polygon.vertices.length; index += 1) {
      indices.push(
        first,
        vertexIndex(polygon.vertices[index - 1]!.position),
        vertexIndex(polygon.vertices[index]!.position),
      );
    }
  }
  return { vertices, indices, maxDeviationMm: 0 };
}

export type { BooleanOperation };
