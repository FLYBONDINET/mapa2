/**
 * Configuración principal
 * - API_URL: URL pública de tu Apps Script desplegado como WebApp (doGet devuelve JSON)
 */
window.APP_CONFIG = {
  AIRPORT_CENTER: { lat: -34.8222, lng: -58.5358 }, // SAEZ aprox
  INITIAL_ZOOM: 14,
  API_URL: "https://script.google.com/macros/s/AKfycbyWcyrA4bsFTB8MgRui-6ntcXcDnFPG0rmhYcfeFbudrxbMOQlDof5cYKKXxwubKRTSAQ/exec",
  REFRESH_MS: 15000,          // refresco automático (ms)
  HISTORY_MAX: 60,            // snapshots para timelapse
  CARD_AUTO_LAYOUT: true,     // evitar superposición de tarjetas
};
