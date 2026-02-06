/**
 * API client: fetch JSON from Apps Script.
 * Expected response:
 * {
 *   serverTime: "2026-02-06T00:00:00.000Z",
 *   arrivals: [{ flight, reg, pos, time, origin, status }],
 *   departures: [{ flight, reg, pos, time, dest, gate, status, atd }],
 * }
 */
window.Api = (() => {
  async function fetchData(){
    const url = window.APP_CONFIG.API_URL;
    if(!url || url.includes("PASTE_")){
      throw new Error("API_URL no configurada. Editá js/config.js");
    }
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return json;
  }
  return { fetchData };
})();
