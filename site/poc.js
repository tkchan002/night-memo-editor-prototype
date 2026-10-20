/** Standalone, browser-local DOCX import/export compatibility harness.
 * NEVER sends a document to a server. Messages are checked for both origin and source.
 */
const $ = id => document.getElementById(id);
const frame = $('editor');
const editorUrl = new URL('./office/editor.html', location.href);
editorUrl.searchParams.set('embed','1');
editorUrl.searchParams.set('embedOrigin',location.origin);
editorUrl.searchParams.set('locale','en');
const editorOrigin = editorUrl.origin;
const buttons = ['open','docx','pdf','readOnly','editable','state'];
let ready = false;
let hasDocument = false;
let serial = 0;
let pending = null;
let checkedConverter = false;
let converterCheckPromise = null;
const rows = [];
function log(message) {
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  rows.push(line);
  if (rows.length > 150) rows.shift();
  $('log').textContent = rows.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}
function status(message, error=false) {
  $('status').textContent = message;
  $('dot').className = `dot ${error ? 'bad' : (ready ? 'on' : '')}`;
}
function refresh() {
  $('open').disabled = !ready || !$('file').files.length || !!pending;
  $('converterCheck').disabled = !!pending;
  for (const button of ['docx','pdf','readOnly','editable','state'])
    $(button).disabled = !ready || !hasDocument || !!pending;
}
function send(type, payload={}, waitFor='') {
  if (!ready) return Promise.reject(new Error('Editor has not signaled ready'));
  if (pending) return Promise.reject(new Error('Another editor operation is still running'));
  const id=`poc-${++serial}`;
  if (!waitFor) {
    frame.contentWindow.postMessage({id,type,payload}, editorOrigin);
    log(`Sent ${type}`);
    return Promise.resolve();
  }
  return new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{
      if (pending?.id!==id) return;
      pending=null;refresh();
      reject(new Error(`${type}: no ${waitFor} within 120 seconds`));
    },120000);
    pending={id,type,waitFor,resolve,reject,timer};
    refresh();
    frame.contentWindow.postMessage({id,type,payload}, editorOrigin);
    log(`Sent ${type} (${id})`);
  });
}
async function execute(label, task) {
  try {
    status(`${label}…`);
    const result=await task();
    status(typeof result === 'string' ? result : `${label} completed`);
  } catch(error) {
    status(`${label} failed: ${error.message}`,true);
    log(`ERROR ${label}: ${error.message}`);
  } finally { refresh(); }
}
window.addEventListener('message', event => {
  if (event.origin!==editorOrigin || event.source!==frame.contentWindow) return;
  const {type,id,payload={}}=event.data||{};
  if (typeof type!=='string' || !type.startsWith('document:')) return;
  if (type==='document:ready') {
    ready=true; status('Editor bridge ready'); log('Received document:ready'); refresh(); return;
  }
  if (type==='document:modified' || type==='document:dirty-changed') {
    log(`${type}${'dirty' in payload ? `: ${Boolean(payload.dirty)}` : ''}`); return;
  }
  if (type==='document:readonly-changed') { log('Read-only state notification'); return; }
  if (type==='document:saved' && payload.userInitiated && !id) {
    log('Editor toolbar Save: userInitiated event received');
    if (payload.file instanceof Blob) download(payload.file,payload.fileName||'EuroOffice-edit.docx');
    return;
  }
  if (!pending || pending.id!==id) {
    if (type==='document:error') log(`Unsolicited editor error: ${payload.message||'Unknown'}`);
    return;
  }
  const req=pending;
  if (type!=='document:error' && type!==req.waitFor) return;
  clearTimeout(req.timer);pending=null;refresh();
  if (type==='document:error') req.reject(new Error(payload.message||'Editor reported an error'));
  else {log(`Received ${type}`);req.resolve(payload);}
});
function download(blob,filename) {
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),15000);
}
function checkDocx(bytes) { return bytes[0]===0x50 && bytes[1]===0x4b; }
/** Check the actual *deployed* JS+WASM, not just the inputs fetched in CI.
 * This catches stale GitHub Pages assets, stale service worker caches and any
 * Vite output unexpectedly overwritten between the input and deployed site.
 */
