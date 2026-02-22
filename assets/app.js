(function(){
'use strict';

const CENTER = [-34.8222, -58.5358];
const ZOOM = 16;
const EDIT_PASSWORD = "12345678";
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxUG5pvaEfpJzio_IBvur714euD_w1fmk00Uv98VL6pJEgR_iZ6iIP1IEfFAS-D1l2q5Q/exec";
const STORAGE = {
  positions: "saez.positions.pro1",
  apiUrl: "saez.apiUrl.pro1",
  cardOffsets: "saez.cardOffsets.pro1",
  cardExpanded: "saez.cardExpanded.pro1",
  mode: "saez.mode.pro1",
  autoRefresh: "saez.autoRefresh.pro1"
};

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function toast(msg, type){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.style.borderColor = (type==="error") ? "rgba(255,77,109,.45)" : "rgba(93,214,255,.35)";
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.add("hidden"), 3000);
}
function openModal(id){
  $("#backdrop")?.classList.remove("hidden");
  $("#" + id)?.classList.remove("hidden");
}
function closeModal(id){
  $("#" + id)?.classList.add("hidden");
  const anyOpen = $$(".modal").some(m=>!m.classList.contains("hidden"));
  if(!anyOpen) $("#backdrop")?.classList.add("hidden");
}

function loadJson(key, fallback){ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):fallback; }catch{return fallback;} }
function saveJson(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function getApiUrl(){ return (localStorage.getItem(STORAGE.apiUrl)||"").trim(); }
function setApiUrl(v){ localStorage.setItem(STORAGE.apiUrl, (v||"").trim()); }
function getMode(){ return (localStorage.getItem(STORAGE.mode)||"intermediate").trim() || "intermediate"; }
function setMode(v){ localStorage.setItem(STORAGE.mode, (v||"intermediate").trim()); }
function getAutoRefresh(){ return Number(localStorage.getItem(STORAGE.autoRefresh) || 0) || 0; }
function setAutoRefresh(v){ localStorage.setItem(STORAGE.autoRefresh, String(Number(v)||0)); }

function b64UrlEncodeUnicode(str){
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64UrlDecodeUnicode(str){
  let s = String(str||'').replace(/-/g,'+').replace(/_/g,'/');
  while(s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

function normHdg(v){ let n=Number(v); if(!Number.isFinite(n)) n=0; n=Math.round(n%360); if(n<0)n+=360; return n; }

function destPoint(lat,lng,bearingDeg,distM){
  const R=6371000;
  const br=bearingDeg*Math.PI/180;
  const φ1=lat*Math.PI/180, λ1=lng*Math.PI/180;
  const δ=distM/R;
  const sinφ1=Math.sin(φ1), cosφ1=Math.cos(φ1);
  const sinδ=Math.sin(δ), cosδ=Math.cos(δ);
  const sinφ2=sinφ1*cosδ + cosφ1*sinδ*Math.cos(br);
  const φ2=Math.asin(sinφ2);
  const y=Math.sin(br)*sinδ*cosφ1;
  const x=cosδ - sinφ1*sinφ2;
  const λ2=λ1 + Math.atan2(y,x);
  return { lat: φ2*180/Math.PI, lng: λ2*180/Math.PI };
}

/** Detecta movimiento: "70 > M02" */
function parseMovement(pos){
  const m=String(pos||"").match(/^\s*([^>\s]+)\s*>\s*([^>\s]+)\s*$/);
  return m?{from:m[1],to:m[2]}:null;
}

function colorForReg(reg){
  const s=String(reg||"").toUpperCase();
  let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return `hsl(${h%360} 85% 60%)`;
}

function makePlaneIcon(color, rotation){
  const rot=Number(rotation)||0;
  const svg=`<svg width="30" height="30" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
    <path d="M21 16l-8-5V3.5a1.5 1.5 0 0 0-3 0V11l-8 5v2l8-2.5V20l-2 1.5V23l3-1 3 1v-1.5L13 20v-4.5L21 18v-2z"
      fill="${color}" fill-opacity="0.95" stroke="rgba(255,255,255,.35)" stroke-width="0.6"/>
  </svg>`;
  return L.divIcon({
    html:`<div style="width:34px;height:34px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,14,22,.55);display:grid;place-items:center;backdrop-filter:blur(4px);box-shadow:0 10px 28px rgba(0,0,0,.35)">${svg}</div>`,
    className:"", iconSize:[34,34], iconAnchor:[17,17]
  });
}

function makePosIcon(name, highlight){
  const div=document.createElement("div");
  div.className="pos-icon"+(highlight?" highlight":"");
  const span=document.createElement("span"); span.textContent=String(name);
  div.appendChild(span);
  return L.divIcon({ html: div, className:"", iconSize:[34,34], iconAnchor:[17,17] });
}

function flightKey(f){
  return `${f.reg||""}|${(f.arr?.flightNo||"")}|${(f.dep?.flightNo||"")}`;
}

/**
 * ✅ FILTRO: bloquear pseudo-vuelos tipo "GIG-CON", "IGR-CAN", "QTR-HOR"
 * patrón 3 letras - 3 letras, donde el sufijo es remark/estado.
 */
function isInvalidPseudoFlight(f){
  const badSuffix = new Set(["CON","CAN","HOR","ALT","PAR","CER","BOR","ULT","PRE"]);
  const s = String(f||"").trim().toUpperCase();
  const m = s.match(/^([A-Z]{3})-([A-Z]{3})$/);
  if(!m) return false;
  return badSuffix.has(m[2]);
}

let map, editor=false;
let positions=loadJson(STORAGE.positions, []);
let flights=[], movements=[];
let aircraftPositions=[];
let flightTypeFilter="all";

let posMarkers=new Map();
let cards=new Map();
let cardOffsets=loadJson(STORAGE.cardOffsets, {});
let cardExpanded=loadJson(STORAGE.cardExpanded, {});
let arrowsLayer=L.layerGroup();
let aircraftLayer=L.layerGroup();
let history=[];
let playTimer=null;
let temp={ id:null, latlng:null, marker:null, line:null };

function findPosByName(name){
  const n=String(name||"").toUpperCase();
  return positions.find(p=>String(p.name).toUpperCase()===n) || null;
}

/** Ancla en FROM si hay movimiento (ej: "70 > M02") */
function anchorPosName(f){
  const s=String(f.pos||"").trim();
  const m=parseMovement(s);
  return m?m.from:s;
}

function isVisible(f){
  const pn=anchorPosName(f);
  if(!pn) return false;
  if(f.arr && !f.arr.time) return false;
  if(f.dep && !f.dep.time) return false;
  return true;
}

function init(){
  map=L.map("map",{preferCanvas:true}).setView(CENTER, ZOOM);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
    maxZoom:19, attribution:"Tiles © Esri", className:"sat-dim"
  }).addTo(map);

  arrowsLayer.addTo(map);
  aircraftLayer.addTo(map);

  map.on("click",(e)=>{
    if(!editor) return;
    startNewPos(e.latlng);
  });

  map.on("move zoom", ()=> positionCards());
  map.on("movestart zoomstart", ()=> { $("#cardsOverlay")?.classList.add("moving"); });
  map.on("moveend zoomend", ()=> { $("#cardsOverlay")?.classList.remove("moving"); positionCards(); });

  bindUI();
  applyModeUi();
  setupAutoRefresh();
  setEditor(false);
  renderPositions();
  updateTimeLabel();
  if(!getApiUrl()) { setApiUrl(DEFAULT_API_URL); }
  refresh();
}

function setEditor(on){
  editor=!!on;
  const btn=$("#btnEdit");
  if(btn){
    btn.classList.toggle("editor-on", editor);
    btn.innerHTML = editor ? '<span class="status-dot"></span> Editor ON (salir)' : '<span class="status-dot"></span> Editar';
  }

  const pp=$("#panelPositions");
  if(pp) pp.style.display = editor ? "" : "none";

  const bs=$("#btnSettings");
  if(bs) bs.style.display = editor ? "" : "none";

  clearTemp();
  renderPositions();
}

function clearTemp(){
  if(temp.marker) map.removeLayer(temp.marker);
  if(temp.line) map.removeLayer(temp.line);
  temp={id:null,latlng:null,marker:null,line:null};
}

function startNewPos(latlng){
  clearTemp();
  temp.latlng=latlng;
  temp.marker=L.circleMarker(latlng,{radius:6,weight:2,color:"rgba(93,214,255,.95)",fillColor:"rgba(93,214,255,.45)",fillOpacity:0.85}).addTo(map);
  temp.line=L.polyline([latlng, destPoint(latlng.lat, latlng.lng, 0, 120)],{weight:3,opacity:0.9}).addTo(map);
  $("#modalPosTitle").textContent="Nueva posición";
  $("#posName").value=""; $("#posHdg").value="0"; $("#posHdgSlider").value="0";
  openModal("modalPos");
}

function openEditPos(id){
  const p=positions.find(x=>x.id===id);
  if(!p) return;
  clearTemp();
  temp.id=p.id;
  temp.latlng=L.latLng(p.lat,p.lng);
  temp.marker=L.circleMarker(temp.latlng,{radius:6,weight:2,color:"rgba(93,214,255,.95)",fillColor:"rgba(93,214,255,.45)",fillOpacity:0.85}).addTo(map);
  temp.line=L.polyline([temp.latlng, destPoint(p.lat,p.lng,p.hdg||0,120)],{weight:3,opacity:0.9}).addTo(map);
  $("#modalPosTitle").textContent="Editar posición";
  $("#posName").value=p.name; $("#posHdg").value=String(p.hdg||0); $("#posHdgSlider").value=String(p.hdg||0);
  openModal("modalPos");
}

function renderPositions(){
  for(const m of posMarkers.values()) map.removeLayer(m);
  posMarkers.clear();
  for(const p of positions){
    const mk=L.marker([p.lat,p.lng],{icon:makePosIcon(p.name,false)}).addTo(map);
    mk.on("click",()=>{ if(editor) openEditPos(p.id); });
    posMarkers.set(p.id,mk);
  }
  renderPosList();
  renderArrows();
  renderAircraft();
  renderCards();
  positionCards();
}

function renderPosList(){
  $("#positionsCount").textContent=String(positions.length);
  const wrap=$("#positionsList"); wrap.innerHTML="";
  if(!positions.length){
    const d=document.createElement("div"); d.className="tiny muted"; d.textContent="Sin posiciones aún.";
    wrap.appendChild(d); return;
  }
  const sorted=[...positions].sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{numeric:true}));
  for(const p of sorted){
    const row=document.createElement("div"); row.className="item";
    const main=document.createElement("div"); main.className="item-main";
    main.innerHTML=`<div class="item-title">Pos ${escapeHtml(p.name)} <span class="pill">${escapeHtml(p.hdg)}°</span></div>
                    <div class="item-sub">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>`;
    const acts=document.createElement("div"); acts.className="item-actions";
    const bGo=document.createElement("button"); bGo.className="btn btn-ghost"; bGo.textContent="Ir";
    bGo.onclick=()=>map.setView([p.lat,p.lng],Math.max(map.getZoom(),17),{animate:true});
    const bEd=document.createElement("button"); bEd.className="btn btn-ghost"; bEd.textContent="Editar";
    bEd.onclick=()=>openEditPos(p.id);
    const bDel=document.createElement("button"); bDel.className="btn btn-danger"; bDel.textContent="Eliminar";
    bDel.onclick=()=>{ positions=positions.filter(x=>x.id!==p.id); saveJson(STORAGE.positions,positions); schedulePositionsSync(); renderPositions(); toast(`Posición ${p.name} eliminada`); };
    acts.append(bGo,bEd,bDel);
    row.append(main,acts); wrap.appendChild(row);
  }
}

