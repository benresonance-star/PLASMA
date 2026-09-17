import {openWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
import {initialState,authorize,wallRequest} from './fixture.mjs';
const [filename,stage]=process.argv.slice(2);
const world=openWorld({filename,initialState,domains:referenceDomains,authorize,fault:point=>{if(point===stage)process.exit(73);}});
world.session({id:'human'}).submit(wallRequest());
world.close();
