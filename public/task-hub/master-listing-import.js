/* ZHENLI Task Hub: private, in-browser Excel (.xlsx) Master Listing reader.
 * No third-party CDN, server upload, workbook execution, or storage side effects.
 * Only the master-company/AR/AFS/FYE fields are extracted.
 */
(() => {
  'use strict';
  const MAX_COMPRESSED = 5 * 1024 * 1024;
  const MAX_XML = 15 * 1024 * 1024;
  const MAX_ENTRIES = 500;
  const asText = bytes => new TextDecoder('utf-8').decode(bytes);
  const cleanHeader = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const dateFromExcel = (value, date1904=false) => {
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0,10);
    if (value === null || value === undefined || value === '') return '';
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0,10);
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(str)) {
      const [d,m,y]=str.split(/[./-]/).map(Number);
      const date=new Date(Date.UTC(y,m-1,d));
      return date.getUTCDate()===d&&date.getUTCMonth()===m-1 ? date.toISOString().slice(0,10):'';
    }
    const days=Number(str);
    if(!Number.isFinite(days)||days<10000||days>100000) return '';
    const ms=Math.round(days*86400000)+(date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30));
    const date=new Date(ms);
    return isNaN(date.getTime())?'':date.toISOString().slice(0,10);
  };
  const readArchive = async file => {
    if(file.size > MAX_COMPRESSED) throw new Error('Excel file exceeds the 5 MB limit.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const u16=(n)=>view.getUint16(n,true), u32=(n)=>view.getUint32(n,true);
    let footer=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-66000);i--){
      if(u32(i)===0x06054b50){footer=i;break;}
    }
    if(footer<0)throw new Error('Not a valid Excel .xlsx ZIP archive.');
    const count=u16(footer+10),total=u32(footer+12),start=u32(footer+16);
    if(count>MAX_ENTRIES||start+total>bytes.length||start<0)throw new Error('Excel archive contains unsupported ZIP entries.');
    const entries=new Map();let pos=start;
    for(let i=0;i<count;i++){
      if(pos+46>bytes.length||u32(pos)!==0x02014b50)throw new Error('Corrupted Excel ZIP directory.');
      const method=u16(pos+10),compressed=u32(pos+20),uncompressed=u32(pos+24),len=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),offset=u32(pos+42);
      if(pos+46+len>bytes.length)throw new Error('Invalid ZIP entry length.');
      const name=asText(bytes.subarray(pos+46,pos+46+len));
      entries.set(name,{method,compressed,uncompressed,offset});
      pos+=46+len+extra+comment;
    }
    const get=async name=>{
      const entry=entries.get(name);
      if(!entry)throw new Error('Excel workbook is missing '+name);
      if(entry.uncompressed>MAX_XML || entry.compressed>MAX_COMPRESSED)throw new Error('Excel sheet exceeds safe import size.');
      const at=entry.offset;
      if(at+30>bytes.length||u32(at)!==0x04034b50)throw new Error('Invalid Excel file entry.');
      const offset=at+30+u16(at+26)+u16(at+28);
      if(offset+entry.compressed>bytes.length)throw new Error('Truncated Excel file entry.');
      const compressed=bytes.subarray(offset,offset+entry.compressed);
      if(entry.method===0)return asText(compressed);
      if(entry.method!==8)throw new Error('Unsupported Excel compression method.');
      if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot read Excel ZIP files. Import the converted JSON instead.');
      let stream;
      try{stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
      catch {throw new Error('Excel decompression is unavailable. Import the converted JSON instead.');}
      const reader=stream.getReader();let chunks=[],length=0;
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;
        if(length>MAX_XML){await reader.cancel();throw new Error('Excel sheet exceeds safe uncompressed size.');}
        chunks.push(value);
      }
      const out=new Uint8Array(length);let index=0;
      for(const part of chunks){out.set(part,index);index+=part.length;}
      return asText(out);
    };
    return {get,entries};
  };
  const xml = str => {
    const doc=new DOMParser().parseFromString(str,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw new Error('Excel sheet contains invalid XML.');
    return doc;
  };
  const elements=(parent,tag)=>Array.from(parent.getElementsByTagNameNS('*',tag));
  const textParts = parent => elements(parent,'t').map(node=>node.textContent||'').join('');
  const colIndex = ref => {
    const match=/^[A-Z]+/i.exec(String(ref||''));if(!match)return -1;
    return match[0].toUpperCase().split('').reduce((sum,letter)=>sum*26+letter.charCodeAt(0)-64,0)-1;
  };

  // In embedded DMS, let the already-bundled read-excel-file library parse XLSX.
  // This works in Android WebViews lacking DecompressionStream('deflate-raw').
  function readViaDms(file){
    if(window.parent===window)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const id='xlsx_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const timer=setTimeout(()=>{window.removeEventListener('message',handle);reject(Error('DMS Excel reader timed out. Try the JSON import.'));},30000);
      function handle(e){
        if(e.origin!==window.location.origin||e.source!==window.parent
          ||e.data?.type!=='ZHENLI_HUB_XLSX_RESULT'||e.data.requestId!==id)return;
        clearTimeout(timer);window.removeEventListener('message',handle);
        if(!e.data.ok)reject(Error(e.data.error||'Excel reader failed.'));
        else resolve(e.data.rows);
      }
      window.addEventListener('message',handle);
      window.parent.postMessage({type:'ZHENLI_HUB_PARSE_XLSX',requestId:id,file},window.location.origin);
    });
  }
  function fromRows(rows,date1904=false){
    const headerRow=rows.findIndex(row=>{
      const headers=row.map(cleanHeader);
      return headers.includes('companyname')&&headers.includes('registrationno')&&headers.includes('annualreturnlodgementduedate');
    });
    if(headerRow<0)throw new Error('Missing Master Listing columns: Company Name, Registration No., AR lodgement due date.');
    const header=rows[headerRow].map(cleanHeader);
    const at=key=>header.indexOf(cleanHeader(key));
    const cell=(row,key)=>{const n=at(key),v=n<0?'':row[n];return v instanceof Date?(isNaN(v)?'':v.toISOString().slice(0,10)):String(v??'').trim();};
    const companyList=[];
    for(const row of rows.slice(headerRow+1)){
      const full=cell(row,'Company Name');
      const name=full.split(/\r?\n/)[0].replace(/\s+/g,' ').trim().toUpperCase().slice(0,160);
      if(!name)continue;
      const reg=cell(row,'Registration No.').slice(0,80);
      const date=key=>dateFromExcel(cell(row,key),date1904);
      const record={name,reg,arDate:date('Next Annual Return Date'),arDueDate:date('Annual Return Lodgement Due Date'),
        afsDueDate:date('Audited Financial Statement Lodgement Due Date'),financialYearEnded:date('Financial Year Ended'),fye:date('Subsequent FYE')};
      record.afsDueStatus=record.afsDueDate?'dated':'TBC';
      companyList.push(record);
      if(companyList.length>2000)throw new Error('Excel company list exceeds 2000 entries.');
    }
    if(!companyList.length)throw new Error('Master Listing contained no company records.');
    return {format:'ZHENLI_TASKHUB_COMPANY_IMPORT',companies:companyList};
  }
  async function parse(file){
    if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Select an Excel .xlsx file.');
    if(window.parent!==window){
      const rows=await readViaDms(file);
      return fromRows(rows);
    }
    const archive=await readArchive(file);
    const workbook=xml(await archive.get('xl/workbook.xml'));
    const rels=xml(await archive.get('xl/_rels/workbook.xml.rels'));
    const sheet=elements(workbook,'sheet').find(s=>/master\s*listing/i.test(s.getAttribute('name')||''))||elements(workbook,'sheet')[0];
    if(!sheet)throw new Error('No worksheet found in Excel file.');
    const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relationship=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);
    if(!relationship)throw new Error('Cannot locate the Master Listing worksheet.');
    const target=relationship.getAttribute('Target')||'';
    const sheetPath=new URL(target,'https://local.invalid/xl/').pathname.replace(/^\//,'');
    if(!sheetPath.startsWith('xl/worksheets/')||sheetPath.includes('..'))throw new Error('Unexpected Excel sheet location.');
    const document=xml(await archive.get(sheetPath));
    const date1904=elements(workbook,'workbookPr')[0]?.getAttribute('date1904')==='1';
    let strings=[];
    if(archive.entries.has('xl/sharedStrings.xml')){
      const sst=xml(await archive.get('xl/sharedStrings.xml'));
      strings=elements(sst,'si').map(textParts);
    }
    const sheetRows=elements(document,'sheetData')[0];
    if(!sheetRows)throw new Error('Excel worksheet has no cells.');
    const rows=elements(sheetRows,'row').map(row=>{
      const output=[];
      elements(row,'c').forEach(c=>{
        const index=colIndex(c.getAttribute('r'));if(index<0||index>99)return;
        const type=c.getAttribute('t');const v=elements(c,'v')[0]?.textContent||'';
        output[index]=type==='s'?(strings[Number(v)]||''):type==='inlineStr'?textParts(c):type==='b'?(v==='1'?'TRUE':'FALSE'):v;
      });
      return output;
    });
    return fromRows(rows,date1904);
  }
  window.ZHENLI_XLSX={parse};
})();