let _posSyncTimer = null;
let _posSyncPending = false;

function schedulePositionsSync(){
  _posSyncPending = true;
  clearTimeout(_posSyncTimer);
  _posSyncTimer = setTimeout(()=>{ pushPositionsToSheet(); }, 600);
}

async function pushPositionsToSheet(){
  const api = getApiUrl();
  if(!api) return;
  if(!_posSyncPending) return;
  _posSyncPending = false;

  try{
    const payload = b64UrlEncodeUnicode(JSON.stringify(positions));
    const url = api + (api.includes("?") ? "&" : "?") + "action=savePositions&data=" + encodeURIComponent(payload) + "&cb=" + Date.now();

    const img = new Image();
    img.onerror = ()=>{ 
      _posSyncPending = true;
      clearTimeout(_posSyncTimer);
      _posSyncTimer = setTimeout(()=>pushPositionsToSheet(), 2500);
    };
    img.src = url;
  }catch(err){
    console.warn("pushPositionsToSheet failed, will retry", err);
    _posSyncPending = true;
    clearTimeout(_posSyncTimer);
    _posSyncTimer = setTimeout(()=>{ pushPositionsToSheet(); }, 2500);
  }
}

async function refresh(){
  const api=getApiUrl();
  if(!api){ toast("Configurá la URL de la API en ⚙︎","error"); return; }
  $("#btnRefresh").disabled=true; $("#btnRefresh").textContent="⟳ Actualizando…";
  try{
    const url=api + (api.includes("?")?"&":"?") + "cb="+Date.now();
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data=await res.json();

    if(Array.isArray(data.positions)){
      positions = data.positions;
      saveJson(STORAGE.positions, positions);
    }
    aircraftPositions = Array.isArray(data.aircraftPositions) ? data.aircraftPositions : [];

    const snap=normalize(data);
    history.push(snap); if(history.length>80) history.shift();
    $("#timeSlider").max=String(Math.max(0,history.length-1));
    $("#timeSlider").value=String(history.length-1);
    applySnapshot(snap);
    updateTimeLabel();
    toast("Datos actualizados");
  }catch(e){
    console.error(e);
    toast("Error al actualizar (ver consola)","error");
  }finally{
    $("#btnRefresh").disabled=false; $("#btnRefresh").textContent="⟳ Refrescar";
  }
}

