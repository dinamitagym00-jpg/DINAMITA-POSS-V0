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
    loadModule(b.dataset.module);
  });
});

loadModule('ventas');
