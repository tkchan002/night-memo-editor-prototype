/** Fictional Nurse Memo data. Test-only; contains no clinical records. */
export const WARDS = ['C10','E10','G2','F10','E6','C6','G10','G11','B10','H6'];
const cell = (value, {header=false, colspan=1, rowspan=1}={}) => ({
  colspan, rowspan,
  value: [{value: String(value ?? ''), size: header ? 12 : 13, font: 'Arial', bold:header}]
});
const row = (values, {header=false, height=28, repeat=false}={}) => ({
  height, minHeight: height, pagingRepeat: repeat,
  tdList: values.map(v => Array.isArray(v) ? cell(v[0], {header, colspan:v[1], rowspan:v[2] || 1}) : cell(v, {header}))
});
const text = (value, {size=14,bold=false,align='left'}={}) => ({
  value, font:'Arial', size, bold, rowFlex:align
});
function table(widths, rows) {
  return {
    type:'table', value:'', width:widths.reduce((a,b)=>a+b,0),
    borderWidth:1, borderColor:'#444444',
    colgroup: widths.map(width=>({width})),
    trList:rows
  };
}
function admissionTable(count) {
  const widths=[60,42,42,42,65,43,45,92,75,78,70,74,126];
  const header1 = row([
    ['Ward',1,2],['Admission',3,1],['Discharge',3,1],
    ['Total Patient',1,2],['Empty Bed',1,2],['Vent. Case',1,2],
    ['Bipap Case',1,2],['HFNC Case',1,2],['AM/PM Staff No.',1,2]
  ], {header:true, height:36, repeat:true});
  const header2 = row(['E/C','C/C','T/I','Home','T/O','Death'], {header:true,height:30,repeat:true});
  const rows=Array.from({length:count},(_,i)=>{
    const n=i%10; const name = count > 10 ? `${WARDS[n]}-${String(1+Math.floor(i/10)).padStart(2,'0')}` : WARDS[n];
    return row([name, n%4, n%3, n%2, (n+1)%4, n%2, 0, 24+n, n%3, n%2, (n+2)%3, n%2, 6+n%3],{height:29});
  });
  return table(widths,[header1,header2,...rows]);
}
function infectionTable(count) {
  const widths=[70,105,66,66,72,58,112,165,215];
  const heads=['Ward','COVID-19','CRE','VRE','MDRA','CD','Influenza','No. of HD / CAPD case','Remarks'];
  const rows=[row(heads,{header:true,height:38,repeat:true})];
  for(let i=0;i<count;i++) rows.push(row([
    count>10 ? `${WARDS[i%10]}-${String(1+Math.floor(i/10)).padStart(2,'0')}`:WARDS[i%10],
    i%4===0?1:0, 0, i%9===0?1:0,0,0,i%7===0?1:0,
    i%5===0?'HD 1': '-',i%8===0?'Cohort room observation':'—'
  ],{height:32}));
  return table(widths,rows);
}
export function makeNightMemoFixture({stress=true}={}) {
  const admissions= stress ? 72 : 10;
  const infections= stress ? 38 : 10;
  const main=[
    text('Night Memo',{size:25,bold:true,align:'center'}),text('\n'),
    text('From: N.O./APN, Example Manager     To: DOM/Medical (QEH)',{bold:true}),text('\n'),
    text('DECT Phone: 0000 0000     Date: 16/10/2026     Call (Team): 0',{}),text('\n'),
    text('Admissions / discharge / bed status', {bold:true,size:16}),text('\n'),
    admissionTable(admissions),text('\n'),
    text('Infectious Case:',{bold:true,size:16}),text('\n'),
    infectionTable(infections),text('\n'),
    text('Early bird:',{bold:true}),text('\n'),
    text('Fictional sample: two admissions expected for morning handover. Change this paragraph to test repagination.'),text('\n'),
    text('Empty Bed:',{bold:true}),text('\n'),
    text('Fictional sample: wards to confirm vacancy before 06:00.'),text('\n'),
    text('Additional Report:',{bold:true}),text('\n'),
    text('Use this area to test editable text, wrapping, and automatic page reflow.'),text('\n'),
    text('Total No. of CT scan done: 8'),text('\n'),
    text('At 06:00',{bold:true}),text('\n'),
    table([100,110,110],[row(['','General','Cohort'],{header:true,repeat:true}),row(['Male',20,3]),row(['Female',16,2])]),text('\n'),
    text('Signature: Example Manager     Designation: N.O./APN'),
  ];
  return {main};
}
export function summariseFixture(document) {
  const tables=(document?.main || []).filter(e=>e.type==='table');
  return {tableCount:tables.length, admissions:tables[0]?.trList.length-2,infections:tables[1]?.trList.length-1, rows:tables.reduce((n,t)=>n+t.trList.length,0)};
}