function normalize(data){
  const arr = Array.isArray(data.arrivals) ? data.arrivals : [];
  const dep = Array.isArray(data.departures) ? data.departures : [];
  const registry = Array.isArray(data.aircraftPositions) ? data.aircraftPositions : [];

  const departed = new Set((data.departedRegs || []).map(x => String(x).toUpperCase()));

  const regMap = new Map();

  // Base: registry persistente
  for(const r of registry){
    if(!r || !r.reg) continue;
    const key = String(r.reg).toUpperCase();
    if(departed.has(key)) continue;
    const pos = String(r.pos||"").trim();
    if(!pos) continue;

    regMap.set(key, {
      reg: key,
      pos,
      arr: null,
      dep: null,
      registry: { pos, updatedAt:r.updatedAt||"", source:r.source||"" }
    });
  }

  // Arrivals
  for(const a of arr){
    if(!a || !a.reg) continue;
    const key = String(a.reg).toUpperCase();
    if(departed.has(key)) continue;

    const time = (a.time||"").trim();
    if(!time || time === "-") continue;

    const obj = regMap.get(key) || { reg:key, pos:String(a.pos||"").trim(), arr:null, dep:null, registry:null };
    if(String(a.pos||"").trim()) obj.pos = String(a.pos||"").trim();

    obj.arr = {
      flightNo: a.flightNo||"",
      origin: a.origin||"",
      time,
      belt: a.belt||"",
      state: a.state||""
    };
    regMap.set(key, obj);
  }

  // Departures
  for(const d of dep){
    if(!d || !d.reg) continue;
    const key = String(d.reg).toUpperCase();
    if(departed.has(key)) continue;

    const obj = regMap.get(key) || { reg:key, pos:String(d.pos||"").trim(), arr:null, dep:null, registry:null };
    if(String(d.pos||"").trim()) obj.pos = String(d.pos||"").trim();

    obj.dep = {
      flightNo: d.flightNo||"",
      dest: d.dest||"",
      time: d.time||"",
      gate: d.gate||"",
      state: d.state||""
    };
    regMap.set(key, obj);
  }

  // Solo aeronaves con posición
  const out = [];
  for(const obj of regMap.values()){
    const pos = String(obj.pos||"").trim();
    if(!pos) continue;
    out.push(obj);
  }

  // Orden: TA, ARR, DEP
  out.sort((a,b)=>{
    const rank = (o)=> (o.arr && o.dep)?0:(o.arr?1:(o.dep?2:3));
    const ra=rank(a), rb=rank(b);
    if(ra!==rb) return ra-rb;
    return String(a.reg).localeCompare(String(b.reg));
  });

  // ======================================================
  // ✅ MOVIMIENTOS: detectar "FROM > TO" directamente en obj.pos
  // ======================================================
  const mov = [];

  for(const obj of out){
    const rawPos = String(obj.pos || "").trim();
    const mv = parseMovement(rawPos);
    if(!mv) continue;

    const fromPos = String(mv.from || "").trim();
    const toPos   = String(mv.to || "").trim();
    if(!fromPos || !toPos) continue;
    if(fromPos.toUpperCase() === toPos.toUpperCase()) continue;

    mov.push({ reg: obj.reg, fromPos, toPos });
  }

  // Compat: si backend trae movements, los sumamos
  const backendMov = Array.isArray(data.movements) ? data.movements : [];
  for(const m of backendMov){
    if(!m) continue;
    const fromPos = (m.fromPos || m.from || "").toString().trim();
    const toPos   = (m.toPos   || m.to   || "").toString().trim();
    if(!fromPos || !toPos) continue;
    mov.push({ reg: (m.reg||"").toString().trim(), fromPos, toPos });
  }

  return { flights: out, movements: mov };
}

