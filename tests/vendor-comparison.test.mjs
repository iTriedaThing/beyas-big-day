import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonModel, comparisonRows, outcome, starterCriteria} from '../docs/vendor-comparison.js';
import {comparisonView} from '../docs/comparison-view.js';
import {quotePriceBasis} from '../docs/budget.js';

function wedding() {
  return {
    wedding:{currency:'USD'}, vendors:[{id:'v',name:'Venue A'},{id:'b',name:'Venue B'}], expenses:[],
    quotes:[{id:'q',package_name:'Evening',vendor_id:'v',expense_id:'e',unit_cents:14500,pricing_basis:'per_person',headcount:100}],
    comparison_options:[['base','v',null,false],['pkg','v','q',true],['other','b',null,true]]
      .map(([id,vendor_id,quote_id,selected]) => ({id,vendor_id,quote_id,selected,list_id:'list'})),
    comparison_criteria:[{id:'suite',label:'Suite',position:10,must_have:true},{id:'food',label:'Dinner',position:1,must_have:false}]
      .map(c => ({...c,list_id:'list',section:'Visit'})),
    comparison_answers:[{id:'a',option_id:'base',criterion_id:'suite',list_id:'list',offer:'extra',fit:'auto',notes:'500 USD for the day'}]
  };
}
test('package inherits even after removing the vendor column; explicit unknown and clearing have different meanings',() => {
  const data=wedding();
  const read=() => comparisonModel(data,'list').rows[0].cells.find(c => c.column.id==='pkg');
  assert.equal(read().result,'decide');
  assert.equal(read().inherited,true);
  data.comparison_answers.push({...data.comparison_answers[0],option_id:'pkg',offer:'unknown',notes:''});
  assert.equal(read().result,'ask');
  assert.equal(read().inherited,false);
  data.comparison_answers[1].offer='inherit';
  assert.equal(read().result,'decide');
  data.comparison_answers[0].fit='yes';
  assert.equal(read().result,'met');
  data.comparison_options[0].selected=true;
  assert.equal(comparisonModel(data,'list').columns.length,3);
});
test('each must-have is counted exactly once and tour filters can focus on one option',() => {
  const data=wedding(), model=comparisonModel(data,'list');
  assert.deepEqual(model.rows.map(r => r.criterion.id),['suite','food']);
  for (const c of model.columns) assert.equal(Object.values(c.counts).reduce((a,b) => a+b,0),model.mustHaves);
  assert.equal(comparisonRows(model,'ask').length,2);
  assert.equal(comparisonRows(model,'ask','pkg').length,0);
  assert.equal(comparisonRows(model,'ask','other').length,1);
  assert.equal(comparisonRows(model,'decide','pkg').length,1);
  assert.equal(comparisonRows(model,'different').length,1);
  assert.equal(outcome({offer:'included',fit:'no'}),'declined');
  assert.equal(outcome({offer:'conditional',fit:'auto'}),'decide');
  assert.equal(outcome({offer:'unavailable',fit:'auto'}),'unavailable');
});
test('different terms are visible even for two included offers; removed criteria do not count',() => {
  const data=wedding();
  const [answer]=data.comparison_answers;
  Object.assign(answer,{offer:'included',notes:'Ivory'});
  data.comparison_answers.push({...answer,option_id:'other',notes:'Choice of colors'});
  assert.equal(comparisonRows(comparisonModel(data,'list'),'different').length,1);
  data.comparison_criteria[0].removed=true;
  assert.equal(comparisonModel(data,'list').mustHaves,0);
});
test('templates are editable starting questions and other categories start blank',() => {
  for (const type of ['Venues','Caterers']) {
    const criteria=starterCriteria(type);
    assert.ok(criteria.length>=6);
    assert.ok(criteria.every(c => c.label && c.section && !c.must_have));
  }
  assert.deepEqual(starterCriteria('Custom'),[]);
});
test('columns reuse saved quote prices and safely render terms and vendor names',() => {
  const data=wedding();
  data.vendors[0].name='<Garden>';
  data.comparison_answers[0].notes='<suite>';
  data.expenses=[{id:'e',booked_quote_id:'q',menu_linked:true}];
  const html=comparisonView(data,{id:'list',name:'Venues'},{filter:'all'});
  assert.match(html,/\$14,500.00/);
  assert.match(html,/\$145.00 per guest × 100 guests/);
  assert.match(html,/Awaiting quote/);
  assert.match(html,/View agreement/);
  assert.doesNotMatch(html,/data-action="quote-edit"|<Garden>|<suite>/);
  assert.match(html,/&lt;suite&gt;/);
  assert.equal(quotePriceBasis({pricing_basis:'fixed'},'USD'),'Fixed package price');
});
