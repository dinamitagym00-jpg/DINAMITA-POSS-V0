/* Clientes - Dinamita POS v0 */
(function(){
  const $ = (id)=>document.getElementById(id);

  const form = $("c-form");
  const mode = $("c-mode");
  const status = $("c-status");

  const id = $("c-id");
  const idView = $("c-idView");
  const name = $("c-name");
  const phone = $("c-phone");
  const address = $("c-address");
  const notes = $("c-notes");

  const photo = $("c-photo");
  const photoPrev = $("c-photoPrev");
  const photoClear = $("c-photoClear");
  let photoData = "";

  const clearBtn = $("c-clear");
  const search = $("c-search");
  const list = $("c-list");
  const empty = $("c-empty");

  const exportCsvBtn = $("c-exportCsv");
  const exportPdfBtn = $("c-exportPdf");
  const printQrBtn = $("c-printQr");

  function st(){ return dpGetState(); }
  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function setModeEdit(client){
    id.value = client.id;
    idView.value = client.id;
    name.value = client.name || "";
    phone.value = client.phone || "";
    address.value = client.address || "";
    notes.value = client.notes || "";
    photoData = client.photo || "";
    syncPhotoPreview();
    mode.textContent = "Modo: Editar";
    status.textContent = "";
    if(printQrBtn) printQrBtn.disabled = false;
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function reset(){
    id.value = "";
    idView.value = "";
    name.value = "";
    phone.value = "";
    address.value = "";
    notes.value = "";
    photo.value = "";
    photoData = "";
    syncPhotoPreview();
    mode.textContent = "Modo: Nuevo";
    status.textContent = "";
    if(printQrBtn) printQrBtn.disabled = true;
  }

  function syncPhotoPreview(){
    if(photoData){
      photoPrev.src = photoData;
      photoPrev.style.display = "block";
      photoClear.style.display = "inline-flex";
    }else{
      photoPrev.src = "";
      photoPrev.style.display = "none";
      photoClear.style.display = "none";
    }
  }

  function readFileAsDataURL(file){
    return new Promise((resolve, reject)=>{
      const r = new FileReader();
      r.onload = ()=>resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function onPhotoChange(){
    const f = photo.files && photo.files[0];
    if(!f) return;
    // limit ~300kb by resizing if needed? (simple: keep as is, but warn)
    const data = await readFileAsDataURL(f);
    photoData = data;
    syncPhotoPreview();
  }

  function getFiltered(){
    const q = (search.value||"").trim().toLowerCase();
    let clients = (st().clients||[]);
    if(!q) return clients;
    return clients.filter(c=>{
      const hay = `${(c.id||"").toLowerCase()} ${(c.name||"").toLowerCase()} ${(c.phone||"").toLowerCase()}`;
      return hay.includes(q);
    });
  }

  function render(){
    const clients = getFiltered();
    list.innerHTML = "";
    if(!clients.length){
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    clients.slice(0, 600).forEach(c=>{
      const row = document.createElement("div");
      row.className = "crow";
      const img = document.createElement("img");
      img.className = "cavatar";
      img.alt = "Foto";
      img.src = c.photo || "";
      if(!c.photo) img.style.visibility = "hidden";

      const main = document.createElement("div");
      main.className = "cmain";
      main.innerHTML = `
        <div class="ctitle">${escapeHtml(c.name || "(Sin nombre)")}</div>
        <div class="cmeta">
          <span class="pill">ID: ${escapeHtml(c.id||"")}</span>
          ${c.phone ? `<span class="pill">Tel: ${escapeHtml(c.phone)}</span>` : ""}
          ${c.address ? `<span class="pill">${escapeHtml(c.address)}</span>` : ""}
        </div>
        ${c.notes ? `<div class="cnotes"><strong>Nota:</strong> ${escapeHtml(c.notes)}</div>` : ""}
      `;

      const actions = document.createElement("div");
      actions.className = "cactions";

      const edit = document.createElement("button");
      edit.className = "btn btn--ghost";
      edit.type = "button";
      edit.textContent = "Editar";
      edit.onclick = ()=> setModeEdit(c);

      const del = document.createElement("button");
      del.className = "btn";
      del.type = "button";
      del.textContent = "Borrar";
      del.onclick = ()=>{
        const check = dpCanDeleteClient(c.id);
        if(!check.ok){
          alert(check.reason);
          return;
        }
        if(!confirm(`¿Borrar cliente "${c.name}" (${c.id})?`)) return;
        const res = dpDeleteClient(c.id);
        if(!res.ok){
          alert(res.reason);
        }else{
          render();
          reset();
        }
      };

      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(img);
      row.appendChild(main);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function save(e){
    e.preventDefault();
    const n = (name.value||"").trim();
    if(!n){
      status.textContent = "Nombre requerido.";
      return;
    }
    if(id.value){
      dpUpdateClient(id.value, {
        name: n,
        phone: (phone.value||"").trim(),
        address: (address.value||"").trim(),
        notes: (notes.value||"").trim(),
        photo: photoData
      });
      status.textContent = "Cliente actualizado.";
    }else{
      dpAddClient({
        name: n,
        phone: (phone.value||"").trim(),
        address: (address.value||"").trim(),
        notes: (notes.value||"").trim(),
        photo: photoData
      });
      status.textContent = "Cliente agregado.";
    }
    render();
    reset();
  }

  function exportCsv(){
    const clients = getFiltered();
    const rows = [["id","name","phone","address","notes"]];
    clients.forEach(c=>{
      rows.push([c.id, c.name, c.phone||"", c.address||"", (c.notes||"").replaceAll("\n"," ")]);
    });
    const csv = rows.map(r=>r.map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clientes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPdf(){
    const clients = getFiltered();
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Clientes</title>
<style>
  body{ font-family: Arial, sans-serif; padding:16px; }
  h1{ margin:0 0 10px 0; }
  .item{ border:1px solid #ddd; border-radius:10px; padding:10px; margin-bottom:10px; }
  .meta{ font-size:12px; color:#444; margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; }
  .pill{ border:1px solid #ddd; border-radius:999px; padding:2px 8px; }
</style>
</head>
<body>
<h1>Clientes</h1>
${clients.map(c=>`
  <div class="item">
    <strong>${escapeHtml(c.name||"")}</strong>
    <div class="meta">
      <span class="pill">ID: ${escapeHtml(c.id||"")}</span>
      ${c.phone?`<span class="pill">Tel: ${escapeHtml(c.phone)}</span>`:""}
      ${c.address?`<span class="pill">${escapeHtml(c.address)}</span>`:""}
    </div>
    ${c.notes?`<div class="meta"><span class="pill">Nota: ${escapeHtml(c.notes)}</span></div>`:""}
  </div>
`).join("")}
<script>window.focus();</script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if(!w){ alert("Tu navegador bloqueó la ventana emergente."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  
  // Imprimir HTML sin popups (compatible con tablet)
  function dpPrintInIframe(html){
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden','true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = ()=>{
      try{
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }catch(e){}
      setTimeout(()=>{ try{ iframe.remove(); }catch(e){} }, 800);
    };

    // Espera un poco por imágenes (QR)
    setTimeout(doPrint, 350);
  }

// --- Credencial con QR (impresión 58mm) ---
  async async function getQrDataUrl(text){
    const key = `qr:${text}`;
    // 1) cache en IndexedDB
    try{
      const cached = await dpIdbGet(key);
      if(cached && typeof cached === 'string' && cached.startsWith('data:image')) return cached;
    }catch(e){}

    // 2) generar por primera vez usando servicio QR (requiere internet). Luego queda guardado.
    // (Elegimos qrserver porque devuelve imagen PNG simple.)
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('No se pudo generar el QR (sin internet o bloqueado).');
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    try{ await dpIdbSet(key, dataUrl); }catch(e){}
    return dataUrl;
  }

  function blobToDataUrl(blob){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve(fr.result);
      fr.onerror = ()=>reject(fr.error||new Error('FileReader error'));
      fr.readAsDataURL(blob);
    });
  }

  async async function printQrCredential(){
    const id = (idInput.value||'').trim();
    if(!id){
      alert('Primero selecciona un cliente (o captura su ID) para imprimir la credencial.');
      return;
    }
    const c = dpClientsGetById(id);
    if(!c){
      alert('Cliente no encontrado.');
      return;
    }

    let qrDataUrl = '';
    try{
      qrDataUrl = await getQrDataUrl(`DINAMITA:${id}`);
    }catch(err){
      alert('No se pudo generar el QR. Verifica internet la primera vez (después queda guardado).');
      return;
    }

    const safeName = escapeHtml((c.name||'').trim());
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Credencial</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    html,body{ margin:0; padding:0; }
    body{
      width:58mm;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-weight: 700;
      color:#000;
    }
    .wrap{ padding: 6mm 3mm 5mm; text-align:center; }
    .name{ font-size: 15px; line-height: 1.15; margin: 0 0 5mm; word-break: break-word; }
    .qr{ width: 34mm; height: 34mm; margin: 0 auto; }
    .qr img{ width:100%; height:100%; image-rendering: pixelated; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="name">${safeName}</div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>
  </div>
</body>
</html>`;
    dpPrintInIframe(html);
  }

    const c = dpClientsGetById(id);
    if(!c){
      alert('Cliente no encontrado.');
      return;
    }
    let qrDataUrl = '';
    try{
      qrDataUrl = await getQrDataUrl(id);
    }catch(err){
      alert(String(err && err.message ? err.message : err));
      return;
    }

    const gym = dpGetCfg('businessName') || 'Dinamita Gym';
    const wa = dpGetCfg('whatsapp') || '56 4319 5153';

    const safeName = escapeHtml(c.name||'');
    const safeId = escapeHtml(c.id||'');
    const headerSmall = (c.phone||c.email||'').trim();

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Credencial</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    html,body{ margin:0; padding:0; }
    body{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          width:58mm; }
    .t{ padding: 6mm 3mm 4mm; }
    .center{ text-align:center; }
    .h1{ font-size: 13px; font-weight:700; letter-spacing:0.4px; }
    .muted{ font-size: 10px; opacity:0.8; }
    .name{ font-size: 16px; font-weight:800; margin-top: 6px; }
    .id{ font-size: 22px; font-weight:900; letter-spacing:1px; margin: 4px 0 0; }
    .box{ border: 2px dashed #333; border-radius:10px; padding: 6px 0 8px; margin: 8px 0 6px; }
    img.qr{ width: 40mm; height: 40mm; image-rendering: pixelated; }
    .foot{ margin-top: 4px; font-size: 12px; font-weight:700; }
    .hr{ border-top: 1px dashed #888; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="t">
    <div class="center">
      <div class="h1">${escapeHtml(gym)}</div>
      ${headerSmall?`<div class="muted">${escapeHtml(headerSmall)}</div>`:''}
      <div class="hr"></div>
      <div class="name">${safeName}</div>
      <div class="muted">ID</div>
      <div class="id">${safeId}</div>
      <div class="box">
        <div class="muted" style="margin-bottom:4px;">Escanea este QR</div>
        <img class="qr" src="${qrDataUrl}" alt="QR" />
      </div>
      <div class="muted">WhatsApp</div>
      <div class="foot">${escapeHtml(wa)}</div>
    </div>
  </div>
</body>
</html>`;

    dpPrintHTML(html);
  }

  // Impresión robusta (Android/Tablet): imprime el HTML en un iframe oculto
  function dpPrintHTML(html){
    try{
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden','true');
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      const doPrint = ()=>{
        try{
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }finally{
          setTimeout(()=>{ try{ document.body.removeChild(iframe); }catch(e){} }, 1200);
        }
      };

      // espera imágenes
      const imgs = doc.images ? Array.from(doc.images) : [];
      if(imgs.length===0){
        setTimeout(doPrint, 250);
        return;
      }
      let pending = imgs.length;
      const done = ()=>{ pending--; if(pending<=0) setTimeout(doPrint, 150); };
      imgs.forEach(img=>{
        if(img.complete) return done();
        img.addEventListener('load', done, {once:true});
        img.addEventListener('error', done, {once:true});
      });
    }catch(err){
      alert('No se pudo imprimir: ' + (err?.message||err));
    }
  }

  // events
  form.addEventListener("submit", save);
  photo.addEventListener("change", onPhotoChange);
  photoClear.addEventListener("click", ()=>{ photoData=""; syncPhotoPreview(); });
  clearBtn.addEventListener("click", ()=>{ reset(); render(); });
  search.addEventListener("input", render);
  exportCsvBtn.addEventListener("click", exportCsv);
  exportPdfBtn.addEventListener("click", exportPdf);
  printQrBtn.addEventListener("click", printQrCredential);

  // init
  try{ dpEnsureSeedData(); }catch(e){}
  syncPhotoPreview();
  render();
  reset();
})();
