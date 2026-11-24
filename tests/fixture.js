// Used by the mock preview and app wiring tests. Each installation starts a fresh wedding.
export function installMock(menuEstimate) {
  const w = '10000000-0000-0000-0000-000000000001', a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
  const fixture = {
    wedding:{id:w,name:'Beya’s big day',currency:'USD',cap_cents:1000000,wedding_date:'2027-06-19',planning_headcount:90,time_zone:'America/New_York',version:1},
    members:[{wedding_id:w,user_id:a,display_name:'Maya'},{wedding_id:w,user_id:b,display_name:'Ben'}],
    categories:[{id:'food',wedding_id:w,name:'Food',version:1},{id:'attire',wedding_id:w,name:'Attire',version:1}],
    vendors:[{id:'vendor',wedding_id:w,name:'Garden Table Catering',contact_name:'Alex',email:'alex@example.invalid',phone:'555-0100',website:'https://example.invalid',notes:'Seasonal menu. Includes service.',version:1}],
    expenses:[{id:'catering',wedding_id:w,category_id:'food',vendor_id:'vendor',title:'Catering',target_cents:400000,agreed_cents:360000,preferred_quote_id:'q2',booked_quote_id:'q2',notes:'Dinner for our favorite people.',version:1}],
    quotes:[{id:'q1',wedding_id:w,expense_id:'catering',vendor_id:'vendor',package_name:'Classic dinner',unit_cents:380000,headcount:1,pricing_basis:'fixed',details:'Three courses and service',rating:4,notes:'Unused reference offer',version:1},{id:'q2',wedding_id:w,expense_id:'catering',vendor_id:'vendor',package_name:'Garden dinner',unit_cents:360000,headcount:1,pricing_basis:'fixed',details:'Seasonal menu with service',rating:5,notes:'Our pick',version:1}],
    installments:[{id:'deposit',wedding_id:w,expense_id:'catering',label:'Deposit',amount_cents:90000,due_date:'2026-11-15',version:1},{id:'balance',wedding_id:w,expense_id:'catering',label:'Final balance',amount_cents:270000,due_date:'2027-05-01',version:1}],
    payments:[{id:'p1',wedding_id:w,expense_id:'catering',installment_id:'deposit',kind:'payment',amount_cents:90000,paid_on:'2026-11-13',payer_id:a,entered_by:b,notes:'Booking deposit',created_at:'2026-11-13T12:00:00Z'}],amendments:[],
  };
  fixture.planner_ready=true;fixture.feedback_ready=true;fixture.itinerary_ready=true;
  fixture.guest_import_ready=true;
  const guestImports=new Set();
  fixture.menu_ready=true;fixture.menu_courses=[
    {id:'main',wedding_id:w,name:'Mains',sort_order:1,choices_offered:true,version:1},
    {id:'drinks',wedding_id:w,name:'Drinks',sort_order:2,choices_offered:false,version:1}];
  fixture.menu_options=[
    {id:'tart',course_id:'main',name:'Garden vegetable tart',pricing_basis:'per_choice',unit_cents:2500,selected:true,vendor_id:'vendor',rating:5},
    {id:'fish',course_id:'main',name:'Lemon roast fish',pricing_basis:'per_choice',unit_cents:3000,selected:true,vendor_id:'vendor',rating:4},
    {id:'drinks-package',course_id:'drinks',name:'Garden drinks package',pricing_basis:'per_person',unit_cents:1000,selected:false,vendor_id:'vendor'}
  ].map(o=>({wedding_id:w,quantity:1,unit:'serving',notes:'Seasonal ingredients, served with love.',photo_path:null,deleted:false,version:1,...o}));
  fixture.guest_meals=[{id:'alex-meal',wedding_id:w,guest_id:'alex',course_id:'main',option_id:'tart',version:1}];
  fixture.itinerary_items=[
    {id:'ben-prep',title:'Ben gets ready',track:'Ben',start_time:'09:00:00',location:'Garden room'},
    {id:'maya-prep',title:'Maya gets ready',track:'Maya',start_time:'09:00:00',location:'Bridal suite'},
    {id:'ceremony',title:'Our ceremony',track:'Together',start_time:'11:00:00',end_time:'11:30:00',location:'The garden'},
  ].map(i=>({wedding_id:w,day_offset:0,end_time:null,notes:'',vendor_id:null,deleted:false,version:1,...i}));
  fixture.wedding.pinterest_board_url='';
  fixture.vendors[0].rating=4;fixture.vendors[0].vendor_kind='vendor';
  fixture.payments[0].version=1;
  fixture.events=[{id:'tour',wedding_id:w,title:'Garden venue tour',kind:'Tour',event_date:'2026-12-01',start_time:'10:00:00',location:'The garden',vendor_id:'vendor',notes:'Ask about rain plans',completed:false,version:1}];
  fixture.vendor_photos=[];fixture.record_history=[];
  const files=new Map();
  fixture.invitations=[
    {id:'rivera',wedding_id:w,household_name:'The Rivera family',contact_email:'alex@example.invalid',phone:'555-0130',mailing_address:'123 Example Lane\nSample City',save_the_date_sent_on:'2026-11-01',invitation_sent_on:null,notes:'Family friends. We can’t wait to celebrate together.',archived:false,version:1},
    {id:'morgan',wedding_id:w,household_name:'Morgan & Jules',contact_email:'morgan@example.invalid',phone:'',mailing_address:'',save_the_date_sent_on:'2026-11-01',invitation_sent_on:'2026-11-10',notes:'',archived:false,version:1},
  ];
  fixture.guests=[
    {id:'alex',invitation_id:'rivera',name:'Alex Rivera',rsvp:'yes',tag:'Friends',gift_received:false,dietary_flags:['vegan','nut_allergy'],dietary_notes:'Please check ingredients with the chef.',caterer_confirmation:'Chef will prepare a separate plate.'},
    {id:'sam',invitation_id:'rivera',name:'Sam Rivera',rsvp:'yes',tag:'Friends',gift_received:true,dietary_flags:[]},
    {id:'companion',invitation_id:'rivera',name:null,is_companion:true,rsvp:'pending',tag:'Friends',dietary_flags:[]},
    {id:'morgan-guest',invitation_id:'morgan',name:'Morgan Chen',rsvp:'yes',tag:'Family',dietary_flags:['vegetarian']},
    {id:'jules',invitation_id:'morgan',name:'Jules Chen',rsvp:'no',tag:'Family',dietary_flags:[]},
  ].map(g=>({wedding_id:w,is_companion:false,gift_received:false,dietary_notes:'',caterer_confirmation:'',archived:false,version:1,...g}));
  fixture.seating_ready=true;
  fixture.seating_units=[
    {id:'head',event:'reception',label:'Head table',shape:'rectangle',capacity:6,position:1},
    {id:'garden',event:'reception',label:'Garden table',shape:'round',capacity:8,position:2},
    {id:'family',event:'ceremony',label:'Family row',shape:'row',capacity:10,position:1,reserved:true}
  ];
  fixture.seating_placements=[{event:'reception',unit_id:'head',guest_id:'morgan-guest',seat:1}];
  fixture.seating_revisions={};
  const seatingReceipts=new Set();
  fixture.tasks=[
    {id:'vision',starter_key:'vision',title:'Talk about the celebration you both want',planning_window:'12_plus',completed:true},
    {id:'budget-task',starter_key:'budget',title:'Agree on a wedding budget',planning_window:'12_plus',completed:true},
    {id:'photos',starter_key:'photographer',title:'Book your photographer',planning_window:'9_12',completed:false},
    {id:'flowers',starter_key:'florals',title:'Plan flowers and your green & purple palette',planning_window:'4_6',completed:false,assignee_id:a},
    {id:'invites',starter_key:'invitations',title:'Order your invitations',planning_window:'4_6',completed:false,assignee_id:b},
    {id:'music-task',title:'Put together our first-dance shortlist',planning_window:'2_4',due_date:'2027-03-01',completed:false},
  ].map(t=>({wedding_id:w,assignee_id:null,due_date:null,notes:'',archived:false,version:1,...t}));
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    if(!String(url).startsWith('https://fixture.supabase.co/'))return realFetch(url,options);
    if(String(url).includes('/storage/v1/object/')){
      const path=decodeURIComponent(String(url).split('/object/')[1].replace(/^authenticated\//,''));
      if(options.method==='POST'){files.set(path,options.body);return Response.json({Key:path});}
      return files.has(path)?new Response(files.get(path)):Response.json({message:'Missing fixture picture'},{status:404});
    }
    const body=options.body ? JSON.parse(options.body):null;
    if(String(url).includes('/auth/')){
      if(new URL(url).pathname==='/auth/v1/user')return Response.json({id:a,email:'preview@example.invalid'});
      if(new URL(url).pathname==='/auth/v1/recover')return Response.json({});
      return Response.json({user:{id:a,email:'preview@example.invalid'},access_token:'fixture',refresh_token:'fixture',expires_in:3600});
    }
    const path=String(url).split('/rest/v1/')[1];
    if(path.startsWith('weddings?')&&(!options.method||options.method==='GET'))return Response.json([fixture.wedding]);
    if(path==='rpc/budget_snapshot'){
      fixture.seating_placements=fixture.seating_placements.filter(p=>{
        const g=fixture.guests.find(g=>g.id===p.guest_id), h=fixture.invitations.find(h=>h.id===g?.invitation_id);
        return g && h && !g.deleted && !h.deleted && !g.archived && !h.archived && g.rsvp!=='no';
      });
      const snapshot=structuredClone(fixture);
      for(const key of ['categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos','itinerary_items','menu_courses','menu_options','guest_meals'])snapshot[key]=snapshot[key].filter(r=>!r.deleted);
      for(const g of snapshot.guests){
        const p=snapshot.seating_placements.find(p=>p.event==='reception' && p.guest_id===g.id);
        g.meal_table=snapshot.seating_units.find(u=>u.id===p?.unit_id)?.label || '';
      }
      snapshot.menu_options=snapshot.menu_options.filter(o=>snapshot.menu_courses.some(c=>c.id===o.course_id));
      snapshot.menu_estimate=menuEstimate(snapshot);
      snapshot.expenses=snapshot.expenses.map(e=>e.id===snapshot.wedding.menu_expense_id?{...e,menu_linked:true,menu_estimate_cents:snapshot.menu_estimate.cents}:e);
      snapshot.installments=snapshot.installments.filter(i=>snapshot.expenses.some(e=>e.id===i.expense_id&&e.agreed_cents!==null));
      return Response.json(snapshot);
    }
    if(path.startsWith('record_history?'))return Response.json(fixture.record_history.filter(h=>h.record_id===new URLSearchParams(path.split('?')[1]).get('record_id')?.slice(3)));
    if(path==='rpc/change_seating'){
      const {plan:event,expected,command:c,request_id}=body;
      const reject=message=>Response.json({message},{status:400});
      if(seatingReceipts.has(request_id))return Response.json(null);
      if(expected!==(fixture.seating_revisions[event]||0))return reject('Refresh and reopen the plan.');
      const units=fixture.seating_units.filter(u=>u.event===event).sort((a,b)=>a.position-b.position);
      const unit=units.find(u=>u.id===c.unit_id);
      const placements=fixture.seating_placements;
      const atUnit=placements.filter(p=>p.unit_id===c.unit_id);
      if(c.action==='add'){
        let suffix=units.length+1;
        for(let i=0;i<c.quantity;i++){
          let label;
          do {label=(event==='ceremony'?'Row ':'Table ')+suffix++;} while(fixture.seating_units.some(u=>u.event===event && u.label===label));
          fixture.seating_units.push({id:crypto.randomUUID(),event,label,capacity:c.capacity,position:units.length+i+1,shape:c.shape,reserved:c.reserved});
        }
      }else if(c.action==='edit'||c.action==='delete'){
        if(!unit)return reject('Table or row unavailable.');
        const others=units.filter(u=>u!==unit);
        if(c.action==='edit'){
          if(atUnit.length>c.capacity || atUnit.some(p=>p.seat>c.capacity))return reject('Move guests before reducing capacity.');
          Object.assign(unit,{label:c.label,shape:c.shape,capacity:c.capacity,reserved:c.reserved});
          others.splice(c.position-1,0,unit);
        }else{
          fixture.seating_units=fixture.seating_units.filter(u=>u!==unit);
          fixture.seating_placements=placements.filter(p=>p.unit_id!==unit.id);
        }
        others.forEach((u,i)=>u.position=i+1);
      }else if(c.action==='number'){
        const p=atUnit.find(p=>p.guest_id===c.guest_id);
        if(!p || (c.seat && atUnit.some(other=>other!==p && other.seat===c.seat)))return reject('Choose an available seat.');
        p.seat=c.seat;
      }else if(c.action==='assign'){
        const members=fixture.guests.filter(g=>g.invitation_id===c.household_id && !g.archived && !g.deleted && g.rsvp!=='no' && (!c.split||g.id===c.guest_id));
        const ids=new Set(members.map(g=>g.id));
        if(unit && atUnit.filter(p=>!ids.has(p.guest_id)).length+ids.size>unit.capacity)return reject('This group needs more open seats.');
        if(c.seat && atUnit.some(p=>p.seat===c.seat && p.guest_id!==c.number_guest_id))return reject('Choose an available seat.');
        fixture.seating_placements=placements.filter(p=>p.event!==event || !ids.has(p.guest_id) || p.unit_id===unit?.id);
        if(unit)for(const id of ids)if(!atUnit.some(p=>p.guest_id===id))fixture.seating_placements.push({event,unit_id:unit.id,guest_id:id,seat:null});
        if(c.seat)fixture.seating_placements.find(p=>p.event===event && p.guest_id===c.number_guest_id).seat=c.seat;
      }
      fixture.seating_revisions[event]=expected+1;
      seatingReceipts.add(request_id);
      return Response.json(null);
    }
    if(path==='rpc/delete_record'){
      const record=fixture[body.t].find(r=>r.id===body.r);
      if(!record||record.version!==body.v)return Response.json({message:'Someone changed this record. Refresh and review.'},{status:409});
      const remove=(table,row)=>{
        if(row.deleted)return;row.deleted=true;
        if(table==='categories')fixture.expenses.filter(e=>e.category_id===row.id).forEach(e=>remove('expenses',e));
        if(table==='vendors'){
          fixture.expenses.filter(e=>e.vendor_id===row.id).forEach(e=>remove('expenses',e));
          for(const t of ['quotes','vendor_photos'])fixture[t].filter(r=>r.vendor_id===row.id).forEach(r=>remove(t,r));
          fixture.events.filter(e=>e.vendor_id===row.id).forEach(e=>e.vendor_id=null);
          fixture.itinerary_items.filter(e=>e.vendor_id===row.id).forEach(e=>e.vendor_id=null);
          fixture.menu_options.filter(e=>e.vendor_id===row.id).forEach(e=>e.vendor_id=null);
        }
        if(table==='expenses')for(const t of ['quotes','payments','installments'])fixture[t].filter(r=>r.expense_id===row.id).forEach(r=>remove(t,r));
        if(table==='invitations')fixture.guests.filter(g=>g.invitation_id===row.id).forEach(g=>remove('guests',g));
        if(table==='installments')fixture.payments.filter(p=>p.installment_id===row.id).forEach(p=>p.installment_id=null);
        if(table==='quotes')fixture.expenses.filter(e=>e.preferred_quote_id===row.id).forEach(e=>e.preferred_quote_id=null);
        if(table==='expenses'&&fixture.wedding.menu_expense_id===row.id)fixture.wedding.menu_expense_id=null;
        if(table==='menu_courses')fixture.menu_options.filter(o=>o.course_id===row.id).forEach(o=>remove('menu_options',o));
      };
      remove(body.t,record);return Response.json(null);
    }
    if(path==='rpc/import_guest_csv'){
      if(guestImports.has(body.request_id))return Response.json(null);
      const existing=new Set(fixture.invitations.filter(h=>!h.deleted).map(h=>h.household_name.trim().toLowerCase()));
      for(const h of body.households){
        if(existing.has(h.household.toLowerCase()))return Response.json({message:'Line '+h.line+' · household already exists.'},{status:400});
        existing.add(h.household.toLowerCase());
      }
      for(const h of body.households){
        const id=crypto.randomUUID();
        fixture.invitations.push({id,wedding_id:w,household_name:h.household,contact_email:h.email,phone:h.phone,mailing_address:h.address,notes:'',archived:false,version:1});
        for(const g of h.people)fixture.guests.push({id:crypto.randomUUID(),wedding_id:w,invitation_id:id,name:g.name||null,is_companion:g.companion,rsvp:g.rsvp,tag:'',gift_received:false,dietary_flags:[],dietary_notes:g.dietary_notes,caterer_confirmation:'',archived:false,version:1});
      }
      guestImports.add(body.request_id);return Response.json(null);
    }
    if(path==='rpc/create_household'){
      if(!fixture.invitations.some(i=>i.id===body.i.id))fixture.invitations.push({...body.i,archived:false,version:1});
      for(const g of body.g)if(!fixture.guests.some(p=>p.id===g.id))fixture.guests.push({rsvp:'pending',tag:'',gift_received:false,dietary_flags:[],dietary_notes:'',caterer_confirmation:'',archived:false,version:1,...g,wedding_id:w,invitation_id:body.i.id});
      return Response.json(body.i.id);
    }
    if(path==='rpc/create_expense'){
      if(!fixture.expenses.some(e=>e.id===body.e.id))fixture.expenses.push({...body.e,preferred_quote_id:null,booked_quote_id:null,version:1});
      if(body.p&&!fixture.payments.some(p=>p.id===body.p.id))fixture.payments.push({...body.p,entered_by:a,created_at:new Date().toISOString()});
      return Response.json(body.e.id);
    }
    if(path==='rpc/record_payment'){
      if(!fixture.payments.some(p=>p.id===body.p.id))fixture.payments.push({...body.p,entered_by:a,created_at:new Date().toISOString()});
      return Response.json(body.p.id);
    }
    const [table,query='']=path.split('?');
    if(options.method==='PATCH'){
      const params=new URLSearchParams(query),record=(table==='weddings'?[fixture.wedding]:fixture[table]).find(r=>r.id===params.get('id').slice(3)&&r.version===Number(params.get('version').slice(3)));
      if(!record)return Response.json([]);
      if(table==='payments')fixture.record_history.push({id:crypto.randomUUID(),record_id:record.id,table_name:'payments',previous:structuredClone(record),current_record:{...record,...body},entered_by:a,created_at:new Date().toISOString()});
      if(table==='expenses'&&record.agreed_cents!==null&&Object.hasOwn(body,'agreed_cents')&&body.agreed_cents!==record.agreed_cents)fixture.amendments.push({expense_id:record.id,previous_cents:record.agreed_cents,agreed_cents:body.agreed_cents,reason:body.amendment_reason,created_at:new Date().toISOString(),entered_by:a});
      Object.assign(record,body,{version:record.version+1});return Response.json([record]);
    }
    if(options.method==='POST'&&Array.isArray(fixture[table])){
      const created=[];
      for(const record of Array.isArray(body)?body:[body]){
        if(record.starter_key&&fixture[table].some(r=>r.starter_key===record.starter_key))continue;
        const row={archived:false,completed:false,notes:'',version:1,...record};fixture[table].push(row);created.push(row);
      }
      return Response.json(created);
    }
    return Response.json({message:'Fixture route missing'},{status:400});
  };
  globalThis.WebSocket=class {static OPEN=1;readyState=1;constructor(){queueMicrotask(()=>this.onopen?.());}send(raw){const message=JSON.parse(raw);if(message.event==='phx_join')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({event:'phx_reply',ref:message.ref,payload:{status:'ok'}})}));}close(){this.readyState=3;this.onclose?.();}};
}
