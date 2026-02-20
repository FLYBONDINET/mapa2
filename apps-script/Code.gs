/**
 * SAEZ-ATCCTRL — Apps Script JSON API (v6)
 * - Crea y mantiene:
 *   - saez_positions: posiciones creadas (ID, Nombre, Lat, Lng, HDG)
 *   - aircraft_positions: matrícula -> última posición (persistente)
 *
 * GET /exec
 * GET /exec?action=exportPositions
 * GET /exec?action=savePositions&data=<base64(JSON positions)>   (sin preflight CORS)
 */

const SPREADSHEET_ID = "1PKBvMRZWZg-64OgQIvaqZHZO-b2wOQ50bG6yudOF3_Y";
const SHEET_ARR = "tams_arribos1";
const SHEET_DEP = "tams_salidas1";
const SHEET_POS = "saez_positions";
const SHEET_ACREG = "aircraft_positions";

function doGet(e){
  const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "data";
  ensureSheets_();

  if(action === "exportPositions"){
    return json_({ positions: readPositions_() });
  }

  if(action === "savePositions"){
    // data llega como base64url (sin + / =). Apps Script: base64DecodeWebSafe.
    let data = (e && e.parameter && e.parameter.data) ? String(e.parameter.data) : "";
    try{
      data = data.replace(/\s/g,'');
      const jsonStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString("UTF-8");
      const arr = JSON.parse(jsonStr);
      writePositions_(Array.isArray(arr) ? arr : []);
      return json_({ ok:true });
    }catch(err){
      return json_({ ok:false, error:String(err) });
    }
  }

  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const arrivals = readArrivals_(ss.getSheetByName(SHEET_ARR));
  const departures = readDepartures_(ss.getSheetByName(SHEET_DEP));

  upsertAircraftRegistry_(arrivals, departures);

  return json_({
    updatedAt: new Date().toISOString(),
    arrivals,
    departures,
    positions: readPositions_(),
    aircraftPositions: readAircraftRegistry_()
  });
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheets_(){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let sh = ss.getSheetByName(SHEET_POS);
  if(!sh){
    sh = ss.insertSheet(SHEET_POS);
    sh.getRange(1,1,1,5).setValues([["ID","Nombre","Lat","Lng","HDG"]]);
  }

  let ar = ss.getSheetByName(SHEET_ACREG);
  if(!ar){
    ar = ss.insertSheet(SHEET_ACREG);
    ar.getRange(1,1,1,5).setValues([["Matricula","Posicion","UpdatedAt","Fuente","Note"]]);
  }
}

// Arribos: A Cía, B Nro, C Hora, D Matricula, E Pos, F ETA, G ATA, H Cinta, I Origen, J Remark
function readArrivals_(sh){
  if(!sh) return [];
  const last = sh.getLastRow();
  if(last < 2) return [];
  const values = sh.getRange(2,1,last-1,10).getValues();
  const out=[];
  for(const r of values){
    const cia = normStr_(r[0]);
    const num = normStr_(r[1]);
    const hora = normTime_(r[2]);
    const reg = normStr_(r[3]);
    const pos = normStr_(r[4]);
    const eta = normTime_(r[5]);
    const ata = normTime_(r[6]);
    const belt = normStr_(r[7]);
    const origin = normStr_(r[8]);
    const remark = normStr_(r[9]);
    if(!reg) continue;
    const flightNo = (cia && num) ? (cia + num) : (num || "");
    const time = (ata && ata!=="-") ? ata : ((eta && eta!=="-") ? eta : ((hora && hora!=="-") ? hora : ""));
    out.push({ reg, flightNo, pos, time, origin, state: remark, belt });
  }
  return out;
}

// Salidas: A Cía, B Nro, C Hora, D Matricula, E Pos, F ETD, G ATD, H Puerta, I Destino, J Remark
function readDepartures_(sh){
  if(!sh) return [];
  const last = sh.getLastRow();
  if(last < 2) return [];
  const values = sh.getRange(2,1,last-1,10).getValues();
  const out=[];
  for(const r of values){
    const cia = normStr_(r[0]);
    const num = normStr_(r[1]);
    const hora = normTime_(r[2]);
    const reg = normStr_(r[3]);
    const pos = normStr_(r[4]);
    const etd = normTime_(r[5]);
    const atd = normTime_(r[6]);
    const gate = normStr_(r[7]);
    const dest = normStr_(r[8]);
    const remark = normStr_(r[9]);
    if(!reg) continue;
    const rr = (remark||"").toUpperCase();
    if(rr.includes("CON") || rr.includes("CAN") || rr.includes("ALT")) continue;
    const flightNo = (cia && num) ? (cia + num) : (cia ? cia+num : (num||""));
    const time = (atd && atd!=="-") ? atd : ((etd && etd!=="-") ? etd : ((hora && hora!=="-") ? hora : ""));
    out.push({ reg, flightNo, pos, time, takeoff: (atd && atd!=="-")?atd:"", gate, dest, state: remark });
  }
  return out;
}

function readPositions_(){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_POS);
  const last = sh.getLastRow();
  if(last < 2) return [];
  const values = sh.getRange(2,1,last-1,5).getValues();
  const out=[];
  for(const r of values){
    const id = normStr_(r[0]);
    const name = normStr_(r[1]);
    const lat = Number(r[2]);
    const lng = Number(r[3]);
    const hdg = Number(r[4]);
    if(!name || !isFinite(lat) || !isFinite(lng)) continue;
    out.push({ id: id || Utilities.getUuid(), name, lat, lng, hdg: isFinite(hdg)?Math.round(hdg):0 });
  }
  return out;
}

