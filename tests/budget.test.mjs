import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cents, expenseTotals, summarize, installmentBalance, csv, quoteTotal, localDate } from '../docs/budget.js';
const e = {id:'e',category_id:'c',target_cents:400000,agreed_cents:null,preferred_quote_id:null};
const q = [{id:'q1',unit_cents:380000,pricing_basis:'fixed',headcount:1},{id:'q2',unit_cents:360000,pricing_basis:'fixed',headcount:1}];
const payment = (id,amount,kind='payment',installment_id=null) => ({id,expense_id:'e',kind,amount_cents:amount,installment_id});
test('money parser is exact, preserves blank vs zero, and rejects malformed or unsafe input',()=>{
  assert.equal(cents('12.34'),1234); assert.equal(cents('0',true),0); assert.equal(cents('',true),null);assert.equal(cents('0.29'),29);
  for(const value of ['','-1','1e2','1.234','1,000','Infinity','10000000.01','1.','NaN']) assert.throws(()=>cents(value));
});
test('target → preferred quote → agreed price chooses exactly one forecast',()=>{
  assert.equal(expenseTotals(e,q,[]).forecast,400000);
  const preferred={...e,preferred_quote_id:'q2'};
  assert.equal(expenseTotals(preferred,q,[]).forecast,360000);
  const booked={...preferred,agreed_cents:360000};
  assert.deepEqual(expenseTotals(booked,q,[payment('p',90000)]),{forecast:360000,paid:90000,owed:270000,credit:0,variance:-40000});
  assert.equal(expenseTotals(booked,[{...q[0],unit_cents:999999},q[1]],[payment('p',360000)]).forecast,360000);
  assert.equal(expenseTotals(booked,q,[payment('p',360000)]).owed,0);
});
test('zero, unknown, refunds and vendor credits remain distinct',()=>{
  assert.equal(expenseTotals({...e,target_cents:null},[],[]).forecast,null);
  assert.equal(expenseTotals({...e,target_cents:0},[],[]).forecast,0);
  assert.equal(expenseTotals({...e,agreed_cents:0},q,[]).forecast,0);
  const booked={...e,agreed_cents:360000};
  assert.equal(expenseTotals(booked,[],[payment('a',400000)]).credit,40000);
  assert.equal(expenseTotals(booked,[],[payment('a',400000),payment('b',50000,'refund')]).owed,10000);
});
test('partial installments, refunds, completed and overdue installments',()=>{
  const i={id:'i',expense_id:'e',amount_cents:90000,due_date:'2026-01-01'};
  const paid=[payment('a',30000,'payment','i')];
  assert.equal(installmentBalance(i,paid),60000);
  paid.push(payment('b',60000,'payment','i')); assert.equal(installmentBalance(i,paid),0);
  const data={expenses:[{...e,agreed_cents:360000}],quotes:[],payments:paid,installments:[i],categories:[{id:'c',name:'Food'}]};
  assert.equal(summarize(data).upcoming.length,0);
  paid.push(payment('c',10000,'refund','i'));assert.equal(summarize(data).upcoming[0].remaining,10000);
  paid.push(payment('d',50000));assert.equal(installmentBalance(i,paid),10000);assert.equal(summarize(data).unallocated,50000);
});
test('category overage stays visible even with overall budget room',()=>{
  const data={expenses:[{...e,target_cents:400000,agreed_cents:420000}],quotes:[],payments:[],installments:[],categories:[{id:'c'}]};
  const s=summarize(data);assert.equal(s.categories[0].forecast-s.categories[0].target,20000);assert.equal(1000000-s.forecast,580000);
});
test('per-person offers use saved planning headcount',()=>{
  assert.equal(quoteTotal({pricing_basis:'per_person',unit_cents:7500,headcount:90}),675000);
});
test('CSV quotes commas, quotes and newlines and neutralizes spreadsheet formulas',()=>{
  const out=csv([['a,b','"quoted"','line\nbreak','=1+1',' @SUM(A1)','-500']]);
  assert.ok(out.startsWith('\uFEFF'));assert.ok(out.includes('"a,b"'));assert.ok(out.includes('""quoted""'));assert.ok(out.includes("'=1+1"));assert.ok(out.includes("' @SUM"));
});
test('today uses wedding timezone at date boundaries',()=>{
  const now=new Date('2026-11-13T02:00:00Z');
  assert.equal(localDate('America/New_York',now),'2026-11-12');assert.equal(localDate('Europe/London',now),'2026-11-13');
});
