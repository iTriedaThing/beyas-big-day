// In-memory browser fixture. Imported only by scripts/preview-fixture.mjs.
export function installMock() {
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
  fixture.planner_ready=true;
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
    const body=options.body ? JSON.parse(options.body):null;
    if(String(url).includes('/auth/')){
      if(new URL(url).pathname==='/auth/v1/user')return Response.json({id:a,email:'preview@example.invalid'});
      if(new URL(url).pathname==='/auth/v1/recover')return Response.json({});
      return Response.json({user:{id:a,email:'preview@example.invalid'},access_token:'fixture',refresh_token:'fixture',expires_in:3600});
    }
    const path=String(url).split('/rest/v1/')[1];
    if(path.startsWith('weddings?')&&(!options.method||options.method==='GET'))return Response.json([fixture.wedding]);
    if(path==='rpc/budget_snapshot')return Response.json(structuredClone(fixture));
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
      if(!record)return Response.json([]);Object.assign(record,body,{version:record.version+1});return Response.json([record]);
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
