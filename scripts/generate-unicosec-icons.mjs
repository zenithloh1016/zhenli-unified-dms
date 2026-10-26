import sharp from 'sharp';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
const mode=process.argv[2]||'web';
if(!['web','android'].includes(mode))throw Error('Use web or android');
const source=readFileSync(resolve('public/favicon.svg'));
async function png(dest,size,foreground=false){
 mkdirSync(dirname(dest),{recursive:true});
 if(!foreground){await sharp(source).resize(size,size).png().toFile(dest);return;}
 const inner=Math.round(size*.77);
 const overlay=await sharp(source).resize(inner,inner).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([{input:overlay,gravity:'centre'}]).png().toFile(dest);
}
if(mode==='web'){
 for(const n of [32,64,192,512])await png(resolve('public',`unicosec-icon-${n}.png`),n);
 await png(resolve('public/unicosec-apple-touch-icon.png'),180);
}else{
 const res=resolve('android/app/src/main/res');
 const densities={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
 for(const [density,size] of Object.entries(densities)){
  const dir=join(res,`mipmap-${density}`);
  await png(join(dir,'ic_launcher.png'),size);
  await png(join(dir,'ic_launcher_round.png'),size);
  await png(join(dir,'ic_launcher_foreground.png'),Math.round(size*2.25),true);
 }
 const colors=join(res,'values/ic_launcher_background.xml');
 mkdirSync(dirname(colors),{recursive:true});
 writeFileSync(colors,'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#061D40</color></resources>\n');
}
console.log('UNICOSEC '+mode+' icon assets generated.');