function applySnapshot(snap){
  flights=snap.flights||[];
  movements=snap.movements||[];
  renderFlightsList();
  renderArrows();
  renderAircraft();
  renderCards();
  positionCards();
}

function renderAircraftRegistry(listEl){
return;

// (sin título de "Registro aeronaves...")
const spacer = document.createElement("div");
spacer.style.height = "6px";
listEl.appendChild(spacer);

  const q = ($("#searchFlights").value || "").trim().toLowerCase();
  const regs = (aircraftPositions||[]).filter(r=>{
    const s = `${r.reg||""} ${r.pos||""}`.toLowerCase();
    return !q || s.includes(q);
  }).slice(0, 120);

  for(const r of regs){
    const row = document.createElement("div");
    row.className = "item";
    row.style.cursor = "pointer";
    row.innerHTML = `<div class="item-main">
      <div class="item-title">${escapeHtml(r.reg)} <span class="pill">${escapeHtml(r.pos||"-")}</span></div>
      <div class="item-sub">Última act: ${escapeHtml(r.updatedAt||"-")} • Fuente: ${escapeHtml(r.source||"-")}</div>
    </div>`;
    row.onclick = ()=>{
      const p = findPosByName(r.pos);
      if(p) map.setView([p.lat,p.lng], Math.max(map.getZoom(), 17), {animate:true});
    };
    listEl.appendChild(row);
  }

  const sep = document.createElement("div");
  sep.className = "tiny muted";
  sep.style.margin = "10px 0 0";
  sep.textContent = "Vuelos activos:";
  listEl.appendChild(sep);
}

