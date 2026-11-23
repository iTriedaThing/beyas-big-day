import {escapeHTML as esc, button, select} from './ui.js';

export const shapes = [['round','Circular'], ['rectangle','Rectangular'], ['square','Square']];
export const guestLabel = guest => guest.name || 'Unnamed companion';

export function seatingPlan(data, event) {
  const households = new Map(data.invitations.filter(h => !h.archived && !h.deleted).map(h => [h.id,h]));
  const guests = data.guests.filter(g => households.has(g.invitation_id) && !g.archived && !g.deleted && g.rsvp !== 'no');
  const units = data.seating_units.filter(u => u.event === event).sort((a,b) => a.position-b.position);
  const byGuest = new Map();
  const byUnit = new Map(units.map(u => [u.id,[]]));
  for (const p of data.seating_placements) {
    if (p.event !== event) continue;
    byGuest.set(p.guest_id,p);
    byUnit.get(p.unit_id)?.push(p);
  }
  return {event,units,guests,households,byGuest,byUnit,revision:data.seating_revisions[event] || 0};
}

// Number clockwise from the top at round tables, along the perimeter on straight tables,
// and from left to right across the aisle for ceremony rows.
function seatPoint(shape, index, count) {
  if (shape === 'row') {
    const left = Math.ceil(count/2), rightSide = index >= left;
    const sideCount = rightSide ? count-left : left;
    return [(rightSide ? 166 : 14) + ((rightSide ? index-left : index)+0.5)*120/sideCount,70];
  }
  if (shape === 'round') {
    const angle = 2*Math.PI*index/count - Math.PI/2;
    return [150+80*Math.cos(angle),106+80*Math.sin(angle)];
  }
  const width = shape === 'square' ? 140 : 224, height = shape === 'square' ? 140 : 96;
  let distance = (width/2+index*2*(width+height)/count) % (2*(width+height));
  const left = 150-width/2, top = 106-height/2;
  if (distance <= width) return [left+distance,top];
  distance -= width;
  if (distance <= height) return [left+width,top+distance];
  distance -= height;
  if (distance <= width) return [left+width-distance,top+height];
  return [left,top+height-(distance-width)];
}

function diagram(unit, placements, detail) {
  const row = unit.shape === 'row';
  const surface = {round:'<circle cx="150" cy="106" r="60"/>',rectangle:'<rect x="57" y="74" width="186" height="64" rx="8"/>',square:'<rect x="97" y="53" width="106" height="106" rx="8"/>',row:'<path d="M14 87h120m32 0h120" class="pew"/>'};
  const numbered = new Set(placements.map(p=>p.seat).filter(Boolean));
  // Dense layouts use a shape overview and an exact capacity/numbered roster below.
  const showSeats = unit.capacity <= (row ? 20 : 32);
  const seats = showSeats ? Array.from({length:unit.capacity},(_,i)=>{
    const [x,y] = seatPoint(unit.shape,i,unit.capacity);
    const radius = row ? Math.min(10,100/unit.capacity) : Math.min(12,150/unit.capacity);
    const chair = `<g class="chair ${numbered.has(i+1)?'assigned':''}"><circle cx="${x}" cy="${y}" r="${radius}"/>${detail?`<text x="${x}" y="${y}" font-size="${radius*1.14}">${i+1}</text>`:''}</g>`;
    return detail ? `<a href="#unit-title" data-action="seating-chair" data-id="${i+1}" aria-label="Seat ${i+1}, ${numbered.has(i+1)?'assigned':'available'}">${chair}</a>` : chair;
  }).join('') : '';
  return `<svg class="seating-diagram" viewBox="0 ${row?48:0} 300 ${row?52:212}" ${detail&&showSeats?'role="group" aria-label="Choose a numbered seat"':'aria-hidden="true"'}><g class="surface">${surface[unit.shape]}</g>${seats}</svg>`;
}

