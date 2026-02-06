# SAEZ-ATCCTRL (OCC Map) — Visual Studio Code Project

Aplicación web (HTML/CSS/JS) estilo OCC para ver posiciones y tarjetas de vuelos sobre un mapa satelital oscuro.
Incluye **modo editor con contraseña** para crear posiciones (puntos) con heading (HDG) y **Apps Script** para leer Google Sheets y exponer un JSON.

## 1) Requisitos
- Un navegador moderno (Chrome/Edge).
- (Opcional) Servidor local para evitar CORS y para Service Worker:
  - VS Code + extensión **Live Server**, o
  - `python -m http.server 8080`

## 2) Configuración rápida
1. Abrí el proyecto en VS Code.
2. Editá `js/config.js` y pegá la URL de tu WebApp de Apps Script:
   - `API_URL: "https://script.google.com/macros/s/XXXX/exec"`
3. Iniciá con Live Server o un servidor local.
4. Botón **Refrescar** para traer datos.

## 3) Modo Editor (posiciones)
- Botón **Editar** → contraseña: `12345678`
- Click en el mapa → aparece un punto + línea (HDG) y un modal:
  - **Posición** (ej: 72, 50B, 14)
  - **HDG** (0–359) con scroll/slider
- Guardar → queda el punto con número.
- La lista de posiciones aparece en el panel lateral con botones **Editar** y **Eliminar**.

Las posiciones se guardan en `localStorage` del navegador (por equipo/navegador).
Si querés persistirlas en Google Sheets/Drive, se puede agregar en una iteración.

## 4) Datos de vuelos (Sheets)
La WebApp de Apps Script lee:

### Arribos: hoja `tams_arribos1`
- B: vuelo
- D: matrícula
- E: posición (puede ser `72>50B` para movimiento)
- F: hora arribo estimada (si es `-` no asignada)
- G: hora arribo real (si aparece, reemplaza a F)
- I: origen
- J: estado (EN VUELO / ATERRIZADO, etc)

### Salidas: hoja `tams_salidas1`
- B: vuelo
- C: hora salida programada
- F: hora salida actualizada (si existe, reemplaza a C)
- D: matrícula
- E: posición (puede ser `72>50B`)
- G: hora de despegue (si aparece, despegó)
- H: puerta
- I: destino
- J: estado salida (PRE / BOR / ULT / CER)

**Filtro remarks:** si en alguna celda de la fila aparece `CON`, `CAN` o `ALT`, se omite.

## 5) Timelapse
- El sistema guarda un historial corto de snapshots.
- Activá **Timelapse** y reproducí para ver el estado en el tiempo reciente.

## 6) Deploy de Apps Script
Ver `apps_script/Code.gs` (copiar/pegar en Apps Script y desplegar como WebApp).
