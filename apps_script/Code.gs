/**
 * SAEZ-ATCCTRL - Apps Script (Google Sheets -> JSON)
 *
 * Spreadsheet:
 * https://docs.google.com/spreadsheets/d/1PKBvMRZWZg-64OgQIvaqZHZO-b2wOQ50bG6yudOF3_Y/edit
 *
 * Sheets:
 * - tams_arribos1
 * - tams_salidas1
 *
 * Deploy:
 * 1) Extensiones > Apps Script
 * 2) Pegá este Code.gs
 * 3) Ajustá SPREADSHEET_ID si cambiara
 * 4) Implementar > Nueva implementación > Tipo: Aplicación web
 *    - Ejecutar como: tu usuario
 *    - Acceso: Cualquiera
 * 5) Copiá la URL y pegala en js/config.js (API_URL)
 */

const SPREADSHEET_ID = "1PKBvMRZWZg-64OgQIvaqZHZO-b2wOQ50bG6yudOF3_Y";
const ARR_SHEET = "tams_arribos1";
const DEP_SHEET = "tams_salidas1";

function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const arr = readArrivals_(ss.getSheetByName(ARR_SHEET));
  const dep = readDepartures_(ss.getSheetByName(DEP_SHEET));

  const out = {
    serverTime: new Date().toISOString(),
    arrivals: arr,
    departures: dep
  };

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Utility: normalize/trim
 */
function s_(v){
  if(v === null || v === undefined) return "";
  return String(v).trim();
}
function hasTime_(v){
  const t = s_(v);
  if(!t || t === "-") return false;
  // accept hh:mm or hh:mm:ss
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(t);
}
function rowHasTokens_(row, tokens){
  const upper = row.map(v => s_(v).toUpperCase());
  return tokens.some(tok => upper.some(c => c.indexOf(tok) !== -1));
}

/**
 * Arrivals mapping:
 * B flight, D reg, E pos, F ETA, G ATA, I origin, J status
 * Only show if F has time OR G has time (G overrides F).
 * If row contains CON/CAN/ALT anywhere -> skip.
 */
function readArrivals_(sh){
  if(!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  const SKIP = ["CON", "CAN", "ALT"];

  for(let r=1; r<values.length; r++){ // skip header
    const row = values[r];
    if(rowHasTokens_(row, SKIP)) continue;

    const flight = s_(row[1]);   // B
    const reg    = s_(row[3]);   // D
    const pos    = s_(row[4]);   // E
    const eta    = s_(row[5]);   // F
    const ata    = s_(row[6]);   // G
    const origin = s_(row[8]);   // I
    const status = s_(row[9]);   // J

    const time = hasTime_(ata) ? ata : eta;
    if(!hasTime_(time)) continue;

    out.push({
      flight, reg, pos,
      time,
      origin,
      status
    });
  }
  return out;
}

/**
 * Departures mapping:
 * B flight, C STD, F updated STD (replaces C if time), D reg, E pos,
 * G ATD (if time -> departed), H gate, I dest, J status (PRE/BOR/ULT/CER)
 * Skip if row contains CON/CAN/ALT anywhere.
 */
function readDepartures_(sh){
  if(!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  const SKIP = ["CON", "CAN", "ALT"];

  for(let r=1; r<values.length; r++){
    const row = values[r];
    if(rowHasTokens_(row, SKIP)) continue;

    const flight = s_(row[1]);   // B
    const std    = s_(row[2]);   // C
    const reg    = s_(row[3]);   // D
    const pos    = s_(row[4]);   // E
    const upd    = s_(row[5]);   // F
    const atd    = s_(row[6]);   // G
    const gate   = s_(row[7]);   // H
    const dest   = s_(row[8]);   // I
    const status = s_(row[9]);   // J

    const time = hasTime_(upd) ? upd : std;
    if(!hasTime_(time) && !hasTime_(atd)) continue; // ignore empty

    out.push({
      flight, reg, pos,
      time,
      atd,
      gate,
      dest,
      status
    });
  }
  return out;
}
