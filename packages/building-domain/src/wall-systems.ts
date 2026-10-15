import {wallFrames} from './openings.js';
export function wallSystem(c:Record<string,unknown>,wall:string):string{return wall==='front'?String(c.frontSystem??'lvl'):String((c.wallSystems as Record<string,string>|undefined)?.[wall]??'lvl')}
export function cleanWallSystems(c:Record<string,unknown>){
 const input=c.wallSystems;if(input===undefined)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Wall systems must be a wall-to-recipe map');
 const hosts=wallFrames(c).map(f=>f.id),result:Record<string,string>={};
 for(const [wall,system] of Object.entries(input).sort(([a],[b])=>a.localeCompare(b))){if(wall==='front'||!hosts.includes(wall)||!['lvl','pine','steel'].includes(String(system)))throw new Error('Unsupported wall system or host');if(system!=='lvl')result[wall]=String(system);}
 if(Object.keys(result).length&&c.sizingMode==='tables')throw new Error('Per-wall system changes require concept sizing; table scope has not been extended');
 return result;
}
