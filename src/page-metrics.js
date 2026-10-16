/** Pure page-layout calculations shared by app and offline tests. */
export const PAGE_MM = Object.freeze({width:297,height:210});
export function comparePageCounts(editorCount,pdfCount){
 if(!Number.isInteger(editorCount)||editorCount<1||!Number.isInteger(pdfCount)||pdfCount<1)throw Error('Page counts must be positive integers');
 return {match:editorCount===pdfCount,editorCount,pdfCount,difference:pdfCount-editorCount};
}
export function fitPageImage(imageWidth,imageHeight){
 if(!(imageWidth>0&&imageHeight>0))throw Error('Invalid page image dimensions');
 const scale=Math.min(PAGE_MM.width/imageWidth,PAGE_MM.height/imageHeight);
 const width=imageWidth*scale,height=imageHeight*scale;
 return {x:(PAGE_MM.width-width)/2,y:(PAGE_MM.height-height)/2,width,height};
}
export function imageDataUri(value){
 if(typeof value!=='string'||!value.trim())throw Error('Editor returned an invalid page image');
 if(/^data:image\/(?:png|jpeg|jpg);base64,/i.test(value))return value;
 if(/^[A-Za-z0-9+/=\s]+$/.test(value))return 'data:image/png;base64,'+value.replace(/\s/g,'');
 throw Error('Unsupported editor page image format');
}
