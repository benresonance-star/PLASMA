# TH-01 v0.5 — Australian WaterMark component selection

**Status: manufacturer-listed product candidates; NOT a verified or approved installed drainage system.**

Australia's WaterMark scheme covers listed plumbing products. The correct evidence is the current, exact model in the active ABCB WaterMark Product Database, not merely a familiar brand or a logo.

The catalogue below was researched on 20 November 2026 from Australian manufacturer/product pages. Published WaterMark licence identifiers are stored, but the active register, current schedules and certificate expiry were **not independently checked**. Exact product/fitting shape, socket depth, connector material and component combination also remain unverified.

| Semantic component | Manufacturer item | Published WaterMark | Outstanding design condition |
|---|---|---|---|
| DN40 water branch, wall transit and dropper | [Iplex DN40 6 m PVC-U DWV pipe](https://www.iplex.com.au/products/pvc-non-pressure/dwv/40-dwv-pipe-plplx6m) | WMKA1275, AS/NZS 1260:2017 | OD 43 mm, wall min 2 mm; current solver's 38 mm ID is a design assumption and requires precise confirmation |
| Top/bottom nominal 90-degree bend | [Iplex DN40 88-degree bend D0024088](https://www.iplex.com.au/products/pvc-non-pressure/dwv/40x88d-dwv-bend-ff-pl) | WMKA1305, AS/NZS 1260:2017 | **Incompatible as drawn:** 88 degrees is not 90 degrees; route, fitting centreline and socket geometry require re-authoring |
| P-trap | [FIX-A-DRAIN 40 mm polypropylene P trap, 216359 / XG36140LJ](https://fixatap.com.au/sinks/traps-washers/p-trap-40mm/) | Product listing reports 26573, AS 2887 | Actual seal, waste/outlet body and compression-to-DWV transition require checks |
| P-trap-to-DWV transition | No compatible product selected | None yet | Do not substitute [Iplex copper-PVC adapter D1244040](https://www.iplex.com.au/products/pvc-non-pressure/dwv/40-dwv-adapt-assy-copper-pvc) for a PP trap outlet |
| DN100 stack | [Iplex DN100 SN6 DWV pipe](https://www.iplex.com.au/products/pvc-non-pressure/dwv/100-sn6-dwv-pipe-swjx6m-sc) | WMKA1275, AS/NZS 1260:2017 | Physical connection and downstream conditions unresolved |
| Nominal DN100 × DN40 45-degree wye | [Iplex DN100 45-degree junction](https://www.iplex.com.au/products/pvc-non-pressure/dwv/100x45d-dwv-junc-mf-pl) | WMKA1305, AS/NZS 1260:2017 | **Incompatible alone:** identified junction has DN100 branch. Add and model the [Iplex D07310040 reducer](https://www.iplex.com.au/products/pvc-non-pressure/dwv/100x40-dwv-reducer-socket), also manufacturer-listed WMKA1305 |
| DN100 stack inspection opening | [Iplex D054100 DN100 F&F DWV inspection opening](https://www.iplex.com.au/products/pvc-non-pressure/dwv/100-dwv-insopening-ff) | WMKA1305, AS/NZS 1260:2017 | Must be inserted in-line with modelled extra sockets and access zone |
| Basin fixture | No particular fixture selected | None | Product, waste outlet, connection specification and applicability of WaterMark still to be established |

The water-flow calculation remains a separate, indicative Manning steady part-full model. A calculated hydraulic "pass" cannot be promoted into an approved plumbing installation.

**Implementation:** Semantic components now persist a named Australian product candidate ID. The solver and component inspector show brand, model/SKU when available, manufacturer URL, published licence/standard and every blocking fit issue. Current certification lookup and installed compliance remain explicit false/unknown states.

**Next engineering gate:** perform live ABCB register checks for each exact model, obtain supplier dimensional CAD/schedules, re-fit 88-degree turns, create the reducer and actual inspection-opening assembly, validate P-trap adapter and water seal, and rerun joint, structure, hydraulic and statutory rule checks. WaterMark alone does not certify those connections or installation details.

Official lookup: https://www.abcb.gov.au/watermark-search
