import {button, select} from './ui.js';
import {guestSummary} from './planner.js';

export const aisleReady = wedding => Object.hasOwn(wedding, 'aisle_step');
export const aisleStartsOpen = wedding =>
  aisleReady(wedding) && !!wedding.aisle_step && wedding.aisle_step !== 'complete' && !wedding.aisle_paused;

export function firstActions(data) {
  const vendors = data.vendors.filter(vendor => !vendor.deleted);
  const followedUp = vendors.some(vendor => vendor.next_step?.trim() || data.events.some(event =>
    event.vendor_id === vendor.id && !event.completed && !event.deleted));
  return {vendors, followedUp, guests: guestSummary(data.invitations, data.guests).invited};
}

function nextSuggestion(data, progress) {
  if (!progress.followedUp) return ['tab-vendors','Vendors & quotes','Record the next step with a vendor you’ve spoken to. Use Schedule for a tour or call with a date.'];
  if (!progress.guests) return ['tab-guests','Guest list','Add your households so you can track replies and get a headcount.'];
  if (!data.expenses.length) return ['tab-budget','Budget','Add an expense to start tracking what you plan to spend.'];
  if (!data.tasks.length) return ['tab-planning','Our checklist','Add a planning task or use the starter checklist to plan the next few months.'];
  return ['tab-planning','Our checklist','Review what’s due next and adjust the plan as dates or priorities change.'];
}

export function renderAisle(data, selectedVendor) {
  const {aisle_step:step, aisle_paused:paused} = data.wedding;
  const completed = step === 'complete';
  let content;
  if (paused && !completed) {
    content = '<p>Setup is paused. Your wedding settings and anything you’ve added are saved.</p>'
      + button('aisle-resume','Resume setup','','');
  } else if (step === 'first_action' || completed) {
    const progress = firstActions(data);
    const vendorActions = progress.followedUp ? button('tab-vendors','View vendors')
      : progress.vendors.length
        ? select('aisle-vendor','Choose a vendor',progress.vendors.map(vendor=>[vendor.id,vendor.name]),selectedVendor)
          + button('aisle-vendor','Record a next step','selected') + button('aisle-vendor','Add another vendor')
        : button('aisle-vendor','Add a vendor','','');
    const guestAction = progress.guests ? button('tab-guests','View guest list')
      : data.guest_import_ready ? button('aisle-import','Import guest CSV','','') : button('tab-guests','Open guest list');
    const [action,label,description] = nextSuggestion(data, progress);
    content = `<p>${completed ? 'Review your setup and pick up wherever you’re ready.' : 'Choose one way to get started. Work you save in the planner counts here too.'}</p>
      <div class="aisle-options">
        <section><h3>Follow up with a vendor</h3><p>${progress.followedUp ? 'You’ve saved a vendor and a next step.' : 'Save a vendor you’ve spoken to and what you’ll do next, like asking for a quote.'}</p><div>${vendorActions}</div></section>
        <section><h3>Bring in your guest list</h3><p>${progress.guests ? `${progress.guests} ${progress.guests === 1 ? 'guest is' : 'guests are'} in your planner.` : 'Use the CSV template to bring over your households and RSVPs in one import.'}</p><div class="actions">${guestAction}</div></section>
      </div>
      ${completed ? `<h3>What to do next</h3><p>${description}</p>${button(action,label)}` : ''}
      <div class="actions aisle-footer">${button('aisle-settings','Review wedding settings')}
        ${completed ? '' : button('aisle-finish', progress.followedUp || progress.guests ? 'Finish setup' : 'Skip this step and finish','','') + button('aisle-pause','Pause setup')}</div>`;
  } else {
    content = '<p>Start with your wedding details. You can leave the date, budget, and guest estimate open and come back when you know more.</p>'
      + '<div class="actions">' + button('aisle-settings','Set wedding details','','')
      + (step === 'settings' ? button('aisle-pause','Pause setup') : '') + '</div>';
  }
  return `<section class="panel aisle" id="aisle-panel" aria-labelledby="aisle-title">
    <div class="section-head"><h2 id="aisle-title" tabindex="-1">Aisle</h2>${button('aisle-close','Close guide')}</div>
    ${content}
  </section>`;
}