function renderFlightsList(){
  const q=($("#searchFlights").value||"").trim().toLowerCase();
  const list=$("#flightsList"); list.innerHTML="";
  renderAircraftRegistry(list);

  const filtered=flights
    .filter(f=>{
      const arrNo = f.arr?.flightNo || "";
      const depNo = f.dep?.flightNo || "";

      if(isInvalidPseudoFlight(arrNo) || isInvalidPseudoFlight(depNo)) return false;

      const s=`${f.reg} ${arrNo} ${depNo}`.toLowerCase();
      return !q || s.includes(q);
    })
    .sort((a,b)=>String(a.reg).localeCompare(String(b.reg)));

  $("#flightsCount").textContent=String(filtered.length);
  if(!filtered.length){
    const d=document.createElement("div"); d.className="tiny muted"; d.textContent="Sin vuelos para mostrar.";
    list.appendChild(d); return;
  }
  filtered.forEach(f=>{
    const badge=(f.arr&&f.dep)?["TA","ta"]:(f.arr?["ARR","arr"]:["DEP","dep"]);
    const sub=[
      f.arr?`ARR ${f.arr.flightNo||"N/D"} • ${f.arr.origin||"-"} • ${f.arr.time||"-"}`:null,
      f.dep?`DEP ${f.dep.flightNo||"N/D"} • ${f.dep.time||"-"} • ${f.dep.state||"-"}`:null
    ].filter(Boolean).join(" | ");

    const row=document.createElement("div"); row.className="item"; row.style.cursor="pointer";
    row.innerHTML=`<div class="item-main"><div class="item-title">${escapeHtml(f.reg)} <span class="pill">${escapeHtml(f.pos||"-")}</span> <span class="badge ${badge[1]}">${badge[0]}</span></div>
                   <div class="item-sub">${escapeHtml(sub||"—")}</div></div>`;
    row.onclick=()=>focusFlight(f);
    list.appendChild(row);
  });
}

function focusFlight(f){
  const key=flightKey(f);
  const posName=anchorPosName(f);
  const pos=findPosByName(posName);
  if(pos) map.setView([pos.lat,pos.lng],Math.max(map.getZoom(),17),{animate:true});
  for(const [k,div] of cards.entries()){
    div.style.outline = (k===key) ? "2px solid rgba(93,214,255,.55)" : "none";
  }
}

function cardHtml(f){
  const key = flightKey(f);
  const expanded = !!cardExpanded[key];
  const badge=(f.arr&&f.dep)?["TA","ta"]:(f.arr?["ARR","arr"]:["DEP","dep"]);

  if(!expanded){
    return `<div class="mini">
      <button class="mini-btn" data-action="toggle" data-key="${escapeHtml(key)}" title="Ver detalles">
        ${escapeHtml(f.reg)}
      </button>
      <span class="badge ${badge[1]}">${badge[0]}</span>
      <span class="badge">${escapeHtml(f.pos||"-")}</span>
    </div>`;
  }

  const arr=f.arr?`<div class="badge arr">Arribo</div><div class="kv">
      <div class="k">Vuelo</div><div class="v">${escapeHtml(f.arr.flightNo||"N/D")}</div>
      <div class="k">Origen</div><div class="v">${escapeHtml(f.arr.origin||"-")}</div>
      <div class="k">Hora</div><div class="v">${escapeHtml(f.arr.time||"-")}</div>
      <div class="k">Cinta</div><div class="v">${escapeHtml(f.arr.belt||"-")}</div>
      <div class="k">Estado</div><div class="v">${escapeHtml(f.arr.state||"-")}</div></div>`:"";

  const dep=f.dep?`<div class="badge dep">Salida</div><div class="kv">
      <div class="k">Vuelo</div><div class="v">${escapeHtml(f.dep.flightNo||"N/D")}</div>
      <div class="k">Hora</div><div class="v">${escapeHtml(f.dep.time||"-")}</div>
      <div class="k">Destino</div><div class="v">${escapeHtml(f.dep.dest||"-")}</div>
      <div class="k">Puerta</div><div class="v">${escapeHtml(f.dep.gate||"-")}</div>
      <div class="k">Embarque</div><div class="v">${escapeHtml(f.dep.state||"-")}</div></div>`:"";

  return `<div class="title">
            <button class="title-btn" data-action="toggle" data-key="${escapeHtml(key)}" title="Cerrar detalles">
              ${escapeHtml(f.reg)}
            </button>
            <span class="badge ${badge[1]}">${badge[0]}</span>
            <span class="badge">${escapeHtml(f.pos||"-")}</span>
          </div>
          <div style="margin-top:8px;display:grid;gap:10px">${arr}${dep}</div>`;
}

