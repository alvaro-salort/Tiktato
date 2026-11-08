import { SoundEngine } from '/shared/audio-engine.js';

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const audio = new SoundEngine();
const queue = [];
let active = false;
let socket = null;
let reconnectTimer = null;
let config = {
  title: 'TIKTATO',
  accent: '#ff3d81',
  position: 'bottom',
  showGiftImage: true,
  durationMs: 5000
};

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const card = $('#card');
const status = $('#status');

const LABELS = {
  gift: 'REGALO',
  follow: 'NUEVO FOLLOW',
  share: 'COMPARTIDO',
  like: 'LIKES',
  subscribe: 'SUSCRIPCIÓN',
  join: 'ENTRÓ AL LIVE'
};

function applyConfig(nextConfig) {
  if (!nextConfig) return;
  config = { ...config, ...nextConfig };
  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--duration', `${Math.max(1500, config.durationMs)}ms`);
  stage.classList.toggle('position-top', config.position === 'top');
}

function showStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status is-visible ${kind}`.trim();
  clearTimeout(showStatus.timer);
  if (kind !== 'is-error') {
    showStatus.timer = setTimeout(() => status.classList.remove('is-visible'), 4500);
  }
}

function hideStatus() {
  status.classList.remove('is-visible');
}

function setImage(element, url, fallback) {
  element.onload = () => {
    element.hidden = false;
    if (fallback) fallback.hidden = true;
  };
  element.onerror = () => {
    element.hidden = true;
    if (fallback) fallback.hidden = false;
  };
  if (url) {
    element.src = url;
  } else {
    element.hidden = true;
    if (fallback) fallback.hidden = false;
  }
}

function detailFor(alert) {
  if (alert.type === 'gift') {
    const count = Number(alert.repeatCount || 1);
    return `envió <strong>${escapeHtml(alert.giftName || 'un regalo')}</strong>${count > 1 ? ` ×${count}` : ''}`;
  }
  if (alert.type === 'follow') return 'empezó a seguirte';
  if (alert.type === 'share') return 'compartió el directo';
  if (alert.type === 'subscribe') return 'se suscribió al canal';
  if (alert.type === 'join') return 'entró al directo';
  return `envió ${Number(alert.repeatCount || 1)} likes`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function present(alert) {
  const showGift = alert.type === 'gift' && config.showGiftImage && Boolean(alert.giftImageUrl);
  card.className = `alert-card type-${alert.type}${showGift ? '' : ' no-gift'}`;
  $('#eventLabel').textContent = LABELS[alert.type] || 'EVENTO';
  $('#coins').textContent = alert.coins > 0 ? `${Number(alert.coins).toLocaleString('es-ES')} monedas` : '';
  $('#username').textContent = alert.displayName || alert.username || 'Alguien';
  $('#detail').innerHTML = detailFor(alert);
  $('#soundName').textContent = alert.sound?.name ? `Sonido: ${alert.sound.name}` : 'Sin sonido asignado';
  $('#soundName').parentElement.style.visibility = alert.sound ? 'visible' : 'hidden';

  const avatar = $('#avatar');
  const avatarFallback = $('#avatarFallback');
  avatarFallback.textContent = String(alert.displayName || alert.username || 'T').trim().charAt(0).toUpperCase() || 'T';
  setImage(avatar, alert.avatarUrl || '', avatarFallback);

  const giftWrap = $('#giftWrap');
  const giftImage = $('#giftImage');
  giftWrap.hidden = !showGift;
  if (showGift) {
    setImage(giftImage, alert.giftImageUrl, null);
  }

  // Reinicia la animación de entrada y de progreso.
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');

  const baseDuration = Math.max(1500, Number(config.durationMs) || 5000);
  const duration = queue.length > 0 ? Math.min(baseDuration, queue.length > 2 ? 1400 : 2000) : baseDuration;
  const playback = alert.sound
    ? audio.play(alert.sound, Number(alert.sound.volume ?? 1))
    : Promise.resolve();
  await Promise.all([wait(duration), playback.catch(() => {})]);
  card.classList.remove('show');
  await wait(260);
}

async function drain() {
  if (active) return;
  active = true;
  while (queue.length > 0) {
    const alert = queue.shift();
    try {
      await present(alert);
    } catch (error) {
      console.warn('[overlay] no se pudo mostrar el evento', error);
      await wait(400);
    }
  }
  active = false;
}

function enqueue(alert) {
  if (!alert) return;
  if (queue.length > 5) queue.splice(0, queue.length - 5);
  queue.push(alert);
  drain();
}

async function loadConfig() {
  if (!token) {
    showStatus('Falta el token del overlay', 'is-error');
    return false;
  }
  try {
    const response = await fetch(`/api/config?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyConfig(await response.json());
    return true;
  } catch (error) {
    showStatus('No se pudo cargar la configuración', 'is-error');
    console.warn('[overlay] configuración', error);
    return false;
  }
}

function connect() {
  if (!token) return;
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  socket.addEventListener('open', () => {
    showStatus('Overlay conectado', 'is-live');
    setTimeout(hideStatus, 3200);
  });

  socket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'hello' || payload.type === 'config') {
      applyConfig(payload.config);
      return;
    }
    if (payload.type === 'alert') {
      enqueue(payload.alert);
      return;
    }
    if (payload.type === 'status') {
      if (payload.status?.state === 'connected') {
        showStatus(`LIVE · ${payload.status.username || ''}`.trim(), 'is-live');
      } else if (payload.status?.state === 'error') {
        showStatus(payload.status.message || 'Error de conexión', 'is-error');
      }
    }
  });

  socket.addEventListener('close', () => {
    showStatus('Reconectando overlay…', 'is-error');
    reconnectTimer = setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => {
    socket?.close();
  });
}

document.addEventListener(
  'click',
  () => {
    audio.unlock();
  },
  { once: true }
);

(async () => {
  await audio.unlock().catch(() => {});
  const ready = await loadConfig();
  if (ready) connect();
  if (params.get('preview') === '1') {
    setTimeout(() => {
      enqueue({
        id: 'preview',
        type: 'gift',
        username: 'vista_previa',
        displayName: 'Vista previa',
        avatarUrl: '',
        giftName: 'Galaxy',
        giftImageUrl: '',
        coins: 100,
        repeatCount: 1,
        sound: { kind: 'builtin', key: 'coin', name: 'Moneda', volume: 1 }
      });
    }, 600);
  }
})();
