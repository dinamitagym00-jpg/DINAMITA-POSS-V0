/* Acceso - Dinamita POS v0 (IndexedDB local) */
(function(){
  const $ = (id)=>document.getElementById(id);
  const scan = $("a-scan");
  const status = $("a-status");
  const lastBox = $("a-last");
  const btnCheck = $("a-check");
  const btnRenew = $("a-renew");
  const btnPrint = $("a-print");
  const btnClear = $("a-clear");
  const apm = $("a-apm");
  const filter = $("a-filter");
  const btnExport = $("a-export");
  const tbody = $("a-table").querySelector("tbody");
  const btnMode = $("a-toggleMode");

  // --- helpers ---
  const fmtMoney = (n)=>"$" + (Number(n||0)).toFixed(2);
  const todayISO = ()=> new Date().toISOString().slice(0,10);
  const nowISO = ()=> new Date().toISOString();

  function state(){ return dpGetState(); }

  function getAccessSettings(){
    const st = state();
    st.meta = st.meta || {};
    st.meta.accessSettings = st.meta.accessSettings || { antiPassbackMinutes: 10 };
    return st.meta.accessSettings;
  }

  function setAccessSettings(patch){
    dpSetState(st=>{
      st.meta = st.meta || {};
      st.meta.accessSettings = st.meta.accessSettings || { antiPassbackMinutes: 10 };
      Object.assign(st.meta.accessSettings, patch||{});
      return st;
    });
  }

  function ensureAccessArrays(){
    dpSetState(st=>{
      if(!Array.isArray(st.accessLogs)) st.accessLogs = [];
      st.meta = st.meta || {};
      st.meta.accessSettings = st.meta.accessSettings || { antiPassbackMinutes: 10 };
      return st;
    });
  }

  function findClientByToken(token){
    const st = state();
    const t = String(token||"").trim();
    if(!t) return null;
    // 1) ID exacto (C001)
    const byId = (st.clients||[]).find(c=>String(c.id||"").toLowerCase()===t.toLowerCase());
    if(byId) return byId;

    // 2) si el QR trae prefijo, ej "DINAMITA:C001"
    const m = t.match(/(C\d{3})/i);
    if(m){
      const id = m[1].toUpperCase();
      const c = (st.clients||[]).find(x=>x.id===id);
      if(c) return c;
    }

    // 3) por nombre / teléfono
    const lower = t.toLowerCase();
    return (st.clients||[]).find(c=>
      String(c.name||"").toLowerCase().includes(lower) ||
      String(c.phone||"").replace(/\D/g,'').includes(lower.replace(/\D/g,''))
    ) || null;
  }

  function getMembershipStatus(clientId){
    const st = state();
    const list = (st.memberships||[]).filter(m=>m && m.clientId===clientId);
    if(list.length===0) return { status:"none", label:"Sin membresía", detail:"", color:"red" };

    const t = todayISO();
    // buscar una membresía activa hoy (start<=hoy<=end) con end más lejano
    const active = list
      .filter(m=> (m.start||"")<=t && (m.end||"")>=t)
      .sort((a,b)=> String(b.end||"").localeCompare(String(a.end||"")));
    const m = active[0] || list[0];

    const end = m.end || "";
    const start = m.start || "";
    if(end < t){
      return { status:"expired", label:"Vencida", detail:`Venció: ${end}`, color:"red", membership:m };
    }
    // days left
    const dEnd = new Date(end);
    const dNow = new Date(t);
    const diff = Math.ceil((dEnd - dNow)/(1000*60*60*24));
    if(diff <= 5){
      return { status:"warning", label:"Por vencer", detail:`Vence: ${end} (${diff} día(s))`, color:"orange", membership:m };
    }
    return { status:"active", label:"Activa", detail:`Vence: ${end}`, color:"green", membership:m };
  }

  function getLastAllowedAccess(clientId){
    const st = state();
    const logs = (st.accessLogs||[]).filter(x=>x && x.clientId===clientId && x.result==="allowed");
    if(logs.length===0) return null;
    return logs[0]; // unshift (más reciente)
  }

  function logAccess({clientId, clientName, result, detail, method="qr"}){
    dpSetState(st=>{
      st.accessLogs = st.accessLogs || [];
      const at = nowISO();
      st.accessLogs.unshift({
        id: dpId("A"),
        at,
        date: at.slice(0,10),
        time: at.slice(11,19),
        clientId: clientId || "",
        clientName: clientName || "",
        result,
        detail: detail || "",
        method
      });
      // recortar para evitar crecer infinito
      if(st.accessLogs.length > 5000) st.accessLogs.length = 5000;
      return st;
    });
  }

  function setStatus(kind, title, meta){
    status.classList.remove("dp-accessIdle","dp-accessOk","dp-accessWarn","dp-accessBad");
    if(kind==="ok") status.classList.add("dp-accessOk");
    else if(kind==="warn") status.classList.add("dp-accessWarn");
    else if(kind==="bad") status.classList.add("dp-accessBad");
    else status.classList.add("dp-accessIdle");
    status.querySelector(".dp-accessTitle")?.remove();
    status.querySelector(".dp-accessMeta")?.remove();
    const t = document.createElement("div");
    t.className="dp-accessTitle";
    t.textContent = title || "";
    const m = document.createElement("div");
    m.className="dp-accessMeta";
    m.textContent = meta || "";
    status.appendChild(t);
    status.appendChild(m);
  }

  function renderLast(info){
    const rows = [];
    const add = (k,v)=>rows.push(`<div class="dp-kvRow"><div class="dp-kvK">${k}</div><div class="dp-kvV">${v||""}</div></div>`);
    if(!info){ lastBox.innerHTML = '<div class="dp-hint">Aún no hay accesos.</div>'; return; }
    add("Cliente", `<b>${info.clientName}</b> (${info.clientId})`);
    add("Resultado", `<b>${info.result.toUpperCase()}</b>`);
    add("Detalle", info.detail || "");
    add("Fecha/Hora", `${info.date} ${info.time}`);
    lastBox.innerHTML = rows.join("");
  }

  function renderTable(){
    const st = state();
    const q = String(filter.value||"").trim().toLowerCase();
    const logs = (st.accessLogs||[]);
    const view = q ? logs.filter(x=>
      (x.clientName||"").toLowerCase().includes(q) ||
      (x.clientId||"").toLowerCase().includes(q) ||
      (x.result||"").toLowerCase().includes(q) ||
      (x.detail||"").toLowerCase().includes(q)
    ) : logs;

    tbody.innerHTML = view.slice(0,200).map(x=>{
      const badge = x.result==="allowed" ? "dp-badgeOk" : (x.result==="warning" ? "dp-badgeWarn" : "dp-badgeBad");
      const label = x.result==="allowed" ? "PERMITIDO" : (x.result==="warning" ? "AVISO" : "DENEGADO");
      return `<tr>
        <td>${x.date||""}</td>
        <td>${x.time||""}</td>
        <td><b>${escapeHtml(x.clientName||"")}</b><div class="dp-hint">${escapeHtml(x.clientId||"")}</div></td>
        <td><span class="dp-badge ${badge}">${label}</span></td>
        <td>${escapeHtml(x.detail||"")}</td>
      </tr>`;
    }).join("");
  }

  
  // Imprimir HTML sin popups (mejor en tablet/Android)
  function dpPrintInIframe(html){
    const iframe = document.createElement('iframe');
    iframe.style.position='fixed';
    iframe.style.right='0';
    iframe.style.bottom='0';
    iframe.style.width='0';
    iframe.style.height='0';
    iframe.style.border='0';
    iframe.style.opacity='0';
    iframe.setAttribute('aria-hidden','true');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(()=>{
      try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(e){}
      setTimeout(()=>{ try{ iframe.remove(); }catch(e){} }, 800);
    }, 350);
  }

  async function blobToDataUrl(blob){
    return await new Promise((resolve,reject)=>{
      const r = new FileReader();
      r.onload = ()=>resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function getQrDataUrl(text){
    const key = `qr:${text}`;
    try{
      const cached = await dpIdbGet(key);
      if(cached && typeof cached === 'string' && cached.startsWith('data:image')) return cached;
    }catch(e){}
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('QR gen fail');
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    try{ await dpIdbSet(key, dataUrl); }catch(e){}
    return dataUrl;
  }

function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function exportCSV(){
    const st = state();
    const rows = [["Fecha","Hora","Cliente","ID","Resultado","Detalle"]];
    (st.accessLogs||[]).forEach(x=>{
      rows.push([x.date||"", x.time||"", x.clientName||"", x.clientId||"", x.result||"", x.detail||""]);
    });
    const csv = rows.map(r=>r.map(v=>{
      const s = String(v??"");
      return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `accesos_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function validate(){
    const token = String(scan.value||"").trim();
    if(!token){ setStatus("bad","Sin dato","Escanea un código o escribe un nombre/ID."); return; }

    const client = findClientByToken(token);
    if(!client){
      setStatus("bad","No encontrado","No existe cliente con ese dato.");
      btnRenew.disabled = true;
      btnPrint.disabled = true;
      logAccess({ clientId:"", clientName:"", result:"denied", detail:`No encontrado (${token})` });
      renderAfterLog();
      return;
    }

    const settings = getAccessSettings();
    const mins = Number(settings.antiPassbackMinutes||0);
    const lastAllowed = getLastAllowedAccess(client.id);
    if(mins>0 && lastAllowed){
      const lastAt = new Date(lastAllowed.at);
      const now = new Date();
      const diffMin = (now - lastAt) / (1000*60);
      if(diffMin < mins){
        const left = Math.ceil(mins - diffMin);
        setStatus("bad","Anti-passback","Entrada repetida. Espera " + left + " min.");
        btnRenew.disabled = false; // puede renovar aunque sea passback
        btnPrint.disabled = false;
        logAccess({ clientId: client.id, clientName: client.name, result:"denied", detail:`Anti-passback (${Math.round(diffMin)} min)` });
        renderAfterLog();
        return;
      }
    }

    const ms = getMembershipStatus(client.id);
    if(ms.status==="active"){
      setStatus("ok","Acceso permitido", `${client.name} • ${ms.detail}`);
      logAccess({ clientId: client.id, clientName: client.name, result:"allowed", detail:`${ms.label} • ${ms.detail}` });
      btnRenew.disabled = false;
      btnPrint.disabled = false;
    }else if(ms.status==="warning"){
      setStatus("warn","Acceso permitido (por vencer)", `${client.name} • ${ms.detail}`);
      logAccess({ clientId: client.id, clientName: client.name, result:"warning", detail:`${ms.label} • ${ms.detail}` });
      btnRenew.disabled = false;
      btnPrint.disabled = false;
    }else{
      setStatus("bad","Acceso denegado", `${client.name} • ${ms.detail || ms.label}`);
      logAccess({ clientId: client.id, clientName: client.name, result:"denied", detail:`${ms.label} • ${ms.detail}` });
      btnRenew.disabled = false;
      btnPrint.disabled = false;
    }

    // Guardar para renovar/credencial
    sessionStorage.setItem("dp_prefill_client_id", client.id);
    renderAfterLog();
  }

  function renderAfterLog(){
    const st = state();
    const last = (st.accessLogs||[])[0] || null;
    renderLast(last);
    renderTable();
  }

  // --- modo acceso (bloqueo de navegación) ---
  function isAccessMode(){
    return sessionStorage.getItem("dp_access_mode")==="1";
  }
  function setAccessMode(on){
    sessionStorage.setItem("dp_access_mode", on ? "1":"0");
    document.body.classList.toggle("dp-accessMode", !!on);
    btnMode.textContent = on ? "Modo Acceso: ON" : "Modo Acceso: OFF";
  }

  function requirePin(){
    // Reutiliza PIN de configuración si existe, sino "1234"
    const st = state();
    const pin = String(st.meta?.securityPin || "1234");
    const input = prompt("PIN para salir/entrar a Modo Acceso:");
    return input === pin;
  }

  function init(){
    ensureAccessArrays();

    const s = getAccessSettings();
    apm.value = String(Number(s.antiPassbackMinutes ?? 10));

    // Focus listo para lector
    setTimeout(()=>scan.focus(), 150);

    // Enter dispara
    scan.addEventListener("keydown", (e)=>{
      if(e.key==="Enter"){
        e.preventDefault();
        validate();
      }
    });

    btnCheck.addEventListener("click", validate);

    btnClear.addEventListener("click", ()=>{
      scan.value="";
      scan.focus();
      btnRenew.disabled = true;
      btnPrint.disabled = true;
      setStatus("idle","Listo para escanear","Escanea un código o escribe un nombre/ID.");
    });

    apm.addEventListener("change", ()=>{
      const v = Math.max(0, Math.floor(Number(apm.value||0)));
      apm.value = String(v);
      setAccessSettings({ antiPassbackMinutes: v });
    });

    filter.addEventListener("input", renderTable);
    btnExport.addEventListener("click", exportCSV);

    btnRenew.addEventListener("click", ()=>{
      const id = sessionStorage.getItem("dp_prefill_client_id") || "";
      if(!id) return;
      // Navega a Membresías y precarga cliente (requiere pequeño hook en módulo membresías)
      try{ sessionStorage.setItem("dp_prefill_client_id", id); }catch(e){}
      const btn = document.querySelector('#menu button[data-module="membresias"]');
      if(btn) btn.click();
    });

    btnPrint.addEventListener("click", ()=>{
      const id = sessionStorage.getItem("dp_prefill_client_id") || "";
      if(!id) return;
      printCredential(id);
    });

    btnMode.addEventListener("click", ()=>{
      const on = isAccessMode();
      if(!on){
        if(requirePin()) setAccessMode(true);
      }else{
        if(requirePin()) setAccessMode(false);
      }
    });

    // aplicar modo acceso si ya estaba
    setAccessMode(isAccessMode());

    // Render inicial
    renderAfterLog();
  }

  async function printCredential(clientId){
    const c = dpClientsGetById(clientId);
    if(!c){ alert("Cliente no encontrado."); return; }

    let qrDataUrl = '';
    try{
      qrDataUrl = await getQrDataUrl(`DINAMITA:${clientId}`);
    }catch(e){
      alert("No se pudo generar el QR. Verifica internet la primera vez (después queda guardado).");
      return;
    }

    const safeName = escapeHtml((c.name||'').trim());
    const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Credencial</title>
<style>
  @page{ size:58mm auto; margin:0; }
  html,body{ margin:0; padding:0; }
  body{
    width:58mm;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-weight:700;
    color:#000;
  }
  .wrap{ padding:6mm 3mm 5mm; text-align:center; }
  .name{ font-size:15px; line-height:1.15; margin:0 0 5mm; word-break:break-word; }
  .qr{ width:34mm; height:34mm; margin:0 auto; }
  .qr img{ width:100%; height:100%; image-rendering: pixelated; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="name">${safeName}</div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>
  </div>
</body></html>`;
    dpPrintInIframe(html);
  }


  init();
})();