async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
}
async function fetchVerifiedAsset(path, expectedHash, gzip=false) {
  const url=new URL(`./office/sdkjs/common/wasm/x2t/${path}`,location.href);
  url.searchParams.set('v',expectedHash.slice(0,16));
  const response=await fetch(url.href,{cache:'reload'});
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} at ${url.pathname}`);
  let bytes;
  if (gzip) {
    if (typeof DecompressionStream!=='function' || !response.body)
      throw new Error('Browser does not support the converter gzip probe');
    bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  } else bytes=await response.arrayBuffer();
  const actualHash=await sha256(bytes);
  if (actualHash!==expectedHash)
    throw new Error(`${path} SHA256 mismatch: expected ${expectedHash.slice(0,16)}…, received ${actualHash.slice(0,16)}…`);
  log(`Verified ${path}: ${actualHash.slice(0,16)}… (${bytes.byteLength.toLocaleString()} bytes)`);
  return bytes;
}
async function verifyConverter() {
  if (checkedConverter) return;
  if (converterCheckPromise) return converterCheckPromise;
  converterCheckPromise=(async()=>{
    const manifestUrl=new URL('./office/eurooffice-poc-build.json',location.href);
    const metaResponse=await fetch(manifestUrl.href,{cache:'reload'});
    if (!metaResponse.ok) throw new Error(`Build metadata missing: HTTP ${metaResponse.status}`);
    const meta=await metaResponse.json();
    if (!/^v\d+\.\d+\.\d+/.test(meta.upstreamReleaseTag || '') ||
        meta.browserConverterVersion !== meta.upstreamReleaseVersion ||
        meta.mixedVersionExperiment !== false ||
        !/^[a-f0-9]{40}$/.test(meta.converterCoreCommit || ''))
      throw new Error('Missing or unexpected editor/converter provenance metadata');
    $('versionStatus').textContent = `Editor ${meta.upstreamReleaseTag} · browser converter ${meta.browserConverterVersion} (matching source build)`;
    log(`Editor ${meta.upstreamReleaseTag}; x2t converter ${meta.browserConverterVersion} (source version matched; document behavior still needs testing)`);
    if (!/^[0-9a-f]{64}$/.test(meta.converterJsSha256||'') ||
        !/^[0-9a-f]{64}$/.test(meta.converterWasmSha256||''))
      throw new Error('Site lacks the new converter-integrity metadata. Deploy updated GitHub Actions files first.');
    await fetchVerifiedAsset('x2t.js',meta.converterJsSha256);
    // Probe the exact gzip asset that the editor loads, not the raw fallback.
    // The SHA is over decompressed WASM bytes, identical to the pinned archive.
    await fetchVerifiedAsset('x2t.wasm.gz',meta.converterWasmSha256,true);
    checkedConverter=true;
    log(`Converter preflight passed (WASM imports: ${JSON.stringify(meta.converterImports)})`);
  })();
  try{return await converterCheckPromise;}finally{converterCheckPromise=null;}
}
$('converterCheck').addEventListener('click',()=>execute('Check deployed converter',verifyConverter));

async function exportFile(format) {
  const payload=await send('document:save',{targetExt:format},'document:saved');
  if (!(payload.file instanceof Blob)) throw new Error('Editor did not return a Blob');
  const bytes=new Uint8Array(await payload.file.slice(0,5).arrayBuffer());
  if (format==='DOCX' && !checkDocx(bytes)) throw new Error('DOCX did not begin with ZIP signature');
  if (format==='PDF' && new TextDecoder().decode(bytes)!=='%PDF-') throw new Error('PDF did not begin with %PDF-');
  log(`${format} exported successfully (${payload.file.size.toLocaleString()} bytes)`);
  download(payload.file,`EuroOffice-browser-test.${format.toLowerCase()}`);
}
$('file').addEventListener('change',refresh);
$('open').addEventListener('click',()=>execute('Open DOCX',async()=>{
  const f=$('file').files?.[0];
  if (!f || !/\.docx$/i.test(f.name)) throw new Error('Select a .docx file');
  await verifyConverter();
  const data=await f.arrayBuffer();
  if (!checkDocx(new Uint8Array(data))) throw new Error('Selected file does not look like a DOCX');
  await send('document:open-buffer',{buffer:data,fileName:f.name,readonly:false},'document:opened');
  hasDocument=true; $('docName').textContent=f.name;
  log(`Document-open message acknowledged for ${f.name} (${f.size.toLocaleString()} bytes); rendering and export not yet verified`);
  return 'Open acknowledged; check rendered pages and DOCX/PDF export before treating this as working';
}));
$('docx').addEventListener('click',()=>execute('Export DOCX',()=>exportFile('DOCX')));
$('pdf').addEventListener('click',()=>execute('Export PDF',()=>exportFile('PDF')));
$('readOnly').addEventListener('click',()=>execute('Set read-only',()=>send('document:set-readonly',{readonly:true})));
$('editable').addEventListener('click',()=>execute('Set editable',()=>send('document:set-readonly',{readonly:false})));
$('state').addEventListener('click',()=>execute('Get state',async()=>{
  const state=await send('document:get-state',{},'document:state');
  log(`State ${JSON.stringify({readonly:state.readonly,hasDocument:state.hasDocument,dirty:state.dirty})}`);
}));
$('copyLog').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(rows.join('\n'));status('Diagnostic log copied');}
  catch{status('Clipboard unavailable. Select and copy the log manually.',true);}
});
frame.addEventListener('load',()=>log('Editor iframe loaded (not yet proof of ready).'));
log('Initializing embedded browser editor…');
frame.src=editorUrl.href;
