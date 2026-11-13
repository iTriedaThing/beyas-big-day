// In-memory browser fixture. Imported only by scripts/preview-fixture.mjs.
export function installMock() {
  const w = '10000000-0000-0000-0000-000000000001', a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
  const fixture = {
    wedding:{id:w,name:'Beya’s big day',currency:'USD',cap_cents:1000000,wedding_date:null,time_zone:'America/New_York',version:1},
    members:[{wedding_id:w,user_id:a,display_name:'Maya'},{wedding_id:w,user_id:b,display_name:'Ben'}],
    categories:[{id:'food',wedding_id:w,name:'Food',version:1},{id:'attire',wedding_id:w,name:'Attire',version:1}],
    vendors:[{id:'vendor',wedding_id:w,name:'Garden Table Catering',contact_name:'Alex',email:'alex@example.invalid',phone:'555-0100',website:'https://example.invalid',notes:'Seasonal menu. Includes service.',version:1}],
    expenses:[{id:'catering',wedding_id:w,category_id:'food',vendor_id:'vendor',title:'Catering',target_cents:400000,agreed_cents:360000,preferred_quote_id:'q2',booked_quote_id:'q2',notes:'Dinner for our favorite people.',version:1}],
    quotes:[{id:'q1',wedding_id:w,expense_id:'catering',vendor_id:'vendor',package_name:'Classic dinner',unit_cents:380000,headcount:1,pricing_basis:'fixed',details:'Three courses and service',rating:4,notes:'Unused reference offer',version:1},{id:'q2',wedding_id:w,expense_id:'catering',vendor_id:'vendor',package_name:'Garden dinner',unit_cents:360000,headcount:1,pricing_basis:'fixed',details:'Seasonal menu with service',rating:5,notes:'Our pick',version:1}],
    installments:[{id:'deposit',wedding_id:w,expense_id:'catering',label:'Deposit',amount_cents:90000,due_date:'2026-11-15',version:1},{id:'balance',wedding_id:w,expense_id:'catering',label:'Final balance',amount_cents:270000,due_date:'2027-05-01',version:1}],
    payments:[{id:'p1',wedding_id:w,expense_id:'catering',installment_id:'deposit',kind:'payment',amount_cents:90000,paid_on:'2026-11-13',payer_id:a,entered_by:b,notes:'Booking deposit',created_at:'2026-11-13T12:00:00Z'}],amendments:[],
  };
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
    if(path.startsWith('weddings?'))return Response.json([fixture.wedding]);
    if(path==='rpc/budget_snapshot')return Response.json(structuredClone(fixture));
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
    if(options.method==='POST'&&Array.isArray(fixture[table])){fixture[table].push({...body,version:1});return Response.json([body]);}
    return Response.json({message:'Fixture route missing'},{status:400});
  };
  globalThis.WebSocket=class {static OPEN=1;readyState=1;constructor(){queueMicrotask(()=>this.onopen?.());}send(raw){const message=JSON.parse(raw);if(message.event==='phx_join')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({event:'phx_reply',ref:message.ref,payload:{status:'ok'}})}));}close(){this.readyState=3;this.onclose?.();}};
}