function writePositions_(arr){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_POS);

  const existing = readPositions_();
  const mapByName = {};
  for(const p of existing) mapByName[String(p.name).toUpperCase()] = p;

  for(const p of arr){
    if(!p) continue;
    const name = normStr_(p.name);
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const hdg = Number(p.hdg);
    if(!name || !isFinite(lat) || !isFinite(lng)) continue;

    const key = String(name).toUpperCase();
    const id = normStr_(p.id) || (mapByName[key] ? mapByName[key].id : Utilities.getUuid());
    mapByName[key] = { id, name, lat, lng, hdg: isFinite(hdg)?(Math.round(hdg)%360):0 };
  }

  const rows = Object.values(mapByName)
    .sort((a,b)=> String(a.name).localeCompare(String(b.name), undefined, {numeric:true}))
    .map(p=>[p.id,p.name,p.lat,p.lng,p.hdg]);

  sh.clearContents();
  sh.getRange(1,1,1,5).setValues([["ID","Nombre","Lat","Lng","HDG"]]);
  if(rows.length) sh.getRange(2,1,rows.length,5).setValues(rows);
}

function readAircraftRegistry_(){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_ACREG);
  const last = sh.getLastRow();
  if(last < 2) return [];
  const values = sh.getRange(2,1,last-1,5).getValues();
  const out=[];
  for(const r of values){
    const reg = normStr_(r[0]);
    const pos = normStr_(r[1]);
    const updatedAt = normStr_(r[2]);
    const source = normStr_(r[3]);
    if(!reg) continue;
    out.push({ reg, pos, updatedAt, source });
  }
  return out;
}

function upsertAircraftRegistry_(arrivals, departures){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_ACREG);

  const last = sh.getLastRow();
  const existing = (last >= 2) ? sh.getRange(2,1,last-1,5).getValues() : [];
  const map = {};
  for(let i=0;i<existing.length;i++){
    const reg = normStr_(existing[i][0]);
    if(reg) map[reg.toUpperCase()] = i;
  }

  const now = new Date().toISOString();

  function normalizePos(posStr){
    const s = normStr_(posStr);
    const m = s.match(/^\s*([^>\s]+)\s*>\s*([^>\s]+)\s*$/);
    return m ? normStr_(m[2]) : s;
  }

  function upsert(reg, pos, source){
    if(!reg) return;
    const p = normalizePos(pos);
    if(!p) return;
    const key = reg.toUpperCase();
    const row = [reg, p, now, source, ""];
    if(Object.prototype.hasOwnProperty.call(map,key)){
      existing[map[key]] = row;
    } else {
      map[key] = existing.length;
      existing.push(row);
    }
  }

  for(const a of arrivals||[]) if(a && a.reg && a.pos) upsert(a.reg, a.pos, "ARR");
  for(const d of departures||[]) if(d && d.reg && d.pos) upsert(d.reg, d.pos, "DEP");

  sh.clearContents();
  sh.getRange(1,1,1,5).setValues([["Matricula","Posicion","UpdatedAt","Fuente","Note"]]);
  if(existing.length) sh.getRange(2,1,existing.length,5).setValues(existing);
}

function normStr_(v){ if(v===null||v===undefined) return ""; return String(v).trim(); }
function normTime_(v){
  if(v===null||v===undefined) return "";
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
  const s=String(v).trim();
  if(!s) return "";
  if(s === "-") return "-";
  const m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if(m){ const hh=m[1].length===1?("0"+m[1]):m[1]; return hh+":"+m[2]; }
  return s;
}
