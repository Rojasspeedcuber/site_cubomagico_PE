import { randomScrambleForEvent } from 'cubing/scramble';
import { setSearchDebug } from 'cubing/search';
setSearchDebug({ logPerf: false });
import type { Format } from './scoring.ts';
export async function generateScrambles(puzzle:'333'|'222'|'pyram',format:Format) {
 const scrambles:string[]=[];
 for(let index=0; index<(format==='AO5'?5:3); index++) scrambles.push((await randomScrambleForEvent(puzzle)).toString());
 return scrambles;
}
