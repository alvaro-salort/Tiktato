# Tiktato

[![Versión](https://img.shields.io/github/v/release/alvaro-salort/Tiktato?color=teal&label=versi%C3%B3n)](https://github.com/alvaro-salort/Tiktato/releases/latest)
[![Licencia](https://img.shields.io/github/license/alvaro-salort/Tiktato?color=orange)](LICENSE)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows-blue)](https://github.com/alvaro-salort/Tiktato/releases)
[![Pruebas](https://img.shields.io/badge/tests-50%20passing-brightgreen)](https://github.com/alvaro-salort/Tiktato)
[![TikTok LIVE](https://img.shields.io/badge/TikTok%20LIVE-sin%20costo-pink)](https://github.com/alvaro-salort/Tiktato)

Sound alerts, voz TTS y frasco de donaciones 2D para **TikTok LIVE**, sin cuenta, sin suscripción y sin paywall.

Tiktato es una aplicación de escritorio local para streamers de TikTok: escucha eventos de tu directo en tiempo real y reproduce alertas sonoras personalizadas, lee comentarios y donaciones mediante síntesis de voz (TTS) y ofrece overlays animados para OBS Studio o TikTok LIVE Studio (incluyendo el nuevo **Frasco Pro** con motor de física 2D).

> Proyecto independiente. No está afiliado a TikTok ni a TikFinity. Úsalo solo con directos y cuentas que tengas derecho a analizar.

## Descargar

- [Instalador de Windows v0.4.0](https://github.com/alvaro-salort/Tiktato/releases/download/v0.4.0/Tiktato.Setup.0.4.0.exe)
- [Versión portable v0.4.0](https://github.com/alvaro-salort/Tiktato/releases/download/v0.4.0/Tiktato.0.4.0.exe)

También puedes ejecutarlo desde el código con `npm install` y `npm start`.

![Panel de Tiktato](docs/dashboard.png)

## Qué incluye

- **Diseño de panel limpio y accesible**: Distribución por pestañas (*Sonidos*, *OBS y frasco*, *Voz*) con columna lateral persistente de conexión, estadísticas y feed de actividad en vivo.
- **Conexión directa**: Conéctate a tu TikTok LIVE simplemente con tu nombre de usuario, sin Euler Stream ni servidores de pago.
- **Reglas de sonido personalizables**: Asigna sonidos específicos a **regalos**, **follows**, **shares** y **likes**.
- **Catálogo de regalos integrado**: Tarjetas rápidas y detección por `giftId` oficial (Rosa, Eres increíble, GG, Maracas, Galaxia, TikTok Universe, etc.) con coincidencia bilingüe (español/inglés) y comodines.
- **Biblioteca y sonidos propios**: Incluye sonidos sintetizados de fábrica (moneda, campanilla, pop, destello, fanfarria, redoble) y permite importar tus propios archivos de audio (MP3, WAV, OGG, M4A, AAC, FLAC, WEBM hasta 30 MB).
- **Overlay de alertas para OBS**: Notificación animada transparente con avatar centrado, badge de monedas, etiqueta y barra de progreso.
- **Frasco de Donaciones Pro (Física 2D con Matter.js)**:
  - Botella de vidrio multicapa SVG con efectos de transparencia y reflejos.
  - Simulación física 2D en tiempo real: los regalos caen y rebotan dentro de la botella.
  - Escala logarítmica de radio según el valor del regalo ($R \in [11, 100]\text{ px}$).
  - Embudos de rebote superiores para impedir expulsión accidental.
  - Carrusel rotativo de máximos donantes (Leaderboard) con medallas e insignias.
  - Alerta emergente cómic en cada donación y partículas de celebración al alcanzar la meta.
  - Modo de calibración/prueba con HUD interactivo (`/jar?test=1`).
  - Optimización de rendimiento que suspende la física si la fuente de OBS está oculta.
- **Voz para Chat y Regalos (TTS)**:
  - Selector de dialectos naturales de Google (España, LatAm, México, Argentina, EE.UU.) y compatibilidad automática con todas las voces del sistema instaladas en Windows (Microsoft Sabina, Helena, etc.).
  - Plantillas configurables (`{user}: {message}` y `{user} envió {count} {gift}`).
  - Cola inteligente con **auto-ducking** (atenúa los efectos sonoros mientras se reproduce la voz).
  - Filtro anti-spam activado por defecto (recorta caracteres repetidos y descarta comandos como `!help`).
  - Rachas de combos fluidas para escuchar repeticiones cómicas cuando los espectadores envían ráfagas.
- **Seguridad y privacidad**: URLs de OBS protegidas mediante tokens únicos. Credenciales de sesión cifradas localmente con el llavero seguro de Windows (`safeStorage`).
- **Soporte para salas privadas / QR**: Generación de código QR directo en la app para conectar salas que TikTok no expone de forma pública.

![Overlay para OBS](docs/overlay.png)

![Frasco de donaciones para OBS](docs/jar.png)

## Stack

- Electron 45
- Matter.js 0.20 (Física 2D offline para el frasco)
- Node.js 22.19+ (recomendado 24 LTS o 26)
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

Para ejecutar las pruebas automatizadas (50 tests unitarios y de integración):

```bash
npm test
```

Para empaquetar instaladores de Windows:

```bash
npm run dist
```

Los ejecutables generados se guardan en la carpeta `dist/`.

## Configuración rápida en OBS

1. Inicia tu directo en TikTok.
2. Abre Tiktato, escribe tu usuario en el panel lateral y pulsa **Conectar**.
3. En la pestaña **OBS y frasco**, copia la URL que desees:
   - **Overlay de alertas**: Fuente de navegador de `800 × 600`.
   - **Frasco de donaciones Pro**: Fuente de navegador de `800 × 800` (o resolución preferida).
   - **Frasco de prueba**: URL con parámetro `?test=1` para calibrar la escena y probar botones de regalos.
4. En las propiedades de la fuente de navegador en OBS, activa **Controlar audio vía OBS** para gestionar el volumen desde el mezclador.

## Datos y privacidad

- Configuración, sonidos y logs se almacenan localmente en `%APPDATA%\tiktato`.
- No hay servidores intermedios, cuentas externas ni telemetría.
- El servidor de overlays escucha únicamente en localhost (`127.0.0.1`).

## Licencia

MIT. La capa de conexión [`piratetok-live-js`](https://github.com/PirateTok/live-js) usa licencia 0BSD.

Créditos a [PirateTok](https://github.com/PirateTok/live-js) por la capa de conexión local con TikTok LIVE.