function enableDrag(div,key){
  div.classList.add("draggable");
  let dragging=false, start=null;

  const getAnchor = ()=>{
    const f = flights.find(x => flightKey(x) === key);
    if(!f) return null;
    const pos = findPosByName(anchorPosName(f));
    if(!pos) return null;
    const pt = map.latLngToContainerPoint([pos.lat, pos.lng]);
    return { x: pt.x + 14, y: pt.y - 14 };
  };

  div.addEventListener("pointerdown",(e)=>{
    if(e.target && e.target.closest && e.target.closest("[data-action='toggle']")) return;
    dragging=true;
    div.setPointerCapture(e.pointerId);
    const rect=div.getBoundingClientRect();
    const o=$("#cardsOverlay").getBoundingClientRect();
    start={x:e.clientX,y:e.clientY,left:rect.left-o.left,top:rect.top-o.top};
    e.preventDefault();
  });

  window.addEventListener("pointermove",(e)=>{
    if(!dragging||!start) return;
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    const newLeft = start.left + dx;
    const newTop  = start.top + dy;

    const anchor = getAnchor();
    if(!anchor) return;

    cardOffsets[key] = { dx: newLeft - anchor.x, dy: newTop - anchor.y };
    saveJson(STORAGE.cardOffsets,cardOffsets);
    positionCards();
  });

  window.addEventListener("pointerup",()=>{ dragging=false; start=null; });
}

function renderCards(){
  const overlay=$("#cardsOverlay");
  const needed=new Set();

  flights.forEach(f=>{
    if(!isVisible(f)) return;
    const pos=findPosByName(anchorPosName(f));
    if(!pos) return;

    const key=flightKey(f);
    needed.add(key);

    if(!cards.has(key)){
      const div=document.createElement("div");
      div.className="card"; div.dataset.key=key;
      overlay.appendChild(div);
      cards.set(key,div);
      enableDrag(div,key);
    }
    cards.get(key).innerHTML=cardHtml(f);
  });

  for(const [k,div] of [...cards.entries()]){
    if(!needed.has(k)){
      div.remove(); cards.delete(k); delete cardOffsets[k]; delete cardExpanded[k];
    }
  }
  saveJson(STORAGE.cardOffsets,cardOffsets);
}

function positionCards(){
  const o=$("#cardsOverlay").getBoundingClientRect();
  const used=[];

  flights.forEach(f=>{
    if(!isVisible(f)) return;
    const key=flightKey(f);
    const div=cards.get(key); if(!div) return;

    const pos=findPosByName(anchorPosName(f)); if(!pos) return;
    const pt=map.latLngToContainerPoint([pos.lat,pos.lng]);

    if(pt.x < -40 || pt.y < -40 || pt.x > o.width + 40 || pt.y > o.height + 40){
      div.style.display = "none";
      return;
    }else{
      div.style.display = "";
    }

    const w=div.offsetWidth||280, h=div.offsetHeight||170;
    let x,y;
    const off=cardOffsets[key];

    if(off && Number.isFinite(off.dx) && Number.isFinite(off.dy)){
      const anchor = { x: pt.x + 14, y: pt.y - 14 };
      x = clamp(anchor.x + off.dx, 8, o.width - w - 8);
      y = clamp(anchor.y + off.dy, 8, o.height - h - 8);
    }else{
      let x0=pt.x+14, y0=pt.y-h-14;
      const cand=spiral(12,10);
      let placed=null;
      for(const c of cand){
        const cx=clamp(x0+c.dx,8,o.width-w-8);
        const cy=clamp(y0+c.dy,8,o.height-h-8);
        const r={x:cx,y:cy,w,h};
        if(!hitAny(r,used)){ placed=r; break; }
      }
      if(!placed) placed={x:clamp(x0,8,o.width-w-8),y:clamp(y0,8,o.height-h-8),w,h};
      used.push(placed); x=placed.x; y=placed.y;
    }

    div.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;
  });
}

function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
function spiral(steps,stepPx){
  const out=[{dx:0,dy:0}]; let dx=0,dy=0,seg=1,done=0,segs=0,dir=0;
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
  for(let i=0;i<steps*steps;i++){
    dx+=dirs[dir][0]*stepPx; dy+=dirs[dir][1]*stepPx; out.push({dx,dy});
    done++; if(done===seg){ done=0; dir=(dir+1)%4; segs++; if(segs%2===0) seg++; }
  }
  return out;
}
function hit(a,b){ return !(a.x+a.w<b.x || b.x+b.w<a.x || a.y+a.h<b.y || b.y+b.h<a.y); }
function hitAny(r,list){ for(const x of list) if(hit(r,x)) return true; return false; }

