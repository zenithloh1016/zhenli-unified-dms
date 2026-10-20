import {officeCellValue} from './office-editor.js';

function columnLabel(col){
 let v=col+1,out='';
 while(v){v--;out=String.fromCharCode(65+v%26)+out;v=Math.floor(v/26);}
 return out;
}
export function renderOfficeEditor(state,record,{esc,action}){
 const model=state.officeEditor;
 if(!model||!record)return '';
 const ctrl=action('Close editor','close-office','','secondary');
 const heading='<div class="modal-heading"><div><p class="eyebrow">DOCUMENTS / OFFICE EDITOR</p><h3>'+esc(record.name)+'</h3></div>'+ctrl+'</div>';
 const note='<p class="office-help">Changes to Excel cells or Word body paragraphs are saved automatically to this company folder. The original uploaded version is retained separately on the first save. This is a basic editor: editing Word text may change inline formatting in that paragraph; please verify resolutions and statutory documents before use.</p>';
 let body='';
 if(model.type==='xlsx'){
  const sheet=model.sheets[model.activeSheet],rowStart=state.officeRowStart||1,colStart=state.officeColStart||0;
  const rows=Array.from({length:40},(_,i)=>rowStart+i);
  const cols=Array.from({length:12},(_,i)=>colStart+i).filter(x=>x<16384);
  body='<div class="office-nav"><label>Worksheet <select id="office-sheet-choice" aria-label="Choose Excel worksheet">'+
   model.sheets.map((s,i)=>'<option value="'+i+'"'+(model.activeSheet===i?' selected':'')+'>'+esc(s.name)+'</option>').join('')+
   '</select></label><span>'+model.sheets.length+' sheet(s)</span></div>'+
   '<div class="office-nav"><span>Rows '+rowStart+'–'+(rowStart+39)+'</span>'+
   action('← 40 rows','office-prev-rows','','secondary')+
   action('Next 40 rows →','office-next-rows','','secondary')+
   '<label>Go to row <input id="office-go-row" type="number" min="1" max="1048576" value="'+rowStart+'"></label>'+
   action('Go','office-go-row-action','','secondary')+'</div>'+
   '<div class="office-nav"><span>Columns '+columnLabel(colStart)+'–'+columnLabel(cols.at(-1))+'</span>'+
   action('← Columns','office-prev-cols','','secondary')+
   action('Columns →','office-next-cols','','secondary')+
   '<label>Go to column <input id="office-go-col" maxlength="3" value="'+columnLabel(colStart)+'"></label>'+
   action('Go','office-go-col-action','','secondary')+'</div>'+
   '<div class="office-grid-wrap"><table class="office-grid"><thead><tr><th scope="col">#</th>'+
   cols.map(c=>'<th scope="col">'+columnLabel(c)+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(row=>'<tr><th scope="row">'+row+'</th>'+cols.map(col=>{
    const val=officeCellValue(model,row,col);
    return '<td><input type="text" aria-label="'+columnLabel(col)+row+'" data-office-cell-row="'+row+'" data-office-cell-col="'+col+'" value="'+esc(val)+'" autocomplete="off" spellcheck="false"></td>';
   }).join('')+'</tr>').join('')+'</tbody></table></div>'+
   '<p class="office-help">Type a number, text, or an Excel formula beginning with =. Formulas recalculate when opened in Excel. Use the row and column controls to edit cells elsewhere in the workbook.</p>';
 }else{
  const list=model.word.paragraphs,start=state.officeWordPage*30,end=Math.min(list.length,start+30);
  body='<div class="office-nav"><span>Body paragraphs '+(list.length?start+1:0)+'–'+end+' of '+list.length+'</span>'+
   action('← Previous','office-prev-word','','secondary')+
   action('Next →','office-next-word','','secondary')+'</div>'+
   '<div class="office-word-content">'+list.slice(start,end).map((p,i)=>{
    const idx=start+i;
    return '<label class="office-word-paragraph"><span>Paragraph '+(idx+1)+(p.editable?'':' · Read-only field')+'</span>'+
     (p.editable?'<textarea data-office-paragraph="'+idx+'" rows="'+Math.min(7,Math.max(2,Math.ceil(p.text.length/90)))+'" spellcheck="true">'+esc(p.text)+'</textarea>':
      '<p>'+esc(p.text)+'</p>')+'</label>';
   }).join('')+'</div>';
 }
 const status='<p class="office-editor-status" id="office-status" role="status">'+esc(state.officeStatus||'Changes will be saved automatically.')+'</p>';
 const changed=model.editedCount||0;
 const footer='<div class="office-editor-footer"><span class="office-edit-count" id="office-edit-count">'+changed+' unsaved change(s)</span>'+
  action('Save now','save-office-now','','primary')+
  action('Close editor','close-office','','secondary')+'</div>'+
  '<p class="office-help">Auto-save runs after you stop typing or leave a cell. Earlier uploaded file remains available as a previous version in the same company folder. Changes are private to your DMS account.</p>';
 return '<div class="modal-backdrop office-backdrop"><section class="modal office-modal" role="dialog" aria-modal="true" aria-label="Edit Office document">'+
  heading+note+body+status+footer+'</section></div>';
}
