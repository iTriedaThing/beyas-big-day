// Templates supply questions only. Priorities and answers belong to each wedding.
const templates = {
  Venues: {
    'Space & ceremony': ['Guest capacity', 'Indoor ceremony or rain backup', 'Getting-ready suites', 'Accessible ceremony and reception spaces'],
    'Reception': ['Tables, chairs and linens', 'Cocktail hour', 'Open bar', 'Wedding cake'],
    'Terms': ['Outside caterers allowed', 'Minimum spend and fees', 'Setup and breakdown time']
  },
  Caterers: {
    'Food & service': ['Service style', 'Entrée choices', 'Dietary accommodations', 'Tasting'],
    'Staff & rentals': ['Servers and bartenders', 'China, glassware and linens', 'Setup and cleanup'],
    'Terms': ['Minimum guest count or spend', 'Service and travel fees']
  }
};
export const starterTypes = Object.keys(templates);
export function starterCriteria(type) {
  return Object.entries(templates[type] || {}).flatMap(([section, labels]) => labels.map(label => ({section,label})));
}

export const offerLabels = {
  unknown:'Unknown', included:'Included', extra:'Available for an extra fee',
  conditional:'Available with conditions', unavailable:'Unavailable', inherit:'Use vendor answer'
};
export const outcomeLabels = {met:'Met', unavailable:'Unavailable', declined:'Doesn’t meet our needs', ask:'To ask', decide:'To decide'};
export function outcome(answer) {
  if (!answer || answer.offer === 'unknown') return 'ask';
  if (answer.offer === 'unavailable') return 'unavailable';
  if (answer.fit === 'no') return 'declined';
  if (answer.fit === 'yes' || answer.offer === 'included') return 'met';
  return 'decide';
}

export function comparisonModel(data, listId) {
  const options = data.comparison_options.filter(o => o.list_id === listId);
  const vendorOptions = new Map(options.filter(o => !o.quote_id).map(o => [o.vendor_id,o]));
  const answers = new Map(data.comparison_answers.filter(a => a.list_id === listId)
    .map(a => [a.criterion_id + ':' + a.option_id,a]));
  const vendors = new Map(data.vendors.map(v => [v.id,v]));
  const quotes = new Map(data.quotes.map(q => [q.id,q]));
  const columns = options.filter(o => o.selected).map(option => {
    const vendor = vendors.get(option.vendor_id), quote = quotes.get(option.quote_id);
    return {...option, vendor, quote, name:quote ? vendor.name + ' · ' + quote.package_name : vendor.name,
      counts:{met:0,unavailable:0,declined:0,ask:0,decide:0}};
  }).sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const criteria = data.comparison_criteria.filter(c => c.list_id === listId && !c.removed)
    .sort((a,b) => Number(b.must_have)-Number(a.must_have) || a.position-b.position || a.id.localeCompare(b.id));
  const rows = criteria.map(criterion => {
    const cells = columns.map(column => {
      const own = answers.get(criterion.id + ':' + column.id);
      const base = vendorOptions.get(column.vendor_id);
      // An explicit unknown overrides the vendor. Only absence or a cleared override inherits.
      const inherited = column.quote && (!own || own.offer === 'inherit') && answers.get(criterion.id + ':' + base?.id);
      const answer = inherited || (own?.offer === 'inherit' ? undefined : own);
      const result = outcome(answer);
      if (criterion.must_have) column.counts[result]++;
      return {column, own, answer, inherited:Boolean(inherited), result};
    });
    const signatures = cells.map(({answer,result}) => JSON.stringify([result,answer?.offer || 'unknown',answer?.notes || '']));
    return {criterion,cells,different:new Set(signatures).size > 1};
  });
  return {columns,rows,mustHaves:criteria.filter(c => c.must_have).length};
}

export function comparisonRows(model, filter, optionId='') {
  if (filter === 'different') return model.rows.filter(row => row.different);
  if (filter === 'ask' || filter === 'decide') return model.rows.filter(({criterion,cells}) =>
    (!optionId || criterion.must_have) && cells.some(cell => (!optionId || cell.column.id === optionId) && cell.result === filter));
  return model.rows;
}