function detailPanel(plan, unit) {
  const placements = plan.byUnit.get(unit.id), people = new Map(plan.guests.map(g=>[g.id,g]));
  const kind = plan.event === 'ceremony' ? 'row' : 'table';
  const roster = [...placements].sort((a,b)=>(a.seat??Infinity)-(b.seat??Infinity) || guestLabel(people.get(a.guest_id)).localeCompare(guestLabel(people.get(b.guest_id))));
  return `<section class="panel seating-detail" aria-labelledby="unit-title">
    ${button('seating-overview','← Full plan','','text-button')}
    <div class="section-head"><div><h2 id="unit-title" tabindex="-1">${esc(unit.label)}</h2><p>${placements.length} assigned · ${unit.capacity-placements.length} open${unit.reserved?' · Reserved row':''}</p></div><div class="actions">${button('seating-edit','Edit '+kind,unit.id)}${button('seating-delete','Remove '+kind,unit.id)}</div></div>
    <div class="seating-closeup"><div class="seating-drawing">${diagram(unit,placements,true)}</div><div><h3>Guest list</h3>${roster.length?`<ul class="seat-roster">${roster.map(p=>{
      const guest=people.get(p.guest_id);
      return `<li><div><strong>${esc(guestLabel(guest))}</strong><small>${esc(plan.households.get(guest.invitation_id).household_name)} · ${p.seat?'Seat '+p.seat:'Any seat'}</small></div><div class="actions">${button('seating-number','Seat number',guest.id)}${button('seating-person','Move or remove',guest.id)}</div></li>`;
    }).join('')}</ul>`:'<p>No guests assigned yet.</p>'}${button('seating-assign','Assign household',unit.id)}</div></div></section>`;
}

export function renderSeating(data, event, selectedId) {
  if (!data.seating_ready) return '<section class="panel"><h2>Seating chart</h2><p>Shared seating will be available once the seating database update is applied.</p></section>';
  const plan = seatingPlan(data,event), ceremony = event === 'ceremony';
  const selected = plan.units.find(u=>u.id===selectedId);
  const controls = `<section class="page-heading"><div><h2>Seating chart</h2><p>${ceremony?'Reserve the family rows, assign every seat, or leave the ceremony open.':'Arrange your tables and keep each household together.'}</p></div><div class="actions" role="group" aria-label="Seating plan">${['reception','ceremony'].map(key=>`<button type="button" class="secondary" data-action="seating-event" data-id="${key}" aria-pressed="${event===key}">${key==='reception'?'Reception':'Ceremony'}</button>`).join('')}</div></section>`;
  if (selected) return controls+detailPanel(plan,selected);
  const unassigned = plan.guests.filter(g=>!plan.byGuest.has(g.id));
  const open = plan.units.reduce((n,u)=>n+u.capacity,0)-plan.byGuest.size;
  const title = ceremony?'Ceremony rows':'Reception tables';
  const board = plan.units.map(u=>{
    const assigned=plan.byUnit.get(u.id);
    return `<button type="button" class="seating-unit" data-action="seating-open" data-id="${esc(u.id)}">${diagram(u,assigned,false)}<strong>${esc(u.label)}</strong><small>${u.reserved?'Reserved · ':''}${assigned.length} / ${u.capacity} assigned</small></button>`;
  }).join('');
  return controls+`<section class="panel"><div class="section-head"><div><h3>${title}</h3><p>${plan.byGuest.size} assigned · ${open} open seats · ${unassigned.length} unassigned guests</p></div>${button('seating-add',ceremony?'+ Add rows':'+ Add tables','','')}</div>
    ${plan.units.length?`${select('seating-unit','Go to a '+(ceremony?'row':'table'),[['','Choose…'],...plan.units.map(u=>[u.id,u.label])])}<div class="seating-board ${ceremony?'ceremony-board':''}">${ceremony?'<p class="altar">Altar</p>':''}${board}</div>`:`<p>${ceremony?'No reserved seating yet. Add rows if you want a ceremony plan.':'Add your first tables, then select one to name it or seat guests.'}</p>`}</section>
    <section class="panel"><h3>Unassigned guests</h3>${unassigned.length?`<ul class="seat-roster">${unassigned.map(g=>`<li><div><strong>${esc(guestLabel(g))}</strong><small>${esc(plan.households.get(g.invitation_id).household_name)} · ${g.rsvp==='yes'?'Attending':'Awaiting reply'}</small></div>${plan.units.length?button('seating-person','Assign',g.id):''}</li>`).join('')}</ul>`:'<p>No guests awaiting placement.</p>'}</section>`;
}
