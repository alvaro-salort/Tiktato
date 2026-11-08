# Tiktato

[![Versión](https://img.shields.io/github/v/release/alvaro-salort/Tiktato?color=teal&label=versi%C3%B3n)](https://github.com/alvaro-salort/Tiktato/releases/latest)
[![Licencia](https://img.shields.io/badge/licencia-GPLv3-orange)](LICENSE)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows-blue)](https://github.com/alvaro-salort/Tiktato/releases)
[![TikTok LIVE](https://img.shields.io/badge/TikTok%20LIVE-sin%20costo-pink)](https://github.com/alvaro-salort/Tiktato)

**TikTato** es una aplicación de escritorio de código abierto diseñada para streamers de **TikTok LIVE** que permite automatizar y configurar alertas de sonido, overlays para **OBS Studio** y **TikTok LIVE Studio**, leer los mensajes del chat con voz (TTS) e interactuar con la audiencia en tiempo real, sin suscripciones ni paywalls.

> Proyecto independiente de código abierto (GPLv3). No está afiliado a TikTok. Úsalo solo con directos y cuentas que tengas derecho a gestionar.

## Descargar

- [Instalador de Windows v0.4.5 (`Tiktato-Setup-0.4.5.exe`)](https://github.com/alvaro-salort/Tiktato/releases/latest)
- [Versión portable v0.4.5 (`Tiktato-Portable-0.4.5.exe`)](https://github.com/alvaro-salort/Tiktato/releases/latest)

También puedes ejecutarlo desde el código fuente con `npm install` y `npm start`.

![Panel de Tiktato](docs/dashboard.png)

## Qué incluye

- **Panel Bento Grid todo a la vista**: Nueva interfaz modular basada en tarjetas consistentes (*Sonidos por regalo y eventos*, *Actividad en vivo*, *Overlay de alertas*, *Frasco de donaciones* y *Voz del chat*) con paleta tonal cálida, indicador oficial TikTok LIVE pulsante e iconografía Phosphor limpia.
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

## Stack

- Electron 45
- Matter.js 0.20 (Física 2D offline para el Frasco de donaciones)
- Node.js 20+ (recomendado 22 LTS o superior)
- [`piratetok-live-js`](https://github.com/PirateTok/live-js) para eventos de TikTok LIVE con firma local
- `ws` para comunicación WebSocket bidireccional entre Electron y los overlays
- HTML5, CSS3 moderno y JavaScript vanilla en la interfaz

## Instalación y desarrollo

```bash
npm install
npm start
```

Para abrir con herramientas de desarrollo (DevTools):

```bash
npm run dev
```

Para ejecutar las pruebas automatizadas:

```bash
npm test
```

Para empaquetar instaladores de Windows (NSIS y Portable):

```bash
npm run dist
```

Los ejecutables generados se guardan en la carpeta `dist/`. El repositorio incluye además un flujo de **GitHub Actions** (`.github/workflows/release.yml`) que compila y publica los instaladores automáticamente en GitHub Releases al crear un tag `v*`.

## Cómo agregar el Frasco Pro en TikTok LIVE Studio (sin OBS)

Si transmites directamente con **TikTok LIVE Studio** y no utilizas OBS, tienes dos formas muy sencillas de agregar el **Frasco Pro**:

1. **Opción A — Fuente Enlace (Web / Link)** *(recomendada por transparencia nativa)*:
   - En Tiktato, abre la pestaña **OBS y frasco** y pulsa **Copiar URL** en la tarjeta del Frasco de donaciones.
   - En **TikTok LIVE Studio**, haz clic en **Añadir fuente (`+`) → Enlace (Link)**.
   - Pega la URL copiada y ajusta el tamaño a `800 × 800`.
2. **Opción B — Captura de ventana con Fondo Chroma / Oscuro**:
   - En Tiktato, ve a **OBS y frasco** y pulsa el botón **Abrir para TikTok LIVE Studio**.
   - Se abrirá la ventana **`Tiktato - Frasco Pro`**. Al mover el cursor sobre ella verás una barra superior donde puedes elegir el fondo (**Verde Chroma**, **Oscuro**, **Azul Chroma**, **Magenta** o **Transparente**); la barra se oculta sola tras 2 segundos sin mover el ratón.
   - En **TikTok LIVE Studio**, añade **Captura de ventana**, selecciona **`Tiktato - Frasco Pro`** y, si elegiste fondo verde, activa el filtro **Clave de color (Chroma Key)**.

## Configuración rápida en OBS Studio

1. Inicia tu directo en TikTok.
2. Abre Tiktato, escribe tu usuario en el panel lateral y pulsa **Conectar**.
3. En la pestaña **OBS y frasco**, copia la URL que desees:
   - **Overlay de alertas**: Fuente de navegador de `800 × 600`.
   - **Frasco de donaciones Pro**: Fuente de navegador de `800 × 800`.
   - **Frasco de prueba**: URL con parámetro `?test=1` para calibrar la escena y probar botones de regalos.
4. En las propiedades de la fuente de navegador en OBS, activa **Controlar audio vía OBS** para gestionar el volumen desde el mezclador.

## Datos y privacidad

- Configuración, sonidos y logs se almacenan localmente en `%APPDATA%\tiktato`.
- No hay servidores intermedios, cuentas externas ni telemetría.
- El servidor de overlays escucha únicamente en localhost (`127.0.0.1`).

## Autor y Licencia

Desarrollado por **Alvaro Salort** (<alvarosalort9@gmail.com> · [GitHub](https://github.com/alvaro-salort/Tiktato)).

Distribuido bajo la licencia **GNU General Public License v3.0 (GPL-3.0-or-later)**. Consulta el archivo [LICENSE](LICENSE) para más detalles. Si compartes o modificas este proyecto, debes mantener el crédito al autor original y distribuir el código derivado bajo la misma licencia libre GPLv3.

Créditos a [PirateTok](https://github.com/PirateTok/live-js) (licencia 0BSD) por la capa de conexión local con TikTok LIVE.
