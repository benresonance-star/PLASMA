import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  proposeServiceNetwork, serviceRouteSegments,
  type Point3, type RoutingProblem, type ServiceNetworkProposal,
} from '@spds/services-network-core';
import { FIXTURES, ROOMS, houseScenario } from './scenario.js';
import './style.css';

const viewport = document.querySelector<HTMLElement>('#viewport')!;
const options = {
  water: document.querySelector<HTMLInputElement>('#water')!,
  electrical: document.querySelector<HTMLInputElement>('#electric')!,
  obstruction: document.querySelector<HTMLInputElement>('#obstacle')!,
  before: document.querySelector<HTMLInputElement>('#before')!,
};
const counter = document.querySelector<HTMLElement>('#count')!;
const resolved = document.querySelector<HTMLElement>('#resolved')!;
const unresolved = document.querySelector<HTMLElement>('#unresolved')!;
const summary = document.querySelector<HTMLElement>('#summary')!;
const runs = document.querySelector<HTMLElement>('#runs')!;
const evidence = document.querySelector<HTMLElement>('#evidence')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0eb);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(43, 1, 1, 125000);
const CENTER = new THREE.Vector3(6000, 900, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CENTER);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 1500;
controls.maxDistance = 68000;
controls.maxPolarAngle = Math.PI * 0.495;
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2000, 12000, 9000);
scene.add(sun, new THREE.AmbientLight(0xffffff, 2));
const sceneModel = new THREE.Group();
scene.add(sceneModel);

