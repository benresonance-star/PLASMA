/** F06: image-pixel -> local survey-XY similarity fit. This is an estimated
 * registration, never surveyed authority. No CRS or elevation is invented.
 */
export interface SiteTiePoint {
  readonly id: string;
  readonly pixel: readonly [number, number];
  readonly localMm: readonly [number, number];
}
export interface SiteRegistrationPreview {
  readonly stage: 'F06';
  readonly status: 'estimated-not-survey-certified';
  readonly coordinateFrame: 'local-site-mm';
  readonly pointCount: number;
  readonly translationMm: readonly [number, number];
  readonly rotationDeg: number;
  readonly mmPerPixel: number;
  readonly rmsResidualMm: number;
  readonly maximumResidualMm: number;
  readonly residuals: readonly { readonly id: string; readonly mm: number }[];
  readonly surveyCertified: false;
  readonly splatRegistered: false;
}
/** Independent point RMS is derived from ALL declared control pairs.
 * Minimum 3 noncollinear points; no image metadata or geodetic projection used.
 */
export function estimateSiteRegistration(points: readonly SiteTiePoint[]): SiteRegistrationPreview {
  if (!Array.isArray(points) || points.length < 3 || points.length > 100)
    throw new Error('SITE_TIE_POINT_COUNT');
  const seen = new Set<string>();
  for (const p of points) {
    if (!p.id || seen.has(p.id)) throw new Error('SITE_TIE_POINT_ID');
    seen.add(p.id);
    if (!Array.isArray(p.pixel) || !Array.isArray(p.localMm) ||
        p.pixel.length !== 2 || p.localMm.length !== 2 ||
        [...p.pixel, ...p.localMm].some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error('SITE_TIE_POINT_INVALID');
    }
  }
  const n = points.length;
  const mean = (key: 'pixel' | 'localMm', axis: 0 | 1) =>
    points.reduce((s,p)=>s+p[key][axis],0)/n;
  const px = mean('pixel',0), py = mean('pixel',1);
  const qx = mean('localMm',0), qy = mean('localMm',1);
  let a=0,b=0,den=0;
  for(const p of points) {
    const x=p.pixel[0]-px, y=p.pixel[1]-py;
    const u=p.localMm[0]-qx, v=p.localMm[1]-qy;
    a+=x*u+y*v; b+=x*v-y*u; den+=x*x+y*y;
  }
  if(den < 1e-7 || Math.hypot(a,b) < 1e-7) throw new Error('SITE_CONTROL_DEGENERATE');
  // local_X = A*pixel_X - B*pixel_Y + tx
  // local_Y = B*pixel_X + A*pixel_Y + ty
  const A=a/den,B=b/den;
  const tx=qx-A*px+B*py, ty=qy-B*px-A*py;
  const residuals=points.map(p=>{
    const u=A*p.pixel[0]-B*p.pixel[1]+tx;
    const v=B*p.pixel[0]+A*p.pixel[1]+ty;
    return {id:p.id,mm:Math.hypot(u-p.localMm[0],v-p.localMm[1])};
  });
  const rms=Math.sqrt(residuals.reduce((s,r)=>s+r.mm*r.mm,0)/n);
  return {
    stage:'F06',status:'estimated-not-survey-certified',
    coordinateFrame:'local-site-mm', pointCount:n,
    translationMm:[tx,ty], rotationDeg:Math.atan2(B,A)*180/Math.PI,
    mmPerPixel:Math.hypot(A,B), rmsResidualMm:rms,
    maximumResidualMm:Math.max(...residuals.map(r=>r.mm)),
    residuals, surveyCertified:false, splatRegistered:false,
  };
}
