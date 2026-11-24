import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateNorthStar } from './north-star-validate.mjs';
const read = p => JSON.parse(fs.readFileSync(new URL('../'+p, import.meta.url),'utf8'));
const registry = read('spec/registry.yaml');
const policy = read(registry.northStar);
const constitution = read(registry.constitution);
const contracts = registry.atlas.contracts.map(read);
const markdown = fs.readFileSync(new URL('../spec/NORTH_STAR.md',import.meta.url),'utf8');
const cases = [
 ['canonical baseline', p=>{}, false],
 ['missing requirement', p=>p.requirements.pop(), true],
 ['duplicate requirement', p=>p.requirements.push(p.requirements[0]), true],
 ['unknown authority', p=>p.requirements[0].authority.push('PLS-UNKNOWN'), true],
 ['unsupported evidence', p=>p.requirements[0].evidence.push('pass'), true],
 ['performance drift', p=>p.performanceTargets.navigationFps=30, true],
 ['unknown mapping', p=>p.programmes[0].requirements.push('NS-99'), true],
 ['missing programme', p=>p.programmes.pop(), true],
 ['human policy drift', p=>p.requirements[0].rule+=' altered', true]
];
for (const [name, mutate, fails] of cases) test(name,()=>{
 const p=structuredClone(policy); mutate(p);
 const errors=validateNorthStar(p,constitution,contracts,markdown);
 assert.equal(errors.length>0,fails,errors.join('; '));
});
