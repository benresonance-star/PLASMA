/** F05: a dimensionally controlled, source-derived SECTION graphic for the
 *  limited Loft XY-rectangle/extrude feature grammar. NOT an issued document.
 *  In contrast to a static SVG, every cut region derives from source dimensions.
 */
export interface SectionRegion {
  readonly instanceId: string;
  readonly partId: string;
  readonly material: string;
  readonly xMinMm: number;
  readonly xMaxMm: number;
  readonly zMinMm: number;
  readonly zMaxMm: number;
}
export interface FusionSectionSheet {
  readonly stage: 'F05';
  readonly printScale: '1:5';
  readonly paper: 'A3 landscape';
  readonly issueStatus: 'preview-not-for-construction';
  readonly regionCount: number;
  readonly regions: readonly SectionRegion[];
  readonly unsupported: readonly string[];
  readonly svg: string;
}
function rec(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(label + ' must be an object');
  return v as Record<string, unknown>;
}
function arr(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(label + ' must be an array');
  return v;
}
function numeric(v: unknown, params: Record<string, unknown>): number {
  const n = typeof v === 'string' ? params[v] : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Unresolved dimension');
  return n;
}
function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function materialCode(material: string): string {
  if (/brick|masonry|concrete|block/i.test(material)) return 'masonry';
  if (/timber|wood|LVL|plywood/i.test(material)) return 'timber';
  if (/glass|glaz/i.test(material)) return 'glass';
  if (/insulat|wool|thermal/i.test(material)) return 'insulation';
  if (/metal|aluminium|steel|zinc|copper/i.test(material)) return 'metal';
  return 'other';
}
export function createFusionSectionSheet(input: {
  readonly loftProject: unknown;
  readonly sectionYmm: number;
  readonly parameterOverride?: { readonly partId: string; readonly parameter: string; readonly value: number };
}): FusionSectionSheet {
  const project = rec(input.loftProject, 'Loft');
  if (project['units'] !== 'mm' || project['schemaVersion'] !== 2)
    throw new Error('FUSION_DETAIL_UNSUPPORTED_UNITS');
  if (typeof input.sectionYmm !== 'number' || !Number.isFinite(input.sectionYmm))
    throw new Error('FUSION_DETAIL_INVALID_SECTION_PLANE');
  const override = input.parameterOverride;
  if (override && (!Number.isFinite(override.value) || !override.partId || !override.parameter))
    throw new Error('FUSION_DETAIL_INVALID_OVERRIDE');
  const parts = new Map<string, Record<string, unknown>>();
  for (const raw of arr(project['parts'], 'Loft.parts')) {
    const part = rec(raw, 'part');
    if (typeof part['id'] !== 'string') throw new Error('part ID required');
    parts.set(part['id'], part);
  }
  if (override && !parts.has(override.partId)) throw new Error('FUSION_DETAIL_UNKNOWN_OVERRIDE_PART');
  const rootId = project['rootAssembly'];
  const root = arr(project['assemblies'], 'Loft.assemblies')
    .map((a) => rec(a, 'assembly')).find((a) => a['id'] === rootId);
  if (!root) throw new Error('FUSION_DETAIL_NO_ROOT_ASSEMBLY');
  const regions: SectionRegion[] = [];
  const unsupported: string[] = [];
  let overrideSeen = false;
  for (const raw of arr(root['instances'], 'instances')) {
    const instance = rec(raw, 'instance');
    const instanceId = String(instance['id'] ?? '');
    const partId = String(instance['partId'] ?? '');
    const part = parts.get(partId);
    if (!part) { unsupported.push(instanceId + ': missing Part'); continue; }
    const features = arr(part['features'], 'features');
    if (features.length !== 2) { unsupported.push(instanceId + ': feature history requires exact evaluator'); continue; }
    const sketch = rec(features[0], 'sketch'), extrusion = rec(features[1], 'extrusion');
    const plane = rec(sketch['plane'], 'plane'), profile = rec(sketch['profile'], 'profile');
    if (sketch['type'] !== 'sketch' || extrusion['type'] !== 'extrude' ||
        extrusion['sketch'] !== sketch['id'] || plane['type'] !== 'datum' ||
        plane['name'] !== 'XY' || plane['offset'] !== undefined ||
        profile['kind'] !== 'rectangle') {
      unsupported.push(instanceId + ': unsupported section geometry');
      continue;
    }
    const params = { ...rec(part['parameters'] ?? {}, 'parameters') };
    if (override && override.partId === partId) {
      if (!(override.parameter in params)) throw new Error('FUSION_DETAIL_OVERRIDE_PARAMETER_UNKNOWN');
      params[override.parameter] = override.value;
      overrideSeen = true;
    }
    const placement = rec(instance['placement'] ?? {}, 'placement');
    if (Object.keys(placement).some((key) => key !== 'translation')) {
      unsupported.push(instanceId + ': unsupported transform'); continue;
    }
    const translation = placement['translation'] ?? [0, 0, 0];
    if (!Array.isArray(translation) || translation.length !== 3 ||
        !translation.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) {
      unsupported.push(instanceId + ': invalid placement'); continue;
    }
    let w: number, h: number, d: number, px: number, py: number;
    try {
      w = numeric(profile['width'], params);
      h = numeric(profile['height'], params);
      d = numeric(extrusion['depth'], params);
      px = numeric(profile['x'] ?? 0, params);
      py = numeric(profile['y'] ?? 0, params);
    } catch { unsupported.push(instanceId + ': unresolvable dimensions'); continue; }
    if ([w,h,d].some((x) => x <= 0.01 || x > 100000)) {
      unsupported.push(instanceId + ': invalid dimensions'); continue;
    }
    const [tx,ty,tz] = translation as number[];
    const yCenter = ty! + py;
    if (input.sectionYmm < yCenter - h / 2 || input.sectionYmm > yCenter + h / 2) continue;
    regions.push({
      instanceId, partId,
      material: String(part['material'] ?? 'Unclassified'),
      xMinMm: tx! + px - w / 2,
      xMaxMm: tx! + px + w / 2,
      zMinMm: tz!, zMaxMm: tz! + d,
    });
  }
  if (override && !overrideSeen) throw new Error('FUSION_DETAIL_OVERRIDE_NOT_APPLIED');
  if (!regions.length) throw new Error('FUSION_DETAIL_NO_INTERSECTING_GEOMETRY');
  if (regions.length > 256) throw new Error('FUSION_DETAIL_REGION_BUDGET');
  const left = Math.min(...regions.map((r) => r.xMinMm));
  const right = Math.max(...regions.map((r) => r.xMaxMm));
  const bottom = Math.min(...regions.map((r) => r.zMinMm));
  const top = Math.max(...regions.map((r) => r.zMaxMm));
  const scale = 0.2; // A3 paper millimetres / model millimetres = 1/5
  const dw = (right-left)*scale, dh = (top-bottom)*scale;
  if (dw > 276 || dh > 226) throw new Error('FUSION_DETAIL_SCALE_DOES_NOT_FIT_A3_1_TO_5');
  const offsetX = 24 + (276-dw)/2;
  const offsetY = 30 + (226-dh)/2;
  const pieces = regions.map((r, i) => {
    const x = offsetX + (r.xMinMm-left)*scale;
    const y = offsetY + (top-r.zMaxMm)*scale;
    const w = (r.xMaxMm-r.xMinMm)*scale;
    const h = (r.zMaxMm-r.zMinMm)*scale;
    const material = escape(r.material);
    return '<g data-part-id="' + escape(r.partId) + '" data-instance-id="' + escape(r.instanceId) + '">' +
      '<rect x="' + x.toFixed(3) + '" y="' + y.toFixed(3) + '" width="' + w.toFixed(3) +
      '" height="' + h.toFixed(3) + '" fill="url(#mat-' + materialCode(r.material) + ')" stroke="#222" stroke-width="0.22"/>' +
      (w > 13 && h > 5 ? '<text x="' + (x+w/2).toFixed(3) + '" y="' + (y+h/2).toFixed(3) +
        '" font-size="2.5" fill="#222" text-anchor="middle">' + (i+1) + '</text>' : '') +
      '<title>' + escape(r.partId) + ': ' + material + '</title></g>';
  }).join('');
  const legend = regions.slice(0, 19).map((r,i) =>
    '<text x="315" y="' + (56+i*8.4).toFixed(2) +
    '" font-family="Arial" font-size="3.0" fill="#29383b">' + (i+1) + '. ' +
    escape(r.partId.slice(0,26)) + '</text>').join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297" role="img" aria-label="Loft source-derived sectional detail at 1 to 5, not for construction">' +
    '<defs>' +
    '<pattern id="mat-masonry" patternUnits="userSpaceOnUse" width="5" height="5"><rect width="5" height="5" fill="#d1d3cf"/><path d="M0 0L5 5M-1 4L1 6M4 -1L6 1" stroke="#5f6864" stroke-width=".26"/></pattern>' +
    '<pattern id="mat-timber" patternUnits="userSpaceOnUse" width="5" height="5"><rect width="5" height="5" fill="#e9ddc7"/><path d="M0 2Q2 0 5 2M0 4Q2 2 5 4" stroke="#9a856d" stroke-width=".28" fill="none"/></pattern>' +
    '<pattern id="mat-metal" patternUnits="userSpaceOnUse" width="3" height="3"><rect width="3" height="3" fill="#c0c9cb"/><path d="M0 3L3 0" stroke="#6c7c80" stroke-width=".27"/></pattern>' +
    '<pattern id="mat-glass" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="#ecf6f6"/><path d="M0 4L4 0" stroke="#9bbdc4" stroke-width=".3"/></pattern>' +
    '<pattern id="mat-insulation" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#f0e4bc"/><path d="M0 3Q1.5 0 3 3T6 3" stroke="#ac964e" stroke-width=".3" fill="none"/></pattern>' +
    '<pattern id="mat-other" patternUnits="userSpaceOnUse" width="5" height="5"><rect width="5" height="5" fill="#f1f2ee"/></pattern>' +
    '</defs>' +
    '<rect width="420" height="297" fill="#fff"/>' +
    '<path d="M15 25H405M15 270H405" stroke="#323d3e" stroke-width=".32"/>' +
    '<text x="15" y="16" font-size="6.2" font-family="Arial" font-weight="700" fill="#29383b">PLASMA / SOURCE-DERIVED DETAIL</text>' +
    '<text x="15" y="21" font-size="2.7" font-family="Arial" fill="#708080">LOFT SKETCH / EXTRUSION · SECTION Y = ' + input.sectionYmm + ' mm</text>' +
    '<text x="315" y="41" font-family="Arial" font-weight="700" font-size="4.3" fill="#29383b">ASSEMBLY KEY</text>' +
    '<path d="M310 25V269" stroke="#97a5a7" stroke-width=".25"/>' +
    pieces + legend +
    '<path d="M' + offsetX.toFixed(3) + ' 260 V263 H' + (offsetX+dw).toFixed(3) +
      'V260" fill="none" stroke="#29383b" stroke-width=".2"/>' +
    '<text x="' + (offsetX+dw/2).toFixed(3) + '" y="266" text-anchor="middle" font-family="Arial" font-size="3.5" fill="#29383b">' +
      (right-left).toFixed(1) + ' mm</text>' +
    '<text x="15" y="283" font-size="4.1" font-family="Arial" font-weight="700" fill="#243638">F05 / SECTION STUDY</text>' +
    '<text x="165" y="283" font-size="4.1" font-family="Arial" fill="#243638">A3 · 1:5 at 100% print</text>' +
    '<text x="15" y="291" font-size="3" font-family="Arial" fill="#ad573a">REFERENCE GRAPHIC — NOT FOR CONSTRUCTION · NO DETAIL JUNCTION CERTIFICATION</text>' +
    '</svg>';
  return {
    stage: 'F05', printScale: '1:5', paper: 'A3 landscape',
    issueStatus: 'preview-not-for-construction', regionCount: regions.length,
    regions, unsupported, svg,
  };
}
