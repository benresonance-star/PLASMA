/** TH-01 basin sanitary benchmark. Dimensions mm; flow L/s. No statutory compliance claim. */
export type Point3=readonly [number,number,number];
export type Vector3=readonly [number,number,number];
export type Family='basin'|'p-trap'|'trap-adapter'|'straight-pipe'|'long-sweep-90'|'graded-branch'|'45-wye'|'soil-stack'|'cleanout';
export interface Port {readonly id:string;readonly ownerId:string;readonly at:Point3;readonly normal:Vector3;readonly dn:number;readonly role:'in'|'out';}
export interface Component {
 readonly id:string;readonly family:Family;readonly name:string;readonly path:readonly Point3[];
 readonly portIds:readonly string[];readonly internalLinks:readonly (readonly [string,string])[];
 readonly diameterMm:number;readonly productStatus:'generic-unverified';
 readonly australianProductCandidateId:string|null;
 readonly installationNotes:readonly string[];
}
export interface Joint {
 readonly id:string;readonly from:string;readonly to:string;
 readonly method:'slip-joint'|'compression-adapter'|'solvent-socket'|'stack-socket';
 readonly socketDepthAssumedMm:number;readonly productStatus:'generic-unverified';
}
export interface Member {
 readonly id:string;readonly kind:'joist'|'stud'|'plate'|'lining'|'floor-sheet'|'floor-finish'|'ceiling';
 readonly min:Point3;readonly max:Point3;readonly structural:boolean;
}
export interface Penetration {
 readonly id:string;readonly hostIds:readonly string[];readonly at:Point3;
 readonly axis:'Y'|'Z';readonly boreDiameterMm:number;readonly sleeveODMm:number;
 readonly status:'detail-required';readonly notes:readonly string[];
}
export interface Support {
 readonly id:string;readonly at:Point3;readonly maxAssumedSpanMm:number;
 readonly status:'supplier-unverified';
}
export interface Scenario {
 readonly gradeDenominator?:number;readonly dischargeLps?:number;
 readonly internalDiameterMm?:number;readonly joistConflict?:boolean;readonly disconnectedJoint?:boolean;
}
export interface BasinModel {
 readonly schema:'basin-stack-benchmark/v0.4';readonly id:'TH01-BASIN-STACK';
 readonly components:readonly Component[];readonly ports:readonly Port[];readonly joints:readonly Joint[];
 readonly framing:readonly Member[];readonly penetrations:readonly Penetration[];
 readonly supports:readonly Support[];readonly route:readonly Point3[];
 readonly gradedStart:Point3;readonly gradedEnd:Point3;
 readonly input:{readonly grade:number;readonly dischargeLps:number;readonly diameterMm:number;readonly n:number;readonly gradeBenchmarkMin:number};
 readonly committed:false;
}
export type FindingCode=
 'MISSING_JOINT'|'PORT_GAP'|'PORT_DIRECTION'|'PORT_DIAMETER'|'NO_CONNECTED_ROUTE'|
 'JOIST_INTERFERENCE'|'PENETRATION_CONFLICT'|'SUPPORT_SPACING'|'GRADE_BENCHMARK_FAIL'|
 'REVERSE_GRADE'|'HYDRAULIC_OVERLOAD'|'FITTING_ANGLE'|'UNVERIFIED_PRODUCT'|
 'UNVERIFIED_VENT'|'UNVERIFIED_TRAP_SEAL'|'UNVERIFIED_DETAIL'|'UNVERIFIED_CODE'|'UNVERIFIED_DISCHARGE';
export interface Finding {readonly code:FindingCode;readonly severity:'block'|'review';readonly ownerId:string;readonly description:string;}
export interface FlowSolution {
 readonly modelId:string;readonly status:'indicative-pass'|'blocked'|'off';
 readonly solver:'manning-part-full-uniform-flow/v0.1';readonly compliance:'not-verified';
 readonly dischargeLps:number;readonly branchLengthMm:number;readonly fallMm:number;
 readonly grade:number;readonly capacityLps:number;readonly waterDepthMm:number|null;
 readonly fillPercent:number|null;readonly velocityMps:number|null;
 readonly transitSeconds:number|null;readonly conservationResidualLps:number;
 readonly findings:readonly Finding[];readonly verifiedChecks:readonly string[];
 readonly committed:false;
}
