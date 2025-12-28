/* Dinamita POS v0 - Acceso (IndexedDB state)
   - Fix: JS roto (async async)
   - Renderiza historial (st.accessLog)
   - Validación por QR/ID/Nombre + anti-passback
   - Imprimir credencial 58mm: Nombre + ID + QR (sin WhatsApp)
*/

(function(){
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function fmtDateTime(ts){
    try{
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}:${ss}` };
    }catch{ return { date:'', time:'' }; }
  }

  function safeText(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function normalizeScan(input){
    const s = String(input||'').trim();
    // si viene un URL tipo ...?c=C001, tomar la parte final
    const m = s.match(/\b(C\d{3,})\b/i);
    if(m) return m[1].toUpperCase();
    return s;
  }

  async function getQrDataUrl(text){
    const payload = String(text||'').trim();
    if(!payload) return null;
    try{
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=2&data=${encodeURIComponent(payload)}&t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('qr fetch');
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('read')); 
        r.readAsDataURL(blob);
      });
      return dataUrl;
    }catch(e){
      return null;
    }
  }

  function buildPrintHtml({ gymName='Dinamita Gym', fullName, code, qrDataUrl }){
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Credencial</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    html, body { margin:0; padding:0; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; }
    .wrap { width: 58mm; padding: 6mm 4mm; }
    .center { text-align:center; }
    .title { font-weight: 700; font-size: 16px; }
    .name { font-weight: 800; font-size: 18px; margin-top: 8px; }
    .code { font-weight: 800; font-size: 22px; letter-spacing: 1px; margin-top: 6px; }
    .qr { margin: 10px 0 0; }
    .qr img { width: 34mm; height: 34mm; image-rendering: pixelated; }
    .muted { color: #444; font-size: 11px; }
    .hr { border-top: 1px dashed #777; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center title">${safeText(gymName)}</div>
    <div class="hr"></div>
    <div class="center name">${safeText(fullName || '')}</div>
    <div class="center code">${safeText(code || '')}</div>
    <div class="center qr">
      ${qrDataUrl ? `<img alt="QR" src="${qrDataUrl}" />` : `<div class="muted">(QR sin conexión)</div>`}
    </div>
    <div class="center muted" style="margin-top:8px;">Escanea para acceso</div>
  </div>
</body>
</html>`;
  }

  async function printCredentialForClient(client){
    const fullName = client?.name || client?.nombre || '';
    const code = client?.id || client?.codigo || '';
    if(!fullName || !code){
      alert('Primero selecciona / valida un cliente.');
      return;
    }
    const qr = await getQrDataUrl(code);
    const html = buildPrintHtml({ fullName, code, qrDataUrl: qr });
    const w = window.open('', '_blank');
    if(!w){
      alert('Tu navegador bloqueó la ventana de impresión. Permite popups para imprimir.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // dar tiempo a cargar imagen
    setTimeout(() => {
      try{ w.focus(); w.print(); }catch(e){}
    }, 300);
  }

  function findClient(st, scan){
    const q = String(scan||'').trim().toLowerCase();
    if(!q) return null;
    const clients = Array.isArray(st.clients) ? st.clients : [];
    // match exact ID
    let c = clients.find(x => String(x.id||'').toLowerCase() === q);
    if(c) return c;
    // match name contains
    c = clients.find(x => String(x.name||'').toLowerCase().includes(q));
    return c || null;
  }

  function getActiveMembershipForClient(st, clientId){
    const mems = Array.isArray(st.memberships) ? st.memberships : [];
    // membership is active if status === 'ACTIVE' and endDate >= today
    const now = Date.now();
    const byClient = mems
      .filter(m => String(m.clientId||m.clienteId||'') === String(clientId||''))
      .map(m => {
        const end = m.endDate || m.fechaFin || m.vencimiento || m.expiresAt;
        const endTs = end ? new Date(end).getTime() : NaN;
        return { m, endTs };
      })
      .filter(x => !Number.isNaN(x.endTs))
      .sort((a,b) => b.endTs - a.endTs);

    const cand = byClient[0]?.m || null;
    if(!cand) return null;
    const endTs = byClient[0].endTs;
    if(endTs < now) return null;
    // status puede variar
    const status = String(cand.status||cand.estado||'ACTIVE').toUpperCase();
    if(status === 'CANCELLED' || status === 'CANCELED') return null;
    return { membership: cand, endTs };
  }

  function lastAllowedWithin(st, clientId, minutes){
    const log = Array.isArray(st.accessLog) ? st.accessLog : [];
    const ms = Math.max(0, Number(minutes||0)) * 60 * 1000;
    if(ms <= 0) return null;
    const now = Date.now();
    const last = [...log]
      .reverse()
      .find(r => String(r.clientId||'') === String(clientId||'') && String(r.result||'') === 'ALLOWED');
    if(!last) return null;
    const ts = Number(last.ts || last.timestamp || 0);
    if(!ts) return null;
    return (now - ts) < ms ? last : null;
  }

  function setStatus({ title, subtitle, badgeClass }){
    const card = $('#access-status');
    const h = $('#access-status-title');
    const p = $('#access-status-sub');
    if(!card || !h || !p) return;
    card.className = `dp-card status ${badgeClass||''}`.trim();
    h.textContent = title || '';
    p.textContent = subtitle || '';
  }

  function renderLastAccess(st){
    const box = $('#last-access');
    if(!box) return;
    const log = Array.isArray(st.accessLog) ? st.accessLog : [];
    const last = log[log.length-1];
    if(!last){
      box.innerHTML = '<div class="muted">Sin registros aún.</div>';
      return;
    }
    const dt = fmtDateTime(last.ts || last.timestamp || Date.now());
    box.innerHTML = `
      <div><b>Cliente</b>: ${safeText(last.clientName||'')}</div>
      <div><b>Resultado</b>: ${safeText(last.result||'')}</div>
      <div><b>Detalle</b>: ${safeText(last.detail||'')}</div>
      <div><b>Fecha/Hora</b>: ${safeText(dt.date)} ${safeText(dt.time)}</div>
    `;
  }

  function renderLogTable(st){
    const tbody = $('#access-log-body');
    if(!tbody) return;
    const q = String($('#access-search')?.value || '').trim().toLowerCase();
    const log = Array.isArray(st.accessLog) ? st.accessLog : [];
    const rows = log
      .slice()
      .reverse()
      .filter(r => {
        if(!q) return true;
        const blob = `${r.clientName||''} ${r.clientId||''} ${r.result||''} ${r.detail||''}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 50);

    tbody.innerHTML = rows.map(r => {
      const dt = fmtDateTime(r.ts || r.timestamp || Date.now());
      const badge = String(r.result||'') === 'ALLOWED' ? 'badge ok' : 'badge bad';
      const label = String(r.result||'') === 'ALLOWED' ? 'PERMITIDO' : 'DENEGADO';
      return `
        <tr>
          <td>${safeText(dt.date)}</td>
          <td>${safeText(dt.time)}</td>
          <td><b>${safeText(r.clientName||'')}</b><div class="muted">${safeText(r.clientId||'')}</div></td>
          <td><span class="${badge}">${label}</span></td>
          <td class="muted">${safeText(r.detail||'')}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5" class="muted">Sin registros.</td></tr>';
  }

  function exportCsv(st){
    const log = Array.isArray(st.accessLog) ? st.accessLog : [];
    const header = ['Fecha','Hora','Cliente','ID','Resultado','Detalle'];
    const lines = [header.join(',')];
    for(const r of log){
      const dt = fmtDateTime(r.ts || r.timestamp || Date.now());
      const row = [dt.date, dt.time, (r.clientName||''), (r.clientId||''), (r.result||''), (r.detail||'')]
        .map(v => `"${String(v).replace(/"/g,'""')}"`)
        .join(',');
      lines.push(row);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accesos_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  function toggleReceptionMode(on){
    const btn = $('#access-mode-btn');
    if(!btn) return;
    btn.textContent = on ? 'Modo Acceso: ON' : 'Modo Acceso: OFF';
    btn.classList.toggle('on', !!on);
    // en modo ON, enfocamos input para escáner
    if(on){
      setTimeout(() => $('#scan-input')?.focus(), 50);
    }
  }

  async function validateScan(){
    const input = $('#scan-input');
    const ap = $('#anti-passback');
    const scanRaw = input?.value || '';
    const scan = normalizeScan(scanRaw);
    if(!scan){
      alert('Escanea o escribe un ID / Nombre');
      return;
    }

    const st = await dpGetState();
    const client = findClient(st, scan);
    let result = 'DENIED';
    let detail = '';
    let badgeClass = 'bad';

    if(!client){
      detail = `No encontrado (${scan})`;
      setStatus({ title: 'Acceso denegado', subtitle: detail, badgeClass });
    } else {
      const apMin = Number(ap?.value || 0);
      const lastAp = lastAllowedWithin(st, client.id, apMin);
      if(lastAp){
        detail = `Anti-passback (${apMin} min)`;
        setStatus({ title: 'Acceso denegado', subtitle: detail, badgeClass });
      } else {
        const mem = getActiveMembershipForClient(st, client.id);
        if(!mem){
          detail = 'Sin membresía vigente';
          setStatus({ title: 'Acceso denegado', subtitle: detail, badgeClass });
        } else {
          result = 'ALLOWED';
          badgeClass = 'ok';
          const venc = new Date(mem.endTs);
          const vencStr = `${venc.getFullYear()}-${String(venc.getMonth()+1).padStart(2,'0')}-${String(venc.getDate()).padStart(2,'0')}`;
          detail = `Activa · Vence: ${vencStr}`;
          setStatus({ title: 'Acceso permitido', subtitle: `${client.name} · ${detail}`, badgeClass });
        }
      }

      // habilitar impresión
      const pbtn = $('#print-cred');
      if(pbtn) pbtn.disabled = false;
      // guardar el cliente seleccionado en dataset
      const box = $('#access-root');
      if(box) box.dataset.lastClientId = String(client.id);
    }

    // registrar en log
    const entry = {
      ts: Date.now(),
      clientId: client ? client.id : '',
      clientName: client ? client.name : '',
      result,
      detail
    };

    const next = structuredClone(st);
    next.accessLog = Array.isArray(next.accessLog) ? next.accessLog : [];
    next.accessLog.push(entry);
    await dpSetState(next);

    // UI
    const newSt = await dpGetState();
    renderLastAccess(newSt);
    renderLogTable(newSt);
    if(input) input.value = '';
    if($('#access-mode-btn')?.classList.contains('on')){
      input?.focus();
    }
  }

  async function printFromAccess(){
    const root = $('#access-root');
    const clientId = root?.dataset.lastClientId || '';
    if(!clientId){
      alert('Primero valida un cliente para poder imprimir.');
      return;
    }
    const st = await dpGetState();
    const client = (Array.isArray(st.clients) ? st.clients : []).find(c => String(c.id) === String(clientId));
    if(!client){
      alert('No se encontró el cliente en la lista.');
      return;
    }
    await printCredentialForClient(client);
  }

  async function init(){
    const root = $('#access-root');
    if(!root) return;

    const st = await dpGetState();
    renderLastAccess(st);
    renderLogTable(st);

    // eventos
    $('#validate-btn')?.addEventListener('click', validateScan);
    $('#scan-input')?.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        e.preventDefault();
        validateScan();
      }
    });
    $('#clear-btn')?.addEventListener('click', async () => {
      const st2 = await dpGetState();
      // no borramos log automáticamente, solo limpia UI
      $('#scan-input').value = '';
      setStatus({ title: 'Listo para escanear', subtitle: 'Laptop: ideal para recepción · Tablet: también funciona', badgeClass: '' });
      renderLastAccess(st2);
      renderLogTable(st2);
    });
    $('#access-search')?.addEventListener('input', async () => {
      const st3 = await dpGetState();
      renderLogTable(st3);
    });
    $('#export-csv')?.addEventListener('click', async () => {
      const st4 = await dpGetState();
      exportCsv(st4);
    });
    $('#print-cred')?.addEventListener('click', printFromAccess);

    // modo acceso
    const modeBtn = $('#access-mode-btn');
    if(modeBtn){
      modeBtn.addEventListener('click', () => {
        modeBtn.classList.toggle('on');
        toggleReceptionMode(modeBtn.classList.contains('on'));
      });
      toggleReceptionMode(modeBtn.classList.contains('on'));
    }

    // estado inicial
    setStatus({ title: 'Listo para escanear', subtitle: 'Laptop: ideal para recepción · Tablet: también funciona', badgeClass: '' });
    $('#print-cred') && ($('#print-cred').disabled = true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
