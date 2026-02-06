/**
 * UI helpers: modals, toasts, sidebar rendering, flight selection.
 */
window.UI = (() => {
  const modalRoot = document.getElementById("modalRoot");
  let toastTimer = null;

  function openModal(innerHtml){
    modalRoot.innerHTML = innerHtml;
    modalRoot.setAttribute("aria-hidden","false");
    const close = () => {
      modalRoot.setAttribute("aria-hidden","true");
      modalRoot.innerHTML = "";
    };
    modalRoot.addEventListener("click", (e) => {
      if(e.target === modalRoot) close();
    }, { once:true });
    return close;
  }

  function toast(msg, kind="info"){
    const el = document.getElementById("hudStatus");
    el.textContent = msg;
    el.style.color = {
      info: "rgba(255,255,255,0.75)",
      accent: "rgba(255,209,0,0.95)",
      ok: "rgba(44,255,153,0.95)",
      warn: "rgba(255,176,32,0.95)",
      danger: "rgba(255,77,77,0.95)"
    }[kind] || "rgba(255,255,255,0.75)";

    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{
      el.textContent = "Listo";
      el.style.color = "rgba(255,255,255,0.62)";
    }, 2500);
  }

  function modalPassword({ title, hint, placeholder, okText, cancelText }){
    return new Promise((resolve) => {
      const close = openModal(`
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal__title">${title}</div>
          <div class="modal__body">
            <div class="small">${hint}</div>
            <div class="field">
              <label>${placeholder}</label>
              <input id="pw" class="input" type="password" autocomplete="current-password" />
            </div>
          </div>
          <div class="modal__actions">
            <button id="cancel" class="btn btn--ghost">${cancelText}</button>
            <button id="ok" class="btn btn--accent">${okText}</button>
          </div>
        </div>
      `);
      const pw = modalRoot.querySelector("#pw");
      const ok = modalRoot.querySelector("#ok");
      const cancel = modalRoot.querySelector("#cancel");
      pw.focus();

      const done = (val)=>{ close(); resolve(val); };

      ok.addEventListener("click", ()=> done(pw.value));
      cancel.addEventListener("click", ()=> done(null));
      pw.addEventListener("keydown", (e)=>{ if(e.key==="Enter") done(pw.value); if(e.key==="Escape") done(null); });
    });
  }

  function modalPosition({ title, pos="", hdg=0 }){
    return new Promise((resolve) => {
      const close = openModal(`
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal__title">${title}</div>
          <div class="modal__body">
            <div class="field">
              <label>Número / Nombre de posición</label>
              <input id="pos" class="input" placeholder="Ej: 72, 50B, 14..." value="${escapeHtml(pos)}" />
            </div>
            <div class="field">
              <label>HDG (0–359)</label>
              <input id="hdg" class="input" type="number" min="0" max="359" step="1" value="${parseInt(hdg,10)||0}" />
            </div>
            <div class="field">
              <label>Ajuste rápido (scroll / slider)</label>
              <input id="hdgRange" class="input" type="range" min="0" max="359" step="1" value="${parseInt(hdg,10)||0}" />
            </div>
            <div class="small">Tip: con el mouse sobre el mapa, la rueda (scroll) ajusta el HDG mientras estás creando.</div>
          </div>
          <div class="modal__actions">
            <button id="cancel" class="btn btn--ghost">Cancelar</button>
            <button id="ok" class="btn btn--accent">Guardar</button>
          </div>
        </div>
      `);

      const posEl = modalRoot.querySelector("#pos");
      const hdgEl = modalRoot.querySelector("#hdg");
      const hdgRange = modalRoot.querySelector("#hdgRange");
      const ok = modalRoot.querySelector("#ok");
      const cancel = modalRoot.querySelector("#cancel");

      const sync = (v)=>{
        const n = Utils.clamp(parseInt(v,10)||0, 0, 359);
        hdgEl.value = n;
        hdgRange.value = n;
      };
      hdgEl.addEventListener("input", ()=> sync(hdgEl.value));
      hdgRange.addEventListener("input", ()=> sync(hdgRange.value));

      posEl.focus();

      const done = (val)=>{ close(); resolve(val); };

      ok.addEventListener("click", ()=>{
        const posName = Utils.normStr(posEl.value);
        const hdgVal = Utils.clamp(parseInt(hdgEl.value,10)||0,0,359);
        if(!posName){
          toast("La posición es obligatoria.", "warn");
          posEl.focus();
          return;
        }
        done({ pos: posName, hdg: hdgVal });
      });
      cancel.addEventListener("click", ()=> done(null));
      modalRoot.addEventListener("keydown", (e)=>{ if(e.key==="Escape") done(null); });
    });
  }

  function escapeHtml(str){
    return (str ?? "").toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderPositionsList(positions, { onEdit, onDelete, onFlyTo }){
    const root = document.getElementById("positionsList");
    const entries = Object.entries(positions);
    if(!entries.length){
      root.innerHTML = `<div class="small">No hay posiciones creadas todavía.</div>`;
      return;
    }
    root.innerHTML = entries
      .sort((a,b)=> a[0].localeCompare(b[0], "es", { numeric:true }))
      .map(([name, p])=>{
        return `
          <div class="item">
            <div class="item__left">
              <div class="item__title">Pos ${escapeHtml(name)}</div>
              <div class="item__sub">HDG ${p.hdg} • ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
            </div>
            <button class="iconbtn iconbtn--accent" data-act="fly" data-pos="${escapeHtml(name)}" title="Centrar">◎</button>
            <button class="iconbtn" data-act="edit" data-pos="${escapeHtml(name)}" title="Editar">✎</button>
            <button class="iconbtn iconbtn--danger" data-act="del" data-pos="${escapeHtml(name)}" title="Eliminar">🗑</button>
          </div>
        `;
      }).join("");

    root.querySelectorAll("button").forEach(btn=>{
      const act = btn.dataset.act;
      const pos = btn.dataset.pos;
      btn.addEventListener("click", ()=>{
        if(act==="edit") onEdit(pos);
        if(act==="del") onDelete(pos);
        if(act==="fly") onFlyTo(pos);
      });
    });
  }

  function renderFlightsList(flights, { onSelect }){
    const root = document.getElementById("flightsList");
    if(!flights.length){
      root.innerHTML = `<div class="small">No hay vuelos visibles con la configuración actual.</div>`;
      return;
    }
    root.innerHTML = flights.map(f=>{
      const mode = f.mode; // ARR / DEP / TA
      const pillClass = mode==="TA" ? "pill--accent" : (mode==="ARR" ? "pill--ok" : "pill--warn");
      const title = mode==="ARR" ? `${f.arr.flight} • ${f.reg}` :
                    mode==="DEP" ? `${f.dep.flight} • ${f.reg}` :
                    `${f.reg}`;
      const sub = mode==="ARR" ? `ARR ${f.arr.origin} • ${Utils.fmtTime(f.arr.time)} • Pos ${f.pos}` :
                  mode==="DEP" ? `DEP ${f.dep.dest} • ${Utils.fmtTime(f.dep.time)} • Pos ${f.pos}` :
                  `ARR ${f.arr.origin} ${Utils.fmtTime(f.arr.time)} • DEP ${f.dep.dest} ${Utils.fmtTime(f.dep.time)} • Pos ${f.pos}`;
      return `
        <div class="item" data-flightkey="${escapeHtml(f.key)}" style="cursor:pointer">
          <div class="item__left">
            <div class="item__title">${escapeHtml(title)}</div>
            <div class="item__sub">${escapeHtml(sub)}</div>
          </div>
          <span class="pill ${pillClass}">${escapeHtml(mode)}</span>
        </div>
      `;
    }).join("");

    root.querySelectorAll(".item").forEach(el=>{
      el.addEventListener("click", ()=> onSelect(el.dataset.flightkey));
    });
  }

  return {
    toast,
    modalPassword,
    modalPosition,
    renderPositionsList,
    renderFlightsList,
    escapeHtml,
  };
})();
