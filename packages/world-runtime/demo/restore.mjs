import {resolve} from 'node:path';
import {restoreWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
const [backupFilename,filename]=process.argv.slice(2);
if(!backupFilename||!filename)throw Error('Usage: node packages/world-runtime/demo/restore.mjs <backup.sqlite> <new-database.sqlite>');
const result=restoreWorld({backupFilename:resolve(backupFilename),filename:resolve(filename),domains:referenceDomains,authorize:()=>null});
console.log(JSON.stringify({status:'restored',...result,filename:resolve(filename)}));
