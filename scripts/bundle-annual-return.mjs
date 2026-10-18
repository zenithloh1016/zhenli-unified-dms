// Copies the tested Annual Return site into the main DMS distribution.
import {cpSync,mkdirSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const base=resolve(process.cwd());
const src=resolve(base,'annual-return/dist');
const dest=resolve(base,'dist/annual-return');
if(!existsSync(resolve(src,'index.html')))throw Error('Build the Annual Return app before bundling it into DMS.');
const html=readFileSync(resolve(src,'index.html'),'utf8');
if(!html.includes('assets/'))throw Error('Annual Return build seems incomplete; no Vite assets in index.html.');
const version=html.match(/V1\\.(\\d+)(?:\\.\\d+)?/);
if(!version||Number(version[1])<8)throw Error('Annual Return V1.8 or newer is required in the DMS.');
for(const id of ['save-draft','resume-draft','delete-draft']){
  if(!html.includes('id="'+id+'"'))throw Error('Annual Return draft control missing: '+id);
}
if(html.includes('id="import-file"')||html.includes('id="export-json"'))
  throw Error('Obsolete Annual Return import/export controls still present.');
if(!existsSync(resolve(src,'msic-2008.json')))throw Error('Official bundled MSIC dataset is missing.');
mkdirSync(dest,{recursive:true});cpSync(src,dest,{recursive:true,force:true});
console.log('Bundled Annual Return '+version[0]+' with Save/Resume Draft into DMS dist/annual-return/');
