/**
 * Two deliberately different PDF routes for the Nurse Memo evaluation.
 *
 * Page-locked export: each image returned by Canvas Editor becomes EXACTLY
 * one A4 landscape PDF page. This is a control for double-pagination and
 * remains rasterised, so searching/selecting its text is not expected.
 *
 * Vector export: canvas-editor-pdf renders the editor's structured data as
 * PDF drawing instructions. This route aims to preserve selectable text,
 * but its page breaks MUST be checked against the editor, not assumed.
 */
import { jsPDF } from 'jspdf';
import { DrawPdf } from 'canvas-editor-pdf';
import { PAGE_MM, fitPageImage, imageDataUri, comparePageCounts } from './page-metrics.js';
export { comparePageCounts } from './page-metrics.js';

export const EXPORT_NAMES = Object.freeze({
  images:'night-memo-page-locked-images.pdf',
  vector:'night-memo-vector-text.pdf'
});

export function makePageLockedPdfBase(pageImages, PDFClass=jsPDF) {
  if (!Array.isArray(pageImages) || pageImages.length===0) throw Error('Editor supplied no page images.');
  const pdf=new PDFClass({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  return pdf;
}

export function oneImagePerPage({images,dimensions}, PDFClass=jsPDF) {
  const pdf=makePageLockedPdfBase(images,PDFClass);
  if (!Array.isArray(dimensions) || dimensions.length!==images.length) throw Error('Each page requires its own measured image dimensions.');
  images.forEach((image,index)=>{
    if (index>0) pdf.addPage('a4','landscape');
    const {width,height}=dimensions[index];
    if(!(width>0 && height>0)) throw Error(`Invalid dimensions for editor page ${index+1}`);
    const {x,y,width:dw,height:dh}=fitPageImage(width,height);
    // Preserve the rendered sheet; never crop it or let Chrome paginate it.
    const format=/^data:image\/(?:jpeg|jpg);/i.test(image)?'JPEG':'PNG';
    pdf.addImage(image,format,x,y,dw,dh,undefined,'FAST');
  });
  const count=pdf.getNumberOfPages();
  if(count!==images.length) throw Error(`Page-locked export mismatch: ${count} PDF pages vs ${images.length} editor pages`);
  return {pdf,pageCount:count,landscape:true};
}

function loadImageDimensions(uri) {
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});
    image.onerror=()=>reject(Error('Cannot decode an editor page image.'));
    image.src=uri;
  });
}

export async function exportLockedPages(editor) {
  const raw=await editor.command.getImage();
  if(!Array.isArray(raw)||!raw.length)throw Error('Canvas Editor returned zero pages');
  const images=raw.map(imageDataUri);
  const dimensions=await Promise.all(images.map(loadImageDimensions));
  const result=oneImagePerPage({images,dimensions});
  result.pdf.save(EXPORT_NAMES.images);
  return {pageCount:result.pageCount,images:images.length,format:'A4 landscape',selectableText:false};
}

/**
 * `loadDefaultFonts` can fetch remote font assets at runtime in the browser.
 * It is opt-in so the default test also works where the font CDN is blocked.
 */
export async function exportVectorPdf(editor,{embedFonts=false}={}) {
  const {options,data}=editor.command.getValue();
  if (!options || !data?.main) throw Error('Document is missing options or body data.');
  const document=new DrawPdf(options,data,{loadDefaultFonts:embedFonts});
  if (embedFonts) await document.defaultFontsLoadedPromise;
  document.render();
  const pdf=document.getPdf();
  const count=pdf.getNumberOfPages();
  if (!count) throw Error('Vector exporter generated zero PDF pages.');
  const pages=Array.from({length:count},(_,i)=>{
    pdf.setPage(i+1);
    const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();
    return {width:Math.round(w*100)/100,height:Math.round(h*100)/100,landscape:w>h};
  });
  pdf.save(EXPORT_NAMES.vector);
  return {pageCount:count,format:'A4 landscape expected',selectableText:'to be checked in viewer',pageDimensions:pages};
}

