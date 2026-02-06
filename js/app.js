/**
 * Main application: map, rendering positions, aircraft cards, arrows, timelapse.
 */
(() => {
  const cfg = window.APP_CONFIG;

  // DOM
  const btnEdit = document.getElementById("btnEdit");
  const btnRefresh = document.getElementById("btnRefresh");
  const hudCounts = document.getElementById("hudCounts");
  const hudClock = document.getElementById("hudClock");
  const tlToggle = document.getElementById("tlToggle");
  const tlPlay = document.getElementById("tlPlay");
  const tlSlider = document.getElementById("tlSlider");
  const tlTime = document.getElementById("tlTime");

  // Leaflet map
  const map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
  }).setView([cfg.AIRPORT_CENTER.lat, cfg.AIRPORT_CENTER.lng], cfg.INITIAL_ZOOM);

  // Satellite tiles (Esri World Imagery)
  // Attribution is important.
  const tiles = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }
  ).addTo(map);

  // Layers
  const posLayer = L.layerGroup().addTo(map);
  const arrowLayer = L.layerGroup().addTo(map);
  const hdgTempLayer = L.layerGroup().addTo(map);
  const flightLayer = L.layerGroup().addTo(map);

  // Cards overlay container (Leaflet overlay pane)
  const cardsPane = map.getPanes().overlayPane;
  cardsPane.classList.add("cards-pane");

  let posMarkers = {};   // posName -> marker
  let flightCards = {};  // flightKey -> { el, data, latlng }
  let flightMarkers = {}; // flightKey -> marker
  let selectedKey = null;

  // Timelapse history
  const history = []; // { ts, payload, flights }
  let tlOn = false;
  let tlPlaying = false;
  let tlTimer = null;

  function setClock(ts){
    const d = ts ? new Date(ts) : new Date();
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    hudClock.textContent = `${hh}:${mm}:${ss}`;
  }
  setInterval(()=> setClock(null), 1000);

  function rebuildPositions(){
    posLayer.clearLayers();
    posMarkers = {};
    const positions = Editor.getPositions();

    for(const [name, p] of Object.entries(positions)){
      const marker = L.marker([p.lat, p.lng], {
        interactive: true,
        keyboard: false
      }).addTo(posLayer);

      marker.bindTooltip(`<span class="pos-label">Pos ${UI.escapeHtml(name)}</span>`, {
        permanent: true,
        direction: "top",
        opacity: 1,
        className: "pos-tooltip",
        offset: [0,-10]
      });

      marker.on("click", ()=>{
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      });

      posMarkers[name] = marker;
    }

    UI.renderPositionsList(positions, {
      onEdit: async (posName)=> {
        const positions = Editor.getPositions();
        const cur = positions[posName];
        if(!cur) return;
        const res = await Editor.promptPosition({ defaultPos: posName, defaultHdg: cur.hdg });
        if(!res) return;
        // rename if changed
        const nextName = res.pos;
        const next = { lat: cur.lat, lng: cur.lng, hdg: res.hdg };
        if(nextName !== posName){
          delete positions[posName];
        }
        positions[nextName] = next;
        Editor.setPositions(positions);
        rebuildPositions();
        renderAllFromLatest();
      },
      onDelete: (posName)=> {
        Editor.remove(posName);
        rebuildPositions();
        renderAllFromLatest();
      },
      onFlyTo: (posName)=> {
        const p = Editor.getPositions()[posName];
        if(!p) return;
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      }
    });
  }

  // Editor click handling
  let temp = { marker:null, line:null, latlng:null, hdg:0 };
  function clearTemp(){
    hdgTempLayer.clearLayers();
    temp = { marker:null, line:null, latlng:null, hdg:0 };
  }

  function hdgLine(latlng, hdgDeg){
    // Rough line: 60m length
    const R = 6378137;
    const dist = 80; // meters
    const brng = (hdgDeg * Math.PI) / 180;
    const lat1 = latlng.lat * Math.PI/180;
    const lon1 = latlng.lng * Math.PI/180;
    const lat2 = Math.asin(Math.sin(lat1)*Math.cos(dist/R) + Math.cos(lat1)*Math.sin(dist/R)*Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(dist/R)*Math.cos(lat1), Math.cos(dist/R)-Math.sin(lat1)*Math.sin(lat2));
    return [ [latlng.lat, latlng.lng], [lat2*180/Math.PI, lon2*180/Math.PI] ];
  }

  async function createOrEditAt(latlng, existingName=null){
    clearTemp();
    temp.latlng = latlng;
    temp.hdg = existingName ? (Editor.getPositions()[existingName]?.hdg ?? 0) : 0;

    // Temp point and line
    temp.marker = L.circleMarker(latlng, {
      radius: 6,
      color: "rgba(255,209,0,0.9)",
      weight: 2,
      fillColor: "rgba(255,209,0,0.35)",
      fillOpacity: 1
    }).addTo(hdgTempLayer);

    const pts = hdgLine(latlng, temp.hdg);
    temp.line = L.polyline(pts, { color: "rgba(255,209,0,0.9)", weight: 3, opacity: 0.85 }).addTo(hdgTempLayer);

    const res = await Editor.promptPosition({ defaultPos: existingName ?? "", defaultHdg: temp.hdg });
    if(!res){ clearTemp(); return; }

    const posName = res.pos;
    const hdgVal = res.hdg;
    Editor.addOrUpdate(posName, { lat: latlng.lat, lng: latlng.lng, hdg: hdgVal });
    clearTemp();
    rebuildPositions();
    renderAllFromLatest();
  }

  // scroll to rotate hdg while creating
  let lastWheelTarget = null;
  document.getElementById("map").addEventListener("wheel", (e)=>{
    if(!Editor.isEnabled()) return;
    if(!temp.latlng || !temp.line) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    temp.hdg = (temp.hdg + delta*2 + 360) % 360;
    const pts = hdgLine(temp.latlng, temp.hdg);
    temp.line.setLatLngs(pts);
    // attempt to sync modal if exists
    const root = document.getElementById("modalRoot");
    const hdg = root.querySelector("#hdg");
    const range = root.querySelector("#hdgRange");
    if(hdg && range){
      hdg.value = temp.hdg;
      range.value = temp.hdg;
    }
  }, { passive: false });

  map.on("click", async (e)=>{
    if(!Editor.isEnabled()) return;
    await createOrEditAt(e.latlng);
  });

  btnEdit.addEventListener("click", async ()=>{
    const res = await Editor.toggle();
    btnEdit.classList.toggle("is-on", res.enabled);
    document.body.classList.toggle("is-editing", res.enabled);
    if(!res.enabled) clearTemp();
    if(!res.enabled){
      refresh();
    }
  });

  // --- Flights rendering ---
  function buildFlights(payload){
    const arrivals = payload.arrivals || [];
    const departures = payload.departures || [];

    // Index by reg when possible
    const arrByReg = new Map();
    for(const a of arrivals){
      const reg = Utils.normStr(a.reg).toUpperCase();
      if(!reg) continue;
      arrByReg.set(reg, a);
    }
    const depByReg = new Map();
    for(const d of departures){
      const reg = Utils.normStr(d.reg).toUpperCase();
      if(!reg) continue;
      depByReg.set(reg, d);
    }

    const regs = new Set([...arrByReg.keys(), ...depByReg.keys()]);
    const flights = [];

    for(const reg of regs){
      const arr = arrByReg.get(reg) || null;
      const dep = depByReg.get(reg) || null;

      // Choose position: dep.pos preferred, else arr.pos
      const rawPos = Utils.normStr(dep?.pos || arr?.pos || "");
      const move = Utils.parseMove(rawPos);
      const pos = move ? move.from : rawPos;

      const mode = arr && dep ? "TA" : (arr ? "ARR" : "DEP");
      const key = reg || (arr?.flight ?? dep?.flight ?? Math.random().toString(16).slice(2));
      flights.push({ key, reg, pos, move, mode, arr, dep });
    }

    // Filter: only show if has a position and exists in editor positions
    const positions = Editor.getPositions();
    const visible = flights.filter(f => f.pos && positions[f.pos]);

    // Sort by pos then reg
    visible.sort((a,b)=> (a.pos||"").localeCompare(b.pos||"", "es", {numeric:true}) || (a.reg||"").localeCompare(b.reg||""));
    return visible;
  }

  function clearCardsAndArrows(){
    for(const k of Object.keys(flightCards)){
      flightCards[k].el.remove();
    }
    flightCards = {};
    flightLayer.clearLayers();
    flightMarkers = {};
    arrowLayer.clearLayers();
  }

  function createCardEl(f){
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.flightkey = f.key;
    el.innerHTML = renderCardHtml(f);
    enableDrag(el);
    el.addEventListener("click", (e)=>{
      e.stopPropagation();
      selectFlight(f.key, true);
    });
    return el;
  }

  function renderCardHtml(f){
    const posTxt = f.pos ? `Pos ${UI.escapeHtml(f.pos)}` : "Sin pos";
    const reg = UI.escapeHtml(f.reg || "-");

    const parts = [];
    if(f.arr){
      parts.push(`
        <div class="card__grid">
          <div><div class="k">ARR</div><div class="v">${UI.escapeHtml(f.arr.flight || "-")}</div></div>
          <div><div class="k">ORIG</div><div class="v">${UI.escapeHtml(f.arr.origin || "-")}</div></div>
          <div><div class="k">HORA</div><div class="v">${UI.escapeHtml(Utils.fmtTime(f.arr.time))}</div></div>
          <div><div class="k">EST</div><div class="v">${UI.escapeHtml(f.arr.status || "-")}</div></div>
        </div>
      `);
    }
    if(f.dep){
      parts.push(`
        <div class="card__grid">
          <div><div class="k">DEP</div><div class="v">${UI.escapeHtml(f.dep.flight || "-")}</div></div>
          <div><div class="k">DEST</div><div class="v">${UI.escapeHtml(f.dep.dest || "-")}</div></div>
          <div><div class="k">HORA</div><div class="v">${UI.escapeHtml(Utils.fmtTime(f.dep.time))}</div></div>
          <div><div class="k">EST</div><div class="v">${UI.escapeHtml(f.dep.status || "-")}</div></div>
        </div>
      `);
    }

    const pills = [];
    if(f.mode==="TA") pills.push(`<span class="pill pill--accent">TA</span>`);
    else if(f.mode==="ARR") pills.push(`<span class="pill pill--ok">ARR</span>`);
    else pills.push(`<span class="pill pill--warn">DEP</span>`);

    if(f.move) pills.push(`<span class="pill pill--warn">MOVE ${UI.escapeHtml(f.move.from)}→${UI.escapeHtml(f.move.to)}</span>`);

    return `
      <div class="card__top">
        <div class="card__reg">${reg}</div>
        <div class="card__pos">${posTxt}</div>
      </div>
      <div class="sep"></div>
      ${parts.join('<div class="sep"></div>')}
      <div class="card__two">${pills.join("")}</div>
    `;
  }

  function enableDrag(el){
    let dragging = false;
    let startX=0, startY=0, origX=0, origY=0;
    el.addEventListener("pointerdown", (e)=>{
      dragging = true;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      origX = parseFloat(el.dataset.x)||0;
      origY = parseFloat(el.dataset.y)||0;
    });
    el.addEventListener("pointermove", (e)=>{
      if(!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.dataset.x = origX + dx;
      el.dataset.y = origY + dy;
      Layout.applyTransform(el);
    });
    el.addEventListener("pointerup", ()=>{
      dragging = false;
    });
    el.addEventListener("pointercancel", ()=> dragging=false);
  }

  function projectToPane(latlng){
    const p = map.latLngToLayerPoint(latlng);
    return { x: p.x, y: p.y };
  }

  function placeCardAt(el, latlng){
    // Place near point; then use dataset transform offsets
    const p = projectToPane(latlng);
    el.style.left = `${p.x}px`;
    el.style.top  = `${p.y}px`;
    if(el.dataset.x==null){ el.dataset.x = 14; el.dataset.y = -12; }
    Layout.applyTransform(el);
  }

  function drawMoveArrow(fromPos, toPos){
    const positions = Editor.getPositions();
    const a = positions[fromPos], b = positions[toPos];
    if(!a || !b) return;

    const poly = L.polyline([[a.lat,a.lng],[b.lat,b.lng]], {
      color: "rgba(0,210,255,0.85)",
      weight: 3,
      opacity: 0.85,
      dashArray: "6 6"
    }).addTo(arrowLayer);

    // simple arrow head: small triangle marker near end
    const head = L.circleMarker([b.lat,b.lng], {
      radius: 6, color: "rgba(0,210,255,0.95)", weight: 2, fillOpacity: 1, fillColor:"rgba(0,210,255,0.45)"
    }).addTo(arrowLayer);

    return { poly, head };
  }

  function renderFlights(flights){
    clearCardsAndArrows();

    const positions = Editor.getPositions();
    const cards = [];

    for(const f of flights){
      const p = positions[f.pos];
      if(!p) continue;

      const el = createCardEl(f);
      cardsPane.appendChild(el);
      placeCardAt(el, L.latLng(p.lat, p.lng));

      flightCards[f.key] = { el, data:f, latlng: L.latLng(p.lat,p.lng) };
      const icon = L.divIcon({
        className: "aircraft-marker",
        html: `<div class="aircraft-marker__glyph" style="--hdg:${p.hdg ?? 0}deg;">✈</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const marker = L.marker([p.lat, p.lng], { icon, interactive: false }).addTo(flightLayer);
      flightMarkers[f.key] = marker;
      cards.push(el);

      if(f.move){
        drawMoveArrow(f.move.from, f.move.to);
      }
    }

    if(cfg.CARD_AUTO_LAYOUT){
      Layout.autoLayout(cards, document.getElementById("map"));
    }

    // Sidebar list
    UI.renderFlightsList(flights, { onSelect: (key)=> selectFlight(key, true) });

    hudCounts.textContent = `${Object.keys(Editor.getPositions()).length} posiciones • ${flights.length} vuelos`;
  }

  function selectFlight(key, fly=false){
    selectedKey = key;
    for(const [k,v] of Object.entries(flightCards)){
      v.el.classList.toggle("is-selected", k===key);
    }
    const f = flightCards[key];
    if(f && fly){
      map.flyTo(f.latlng, Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }

  map.on("click", ()=>{ selectedKey = null; for(const v of Object.values(flightCards)) v.el.classList.remove("is-selected"); });

  function rerenderCardContent(){
    for(const [k, v] of Object.entries(flightCards)){
      v.el.innerHTML = renderCardHtml(v.data);
    }
  }

  function relayoutOnMove(){
    const positions = Editor.getPositions();
    for(const [k, v] of Object.entries(flightCards)){
      const f = v.data;
      const p = positions[f.pos];
      if(!p) continue;
      v.latlng = L.latLng(p.lat,p.lng);
      placeCardAt(v.el, v.latlng);
    }
    if(cfg.CARD_AUTO_LAYOUT){
      Layout.autoLayout(Object.values(flightCards).map(x=>x.el), document.getElementById("map"));
    }
  }

  map.on("move zoom", Utils.debounce(()=> relayoutOnMove(), 60));

  // --- Data loop ---
  let latestPayload = null;
  let latestFlights = [];

  function pushHistory(payload, flights){
    history.push({ ts: Date.now(), payload, flights });
    while(history.length > cfg.HISTORY_MAX) history.shift();
    // Update slider
    tlSlider.max = Math.max(0, history.length-1);
    if(!tlOn){
      tlSlider.value = tlSlider.max;
    }
  }

  function renderAll(payload){
    latestPayload = payload;
    latestFlights = buildFlights(payload);
    renderFlights(latestFlights);
    // status
    UI.toast("Datos actualizados", "ok");
  }

  function renderAllFromLatest(){
    if(!latestPayload) return;
    latestFlights = buildFlights(latestPayload);
    renderFlights(latestFlights);
    if(selectedKey) selectFlight(selectedKey, false);
  }

  async function refresh(){
    try{
      document.getElementById("hudStatus").textContent = "Actualizando…";
      const payload = await Api.fetchData();
      const flights = buildFlights(payload);
      pushHistory(payload, flights);

      if(tlOn){
        // if timelapse is on, don't force to latest unless slider at end
        if(parseInt(tlSlider.value,10) === parseInt(tlSlider.max,10)){
          renderAll(payload);
        }
      }else{
        renderAll(payload);
      }

      setClock(payload.serverTime || null);
    }catch(e){
      UI.toast("Error API: " + e.message, "danger");
      console.error(e);
    }
  }

  btnRefresh.addEventListener("click", refresh);
  setInterval(()=>{ if(!tlOn || (parseInt(tlSlider.value,10)===parseInt(tlSlider.max,10))) refresh(); }, cfg.REFRESH_MS);

  // --- Timelapse controls ---
  function setTimelapse(on){
    tlOn = on;
    tlPlay.disabled = !on;
    tlSlider.disabled = !on;
    if(on){
      // start at latest
      tlSlider.value = tlSlider.max;
      applyTimelapseIndex(parseInt(tlSlider.value,10));
      UI.toast("Timelapse activado", "accent");
    }else{
      stopTimelapse();
      // render latest live
      if(history.length){
        const last = history[history.length-1];
        latestPayload = last.payload;
        latestFlights = last.flights;
        renderFlights(latestFlights);
      }
      UI.toast("Timelapse desactivado", "info");
    }
  }

  function applyTimelapseIndex(idx){
    idx = Utils.clamp(idx, 0, Math.max(0, history.length-1));
    const snap = history[idx];
    if(!snap) return;
    latestPayload = snap.payload;
    latestFlights = snap.flights;
    renderFlights(latestFlights);
    const d = new Date(snap.ts);
    tlTime.textContent = d.toLocaleTimeString("es-AR");
  }

  function stopTimelapse(){
    tlPlaying = false;
    tlPlay.textContent = "▶";
    clearInterval(tlTimer);
    tlTimer = null;
  }

  function playTimelapse(){
    if(!tlOn) return;
    if(tlPlaying){
      stopTimelapse();
      return;
    }
    tlPlaying = true;
    tlPlay.textContent = "❚❚";
    tlTimer = setInterval(()=>{
      let v = parseInt(tlSlider.value,10);
      if(v >= parseInt(tlSlider.max,10)){
        stopTimelapse();
        return;
      }
      v++;
      tlSlider.value = v;
      applyTimelapseIndex(v);
    }, 800);
  }

  tlToggle.addEventListener("change", ()=> setTimelapse(tlToggle.checked));
  tlPlay.addEventListener("click", playTimelapse);
  tlSlider.addEventListener("input", ()=> applyTimelapseIndex(parseInt(tlSlider.value,10)));

  // Init
  rebuildPositions();
  refresh();

})();
