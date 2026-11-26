import {input, select, textarea, escapeHTML as esc} from './ui.js';
import {comparisonModel, offerLabels, starterCriteria} from './vendor-comparison.js';
import {listPicker, comparisonView} from './comparison-view.js';

export function setupComparison({getData,openForm,insert,update,operation,show,reload,openExpense,deleteChecklist}) {
  let state;
  function reset() {
    state = {open:false,listId:'',source:null,filter:'all',optionId:''};
  }
  reset();
  const list = () => getData().comparison_lists.find(item => item.id === state.listId);
  function sourceFor(vendorId, quoteId=null) {
    const vendor = getData().vendors.find(v => v.id === vendorId);
    const quote = getData().quotes.find(q => q.id === quoteId && q.vendor_id === vendorId);
    return vendor && (!quoteId || quote) ? {vendor_id:vendorId, quote_id:quoteId, name:quote ? vendor.name+' · '+quote.package_name : vendor.name} : null;
  }
  function home(source=null) {
    reset();
    Object.assign(state,{open:true,source});
    show();
  }
  function selectList(id) {
    state = {open:true,listId:id,source:null,filter:'all',optionId:''};
  }
  function addOption(listId,source) {
    const existing = getData().comparison_options.find(o => o.list_id===listId && o.vendor_id===source.vendor_id && o.quote_id===source.quote_id);
    if (existing) return existing.selected ? undefined : update('comparison_options',existing,{selected:true});
    return insert('comparison_options',{list_id:listId,vendor_id:source.vendor_id,quote_id:source.quote_id,selected:true});
  }
  function createList(type) {
    const initial = state, source = state.source;
    openForm('Start a shared checklist',input('name','Checklist name',type==='Custom' ? '' : type,'text','required maxlength="80"'),async f => {
      const title = f.name.trim();
      if (!title) throw new Error('Enter a checklist name.');
      if (getData().comparison_lists.some(item => item.name.toLowerCase()===title.toLowerCase())) {
        throw new Error('A checklist with that name already exists. Open it from Shared checklists or choose another name.');
      }
      const id = crypto.randomUUID();
      await operation('rpc/create_comparison',{w:getData().wedding.id,list:id,title,starters:starterCriteria(type),
        vendor:source?.vendor_id || null,quote:source?.quote_id || null});
      if (state===initial) selectList(id);
    });
  }
  function pickOption() {
    const board = list(), data = getData();
    const selected = new Set(data.comparison_options.filter(o => o.list_id===board.id && o.selected).map(o => o.quote_id ? 'q:'+o.quote_id : 'v:'+o.vendor_id));
    const choices = data.vendors.flatMap(v => [
      ['v:'+v.id,v.name+' · Vendor details'],
      ...data.quotes.filter(q => q.vendor_id===v.id).map(q => ['q:'+q.id,v.name+' · '+q.package_name])
    ]).filter(([key]) => !selected.has(key));
    if (!choices.length) throw new Error('Add a vendor or package quote in Vendors & quotes to have more options here.');
    openForm('Add a comparison column',select('option','Vendor or package',choices),f => {
      const [kind,id] = f.option.split(':');
      const quote = kind==='q' && data.quotes.find(q => q.id===id);
      return addOption(board.id,quote ? {vendor_id:quote.vendor_id,quote_id:id} : {vendor_id:id,quote_id:null});
    });
  }
  function criterionForm(id) {
    const listId = list().id;
    const criteria = getData().comparison_criteria.filter(c => c.list_id===listId && !c.removed);
    const row = criteria.find(c => c.id===id);
    const next = criteria.reduce((max,c) => Math.max(max,c.position),0)+10;
    openForm(row ? 'Edit criterion' : 'Add criterion',
      input('label','Criterion',row?.label || '','text','required maxlength="160"')+
      input('section','Group',row?.section || '','text','maxlength="80"')+
      select('priority','Priority',[['optional','Optional'],['must','Must-have']],row?.must_have ? 'must' : 'optional')+
      input('position','Display order within priority',row?.position ?? Math.min(next,1000000),'number','required min="0" max="1000000"')+
      (row ? select('keep','Keep in checklist?',[['yes','Keep'],['no','Remove criterion and hide its answers']]) : ''),f => {
        const fields = {label:f.label.trim(),section:f.section.trim(),position:Number(f.position),must_have:f.priority==='must'};
        return row ? update('comparison_criteria',row,{...fields,removed:f.keep==='no'}) : insert('comparison_criteria',{...fields,list_id:listId});
      });
  }
  function answerForm(criterionId,optionId) {
    const board = list();
    const model = comparisonModel(getData(),board.id);
    const row = model.rows.find(r => r.criterion.id===criterionId);
    const cell = row?.cells.find(c => c.column.id===optionId);
    if (!cell) throw new Error('This comparison changed. Refresh and review.');
    const {own,column,answer} = cell;
    const offers = Object.entries(offerLabels).filter(([value]) => value!=='inherit' || column.quote_id);
    openForm('Edit comparison answer',`<p><strong>${esc(row.criterion.label)}</strong> · ${esc(column.name)}</p>`+
      (cell.inherited ? `<p>Vendor answer: ${offerLabels[answer.offer]} ${esc(answer.notes)}</p>` : '')+
      select('offer','What does this option offer?',offers,own?.offer || (cell.inherited ? 'inherit' : 'unknown'))+
      select('fit','Does it meet your requirement?',[['auto','Use offer status'],['yes','Yes, works for us'],['no','No, doesn’t meet our needs']],own?.fit || 'auto')+
      textarea('notes','Terms, extra costs or questions',own?.notes || ''),f => {
        const fields = {offer:f.offer,fit:['unknown','unavailable','inherit'].includes(f.offer) ? 'auto' : f.fit,
          notes:f.offer==='inherit' ? '' : f.notes.trim()};
        return own ? update('comparison_answers',own,fields) : insert('comparison_answers',{
          ...fields,list_id:board.id,criterion_id:criterionId,option_id:optionId});
      });
    const offer = document.querySelector('#f-offer'), fit = document.querySelector('#f-fit'), notes = document.querySelector('#f-notes');
    function syncFields() {
      fit.disabled = ['unknown','unavailable','inherit'].includes(offer.value);
      notes.disabled = offer.value==='inherit';
    }
    offer.onchange=syncFields;
    syncFields();
  }
  function filter(filter,optionId='') {
    Object.assign(state,{filter,optionId});
    show();
    document.querySelector('.comparison-scroll')?.focus();
  }
  return {
    reset,
    get open() { return state.open; },
    render() { return list() ? comparisonView(getData(),list(),state) : listPicker(getData(),state.source?.name); },
    actions:{
      'compare-home':() => home(), 'compare-close':() => { reset(); show(); },
      'compare-vendor':id => home(sourceFor(id)),
      'compare-quote':id => home(sourceFor(getData().quotes.find(q => q.id===id)?.vendor_id,id)),
      'compare-create':createList,
      'compare-list':async id => {
        const initial = state;
        if (initial.source) {
          await addOption(id,initial.source);
          if (state!==initial) return;
          await reload();
        }
        if (state!==initial) return;
        selectList(id);
        show();
      },
      'compare-add':pickOption,'compare-criterion':criterionForm,'compare-answer':answerForm,
      'compare-filter':filter,'compare-questions':id => filter('ask',id),'compare-decisions':id => filter('decide',id),
      'compare-remove':async id => {
        const option = getData().comparison_options.find(o => o.id===id);
        await update('comparison_options',option,{selected:false});
        await reload();
      },
      'compare-delete':deleteChecklist,
      'compare-expense':openExpense
    }
  };
}
