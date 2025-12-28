/* Dinamita POS v0 - Clientes (IndexedDB state)
   - Fix: no JS syntax errors
   - Fix: Guardar ya no recarga ni cambia de módulo
   - Imprimir credencial (58mm): Nombre + ID + QR (sin WhatsApp)
*/

(function(){
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function nowIso(){
    const d = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function uid(prefix='C'){
    // C001, C002...
    return `${prefix}${Math.floor(Math.random()*9000+1000)}`;
  }

  async function getQrDataUrl(text){
    // Online fallback (simple + funciona en tablet). Si falla, regresamos null.
    try{
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}&format=png&margin=10`;
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error('qr fetch failed');
      const blob = await res.blob();
      return await new Promise((resolve, reject)=>{
        const r = new FileReader();
        r.onload = ()=> resolve(r.result);
        r.onerror = ()=> reject(new Error('qr read failed'));
        r.readAsDataURL(blob);
      });
    }catch(e){
      return null;
    }
  }

  function esc(s){
    return (s ?? '').toString().replace(/[&<>"']/g, (c)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function loadState(){
    return await window.dpGetState();
  }
  async function saveState(st){
    await window.dpSetState(st);
  }

  function getEls(){
    return {
      form: $('#clientes-form'),
      photo: $('#c-photo'),
      photoPreview: $('#c-photoPreview'),
      photoClear: $('#c-photoClear'),
      name: $('#c-name'),
      phone: $('#c-phone'),
      address: $('#c-address'),
      notes: $('#c-notes'),
      id: $('#c-id'),
      mode: $('#c-mode'),
      btnClear: $('#c-clear'),
      btnPrint: $('#c-print'),
      btnSave: $('#c-save'),
      list: $('#clientes-list'),
      search: $('#c-search')
    };
  }

  function setMode(els, mode){
    els.mode.textContent = mode;
  }

  function clearForm(els){
    els.name.value='';
    els.phone.value='';
    els.address.value='';
    els.notes.value='';
    els.id.value='';
    if(els.photo) els.photo.value='';
    if(els.photoPreview) els.photoPreview.innerHTML='';
    setMode(els,'Nuevo');
    els.btnPrint.disabled = true;
  }

  function renderList(els, st){
    const q = (els.search?.value || '').trim().toLowerCase();
    const clients = Array.isArray(st.clients) ? st.clients : [];
    const filtered = q
      ? clients.filter(c =>
          (c.name||'').toLowerCase().includes(q) ||
          (c.id||'').toLowerCase().includes(q) ||
          (c.phone||'').toLowerCase().includes(q)
        )
      : clients;

    els.list.innerHTML = filtered.map(c=>{
      return `
        <div class="row" data-id="${esc(c.id)}">
          <div class="col">
            <div class="title">${esc(c.name || '(Sin nombre)')}</div>
            <div class="muted">${esc(c.id)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
          </div>
          <div class="col actions">
            <button type="button" class="btn btnGhost" data-action="edit">Editar</button>
            <button type="button" class="btn btnGhost" data-action="print">Imprimir QR</button>
            <button type="button" class="btn btnDanger" data-action="delete">Borrar</button>
          </div>
        </div>
      `;
    }).join('') || `<div class="muted" style="padding:10px;">Sin clientes</div>`;
  }

  async function selectClient(els, st, id){
    const c = (st.clients||[]).find(x=>x.id===id);
    if(!c) return;
    els.name.value = c.name || '';
    els.phone.value = c.phone || '';
    els.address.value = c.address || '';
    els.notes.value = c.notes || '';
    els.id.value = c.id || '';
    setMode(els,'Editar');
    els.btnPrint.disabled = !(c.id);
    // Foto: se mantiene como dataURL en c.photo (si existe)
    if(c.photo && els.photoPreview){
      els.photoPreview.innerHTML = `<img alt="foto" src="${c.photo}" style="max-width:80px;max-height:80px;border-radius:10px;"/>`;
    } else if(els.photoPreview){
      els.photoPreview.innerHTML='';
    }
  }

  async function upsertClient(els){
    const name = (els.name.value||'').trim();
    if(!name){
      alert('Nombre requerido');
      els.name.focus();
      return;
    }

    const st = await loadState();
    st.clients = Array.isArray(st.clients) ? st.clients : [];

    let id = (els.id.value||'').trim();
    if(!id) id = uid('C');

    let photoDataUrl = null;
    const file = els.photo?.files?.[0];
    if(file){
      photoDataUrl = await new Promise((resolve)=>{
        const r = new FileReader();
        r.onload = ()=> resolve(r.result);
        r.onerror = ()=> resolve(null);
        r.readAsDataURL(file);
      });
    } else {
      // si está editando y no seleccionó foto, conserva la anterior
      const existing = st.clients.find(c=>c.id===id);
      if(existing?.photo) photoDataUrl = existing.photo;
    }

    const payload = {
      id,
      name,
      phone: (els.phone.value||'').trim(),
      address: (els.address.value||'').trim(),
      notes: (els.notes.value||'').trim(),
      photo: photoDataUrl,
      updatedAt: nowIso(),
      createdAt: st.clients.find(c=>c.id===id)?.createdAt || nowIso(),
    };

    const idx = st.clients.findIndex(c=>c.id===id);
    if(idx>=0) st.clients[idx] = payload;
    else st.clients.unshift(payload);

    await saveState(st);

    els.id.value = id;
    setMode(els,'Editar');
    els.btnPrint.disabled = false;
    renderList(els, st);
  }

  async function deleteClient(els, id){
    const st = await loadState();
    st.clients = Array.isArray(st.clients) ? st.clients : [];

    // Si tiene ventas o membresías ligadas, no borrar
    const hasSales = (st.sales||[]).some(s => (s.customerId===id) || (s.customerName && (st.clients||[]).find(c=>c.id===id)?.name && s.customerName=== (st.clients||[]).find(c=>c.id===id)?.name));
    const hasMembership = (st.memberships||[]).some(m => m.clientId===id);
    if(hasSales || hasMembership){
      alert('No se puede borrar: tiene ventas o membresías ligadas.');
      return;
    }
    if(!confirm(`¿Borrar cliente ${id}?`)) return;
    st.clients = st.clients.filter(c=>c.id!==id);
    await saveState(st);
    renderList(els, st);
    // si era el que estaba en formulario
    if((els.id.value||'').trim()===id) clearForm(els);
  }

  async function printCredentialFor(id, name){
    const qrDataUrl = await getQrDataUrl(id);
    const content = `
      <div class="ticket">
        <div class="t-center" style="font-weight:800; font-size:16px;">Dinamita Gym</div>
        <div class="t-center" style="margin-top:6px; font-size:12px;">${esc(name)}</div>
        <div class="t-center" style="margin-top:6px; font-size:18px; font-weight:900; letter-spacing:1px;">${esc(id)}</div>
        <div class="t-center" style="margin-top:10px;">${qrDataUrl ? `<img alt="qr" src="${qrDataUrl}" style="width:170px;height:170px;"/>` : `<div style="border:1px dashed #999;padding:10px;">QR no disponible</div>`}</div>
        <div class="t-center" style="margin-top:10px; font-size:11px;">Escanea para acceso</div>
      </div>
    `;
    await window.dpPrintHtml(content, { title: `Credencial ${id}` });
  }

  async function handlePrintFromForm(els){
    const id = (els.id.value||'').trim();
    const name = (els.name.value||'').trim();
    if(!id || !name){
      alert('Primero guarda el cliente para generar su ID.');
      return;
    }
    await printCredentialFor(id, name);
  }

  async function boot(){
    const els = getEls();
    if(!els.form) return;

    const st = await loadState();
    st.clients = Array.isArray(st.clients) ? st.clients : [];
    renderList(els, st);

    // Eventos
    els.btnClear?.addEventListener('click', ()=> clearForm(els));
    els.btnSave?.addEventListener('click', async ()=>{
      await upsertClient(els);
    });
    els.btnPrint?.addEventListener('click', async ()=>{
      await handlePrintFromForm(els);
    });

    els.search?.addEventListener('input', async ()=>{
      const st2 = await loadState();
      renderList(els, st2);
    });

    // List actions
    els.list?.addEventListener('click', async (ev)=>{
      const btn = ev.target.closest('button');
      if(!btn) return;
      const row = ev.target.closest('[data-id]');
      if(!row) return;
      const id = row.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const st2 = await loadState();
      const c = (st2.clients||[]).find(x=>x.id===id);
      if(!c) return;
      if(action==='edit'){
        await selectClient(els, st2, id);
      }
      if(action==='delete'){
        await deleteClient(els, id);
      }
      if(action==='print'){
        await printCredentialFor(c.id, c.name);
      }
    });

    // Enable print when ID present
    els.id?.addEventListener('input', ()=>{
      els.btnPrint.disabled = !(els.id.value||'').trim();
    });

    // Photo preview
    els.photo?.addEventListener('change', ()=>{
      const f = els.photo.files?.[0];
      if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        if(els.photoPreview) els.photoPreview.innerHTML = `<img alt="foto" src="${r.result}" style="max-width:80px;max-height:80px;border-radius:10px;"/>`;
      };
      r.readAsDataURL(f);
    });
    els.photoClear?.addEventListener('click', async ()=>{
      // solo limpia preview y file input; la foto en registro se quita al guardar
      if(els.photo) els.photo.value='';
      if(els.photoPreview) els.photoPreview.innerHTML='';
    });

    clearForm(els);
  }

  // Arranca cuando el módulo ya está en el DOM
  boot();
})();
