/* Small utilities */
window.Utils = {
  clamp(n, a, b){ return Math.max(a, Math.min(b, n)); },
  nowIso(){ return new Date().toISOString(); },
  fmtTime(t){
    if(!t) return "-";
    // Keep as string, but normalize typical sheet "hh:mm" or "hh:mm:ss"
    return String(t).trim();
  },
  normStr(s){ return (s ?? "").toString().trim(); },
  hasTime(v){
    const s = (v ?? "").toString().trim();
    if(!s || s === "-" ) return false;
    // accept hh:mm or hh:mm:ss
    return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) || /^\d{1,2}\.\d{2}$/.test(s);
  },
  tokenInRow(row, tokens){
    const upper = row.map(v => (v ?? "").toString().toUpperCase());
    return tokens.some(tok => upper.some(c => c.includes(tok)));
  },
  // Parse movement like "72>50B" or "72 > 50B"
  parseMove(posText){
    const s = (posText ?? "").toString().replace(/\s+/g,"");
    const m = s.match(/^([^>]+)>([^>]+)$/);
    if(!m) return null;
    return { from: m[1], to: m[2] };
  },
  // Basic debounce
  debounce(fn, ms=250){
    let t=null;
    return (...args)=>{
      clearTimeout(t);
      t=setTimeout(()=>fn(...args), ms);
    };
  },
  // LocalStorage wrapper
  storage: {
    get(key, fallback){
      try{
        const raw = localStorage.getItem(key);
        if(raw==null) return fallback;
        return JSON.parse(raw);
      }catch(e){ return fallback; }
    },
    set(key, val){
      localStorage.setItem(key, JSON.stringify(val));
    }
  }
};
