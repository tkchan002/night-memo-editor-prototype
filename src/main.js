import Editor from '@hufe921/canvas-editor';
import {makeNightMemoFixture,summariseFixture} from './night-memo-fixture.js';
import {exportLockedPages,exportVectorPdf} from './pdf-export.js';
import {comparePageCounts} from './page-metrics.js';

const $=id=>document.getElementById(id);
const notice=(message,state='ok')=>{ $('notice').textContent=message; $('notice').dataset.state=state; };
const results={editor:null,locked:null,vector:null,native:null};
let editor;
let sequence=0;
let busy=false;
const OPTIONS = {
  locale:'en', width:1123, height:794, paperDirection:'horizontal', pageMode:'paging',
  margins:[52,55,52,55], pageGap:22, defaultFont:'Arial', defaultSize:14,
  renderMode:'compatibility',printPixelRatio:2,
  table:{defaultTrMinHeight:28, defaultColMinWidth:26,tdPadding:[3,4,3,4],overflow:false},
  pageNumber:{disabled:false,format:'Page {pageNo} of {pageCount}',size:11,bottom:24},
};
function assertDoc(doc) {
 const x=summariseFixture(doc);
 if(x.tableCount!==3 || x.admissions<10 || x.infections<10)throw Error('Invalid Night Memo fixture');
 return x;
}
function updateResults(){
 $('count-editor').textContent=results.editor??'—';
 $('count-locked').textContent=results.locked??'—';
 $('count-vector').textContent=results.vector??'—';
 $('count-native').textContent=results.native??'—';
 const known=results.editor!=null && results.vector!=null;
 $('comparison').textContent=known?(comparePageCounts(results.editor,results.vector).match?
   'Vector PDF page count MATCHES the editor. Inspect page breaks and text selection next.':
   `Vector PDF page count DOES NOT MATCH (${results.editor} editor / ${results.vector} vector). Do not approve this engine yet.`):
   'Export a vector PDF to compare counts. Native print page count must be checked manually in Chrome.';
 $('comparison').dataset.state=known&&results.editor!==results.vector?'error':'ok';
}
async function editorPages(){
 const images=await editor.command.getImage();
 if(!Array.isArray(images))throw Error('Canvas Editor returned an unexpected page list');
 results.editor=images.length;updateResults();return images.length;
}
async function withTask(button,description,task){
 if(busy)return;
 busy=true;
 const buttons=[...document.querySelectorAll('button')];
 buttons.forEach(b=>b.disabled=true);
 try{notice(description); await task();}
 catch(error){console.error(error);notice(`${description}: ${error.message||error}`,'error');}
 finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
function init(){
 const fixture=makeNightMemoFixture({stress:true});
 assertDoc(fixture);
 editor=new Editor($('canvas-editor'),fixture,OPTIONS);
 window.__NurseMemoCanvasProbe={editor,OPTIONS,makeNightMemoFixture,results,
  async pageCount(){return editorPages()},
  save(){return editor.command.getValue()},
  reset(stress=true){editor.command.executeSetValue(makeNightMemoFixture({stress}));},
  stats(){return summariseFixture(editor.command.getValue().data)},
 };
 notice('Real Canvas Editor loaded. Select a table cell to add a row; run the three print tests to compare pagination.');
 updateResults();
}
try{init();}catch(error){notice('Editor failed to initialise: '+error.message,'error');throw error;}

const command=(name,...args)=>{
 const fn=editor.command[name];if(typeof fn!=='function')throw Error(`Unsupported Canvas Editor command: ${name}`);
 return fn.apply(editor.command,args);
};
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>{
 try{command(button.dataset.command);notice(`${button.textContent.trim()} command sent.`);}catch(error){notice(error.message,'error');}
}));
document.querySelectorAll('[data-fixture]').forEach(button=>button.addEventListener('click',()=>{
 const stress=button.dataset.fixture==='stress';
 if(!confirm('Replace your current test document with fictional sample data?'))return;
 command('executeSetValue',makeNightMemoFixture({stress}));
 results.editor=results.locked=results.vector=results.native=null;updateResults();
 notice(`Loaded ${stress?'72-admission-row stress':'10-ward normal'} test. Recount before exporting.`);
}));
$('page-check').addEventListener('click',()=>withTask(null,'Counting editor pages',async()=>{
 const count=await editorPages();
 const s=summariseFixture(editor.command.getValue().data);
 notice(`Editor: ${count} pages, ${s.admissions} admission rows, ${s.infections} infection rows, ${s.tableCount} tables.`);
}));
$('add-paragraph').addEventListener('click',()=>{
 try{
  sequence++;
  command('executeAppendElementList',[
   {value:'\n'}, {value:`Reflow test ${sequence}: `+'Additional text '.repeat(35),font:'Arial',size:14}, {value:'\n'}
  ]);
  results.editor=results.locked=results.vector=results.native=null;updateResults();
  notice('Paragraph appended. Recount editor pages, then export new PDFs.');
 }catch(error){notice(error.message,'error');}
});
$('save').addEventListener('click',()=>{
 try{
  const data=editor.command.getValue();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='night-memo-canvas-test.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  sessionStorage.setItem('nurse-memo-canvas-test',JSON.stringify(data));
  notice('JSON downloaded and saved in this tab. Use Reload JSON to test round-trip.');
 }catch(error){notice(error.message,'error');}
});
$('restore').addEventListener('click',()=>{
 try{
  const data=JSON.parse(sessionStorage.getItem('nurse-memo-canvas-test')||'null');
  if(!data?.data?.main)throw Error('Save a document first');
  command('executeSetValue',data.data);
  results.editor=results.locked=results.vector=results.native=null;updateResults();
  notice('Restored saved JSON. Recount and export after checking your edits.');
 }catch(error){notice(error.message,'error');}
});
$('native-print').addEventListener('click',()=>{
 try{command('executePrint');notice('Native print requested. Record the number of physical PDF pages Chrome produces (previously 10 vs 7 editor pages).');}
 catch(error){notice(error.message,'error');}
});
$('page-locked-export').addEventListener('click',()=>withTask(null,'Building a page-locked image PDF',async()=>{
 const count=await editorPages();
 const outcome=await exportLockedPages(editor);
 results.locked=outcome.pageCount;updateResults();
 notice(`Page-locked PDF downloaded: ${outcome.pageCount} A4 landscape PDF pages for ${count} editor pages. Raster images: text will NOT be selectable.`);
}));
$('vector-export').addEventListener('click',()=>withTask(null,'Building a vector PDF',async()=>{
 const count=await editorPages();
 const outcome=await exportVectorPdf(editor,{embedFonts:$('embed-fonts').checked});
 results.vector=outcome.pageCount;updateResults();
 const consistent=comparePageCounts(count,outcome.pageCount).match;
 const correctLandscape=outcome.pageDimensions.every(p=>p.landscape);
 notice(`Vector PDF downloaded: ${outcome.pageCount} pages, editor ${count} pages. ${consistent?'Count matches.':'COUNT MISMATCH.'} ${correctLandscape?'Landscape dimensions verified in export metadata.':'WARNING: non-landscape PDF page found.'} Check page breaks and selectable text in Chrome.`,consistent&&correctLandscape?'ok':'error');
}));

$('native-pages').addEventListener('change',()=>{
 const value=$('native-pages').value.trim();
 results.native=value?Number(value):null;
 updateResults();
 if(results.native!=null&&results.editor!=null){
  const diff=comparePageCounts(results.editor,results.native);
  notice(diff.match?'Native physical PDF page count matches the editor.':'Native print mismatch reproduced: '+diff.pdfCount+' physical PDF pages versus '+diff.editorCount+' editor pages.',diff.match?'ok':'error');
 }
});
