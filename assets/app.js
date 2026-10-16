'use strict';
// Standalone GitHub Pages host for the DOCUMENTED ranuts/document embed protocol.
// Editing is performed by an independent external origin. No Supabase or authentication.
const EDITOR_URL = 'https://edit.chaxus.com/editor';
const EDITOR_ORIGIN = new URL(EDITOR_URL).origin;
const DOCUMENTS = Object.freeze({
  normal: {path:'./fixtures/night-memo-normal-10.docx',filename:'night-memo-normal-10.docx',label:'Normal Night Memo (10 wards)'},
  stress: {path:'./fixtures/night-memo-stress-72-38.docx',filename:'night-memo-stress-72-38.docx',label:'Stress Night Memo (72 admission rows + 38 infection rows)'},
});
const $ = id => document.getElementById(id);
const frame = $('document-frame');
let ready = false;
let opened = false;
let dirty = false;
let loadedName = '';
let actionId = 0;
let activeRequest = null;
let fallbackTimer = null;
const logLines = [];
function log(message) {
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  logLines.push(line); if(logLines.length>90) logLines.shift();
  $('event-log').textContent = logLines.join('\n');
}
function showStatus(text,cssClass='') {
  $('connection-status').textContent=text;
  $('ready-indicator').className='status-dot'+(cssClass?' '+cssClass:'');
}
function refreshControls() {
  for (const id of ['load-normal','load-stress','upload-docx','check-state']) $(id).disabled=!ready || !!activeRequest;
  $('save-docx').disabled=!ready || !opened || !!activeRequest;
  $('export-pdf').disabled=!ready || !opened || !!activeRequest;
  $('current-document').textContent=loadedName||'No document open';
  $('edit-state').textContent=!ready?'Waiting for editor':!opened?'Editor ready':dirty?'Unsaved changes in editor':'Document opened / saved';
}
function request(type,payload={},context={}) {
  if (!ready || !frame.contentWindow) throw new Error('The editor has not become ready yet.');
  if(activeRequest) throw new Error(`Wait for ${activeRequest.type} to finish.`);
  const id=`nm-${++actionId}`;
  activeRequest={id,type,context};
  refreshControls();
  frame.contentWindow.postMessage({id,type,payload},EDITOR_ORIGIN);
  log(`Sent ${type} (${id})`);
  return id;
}
function endRequest(id) {
  if (!activeRequest) return;
  if(id && id!==activeRequest.id) { log(`Received a response for ${id}; awaiting ${activeRequest.id}`);return; }
  activeRequest=null;refreshControls();
}
async function openFixture(kind) {
  const cfg=DOCUMENTS[kind];if(!cfg) return;
  if(dirty&&!window.confirm('The current memo has unsaved changes. Replace it without saving?'))return;
  try {
    log(`Fetching ${cfg.filename} from GitHub Pages`);
    const response=await fetch(new URL(cfg.path,document.baseURI),{cache:'no-cache'});
    if(!response.ok) throw new Error(`HTTP ${response.status} fetching ${cfg.filename}`);
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength<5000) throw new Error('Downloaded DOCX is unexpectedly small.');
    opened=false;dirty=false;loadedName='';
    request('document:open-buffer',{fileName:cfg.filename,buffer,readonly:false},{name:cfg.filename});
    $('current-document').textContent=`Opening ${cfg.label}…`;
  } catch(error){log(`ERROR: ${error.message}`);showStatus('Open failed','error');endRequest();}
}
async function openUserDocx(file) {
  if(!file)return;
  if(!/\.docx$/i.test(file.name)){log('ERROR: Please choose a .docx file.');return;}
  if(dirty&&!window.confirm('Discard unsaved changes and open a different DOCX?'))return;
  try{
    const buffer=await file.arrayBuffer();opened=false;dirty=false;loadedName='';
    request('document:open-buffer',{fileName:file.name,buffer,readonly:false},{name:file.name});
  } catch(error){log(`ERROR: ${error.message}`);endRequest();}
}
function saveDocument(ext) {
  try {request('document:save',{targetExt:ext},{ext});}catch(error){log(`ERROR: ${error.message}`);}
}
async function downloadReturnedFile(file,name,format) {
  if(!(file instanceof Blob))throw new Error('Editor did not return a downloadable File/Blob.');
  const head=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(format==='PDF'&&String.fromCharCode(...head.slice(0,5))!=='%PDF-')throw new Error('Returned data is not a PDF document.');
  if(format==='DOCX'&&!(head[0]===0x50&&head[1]===0x4b))throw new Error('Returned data is not a DOCX ZIP package.');
  const url=URL.createObjectURL(file);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  log(`Downloaded ${name} (${file.size.toLocaleString()} bytes)`);
}
function isTrustedMessage(event) {
  return event.origin===EDITOR_ORIGIN && event.source===frame.contentWindow && event.data && typeof event.data.type==='string' && event.data.type.startsWith('document:');
}
window.addEventListener('message',async event=>{
  if(!isTrustedMessage(event))return;
  const {id,type,payload={}}=event.data;
  if(type==='document:ready') {
    ready=true;showStatus('Editor ready','ok');$('frame-fallback').hidden=true;
    if(fallbackTimer)clearTimeout(fallbackTimer);
    log('Received document:ready from external editor.');refreshControls();
    if(!opened&&!activeRequest)await openFixture('normal');
    return;
  }
  if(type==='document:opened') {
    loadedName=activeRequest?.context?.name||loadedName||'Edited document';opened=true;dirty=false;
    showStatus('Document opened','ok');log(`Document opened: ${loadedName}`);endRequest(id);refreshControls();return;
  }
  if(type==='document:saved') {
    const format=activeRequest?.context?.ext||'DOCX';
    const file=payload.file;
    const safeStem=(loadedName||'night-memo').replace(/\.docx$/i,'').replace(/[^a-z0-9_-]/gi,'-');
    const name=`${safeStem}-edited.${format.toLowerCase()}`;
    try {await downloadReturnedFile(file,name,format);if(format==='DOCX')dirty=Boolean(payload.dirty);showStatus(`${format} exported`,'ok');}
    catch(error){log(`EXPORT FAILED: ${error.message}`);showStatus('Export failed','error');}
    log(`Received document:saved (dirty=${String(payload.dirty)}, target=${format})`);
    endRequest(id);refreshControls();return;
  }
  if(type==='document:dirty-changed') {dirty=Boolean(payload.dirty);log(dirty?'Editor reports unsaved edits':'Editor reports clean state');refreshControls();return;}
  if(type==='document:state') {dirty=Boolean(payload.dirty);opened=Boolean(payload.hasDocument);log(`State: opened=${opened}, dirty=${dirty}, readonly=${Boolean(payload.readonly)}`);endRequest(id);refreshControls();return;}
  if(type==='document:error') {log(`EDITOR ERROR: ${payload.message||'No details supplied'}`);showStatus('Editor reported an error','error');endRequest(id);return;}
  log(`Received ${type}`);
});
$('load-normal').addEventListener('click',()=>openFixture('normal'));
$('load-stress').addEventListener('click',()=>openFixture('stress'));
$('upload-docx').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';openUserDocx(file);});
$('save-docx').addEventListener('click',()=>saveDocument('DOCX'));
$('export-pdf').addEventListener('click',()=>saveDocument('PDF'));
$('check-state').addEventListener('click',()=>{try{request('document:get-state');}catch(error){log(error.message);}});
$('clear-log').addEventListener('click',()=>{logLines.length=0;$('event-log').textContent='';});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
frame.addEventListener('load',()=>{log('Iframe load event fired. Waiting for documented document:ready message.');});
frame.src=`${EDITOR_URL}?embed=1&embedOrigin=${encodeURIComponent(window.location.origin)}&locale=en`;
log(`Host origin: ${window.location.origin}`);
log(`Editor origin: ${EDITOR_ORIGIN}`);
log('The remote editor is not part of this GitHub Pages source repository.');
refreshControls();
fallbackTimer=setTimeout(()=>{if(!ready){$('frame-fallback').hidden=false;showStatus('Editor did not signal ready','error');log('No document:ready after 35 seconds; try standalone fallback.');}},35000);
