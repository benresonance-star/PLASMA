import {describe,it,expect} from 'vitest';
import {createBasinModel,manningPartFull,solveBasinDrain} from './index.js';
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