function toWorld(v: Point3): THREE.Vector3 { return new THREE.Vector3(v[0], v[2], v[1]); }
function addBox(min: Point3, max: Point3, colour: number, opacity: number, outline = false): void {
  const dimensions = new THREE.Vector3(max[0] - min[0], max[2] - min[2], max[1] - min[1]);
  const geometry = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: colour, transparent: opacity < 1, opacity,
    depthWrite: opacity === 1, roughness: 0.8, metalness: 0,
  }));
  mesh.position.copy(toWorld([
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]));
  sceneModel.add(mesh);
  if (outline) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: Math.min(1, opacity + 0.3) }));
    edges.position.copy(mesh.position);
    sceneModel.add(edges);
  }
}
function pipe(a: Point3, b: Point3, diameter: number, colour: number): void {
  const from = toWorld(a);
  const to = toWorld(b);
  const vector = to.clone().sub(from);
  const distance = vector.length();
  if (distance < 0.01) return;
  const geom = new THREE.CylinderGeometry(diameter / 2, diameter / 2, distance, 10);
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.42 });
  const mesh = new THREE.Mesh(geom, material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  mesh.position.copy(from.add(to).multiplyScalar(0.5));
  sceneModel.add(mesh);
}
function dot(p: Point3, colour: number, radius = 85): void {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 }));
  mesh.position.copy(toWorld(p));
  sceneModel.add(mesh);
}
function dashed(from: Point3, to: Point3): void {
  const a = toWorld(from);
  const b = toWorld(to);
  if (a.distanceTo(b) < 0.01) return;
  const material = new THREE.LineDashedMaterial({ color: 0xd94354, dashSize: 170, gapSize: 100, linewidth: 2 });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), material);
  line.computeLineDistances();
  sceneModel.add(line);
}
function textLabel(message: string, centre: Point3, width = 1600): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = '#576a72';
  ctx.font = '700 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 256, 48, 500);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.position.copy(toWorld(centre));
  sprite.scale.set(width, 300, 1);
  sceneModel.add(sprite);
}
function showBuilding(input: RoutingProblem): void {
  // Architectural geometry is schematic and deliberately not treated as a validated building model.
  addBox([0, 0, -115], [12000, 8000, -15], 0xd1d1ca, 1);
  for (const room of ROOMS) {
    addBox([room.x0, room.y0, -10], [room.x1, room.y1, 0], room.tone, 1);
    textLabel(room.name, [(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, 135], 1800);
  }
  const walls: readonly [Point3, Point3][] = [
    [[0,0,0],[12000,140,650]], [[0,7860,0],[12000,8000,650]],
    [[0,0,0],[140,8000,650]], [[11860,0,0],[12000,8000,650]],
    [[4430,0,0],[4550,4000,380]], [[7450,0,0],[7570,4000,380]],
    [[3930,4000,0],[4050,8000,380]], [[7630,4000,0],[7750,8000,380]],
    [[0,3940,0],[12000,4060,380]],
  ];
  for (const [a, b] of walls) addBox(a, b, 0x8d9a9d, 0.36, true);
  // Simplified built-ins and furniture communicate the spatial context on an iPhone.
  addBox([950, 500, 5], [3000, 2500, 200], 0xd3c6b8, 0.85);
  addBox([8850, 500, 5], [10900, 2500, 200], 0xd3c6b8, 0.85);
  addBox([5400, 5200, 5], [6500, 6700, 220], 0xa3b2af, 0.75);
  addBox([4750, 7550, 5], [7300, 7800, 400], 0x9eaaa9, 0.86);
  addBox([8450, 5050, 5], [10600, 5550, 280], 0xcfbdab, 0.8);
  for (const f of FIXTURES) {
    const col = f.kind === 'plumbing' ? 0x168dd7 : f.kind === 'electrical' ? 0x9468ce : 0x6c7679;
    dot([f.location[0], f.location[1], f.location[2] + 40], col, f.kind === 'plant' ? 170 : 90);
  }
  for (const obstacle of input.obstructions) addBox(obstacle.min, obstacle.max, 0xba6d48, 0.4, true);
}
function showProposal(input: RoutingProblem, result: ServiceNetworkProposal): void {
  const segments = serviceRouteSegments(result);
  const byId = new Map(input.runs.map((run) => [run.id, run]));
  for (const segment of segments) {
    const routeId = segment.id.split(':segment:')[0]!;
    const spec = byId.get(routeId);
    pipe(segment.a, segment.b, spec?.nominalDiameterMm ? spec.nominalDiameterMm * 2.8 : 85,
      segment.system === 'water' ? 0x138bd4 : 0x8453c3);
  }
  for (const route of result.routes) {
    if (route.status !== 'proposed') continue;
    dot(route.points[0]!, route.system === 'water' ? 0x0872bd : 0x6847a9, 110);
    dot(route.points[route.points.length - 1]!, route.system === 'water' ? 0x0872bd : 0x6847a9, 110);
  }
  if (options.before.checked) {
    for (const route of result.routes) {
      if (!route.initialClashCount) continue;
      const spec = byId.get(route.id);
      if (!spec) continue;
      const a = spec.source;
      const b = spec.destination;
      const p1: Point3 = [b[0], a[1], a[2]];
      const p2: Point3 = [b[0], b[1], a[2]];
      dashed(a, p1); dashed(p1, p2); dashed(p2, b);
    }
  }
}
function clear(): void {
  for (const child of [...sceneModel.children]) {
    sceneModel.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  }
}
function card(route: ServiceNetworkProposal['routes'][number]): HTMLElement {
  const el = document.createElement('article');
  el.className = 'run';
  const head = document.createElement('div');
  head.className = 'run-head';
  const title = document.createElement('strong');
  title.textContent = route.id;
  const category = document.createElement('span');
  category.textContent = route.system.toUpperCase();
  head.append(title, category);
  const sub = document.createElement('div');
  sub.className = 'sub' + (route.status === 'blocked' ? ' issue' : '');
  sub.textContent = route.status === 'proposed'
    ? `${(route.lengthMm / 1000).toFixed(1)} m · ${route.bendCount} bends · ${route.routingMethod === 'rerouted' ? 'rerouted around clash' : 'direct geometric route'}`
    : `Unresolved: ${route.issues.map((i) => i.message).join('; ')}`;
  el.append(head, sub);
  return el;
}
let lastInput: RoutingProblem | null = null;
let lastProposal: ServiceNetworkProposal | null = null;
function updateVisual(): void {
  if (!lastInput || !lastProposal) return;
  clear();
  showBuilding(lastInput);
  showProposal(lastInput, lastProposal);
}
function reroute(): void {
  const input = houseScenario({
    water: options.water.checked,
    electrical: options.electrical.checked,
    obstruction: options.obstruction.checked,
  });
  const proposal = proposeServiceNetwork(input);
  lastInput = input;
  lastProposal = proposal;
  updateVisual();
  const ok = proposal.routes.filter((r) => r.status === 'proposed').length;
  counter.textContent = `${ok} / ${proposal.routes.length}`;
  resolved.textContent = String(proposal.resolvedClashCount);
  unresolved.textContent = String(proposal.unresolvedRunCount);
  summary.textContent = proposal.routes.length ?
    `${ok} conceptual routes generated; ${proposal.unresolvedRunCount} require intervention.` :
    'Select a building system above to generate routes.';
  runs.replaceChildren(...proposal.routes.map(card));
  evidence.replaceChildren(...proposal.evidence.map((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    return li;
  }));
}
function frame(orientation: 'plan' | '3d'): void {
  const ratio = Math.max(0.45, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  const rad = THREE.MathUtils.degToRad(camera.fov / 2);
  const fit = Math.max(10000 / (2 * Math.tan(rad)), 14000 / (2 * Math.tan(rad) * ratio));
  controls.target.copy(CENTER);
  if (orientation === 'plan') {
    camera.up.set(0, 0, -1);
    camera.position.copy(CENTER).add(new THREE.Vector3(0, fit * 1.1, 0));
  } else {
    camera.up.set(0, 1, 0);
    const length = fit * 1.4;
    camera.position.copy(CENTER).add(new THREE.Vector3(length * 0.62, length * 0.82, length * 0.75));
  }
  camera.lookAt(CENTER);
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelector<HTMLButtonElement>('#plan')!.classList.toggle('active', orientation === 'plan');
  document.querySelector<HTMLButtonElement>('#three-d')!.classList.toggle('active', orientation === '3d');
}
for (const id of ['water', 'electric', 'obstacle'])
  document.querySelector<HTMLInputElement>('#' + id)!.addEventListener('change', reroute);
options.before.addEventListener('change', updateVisual);
document.querySelector<HTMLButtonElement>('#generate')!.addEventListener('click', reroute);
document.querySelector<HTMLButtonElement>('#plan')!.addEventListener('click', () => frame('plan'));
document.querySelector<HTMLButtonElement>('#three-d')!.addEventListener('click', () => frame('3d'));
new ResizeObserver(() => {
  const w = Math.max(1, viewport.clientWidth);
  const h = Math.max(1, viewport.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}).observe(viewport);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
frame('3d');
reroute();
