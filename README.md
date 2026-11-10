# Tiktato

[![Versión](https://img.shields.io/github/v/release/alvaro-salort/Tiktato?style=for-the-badge&logo=github&logoColor=white&color=2ea44f&label=VERSION)](https://github.com/alvaro-salort/Tiktato/releases/latest)
[![Descargas](https://img.shields.io/github/downloads/alvaro-salort/Tiktato/total?style=for-the-badge&logo=windows&logoColor=white&color=0078D4&label=DESCARGAS)](https://github.com/alvaro-salort/Tiktato/releases)
[![TikTok LIVE](https://img.shields.io/badge/TIKTOK_LIVE-GRATIS-010101?style=for-the-badge&logo=tiktok&logoColor=white)](https://github.com/alvaro-salort/Tiktato)
[![Licencia](https://img.shields.io/badge/LICENCIA-GPLv3-E95420?style=for-the-badge&logo=gnu&logoColor=white)](LICENSE)
[![OBS Ready](https://img.shields.io/badge/OBS_STUDIO-OVERLAYS-302E31?style=for-the-badge&logo=obsstudio&logoColor=white)](https://github.com/alvaro-salort/Tiktato)

**TikTato** es una aplicación de escritorio de código abierto diseñada para streamers de **TikTok LIVE** que permite automatizar y configurar alertas de sonido, overlays para **OBS Studio** y **TikTok LIVE Studio**, leer los mensajes del chat con voz (TTS) e interactuar con la audiencia en tiempo real, sin suscripciones ni paywalls.

> Proyecto independiente de código abierto (GPLv3). No está afiliado a TikTok. Úsalo solo con directos y cuentas que tengas derecho a gestionar.

## Descargar

- [Instalador de Windows v1.1.0 (`Tiktato-Setup-1.1.0.exe`)](https://github.com/alvaro-salort/Tiktato/releases/latest)
- [Versión portable v1.1.0 (`Tiktato-Portable-1.1.0.exe`)](https://github.com/alvaro-salort/Tiktato/releases/latest)

También puedes ejecutarlo desde el código fuente con `npm install` y `npm start`.

<img width="1365" height="692" alt="image" src="https://github.com/user-attachments/assets/1b781f02-0c57-4c35-82e8-2d9637f7d8ca" />

![Panel de Tiktato](docs/dashboard.png)

## Qué incluye

- **Menú lateral con 4 secciones dedicadas**: Navegación ágil y accesible entre *Sonidos y Alertas*, *Overlay de Alertas*, *Frasco de Donaciones* y *Voz del Chat (TTS)*, con personalización rápida de regalos destacados, barra de estado único y controles organizados.
- **Conexión directa y resiliente**: Conéctate a tu TikTok LIVE simplemente con tu nombre de usuario, con validación estricta de sala en vivo (`status === 2`), respaldo por scraping de perfil y detección en tiempo real de pausas, reanudaciones y cortes del directo.
- **Reglas de sonido personalizables**: Asigna sonidos específicos a **regalos**, **follows**, **shares**, **likes**, **suscripciones / superfans** y **entradas al directo**.
- **Manejo preciso de rachas de regalos**: Opción activable para que una racha de $N$ regalos (ej. 5 rosas) reproduzca $N$ veces su sonido asignado una detrás de otra, evitando duplicados cuando se envía un único regalo.
- **Catálogo de regalos integrado**: Tarjetas rápidas y detección por `giftId` oficial (Rosa, Eres increíble, GG, Maracas, Galaxia, TikTok Universe, etc.) con coincidencia bilingüe (español/inglés) y comodines.
- **Biblioteca y sonidos propios**: Incluye sonidos sintetizados de fábrica (moneda, campanilla, pop, destello, fanfarria, redoble) y permite importar tus propios archivos de audio (MP3, WAV, OGG, M4A, AAC, FLAC, WEBM hasta 30 MB).
- **Overlay de alertas para OBS y TikTok LIVE Studio**: Notificación animada transparente con avatar centrado, badge de monedas, etiqueta y barra de progreso.
- **Frasco de Donaciones (Física 2D con Matter.js)**:
  - Botella de vidrio multicapa SVG con efectos de transparencia y reflejos.
  - Simulación física 2D en tiempo real: los regalos caen y rebotan dentro de la botella como esferas con el ícono de cada regalo.
  - Escala logarítmica de radio según el valor del regalo ($R \in [11, 100]\text{ px}$).
  - Embudos de rebote superiores para impedir expulsión accidental.
  - Carrusel rotativo de máximos donantes (*Leaderboard*) con medallas e insignias.
  - Alerta emergente en cada donación y partículas de celebración al alcanzar la meta.
  - **Modo Ventana Nativa para TikTok LIVE Studio**: Permite abrir el Frasco en una ventana dedicada (`Tiktato - Frasco`) con selector rápido de fondo (**Verde Chroma**, **Oscuro**, **Azul Chroma**, **Magenta** o **Transparente**) para quienes transmiten directamente desde TikTok LIVE Studio sin OBS.
  - Modo de calibración/prueba con HUD interactivo (`/jar?test=1`).
- **Voz para Chat y Regalos (TTS)**:
  - Selector de dialectos naturales de Google (España, LatAm, México, Argentina, EE.UU.) y compatibilidad automática con todas las voces del sistema instaladas en Windows.
  - **Lectura opcional del nombre de usuario**: Elige si el TTS lee el nombre del espectador antes del mensaje (`Usuario: hola`) o directamente el mensaje (`hola`), sin muletillas innecesarias.
  - **Filtros opcionales de chat por rol/nivel**: Por defecto lee todos los mensajes del chat (ideal para canales en crecimiento), con opción de restringir la lectura solo a **Moderadores**, **Suscriptores / Superfans**, **Mensajes destacados**, **Amigos**, **Seguidores**, **Donadores** (nivel mínimo configurable) o **Miembros del club**.
  - **Moderación automática en vivo**: Si un moderador borra un mensaje o banea a un usuario en TikTok LIVE, Tiktato cancela y elimina automáticamente sus mensajes de la cola de voz.
  - **Control de historial (backlog)**: Lee como máximo los últimos 5 mensajes y evita repetir mensajes ya leídos tras reconexiones.
  - Cola inteligente con **auto-ducking** (atenúa los efectos sonoros mientras habla el TTS) y filtro anti-spam.
- **Seguridad y privacidad**: URLs locales protegidas mediante tokens únicos. Credenciales de sesión cifradas localmente con el llavero seguro de Windows (`safeStorage`).

![Overlay de alertas](docs/overlay.png)

![Frasco de donaciones](docs/jar.png)

![Configuración de TTS](docs/tts.png)

## Estructura del proyecto

```text
Tiktato/
├── electron/
│   ├── main.cjs            # Proceso principal de Electron, servidor HTTP/WS local y ventana Studio
│   ├── config.cjs          # Gestión y persistencia segura de la configuración (config.json)
│   ├── events.cjs          # Normalización y enriquecimiento de eventos de TikTok LIVE
│   ├── alert-matcher.cjs   # Motor de coincidencia de reglas y cooldowns
│   ├── tiktok-service.cjs  # Cliente de conexión TikTok LIVE (piratetok-live-js) con reconexión
│   └── preload.cjs         # Context bridge seguro para el panel de control
├── renderer/
│   ├── index.html          # Panel de control de escritorio con menú lateral
│   ├── styles.css          # Estilos Bento / Material 3 y componentes de UI
│   ├── app.js              # Lógica de la interfaz de usuario, navegación y gráficos
│   └── assets/             # Logo, íconos y tipografías Nunito y Fredoka
├── overlay/
│   ├── overlay.html        # Página web transparente para OBS Browser Source
│   ├── overlay.css         # Animaciones y diseño de la tarjeta de alerta
│   ├── overlay.js          # Cliente WebSocket y cola de renderizado
│   ├── jar.html            # Overlay del Frasco de Donaciones 2D
│   ├── jar.css             # Estilos del frasco, ventana nativa y leaderboard
│   └── jar.js              # Motor de física 2D (Matter.js) y renderizado SVG
├── shared/
│   ├── audio-engine.js     # Motor de audio Web Audio API / HTML5 Audio con ducking y volumen > 100%
│   └── tts-engine.js       # Motor de síntesis de voz (Google TTS + Web Speech API fallback)
├── tests/                  # 91 pruebas unitarias automáticas con el runner nativo de Node.js
└── package.json            # Scripts, dependencias y configuración de electron-builder
```

## Requisitos

- **Windows 10 / 11** (64 bits).
- Conexión a Internet para conectar con TikTok LIVE y descargar voces de Google Speech.
- Para ejecutar desde el código fuente: **Node.js 22 LTS** o superior.

## Instalación para desarrollo

```bash
git clone https://github.com/alvaro-salort/Tiktato.git
cd Tiktato
npm install
npm test
npm start
```

## Empaquetar instaladores

Para compilar el instalador estándar (`.exe` con NSIS) y la versión portable:

```bash
npm run dist
```

Los binarios resultantes se generarán en la carpeta `dist/`.

### Notas sobre la versión Portable y Actualizaciones

- **Auto-actualizaciones**: La versión instalada con NSIS (`Tiktato-Setup-*.exe`) se actualiza automáticamente de forma diferencial mediante GitHub Releases sin necesidad de privilegios de administrador (UAC). La versión portable no puede auto-actualizarse debido a que Windows mantiene el `.exe` bloqueado mientras está en ejecución.
- **Portabilidad real de datos**: Para que la configuración viaje con la versión portable (ej. en un pendrive USB), crea una carpeta llamada `tiktato-data` al lado del ejecutable `Tiktato-Portable-*.exe`. Si la carpeta existe, Tiktato guardará su configuración, sonidos y registros allí en lugar de `%APPDATA%\tiktato`.
- **Seguridad de sesión TikTok (DPAPI)**: Las credenciales de sesión opcional (`sessionid` y `tt-target-idc`) se cifran mediante `safeStorage` (DPAPI de Windows). Si copias la carpeta `tiktato-data` a otra computadora, Windows no podrá descifrar la clave y deberás volver a iniciar sesión mediante el código QR.

## Licencia

Distribuido bajo la licencia **GNU General Public License v3.0**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
