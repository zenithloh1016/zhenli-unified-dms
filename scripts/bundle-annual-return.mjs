// Copies the tested Annual Return site into the main DMS distribution.
import {cpSync,mkdirSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const base=resolve(process.cwd());
const src=resolve(base,'annual-return/dist');
const dest=resolve(base,'dist/annual-return');
if(!existsSync(resolve(src,'index.html')))throw Error('Build the Annual Return app before bundling it into DMS.');
const html=readFileSync(resolve(src,'index.html'),'utf8');
if(!html.includes('assets/'))throw Error('Annual Return build seems incomplete; no Vite assets in index.html.');
if(!html.includes('V1.5'))throw Error('Annual Return is not the V1.5 release.');
if(!existsSync(resolve(src,'msic-2008.json')))throw Error('Official bundled MSIC dataset is missing.');
mkdirSync(dest,{recursive:true});cpSync(src,dest,{recursive:true,force:true});
console.log('Bundled Annual Return V1.5 into DMS dist/annual-return/');
