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

  function printCredential(clientId){
    const st = state();
    const c = (st.clients||[]).find(x=>x.id===clientId);
    if(!c) return;

    const cfg = (st.meta||{}).business || {};
    const name = cfg.name || "Dinamita Gym";
    const qrText = (c.id || "").trim();

    // Credencial térmica 58mm: nombre + ID + QR (sin WhatsApp por privacidad)
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Credencial</title>
      <style>
        body{font-family:system-ui,Arial;margin:0;padding:8px;font-weight:800}
        .card{border:2px solid #000;border-radius:12px;padding:10px;max-width:360px}
        .brand{display:flex;align-items:center;gap:10px;margin-bottom:10px}
        .logo{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid #000}
        h1{font-size:16px;margin:0}
        .sub{font-size:12px;opacity:.85;font-weight:900}
        .row{margin-top:10px}
        .lbl{font-size:12px;opacity:.9;font-weight:900}
        .val{font-size:18px;font-weight:900}
        .qr{margin-top:10px;border:2px dashed #000;border-radius:12px;padding:10px;text-align:center}
        #qrCanvas{display:block;margin:0 auto;image-rendering:pixelated}
        .qr .code{font-size:20px;font-weight:900;letter-spacing:1px;margin-top:6px}
        @media print{
          @page{ size:58mm auto; margin:0; }
          body{padding:0}
          .card{border:none;border-radius:0;max-width:58mm}
        }
      </style>
    </head><body>
      <div class="card">
        <div class="brand">
          ${(cfg.logoData ? `<img class="logo" src="${cfg.logoData}" />` : `<div class="logo" style="display:flex;align-items:center;justify-content:center;font-weight:900;">DG</div>`)}
          <div>
            <h1>${escapeHtml(name)}</h1>
            <div class="sub">Credencial de socio</div>
          </div>
        </div>

        <div class="row"><div class="lbl">Nombre</div><div class="val">${escapeHtml(c.name||"")}</div></div>
        <div class="row"><div class="lbl">ID</div><div class="val">${escapeHtml(c.id||"")}</div></div>

        <div class="qr">
          <div class="lbl">Escanea este código</div>
          <canvas id="qrCanvas" width="220" height="220"></canvas>
          <div class="code">${escapeHtml(c.id||"")}</div>
        </div>
      </div>
      <script>
        // QR generator (small embedded)
        (function(){
          function qrcode(typeNumber, errorCorrectionLevel){
            var PAD0=0xEC, PAD1=0x11;
            var _typeNumber=typeNumber;
            var _errorCorrectionLevel=QRErrorCorrectionLevel[errorCorrectionLevel];
            var _modules=null;
            var _moduleCount=0;
            var _dataCache=null;
            var _dataList=[];
            var _this={
              addData:function(data){
                var newData=new QR8bitByte(data);
                _dataList.push(newData);
                _dataCache=null;
              },
              isDark:function(row,col){
                if(_modules[row][col]!=null){return _modules[row][col];}
                return false;
              },
              getModuleCount:function(){return _moduleCount;},
              make:function(){
                if(_typeNumber<1){
                  var typeNumber=1;
                  for(;typeNumber<40;typeNumber++){
                    var rsBlocks=QRRSBlock.getRSBlocks(typeNumber,_errorCorrectionLevel);
                    var buffer=new QRBitBuffer();
                    var totalDataCount=0;
                    for(var i=0;i<rsBlocks.length;i++){totalDataCount+=rsBlocks[i].dataCount;}
                    for(var i=0;i<_dataList.length;i++){
                      var data=_dataList[i];
                      buffer.put(data.getMode(),4);
                      buffer.put(data.getLength(),QRUtil.getLengthInBits(data.getMode(),typeNumber));
                      data.write(buffer);
                    }
                    if(buffer.getLengthInBits()<=totalDataCount*8){break;}
                  }
                  _typeNumber=typeNumber;
                }
                makeImpl(false,getBestMaskPattern());
              },
              createDataURL:function(cellSize,margin){
                cellSize=cellSize||2; margin=margin==null?2:margin;
                var size=_this.getModuleCount()*cellSize+margin*2;
                var canvas=document.createElement('canvas');
                canvas.width=canvas.height=size;
                var ctx=canvas.getContext('2d');
                ctx.fillStyle='#fff'; ctx.fillRect(0,0,size,size);
                ctx.fillStyle='#000';
                for(var r=0;r<_this.getModuleCount();r++){
                  for(var c=0;c<_this.getModuleCount();c++){
                    if(_this.isDark(r,c)){
                      ctx.fillRect(margin+c*cellSize,margin+r*cellSize,cellSize,cellSize);
                    }
                  }
                }
                return canvas.toDataURL('image/png');
              }
            };

            function getBestMaskPattern(){
              var minLostPoint=0; var pattern=0;
              for(var i=0;i<8;i++){
                makeImpl(true,i);
                var lostPoint=QRUtil.getLostPoint(_this);
                if(i==0||minLostPoint>lostPoint){minLostPoint=lostPoint; pattern=i;}
              }
              return pattern;
            }
            function makeImpl(test,maskPattern){
              _moduleCount=_typeNumber*4+17;
              _modules=new Array(_moduleCount);
              for(var row=0;row<_moduleCount;row++){
                _modules[row]=new Array(_moduleCount);
                for(var col=0;col<_moduleCount;col++){
                  _modules[row][col]=null;
                }
              }
              setupPositionProbePattern(0,0);
              setupPositionProbePattern(_moduleCount-7,0);
              setupPositionProbePattern(0,_moduleCount-7);
              setupPositionAdjustPattern();
              setupTimingPattern();
              setupTypeInfo(test,maskPattern);
              if(_typeNumber>=7){setupTypeNumber(test);}
              if(_dataCache==null){_dataCache=createData(_typeNumber,_errorCorrectionLevel,_dataList);}
              mapData(_dataCache,maskPattern);
            }
            function setupPositionProbePattern(row,col){
              for(var r=-1;r<=7;r++){
                if(row+r<=-1||_moduleCount<=row+r) continue;
                for(var c=-1;c<=7;c++){
                  if(col+c<=-1||_moduleCount<=col+c) continue;
                  if((0<=r&&r<=6&&(c==0||c==6))||(0<=c&&c<=6&&(r==0||r==6))||(2<=r&&r<=4&&2<=c&&c<=4)){
                    _modules[row+r][col+c]=true;
                  } else {
                    _modules[row+r][col+c]=false;
                  }
                }
              }
            }
            function setupTimingPattern(){
              for(var i=8;i<_moduleCount-8;i++){
                if(_modules[i][6]==null) _modules[i][6]=(i%2==0);
                if(_modules[6][i]==null) _modules[6][i]=(i%2==0);
              }
            }
            function setupPositionAdjustPattern(){
              var pos=QRUtil.getPatternPosition(_typeNumber);
              for(var i=0;i<pos.length;i++){
                for(var j=0;j<pos.length;j++){
                  var row=pos[i]; var col=pos[j];
                  if(_modules[row][col]!=null) continue;
                  for(var r=-2;r<=2;r++){
                    for(var c=-2;c<=2;c++){
                      if(r==-2||r==2||c==-2||c==2||(r==0&&c==0)) _modules[row+r][col+c]=true;
                      else _modules[row+r][col+c]=false;
                    }
                  }
                }
              }
            }
            function setupTypeNumber(test){
              var bits=QRUtil.getBCHTypeNumber(_typeNumber);
              for(var i=0;i<18;i++){
                var mod=!test&&((bits>>i)&1)==1;
                _modules[Math.floor(i/3)][i%3+_moduleCount-8-3]=mod;
              }
              for(var i=0;i<18;i++){
                var mod=!test&&((bits>>i)&1)==1;
                _modules[i%3+_moduleCount-8-3][Math.floor(i/3)]=mod;
              }
            }
            function setupTypeInfo(test,maskPattern){
              var data=(_errorCorrectionLevel<<3)|maskPattern;
              var bits=QRUtil.getBCHTypeInfo(data);
              for(var i=0;i<15;i++){
                var mod=!test&&((bits>>i)&1)==1;
                if(i<6) _modules[i][8]=mod;
                else if(i<8) _modules[i+1][8]=mod;
                else _modules[_moduleCount-15+i][8]=mod;
              }
              for(var i=0;i<15;i++){
                var mod=!test&&((bits>>i)&1)==1;
                if(i<8) _modules[8][_moduleCount-i-1]=mod;
                else if(i<9) _modules[8][15-i-1+1]=mod;
                else _modules[8][15-i-1]=mod;
              }
              _modules[_moduleCount-8][8]=!test;
            }
            function mapData(data,maskPattern){
              var inc=-1; var row=_moduleCount-1; var bitIndex=7; var byteIndex=0;
              for(var col=_moduleCount-1;col>0;col-=2){
                if(col==6) col--;
                while(true){
                  for(var c=0;c<2;c++){
                    if(_modules[row][col-c]==null){
                      var dark=false;
                      if(byteIndex<data.length){dark=((data[byteIndex]>>>bitIndex)&1)==1;}
                      var mask=QRUtil.getMask(maskPattern,row,col-c);
                      if(mask) dark=!dark;
                      _modules[row][col-c]=dark;
                      bitIndex--;
                      if(bitIndex==-1){byteIndex++; bitIndex=7;}
                    }
                  }
                  row+=inc;
                  if(row<0||_moduleCount<=row){row-=inc; inc=-inc; break;}
                }
              }
            }
            function createData(typeNumber,errorCorrectionLevel,dataList){
              var rsBlocks=QRRSBlock.getRSBlocks(typeNumber,errorCorrectionLevel);
              var buffer=new QRBitBuffer();
              for(var i=0;i<dataList.length;i++){
                var data=dataList[i];
                buffer.put(data.getMode(),4);
                buffer.put(data.getLength(),QRUtil.getLengthInBits(data.getMode(),typeNumber));
                data.write(buffer);
              }
              var totalDataCount=0;
              for(var i=0;i<rsBlocks.length;i++){totalDataCount+=rsBlocks[i].dataCount;}
              if(buffer.getLengthInBits()>totalDataCount*8){throw new Error('code length overflow');}
              if(buffer.getLengthInBits()+4<=totalDataCount*8){buffer.put(0,4);} 
              while(buffer.getLengthInBits()%8!=0){buffer.putBit(false);} 
              while(true){
                if(buffer.getLengthInBits()>=totalDataCount*8) break;
                buffer.put(PAD0,8);
                if(buffer.getLengthInBits()>=totalDataCount*8) break;
                buffer.put(PAD1,8);
              }
              return createBytes(buffer,rsBlocks);
            }
            function createBytes(buffer,rsBlocks){
              var offset=0; var maxDcCount=0; var maxEcCount=0;
              var dcdata=new Array(rsBlocks.length); var ecdata=new Array(rsBlocks.length);
              for(var r=0;r<rsBlocks.length;r++){
                var dcCount=rsBlocks[r].dataCount; var ecCount=rsBlocks[r].totalCount-dcCount;
                maxDcCount=Math.max(maxDcCount,dcCount); maxEcCount=Math.max(maxEcCount,ecCount);
                dcdata[r]=new Array(dcCount);
                for(var i=0;i<dcdata[r].length;i++) dcdata[r][i]=0xff & buffer.buffer[i+offset];
                offset+=dcCount;
                var rsPoly=QRUtil.getErrorCorrectPolynomial(ecCount);
                var rawPoly=new QRPolynomial(dcdata[r],rsPoly.getLength()-1);
                var modPoly=rawPoly.mod(rsPoly);
                ecdata[r]=new Array(rsPoly.getLength()-1);
                for(var i=0;i<ecdata[r].length;i++){
                  var modIndex=i+modPoly.getLength()-ecdata[r].length;
                  ecdata[r][i]=(modIndex>=0)?modPoly.get(modIndex):0;
                }
              }
              var totalCodeCount=0;
              for(var i=0;i<rsBlocks.length;i++) totalCodeCount+=rsBlocks[i].totalCount;
              var data=new Array(totalCodeCount);
              var index=0;
              for(var i=0;i<maxDcCount;i++){
                for(var r=0;r<rsBlocks.length;r++){
                  if(i<dcdata[r].length) data[index++]=dcdata[r][i];
                }
              }
              for(var i=0;i<maxEcCount;i++){
                for(var r=0;r<rsBlocks.length;r++){
                  if(i<ecdata[r].length) data[index++]=ecdata[r][i];
                }
              }
              return data;
            }
            return _this;
          }

          var QRMode={MODE_8BIT_BYTE:1};
          var QRErrorCorrectionLevel={L:1,M:0,Q:3,H:2};
          function QR8bitByte(data){
            this.mode=QRMode.MODE_8BIT_BYTE;
            this.data=data;
            this.parsed=[];
            for(var i=0;i<this.data.length;i++) this.parsed.push(this.data.charCodeAt(i));
            this.getMode=function(){return this.mode;};
            this.getLength=function(){return this.parsed.length;};
            this.write=function(buffer){
              for(var i=0;i<this.parsed.length;i++) buffer.put(this.parsed[i],8);
            };
          }
          function QRBitBuffer(){
            this.buffer=[]; this.length=0;
            this.get=function(i){var bufIndex=Math.floor(i/8); return ((this.buffer[bufIndex] >>> (7 - i%8)) & 1)==1;};
            this.put=function(num,length){for(var i=0;i<length;i++) this.putBit(((num >>> (length - i - 1)) & 1)==1);};
            this.getLengthInBits=function(){return this.length;};
            this.putBit=function(bit){var bufIndex=Math.floor(this.length/8); if(this.buffer.length<=bufIndex) this.buffer.push(0);
              if(bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
              this.length++;
            };
          }
          function QRPolynomial(num,shift){
            var offset=0;
            while(offset<num.length && num[offset]==0) offset++;
            this.num=new Array(num.length-offset+shift);
            for(var i=0;i<num.length-offset;i++) this.num[i]=num[i+offset];
            for(var i=0;i<shift;i++) this.num[num.length-offset+i]=0;
            this.get=function(i){return this.num[i];};
            this.getLength=function(){return this.num.length;};
            this.multiply=function(e){
              var num=new Array(this.getLength()+e.getLength()-1);
              for(var i=0;i<num.length;i++) num[i]=0;
              for(var i=0;i<this.getLength();i++){
                for(var j=0;j<e.getLength();j++){
                  num[i+j]^=QRMath.gexp(QRMath.glog(this.get(i))+QRMath.glog(e.get(j)));
                }
              }
              return new QRPolynomial(num,0);
            };
            this.mod=function(e){
              if(this.getLength()-e.getLength()<0) return this;
              var ratio=QRMath.glog(this.get(0))-QRMath.glog(e.get(0));
              var num=new Array(this.getLength());
              for(var i=0;i<this.getLength();i++) num[i]=this.get(i);
              for(var i=0;i<e.getLength();i++) num[i]^=QRMath.gexp(QRMath.glog(e.get(i))+ratio);
              return new QRPolynomial(num,0).mod(e);
            };
          }
          var QRMath={
            glog:function(n){if(n<1) throw new Error('glog'); return QRMath.LOG_TABLE[n];},
            gexp:function(n){while(n<0) n+=255; while(n>=256) n-=255; return QRMath.EXP_TABLE[n];},
            EXP_TABLE:new Array(256),
            LOG_TABLE:new Array(256)
          };
          for(var i=0;i<8;i++) QRMath.EXP_TABLE[i]=1<<i;
          for(var i=8;i<256;i++) QRMath.EXP_TABLE[i]=QRMath.EXP_TABLE[i-4]^QRMath.EXP_TABLE[i-5]^QRMath.EXP_TABLE[i-6]^QRMath.EXP_TABLE[i-8];
          for(var i=0;i<255;i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]]=i;
          var QRUtil={
            PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],
            G15: (1<<10)|(1<<8)|(1<<5)|(1<<4)|(1<<2)|(1<<1)|(1<<0),
            G18:(1<<12)|(1<<11)|(1<<10)|(1<<9)|(1<<8)|(1<<5)|(1<<2)|(1<<0),
            G15_MASK:(1<<14)|(1<<12)|(1<<10)|(1<<4)|(1<<1),
            getBCHTypeInfo:function(data){var d=data<<10; while(QRUtil.getBCHDigit(d)-QRUtil.getBCHDigit(QRUtil.G15)>=0){d^=(QRUtil.G15<<(QRUtil.getBCHDigit(d)-QRUtil.getBCHDigit(QRUtil.G15)));} return ((data<<10)|d)^QRUtil.G15_MASK;},
            getBCHTypeNumber:function(data){var d=data<<12; while(QRUtil.getBCHDigit(d)-QRUtil.getBCHDigit(QRUtil.G18)>=0){d^=(QRUtil.G18<<(QRUtil.getBCHDigit(d)-QRUtil.getBCHDigit(QRUtil.G18)));} return (data<<12)|d;},
            getBCHDigit:function(data){var digit=0; while(data!=0){digit++; data>>>=1;} return digit;},
            getPatternPosition:function(typeNumber){return QRUtil.PATTERN_POSITION_TABLE[typeNumber];},
            getMask:function(maskPattern,i,j){
              switch(maskPattern){
                case 0:return (i+j)%2==0;
                case 1:return i%2==0;
                case 2:return j%3==0;
                case 3:return (i+j)%3==0;
                case 4:return (Math.floor(i/2)+Math.floor(j/3))%2==0;
                case 5:return (i*j)%2+(i*j)%3==0;
                case 6:return ((i*j)%2+(i*j)%3)%2==0;
                case 7:return ((i*j)%3+(i+j)%2)%2==0;
                default:throw new Error('bad maskPattern:'+maskPattern);
              }
            },
            getErrorCorrectPolynomial:function(errorCorrectLength){
              var a=new QRPolynomial([1],0);
              for(var i=0;i<errorCorrectLength;i++) a=a.multiply(new QRPolynomial([1,QRMath.gexp(i)],0));
              return a;
            },
            getLengthInBits:function(mode,type){
              if(1<=type && type<10) return 8;
              else if(type<27) return 16;
              else return 16;
            },
            getLostPoint:function(qr){
              var moduleCount=qr.getModuleCount();
              var lostPoint=0;
              for(var row=0;row<moduleCount;row++){
                for(var col=0;col<moduleCount;col++){
                  var sameCount=0; var dark=qr.isDark(row,col);
                  for(var r=-1;r<=1;r++){
                    if(row+r<0||moduleCount<=row+r) continue;
                    for(var c=-1;c<=1;c++){
                      if(col+c<0||moduleCount<=col+c) continue;
                      if(r==0&&c==0) continue;
                      if(dark==qr.isDark(row+r,col+c)) sameCount++;
                    }
                  }
                  if(sameCount>5) lostPoint += (3 + sameCount - 5);
                }
              }
              for(var row=0;row<moduleCount-1;row++){
                for(var col=0;col<moduleCount-1;col++){
                  var count=0;
                  if(qr.isDark(row,col)) count++;
                  if(qr.isDark(row+1,col)) count++;
                  if(qr.isDark(row,col+1)) count++;
                  if(qr.isDark(row+1,col+1)) count++;
                  if(count==0||count==4) lostPoint += 3;
                }
              }
              for(var row=0;row<moduleCount;row++){
                for(var col=0;col<moduleCount-6;col++){
                  if(qr.isDark(row,col) && !qr.isDark(row,col+1) && qr.isDark(row,col+2) && qr.isDark(row,col+3) && qr.isDark(row,col+4) && !qr.isDark(row,col+5) && qr.isDark(row,col+6)){
                    lostPoint += 40;
                  }
                }
              }
              for(var col=0;col<moduleCount;col++){
                for(var row=0;row<moduleCount-6;row++){
                  if(qr.isDark(row,col) && !qr.isDark(row+1,col) && qr.isDark(row+2,col) && qr.isDark(row+3,col) && qr.isDark(row+4,col) && !qr.isDark(row+5,col) && qr.isDark(row+6,col)){
                    lostPoint += 40;
                  }
                }
              }
              var darkCount=0;
              for(var col=0;col<moduleCount;col++){
                for(var row=0;row<moduleCount;row++) if(qr.isDark(row,col)) darkCount++;
              }
              var ratio=Math.abs(100*darkCount/moduleCount/moduleCount - 50)/5;
              lostPoint += ratio*10;
              return lostPoint;
            }
          };
          var QRRSBlock={
            RS_BLOCK_TABLE:[
              // only need a subset; generator will choose size automatically with typeNumber=0,
              // but to stay small we will force typeNumber=4 which comfortably fits short IDs.
            ],
            getRSBlocks:function(typeNumber,errorCorrectionLevel){
              // Minimal: hardcode for version 4, EC M (common)
              // version 4, M: 2 blocks of (total 50, data 32)
              var rs=[{totalCount:50,dataCount:32},{totalCount:50,dataCount:32}];
              return rs;
            }
          };

          // Render QR (force version 4, EC M)
          try{
            var qr=qrcode(4,'M');
            qr.addData(${JSON.stringify(qrText)});
            qr.make();
            var canvas=document.getElementById('qrCanvas');
            var ctx=canvas.getContext('2d');
            ctx.imageSmoothingEnabled=false;
            var mc=qr.getModuleCount();
            var size=canvas.width;
            var cell=Math.floor(size/mc);
            var offset=Math.floor((size - cell*mc)/2);
            ctx.fillStyle='#fff'; ctx.fillRect(0,0,size,size);
            ctx.fillStyle='#000';
            for(var r=0;r<mc;r++){
              for(var c=0;c<mc;c++){
                if(qr.isDark(r,c)) ctx.fillRect(offset+c*cell, offset+r*cell, cell, cell);
              }
            }
          }catch(e){/* ignore */}
        })();

        // espera un poco para que el QR pinte antes de imprimir
        setTimeout(()=>{ window.print(); }, 450);
      </script>
    </body></html>`;

    // imprime en ventana aparte (credencial normalmente se imprime en PC)
    const w = window.open("", "_blank");
    if(!w){ alert("Permite ventanas emergentes para imprimir credencial."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  init();
})();