/**
 * ✅ Flecha + línea punteada animada (move-line)
 * Soporta mv.{fromPos,toPos} y mv.{from,to}
 */
function renderArrows(){
  arrowsLayer.clearLayers();

  movements.forEach(mv=>{
    const fromName = (mv.fromPos || mv.from || "").toString().trim();
    const toName   = (mv.toPos   || mv.to   || "").toString().trim();
    if(!fromName || !toName) return;

    const from = findPosByName(fromName);
    const to   = findPosByName(toName);
    if(!from || !to) return;

    const line = L.polyline(
      [[from.lat,from.lng],[to.lat,to.lng]],
      { weight: 3, opacity: 0.95, dashArray: "8 10", className: "move-line" }
    ).addTo(arrowsLayer);

    if(L.polylineDecorator){
      L.polylineDecorator(line,{
        patterns:[
          {
            offset:"82%",
            repeat:0,
            symbol: L.Symbol.arrowHead({
              pixelSize: 10,
              polygon: false,
              pathOptions:{ weight:3, opacity:0.95 }
            })
          }
        ]
      }).addTo(arrowsLayer);
    }
  });
}

function renderAircraft(){
  aircraftLayer.clearLayers();
  const groups=new Map();

  flights.forEach(f=>{
    if(!isVisible(f)) return;
    const pn=anchorPosName(f); if(!pn) return;
    const u=String(pn).toUpperCase();
    if(!groups.has(u)) groups.set(u,[]);
    groups.get(u).push(f);
  });

  groups.forEach((arr,u)=>{
    const pos=findPosByName(u); if(!pos) return;
    const hdg=Number(pos.hdg)||0;

    arr.forEach((f,idx)=>{
      const jitter=idx===0?{lat:pos.lat,lng:pos.lng}:destPoint(pos.lat,pos.lng,(idx*60)%360,7);
      L.marker([jitter.lat,jitter.lng],{icon:makePlaneIcon(colorForReg(f.reg),hdg),interactive:false}).addTo(aircraftLayer);
    });
  });
}

function applyModeUi(){
  const mode = getMode();
  const show = (mode === "pro");
  $("#btnPlay").style.display = show ? "" : "none";
  $("#timeSlider").style.display = show ? "" : "none";
  $("#timeLabel").style.display = show ? "" : "none";
}

