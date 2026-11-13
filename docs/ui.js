export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const button = (action,label,id='',cls='secondary') => `<button type="button" class="${cls}" data-action="${action}" data-id="${escapeHTML(id)}">${label}</button>`;
export const input = (name,label,value='',type='text',extra='') => `<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}>`;
export const textarea = (name,label,value='') => `<label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}" maxlength="4000">${escapeHTML(value)}</textarea>`;
export const select = (name,label,options,value='') => `<label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(([id,text])=>`<option value="${escapeHTML(id)}" ${id===value?'selected':''}>${escapeHTML(text)}</option>`).join('')}</select>`;
