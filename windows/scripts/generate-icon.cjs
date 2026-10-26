'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.resolve(__dirname,'../build');
 const source=await fs.readFile(path.join(root,'public/favicon.svg'));
 await fs.mkdir(out,{recursive:true});
 await sharp(source).resize(512,512).png().toFile(path.join(out,'icon.png'));
 const sizes=[16,24,32,48,64,128,256];
 const frames=await Promise.all(sizes.map(n=>sharp(source).resize(n,n).png().toBuffer()));
 const header=Buffer.alloc(6+16*frames.length);
 header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
 let offset=header.length;
 frames.forEach((buf,i)=>{
  const n=sizes[i],p=6+i*16;
  header.writeUInt8(n===256?0:n,p);header.writeUInt8(n===256?0:n,p+1);
  header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);
  header.writeUInt32LE(buf.length,p+8);header.writeUInt32LE(offset,p+12);
  offset+=buf.length;
 });
 await fs.writeFile(path.join(out,'icon.ico'),Buffer.concat([header,...frames]));
 console.log('Windows UNICOSEC navy-gold icon files created');
})().catch(e=>{console.error(e);process.exitCode=1;});
