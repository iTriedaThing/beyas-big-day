import {button, escapeHTML as esc} from './ui.js';

const types = {
  categories:'Expense categories', expenses:'Expenses', vendors:'Vendors', quotes:'Quotes',
  installments:'Installments', payments:'Payments and refunds', invitations:'Households', guests:'Guests',
  tasks:'Checklist items', events:'Schedule items', vendor_photos:'Vendor pictures', itinerary_items:'Itinerary items',
  menu_courses:'Courses', menu_options:'Dishes', comparison_lists:'Comparison checklists',
  comparison_criteria:'Comparison criteria', comparison_options:'Comparison columns', comparison_answers:'Comparison answers',
  guest_meals:'Guest meal choices', contract_amendments:'Agreement amendments',
  picture_files:'Picture files', seating_units:'Tables and rows', seating_placements:'Seat assignments'
};

export function renderArchive(data, kind) {
  const entries = (data.archive_entries || []).filter(entry => !kind || entry.kind === kind);
  return `<section class="panel"><h2>${kind === 'tasks' ? 'Archived checklist items' : 'Archive'}</h2>
    ${entries.length ? entries.map(entry => {
      const actor = data.members.find(member => member.user_id === entry.archived_by)?.display_name;
      const date = entry.archived_at && new Date(entry.archived_at).toLocaleDateString(undefined,{timeZone:data.wedding.time_zone});
      return `<article class="section-head archive-entry"><div><h3>${esc(entry.label)}</h3><small>${esc([types[entry.kind],date,actor].filter(Boolean).join(' · '))}</small></div>
        <div class="actions">${button('archive-restore','Restore',entry.token)}${button('archive-purge','Delete permanently',entry.token)}</div></article>`;
    }).join('') : '<p class="empty">No archived items.</p>'}
    ${data.archive_files_pending ? '<p>Permanent deletion of picture files is pending.</p>'+button('archive-files','Retry file cleanup') : ''}
  </section>`;
}

export function renderPurgeImpact(impact) {
  return Object.entries(impact).map(([kind,rows]) =>
    `<details class="archive-impact"><summary>${esc(types[kind] || kind)} (${rows.length})</summary><ul>${rows.map(row =>
      `<li>${esc(row.label)}</li>`).join('')}</ul></details>`).join('');
}
