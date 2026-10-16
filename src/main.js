import Editor from '@hufe921/canvas-editor';
import { makeNightMemoFixture, summariseFixture } from './night-memo-fixture.js';

const $=id=>document.getElementById(id);
const notice=(message,state='ok')=>{ $('notice').textContent=message; $('notice').dataset.state=state; };
let editor;
let sequence=0;
const OPTIONS = {
  locale:'en', width:1123, height:794, paperDirection:'horizontal', pageMode:'paging',
  margins:[52,55,52,55], pageGap:22,defaultFont:'Arial',defaultSize:14,
  renderMode:'compatibility',printPixelRatio:2,
  table:{defaultTrMinHeight:28, defaultColMinWidth:26,tdPadding:[3,4,3,4],overflow:false},
  pageNumber:{disabled:false,format:'Page {pageNo} of {pageCount}',size:11,bottom:24},
};
function assertDoc(doc) {
 const x=summariseFixture(doc);
 if(x.tableCount!==3 || x.admissions<10 || x.infections<10)throw Error('Invalid Night Memo fixture');
 return x;
}
function init() {
 const fixture=makeNightMemoFixture({stress:true});
 assertDoc(fixture);
 editor=new Editor($('canvas-editor'),fixture,OPTIONS);
 window.__NurseMemoCanvasProbe={editor,OPTIONS,makeNightMemoFixture,
  async pageCount(){ const pages=await editor.command.getImage(); return pages.length;},
  save(){return editor.command.getValue()},
  reset(stress=true){editor.command.executeSetValue(makeNightMemoFixture({stress}));},
  stats(){return summariseFixture(editor.command.getValue().data)},
 };
 notice('Canvas Editor loaded. Fictional multi-page report ready; select a table cell to edit rows.');
}
try{init();}catch(error){notice('Editor failed to initialise: '+error.message,'error');throw error;}

const command=(name,...args)=>{
 const fn=editor.command[name]; if(typeof fn!=='function')throw new Error('Unavailable command: '+name);
 return fn.apply(editor.command,args);
};
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{
 try{command(b.dataset.command);notice(`${b.textContent.trim()} command sent`);}catch(e){notice(e.message,'error');}
}));
document.querySelectorAll('[data-fixture]').forEach(b=>b.addEventListener('click',()=>{
 const stress=b.dataset.fixture==='stress';
 if(!confirm('Replace the current test document with fictional sample data?'))return;
 command('executeSetValue',makeNightMemoFixture({stress}));
 notice(`Loaded ${stress?'multi-page':'10-ward'} Night Memo fixture.`);
}));
$('page-check').addEventListener('click',async()=>{
 try{
  notice('Computing page images from the editor…');
  const images=await editor.command.getImage();
  const saved=editor.command.getValue();
  const s=summariseFixture(saved.data);
  notice(`Rendered pages: ${images.length} | Admission rows: ${s.admissions} | Infection rows: ${s.infections} | Tables: ${s.tableCount}`);
 }catch(e){notice('Page-count test failed: '+e.message,'error');}
});
$('add-paragraph').addEventListener('click',()=>{
 try{
  sequence++;
  command('executeAppendElementList',[
   {value:'\n'}, {value:`Live reflow test paragraph ${sequence}: added after report generation. `+'Additional text '.repeat(35),font:'Arial',size:14}, {value:'\n'}
  ]);
  notice(`Appended paragraph ${sequence}. Recount pages to test reflow.`);
 }catch(e){notice('Append failed: '+e.message,'error');}
});
$('save').addEventListener('click',()=>{
 try{
  const data=editor.command.getValue();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='night-memo-canvas-test.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  sessionStorage.setItem('nurse-memo-canvas-test',JSON.stringify(data));
  notice('Document exported and saved in this browser session. Use Reload saved JSON to test round-trip.');
 }catch(e){notice('Save failed: '+e.message,'error');}
});
$('restore').addEventListener('click',()=>{
 try{
  const data=JSON.parse(sessionStorage.getItem('nurse-memo-canvas-test')||'null');
  if(!data?.data?.main)throw new Error('Save a document first.');
  command('executeSetValue',data.data);
  notice('Saved document restored from browser session; inspect table edits and page count.');
 }catch(e){notice('Restore failed: '+e.message,'error');}
});
$('print').addEventListener('click',()=>{
 try{command('executePrint');notice('Requested Canvas Editor native print. Compare page count and table rows with editor.');}
 catch(e){notice('Print failed: '+e.message,'error');}
});
