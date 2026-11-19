import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  proposeServiceNetwork, serviceRouteSegments,
  type Point3, type RoutingProblem, type ServiceRunRequest, type ServiceNetworkProposal,
} from '@spds/services-network-core';
import './style.css';

const element = document.querySelector<HTMLElement>('#viewport')!;
const obstructionToggle = document.querySelector<HTMLInputElement>('#obstacle')!;
const electricToggle = document.querySelector<HTMLInputElement>('#electric')!;
const summary = document.querySelector<HTMLElement>('#summary')!;
const runs = document.querySelector<HTMLElement>('#runs')!;
const evidence = document.querySelector<HTMLElement>('#evidence')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f5f4f0');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
element.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 40000);
camera.position.set(6000, 5500, 7000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(2000, 650, 1000);
controls.update();
scene.add(new THREE.AmbientLight(0xffffff, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(5000, 8500, 4000);
scene.add(sun);
const model = new THREE.Group();
scene.add(model);

function point(x: Point3): THREE.Vector3 { return new THREE.Vector3(x[0], x[2], x[1]); }
function box(min: Point3, max: Point3, tint: number, opacity: number): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(max[0] - min[0], max[2] - min[2], max[1] - min[1]),
    new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity, roughness: 0.7 }),
  );
  mesh.position.copy(point([(min[0] + max[0])/2, (min[1] + max[1])/2, (min[2] + max[2])/2]));
  model.add(mesh);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: Math.min(0.8, opacity + 0.3) }));
  wire.position.copy(mesh.position);
  model.add(wire);
}
function pipe(a: Point3, b: Point3, diameter: number, tint: number): void {
  const from = point(a), to = point(b), dir = to.clone().sub(from);
  if (dir.length() < 0.01) return;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter / 2, diameter / 2, dir.length(), 12),
    new THREE.MeshStandardMaterial({ color: tint, roughness: 0.48 }),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  mesh.position.copy(from.add(to).multiplyScalar(0.5));
  model.add(mesh);
}
function run(id: string, system: ServiceRunRequest['system'], source: Point3, destination: Point3): ServiceRunRequest {
  return { id, system, source, destination,
    nominalDiameterMm: system === 'water' ? 35 : 25,
    clearanceMm: 50, minServiceSeparationMm: 70, semanticOwnerId: 'fixture:' + id };
}
function inputProblem(): RoutingProblem {
  const list: ServiceRunRequest[] = [run('cold-water', 'water', [250,500,500], [3250,500,500])];
  if (electricToggle.checked) list.push(run('lighting', 'electrical', [3000,250,500], [3000,1750,500]));
  return {
    envelope: { id: 'house', min: [0,0,0], max: [4000,2000,1500] },
    obstructions: obstructionToggle.checked
      ? [{ id: 'structural-beam', min: [1500,0,0], max: [2000,1500,1250], semanticOwnerId: 'structure:beam' }]
      : [],
    runs: list, gridStepMm: 250, bendPenaltyMm: 150, verticalPenalty: 1.5,
    maxExpandedNodes: 50000,
  };
}
function display(input: RoutingProblem, result: ServiceNetworkProposal): void {
  for (const child of [...model.children]) {
    model.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    } else if (child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  }
  box(input.envelope.min, input.envelope.max, 0x9aa5ae, 0.04);
  for (const obstruction of input.obstructions) box(obstruction.min, obstruction.max, 0xc06b3e, 0.34);
  for (const segment of serviceRouteSegments(result)) {
    const source = input.runs.find((r) => r.id === segment.id.split(':segment:')[0]);
    pipe(segment.a, segment.b, source?.nominalDiameterMm ?? 25, segment.system === 'water' ? 0x2078ad : 0x6751b7);
  }
  const succeeded = result.routes.filter((r) => r.status === 'proposed').length;
  summary.textContent = succeeded + '/' + result.routes.length +
    ' routed · ' + result.resolvedClashCount + ' initial clash(es) resolved';
  runs.replaceChildren();
  for (const route of result.routes) {
    const article = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = route.system.toUpperCase() + ' · ' + route.id;
    const description = document.createElement('p');
    description.textContent = route.status === 'proposed'
      ? route.routingMethod + ' / ' + (route.lengthMm / 1000).toFixed(2) +
        ' m / ' + route.bendCount + ' bends / geometric checks only'
      : 'Unresolved / ' + route.issues.map((i) => i.message).join('; ');
    article.append(title, description);
    runs.append(article);
  }
  evidence.replaceChildren();
  for (const note of result.evidence) {
    const li = document.createElement('li');
    li.textContent = note;
    evidence.append(li);
  }
}
function reroute(): void { const input = inputProblem(); display(input, proposeServiceNetwork(input)); }
document.querySelector<HTMLButtonElement>('#generate')!.addEventListener('click', reroute);
obstructionToggle.addEventListener('change', reroute);
electricToggle.addEventListener('change', reroute);
new ResizeObserver(() => {
  const w = Math.max(1, element.clientWidth), h = Math.max(1, element.clientHeight);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}).observe(element);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });
reroute();
