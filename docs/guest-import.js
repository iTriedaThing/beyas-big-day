const limits = {household:160, guest_name:120, companion:3, rsvp:7, email:254, phone:100, address:1000, dietary_notes:2000};
export const maxFileBytes = 1024 * 1024;
const maxGuests = 1000;

// Keep the physical starting line so a quoted address can span lines without shifting later errors.
function csvRecords(source) {
  const records = [];
  let cells = [], value = '', quoted = false, closed = false, line = 1, start = 1;
  function endCell() {
    cells.push(value.trim());
    if (cells.length > Object.keys(limits).length) throw Error('Line '+start+' has too many columns. Check the template and quote values containing commas.');
    value = ''; closed = false;
  }
  function endRecord() {
    endCell();
    if (cells.some(Boolean) || cells.length>1) records.push({line:start,cells});
    if (records.length>maxGuests+1) throw Error('Use at most 1,000 guest rows per file. Keep each household in one file.');
    cells = [];
  }
  const text = source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') {
      if (quoted && text[i+1]==='"') { value+='"'; i++; }
      else if (quoted) { quoted=false; closed=true; }
      else if (!value && !closed) quoted=true;
      else throw Error('Line '+line+' has an unexpected quote. Double quotes inside a quoted value.');
    } else if (!quoted && c===',') endCell();
    else if (!quoted && c==='\n') { endRecord(); line++; start=line; }
    else {
      if (closed) throw Error('Line '+line+' has text after a closing quote. Use a comma or end the row.');
      if (c<' ' && c!=='\n' && c!=='\t') throw Error('Line '+line+' contains an invalid control character. Save the template as CSV UTF-8.');
      value+=c;
      if (c==='\n') line++;
    }
  }
  if (quoted) throw Error('Line '+start+' has a quoted field with no closing quote.');
  endRecord();
  return records;
}

export function prepareGuestImport(source, invitations=[]) {
  if (new TextEncoder().encode(source).length>maxFileBytes) throw Error('Use a CSV file of 1 MiB or smaller.');
  const [header,...rows]=csvRecords(source);
  if (!header) throw Error('The file is empty. Download the guest CSV template.');
  const columns=header.cells.map(s=>s.toLowerCase());
  for (const key of columns) {
    if (!Object.hasOwn(limits,key)) throw Error('Header line '+header.line+' has an unrecognized column "'+key.slice(0,60)+'". Use the comma-separated guest template.');
    if (columns.indexOf(key)!==columns.lastIndexOf(key)) throw Error('Header line '+header.line+' repeats the '+key+' column. Keep one copy.');
  }
  for (const key of ['household','guest_name']) if (!columns.includes(key)) throw Error('Header line '+header.line+' is missing the required '+key+' column.');
  if (!rows.length) throw Error('The file has headers only. Add one row per invited person and select the file again.');

  const groups=new Map(), names=new Map();
  const existing=new Set(invitations.filter(i=>!i.deleted).map(i=>i.household_name.trim().toLowerCase()));
  const issues=[];
  for (const {line,cells} of rows) {
    const issue=(field,msg)=>issues.push('Line '+line+' · '+field+' — '+msg);
    if (cells.length!==columns.length) {issue('columns','Expected '+columns.length+' cells, found '+cells.length+'. Quote values containing commas.');continue;}
    const row=Object.fromEntries(columns.map((key,i)=>[key,cells[i]]));
    for (const key of columns) if ([...row[key]].length>limits[key]) issue(key,'Use at most '+limits[key]+' characters.');
    const key=row.household.toLowerCase();
    if (!key) issue('household','Enter the invitation or household name.');
    if (existing.has(key)) issue('household','Already in this planner. Remove its rows from the file or edit that household in Guest list.');
    const companion=(row.companion||'no').toLowerCase();
    const rsvp=(row.rsvp||'pending').toLowerCase();
    if (!['yes','no'].includes(companion)) issue('companion','Use yes or no, or leave blank for no.');
    if (!['yes','no','pending'].includes(rsvp)) issue('rsvp','Use yes, no or pending.');
    if (!row.guest_name && companion!=='yes') issue('guest_name','Enter a name or set companion to yes for an unnamed guest.');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) issue('email','Enter a household email address such as name@example.com.');
    if (!groups.has(key)) {
      groups.set(key,{line,household:row.household,email:'',phone:'',address:'',people:[]});
      names.set(key,new Map());
    }
    const group=groups.get(key);
    for (const field of ['email','phone','address']) {
      if (!row[field]) continue;
      if (group[field] && group[field]!==row[field]) issue(field,'Use one shared value for this household or leave repeated cells blank.');
      else group[field]=row[field];
    }
    const guestKey=row.guest_name.toLowerCase();
    if (guestKey && names.get(key).has(guestKey)) issue('guest_name','Matches line '+names.get(key).get(guestKey)+' in this household. Remove the duplicate or distinguish the two guests.');
    names.get(key).set(guestKey,line);
    group.people.push({line,name:row.guest_name,companion:companion==='yes',rsvp,dietary_notes:row.dietary_notes||''});
    if (group.people.length===51) issue('household','A single invitation can contain up to 50 people.');
  }
  if (issues.length) {
    const remaining=issues.length-20;
    throw Error(issues.slice(0,20).join('\n')+(remaining>0?'\n'+remaining+' more issues. Fix these and preview again.':''));
  }
  return {households:[...groups.values()],guestCount:rows.length};
}
