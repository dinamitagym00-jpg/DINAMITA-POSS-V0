try{ dpEnsureSeedData(); }catch(e){ console.warn(e); }
try{ dpApplyTheme(); }catch(e){ console.warn(e); }
try{ dpRenderBranding(); }catch(e){ console.warn(e); }
/* Dinamita POS v0 - App Loader
   Versión: v0.1.1
   Fecha: 2025-12-15
   Cambio: CSS de módulos precargado (evita "brinco").
*/
const content = document.getElementById('content');

const menu = document.getElementById('menu');
const menuToggle = document.getElementById('dp-menuToggle');

function dpSetMenuCollapsed(collapsed){
  document.body.classList.toggle('dp-menu-collapsed', !!collapsed);
  try{ localStorage.setItem('dp_menu_collapsed', collapsed ? '1':'0'); }catch(e){}
  if(menuToggle){
    menuToggle.setAttribute('aria-label', collapsed ? 'Desplegar menú' : 'Plegar menú');
  }
}

(function initMenuToggle(){
  let collapsed = false;
  try{ collapsed = localStorage.getItem('dp_menu_collapsed') === '1'; }catch(e){}
  dpSetMenuCollapsed(collapsed);
  if(menuToggle){
    menuToggle.addEventListener('click', ()=> dpSetMenuCollapsed(!document.body.classList.contains('dp-menu-collapsed')));
  }
})();


function dpClearModuleAssets(){
  // Solo removemos JS de módulo (CSS ya viene precargado en index.html)
  document.querySelectorAll('script[data-dp-module-js]').forEach(el => el.remove());
}

async function loadModule(name){
  try{ if(window.dpStoreReady) await window.dpStoreReady; }catch(e){}
  dpClearModuleAssets();

  const html = await fetch(`modules/${name}/${name}.html`, { cache:"no-store" }).then(r=>r.text());
  content.innerHTML = html;
  document.querySelectorAll('#menu button[data-module]').forEach(x=>x.classList.toggle('active', x.dataset.module===name));

  const script = document.createElement('script');
  script.src = `modules/${name}/${name}.js`;
  script.setAttribute("data-dp-module-js","1");
  document.body.appendChild(script);
}

document.querySelectorAll('#menu button[data-module]').forEach(b=>{
  b.addEventListener('click', ()=>{
    // Modo Acceso: bloquea navegación (salvo Acceso) con PIN
    try{
      const accessMode = sessionStorage.getItem("dp_access_mode")==="1";
      const target = b.dataset.module;
      if(accessMode && target !== "acceso"){
        const st = (typeof dpGetState === "function") ? dpGetState() : {};
        const pin = String(st?.meta?.securityPin || "1234");
        const input = prompt("Modo Acceso activo. Ingresa PIN para navegar:");
        if(input !== pin) return;
      }
    }catch(e){}
    loadModule(b.dataset.module);
  });
});

loadModule('ventas');


// === Dinamita Helpers: impresión + QR (offline) ===
window.dpPrintHTML = function dpPrintHTML(html, title) {
  const iframeId = "dp-print-frame";
  let iframe = document.getElementById(iframeId);
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = iframeId;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  // Espera a que carguen fuentes/imágenes
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.document.title = title || "Imprimir";
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.warn("Print error:", e);
      }
    }, 150);
  };
};

window.dpMakeQrDataUrl = function dpMakeQrDataUrl(text, sizePx) {
  sizePx = sizePx || 180;
  return new Promise((resolve) => {
    try {
      const holder = document.createElement("div");
      holder.style.position = "fixed";
      holder.style.left = "-9999px";
      holder.style.top = "0";
      holder.style.width = sizePx + "px";
      holder.style.height = sizePx + "px";
      document.body.appendChild(holder);

      // QRCode library renders a canvas
      new QRCode(holder, {
        text: String(text || ""),
        width: sizePx,
        height: sizePx,
        correctLevel: QRCode.CorrectLevel.M,
        colorDark: "#000",
        colorLight: "#fff",
      });

      // allow paint
      requestAnimationFrame(() => {
        const canvas = holder.querySelector("canvas");
        const img = holder.querySelector("img");
        let dataUrl = "";
        if (canvas && canvas.toDataURL) dataUrl = canvas.toDataURL("image/png");
        else if (img && img.src) dataUrl = img.src;
        holder.remove();
        resolve(dataUrl);
      });
    } catch (e) {
      console.warn("QR error:", e);
      resolve("");
    }
  });
};

window.dpBuildCredencialHTML = function dpBuildCredencialHTML(nombreCompleto, qrDataUrl) {
  const safeName = (nombreCompleto || "Cliente").toString().replace(/[<>]/g, "");
  const img = qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" style="width:180px;height:180px;image-rendering:pixelated;border:2px solid #000;border-radius:10px;" />` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Credencial</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:10px;color:#000}
  .card{width:58mm;max-width:58mm;border:2px solid #000;border-radius:12px;padding:10px;box-sizing:border-box}
  .name{font-weight:900;font-size:14px;line-height:1.15;margin:0 0 10px 0;text-align:center;word-break:break-word}
  .qr{display:flex;justify-content:center;align-items:center}
  .note{margin-top:8px;text-align:center;font-size:10px;font-weight:700}
</style></head>
<body>
  <div class="card">
    <p class="name">${safeName}</p>
    <div class="qr">${img}</div>
  </div>
<script>setTimeout(()=>{try{window.focus();}catch(e){}},50);</script>
</body></html>`;
};
// === /helpers ===

