"""No-dependency checks that can run on GitHub Actions and on Linux."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parent.parent
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

assert (ROOT/'.github/workflows/deploy-pages.yml').is_file()
assert (ROOT/'index.html').is_file()
assert (ROOT/'assets/app.js').is_file()
assert (ROOT/'assets/style.css').is_file()
js=(ROOT/'assets/app.js').read_text()
for keyword in ['document:open-buffer','document:ready','document:saved','document:error','document:dirty-changed','document:save','document:get-state','event.origin===EDITOR_ORIGIN']:
    assert keyword in js,keyword
for filename,admissions,infections in [('night-memo-normal-10.docx',10,10),('night-memo-stress-72-38.docx',72,38)]:
    p=ROOT/'fixtures'/filename
    with ZipFile(p) as z:
        files=set(z.namelist())
        assert '[Content_Types].xml' in files and 'word/document.xml' in files
        doc=ET.fromstring(z.read('word/document.xml'))
        sec=doc.find('.//'+W+'sectPr')
        if sec is None:sec=doc.find('.//'+W+'sectPr')
        pg=doc.find('.//'+W+'pgSz')
        assert pg is not None and pg.attrib.get(W+'orient')=='landscape',filename
        tables=doc.findall('.//'+W+'tbl')
        assert len(tables)>=4,filename
        all_text=''.join(node.text or '' for node in doc.findall('.//'+W+'t'))
        assert 'Night Memo' in all_text
        assert 'Admissions / discharge / bed status' in all_text
        assert 'Infectious Case' in all_text
        assert 'Additional Report' in all_text
        # The admission and infection tables are tables[1] and tables[2].
        admission_rows=tables[1].findall(W+'tr')
        infection_rows=tables[2].findall(W+'tr')
        assert len(admission_rows)==admissions+2,(filename,len(admission_rows))
        assert len(infection_rows)==infections+1,(filename,len(infection_rows))
        assert len(admission_rows[0].findall('.//'+W+'tblHeader'))>0
        assert len(admission_rows[1].findall('.//'+W+'tblHeader'))>0
        assert len(infection_rows[0].findall('.//'+W+'tblHeader'))>0
        print(f'PASS {filename}: {admissions} admission rows, {infections} infection rows; landscape, repeat headers')
print('PASS web files, event bridge and deployment workflow')
