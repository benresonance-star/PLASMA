import {describe,it,expect} from 'vitest';
import {createBasinModel,manningPartFull,solveBasinDrain,inspectAustralianProducts,AU_WATERMARK_CANDIDATES} from './index.js';
describe('TH-01 basin to stack — engineering acceptance',()=>{
 it('holds stable semantic components, real ports, sequential connections and deliberate access items',()=>{
   const m=createBasinModel();
   expect(m.components.map(x=>x.id)).toContain('cleanout');
   expect(m.components.map(x=>x.id)).toContain('wye');
   expect(m.joints).toHaveLength(9);
   expect(m.penetrations).toHaveLength(2);
   expect(m.supports).toHaveLength(3);
   expect(m.framing.filter(x=>x.kind==='joist')).toHaveLength(5);
   expect(m.components.find(x=>x.id==='wye')?.internalLinks).toHaveLength(2);
   expect(m.committed).toBe(false);
 });
 it('solves 0.12 L/s on an actual 1:50 invert grade as part-full steady flow',()=>{
   const m=createBasinModel();
   const s=solveBasinDrain(m);
   expect(s.status).toBe('indicative-pass');
   expect(s.grade).toBeCloseTo(1/50,10);
   expect(s.fallMm).toBeCloseTo(32.6,10);
   expect(s.branchLengthMm).toBe(1630);
   expect(s.capacityLps).toBeGreaterThan(.55);
   expect(s.waterDepthMm).toBeGreaterThan(6);
   expect(s.waterDepthMm).toBeLessThan(22);
   expect(s.velocityMps).toBeGreaterThan(0);
   expect(s.transitSeconds).toBeGreaterThan(0);
   expect(s.findings.some(f=>f.severity==='block')).toBe(false);
   expect(s.compliance).toBe('not-verified');
   expect(s.findings.some(f=>f.code==='UNVERIFIED_VENT')).toBe(true);
 });
 it('calculates physically consistent half-full circular section at low flow',()=>{
   const v=manningPartFull(38,.011,.02,.30);
   expect(v.capacityLps).toBeGreaterThan(.6);
   expect(v.depthMm).toBeGreaterThan(16);
   expect(v.depthMm).toBeLessThan(25);
   expect(v.velocityMps).toBeGreaterThan(.3);
 });
 it('fails an excessively flat branch instead of animating flow as if valid',()=>{
   const s=solveBasinDrain(createBasinModel({gradeDenominator:120}));
   expect(s.status).toBe('blocked');
   expect(s.findings.some(x=>x.code==='GRADE_BENCHMARK_FAIL')).toBe(true);
 });
 it('fails hydraulic demand above calculated Manning capacity',()=>{
   const s=solveBasinDrain(createBasinModel({dischargeLps:1.2}));
   expect(s.status).toBe('blocked');
   expect(s.findings.some(x=>x.code==='HYDRAULIC_OVERLOAD')).toBe(true);
   expect(s.waterDepthMm).toBeNull();
 });
 it('reports direct structural joist interference, not a false geometric clear route',()=>{
   const s=solveBasinDrain(createBasinModel({joistConflict:true}));
   expect(s.status).toBe('blocked');
   expect(s.findings.some(x=>x.code==='JOIST_INTERFERENCE')).toBe(true);
 });
 it('reports an intentionally separated socket as a disconnected physical joint',()=>{
   const s=solveBasinDrain(createBasinModel({disconnectedJoint:true}));
   expect(s.status).toBe('blocked');
   expect(s.findings.some(x=>x.code==='PORT_GAP')).toBe(true);
 });
 it('handles fixture-off state without inventing flow',()=>{
   const s=solveBasinDrain(createBasinModel({dischargeLps:0}));
   expect(s.status).toBe('off');
   expect(s.velocityMps).toBe(0);
   expect(s.transitSeconds).toBeNull();
 });
 it('never overwrites the model, invents a compliance pass, or produces nondeterministic results',()=>{
   const m=createBasinModel(),serialized=JSON.stringify(m);
   const a=solveBasinDrain(m),b=solveBasinDrain(m);
   expect(a).toEqual(b);
   expect(JSON.stringify(m)).toBe(serialized);
   expect(a.committed).toBe(false);
   expect(a.findings.some(x=>x.code==='UNVERIFIED_CODE')).toBe(true);
 });
});

describe('Australian WaterMark manufacturer evidence / physical product matching',()=>{
 it('selects genuine named Australian product models, certificate claims and traceable supplier pages',()=>{
   const result=inspectAustralianProducts(createBasinModel());
   expect(result.candidateCount).toBeGreaterThanOrEqual(7);
   expect(result.productMatchedCount).toBeGreaterThanOrEqual(7);
   const elbow=result.assignments.find(x=>x.componentId==='bend-top')!;
   expect(elbow.product?.modelOrSku).toBe('D0024088');
   expect(elbow.product?.watermarkLicence).toBe('WMKA1305');
   expect(elbow.product?.publishedProductAnglesDeg).toEqual([88]);
   const pipe=result.assignments.find(x=>x.componentId==='grade-branch')!;
   expect(pipe.product?.watermarkLicence).toBe('WMKA1275');
   expect(pipe.product?.productUrl).toMatch(/^https:\/\/www\.iplex\.com\.au/);
   const trap=result.assignments.find(x=>x.componentId==='trap')!;
   expect(trap.product?.modelOrSku).toContain('XG36140LJ');
   expect(result.assignments.map(x=>x.componentId).sort()).toEqual(createBasinModel().components.map(x=>x.id).sort());
 });
 it('does not accept 88-degree elbows as perfect 90-degree schematic fittings',()=>{
   const result=inspectAustralianProducts(createBasinModel());
   for(const id of ['bend-top','bend-bottom']){
     const selected=result.assignments.find(x=>x.componentId===id)!;
     expect(selected.status).toBe('nominal-angle-mismatch');
     expect(selected.blockingIssues.join(' ')).toContain('88°');
   }
 });
 it('requires a manufacturer-matched reducer rather than inventing a DN40 branch on a DN100 wye',()=>{
   const result=inspectAustralianProducts(createBasinModel());
   const wye=result.assignments.find(x=>x.componentId==='wye')!;
   expect(wye.status).toBe('nominal-port-mismatch');
   expect(wye.blockingIssues.join(' ')).toContain('DN40');
   expect(AU_WATERMARK_CANDIDATES.some(x=>x.modelOrSku==='D07310040')).toBe(true);
 });
 it('refuses to substitute a copper-to-PVC adapter for an unmatched polypropylene trap connection',()=>{
   const result=inspectAustralianProducts(createBasinModel());
   const adapter=result.assignments.find(x=>x.componentId==='adapter')!;
   expect(adapter.product).toBeNull();
   expect(adapter.status).toBe('product-not-selected');
   expect(adapter.blockingIssues.join(' ')).toContain('PP trap');
 });
 it('never declares products current or installation approved without active-licence and geometry evidence',()=>{
   const result=inspectAustralianProducts(createBasinModel());
   expect(result.allComponentsWaterMarkApproved).toBe(false);
   expect(result.installationApproved).toBe(false);
   expect(result.currentWaterMarkVerification).toBe('not-performed');
   expect(result.blockedComponents).toContain('wye');
   for(const c of result.assignments.filter(c=>c.product)){
     expect(c.product?.verifiedInLiveABCBRegister).toBe(false);
     expect(c.product?.currentCertificateExpiry).toBe('not-checked');
     expect(c.product?.watermarkLicence).toBeTruthy();
     expect(c.product?.productUrl.startsWith('https://')).toBe(true);
   }
 });
});
