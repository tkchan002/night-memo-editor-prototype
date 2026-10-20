/** Pure helpers for the standalone EuroOffice document shell. */
export function isDocxHeader(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
     (bytes[2] === 0x05 && bytes[3] === 0x06));
}
export function isPdfHeader(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return b.length >= 5 && b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70 && b[4] === 45;
}
export function safeStem(value) {
  const str = String(value ?? '').replace(/\.docx$/i, '').trim()
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '')
    .replace(/[. ]+$/g, '').trim().slice(0, 110);
  return str || 'Untitled document';
}
export function downloadName(stem, format) {
  if (!['docx','pdf'].includes(format)) throw new Error('Unsupported export format');
  return `${safeStem(stem)}.${format}`;
}
export function messageFromEditor(event, editorOrigin, contentWindow) {
  if (event.origin !== editorOrigin || event.source !== contentWindow) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string' ||
      !data.type.startsWith('document:')) return null;
  return data;
}
