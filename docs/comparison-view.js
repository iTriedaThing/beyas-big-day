import {button, escapeHTML as esc} from './ui.js';
import {money, quoteTotal, quotePriceBasis} from './budget.js';
import {comparisonModel, comparisonRows, offerLabels, outcomeLabels, starterTypes} from './vendor-comparison.js';

export function listPicker(data, sourceName) {
  const lists = data.comparison_lists.map(list => button('compare-list',esc(list.name),list.id));
  const starters = [...starterTypes,'Custom'].map(type => button('compare-create',esc(type),type));
  return `<section class="panel comparison-panel"><div class="section-head"><h2>Compare vendors</h2>
    ${button('compare-close','Back to vendors')}</div>
    ${sourceName ? `<p>Choose a checklist for <strong>${esc(sourceName)}</strong>.</p>` : ''}
    ${lists.length ? '<h3>Shared checklists</h3><div class="actions">'+lists.join('')+'</div>' : '<p>Start a shared checklist, choose your must-haves, and add vendors or packages side by side.</p>'}
    <h3>Start a checklist</h3><div class="actions">${starters.join('')}</div></section>`;
}

function columnHeader(column, total, data) {
  const {quote,counts} = column;
  const booked = quote && data.expenses.some(e => e.booked_quote_id === quote.id);
  const vendorPriceLabel = data.quotes.some(q => q.vendor_id === column.vendor_id) ? 'No package selected' : 'Awaiting quote';
  const price = quote
    ? `<strong>${money(quoteTotal(quote),data.wedding.currency)}</strong><small>${quotePriceBasis(quote,data.wedding.currency)}</small>`
    : `<small>${vendorPriceLabel}</small>`;
  const summary = total ? `<strong>${counts.met} of ${total} ${total===1 ? 'must-have' : 'must-haves'} met</strong>` : '<small>No must-haves marked</small>';
  const actions = [];
  if (quote && !booked) actions.push(button('quote-edit','Edit quote',quote.id));
  if (quote) actions.push(button('compare-expense',booked ? 'View agreement' : 'View expense',quote.expense_id));
  actions.push(button('compare-remove','Remove column',column.id));
  return `<th scope="col"><h3>${esc(quote?.package_name || column.vendor.name)}</h3><p>${esc(quote ? column.vendor.name : 'Vendor details')}</p>
    ${price}<div class="comparison-summary">${summary}
    ${counts.unavailable ? `<small>${counts.unavailable} unavailable</small>` : ''}
    ${counts.declined ? `<small>${counts.declined} don’t meet your needs</small>` : ''}
    ${counts.ask ? button('compare-questions',counts.ask+' to ask about',column.id) : ''}
    ${counts.decide ? button('compare-decisions',counts.decide+' to decide',column.id) : ''}</div>
    <details data-column="${esc(column.id)}"><summary>Option actions</summary>${actions.join('')}</details></th>`;
}

function renderRow({criterion,cells}) {
  return `<tr><th scope="row"><small>${esc(criterion.section)}</small><strong>${esc(criterion.label)}</strong>
    ${criterion.must_have ? '<small class="comparison-priority">Must-have</small>' : ''}
    <button type="button" class="secondary" data-action="compare-criterion" data-id="${esc(criterion.id)}"
      aria-label="Edit criterion: ${esc(criterion.label)}">Edit</button></th>${cells.map(cell => {
      const {column,answer,result} = cell;
      const fact = offerLabels[answer?.offer || 'unknown'];
      return `<td><span class="comparison-status status-${result}">${outcomeLabels[result]}</span>
        ${answer && answer.offer!=='unknown' && fact !== outcomeLabels[result] ? `<small>${fact}</small>` : ''}
        ${answer?.notes ? `<p>${esc(answer.notes)}</p>` : ''}
        ${cell.inherited ? '<small>From vendor answer</small>' : ''}
        <button type="button" class="secondary" data-action="compare-answer" data-id="${esc(criterion.id)}" data-value="${esc(column.id)}"
          aria-label="Edit ${esc(criterion.label)} for ${esc(column.name)}">Edit answer</button></td>`;
    }).join('')}</tr>`;
}

export function comparisonView(data,list,state) {
  const model = comparisonModel(data,list.id);
  const target = model.columns.find(c => c.id === state.optionId);
  const rows = comparisonRows(model,state.filter,target?.id);
  const filters = [['all','All criteria'],['different','Differences'],['ask','To ask'],['decide','To decide']];
  return `<section class="panel comparison-panel"><div class="section-head">
    <h2 tabindex="-1" id="comparison-title">${esc(list.name)}</h2>${button('compare-home','All checklists')}</div>
    <div class="actions">${data.vendors.length ? button('compare-add','Add vendor or package') : button('vendor-new','Add your first vendor')}${button('compare-criterion','Add criterion')}</div>
    ${model.columns.length < 2 ? '<p>Add two or more vendors or packages to compare them side by side.</p>' : ''}
    ${model.rows.length ? '' : '<p>Add your first criterion, then mark the items that matter most as must-haves.</p>'}
    <div class="actions comparison-filters" role="group" aria-label="Filter criteria">${filters.map(([key,label]) =>
      `<button type="button" class="secondary" data-action="compare-filter" data-id="${key}" aria-pressed="${state.filter===key}">${label}</button>`).join('')}</div>
    ${target ? `<p>Must-haves for ${esc(target.name)} ${button('compare-filter','Show all options',state.filter)}</p>` : ''}
    <div class="comparison-scroll" data-list="${esc(list.id)}" tabindex="0" role="region" aria-label="Vendor comparison, scroll horizontally for more options">
    <table class="comparison-table" aria-label="${esc(list.name)} comparison">
    <thead><tr><th scope="col">Criteria</th>${model.columns.map(c => columnHeader(c,model.mustHaves,data)).join('')}</tr></thead>
    <tbody>${rows.map(renderRow).join('')}</tbody></table></div>
    ${!rows.length && model.rows.length ? '<p>No criteria match this filter.</p>' : ''}</section>`;
}

// A partner edit or polling refresh replaces the view even while someone is reading a wide shortlist.
export function rememberComparisonViewport() {
  const old = document.querySelector('.comparison-scroll');
  if (!old) return;
  const left = old.scrollLeft;
  const expanded = [...old.querySelectorAll('details[open]')].map(el => el.dataset.column);
  const active = document.activeElement;
  let focus;
  if (old.contains(active)) {
    if (active.matches('summary')) focus = 'details[data-column="'+CSS.escape(active.parentElement.dataset.column)+'"] summary';
    else if (active.dataset.action) focus = ['action','id','value'].filter(key => key in active.dataset)
      .map(key => '[data-'+key+'="'+CSS.escape(active.dataset[key])+'"]').join('');
  }
  return () => {
    const current = document.querySelector('.comparison-scroll');
    if (current?.dataset.list !== old.dataset.list) return;
    for (const id of expanded) current.querySelector('details[data-column="'+CSS.escape(id)+'"]')?.setAttribute('open','');
    current.scrollLeft = left;
    if (focus) current.querySelector(focus)?.focus({preventScroll:true});
    else if (active === old) current.focus({preventScroll:true});
  };
}
