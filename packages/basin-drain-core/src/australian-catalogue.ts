import type {BasinModel} from './types.js';

/**
 * Australian WaterMark candidate register — based on published manufacturer/product pages.
 * An advertised WaterMark number is NOT an independently confirmed active licence,
 * not evidence that a selected SKU is on its current schedule, and not an
 * installation or NCC compliance approval. Never convert these to approved=true.
 */
export interface ProductRecord {
  readonly id:string;
  readonly brand:string;
  readonly name:string;
  readonly modelOrSku:string|null;
  readonly standard:string;
  readonly watermarkLicence:string;
  readonly productUrl:string;
  readonly publishedEvidence:'manufacturer-product-listing'|'supplier-product-listing';
  readonly verifiedInLiveABCBRegister:false;
  readonly currentCertificateExpiry:'not-checked';
  readonly publishedProductAnglesDeg:readonly number[];
  readonly portNominalSizes:readonly number[];
  readonly notes:string;
}
export type FitStatus='provisional-match'|'nominal-angle-mismatch'|
 'nominal-port-mismatch'|'socket-compatibility-unresolved'|'product-not-selected';
export interface ProductAssignment {
  readonly componentId:string;
  readonly product:ProductRecord|null;
  readonly status:FitStatus;
  readonly blockingIssues:readonly string[];
  readonly engineeringNotes:readonly string[];
}
export interface ProductGate {
  readonly assignments:readonly ProductAssignment[];
  readonly candidateCount:number;
  readonly productMatchedCount:number;
  readonly blockedComponents:readonly string[];
  readonly currentWaterMarkVerification:'not-performed';
  readonly allComponentsWaterMarkApproved:false;
  readonly installationApproved:false;
}
const iplex=(id:string,name:string,sku:string|null,licence:string,url:string,
  sizes:readonly number[],angles:readonly number[]=[],notes=''):ProductRecord=>({
  id,brand:'Iplex Australia',name,modelOrSku:sku,watermarkLicence:licence,
  standard:'AS/NZS 1260:2017',productUrl:url,
  publishedEvidence:'manufacturer-product-listing',
  verifiedInLiveABCBRegister:false,currentCertificateExpiry:'not-checked',
  publishedProductAnglesDeg:angles,portNominalSizes:sizes,notes,
});
export const AU_WATERMARK_CANDIDATES:readonly ProductRecord[]=[
  {
    id:'fix-a-drain-p-trap-40',brand:'FIX-A-DRAIN',name:'Standard P Trap 40 mm',
    modelOrSku:'216359 (model XG36140LJ)',watermarkLicence:'26573',
    standard:'AS 2887',productUrl:'https://fixatap.com.au/sinks/traps-washers/p-trap-40mm/',
    publishedEvidence:'supplier-product-listing',verifiedInLiveABCBRegister:false,
    currentCertificateExpiry:'not-checked',publishedProductAnglesDeg:[],portNominalSizes:[40],
    notes:'Polypropylene P-trap. Listing reports WaterMark 26573; exact water-seal dimensions and outlet connector must be inspected.',
  },
  iplex('iplex-dn40-dwv-pipe','DN40 x 6m PVC-U DWV pipe SWJ',null,'WMKA1275',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/40-dwv-pipe-plplx6m',[40],[],
    'Manufacturer lists 2.0 mm wall and 1.0 m graded support spacing. Internal bore must be calculated from actual product dimensional schedule.'),
  iplex('iplex-dn100-dwv-pipe','DN100 x 6m SN6 PVC-U DWV pipe SWJ',null,'WMKA1275',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/100-sn6-dwv-pipe-swjx6m-sc',[100]),
  iplex('iplex-dn40-88-bend','DN40 x 88° PVC-U DWV bend FF SWJ','D0024088','WMKA1305',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/40x88d-dwv-bend-ff-pl',[40],[88],
    'Product listing and published WMKA1305 schedule identify D0024088. Demo uses nominal 90° geometry: NOT a validated substitute.'),
  iplex('iplex-dn100-45-junction','DN100 x 45° PVC-U DWV junction MF SWJ',null,'WMKA1305',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/100x45d-dwv-junc-mf-pl',[100],[45],
    'Nominal DN100 branch. Demo junction has DN40 branch port: requires an appropriate DN100↔DN40 reducer and reauthored branch geometry.'),
  iplex('iplex-100x40-reducer','DN100 × DN40 PVC-U DWV socket reducer SWJ','D07310040','WMKA1305',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/100x40-dwv-reducer-socket',[100,40],[],
    'Potential branch reducer candidate: socket sequence, orientation and installed dimensions must be reviewed. Not inserted in model.'),
  iplex('iplex-dn100-cleanout','DN100 PVC-U DWV inspection opening FF SWJ','D054100','WMKA1305',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/100-dwv-insopening-ff',[100],[],
    'Actual access fitting requires an inline stack assembly with additional joints and cleaning clearance.'),
  iplex('iplex-dn40-copper-pvc-adapter','DN40 Copper-to-PVC DWV adapter SWJ','D1244040','WMKA1305',
    'https://www.iplex.com.au/products/pvc-non-pressure/dwv/40-dwv-adapt-assy-copper-pvc',[40],[],
    'NOT assigned: copper-to-PVC adapter must not silently replace the modelled PP trap compression-to-solvent connection.'),
];
const byId=new Map(AU_WATERMARK_CANDIDATES.map(x=>[x.id,x]));
function catalog(id:string):ProductRecord {
  const c=byId.get(id);if(!c)throw Error('Missing Australian product entry '+id);return c;
}
const chosen:Readonly<Record<string,string|null>>={
  basin:null,trap:'fix-a-drain-p-trap-40',adapter:null,
  'pipe-wall':'iplex-dn40-dwv-pipe','bend-top':'iplex-dn40-88-bend',
  dropper:'iplex-dn40-dwv-pipe','bend-bottom':'iplex-dn40-88-bend',
  'grade-branch':'iplex-dn40-dwv-pipe',
  wye:'iplex-dn100-45-junction',stack:'iplex-dn100-dwv-pipe',
  cleanout:'iplex-dn100-cleanout',
};
export function inspectAustralianProducts(model:BasinModel):ProductGate {
  const assignments:ProductAssignment[]=model.components.map(component=>{
    const choice=chosen[component.id]??null;
    const product=choice?catalog(choice):null;
    let status:FitStatus='provisional-match';
    const blockingIssues:string[]=[];
    const engineeringNotes:string[]=[];
    if(!product){
      status='product-not-selected';
      blockingIssues.push(component.id==='adapter'
        ? 'PP trap-to-PVC DWV transition must be selected with verified materials and socket compatibility; the available copper-PVC adapter is NOT equivalent.'
        : 'A specific compatible Australian fixture/product has not been selected.');
    }else{
      if(component.id==='bend-top'||component.id==='bend-bottom'){
        status='nominal-angle-mismatch';
        blockingIssues.push('Modelled 90° bend is not identical to the product listed as 88°. Refit centreline, socket ends and dimensions before installation.');
      }
      if(component.id==='wye'){
        status='nominal-port-mismatch';
        blockingIssues.push('Model uses DN40-to-DN100 45° junction, but the identified Iplex part is a DN100 45° junction. Include a certified DN100×DN40 reducer and verify the resulting assembly.');
        engineeringNotes.push('Potential reducer: Iplex D07310040, WMKA1305; not yet inserted or dimensionally matched.');
      }
      if(component.id==='trap'){
        status='socket-compatibility-unresolved';
        blockingIssues.push('Product trap outlet and actual water seal/tailpiece differ from schematic. Verify exact trap body and interface to DN40 PVC-U.');
      }
      if(component.id==='cleanout'){
        status='socket-compatibility-unresolved';
        blockingIssues.push('An inline DN100 inspection opening and its extra joints must replace the schematic side stub.');
      }
      if(product.id==='iplex-dn40-dwv-pipe'){
        engineeringNotes.push('Actual internal diameter and the solvent weld fitting insertion/working lengths need product-specific evaluation; 38 mm is an assumption.');
      }
      engineeringNotes.push('WaterMark '+product.watermarkLicence+' is published by supplier/manufacturer, but live ABCB product-registration status and current schedule have not been independently verified.');
    }
    return {componentId:component.id,product,status,blockingIssues,engineeringNotes};
  });
  return {
    assignments,
    candidateCount:AU_WATERMARK_CANDIDATES.length,
    productMatchedCount:assignments.filter(x=>x.product!==null).length,
    blockedComponents:assignments.filter(x=>x.blockingIssues.length>0).map(x=>x.componentId),
    currentWaterMarkVerification:'not-performed',
    allComponentsWaterMarkApproved:false,installationApproved:false,
  };
}
