import {button,escapeHTML as esc,input,select} from './ui.js';
import {timeZones} from './features.js';

export function invitationId(url) {
  const id=new URL(url).searchParams.get('invitation') || '';
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?id.toLowerCase():null;
}
export function invitationURL(base,id) {
  const url=new URL(base);
  url.hash=''; url.search=''; url.searchParams.set('invitation',id);
  return url.href;
}
export async function loadPlannerAccess(api,linkId) {
  try { return {...await api.request('rpc/planner_access',{method:'POST',body:{link_id:linkId}}),enabled:true}; }
  catch (error) {
    // Pages can be released before the database migration. Preserve existing planners.
    if (error.code!=='PGRST202') throw error;
    return {enabled:false,operator:false,incoming:[],outgoing:[],weddings:await api.request('weddings?select=id,name')};
  }
}
export function chooseWedding(access,{wedding,hub=false,linkId}={}) {
  if (hub) return null;
  const candidate=wedding || (linkId && access.accepted_wedding);
  if (candidate) return access.weddings.find(w=>w.id===candidate)?.id || null;
  if (linkId || access.incoming.length || access.weddings.length!==1) return null;
  return access.weddings[0].id;
}
export function renderAccess(access,{selected,linkId,origin,target,issued}) {
  const received=access.incoming;
  const invite=received.find(i=>i.id===(selected||linkId)) || (!linkId && received.length===1?received[0]:null);
  const locations=access.weddings.map(w=>[w.id,w.name]);
  if (access.operator) locations.push(['new','New beta wedding']);
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const link=access.outgoing.find(i=>i.id===issued);
  return `<div class="enrollment"><section class="panel"><h1>Your Big Days</h1>${access.weddings.length?`<div class="actions">${access.weddings.map(w=>button('open-wedding',esc(w.name),w.id)).join('')}</div>`:'<p>Your wedding will appear here after you accept an invitation.</p>'}</section>
    ${linkId&&!received.some(i=>i.id===linkId)&&!access.accepted_wedding?'<p class="panel">This link is unavailable for this account. Check the invited email address or ask the sender for a fresh link.</p>':''}
    ${received.length?`<section class="panel"><h2>Your invitations</h2><div class="actions">${received.map(i=>button('choose-planner-invite',i.wedding?'Join '+esc(i.wedding):'Create your Big Day',i.id)).join('')}</div>
      ${invite?`<form id="accept-planner-invite" data-id="${esc(invite.id)}"><h3>${invite.wedding?'Join '+esc(invite.wedding):'Create your private wedding'}</h3>${input('member_name','Your name in the planner','','text','required maxlength="100" autocomplete="given-name"')}
      ${invite.wedding?'':input('wedding_name','Wedding name','','text','required maxlength="120" placeholder="Our wedding"')+select('zone','Wedding time zone',timeZones(zone),zone)}
      <p>${invite.wedding?'Everyone in this wedding can view and edit the full planner and invite collaborators.':'You can invite your partner and other collaborators after creating the wedding.'}</p><button type="submit">${invite.wedding?'Join wedding':'Create wedding'}</button></form>`:''}</section>`:''}
    ${access.enabled&&locations.length?`<section class="panel"><h2>Invite someone</h2><form id="issue-planner-invite">${select('target','Invitation for',locations,target || locations[0][0])}${input('recipient','Invited email address','','email','required maxlength="254" autocomplete="off"')}
      <p>Share the link with the person you invite. It works for their verified email for seven days. A collaborator has full access to the wedding you select.</p><button type="submit">Create invitation link</button></form></section>`:''}
    ${link?`<section class="panel"><h2>Share this invitation</h2>${input('share-link','Link for '+esc(link.email),invitationURL(origin,link.id),'url','readonly')}<p>Copy the link and send it privately to the invited person.</p></section>`:''}
    ${access.outgoing.length?`<section class="panel"><h2>Pending invitations</h2><ul class="seat-roster">${access.outgoing.map(i=>`<li><div><strong>${esc(i.email)}</strong><small>${esc(i.wedding||'New beta wedding')} · Expires ${esc(new Date(i.expires_at).toLocaleString())}</small></div><div class="actions">${button('show-invite-link','Show link',i.id)}${button('revoke-planner-invite','Revoke link',i.id)}</div></li>`).join('')}</ul></section>`:''}
    ${button('access-refresh','Refresh invitations')}</div>`;
}
