const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const $ = (selector) => document.querySelector(selector);
const scene = $('#jarScene');
const liquid = $('#jarLiquid');
const giftsContainer = $('#jarGifts');
let socket = null;
let reconnectTimer = null;

const GIFT_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5c2 0 3 2 4.5 5M16.5 8a2.5 2.5 0 0 0 0-5c-2 0-3 2-4.5 5"/></svg>';

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function applyJar(jar) {
  if (!jar) return;
  const percent = Math.max(0, Math.min(100, Number(jar.percent) || 0));
  document.documentElement.style.setProperty('--accent', jar.accent || '#e83e5f');
  document.documentElement.style.setProperty('--fill', `${percent}%`);
  $('#jarTitle').textContent = jar.title || 'Frasco de donaciones';
  $('#jarAmount').textContent = `${formatNumber(jar.currentCoins)} / ${formatNumber(jar.goalCoins)}`;
  $('#jarPercent').textContent = `${Math.round(percent)}%`;
  $('#jarCaption').textContent = `${formatNumber(jar.currentGifts)} regalos · monedas para llenar el frasco`;
  $('#jarComplete').hidden = !jar.completed;
  scene.classList.toggle('is-complete', Boolean(jar.completed));

  const gifts = jar.showRecentGifts ? jar.recentGifts || [] : [];
  giftsContainer.innerHTML = gifts
    .slice(0, 6)
    .reverse()
    .map((gift) => {
      const image = gift.imageUrl
        ? `<img src="${escapeHtml(gift.imageUrl)}" alt="${escapeHtml(gift.name)}" />`
        : GIFT_ICON;
      return `<span class="jar-gift" title="${escapeHtml(gift.name)} · ${formatNumber(gift.coins)} monedas">${image}</span>`;
    })
    .join('');
}

async function loadJar() {
  if (!token) return;
  try {
    const response = await fetch(`/api/jar?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (response.ok) applyJar(await response.json());
  } catch (error) {
    console.warn('[jar] no se pudo cargar el estado inicial', error);
  }
}

function connect() {
  if (!token) return;
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  socket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'hello' || payload.type === 'jar') {
      applyJar(payload.jar);
    }
  });

  socket.addEventListener('close', () => {
    reconnectTimer = setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => socket?.close());
}

(async () => {
  await loadJar();
  connect();
  if (params.get('preview') === '1' && !$('#jarAmount').textContent.startsWith('0 /')) {
    return;
  }
  if (params.get('preview') === '1') {
    applyJar({
      title: 'Frasco de donaciones',
      goalCoins: 1000,
      currentCoins: 680,
      currentGifts: 12,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: [
        { name: 'Rosa', imageUrl: '', coins: 1 },
        { name: 'Galaxy', imageUrl: '', coins: 100 }
      ],
      percent: 68,
      completed: false
    });
  }
})();
