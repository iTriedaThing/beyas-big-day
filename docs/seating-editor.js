import {escapeHTML as esc, input, select} from './ui.js';
import {seatingPlan, shapes, guestLabel} from './seating.js';

const check = (name,label,checked=false) => `<label class="check-label"><input type="checkbox" id="f-${name}" name="${name}" ${checked?'checked':''}> ${label}</label>`;
const quantity = (name,label,value,max=2147483647) => input(name,label,value,'number',`required min="1" max="${max}" step="1"`);

// Capture the plan revision when the dialog opens. Polling must not silently rebase an edit.
export function seatingForm(action, id, {data,event,selectedId,openForm,save}) {
  if (!data.seating_ready) throw new Error('The seating plan is unavailable. Refresh and try again.');
  const plan = seatingPlan(data,event), ceremony = event === 'ceremony';
  const kind = ceremony?'row':'table';
  const chair = action === 'chair' ? Number(id) : null;
  const unit = plan.units.find(u => u.id === (chair ? selectedId : id));
  if (chair) {
    const occupant = plan.byUnit.get(unit.id).find(p=>p.seat===chair);
    if (occupant) { action='number'; id=occupant.guest_id; }
  }
  const submit = command => save(event,plan.revision,command);
  if (action === 'add' || action === 'edit') {
    const edit = action === 'edit';
    if (edit && !unit) throw new Error('This part of the plan has been removed.');
    const fields = edit
      ? input('label','Name',unit.label,'text','required maxlength="100"') + quantity('position','Position in the plan',unit.position,plan.units.length)
      : quantity('quantity',ceremony?'Number of rows':'Number of tables',1,200);
    openForm(edit?'Edit '+kind:ceremony?'Add ceremony rows':'Add reception tables',fields
      +(ceremony?'':select('shape','Table shape',shapes,unit?.shape || 'round'))
      +quantity('capacity','Seats per '+kind,unit?.capacity ?? (ceremony?10:8))
      +(ceremony?check('reserved','Reserve for family or other guests',unit?.reserved):''),
      f => submit({action,unit_id:unit?.id,quantity:edit?undefined:Number(f.quantity),position:edit?Number(f.position):undefined,
        label:f.label?.trim(),shape:ceremony?'row':f.shape,capacity:Number(f.capacity),reserved:f.reserved==='on'}));
    return;
  }
  if (action === 'delete') {
    openForm('Remove '+kind,`<p>Removing <strong>${esc(unit.label)}</strong> returns its ${plan.byUnit.get(id).length} assigned guests to this plan’s unassigned list. Their invitations and other event remain as planned.</p>`
      +(data.archive_ready?'<p>Wedding owners can restore this from the Archive. Guests moved in the meantime keep their new seats.</p>':'')
      +input('confirm','Type the name to confirm','','text','required'), f=>{
        if (f.confirm !== unit.label) throw new Error('Enter the name exactly as shown.');
        return submit({action,unit_id:id});
      });
    return;
  }
  const guest = plan.guests.find(g=>g.id===id);
  if (action === 'number') {
    const placement = plan.byGuest.get(id), current = plan.units.find(u=>u.id===placement?.unit_id);
    if (!current) throw new Error('This guest has no placement. Refresh and choose again.');
    const taken = new Set(plan.byUnit.get(current.id).filter(p=>p.guest_id!==id && p.seat).map(p=>p.seat));
    const field = current.capacity <= 200
      ? select('seat','Seat number',[['','Any seat'],...Array.from({length:current.capacity},(_,i)=>i+1).filter(n=>!taken.has(n)).map(n=>[String(n),String(n)])],String(placement.seat??''))
      : input('seat','Seat number (leave blank for any seat)',placement.seat??'','number',`min="1" max="${current.capacity}" step="1"`);
    openForm('Choose a seat', `<p>${esc(guestLabel(guest))} · ${esc(current.label)}</p>`+field,
      f=>submit({action,unit_id:current.id,guest_id:id,seat:f.seat?Number(f.seat):null}));
    return;
  }

  const groups = new Map();
  for (const g of plan.guests) {
    if (!groups.has(g.invitation_id)) groups.set(g.invitation_id,[]);
    groups.get(g.invitation_id).push(g);
  }
  if (!groups.size) throw new Error('Add an active guest with an attending or pending reply in Guest list first.');
  const placement = plan.byGuest.get(id);
  const defaultDestination = unit?.id || placement?.unit_id || selectedId || 'choose';
  const options = [['choose','Choose a destination…'],['','Unassign from this plan'],...plan.units.map(u=>[u.id,`${u.label} · ${u.capacity-plan.byUnit.get(u.id).length} open`])];
  openForm(chair?'Assign seat '+chair:'Assign or move guests',
    select('household_id','Household',[...groups].map(([key,members])=>[key,`${plan.households.get(key).household_name} (${members.length})`]),guest?.invitation_id)
    +check('split','Split household and move one guest')+'<div id="seating-members"></div>'
    +(chair?`<p>${esc(unit.label)} · Seat ${chair}</p>`:select('destination',ceremony?'Destination row':'Destination table',options,defaultDestination)),
    f=>{
      if (f.destination==='choose') throw new Error('Choose a destination first.');
      const split = f.split==='on';
      if ((chair || split) && !f.guest_id) throw new Error('Choose a guest first.');
      return submit({action:'assign',household_id:f.household_id,guest_id:split?f.guest_id:null,split,unit_id:chair?unit.id:f.destination||null,
        ...(chair?{seat:chair,number_guest_id:f.guest_id}:{})});
    });
  const household = document.querySelector('#f-household_id'), split = document.querySelector('#f-split');
  function showMembers() {
    const members = groups.get(household.value) || [];
    const options = members.map(g=>{
      const p=plan.byGuest.get(g.id), current=plan.units.find(u=>u.id===p?.unit_id);
      return [g.id,`${guestLabel(g)} · ${current?.label || 'Unassigned'}${p?.seat?' · Seat '+p.seat:''}`];
    });
    const roster = split.checked ? '' : `<p>Move all ${members.length} together, including anyone awaiting a reply.</p><ul>${options.map(([,label])=>`<li>${esc(label)}</li>`).join('')}</ul>`;
    const person = (split.checked || chair) ? select('guest_id',chair?'Guest for seat '+chair:'Guest to move',options,guest?.id) : '';
    document.querySelector('#seating-members').innerHTML = roster + person;
  }
  household.onchange=showMembers;
  split.onchange=showMembers;
  showMembers();
}
