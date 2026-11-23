import { SoundEngine } from '/shared/audio-engine.js';

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const audio = new SoundEngine();
const queue = [];
let active = false;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let configRetryAttempt = 0;
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
  join: 'ENTRÓ AL LIVE',
  chat: 'CHAT'
};

function isSafeImageUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/assets/')) return true;
  if (typeof URL === 'function') {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  return /^https:\/\/[^\s]+$/i.test(trimmed);
}

function applyConfig(nextConfig) {
  if (!nextConfig || typeof nextConfig !== 'object') return;
  config = { ...config, ...nextConfig };
  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--duration', `${Math.max(1500, Number(config.durationMs) || 5000)}ms`);
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

function setImage(element, url, fallback) {
  element.hidden = true;
  element.removeAttribute('src');
  if (fallback) fallback.hidden = false;

  const safeUrl = isSafeImageUrl(url) ? url.trim() : '';
  if (!safeUrl) {
    element.onload = null;
    element.onerror = null;
    return;
  }

  element.onload = () => {
    element.hidden = false;
    if (fallback) fallback.hidden = true;
  };
  element.onerror = () => {
    element.hidden = true;
    if (fallback) fallback.hidden = false;
  };
  element.src = safeUrl;
}

function detailFor(alert) {
  if (alert.type === 'gift') {
    const count = Math.max(1, Number(alert.repeatCount) || 1);
    return `envió <strong>${escapeHtml(alert.giftName || 'un regalo')}</strong>${count > 1 ? ` ×${count}` : ''}`;
  }
  if (alert.type === 'follow') return 'empezó a seguirte';
  if (alert.type === 'share') return 'compartió el directo';
  if (alert.type === 'subscribe') return 'se suscribió al canal';
  if (alert.type === 'join') return 'entró al directo';
  if (alert.type === 'chat') {
    const text = escapeHtml(alert.comment || alert.message || '');
    return text || 'envió un mensaje';
  }
  const likes = Math.max(1, Number(alert.repeatCount) || 1);
  return `envió ${likes} ${likes === 1 ? 'like' : 'likes'}`;
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
  const safeType = Object.hasOwn(LABELS, alert.type) ? alert.type : 'event';
  const safeGiftUrl = isSafeImageUrl(alert.giftImageUrl) ? alert.giftImageUrl.trim() : '';
  const showGift = safeType === 'gift' && config.showGiftImage && Boolean(safeGiftUrl);
  card.className = `alert-card type-${safeType}${showGift ? '' : ' no-gift'}`;
  $('#eventLabel').textContent = LABELS[safeType] || 'EVENTO';
  const coinsVal = Number(alert.coins) || 0;
  $('#coins').textContent = coinsVal > 0 ? `${coinsVal.toLocaleString('es-ES')} monedas` : '';
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
    setImage(giftImage, safeGiftUrl, null);
  } else {
    giftImage.hidden = true;
    giftImage.removeAttribute('src');
  }

  const baseDuration = Math.max(1500, Number(config.durationMs) || 5000);
  const duration = queue.length > 0 ? Math.min(baseDuration, queue.length > 2 ? 1400 : 2000) : baseDuration;
  document.documentElement.style.setProperty('--duration', `${duration}ms`);

  // Reinicia la animación de entrada y de progreso.
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');

  const master = Number(config.masterVolume ?? 0.8);
  const playback = alert.sound
    ? audio.play(alert.sound, master * Number(alert.sound.volume ?? 1))
    : Promise.resolve();
  const maxPlaybackWait = Math.max(duration + 5000, 15000);
  await Promise.all([
    wait(duration),
    Promise.race([playback.catch(() => {}), wait(maxPlaybackWait)])
  ]);
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
  if (socket) {
    try {
      socket.close();
    } catch {
      // Ignorado
    }
    socket = null;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}&client=overlay`);
  socket = ws;

  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    reconnectAttempt = 0;
    showStatus('Overlay conectado', 'is-live');
  });

  ws.addEventListener('message', (event) => {
    if (socket !== ws) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
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

  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    showStatus('Reconectando overlay…', 'is-error');
    const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt)) + Math.floor(Math.random() * 500);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  });

  ws.addEventListener('error', () => {
    if (socket !== ws) return;
    ws.close();
  });
}

async function tryUnlockAudio() {
  try {
    const unlocked = await audio.unlock();
    if (unlocked) {
      document.removeEventListener('click', tryUnlockAudio);
      document.removeEventListener('pointerdown', tryUnlockAudio);
      document.removeEventListener('keydown', tryUnlockAudio);
    }
  } catch {
    // Reintentar en la próxima interacción
  }
}

document.addEventListener('click', tryUnlockAudio);
document.addEventListener('pointerdown', tryUnlockAudio);
document.addEventListener('keydown', tryUnlockAudio);

async function initConfigWithRetry() {
  while (true) {
    const ready = await loadConfig();
    if (ready) {
      configRetryAttempt = 0;
      connect();
      return;
    }
    if (!token) return;
    const delay = Math.min(15000, 1000 * Math.pow(2, configRetryAttempt)) + Math.floor(Math.random() * 500);
    configRetryAttempt += 1;
    await wait(delay);
  }
}

(async () => {
  await audio.unlock().catch(() => {});
  initConfigWithRetry();
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
