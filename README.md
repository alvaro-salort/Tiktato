# Tiktato

Sound alerts y overlays para **TikTok LIVE**, sin cuenta, sin suscripción y sin paywall.

Tiktato es una reimplementación local y acotada de la función principal de TikFinity: escuchar eventos de un directo de TikTok y reproducir un sonido cuando alguien envía un regalo, sigue el canal, comparte el directo o da likes. Incluye un overlay para OBS / TikTok LIVE Studio.

> Proyecto independiente. No está afiliado a TikTok ni a TikFinity. Úsalo solo con directos y cuentas que tengas derecho a analizar.

![Panel de Tiktato](docs/dashboard.png)

## Qué incluye

- Conexión directa a un TikTok LIVE por nombre de usuario.
- Reglas por **regalo**, **follow**, **share** y **like**.
- Coincidencia de regalos por nombre, comodines (`*rosa*`) y mínimo de monedas.
- Cooldown por regla y usuario para evitar spam.
- Sonidos incluidos sintetizados (moneda, campanilla, pop, destello, fanfarria, redoble).
- Subida de sonidos propios (MP3, WAV, OGG, M4A, AAC, FLAC, WEBM; máximo 30 MB).
- Overlay transparente para OBS con animación, avatar, imagen del regalo, monedas y nombre del sonido.
- URL de overlay protegida con token aleatorio.
- Estadísticas básicas y feed de actividad.
- Pruebas de eventos sin necesidad de estar en directo.
- Sesión opcional de TikTok y clave de Euler Stream, guardadas cifradas con el llavero de Windows.

![Overlay para OBS](docs/overlay.png)

## Stack

- Electron 45
- Node.js 22.23.4+, 24.22.1+ o 26.12.1+
- [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) para los eventos del LIVE
- `ws` para el canal local entre Electron y el overlay
- HTML, CSS y JavaScript sin framework en la interfaz

## Instalación

```bash
npm install
npm start
```

Para desarrollo con DevTools:

```bash
npm run dev
```

Para ejecutar las pruebas:

```bash
npm test
```

Para generar instaladores de Windows:

```bash
npm run dist
```

Los artefactos quedan en `dist/`.

## Uso rápido

1. Inicia un directo en TikTok desde el móvil o desde LIVE Studio.
2. Abre Tiktato y escribe tu usuario de TikTok, sin la `@`.
3. Pulsa **Conectar LIVE**.
4. Añade reglas en **Reglas de sonido**. Por defecto:
   - Cualquier regalo → Moneda.
   - Follow → Campanilla.
   - Share → Pop.
5. En OBS, añade una **Fuente de navegador** de `800 × 600` y pega la URL que aparece en **Overlay**.
6. Usa los botones **Regalo / Follow / Share / Like** de la sección **Actividad** para comprobar que el overlay y el audio funcionan.

### Si TikTok rechaza la conexión

La librería intenta conectarse de forma anónima. Si TikTok pide una sesión:

1. Inicia sesión en TikTok en el navegador.
2. Abre las herramientas de desarrollo → Application → Cookies → `https://www.tiktok.com`.
3. Copia `sessionid` y `tt-target-idc`.
4. Pégalas en **Sesión opcional** y vuelve a conectar.

También puedes configurar una clave de [Euler Stream](https://www.eulerstream.com/) en el mismo panel si la firma de la conexión falla con frecuencia. Es opcional; Tiktato no vende ni revende acceso.

> Las cookies son credenciales. Tiktato las guarda cifradas con `safeStorage` de Electron y no las envía a ningún servidor propio.

## Overlay en OBS

- Fuente: **Navegador**.
- Resolución: `800 × 600` o la que use tu escena.
- URL: la que muestra el panel, con su token.
- Audio: el overlay reproduce el sonido desde el navegador. Activa la salida de audio de la fuente o usa **Controlar audio vía OBS**.
- Si también quieres escuchar los sonidos en el panel, deja activada **Reproducir también en esta ventana**. Si no, desactívala para no duplicar el audio.

El overlay se sirve solo en `127.0.0.1` y el token impide que otra página local se conecte al flujo de eventos.

## Datos y privacidad

- Configuración, sonidos y logs: `%APPDATA%\tiktato` en Windows.
- No hay telemetría ni cuenta propia.
- La app se conecta a TikTok y, si se configura, al servicio de firma de Euler Stream.
- El servidor del overlay escucha únicamente en localhost.

Puedes abrir la carpeta desde el pie del panel o borrar `%APPDATA%\tiktato` para empezar de cero.

## Estructura

```text
electron/
  main.cjs             Proceso principal de Electron e IPC
  config.cjs           Configuración, sonidos y validación
  alert-matcher.cjs    Motor de reglas y cooldown
  events.cjs           Normalización de eventos de TikTok
  tiktok-service.cjs   Conexión y eventos del LIVE
  overlay-server.cjs   HTTP + WebSocket local para OBS
  preload.cjs          Puente seguro con la interfaz
renderer/              Panel de control
overlay/               Página transparente para OBS
shared/                Motor de audio compartido
tests/                 Pruebas de reglas, configuración y overlay
```

## Qué no incluye (por ahora)

TikFinity tiene muchas más funciones. Este MVP se centra en lo que pediste:

- No hay TTS, Spotify, chatbot, puntos, niveles, metas, ruletas ni integraciones con Minecraft/GTA.
- No hay login propio ni sincronización en la nube.
- No hay editor visual avanzado de overlays: la personalización actual es título, color, posición, duración e imagen del regalo.
- No se ha validado una conexión real contra un LIVE activo en este entorno; las pruebas cubren la lógica, el servidor local y el renderizado, pero TikTok puede cambiar su API interna.

## Licencia

AGPL-3.0-only. Es la licencia de `tiktok-live-connector`, de la que depende la conexión con TikTok. Si distribuyes una versión modificada, debes cumplir la AGPL y publicar el código correspondiente.

Créditos a [Zerody / TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) por la capa de conexión con TikTok LIVE.
