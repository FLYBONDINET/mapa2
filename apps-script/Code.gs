/**
 * SAEZ-ATCCTRL — Apps Script JSON API
 * Columnas según tus capturas.
 */
const SPREADSHEET_ID = "1PKBvMRZWZg-64OgQIvaqZHZO-b2wOQ50bG6yudOF3_Y";
const SHEET_ARR = "tams_arribos1";
const SHEET_DEP = "tams_salidas1";

function doGet(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const arrivals = readArrivals_(ss.getSheetByName(SHEET_ARR));
  const departures = readDepartures_(ss.getSheetByName(SHEET_DEP));
  const payload = { updatedAt: new Date().toISOString(), arrivals, departures };
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
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
    const flightNo = (cia && num) ? (cia + num) : (num || "");
    const time = (atd && atd!=="-") ? atd : ((etd && etd!=="-") ? etd : ((hora && hora!=="-") ? hora : ""));
    out.push({ reg, flightNo, pos, time, takeoff: (atd && atd!=="-")?atd:"", gate, dest, state: remark });
  }
  return out;
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
