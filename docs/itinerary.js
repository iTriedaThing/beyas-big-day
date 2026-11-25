import {escapeHTML as esc,button as btn,select} from './ui.js';
import {displayDate} from './planner-views.js';

export function timeMinutes(value) {
  const match=/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(value||'');
  if(!match)throw new Error('Choose a valid time, to the nearest minute.');
  return Number(match[1])*60+Number(match[2]);
}
export function itineraryRecord(fields) {
  const title=String(fields.title||'').trim(),track=String(fields.track||'').trim();
  if(!title||title.length>160)throw new Error('Enter an activity name of 1–160 characters.');
  if(!track||track.length>100)throw new Error('Enter a track of 1–100 characters, such as Together or Wedding party.');
  const start=timeMinutes(fields.start_time),end=fields.end_time?timeMinutes(fields.end_time):null;
  if(end===start)throw new Error('The end time must differ from the start time. Leave it blank if undecided.');
  if(!['0','1'].includes(String(fields.day_offset)))throw new Error('Choose the wedding day or the following day.');
  const location=String(fields.location||'').trim(),notes=String(fields.notes||'');
  if(location.length>500||notes.length>4000)throw new Error('Use up to 500 characters for location and 4,000 for notes.');
  return {title,track,start_time:fields.start_time.slice(0,5),end_time:fields.end_time?fields.end_time.slice(0,5):null,
    day_offset:Number(fields.day_offset),location,notes,vendor_id:fields.vendor_id||null};
}
export function itineraryTracks(data) {
  return [...new Set(['Together',...(data.members||[]).map(m=>m.display_name),...(data.itinerary_items||[]).filter(i=>!i.deleted).map(i=>i.track)])].sort((a,b)=>a.localeCompare(b));
}
export function itineraryRows(data,track='') {
  return (data.itinerary_items||[]).filter(i=>!i.deleted&&(!track||i.track===track))
    .sort((a,b)=>a.day_offset-b.day_offset||timeMinutes(a.start_time)-timeMinutes(b.start_time)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
export function itineraryDate(date,offset) {
  if(!date)return null;
  const result=new Date(`${date}T00:00:00Z`);result.setUTCDate(result.getUTCDate()+offset);
  return result.toISOString().slice(0,10);
}
export function endDayOffset(item) {
  return item.day_offset+(item.end_time&&timeMinutes(item.end_time)<timeMinutes(item.start_time)?1:0);
}
export function formatTime(value) {
  const minutes=timeMinutes(value);
  return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(Date.UTC(2000,0,1,Math.floor(minutes/60),minutes%60)));
}
export function renderItinerary(data,track='') {
  if(!data.itinerary_ready)return '<section class="panel empty-state"><h2>Day-of itinerary</h2><p>This section is being prepared. Your existing wedding planner is ready to use.</p></section>';
  const rows=itineraryRows(data,track),date=data.wedding.wedding_date;
  return `<section class="page-heading itinerary-heading"><div><span class="eyebrow">THE DAY, ONE MOMENT AT A TIME</span><h2>Our wedding-day itinerary</h2><p class="itinerary-print-meta">${esc(data.wedding.name)} · ${esc(track||'All tracks')}</p><p>${date?esc(displayDate(date)):'Date to be decided'} · Times in ${esc(data.wedding.time_zone)}</p><p>Parallel preparations can share the same time.</p></div><div class="actions itinerary-controls">${btn('itinerary-print','Print itinerary')}${btn('itinerary-new','+ Add activity','','')}</div></section>
    <section class="panel itinerary-panel"><div class="itinerary-controls">${select('itinerary-track','Show track',[['','All tracks'],...itineraryTracks(data).map(t=>[t,t])],track)}<p class="muted">Use All tracks for the combined plan. Printing follows this selection.</p></div>
    ${rows.length?[0,1].map(day=>{
      const entries=rows.filter(i=>i.day_offset===day);if(!entries.length)return '';
      const actualDate=itineraryDate(date,day);
      return `<section class="itinerary-day"><h3>${day?'After midnight · following day':'Wedding day'}${actualDate?` · ${esc(displayDate(actualDate))}`:''}</h3><ol class="itinerary-list">${entries.map(item=>{
        const vendor=data.vendors.find(v=>v.id===item.vendor_id),endOffset=endDayOffset(item);
        return `<li class="itinerary-item"><div class="itinerary-time"><time datetime="${esc(item.start_time.slice(0,5))}">${esc(formatTime(item.start_time))}</time>${item.end_time?`<small>to ${esc(formatTime(item.end_time))}${endOffset>item.day_offset?` · ${date?esc(displayDate(itineraryDate(date,endOffset))):'next day'}`:''}</small>`:''}</div><div class="itinerary-copy"><span class="badge">${esc(item.track)}</span><h4>${esc(item.title)}</h4>${item.location?`<p><strong>Where:</strong> ${esc(item.location)}</p>`:'<p class="muted">Location to be decided</p>'}${vendor?`<p>${esc(vendor.name)}</p>`:''}${item.notes?`<p class="preline">${esc(item.notes)}</p>`:''}</div><div class="actions itinerary-controls">${btn('itinerary-edit','Edit',item.id)}${btn('itinerary-delete','Delete',item.id)}</div></li>`;
      }).join('')}</ol></section>`;
    }).join(''):`<div class="empty-state"><h3>${track?'No activities for this track yet.':'Give your day a little shape.'}</h3><p>Add getting ready, photos, the ceremony, dinner, and the moments you want to remember.</p><div class="itinerary-controls">${btn('itinerary-new','Add our first activity','','')}</div></div>`}</section>`;
}
