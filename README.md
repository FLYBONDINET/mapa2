# SAEZ-ATCCTRL PRO

## Ejecutar
- Abrí la carpeta en VS Code
- Live Server → `index.html`

## Configurar API
- Pegá `apps-script/Code.gs` en Apps Script
- Deploy como Web App (cualquiera con enlace)
- Pegá la URL /exec en ⚙︎

## Editor
- Botón Editar → password 12345678
- Click en mapa → posición + HDG
- Guardar: queda punto y, si hay vuelo, avión con color por matrícula.


## API
- Esta versión viene preconfigurada con la URL del Web App.
- Podés cambiarla en ⚙︎ (se guarda en LocalStorage).

## GitHub Pages
- Abrir desde GitHub Pages funciona igual (la configuración y posiciones quedan locales por navegador/PC).

## v6 (AUTO-SYNC)
- Posiciones creadas se guardan automáticamente en Google Sheets (hoja **saez_positions**).
- Registro persistente matrícula → última posición (hoja **aircraft_positions**).
- Modo Intermedia / OCC PRO + Auto-refresh en ⚙︎.
- Importar/Exportar posiciones (JSON) en modo editor.