let autoRefreshTimer = null;
function setupAutoRefresh(){
  if(autoRefreshTimer){ clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const sec = getAutoRefresh();
  if(sec > 0){
    autoRefreshTimer = setInterval(()=> refresh(), sec*1000);
  }
}

function updateTimeLabel(){
  const v=Number($("#timeSlider").value||0);
  const max=Number($("#timeSlider").max||0);
  $("#timeLabel").textContent=`Timelapse: ${max? (v+1):0}/${max? (max+1):0}`;
}

function togglePlay(){
  if(playTimer){ clearInterval(playTimer); playTimer=null; $("#btnPlay").textContent="▶︎"; toast("Timelapse pausado"); return; }
  if(history.length<2){ toast("Necesitás al menos 2 refrescos.","error"); return; }
  $("#btnPlay").textContent="⏸";
  playTimer=setInterval(()=>{
    const s=$("#timeSlider"); const max=Number(s.max||0);
    let v=Number(s.value||0)+1; if(v>max) v=0;
    s.value=String(v); applySnapshot(history[v]); updateTimeLabel();
  },1200);
}

function bindUI(){
  const overlay = $("#cardsOverlay");
  overlay.addEventListener("click", (e)=>{
    const t = e.target.closest("[data-action='toggle']");
    if(!t) return;
    const key = t.getAttribute("data-key");
    if(!key) return;
    cardExpanded[key] = !cardExpanded[key];
    saveJson(STORAGE.cardExpanded, cardExpanded);
    renderCards();
    positionCards();
    e.preventDefault();
  });

  $$("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
  $("#backdrop").addEventListener("click",()=>{
    $$(".modal").forEach(m=>m.classList.add("hidden"));
    $("#backdrop").classList.add("hidden");
    clearTemp();
  });

  $("#btnEdit").addEventListener("click",()=>{
    if(editor){ setEditor(false); refresh(); return; }
    $("#passInput").value=""; openModal("modalPass"); $("#passInput").focus();
  });
  $("#btnPassCancel").onclick=()=>closeModal("modalPass");
  $("#btnPassOk").onclick=()=>{
    if($("#passInput").value!==EDIT_PASSWORD){ toast("Contraseña incorrecta","error"); return; }
    closeModal("modalPass"); setEditor(true); toast("Editor habilitado: tocá el mapa.");
  };

  $("#btnSettings").onclick=()=>{
    $("#apiUrlInput").value=getApiUrl();
    $("#modeSelect").value=getMode();
    $("#autoRefreshSelect").value=String(getAutoRefresh());
    openModal("modalSettings");
  };
  $("#btnSettingsCancel").onclick=()=>closeModal("modalSettings");
  $("#btnSettingsSave").onclick=()=>{
    setApiUrl($("#apiUrlInput").value);
    setMode($("#modeSelect").value);
    setAutoRefresh($("#autoRefreshSelect").value);
    closeModal("modalSettings");
    applyModeUi();
    setupAutoRefresh();
    toast("Configuración guardada");
  };

  $("#btnRefresh").onclick=()=>refresh();

  $("#btnExportPos").onclick = ()=>{
    if(!editor){ toast("Exportar solo en modo editor.","error"); return; }
    const blob = new Blob([JSON.stringify(positions, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `saez_positions_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("#btnImportPos").onclick = ()=>{
    if(!editor){ toast("Importar solo en modo editor.","error"); return; }
    $("#importFile").value = "";
    $("#importFile").click();
  };

  $("#importFile").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const txt = await file.text();
      const arr = JSON.parse(txt);
      if(!Array.isArray(arr)) throw new Error("JSON inválido");
      for(const p of arr){
        if(!p || !p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        const existing = positions.find(x=>String(x.name).toUpperCase()===String(p.name).toUpperCase());
        if(existing){ existing.lat=p.lat; existing.lng=p.lng; existing.hdg = normHdg(p.hdg||0); }
        else{ positions.push({id: crypto.randomUUID(), name:String(p.name), lat:p.lat, lng:p.lng, hdg:normHdg(p.hdg||0)}); }
      }
      saveJson(STORAGE.positions, positions);
      schedulePositionsSync();
      renderPositions();
      toast("Posiciones importadas");
    }catch(err){ console.error(err); toast("Error importando JSON","error"); }
  });

  $("#searchFlights").addEventListener("input",()=>renderFlightsList());

  function syncLine(){
    if(!temp.latlng || !temp.line) return;
    const hdg=normHdg($("#posHdg").value);
    temp.line.setLatLngs([temp.latlng, destPoint(temp.latlng.lat, temp.latlng.lng, hdg, 120)]);
  }

  $("#posHdg").addEventListener("input",()=>{
    const v=normHdg($("#posHdg").value);
    $("#posHdg").value=String(v);
    $("#posHdgSlider").value=String(v);
    syncLine();
  });

  $("#posHdgSlider").addEventListener("input",()=>{
    const v=normHdg($("#posHdgSlider").value);
    $("#posHdg").value=String(v);
    syncLine();
  });

  $("#posHdgSlider").addEventListener("wheel",(e)=>{
    e.preventDefault();
    const cur=normHdg($("#posHdgSlider").value);
    const next=normHdg(cur+(e.deltaY>0?-1:1));
    $("#posHdgSlider").value=String(next);
    $("#posHdg").value=String(next);
    syncLine();
  },{passive:false});

  $("#btnPosCancel").onclick=()=>{ clearTemp(); closeModal("modalPos"); };

  $("#btnPosSave").onclick=()=>{
    if(!temp.latlng){ toast("No hay punto seleccionado.","error"); return; }
    const name=($("#posName").value||"").trim();
    const hdg=normHdg($("#posHdg").value);
    if(!name){ toast("Ingresá el nombre/número.","error"); return; }

    const existing=positions.find(p=>String(p.name).toUpperCase()===String(name).toUpperCase());
    if(existing && (!temp.id || existing.id!==temp.id)){
      existing.lat=temp.latlng.lat; existing.lng=temp.latlng.lng; existing.hdg=hdg;
    }else if(temp.id){
      const p=positions.find(x=>x.id===temp.id);
      if(p){ p.name=name; p.lat=temp.latlng.lat; p.lng=temp.latlng.lng; p.hdg=hdg; }
    }else{
      positions.push({id:crypto.randomUUID(),name,lat:temp.latlng.lat,lng:temp.latlng.lng,hdg});
    }

    saveJson(STORAGE.positions,positions);
    schedulePositionsSync();
    clearTemp();
    closeModal("modalPos");
    renderPositions();
    toast("Posición guardada");
  };

  $("#btnPlay").onclick=()=>togglePlay();
  $("#timeSlider").addEventListener("input",()=>{
    const idx=Number($("#timeSlider").value||0);
    if(history[idx]){ applySnapshot(history[idx]); updateTimeLabel(); }
  });
}

init();

})();
