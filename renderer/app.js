import { BUILTIN_SOUNDS, SoundEngine } from '../shared/audio-engine.js';
import { TTSQueue, formatChatTTS, formatGiftTTS, shouldReadChatMessage } from '../shared/tts-engine.js';

const api = window.tiktato;
const audio = new SoundEngine();
const ttsQueue = new TTSQueue({
  soundEngine: audio,
  onStateChange: (stateData) => updateTtsQueueUI(stateData),
  fishSynthesizer: async ({ text, referenceId, model }) => {
    if (!api?.fishSynthesize) {
      return { ok: false, error: 'Síntesis de Fish Audio no disponible' };
    }
    return api.fishSynthesize({ text, referenceId, model });
  }
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = null;
let toastTimer = null;
let toastHideTimer = null;
let editingRuleId = null;

const EVENT_LABELS = {
  gift: 'Regalo',
  follow: 'Follow',
  share: 'Share',
  like: 'Like',
  chat: 'Chat',
  subscribe: 'Suscripción',
  join: 'Entrada'
};

const EVENT_ICONS = {
  gift: 'gift',
  follow: 'follow',
  share: 'share',
  like: 'like',
  chat: 'chat',
  subscribe: 'follow',
  join: 'follow'
};

const QUICK_RULES = [
  {
    type: 'gift',
    label: 'Otros regalos',
    description: 'Si no tienen sonido propio',
    icon: 'gift',
    soundId: 'builtin:coin'
  },
  {
    type: 'follow',
    label: 'Follows',
    description: 'Nuevos seguidores',
    icon: 'follow',
    soundId: 'builtin:chime'
  },
  {
    type: 'share',
    label: 'Shares',
    description: 'Comparten tu directo',
    icon: 'share',
    soundId: 'builtin:pop'
  }
];

const FEATURED_GIFT_IDS = ['5655', '15232', '6064', '7032', '6247', '7934', '5487', '11046'];

const ICON_PATHS = {
  gift:
    '<rect x="40" y="80" width="176" height="48" rx="8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><path d="M128,80V208M192,128v80H64V128" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><path d="M128,80H92a28,28,0,1,1,28-28V80Zm0,0h36a28,28,0,1,0-28-28V80Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  follow:
    '<path d="M104,136A56,56,0,1,0,48,80,56.06,56.06,0,0,0,104,136Zm0,32c-39.76,0-72,21.49-72,48a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8C176,189.49,143.76,168,104,168Zm96-56v32m16-16H184" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  share:
    '<circle cx="64" cy="128" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><circle cx="176" cy="64" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><circle cx="176" cy="192" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="91.68" y1="114.16" x2="148.32" y2="77.84" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="91.68" y1="141.84" x2="148.32" y2="178.16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  like:
    '<path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,104,130,112,130s112-60,112-130A62.07,62.07,0,0,0,178,32Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  chat:
    '<path d="M45.42,176.64A95.88,95.88,0,0,1,32,128C32,74.98,74.98,32,128,32s96,42.98,96,96-42.98,96-96,96a95.88,95.88,0,0,1-48.64-13.42L32,224Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><circle cx="88" cy="128" r="12" fill="currentColor"/><circle cx="128" cy="128" r="12" fill="currentColor"/><circle cx="168" cy="128" r="12" fill="currentColor"/>',
  music:
    '<path d="M128,168a32,32,0,1,1-32-32h32V40l88,24V144a32,32,0,1,1-32-32h32V79.27L128,55.27Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  play: '<polygon points="80 40 200 128 80 216 80 40" fill="currentColor"/>',
  edit:
    '<path d="M96,216H48a8,8,0,0,1-8-8V160L168,32a24,24,0,0,1,34,0l22,22a24,24,0,0,1,0,34Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="144" y1="56" x2="200" y2="112" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>',
  trash:
    '<line x1="216" y1="56" x2="40" y2="56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="104" y1="104" x2="104" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><line x1="152" y1="104" x2="152" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>'
};

function iconSvg(name) {
  return `<svg class="icon phosphor-icon" viewBox="0 0 256 256" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.music}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/\s+/g, ' ');
}

function stripCoinSuffix(value) {
  return normalizeText(value).replace(/\s*\(\d+\)\s*$/, '');
}

function stripTestSuffix(value) {
  return stripCoinSuffix(value)
    .replace(/\s*(?:de\s+)?prueba\s*$/i, '')
    .replace(/^test\s+/i, '')
    .replace(/\s+test\s*$/i, '');
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message, kind = 'info') {
  // Solo se muestran los errores: las confirmaciones de éxito ya se ven en la UI.
  if (kind !== 'error') return;
  const toast = $('#toast');
  if (!toast) return;
  if (toastTimer) window.clearTimeout(toastTimer);
  if (toastHideTimer) window.clearTimeout(toastHideTimer);
  toastTimer = null;
  toastHideTimer = null;
  toast.textContent = message;
  toast.classList.add('is-error');
  // Si hay un diálogo abierto, el aviso debe vivir dentro de él para quedar por encima.
  const host = document.querySelector('dialog[open]') || document.body;
  if (toast.parentElement !== host) host.appendChild(toast);
  toast.hidden = false;
  window.requestAnimationFrame(() => toast.classList.add('is-visible'));
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    toastHideTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('is-error');
      toastHideTimer = null;
    }, 200);
  }, 5000);
}

function confirmAction({ title = 'Confirmar acción', message = '', acceptLabel = 'Aceptar' } = {}) {
  const dialog = $('#confirmDialog');
  if (!dialog) return Promise.resolve(window.confirm(message || title));
  const titleEl = $('#confirmDialogTitle');
  const textEl = $('#confirmDialogText');
  const accept = $('#btnConfirmAccept');
  const cancel = $('#btnConfirmCancel');
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = message;
  if (accept) accept.textContent = acceptLabel;

  let settled = false;
  return new Promise((resolve) => {
    const finish = (value) => {
      if (settled) return;
      settled = true;
      accept?.removeEventListener('click', onAccept);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onAccept = () => finish(true);
    const onClose = () => finish(false);
    accept?.addEventListener('click', onAccept);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    cancel?.focus();
  });
}

function setError(message) {
  const banner = $('#errorBanner');
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
}

function soundName(soundId) {
  if (!soundId) return 'Sin sonido';
  if (soundId.startsWith('builtin:')) {
    const builtin = BUILTIN_SOUNDS.find((sound) => sound.id === soundId);
    return builtin ? builtin.name : soundId.replace('builtin:', '');
  }
  return state?.sounds?.find((sound) => sound.id === soundId)?.name || 'Archivo eliminado';
}

function resolveClientSound(soundId) {
  const id = String(soundId || 'builtin:coin');
  if (id.startsWith('builtin:')) {
    const builtin = BUILTIN_SOUNDS.find((item) => item.id === id);
    return {
      id,
      name: builtin ? builtin.name : id.replace('builtin:', ''),
      kind: 'builtin',
      key: id.replace('builtin:', '')
    };
  }
  const custom = (state?.sounds || []).find((item) => item.id === id);
  if (!custom) return null;
  return {
    id: custom.id,
    name: custom.name,
    kind: 'file',
    url: custom.url
  };
}

async function previewSoundById(soundId, ruleVolume = 1) {
  const sound = resolveClientSound(soundId);
  if (!sound) {
    showToast('El archivo de sonido no está disponible', 'error');
    return;
  }
  try {
    const baseVolume = Math.max(0.25, Number(state?.masterVolume ?? 0.8));
    await audio.preview(sound, baseVolume * Number(ruleVolume ?? 1));
    showToast(`Reproduciendo ${sound.name}`);
  } catch (error) {
    showToast(error.message || `No se pudo reproducir ${sound.name}`, 'error');
  }
}

function findCatalogGift({ giftId, giftName } = {}) {
  const gifts = state?.gifts || [];
  if (giftId) {
    const byId = gifts.find((item) => String(item.id) === String(giftId));
    if (byId) return byId;
  }
  const normalized = stripCoinSuffix(giftName);
  if (!normalized) return null;
  const testStripped = stripTestSuffix(giftName);
  return (
    gifts.find((item) => {
      const es = stripCoinSuffix(item.name);
      const en = stripCoinSuffix(item.nameEn);
      return (
        es === normalized ||
        en === normalized ||
        (testStripped && (es === testStripped || en === testStripped))
      );
    }) || null
  );
}

function findGeneralRule(type) {
  const rules = state?.rules || [];
  if (type === 'gift') {
    return rules.find((rule) => rule.eventType === 'gift' && !rule.giftName && !rule.giftId) || null;
  }
  return rules.find((rule) => rule.eventType === type) || null;
}

function getSpecificGiftRules() {
  return (state?.rules || [])
    .filter((rule) => rule.eventType === 'gift' && (rule.giftId || rule.giftName))
    .sort((left, right) => (left.order || 0) - (right.order || 0));
}

function findRuleForCatalogGift(gift) {
  if (!gift) return null;
  const giftRules = getSpecificGiftRules();
  const byId = giftRules.find((rule) => rule.giftId && String(rule.giftId) === String(gift.id));
  if (byId) return byId;
  const targetEs = stripCoinSuffix(gift.name);
  const targetEn = stripCoinSuffix(gift.nameEn);
  const testEs = stripTestSuffix(gift.name);
  return (
    giftRules.find((rule) => {
      if (rule.giftId) return false;
      const ruleName = stripCoinSuffix(rule.giftName);
      const testRuleName = stripTestSuffix(rule.giftName);
      return (
        ruleName &&
        (ruleName === targetEs ||
          ruleName === targetEn ||
          (testRuleName && (testRuleName === targetEs || testRuleName === testEs)))
      );
    }) || null
  );
}

function defaultSoundForNewGiftRule() {
  const custom = state?.sounds || [];
  if (custom.length > 0) return custom[custom.length - 1].id;
  return 'builtin:sparkle';
}

function updateStatus(status) {
  if (!status) return;
  const pill = $('#statusPill');
  const label = $('#statusLabel');
  const liveBadge = $('#liveBadge');
  const disconnect = $('#btnDisconnect');
  const connect = $('#btnConnect');
  const message = $('#connectionMessage');
  const usernameInput = $('#username');

  const isConnected = status.state === 'connected';
  const isReconnecting = status.state !== 'connected' && Boolean(status.reconnecting || (status.message && status.message.includes('reintentando en')));
  const isConnecting = status.state === 'connecting' || isReconnecting;
  const isError = status.state === 'error' && !isReconnecting;

  if (pill) {
    if (isConnected) {
      pill.className = 'status-pill status-connected';
    } else if (isConnecting) {
      pill.className = 'status-pill status-connecting';
    } else if (isError) {
      pill.className = 'status-pill status-error';
    } else {
      pill.className = 'status-pill status-disconnected';
    }
  }

  const labels = {
    connected: 'Conectado',
    connecting: isReconnecting ? 'Buscando…' : 'Conectando…',
    error: 'Error',
    disconnected: 'Desconectado'
  };
  if (label) label.textContent = labels[status.state] || (isReconnecting ? 'Buscando…' : 'Desconectado');

  if (liveBadge) {
    liveBadge.textContent = '';
    liveBadge.classList.remove('is-live');
    liveBadge.style.display = 'none';
  }

  if (disconnect) {
    disconnect.disabled = !(isConnected || isConnecting || isError);
  }

  if (usernameInput) {
    usernameInput.disabled = isConnected || isConnecting;
  }

  if (connect) {
    connect.disabled = isConnected || isConnecting;
    connect.textContent = isConnecting ? (isReconnecting ? 'Buscando…' : 'Conectando…') : 'Conectar';
  }

  if (message) {
    if (status.message && (isError || isReconnecting)) {
      message.textContent = status.message;
      message.classList.toggle('is-error', isError);
      message.classList.toggle('is-reconnecting', isReconnecting);
    } else {
      message.textContent = '';
      message.classList.remove('is-error', 'is-reconnecting');
    }
  }
  const viewers = $('#statViewers');
  if (viewers) viewers.textContent = formatNumber(status.viewerCount || 0);
}

function setInputValue(selector, value) {
  const input = $(selector);
  if (!input || document.activeElement === input) return;
  input.value = value ?? '';
}

function setInputChecked(selector, checked) {
  const input = $(selector);
  if (!input || document.activeElement === input) return;
  input.checked = Boolean(checked);
}

let lastStaticConfigSig = '';
let lastGiftsDigest = '';

function render(nextState) {
  if (!nextState) return;
  const hasExplicitGifts = Array.isArray(nextState.gifts);
  if (hasExplicitGifts) {
    lastGiftsDigest = nextState.gifts.map((g) => `${g.id}:${g.name}:${g.coins}:${g.imageUrl || ''}`).join('|');
  } else if (Array.isArray(state?.gifts)) {
    nextState = { ...nextState, gifts: state.gifts };
  }
  state = nextState;

  setInputValue('#username', state.username);
  setInputValue('#overlayUrl', state.overlayUrl);
  setInputValue('#overlayTitle', state.overlay.title);
  setInputValue('#overlayAccent', state.overlay.accent);
  setInputValue('#overlayDuration', state.overlay.durationMs);
  $('#overlayPosition').value = state.overlay.position;
  $('#overlayGiftImage').checked = state.overlay.showGiftImage;
  $('#autoConnect').checked = state.autoConnect;
  $('#playInDashboard').checked = state.playInDashboard;
  const themeSelect = $('#themeSelect');
  if (themeSelect && document.activeElement !== themeSelect) {
    themeSelect.value = ['light', 'dark', 'auto'].includes(state.theme) ? state.theme : 'auto';
  }
  $('#masterVolume').value = Math.round(state.masterVolume * 100);
  $('#volumeValue').textContent = `${Math.round(state.masterVolume * 100)}%`;
  $('#sessionState').textContent = state.hasSession
    ? 'Sesión guardada cifrada'
    : 'Sin sesión guardada';

  $('#statGifts').textContent = formatNumber(state.stats.gifts);
  $('#statCoins').textContent = formatNumber(state.stats.coins);
  $('#statFollows').textContent = formatNumber(state.stats.follows);

  if (state.appVersion) {
    const sideVer = $('#sidebarVersion');
    if (sideVer) sideVer.textContent = `v${state.appVersion}`;
  }

  updateStatus(state.status);

  const staticSig = JSON.stringify({
    rules: state.rules,
    sounds: state.sounds,
    giftsDigest: lastGiftsDigest,
    playEveryStreak: state.tts?.playEveryStreak
  });
  if (staticSig !== lastStaticConfigSig) {
    lastStaticConfigSig = staticSig;
    renderGiftPresets();
    renderGiftQuickList();
    renderQuickRules();
    renderRules();
    renderGiftCatalog();
    renderSounds();
    updateRuleSoundOptions();
    if (!$('#ruleFormWrap')?.hidden) {
      updateRuleGiftOptions($('#ruleGiftSelect')?.value || $('#ruleGiftId')?.value, $('#ruleGiftName')?.value);
    }
  }

  renderActivity();
  renderJar();
  renderTTS();
}

function soundOptionsHtml(selectedId, { allowImport = true } = {}) {
  const custom = state?.sounds || [];
  const customGroup =
    custom.length > 0
      ? `<optgroup label="Tus sonidos MP3">${custom
          .map(
            (sound) =>
              `<option value="${escapeHtml(sound.id)}" ${sound.id === selectedId ? 'selected' : ''}>🎵 ${escapeHtml(sound.name)}</option>`
          )
          .join('')}</optgroup>`
      : '';
  const builtinGroup = `<optgroup label="Sonidos incluidos">${BUILTIN_SOUNDS.map(
    (sound) =>
      `<option value="${escapeHtml(sound.id)}" ${sound.id === selectedId ? 'selected' : ''}>${escapeHtml(sound.name)}</option>`
  ).join('')}</optgroup>`;
  const importOption = allowImport
    ? `<option value="__import__">+ Subir archivo MP3…</option>`
    : '';
  return `${customGroup}${builtinGroup}${importOption}`;
}

function renderGiftPresets() {
  const container = $('#giftPresets');
  if (!container) return;
  const gifts = state?.gifts || [];

  // 1. Regalos destacados por defecto (Rosa, Eres increíble, GG, Maracas, Corazón, Quiéreme, Corazón coreano, Galaxia)
  const list = FEATURED_GIFT_IDS.map((id) => gifts.find((item) => String(item.id) === id)).filter(Boolean);

  // 2. Todos los regalos que han sido personalizados aparecen arriba marcados
  const specificRules = getSpecificGiftRules();
  for (const rule of specificRules) {
    let gift = null;
    if (rule.giftId) {
      gift = gifts.find((item) => String(item.id) === String(rule.giftId));
    }
    if (!gift && rule.giftName) {
      gift = findCatalogGift({ giftName: rule.giftName });
    }
    if (!gift) {
      gift = {
        id: rule.giftId || `custom_${rule.id}`,
        name: rule.giftName || 'Regalo',
        imageUrl: rule.giftImageUrl || '',
        coins: rule.minCoins || 1
      };
    }
    const already = list.some((item) => String(item.id) === String(gift.id) || item.name === gift.name);
    if (!already) {
      list.push(gift);
    }
  }

  container.innerHTML = list
    .map((gift) => {
      const existing = findRuleForCatalogGift(gift);
      const displayName = String(gift.name).replace(/\s*\(\d+\)\s*$/, '');
      const soundTitle = existing ? soundName(existing.soundId) : '';
      return `
        <button
          class="gift-preset-chip ${existing ? 'is-configured' : ''}"
          data-preset-gift-id="${escapeHtml(gift.id)}"
          type="button"
          title="${existing ? `${displayName}: ${soundTitle} · Toca para personalizar` : `Asignar sonido a ${displayName}`}"
        >
          <div class="preset-thumb-wrap">
            ${gift.imageUrl ? `<img src="${escapeHtml(gift.imageUrl)}" alt="${escapeHtml(displayName)}" loading="lazy" />` : '<span class="preset-fallback-icon">🎁</span>'}
            ${existing ? '<span class="preset-check" aria-hidden="true">✓</span>' : ''}
          </div>
          <div class="preset-text-wrap">
            <span class="preset-name">${escapeHtml(displayName)}</span>
            <span class="preset-meta">${existing ? `<span class="preset-sound">${escapeHtml(soundTitle)}</span>` : '<span class="preset-add">+ Personalizar</span>'}</span>
          </div>
        </button>
      `;
    })
    .join('');
}

function renderGiftQuickList() {
  const container = $('#giftQuickList');
  if (!container) return;
  const giftRules = getSpecificGiftRules();

  if (giftRules.length === 0) {
    container.innerHTML = `
      <div class="gift-quick-empty">
        Toca en <strong>Rosa</strong>, <strong>Eres increíble</strong>, <strong>GG</strong>, <strong>Maracas</strong> arriba o en <strong>Elegir otro regalo</strong> para asignarle un sonido a cada donación.
      </div>
    `;
    return;
  }

  container.innerHTML = giftRules
    .map((rule) => {
      const catalogGift = findCatalogGift({ giftId: rule.giftId, giftName: rule.giftName });
      const imageUrl = rule.giftImageUrl || catalogGift?.imageUrl || '';
      const title = rule.giftName || catalogGift?.name || 'Regalo';
      const coins = catalogGift?.coins || rule.minCoins || 1;
      const enabled = rule.enabled !== false;
      const volumePct = Math.round((rule.volume ?? 1) * 100);
      return `
        <div class="quick-rule gift-rule-item ${enabled ? '' : 'is-disabled'}" data-gift-rule-id="${escapeHtml(rule.id)}">
          <span class="quick-rule-icon gift-rule-thumb">
            ${
              imageUrl
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy" />`
                : iconSvg('gift')
            }
          </span>
          <div class="quick-rule-copy">
            <strong>${escapeHtml(title)}</strong>
            <span>${formatNumber(coins)} ${coins === 1 ? 'moneda' : 'monedas'} · ${escapeHtml(soundName(rule.soundId))} · ${volumePct}% vol</span>
          </div>
          <select data-gift-rule-sound aria-label="Sonido para ${escapeHtml(title)}">
            ${soundOptionsHtml(rule.soundId)}
          </select>
          <div class="gift-rule-actions">
            <button class="icon-btn" data-gift-rule-action="test" type="button" title="Escuchar sonido de ${escapeHtml(title)}" aria-label="Escuchar sonido de ${escapeHtml(title)}">
              ${iconSvg('play')}
            </button>
            <button class="icon-btn" data-gift-rule-action="edit" type="button" title="Personalizar opciones y volumen de ${escapeHtml(title)}" aria-label="Personalizar opciones y volumen de ${escapeHtml(title)}">
              ${iconSvg('edit')}
            </button>
            <button class="icon-btn" data-gift-rule-action="delete" type="button" title="Quitar sonido de ${escapeHtml(title)}" aria-label="Quitar sonido de ${escapeHtml(title)}">
              ${iconSvg('trash')}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderQuickRules() {
  const container = $('#quickRules');
  if (!container) return;

  container.innerHTML = QUICK_RULES.map((item) => {
    const rule = findGeneralRule(item.type);
    const soundId = rule?.soundId || item.soundId;
    const enabled = rule ? rule.enabled !== false : true;
    return `
      <div class="quick-rule" data-quick-type="${item.type}">
        <span class="quick-rule-icon">${iconSvg(item.icon)}</span>
        <div class="quick-rule-copy">
          <strong>${item.label}</strong>
          <span>${escapeHtml(item.description)} · ${escapeHtml(soundName(soundId))}</span>
        </div>
        <select data-quick-sound aria-label="Sonido para ${item.label}">
          ${soundOptionsHtml(soundId)}
        </select>
        <div class="gift-rule-actions">
          <button class="icon-btn" data-quick-preview type="button" title="Escuchar sonido" aria-label="Escuchar sonido">
            ${iconSvg('play')}
          </button>
          <label class="switch" title="${enabled ? 'Desactivar' : 'Activar'}">
            <input type="checkbox" data-quick-toggle ${enabled ? 'checked' : ''} />
            <span></span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

function renderRules() {
  const list = $('#rulesList');
  const empty = $('#rulesEmpty');
  const rules = [...(state.rules || [])].sort((left, right) => {
    const leftSpecific = left.eventType === 'gift' && (left.giftId || left.giftName) ? 0 : 1;
    const rightSpecific = right.eventType === 'gift' && (right.giftId || right.giftName) ? 0 : 1;
    if (leftSpecific !== rightSpecific) return leftSpecific - rightSpecific;
    const byType = left.eventType.localeCompare(right.eventType);
    if (byType !== 0) return byType;
    return (left.order || 0) - (right.order || 0);
  });

  empty.hidden = rules.length > 0;
  list.innerHTML = rules
    .map((rule) => {
      const catalogGift =
        rule.eventType === 'gift'
          ? findCatalogGift({ giftId: rule.giftId, giftName: rule.giftName })
          : null;
      const giftImageUrl = rule.giftImageUrl || catalogGift?.imageUrl || '';
      const trigger =
        rule.eventType === 'gift'
          ? rule.giftName
            ? escapeHtml(rule.giftName)
            : 'Cualquier otro regalo'
          : EVENT_LABELS[rule.eventType] || rule.eventType;
      const meta =
        rule.eventType === 'gift'
          ? `≥ ${formatNumber(rule.minCoins)} · ${rule.cooldownSeconds}s`
          : `cada evento · ${rule.cooldownSeconds}s`;
      return `
        <div class="rule-row ${rule.enabled ? '' : 'is-disabled'}" data-rule-id="${escapeHtml(rule.id)}">
          <label class="switch" title="${rule.enabled ? 'Desactivar' : 'Activar'}">
            <input type="checkbox" data-action="toggle" ${rule.enabled ? 'checked' : ''} />
            <span></span>
          </label>
          <span class="event-badge event-${escapeHtml(rule.eventType)}">${escapeHtml(EVENT_LABELS[rule.eventType] || rule.eventType)}</span>
          <span class="rule-gift">
            ${giftImageUrl ? `<img class="rule-gift-img" src="${escapeHtml(giftImageUrl)}" alt="" loading="lazy" />` : ''}
            <span>${trigger}</span>
          </span>
          <span class="rule-sound">${escapeHtml(soundName(rule.soundId))}</span>
          <span class="rule-meta">${meta}</span>
          <span class="rule-actions">
            <button class="icon-btn" data-action="test" type="button" title="Escuchar sonido" aria-label="Escuchar sonido">${iconSvg('play')}</button>
            <button class="icon-btn" data-action="edit" type="button" title="Editar" aria-label="Editar">${iconSvg('edit')}</button>
            <button class="icon-btn" data-action="delete" type="button" title="Eliminar" aria-label="Eliminar">${iconSvg('trash')}</button>
          </span>
        </div>
      `;
    })
    .join('');
}

function renderGiftCatalog() {
  const grid = $('#giftCatalogGrid');
  if (!grid) return;
  const gifts = state?.gifts || [];
  const countEl = $('#giftCatalogCount');
  if (countEl) countEl.textContent = gifts.length ? `(${formatNumber(gifts.length)} disponibles)` : '';

  const query = normalizeText($('#giftSearch')?.value || '');
  const selectedId = $('#ruleGiftId')?.value || '';
  const selectedName = stripCoinSuffix($('#ruleGiftName')?.value || '');

  const filtered = query
    ? gifts.filter(
        (gift) =>
          normalizeText(gift.name).includes(query) ||
          normalizeText(gift.nameEn).includes(query) ||
          String(gift.coins).includes(query)
      )
    : gifts;

  const visible = filtered.slice(0, 60);
  if (visible.length === 0) {
    grid.innerHTML = `<div class="gift-catalog-empty">No se encontró ese regalo en el catálogo, pero puedes escribir su nombre abajo.</div>`;
    return;
  }

  grid.innerHTML = visible
    .map((gift) => {
      const isSelected =
        (selectedId && String(gift.id) === String(selectedId)) ||
        (!selectedId && selectedName && stripCoinSuffix(gift.name) === selectedName);
      const existingRule = findRuleForCatalogGift(gift);
      const showEn =
        gift.nameEn && normalizeText(gift.nameEn) !== stripCoinSuffix(gift.name)
          ? gift.nameEn
          : '';
      return `
        <button
          class="gift-card ${isSelected ? 'is-selected' : ''} ${existingRule ? 'has-rule' : ''}"
          data-catalog-gift-id="${escapeHtml(gift.id)}"
          type="button"
        >
          ${
            gift.imageUrl
              ? `<img class="gift-card-img" src="${escapeHtml(gift.imageUrl)}" alt="" loading="lazy" />`
              : `<span class="gift-card-fallback">${iconSvg('gift')}</span>`
          }
          <span class="gift-card-body">
            <strong class="gift-card-name">${escapeHtml(gift.name)}</strong>
            <small class="gift-card-meta">
              ${formatNumber(gift.coins)} ${gift.coins === 1 ? 'moneda' : 'monedas'}${showEn ? ` · ${escapeHtml(showEn)}` : ''}
            </small>
          </span>
          ${existingRule ? `<span class="gift-card-badge" title="Sonido asignado: ${escapeHtml(soundName(existingRule.soundId))}">♪</span>` : ''}
        </button>
      `;
    })
    .join('');
}

function renderJar() {
  const jar = state.jar;
  if (!jar) return;
  const percent = Math.max(0, Math.min(100, Number(jar.percent) || 0));
  setInputValue('#jarGoal', jar.goalCoins);
  setInputValue('#jarUrl', state.jarUrl || '');
  setInputValue('#jarTestUrl', state.jarTestUrl || '');
  const fill = $('#jarFill');
  const percentLabel = $('#jarPercent');
  const amount = $('#jarAmount');
  const gifts = $('#jarGifts');
  if (fill) fill.style.height = `${percent}%`;
  if (percentLabel) percentLabel.textContent = `${Math.round(percent)}%`;
  if (amount) amount.textContent = `${formatNumber(jar.currentCoins)} / ${formatNumber(jar.goalCoins)}`;
  if (gifts) gifts.textContent = `${formatNumber(jar.currentGifts)} regalos`;
  const card = $('#jarCard');
  if (card) card.classList.toggle('is-complete', percent >= 100);

  // Sincronizar campos del diálogo de personalización del frasco
  setInputValue('#jarTitleInput', jar.title || 'Frasco de donaciones');
  setInputValue('#jarScaleInput', jar.scale ?? 1.0);
  setInputValue('#jarGiftScaleInput', jar.giftScale ?? 1.0);
  setInputValue('#jarGiftType', jar.giftType || 'allGifts');
  setInputValue('#jarMinimumValue', jar.minimumValue ?? 1);
  setInputValue('#jarNumberOfRanks', jar.numberOfRanks || 'top5');
  setInputValue('#jarLeaderboardDuration', jar.leaderboardDuration || 5);
  setInputValue('#jarAlertDuration', jar.alertDuration || 5);
  setInputValue('#jarAccentInput', jar.accent || '#e83e5f');
  setInputChecked('#jarShowTotalCoins', jar.showTotalCoins !== false);
  setInputChecked('#jarDisplayLeaderboard', jar.displayLeaderboard !== false);
  setInputChecked('#jarDisplayAlert', jar.displayAlert !== false);
  setInputChecked('#jarDisplayRankBadges', jar.displayRankBadges !== false);

  setInputValue('#jarXOffsetInput', jar.xOffset || 0);
  setInputValue('#jarYOffsetInput', jar.yOffset || 0);
  const selectedStr = Array.isArray(jar.selectedGifts) ? jar.selectedGifts.join(', ') : '';
  setInputValue('#jarSelectedGiftsInput', selectedStr);

  const minValWrap = $('#jarMinValWrap');
  if (minValWrap) minValWrap.hidden = jar.giftType !== 'minimumValue';
  const selWrap = $('#jarSelectedGiftsWrap');
  if (selWrap) selWrap.hidden = jar.giftType !== 'selectedGifts';
}

function populateVoiceOptions(selectedVoiceId, activeProvider = '') {
  const select = $('#ttsVoiceProvider');
  const localGroup = $('#ttsLocalVoicesGroup');
  if (!select || !localGroup) return;

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length > 0) {
      localGroup.innerHTML = voices
        .map((v) => {
          const val = `local:${v.name}`;
          const isSelected = selectedVoiceId === val || (selectedVoiceId === 'local' && v.default);
          const langLabel = v.lang ? ` (${v.lang})` : '';
          return `<option value="${escapeHtml(val)}" ${isSelected ? 'selected' : ''}>${escapeHtml(v.name)}${langLabel}</option>`;
        })
        .join('');
    }
  }

  const targetValue =
    activeProvider === 'fish' || String(selectedVoiceId || '').startsWith('fish:')
      ? 'fish'
      : selectedVoiceId;
  if (targetValue && select) {
    select.value = targetValue;
  }
}

const FISH_CATEGORY_LABELS = {
  all: 'Todas',
  everyday: 'Cotidiana',
  characters: 'Personaje',
  celebrities: 'Celebridad',
  accents: 'Acento',
  singing: 'Canto',
  self: 'Propia'
};

let fishVoices = [];
let fishVoicesLoading = false;
let fishVoicesLoadedOnce = false;
let fishVoicesStatusMessage = '';
let lastFishGridSig = '';
let fishCategory = 'all';
let fishLanguage = 'es';
let fishSearchQuery = '';
let fishKeyTestState = null;
let fishKeyTestMessage = '';
let fishKeyCredit = null;
let fishPreviewAudio = null;
let fishPreviewVoiceId = '';
let fishSearchDebounce = null;
let fishVoicesReqSeq = 0;

function fishInitials(name) {
  const words = String(name || 'FA').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return String(words[0] || 'FA').slice(0, 2).toUpperCase();
}

function fishAvatarStyle(seed) {
  let hash = 0;
  const text = String(seed || 'fish');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `background: hsl(${hue}, 65%, 88%); color: hsl(${hue}, 70%, 24%);`;
}

function stopFishPreview() {
  if (fishPreviewAudio) {
    try {
      fishPreviewAudio.pause();
      fishPreviewAudio.src = '';
    } catch {}
    fishPreviewAudio = null;
  }
  if (fishPreviewVoiceId) {
    fishPreviewVoiceId = '';
    renderFishVoicesGrid();
  }
}

async function previewFishVoice(voice) {
  if (!voice?.referenceId) return;
  if (fishPreviewVoiceId === voice.referenceId) {
    stopFishPreview();
    return;
  }
  stopFishPreview();

  const volume = Math.max(0.15, Math.min(1, Number(state?.tts?.volume ?? 0.8)));
  fishPreviewVoiceId = voice.referenceId;
  renderFishVoicesGrid();

  const playUrl = (src) => {
    if (fishPreviewVoiceId !== voice.referenceId) return;
    const player = new Audio(src);
    player.volume = volume;
    fishPreviewAudio = player;
    const clear = () => {
      if (fishPreviewAudio === player) {
        fishPreviewAudio = null;
        fishPreviewVoiceId = '';
        renderFishVoicesGrid();
      }
    };
    player.addEventListener('ended', clear, { once: true });
    player.addEventListener('error', () => {
      clear();
      showToast('No se pudo reproducir la vista previa de esta voz', 'error');
    }, { once: true });
    player.play().catch(() => {
      clear();
      showToast('No se pudo reproducir el audio de vista previa', 'error');
    });
  };

  if (state?.hasFishApiKey && api?.fishSynthesize) {
    try {
      const sampleText = voice.languages?.includes('en') && !voice.languages?.includes('es')
        ? 'Hello! This is a preview of this Fish Audio voice.'
        : 'Hola, así suena esta voz en TikTato.';
      const res = await api.fishSynthesize({
        text: sampleText,
        referenceId: voice.referenceId,
        model: state?.tts?.fishModel
      });
      if (fishPreviewVoiceId !== voice.referenceId) return;
      if (res?.ok && res.audioBase64) {
        playUrl(`data:${res.contentType || 'audio/mpeg'};base64,${res.audioBase64}`);
        return;
      }
      if (voice.sampleAudioUrl) {
        if (res?.error) showToast(res.error, 'error');
        playUrl(voice.sampleAudioUrl);
        return;
      }
      fishPreviewVoiceId = '';
      renderFishVoicesGrid();
      showToast(res?.error || 'No se pudo generar la vista previa', 'error');
      return;
    } catch (err) {
      if (fishPreviewVoiceId !== voice.referenceId) return;
      if (voice.sampleAudioUrl) {
        playUrl(voice.sampleAudioUrl);
        return;
      }
      fishPreviewVoiceId = '';
      renderFishVoicesGrid();
      showToast(err?.message || 'Error al previsualizar voz', 'error');
      return;
    }
  }

  if (voice.sampleAudioUrl) {
    playUrl(voice.sampleAudioUrl);
  } else {
    fishPreviewVoiceId = '';
    renderFishVoicesGrid();
    showToast('Configura tu API Key de Fish Audio para escuchar esta voz.', 'error');
  }
}

function renderFishVoicesGrid() {
  const grid = $('#ttsFishVoicesGrid');
  const statusEl = $('#ttsFishVoicesStatus');
  if (!grid) return;

  const activeVoiceId = String(state?.tts?.voiceId || '');
  const activeRef = activeVoiceId.startsWith('fish:') ? activeVoiceId.slice(5) : '';

  if (fishVoicesLoading && fishVoices.length === 0) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'Buscando voces en Fish Audio…';
    }
    if (lastFishGridSig !== 'loading') {
      lastFishGridSig = 'loading';
      grid.innerHTML = '';
    }
    return;
  }

  if (fishVoices.length === 0) {
    const emptyMsg =
      fishVoicesStatusMessage ||
      (fishCategory === 'self' && !state?.hasFishApiKey
        ? 'Guarda tu API Key de Fish Audio para listar tus propias voces.'
        : 'No se encontraron voces con esos filtros. También puedes pegar cualquier reference_id manualmente arriba.');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = emptyMsg;
    }
    const emptySig = `empty:${emptyMsg}`;
    if (lastFishGridSig !== emptySig) {
      lastFishGridSig = emptySig;
      grid.innerHTML = '';
    }
    return;
  }

  if (statusEl) {
    if (fishVoicesStatusMessage) {
      statusEl.hidden = false;
      statusEl.textContent = fishVoicesStatusMessage;
    } else {
      statusEl.hidden = true;
      statusEl.textContent = '';
    }
  }

  const nextSig = `${activeRef}|${fishPreviewVoiceId}|${fishVoices.map((v) => `${v.referenceId}:${v.name}`).join(',')}`;
  if (nextSig === lastFishGridSig) return;
  lastFishGridSig = nextSig;

  grid.innerHTML = fishVoices
    .map((voice) => {
      const isSelected = activeRef === voice.referenceId;
      const isPreviewing = fishPreviewVoiceId === voice.referenceId;
      const catLabel = FISH_CATEGORY_LABELS[voice.category] || voice.category || 'Voz';
      const langs = Array.isArray(voice.languages) && voice.languages.length > 0
        ? voice.languages.slice(0, 3).map((l) => l.toUpperCase()).join(' · ')
        : '';
      return `
        <article class="fish-voice-card ${isSelected ? 'is-selected' : ''}" data-fish-ref="${escapeHtml(voice.referenceId)}">
          <div class="fish-voice-card-head">
            <span class="fish-avatar" style="${fishAvatarStyle(voice.name)}" aria-hidden="true">${escapeHtml(fishInitials(voice.name))}</span>
            <div class="fish-voice-meta">
              <strong class="fish-voice-name" title="${escapeHtml(voice.name)}">${escapeHtml(voice.name)}</strong>
              <div class="fish-voice-badges">
                ${voice.recommended ? '<span class="fish-badge fish-badge-recommended">★ Recomendada</span>' : ''}
                <span class="fish-badge">${escapeHtml(catLabel)}</span>
                ${langs ? `<span class="fish-badge">${escapeHtml(langs)}</span>` : ''}
              </div>
            </div>
          </div>
          ${voice.description ? `<p class="fish-voice-desc">${escapeHtml(voice.description)}</p>` : ''}
          <div class="fish-voice-actions">
            <button class="btn btn-ghost btn-small" data-fish-action="preview" type="button">
              ${isPreviewing ? '⏹ Detener' : '▶ Escuchar'}
            </button>
            <button class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-small" data-fish-action="select" type="button">
              ${isSelected ? '✓ Activa' : 'Seleccionar'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

async function loadFishVoices() {
  if (!api?.fishListVoices) return;
  const reqSeq = ++fishVoicesReqSeq;
  fishVoicesLoading = true;
  fishVoicesLoadedOnce = true;
  const statusEl = $('#ttsFishVoicesStatus');
  if (statusEl && fishVoices.length === 0) {
    statusEl.hidden = false;
    statusEl.textContent = 'Cargando catálogo de voces de Fish Audio…';
  }
  try {
    const res = await api.fishListVoices({
      query: fishSearchQuery,
      category: fishCategory === 'self' ? 'all' : fishCategory,
      language: fishLanguage,
      selfOnly: fishCategory === 'self'
    });
    if (reqSeq !== fishVoicesReqSeq) return;
    fishVoices = Array.isArray(res?.voices) ? res.voices : [];
    if (res?.error) {
      fishVoicesStatusMessage = res.error;
    } else if (res?.warning) {
      fishVoicesStatusMessage = fishVoices.length > 0
        ? `${res.warning} (mostrando voces populares locales).`
        : res.warning;
    } else if (res?.needsApiKey) {
      fishVoicesStatusMessage = fishVoices.length > 0
        ? 'Mostrando voces populares de ejemplo. Guarda tu API Key gratuita arriba para buscar en todo el catálogo de Fish Audio.'
        : 'No hay voces locales con esos filtros. Guarda tu API Key gratuita arriba para buscar en todo el catálogo de Fish Audio.';
    } else {
      fishVoicesStatusMessage = '';
    }
  } catch (err) {
    if (reqSeq !== fishVoicesReqSeq) return;
    fishVoicesStatusMessage = err?.message || 'No se pudieron cargar las voces de Fish Audio.';
  } finally {
    if (reqSeq === fishVoicesReqSeq) {
      fishVoicesLoading = false;
      lastFishGridSig = '';
      renderFishVoicesGrid();
    }
  }
}

function renderFishSection(activeProvider) {
  const box = $('#ttsFishConfigBox');
  const tabs = $$('#ttsProviderTabs [data-tts-provider]');
  for (const btn of tabs) {
    const active = btn.dataset.ttsProvider === activeProvider;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  if (!box) return;
  box.hidden = activeProvider !== 'fish';
  if (activeProvider !== 'fish') return;

  const hasKey = Boolean(state?.hasFishApiKey);
  const keyBadge = $('#ttsFishKeyStatus');
  const clearBtn = $('#btnClearFishKey');
  const keyInput = $('#ttsFishApiKey');
  if (clearBtn) clearBtn.hidden = !hasKey;
  if (keyInput) {
    keyInput.placeholder = hasKey
      ? 'API Key guardada cifrada (pega otra para reemplazar)…'
      : 'Pega tu API Key de Fish Audio…';
  }
  if (keyBadge) {
    if (fishKeyTestState === 'testing') {
      keyBadge.textContent = 'PROBANDO…';
      keyBadge.className = 'chip';
      keyBadge.title = '';
    } else if (fishKeyTestState === 'valid') {
      keyBadge.textContent = 'CONEXIÓN VERIFICADA';
      keyBadge.className = 'chip is-ok';
      keyBadge.title = fishKeyCredit !== null && fishKeyCredit !== undefined ? `Crédito disponible: ${fishKeyCredit}` : '';
    } else if (fishKeyTestState === 'invalid') {
      keyBadge.textContent = 'CLAVE INVÁLIDA';
      keyBadge.className = 'chip is-error';
      keyBadge.title = fishKeyTestMessage || '';
    } else if (hasKey) {
      keyBadge.textContent = 'API KEY GUARDADA';
      keyBadge.className = 'chip is-ok';
      keyBadge.title = '';
    } else {
      keyBadge.textContent = 'SIN API KEY';
      keyBadge.className = 'chip';
      keyBadge.title = '';
    }
  }

  const voiceId = String(state?.tts?.voiceId || '');
  const activeRef = voiceId.startsWith('fish:') ? voiceId.slice(5) : '';
  const matchedVoice = fishVoices.find((v) => v.referenceId === activeRef);
  const selectedName =
    state?.tts?.fishVoiceName ||
    matchedVoice?.name ||
    (activeRef ? 'Voz personalizada de Fish Audio' : 'Selecciona una voz de Fish Audio');

  const avatarEl = $('#ttsFishSelectedAvatar');
  const nameEl = $('#ttsFishSelectedName');
  const idEl = $('#ttsFishSelectedId');
  if (avatarEl) {
    avatarEl.textContent = activeRef ? fishInitials(selectedName) : 'FA';
    avatarEl.setAttribute('style', activeRef ? fishAvatarStyle(selectedName) : '');
  }
  if (nameEl) nameEl.textContent = selectedName;
  if (idEl) idEl.textContent = activeRef ? `reference_id: ${activeRef}` : 'Sin reference_id activo';

  if (!fishVoicesLoadedOnce && !fishVoicesLoading) {
    loadFishVoices();
  } else {
    renderFishVoicesGrid();
  }
}

function renderTTS() {
  const tts = state?.tts;
  if (!tts) return;
  const chatCheckbox = $('#ttsChatEnabled');
  const readUsernameCheckbox = $('#ttsReadUsername');
  const giftsCheckbox = $('#ttsGiftsEnabled');
  const duckingCheckbox = $('#ttsDucking');
  const duckingSlider = $('#ttsDuckingLevel');
  const duckingLabel = $('#ttsDuckingLevelValue');
  const settingsDucking = $('#settingsAudioDucking');
  const settingsDuckingSlider = $('#settingsAudioDuckingLevel');
  const settingsDuckingLabel = $('#settingsAudioDuckingLevelValue');
  const streaksCheckbox = $('#ttsPlayEveryStreak');
  const antiSpamCheckbox = $('#ttsAntiSpam');
  const filterChatCheckbox = $('#ttsFilterChatByRole');
  const roleFiltersBox = $('#ttsRoleFiltersBox');
  const providerSelect = $('#ttsVoiceProvider');
  const volumeSlider = $('#ttsVolume');
  const volumeLabel = $('#ttsVolumeValue');
  const minCoinsSlider = $('#ttsMinCoins');
  const minCoinsLabel = $('#ttsMinCoinsValue');

  if (chatCheckbox) chatCheckbox.checked = tts.chatEnabled !== false;
  if (readUsernameCheckbox) readUsernameCheckbox.checked = tts.readUsername !== false;
  if (giftsCheckbox) giftsCheckbox.checked = tts.giftsEnabled !== false;

  const duckingEnabled = tts.ducking !== false;
  const duckingPct = Math.round((tts.duckingLevel ?? 0.25) * 100);

  if (duckingCheckbox) duckingCheckbox.checked = duckingEnabled;
  if (duckingSlider) {
    duckingSlider.disabled = !duckingEnabled;
    if (document.activeElement !== duckingSlider) duckingSlider.value = duckingPct;
  }
  if (duckingLabel) duckingLabel.textContent = `${duckingPct}%`;

  if (settingsDucking) settingsDucking.checked = duckingEnabled;
  if (settingsDuckingSlider) {
    settingsDuckingSlider.disabled = !duckingEnabled;
    if (document.activeElement !== settingsDuckingSlider) settingsDuckingSlider.value = duckingPct;
  }
  if (settingsDuckingLabel) settingsDuckingLabel.textContent = `${duckingPct}%`;

  const duckingWrap = $('#ttsDuckingLevelWrap');
  if (duckingWrap) duckingWrap.style.opacity = duckingEnabled ? '1' : '0.5';
  const settingsWrap = $('#settingsAudioDuckingLevelWrap');
  if (settingsWrap) settingsWrap.style.opacity = duckingEnabled ? '1' : '0.5';
  if (streaksCheckbox) streaksCheckbox.checked = tts.playEveryStreak !== false;
  const soundsStreaks = $('#soundsPlayEveryStreak');
  if (soundsStreaks) {
    const soundsStreakVal = state?.sounds?.playEveryStreak ?? state?.soundsPlayEveryStreak;
    soundsStreaks.checked = soundsStreakVal !== false;
  }
  if (antiSpamCheckbox) antiSpamCheckbox.checked = Boolean(tts.antiSpam);
  if (filterChatCheckbox) filterChatCheckbox.checked = Boolean(tts.filterChatByRole);
  if (roleFiltersBox) roleFiltersBox.hidden = !tts.filterChatByRole;

  setInputChecked('#ttsAllowModerators', tts.allowModerators !== false);
  setInputChecked('#ttsAllowSubscribers', tts.allowSubscribers !== false);
  setInputChecked('#ttsAllowHighlighted', tts.allowHighlighted !== false);
  setInputChecked('#ttsAllowFriends', Boolean(tts.allowFriends));
  setInputChecked('#ttsAllowFollowers', Boolean(tts.allowFollowers));
  setInputChecked('#ttsAllowGifter', Boolean(tts.allowGifter));
  setInputValue('#ttsMinGifterLevel', tts.minGifterLevel ?? 1);
  setInputChecked('#ttsAllowMember', Boolean(tts.allowMember));
  setInputValue('#ttsMinMemberLevel', tts.minMemberLevel ?? 1);

  const currentVoiceId =
    tts.voiceId ||
    (tts.voiceProvider === 'google'
      ? `google:${tts.voiceLanguage || 'es-ES'}`
      : tts.voiceProvider === 'fish'
        ? 'fish:'
        : 'local');
  const activeProvider =
    tts.voiceProvider === 'fish' || String(currentVoiceId).startsWith('fish:')
      ? 'fish'
      : tts.voiceProvider === 'local' || String(currentVoiceId).startsWith('local')
        ? 'local'
        : 'google';
  populateVoiceOptions(currentVoiceId, activeProvider);
  if (providerSelect) {
    providerSelect.value = activeProvider === 'fish' ? 'fish' : currentVoiceId;
  }
  renderFishSection(activeProvider);

  const volPercent = Math.round((tts.volume ?? 0.8) * 100);
  if (volumeSlider) volumeSlider.value = volPercent;
  if (volumeLabel) volumeLabel.textContent = `${volPercent}%`;

  const minCoins = Number(tts.minCoins ?? 1);
  if (minCoinsSlider) minCoinsSlider.value = minCoins;
  if (minCoinsLabel) minCoinsLabel.textContent = formatNumber(minCoins);

  updateTtsQueueUI({
    speaking: ttsQueue.isSpeaking,
    current: ttsQueue.currentItem,
    queueLength: ttsQueue.queue.length,
    isMuted: ttsQueue.isMuted
  });
}

function updateTtsQueueUI({ speaking, current, queueLength, isMuted }) {
  const badge = $('#ttsQueueBadge');
  const clearBtn = $('#btnClearTTS');
  if (clearBtn) {
    clearBtn.textContent = isMuted ? 'Reanudar voz' : 'Silenciar / Vaciar cola';
    clearBtn.title = isMuted ? 'Reanudar lectura de voz' : 'Silenciar y vaciar la cola de voz';
  }
  if (!badge) return;
  if (isMuted) {
    badge.textContent = 'SILENCIADO';
    badge.className = 'chip';
  } else if (speaking) {
    badge.textContent = queueLength > 0 ? `HABLANDO (+${queueLength})` : 'HABLANDO';
    badge.className = 'chip is-speaking';
  } else if (queueLength > 0) {
    badge.textContent = `${queueLength} EN COLA`;
    badge.className = 'chip';
  } else {
    badge.textContent = (state?.tts?.chatEnabled || state?.tts?.giftsEnabled) ? 'LISTO' : 'INACTIVO';
    badge.className = 'chip';
  }
}

async function saveTtsPatch(patch) {
  try {
    const nextState = await api.updateSettings({
      tts: patch
    });
    if (nextState) {
      state = nextState;
      renderTTS();
    }
  } catch (err) {
    showToast(err.message || 'No se pudo guardar la configuración de voz', 'error');
  }
}

function handleIncomingEventForTTS(event) {
  if (!event) return;
  if (event.type === 'imDelete') {
    ttsQueue.removeByModeration({
      deleteMsgIds: event.deleteMsgIds,
      deleteUserIds: event.deleteUserIds
    });
    return;
  }

  if (!state?.tts?.enabled) return;
  const ttsSettings = state.tts;
  const username = event.displayName || event.username || 'Alguien';

  if (event.type === 'chat') {
    if (!shouldReadChatMessage(event, ttsSettings)) return;
    const comment = event.comment || event.message || '';
    if (!comment) return;
    const text = formatChatTTS(username, comment, {
      readUsername: ttsSettings.readUsername !== false
    });
    ttsQueue.enqueue({
      text,
      username,
      msgId: event.msgId || '',
      userId: event.userId || '',
      type: 'chat',
      voiceId: ttsSettings.voiceId,
      voiceProvider: ttsSettings.voiceProvider || 'google',
      voiceLanguage: ttsSettings.voiceLanguage || 'es-ES',
      fishModel: ttsSettings.fishModel || undefined,
      volume: (state.masterVolume ?? 0.8) * (ttsSettings.volume ?? 0.8),
      ducking: ttsSettings.ducking !== false,
      duckingLevel: ttsSettings.duckingLevel ?? 0.25,
      antiSpam: Boolean(ttsSettings.antiSpam),
      maxChars: ttsSettings.maxChars || 120
    });
  } else if (event.type === 'gift') {
    if (!ttsSettings.giftsEnabled) return;
    if (Boolean(event.suppressAlert) || (event.repeatEnd === false && !ttsSettings.playEveryStreak)) return;
    const minCoins = Number(ttsSettings.minCoins ?? 1);
    const coins = Number(event.coins || 0);
    if (coins < minCoins) return;
    const text = formatGiftTTS(username, event.giftName || 'un regalo', event.repeatCount || 1);
    ttsQueue.enqueue({
      text,
      username,
      msgId: event.msgId || '',
      userId: event.userId || '',
      type: 'gift',
      voiceId: ttsSettings.voiceId,
      voiceProvider: ttsSettings.voiceProvider || 'google',
      voiceLanguage: ttsSettings.voiceLanguage || 'es-ES',
      fishModel: ttsSettings.fishModel || undefined,
      volume: (state.masterVolume ?? 0.8) * (ttsSettings.volume ?? 0.8),
      ducking: ttsSettings.ducking !== false,
      duckingLevel: ttsSettings.duckingLevel ?? 0.25,
      antiSpam: Boolean(ttsSettings.antiSpam),
      maxChars: ttsSettings.maxChars || 120
    });
  }
}

function renderSounds() {
  $('#builtinSounds').innerHTML = BUILTIN_SOUNDS.map(
    (sound) => `
      <button class="sound-card" data-builtin="${escapeHtml(sound.id)}" type="button">
        <span class="sound-emoji">${iconSvg('music')}</span>
        <span>
          <span class="sound-name">${escapeHtml(sound.name)}</span>
          <span class="sound-desc">${escapeHtml(sound.description)}</span>
        </span>
      </button>
    `
  ).join('');

  const custom = state.sounds || [];
  $('#soundsEmpty').hidden = custom.length > 0;
  $('#customSounds').innerHTML = custom
    .map(
      (sound) => `
        <div class="custom-sound" data-sound-id="${escapeHtml(sound.id)}">
          <span class="sound-emoji">${iconSvg('music')}</span>
          <span class="sound-name" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</span>
          <span class="sound-size">${formatBytes(sound.size)}</span>
          <button class="icon-btn" data-sound-action="play" type="button" title="Reproducir" aria-label="Reproducir">${iconSvg('play')}</button>
          <button class="icon-btn" data-sound-action="delete" type="button" title="Eliminar" aria-label="Eliminar">${iconSvg('trash')}</button>
        </div>
      `
    )
    .join('');
}

function renderActivity() {
  const list = $('#activityList');
  const empty = $('#activityEmpty');
  const activity = state.activity || [];
  empty.hidden = activity.length > 0;
  list.innerHTML = activity
    .map((item) => {
      const detail =
        item.type === 'gift'
          ? `envió <strong>${escapeHtml(item.giftName || 'un regalo')}</strong>${item.repeatCount > 1 ? ` ×${formatNumber(item.repeatCount)}` : ''}`
          : item.type === 'follow'
            ? 'empezó a seguirte'
            : item.type === 'share'
              ? 'compartió el directo'
              : item.type === 'subscribe'
                ? 'se suscribió al canal'
                : item.type === 'join'
                  ? 'entró al directo'
                  : item.type === 'chat'
                    ? `<em>${escapeHtml(item.comment || item.message || '')}</em>`
                    : `envió ${formatNumber(item.repeatCount)} likes`;
      return `
        <div class="activity-row ${item.test ? 'is-test' : ''}">
          <span class="activity-icon">${
            item.giftImageUrl
              ? `<img class="activity-gift-img" src="${escapeHtml(item.giftImageUrl)}" alt="" />`
              : iconSvg(EVENT_ICONS[item.type] || 'music')
          }</span>
          <span class="activity-user">${escapeHtml(item.displayName || item.username)}</span>
          <span class="activity-detail">${detail}${item.test ? ' <em>(prueba)</em>' : ''}</span>
          <span class="activity-coins">${item.coins > 0 ? `${formatNumber(item.coins)} ${item.coins === 1 ? 'moneda' : 'monedas'}` : '—'}</span>
          ${item.played && item.soundName ? `<span class="activity-sound">${escapeHtml(item.soundName)}</span>` : ''}
        </div>
      `;
    })
    .join('');
}

function updateRuleSoundOptions() {
  const select = $('#ruleSound');
  if (!select) return;
  const current = select.value;
  select.innerHTML = soundOptionsHtml(current, { allowImport: true });
  if (current && [...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function updateRuleGiftOptions(selectedGiftId = '', customGiftName = '') {
  const select = $('#ruleGiftSelect');
  if (!select) return;

  const gifts = state?.gifts || [];
  // Sort gifts strictly from cheapest to most expensive (by coins ascending, then name)
  const sortedGifts = [...gifts].sort((left, right) => {
    const diff = Number(left.coins || 0) - Number(right.coins || 0);
    if (diff !== 0) return diff;
    return String(left.name || '').localeCompare(String(right.name || ''), 'es');
  });

  const options = [];
  options.push('<option value="">Cualquier otro regalo (sin filtro)</option>');

  for (const gift of sortedGifts) {
    const displayName = String(gift.name).replace(/\s*\(\d+\)\s*$/, '');
    const coins = Number(gift.coins || 1);
    const coinLabel = `${formatNumber(coins)} ${coins === 1 ? 'moneda' : 'monedas'}`;
    const showEn = gift.nameEn && normalizeText(gift.nameEn) !== normalizeText(displayName)
      ? ` · ${escapeHtml(gift.nameEn)}`
      : '';
    const isSelected = selectedGiftId && String(gift.id) === String(selectedGiftId);
    options.push(
      `<option value="${escapeHtml(gift.id)}" data-coins="${coins}" data-name="${escapeHtml(displayName)}" ${isSelected ? 'selected' : ''}>` +
        `${escapeHtml(displayName)} · ${coinLabel}${showEn}` +
      `</option>`
    );
  }

  const isCustom = selectedGiftId === '__custom__' || (customGiftName && !selectedGiftId && !sortedGifts.some((g) => normalizeText(g.name) === normalizeText(customGiftName)));
  options.push(`<option value="__custom__" ${isCustom ? 'selected' : ''}>✏️ Escribir nombre manual / comodín (*)…</option>`);

  select.innerHTML = options.join('');

  if (isCustom) {
    select.value = '__custom__';
    $('#ruleGiftName').hidden = false;
  } else if (selectedGiftId) {
    select.value = selectedGiftId;
    $('#ruleGiftName').hidden = true;
  } else {
    select.value = '';
    $('#ruleGiftName').hidden = true;
  }
}

function toggleGiftFields() {
  const isGift = $('#ruleEventType').value === 'gift';
  $$('.gift-only').forEach((element) => {
    element.hidden = !isGift;
  });
}

function selectGiftInRuleForm(gift) {
  if (!gift) {
    $('#ruleGiftId').value = '';
    $('#ruleGiftImageUrl').value = '';
    $('#ruleGiftName').value = '';
    $('#ruleMinCoins').value = 0;
    if ($('#ruleGiftSelect')) $('#ruleGiftSelect').value = '';
    $('#ruleGiftName').hidden = true;
    renderGiftCatalog();
    return;
  }
  const existing = findRuleForCatalogGift(gift);
  if (existing && !editingRuleId) {
    openRuleForm(existing);
    return;
  }
  $('#ruleEventType').value = 'gift';
  $('#ruleGiftId').value = gift.id;
  $('#ruleGiftImageUrl').value = gift.imageUrl || '';
  const cleanName = String(gift.name).replace(/\s*\(\d+\)\s*$/, '');
  $('#ruleGiftName').value = cleanName;
  $('#ruleMinCoins').value = gift.coins || 0;
  if ($('#ruleGiftSelect')) {
    $('#ruleGiftSelect').value = gift.id;
    $('#ruleGiftName').hidden = true;
  }
  toggleGiftFields();
  renderGiftCatalog();
}

function openRuleForm(rule = null) {
  const soundsTab = $('#tab-sounds');
  if (soundsTab && soundsTab.getAttribute('aria-selected') !== 'true') {
    soundsTab.click();
  }
  updateRuleSoundOptions();
  editingRuleId = rule?.id || null;
  $('#ruleFormWrap').hidden = false;
  $('#ruleId').value = rule?.id || '';
  $('#ruleEventType').value = rule?.eventType || 'gift';
  $('#ruleGiftId').value = rule?.giftId || '';
  $('#ruleGiftImageUrl').value = rule?.giftImageUrl || '';
  $('#ruleGiftName').value = rule?.giftName || '';
  $('#ruleMinCoins').value = rule?.minCoins ?? 0;
  $('#ruleSound').value = rule?.soundId || defaultSoundForNewGiftRule();
  $('#ruleVolume').value = Math.round((rule?.volume ?? 1) * 100);
  $('#ruleCooldown').value = rule?.cooldownSeconds ?? 0;
  if ($('#giftSearch')) $('#giftSearch').value = '';

  let giftIdToSelect = rule?.giftId || '';
  if (!giftIdToSelect && rule?.giftName && rule?.eventType === 'gift') {
    const match = findCatalogGift({ giftName: rule.giftName });
    if (match) {
      giftIdToSelect = match.id;
      $('#ruleGiftId').value = match.id;
      if (!rule.giftImageUrl && match.imageUrl) $('#ruleGiftImageUrl').value = match.imageUrl;
    }
  }
  updateRuleGiftOptions(giftIdToSelect, rule?.giftName || '');

  toggleGiftFields();
  renderGiftCatalog();
  $('#ruleFormWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeRuleForm() {
  editingRuleId = null;
  $('#ruleFormWrap').hidden = true;
  $('#ruleForm').reset();
  $('#ruleGiftId').value = '';
  $('#ruleGiftImageUrl').value = '';
  $('#ruleGiftName').value = '';
  if ($('#ruleGiftSelect')) $('#ruleGiftSelect').value = '';
  $('#ruleGiftName').hidden = true;
}

async function importAndReturnSound() {
  try {
    const result = await api.importSound();
    if (result.canceled) return null;
    if (result.error) {
      showToast(result.error, 'error');
      return null;
    }
    state = await api.bootstrap();
    render(state);
    const imported = result.sound || (state.sounds || [])[state.sounds.length - 1] || null;
    if (imported) {
      showToast(`Sonido "${imported.name}" añadido`);
    }
    return imported;
  } catch (error) {
    showToast(error.message || 'No se pudo añadir el sonido', 'error');
    return null;
  }
}

async function saveRules(rules, message = 'Reglas guardadas') {
  try {
    state = await api.saveRules(rules);
    render(state);
    showToast(message);
  } catch (error) {
    showToast(error.message || 'No se pudieron guardar las reglas', 'error');
  }
}

async function updateSettings(patch, message = '') {
  try {
    state = await api.updateSettings(patch);
    render(state);
    if (message) showToast(message);
    return true;
  } catch (error) {
    showToast(error.message || 'No se pudo guardar la configuración', 'error');
    return false;
  }
}

async function triggerTestForRule(rule) {
  if (!rule) return;
  const catalogGift =
    rule.eventType === 'gift'
      ? findCatalogGift({ giftId: rule.giftId, giftName: rule.giftName })
      : null;
  const giftName =
    rule.eventType === 'gift'
      ? rule.giftName || catalogGift?.name || 'Rosa'
      : '';
  const coins =
    rule.eventType === 'gift'
      ? Math.max(1, Number(rule.minCoins) || Number(catalogGift?.coins) || 1)
      : 0;
  const result = await api.testEvent({
    type: rule.eventType,
    giftId: rule.giftId || catalogGift?.id || '',
    giftName,
    giftImageUrl: rule.giftImageUrl || catalogGift?.imageUrl || '',
    coins,
    repeatCount: rule.eventType === 'like' ? 25 : 1
  });
  if (result.alert) {
    showToast(`Probando alerta de ${giftName || EVENT_LABELS[rule.eventType] || 'evento'}`);
  }
  if (result.state) render(result.state);
}

function wireEvents() {
  const openDialog = (selector) => {
    const dialog = $(selector);
    if (dialog && !dialog.open) dialog.showModal();
  };
  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $('#btnSettings').addEventListener('click', () => openDialog('#settingsDialog'));
  $('#btnHelp').addEventListener('click', () => openDialog('#helpDialog'));
  $('#btnToggleTestTools')?.addEventListener('click', () => {
    const toolbar = $('#activityTestToolbar');
    if (!toolbar) return;
    const opening = toolbar.hidden;
    toolbar.hidden = !opening;
    $('#btnToggleTestTools').setAttribute('aria-expanded', String(opening));
  });
  $('#btnTheme')?.addEventListener('click', () => {
    stopThemeClock();
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    if (state) state.theme = next;
    applyTheme(next);
    persistTheme(next);
  });
  $('#themeSelect')?.addEventListener('change', (event) => {
    const value = event.target.value;
    if (state) state.theme = value;
    if (value === 'auto') {
      storeThemePreference('auto');
      applyTheme(autoTheme(), { persist: false });
      watchThemeClock();
    } else {
      stopThemeClock();
      applyTheme(value);
    }
    persistTheme(value);
  });
  $('#btnAdvancedRules').addEventListener('click', () => openDialog('#rulesDialog'));
  $('#btnSounds').addEventListener('click', () => openDialog('#soundsDialog'));
  $('#btnOverlaySettings').addEventListener('click', () => openDialog('#overlayDialog'));
  $('#btnJarSettings')?.addEventListener('click', () => openDialog('#jarDialog'));
  $('#btnHelpConnect').addEventListener('click', () => {
    $('#helpDialog').close();
    $('#connectForm').requestSubmit();
  });

  $('#btnPickGift')?.addEventListener('click', () => {
    openRuleForm(null);
    $('#giftSearch')?.focus();
  });

  $('#giftPresets')?.addEventListener('click', async (event) => {
    const chip = event.target.closest('[data-preset-gift-id]');
    if (!chip) return;
    const giftId = chip.dataset.presetGiftId;
    const gifts = state?.gifts || [];
    let gift = gifts.find((item) => String(item.id) === String(giftId));
    if (!gift) {
      const specific = getSpecificGiftRules().find(
        (r) => String(r.giftId) === String(giftId) || `custom_${r.id}` === giftId || r.id === giftId
      );
      if (specific) {
        gift = {
          id: specific.giftId || specific.id,
          name: specific.giftName || 'Regalo',
          imageUrl: specific.giftImageUrl || '',
          coins: specific.minCoins || 1
        };
      }
    }
    if (!gift) return;

    const existing = findRuleForCatalogGift(gift);
    if (existing) {
      openRuleForm(existing);
      showToast(`Personalizando sonido de ${existing.giftName || gift.name}`);
      return;
    }

    const cleanName = String(gift.name).replace(/\s*\(\d+\)\s*$/, '');
    const soundId = defaultSoundForNewGiftRule();
    const newRule = {
      eventType: 'gift',
      giftId: gift.id,
      giftName: cleanName,
      giftImageUrl: gift.imageUrl || '',
      minCoins: gift.coins || 0,
      soundId,
      volume: 1,
      cooldownSeconds: 0,
      enabled: true,
      order: state.rules.length
    };
    const savedRule = null;
    openRuleForm(savedRule || newRule);
    showToast(`Configurando sonido para ${cleanName}: revisa y guarda la regla`);
  });

  $('#giftQuickList')?.addEventListener('change', async (event) => {
    const row = event.target.closest('[data-gift-rule-id]');
    if (!row || !event.target.matches('[data-gift-rule-sound]')) return;
    const ruleId = row.dataset.giftRuleId;
    const rule = state.rules.find((item) => item.id === ruleId);
    if (!rule) return;

    let soundId = event.target.value;
    if (soundId === '__import__') {
      const imported = await importAndReturnSound();
      if (!imported) {
        renderGiftQuickList();
        return;
      }
      soundId = imported.id;
    }

    const rules = state.rules.map((item) =>
      item.id === ruleId ? { ...item, soundId } : item
    );
    await saveRules(rules, `${rule.giftName || 'Regalo'}: ${soundName(soundId)}`);
  });

  $('#giftQuickList')?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-gift-rule-id]');
    if (!row) return;
    const rule = state.rules.find((item) => item.id === row.dataset.giftRuleId);
    if (!rule) return;
    const action = event.target.closest('[data-gift-rule-action]')?.dataset.giftRuleAction;
    if (!action) return;

    if (action === 'test') {
      await previewSoundById(rule.soundId, rule.soundVolume ?? rule.volume ?? 1);
      return;
    }
    if (action === 'edit') {
      $('#rulesDialog')?.close();
      openRuleForm(rule);
      return;
    }
    if (action === 'delete') {
      const confirmed = await confirmAction({
        title: 'Eliminar regla',
        message: 'Esta regla dejará de sonar. ¿Querés eliminarla?',
        acceptLabel: 'Eliminar'
      });
      if (!confirmed) return;
      await saveRules(
        state.rules.filter((item) => item.id !== rule.id),
        `Regla de ${rule.giftName || 'regalo'} eliminada`
      );
    }
  });

  $('#quickRules').addEventListener('click', async (event) => {
    const previewBtn = event.target.closest('[data-quick-preview]');
    if (!previewBtn) return;
    const row = previewBtn.closest('[data-quick-type]');
    if (!row) return;
    const type = row.dataset.quickType;
    const existing = findGeneralRule(type);
    const defaults = QUICK_RULES.find((item) => item.type === type);
    await previewSoundById(existing?.soundId || defaults.soundId, existing?.volume ?? 1);
  });

  $('#quickRules').addEventListener('change', async (event) => {
    const row = event.target.closest('[data-quick-type]');
    if (!row) return;
    const type = row.dataset.quickType;
    const existing = findGeneralRule(type);
    const defaults = QUICK_RULES.find((item) => item.type === type);
    const rules = [...state.rules];

    if (event.target.matches('[data-quick-sound]')) {
      let soundId = event.target.value;
      if (soundId === '__import__') {
        const imported = await importAndReturnSound();
        if (!imported) {
          renderQuickRules();
          return;
        }
        soundId = imported.id;
      }
      if (existing) {
        const index = rules.findIndex((rule) => rule.id === existing.id);
        rules[index] = { ...rules[index], soundId };
      } else {
        rules.push({
          eventType: type,
          giftName: '',
          minCoins: type === 'gift' ? 1 : 0,
          soundId: soundId || defaults.soundId,
          volume: 1,
          cooldownSeconds: type === 'gift' ? 2 : 0,
          enabled: true,
          order: rules.length
        });
      }
      await saveRules(rules, `${defaults.label}: sonido actualizado`);
      return;
    }

    if (event.target.matches('[data-quick-toggle]')) {
      const enabled = event.target.checked;
      if (existing) {
        const index = rules.findIndex((rule) => rule.id === existing.id);
        rules[index] = { ...rules[index], enabled };
      } else {
        rules.push({
          eventType: type,
          giftName: '',
          minCoins: type === 'gift' ? 1 : 0,
          soundId: defaults.soundId,
          volume: 1,
          cooldownSeconds: type === 'gift' ? 2 : 0,
          enabled,
          order: rules.length
        });
      }
      await saveRules(rules, enabled ? `${defaults.label} activado` : `${defaults.label} desactivado`);
    }
  });

  $('#connectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state?.status?.state === 'connected' || Boolean(state?.status?.reconnecting) || state?.status?.state === 'connecting') return;
    setError('');
    const username = $('#username').value.trim();
    if (!username) {
      setError('Escribe el usuario de TikTok que está en directo.');
      $('#username').focus();
      return;
    }
    const button = $('#btnConnect');
    button.disabled = true;
    button.textContent = 'Conectando…';
    try {
      const result = await api.connect({
        username,
        sessionId: $('#sessionId').value.trim(),
        ttTargetIdc: $('#ttTargetIdc').value.trim(),
        roomId: $('#roomId').value.trim()
      });
      $('#sessionId').value = '';
      state = await api.bootstrap();
      render(state);
      if (!result.ok) {
        setError(result.error || 'No se pudo conectar.');
        showToast(result.error || 'No se pudo conectar.', 'error');
      } else {
        showToast('Conectado a TikTok LIVE');
      }
    } catch (error) {
      setError(error.message || 'No se pudo conectar.');
      showToast(error.message || 'No se pudo conectar.', 'error');
    } finally {
      if (state?.status) {
        updateStatus(state.status);
      } else {
        button.disabled = false;
        button.textContent = 'Conectar';
      }
    }
  });

  $('#btnDisconnect').addEventListener('click', async () => {
    try {
      state = await api.disconnect();
      render(state);
      showToast('Desconectado');
    } catch (error) {
      showToast(error.message || 'No se pudo desconectar', 'error');
    }
  });

  $('#autoConnect').addEventListener('change', (event) => {
    updateSettings({ autoConnect: event.target.checked });
  });

  $('#playInDashboard').addEventListener('change', (event) => {
    updateSettings({ playInDashboard: event.target.checked });
  });

  $('#masterVolume').addEventListener('input', (event) => {
    $('#volumeValue').textContent = `${event.target.value}%`;
    if (state) state.masterVolume = Number(event.target.value) / 100;
  });
  $('#masterVolume').addEventListener('change', (event) => {
    updateSettings({ masterVolume: Number(event.target.value) / 100 });
  });

  $('#btnTikTokLogin').addEventListener('click', async () => {
    try {
      const result = await api.loginTikTok();
      if (result.canceled) return;
      if (!result.ok) {
        showToast(result.error || 'No se pudo iniciar sesión en TikTok', 'error');
        return;
      }
      state = await api.bootstrap();
      render(state);
      showToast('Sesión de TikTok guardada');
    } catch (error) {
      showToast(error.message || 'No se pudo iniciar sesión en TikTok', 'error');
    }
  });

  $('#btnClearSession').addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Borrar sesión de TikTok',
      message: 'Se borrarán las cookies guardadas y tendrás que iniciar sesión otra vez.',
      acceptLabel: 'Borrar sesión'
    });
    if (!confirmed) return;
    await api.logoutTikTok();
    await updateSettings({ clearSession: true }, 'Sesión borrada');
  });

  $('#btnCopyOverlay').addEventListener('click', async () => {
    try {
      await api.copyOverlayUrl();
      showToast('URL del overlay copiada');
    } catch {
      showToast('No se pudo copiar la URL', 'error');
    }
  });

  $('#btnOpenOverlay').addEventListener('click', () => api.openOverlay());
  $('#btnOpenData').addEventListener('click', () => api.openDataFolder());

  $('#btnCopyJar').addEventListener('click', async () => {
    try {
      await api.copyJarUrl();
      showToast('URL del frasco copiada');
    } catch {
      showToast('No se pudo copiar la URL del frasco', 'error');
    }
  });

  $('#btnOpenJar').addEventListener('click', () => api.openJar());

  $('#btnOpenJarStudio')?.addEventListener('click', async () => {
    const res = await api.openJarStudio?.({ bg: 'green' });
    if (res?.error) {
      showToast(res.error, 'error');
    } else {
      showToast('Ventana del frasco abierta para TikTok LIVE Studio');
    }
  });

  $('#btnCopyJarTest')?.addEventListener('click', async () => {
    try {
      await api.copyJarTestUrl();
      showToast('URL del frasco de prueba copiada');
    } catch {
      showToast('No se pudo copiar la URL', 'error');
    }
  });

  $('#btnOpenJarTest')?.addEventListener('click', () => api.openJarTest());

  $('#btnTestGiftRose')?.addEventListener('click', async () => {
    await api.testJarGift({ giftName: 'Rosa', coins: 1, repeatCount: 1 });
    showToast('Rosa de prueba enviada al frasco');
  });

  $('#btnTestGiftCombo')?.addEventListener('click', async () => {
    await api.testJarGift({ giftName: 'Rosa', coins: 1, repeatCount: 10 });
    showToast('Combo Rosa x10 enviado al frasco');
  });

  $('#btnTestGiftGalaxy')?.addEventListener('click', async () => {
    await api.testJarGift({ giftName: 'Galaxia', coins: 1000, repeatCount: 1 });
    showToast('Galaxia de prueba enviada al frasco');
  });

  $('#btnResetJar').addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Vaciar frasco',
      message: 'Se reiniciarán las monedas, los regalos y el ranking de donantes.',
      acceptLabel: 'Vaciar frasco'
    });
    if (!confirmed) return;
    state = await api.resetJar();
    render(state);
    showToast('Frasco reiniciado');
  });

  $('#jarGoal').addEventListener('change', (event) => {
    updateSettings({ jar: { goalCoins: Number(event.target.value) } }, 'Meta del frasco actualizada');
  });

  const jarField = (selector, patch) => {
    $(selector)?.addEventListener('change', (event) => updateSettings({ jar: patch(event.target) }));
  };
  jarField('#jarTitleInput', (input) => ({ title: input.value }));
  jarField('#jarScaleInput', (input) => ({ scale: Number(input.value) }));
  jarField('#jarGiftScaleInput', (input) => ({ giftScale: Number(input.value) }));
  jarField('#jarXOffsetInput', (input) => ({ xOffset: Number(input.value) || 0 }));
  jarField('#jarYOffsetInput', (input) => ({ yOffset: Number(input.value) || 0 }));
  jarField('#jarGiftType', (input) => {
    const minValWrap = $('#jarMinValWrap');
    if (minValWrap) minValWrap.hidden = input.value !== 'minimumValue';
    const selWrap = $('#jarSelectedGiftsWrap');
    if (selWrap) selWrap.hidden = input.value !== 'selectedGifts';
    return { giftType: input.value };
  });
  jarField('#jarSelectedGiftsInput', (input) => {
    const list = input.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { selectedGifts: list };
  });
  jarField('#jarMinimumValue', (input) => ({ minimumValue: Number(input.value) }));
  jarField('#jarNumberOfRanks', (input) => ({ numberOfRanks: input.value }));
  jarField('#jarLeaderboardDuration', (input) => ({ leaderboardDuration: Number(input.value) }));
  jarField('#jarAlertDuration', (input) => ({ alertDuration: Number(input.value) }));
  jarField('#jarAccentInput', (input) => ({ accent: input.value }));
  jarField('#jarShowTotalCoins', (input) => ({ showTotalCoins: input.checked }));
  jarField('#jarDisplayLeaderboard', (input) => ({ displayLeaderboard: input.checked }));
  jarField('#jarDisplayAlert', (input) => ({ displayAlert: input.checked }));
  jarField('#jarDisplayRankBadges', (input) => ({ displayRankBadges: input.checked }));

  const overlayField = (selector, patch) => {
    $(selector).addEventListener('change', (event) => updateSettings({ overlay: patch(event.target) }));
  };
  overlayField('#overlayTitle', (input) => ({ title: input.value }));
  overlayField('#overlayAccent', (input) => ({ accent: input.value }));
  overlayField('#overlayPosition', (input) => ({ position: input.value }));
  overlayField('#overlayDuration', (input) => ({ durationMs: Number(input.value) }));
  overlayField('#overlayGiftImage', (input) => ({ showGiftImage: input.checked }));

  $('#btnCancelRule').addEventListener('click', closeRuleForm);
  $('#ruleEventType').addEventListener('change', toggleGiftFields);

  $('#giftSearch')?.addEventListener('input', () => renderGiftCatalog());

  $('#btnClearGiftSelection')?.addEventListener('click', () => {
    selectGiftInRuleForm(null);
  });

  $('#giftCatalogGrid')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-catalog-gift-id]');
    if (!card) return;
    const gift = (state.gifts || []).find(
      (item) => String(item.id) === String(card.dataset.catalogGiftId)
    );
    if (gift) selectGiftInRuleForm(gift);
  });

  $('#ruleGiftSelect')?.addEventListener('change', (event) => {
    const val = event.target.value;
    if (val === '__custom__') {
      $('#ruleGiftName').hidden = false;
      $('#ruleGiftName').focus();
      return;
    }
    $('#ruleGiftName').hidden = true;
    if (!val) {
      $('#ruleGiftId').value = '';
      $('#ruleGiftImageUrl').value = '';
      $('#ruleGiftName').value = '';
      $('#ruleMinCoins').value = 0;
      renderGiftCatalog();
      return;
    }
    const gift = (state?.gifts || []).find((item) => String(item.id) === String(val));
    if (gift) {
      selectGiftInRuleForm(gift);
    }
  });

  $('#ruleGiftName')?.addEventListener('input', (event) => {
    const text = event.target.value.trim();
    if (!text || text.includes('*')) {
      $('#ruleGiftId').value = '';
      $('#ruleGiftImageUrl').value = '';
      renderGiftCatalog();
      return;
    }
    const match = findCatalogGift({ giftName: text });
    $('#ruleGiftId').value = match ? match.id : '';
    $('#ruleGiftImageUrl').value = match ? match.imageUrl || '' : '';
    renderGiftCatalog();
  });

  $('#ruleSound')?.addEventListener('change', async (event) => {
    if (event.target.value === '__import__') {
      const imported = await importAndReturnSound();
      updateRuleSoundOptions();
      if (imported) {
        $('#ruleSound').value = imported.id;
      }
    }
  });

  $('#btnPreviewRuleSound')?.addEventListener('click', async () => {
    const soundId = $('#ruleSound').value;
    const volume = (Number($('#ruleVolume').value) || 100) / 100;
    await previewSoundById(soundId, volume);
  });

  $('#btnImportSoundFromRules')?.addEventListener('click', async () => {
    const imported = await importAndReturnSound();
    if (imported && !$('#ruleFormWrap').hidden) {
      updateRuleSoundOptions();
      $('#ruleSound').value = imported.id;
    }
  });

  $('#ruleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const eventType = $('#ruleEventType').value;
    let giftId = $('#ruleGiftId').value;
    let giftImageUrl = $('#ruleGiftImageUrl').value;
    let giftName = $('#ruleGiftName').value.trim();

    if (eventType === 'gift') {
      const selectVal = $('#ruleGiftSelect')?.value;
      if (selectVal && selectVal !== '__custom__') {
        const selectedGift = (state?.gifts || []).find((item) => String(item.id) === String(selectVal));
        if (selectedGift) {
          giftId = selectedGift.id;
          giftImageUrl = selectedGift.imageUrl || '';
          giftName = String(selectedGift.name).replace(/\s*\(\d+\)\s*$/, '');
        }
      } else if (selectVal === '') {
        giftId = '';
        giftImageUrl = '';
        giftName = '';
      }
    }

    const catalogGift =
      eventType === 'gift'
        ? findCatalogGift({ giftId, giftName })
        : null;
    const rule = {
      id: $('#ruleId').value || undefined,
      eventType,
      giftId:
        eventType === 'gift' && !giftName.includes('*')
          ? giftId || catalogGift?.id || ''
          : '',
      giftName,
      giftImageUrl:
        eventType === 'gift' && !giftName.includes('*')
          ? giftImageUrl || catalogGift?.imageUrl || ''
          : '',
      minCoins: eventType === 'gift' ? Number($('#ruleMinCoins').value) || 0 : 0,
      soundId: $('#ruleSound').value === '__import__' ? 'builtin:coin' : $('#ruleSound').value,
      volume: (Number($('#ruleVolume').value) || 100) / 100,
      cooldownSeconds: Number($('#ruleCooldown').value) || 0,
      enabled: true,
      order: state.rules.length
    };

    const rules = [...state.rules];
    const index = editingRuleId ? rules.findIndex((item) => item.id === editingRuleId) : -1;
    if (index >= 0) {
      rules[index] = { ...rules[index], ...rule, enabled: rules[index].enabled, order: rules[index].order ?? index };
    } else {
      rules.push(rule);
    }
    await saveRules(rules, index >= 0 ? 'Regla actualizada' : 'Regla añadida');
    closeRuleForm();
  });

  $('#rulesList').addEventListener('click', async (event) => {
    const row = event.target.closest('[data-rule-id]');
    if (!row) return;
    const rule = state.rules.find((item) => item.id === row.dataset.ruleId);
    if (!rule) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'test') {
      await previewSoundById(rule.soundId, rule.soundVolume ?? rule.volume ?? 1);
      return;
    }
    if (action === 'edit') {
      $('#rulesDialog')?.close();
      openRuleForm(rule);
      return;
    }
    if (action === 'delete') {
      const confirmed = await confirmAction({
        title: 'Eliminar regla',
        message: `Se eliminará la regla de ${rule.giftName || EVENT_LABELS[rule.eventType]}.`,
        acceptLabel: 'Eliminar'
      });
      if (!confirmed) return;
      await saveRules(state.rules.filter((item) => item.id !== rule.id), 'Regla eliminada');
      return;
    }
    if (action === 'toggle') {
      const enabled = event.target.checked;
      await saveRules(
        state.rules.map((item) => (item.id === rule.id ? { ...item, enabled } : item)),
        enabled ? 'Regla activada' : 'Regla desactivada'
      );
    }
  });

  $('#builtinSounds').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-builtin]');
    if (!button) return;
    await previewSoundById(button.dataset.builtin, 1);
  });

  $('#customSounds').addEventListener('click', async (event) => {
    const row = event.target.closest('[data-sound-id]');
    if (!row) return;
    const sound = state.sounds.find((item) => item.id === row.dataset.soundId);
    if (!sound) return;
    const action = event.target.closest('[data-sound-action]')?.dataset.soundAction;
    if (action === 'delete') {
      const confirmed = await confirmAction({
        title: 'Eliminar sonido',
        message: `Se eliminará "${sound.name}". Las reglas que lo usen pasarán a Moneda.`,
        acceptLabel: 'Eliminar'
      });
      if (!confirmed) return;
      const result = await api.deleteSound(sound.id);
      if (!result.ok) {
        showToast(result.error || 'No se pudo eliminar', 'error');
        return;
      }
      state = await api.bootstrap();
      render(state);
      showToast('Sonido eliminado');
      return;
    }
    await previewSoundById(sound.id, 1);
  });

  $('#btnImportSound').addEventListener('click', async () => {
    await importAndReturnSound();
  });

  $$('[data-test]').forEach((button) => {
    button.addEventListener('click', async () => {
      const type = button.dataset.test;
      if (type === 'gift') {
        const firstSpecific = getSpecificGiftRules().find((item) => item.enabled !== false);
        if (firstSpecific) {
          await triggerTestForRule(firstSpecific);
          return;
        }
      }
      const result = await api.testEvent({
        type,
        giftId: type === 'gift' ? '5655' : '',
        giftName: type === 'gift' ? 'Rosa' : '',
        coins: type === 'gift' ? 1 : 0,
        repeatCount: type === 'like' ? 25 : 1,
        message: type === 'chat' ? '¡Hola a todos! Este es un mensaje de prueba de chat en directo.' : ''
      });
      if (result.state) render(result.state);
    });
  });

  $('#ttsChatEnabled')?.addEventListener('change', (e) => {
    saveTtsPatch({ chatEnabled: e.target.checked });
  });

  $('#ttsReadUsername')?.addEventListener('change', (e) => {
    saveTtsPatch({ readUsername: e.target.checked });
  });

  $('#ttsGiftsEnabled')?.addEventListener('change', (e) => {
    saveTtsPatch({ giftsEnabled: e.target.checked });
  });

  const onDuckingToggle = (checked) => {
    saveTtsPatch({ ducking: checked });
    if ($('#ttsDucking')) $('#ttsDucking').checked = checked;
    if ($('#settingsAudioDucking')) $('#settingsAudioDucking').checked = checked;
    if ($('#ttsDuckingLevel')) $('#ttsDuckingLevel').disabled = !checked;
    if ($('#settingsAudioDuckingLevel')) $('#settingsAudioDuckingLevel').disabled = !checked;
    const duckingWrap = $('#ttsDuckingLevelWrap');
    if (duckingWrap) duckingWrap.style.opacity = checked ? '1' : '0.5';
    const settingsWrap = $('#settingsAudioDuckingLevelWrap');
    if (settingsWrap) settingsWrap.style.opacity = checked ? '1' : '0.5';
  };

  $('#ttsDucking')?.addEventListener('change', (e) => onDuckingToggle(e.target.checked));
  $('#settingsAudioDucking')?.addEventListener('change', (e) => onDuckingToggle(e.target.checked));

  const onDuckingLevelInput = (val) => {
    const pct = Math.max(0, Math.min(100, Number(val) || 0));
    if ($('#ttsDuckingLevelValue')) $('#ttsDuckingLevelValue').textContent = `${pct}%`;
    if ($('#settingsAudioDuckingLevelValue')) $('#settingsAudioDuckingLevelValue').textContent = `${pct}%`;
    if ($('#ttsDuckingLevel') && document.activeElement !== $('#ttsDuckingLevel')) $('#ttsDuckingLevel').value = pct;
    if ($('#settingsAudioDuckingLevel') && document.activeElement !== $('#settingsAudioDuckingLevel')) $('#settingsAudioDuckingLevel').value = pct;
    if (state?.tts) state.tts.duckingLevel = pct / 100;
  };

  const onDuckingLevelChange = (val) => {
    const factor = Math.max(0, Math.min(1, (Number(val) || 0) / 100));
    saveTtsPatch({ duckingLevel: factor });
  };

  $('#ttsDuckingLevel')?.addEventListener('input', (e) => onDuckingLevelInput(e.target.value));
  $('#ttsDuckingLevel')?.addEventListener('change', (e) => onDuckingLevelChange(e.target.value));

  $('#settingsAudioDuckingLevel')?.addEventListener('input', (e) => onDuckingLevelInput(e.target.value));
  $('#settingsAudioDuckingLevel')?.addEventListener('change', (e) => onDuckingLevelChange(e.target.value));

  $('#ttsPlayEveryStreak')?.addEventListener('change', (e) => {
    saveTtsPatch({ playEveryStreak: e.target.checked });
  });

  $('#ttsAntiSpam')?.addEventListener('change', (e) => {
    saveTtsPatch({ antiSpam: e.target.checked });
  });

  $('#ttsFilterChatByRole')?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const box = $('#ttsRoleFiltersBox');
    if (box) box.hidden = !enabled;
    saveTtsPatch({ filterChatByRole: enabled });
  });

  $('#ttsAllowModerators')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowModerators: e.target.checked });
  });

  $('#ttsAllowSubscribers')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowSubscribers: e.target.checked });
  });

  $('#ttsAllowHighlighted')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowHighlighted: e.target.checked });
  });

  $('#ttsAllowFriends')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowFriends: e.target.checked });
  });

  $('#ttsAllowFollowers')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowFollowers: e.target.checked });
  });

  $('#ttsAllowGifter')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowGifter: e.target.checked });
  });

  $('#ttsMinGifterLevel')?.addEventListener('change', (e) => {
    const val = Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 1));
    e.target.value = val;
    saveTtsPatch({ minGifterLevel: val });
  });

  $('#ttsAllowMember')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowMember: e.target.checked });
  });

  $('#ttsMinMemberLevel')?.addEventListener('change', (e) => {
    const val = Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 1));
    e.target.value = val;
    saveTtsPatch({ minMemberLevel: val });
  });

  const selectFishProvider = () => {
    const existingVoiceId = String(state?.tts?.voiceId || '');
    if (existingVoiceId.startsWith('fish:') && existingVoiceId.length > 5) {
      saveTtsPatch({ voiceProvider: 'fish', voiceId: existingVoiceId });
      return;
    }
    const defaultFish = fishVoices[0] || {
      referenceId: '47d00a02c75f47b7877fe925ab66b5f2',
      name: 'Babidi'
    };
    saveTtsPatch({
      voiceProvider: 'fish',
      voiceId: `fish:${defaultFish.referenceId}`,
      fishVoiceName: defaultFish.name
    });
  };

  $('#ttsProviderTabs')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-tts-provider]');
    if (!pill) return;
    const provider = pill.dataset.ttsProvider;
    if (provider === 'fish') {
      selectFishProvider();
    } else if (provider === 'local') {
      stopFishPreview();
      saveTtsPatch({ voiceProvider: 'local', voiceLanguage: 'es-ES', voiceId: 'local' });
    } else {
      stopFishPreview();
      const lang = state?.tts?.voiceLanguage || 'es-ES';
      saveTtsPatch({ voiceProvider: 'google', voiceLanguage: lang, voiceId: `google:${lang}` });
    }
  });

  $('#ttsVoiceProvider')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'fish') {
      selectFishProvider();
    } else if (val.startsWith('google:')) {
      stopFishPreview();
      const lang = val.split(':')[1] || 'es-ES';
      saveTtsPatch({ voiceProvider: 'google', voiceLanguage: lang, voiceId: val });
    } else if (val.startsWith('local')) {
      stopFishPreview();
      saveTtsPatch({ voiceProvider: 'local', voiceLanguage: 'es-ES', voiceId: val });
    } else {
      stopFishPreview();
      saveTtsPatch({ voiceProvider: val, voiceId: val });
    }
  });

  $('#btnToggleFishKey')?.addEventListener('click', () => {
    const input = $('#ttsFishApiKey');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#ttsFishApiKey')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btnSaveFishKey')?.click();
    }
  });

  $('#btnSaveFishKey')?.addEventListener('click', async () => {
    const input = $('#ttsFishApiKey');
    const raw = String(input?.value || '').trim();
    if (!raw) {
      showToast('Pega tu API Key de Fish Audio antes de guardar.', 'error');
      input?.focus();
      return;
    }
    try {
      const res = await api.fishSetApiKey(raw);
      if (input) {
        input.value = '';
        input.type = 'password';
      }
      fishKeyTestState = null;
      fishKeyTestMessage = '';
      fishKeyCredit = null;
      if (state) state.hasFishApiKey = Boolean(res?.hasFishApiKey);
      renderTTS();
      loadFishVoices();
    } catch (err) {
      showToast(err?.message || 'No se pudo guardar la API Key', 'error');
    }
  });

  $('#btnTestFishKey')?.addEventListener('click', async () => {
    const input = $('#ttsFishApiKey');
    const typed = String(input?.value || '').trim();
    if (!typed && !state?.hasFishApiKey) {
      showToast('Pega tu API Key de Fish Audio para probar la conexión.', 'error');
      input?.focus();
      return;
    }
    fishKeyTestState = 'testing';
    fishKeyTestMessage = '';
    fishKeyCredit = null;
    renderFishSection('fish');
    try {
      const res = await api.fishTestKey(typed);
      if (res?.valid) {
        if (typed) {
          await api.fishSetApiKey(typed);
          if (input) {
            input.value = '';
            input.type = 'password';
          }
          if (state) state.hasFishApiKey = true;
        }
        fishKeyTestState = 'valid';
        fishKeyTestMessage = '';
        fishKeyCredit = res?.credit ?? null;
        loadFishVoices();
      } else {
        fishKeyTestState = 'invalid';
        fishKeyTestMessage = res?.error || 'API Key inválida';
        fishKeyCredit = null;
        showToast(fishKeyTestMessage, 'error');
      }
    } catch (err) {
      fishKeyTestState = 'invalid';
      fishKeyTestMessage = err?.message || 'Error al probar conexión';
      fishKeyCredit = null;
      showToast(fishKeyTestMessage, 'error');
    }
    renderFishSection('fish');
  });

  $('#btnClearFishKey')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Borrar API Key de Fish Audio',
      message: 'Se eliminará tu clave guardada de este equipo.',
      acceptLabel: 'Borrar clave'
    });
    if (!confirmed) return;
    await api.fishSetApiKey('');
    fishKeyTestState = null;
    fishKeyTestMessage = '';
    fishKeyCredit = null;
    if (state) state.hasFishApiKey = false;
    renderTTS();
    loadFishVoices();
  });

  $('#btnClearFishCache')?.addEventListener('click', async () => {
    const btn = $('#btnClearFishCache');
    ttsQueue.clearAudioCache();
    try {
      await api.fishClearCache?.();
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Caché limpia';
        btn.disabled = true;
        window.setTimeout(() => {
          btn.textContent = orig;
          btn.disabled = false;
        }, 1800);
      }
    } catch (err) {
      showToast(err?.message || 'No se pudo limpiar la caché de Fish Audio', 'error');
    }
  });

  const applyManualFishRef = () => {
    const input = $('#ttsFishReferenceId');
    const raw = String(input?.value || '').trim();
    const urlMatch = raw.match(
      /fish\.audio\/(?:(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?m\/|[^?#]*[?&]modelId=)([a-zA-Z0-9_-]{8,64})/i
    );
    const refId = urlMatch
      ? urlMatch[1]
      : (raw.startsWith('fish:') ? raw.slice(5).trim() : raw);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(refId)) {
      showToast('Introduce un reference_id válido de Fish Audio.', 'error');
      input?.focus();
      return;
    }
    const found = fishVoices.find((v) => v.referenceId === refId);
    saveTtsPatch({
      voiceProvider: 'fish',
      voiceId: `fish:${refId}`,
      fishVoiceName: found?.name || 'Voz personalizada'
    });
    if (input) input.value = '';
  };

  $('#btnApplyFishRef')?.addEventListener('click', applyManualFishRef);
  $('#ttsFishReferenceId')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyManualFishRef();
    }
  });

  $('#ttsFishSearch')?.addEventListener('input', (e) => {
    fishSearchQuery = String(e.target.value || '').trim();
    window.clearTimeout(fishSearchDebounce);
    fishSearchDebounce = window.setTimeout(() => {
      loadFishVoices();
    }, 300);
  });

  $('#ttsFishSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.clearTimeout(fishSearchDebounce);
      fishSearchQuery = String(e.target.value || '').trim();
      loadFishVoices();
    }
  });

  $('#btnSearchFishVoices')?.addEventListener('click', () => {
    fishSearchQuery = String($('#ttsFishSearch')?.value || '').trim();
    loadFishVoices();
  });

  $('#ttsFishLangFilter')?.addEventListener('change', (e) => {
    fishLanguage = String(e.target.value || '').trim();
    loadFishVoices();
  });

  $('#ttsFishCategoryTabs')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-fish-category]');
    if (!pill) return;
    fishCategory = pill.dataset.fishCategory || 'all';
    for (const btn of $$('#ttsFishCategoryTabs [data-fish-category]')) {
      btn.classList.toggle('is-active', btn === pill);
    }
    loadFishVoices();
  });

  $('#ttsFishVoicesGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-fish-ref]');
    if (!card) return;
    const refId = card.dataset.fishRef;
    const voice = fishVoices.find((v) => v.referenceId === refId);
    if (!voice) return;
    const action = e.target.closest('[data-fish-action]')?.dataset.fishAction;
    if (action === 'preview') {
      previewFishVoice(voice);
    } else if (action === 'select') {
      saveTtsPatch({
        voiceProvider: 'fish',
        voiceId: `fish:${voice.referenceId}`,
        fishVoiceName: voice.name
      });
    }
  });

  $('#ttsVolume')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    $('#ttsVolumeValue').textContent = `${val}%`;
  });
  $('#ttsVolume')?.addEventListener('change', (e) => {
    const val = Number(e.target.value) / 100;
    saveTtsPatch({ volume: val });
  });

  $('#ttsMinCoins')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    $('#ttsMinCoinsValue').textContent = formatNumber(val);
  });
  $('#ttsMinCoins')?.addEventListener('change', (e) => {
    const val = Number(e.target.value);
    saveTtsPatch({ minCoins: val });
  });

  $('#btnTestTTS')?.addEventListener('click', async () => {
    stopFishPreview();
    await audio.unlock();
    const currentVoiceId = state?.tts?.voiceId || (state?.tts?.voiceProvider === 'google' ? `google:${state?.tts?.voiceLanguage || 'es-ES'}` : 'local');
    if (state?.tts?.voiceProvider === 'fish' && !state?.hasFishApiKey) {
      showToast('Configura tu API Key de Fish Audio para usar esta voz (reproduciendo respaldo).', 'error');
    }
    ttsQueue.enqueue({
      text: '¡Hola! La voz y el texto a voz de TikTato están funcionando en directo.',
      username: 'TikTato',
      type: 'test',
      voiceId: currentVoiceId,
      voiceProvider: state?.tts?.voiceProvider || 'google',
      voiceLanguage: state?.tts?.voiceLanguage || 'es-ES',
      fishModel: state?.tts?.fishModel || undefined,
      volume: (state?.masterVolume ?? 0.8) * (state?.tts?.volume ?? 0.8),
      ducking: state?.tts?.ducking !== false,
      duckingLevel: state?.tts?.duckingLevel ?? 0.25,
      antiSpam: Boolean(state?.tts?.antiSpam),
      maxChars: state?.tts?.maxChars || 120
    });
    showToast('Reproduciendo prueba de voz…');
  });

  $('#btnSkipTTS')?.addEventListener('click', () => {
    ttsQueue.skip();
    showToast('Mensaje de voz saltado');
  });

  $('#btnClearTTS')?.addEventListener('click', () => {
    stopFishPreview();
    if (ttsQueue.isMuted) {
      ttsQueue.mute(false);
      showToast('Voz reanudada');
    } else {
      ttsQueue.mute(true);
      showToast('Cola de voz silenciada y vaciada');
    }
  });

  $('#btnSidebarSettings')?.addEventListener('click', () => openDialog('#settingsDialog'));
  $('#btnSidebarHelp')?.addEventListener('click', () => openDialog('#helpDialog'));
  $('#soundsPlayEveryStreak')?.addEventListener('change', async (e) => {
    const checked = e.target.checked;
    await api.updateSettings({
      soundsPlayEveryStreak: checked,
      sounds: { playEveryStreak: checked }
    });
  });

  api.onIncomingEvent?.((event) => {
    handleIncomingEventForTTS(event);
  });

  api.onAlert((alert) => {
    if ((!state?.playInDashboard && !alert?.test) || !alert?.sound) return;
    const master = alert?.test
      ? Math.max(0.25, Number(state?.masterVolume ?? 0.8))
      : Number(state?.masterVolume ?? 0.8);
    audio.play(alert.sound, master * Number(alert.sound.volume ?? 1));
  });

  api.onState((nextState) => render(nextState));
  api.onStatus((status) => updateStatus(status));

  document.addEventListener(
    'click',
    () => {
      audio.unlock();
    },
    { once: true }
  );
}

function setupUpdater() {
  const banner = $('#updateBanner');
  const title = $('#updateBannerTitle');
  const desc = $('#updateBannerDesc');
  const btnDownload = $('#btnUpdateDownload');
  const btnInstall = $('#btnUpdateInstall');
  const btnDismiss = $('#btnUpdateDismiss');
  const progressWrap = $('#updateProgressWrap');
  const progressBar = $('#updateProgressBar');

  if (!banner || !api?.onUpdateStatus) return;

  btnDownload?.addEventListener('click', async () => {
    btnDownload.disabled = true;
    btnDownload.textContent = 'Descargando…';
    if (progressWrap) progressWrap.hidden = false;
    try {
      await api.downloadUpdate?.();
    } catch (err) {
      btnDownload.disabled = false;
      btnDownload.textContent = 'Descargar';
      showToast(err.message || 'Error al descargar la actualización', 'error');
    }
  });

  btnInstall?.addEventListener('click', () => {
    btnInstall.disabled = true;
    btnInstall.textContent = 'Instalando…';
    api.installUpdate?.();
  });

  btnDismiss?.addEventListener('click', () => {
    banner.hidden = true;
  });

  api.onUpdateStatus((info) => {
    if (!info) return;
    if (info.status === 'available') {
      banner.hidden = false;
      if (title) title.textContent = `Nueva versión ${info.version || ''} disponible`;
      if (desc) desc.textContent = 'Hay una actualización lista para instalar.';
      if (btnDownload) {
        btnDownload.hidden = false;
        btnDownload.disabled = false;
        btnDownload.textContent = 'Descargar';
      }
      if (btnInstall) btnInstall.hidden = true;
      if (progressWrap) progressWrap.hidden = true;
    } else if (info.status === 'downloading') {
      banner.hidden = false;
      const pct = Math.round(Number(info.percent || 0));
      if (desc) desc.textContent = `Descargando actualización: ${pct}%`;
      if (progressWrap) progressWrap.hidden = false;
      if (progressBar) progressBar.style.width = `${pct}%`;
    } else if (info.status === 'ready') {
      banner.hidden = false;
      if (title) title.textContent = `Versión ${info.version || ''} lista`;
      if (desc) desc.textContent = 'Descarga completada. Reinicia para aplicar los cambios.';
      if (btnDownload) btnDownload.hidden = true;
      if (progressWrap) progressWrap.hidden = true;
      if (btnInstall) {
        btnInstall.hidden = false;
        btnInstall.disabled = false;
      }
    } else if (info.status === 'error') {
      if (btnDownload) {
        btnDownload.disabled = false;
        btnDownload.textContent = 'Reintentar';
      }
      if (progressWrap) progressWrap.hidden = true;
    }
  });
}

const THEME_STORAGE_KEY = 'tiktato.theme';
const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 7;
let themeClock = null;

function isNightTime(date = new Date()) {
  const hour = date.getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function autoTheme() {
  return isNightTime() ? 'dark' : 'light';
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function readThemePreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' || value === 'auto' ? value : '';
  } catch {
    return '';
  }
}

function storeThemePreference(value) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Sin localStorage el tema se mantiene solo durante esta sesión.
  }
}

function syncThemeToggle() {
  const button = $('#btnTheme');
  if (!button) return;
  const dark = currentTheme() === 'dark';
  const preference = readThemePreference();
  const auto = preference === 'auto' || preference === '';
  const label = $('#themeLabel');
  if (label) label.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  const badge = $('#themeAutoBadge');
  if (badge) badge.hidden = !auto;
  button.title = auto
    ? 'Automático (oscuro de 20:00 a 07:00). Clic para fijar un tema.'
    : dark
      ? 'Cambiar a tema claro'
      : 'Cambiar a tema oscuro';
}

function applyTheme(theme, { persist = true } = {}) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) storeThemePreference(next);
  syncThemeToggle();
}

async function persistTheme(theme) {
  try {
    await api.updateSettings({ theme });
  } catch {
    // El tema ya se aplicó; localStorage lo recuerda para la próxima apertura.
  }
}

function stopThemeClock() {
  if (themeClock === null) return;
  window.clearInterval(themeClock);
  themeClock = null;
}

/* En modo automático revisa cada minuto si cambió el día o la noche. */
function watchThemeClock() {
  if (themeClock !== null) return;
  themeClock = window.setInterval(() => {
    if (readThemePreference() !== 'auto') {
      stopThemeClock();
      return;
    }
    const next = autoTheme();
    if (next !== currentTheme()) applyTheme(next, { persist: false });
  }, 60_000);
}

function applyConfiguredTheme() {
  const configured = state?.theme;
  if (configured === 'light' || configured === 'dark') {
    stopThemeClock();
    applyTheme(configured);
    return;
  }
  // "auto" (o sin preferencia): manda la hora del equipo.
  storeThemePreference('auto');
  applyTheme(autoTheme(), { persist: false });
  watchThemeClock();
}

function setupTabs() {
  const tabs = $$('[role="tab"][data-tab]');
  if (tabs.length === 0) return;

  const select = (name, { focus = false } = {}) => {
    const target = tabs.find((tab) => tab.dataset.tab === name) || tabs[0];
    for (const tab of tabs) {
      const active = tab === target;
      tab.setAttribute('aria-selected', String(active));
      tab.classList.toggle('is-active', active);
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    }
    if (focus) target.focus();
    try {
      localStorage.setItem('tiktato.tab', target.dataset.tab);
    } catch {
      // localStorage no disponible: la pestaña simplemente no se recuerda.
    }
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        select(next.dataset.tab, { focus: true });
      }
    });
  }

  let saved = '';
  try {
    saved = localStorage.getItem('tiktato.tab') || '';
  } catch {
    saved = '';
  }
  select(saved || tabs[0].dataset.tab);
}

async function init() {
  setupTabs();
  syncThemeToggle();
  setupUpdater();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      const currentVoiceId = state?.tts?.voiceId || (state?.tts?.voiceProvider === 'google' ? `google:${state?.tts?.voiceLanguage || 'es-ES'}` : 'local');
      populateVoiceOptions(currentVoiceId, state?.tts?.voiceProvider);
    };
  }
  if (!api) {
    setError('Esta interfaz debe abrirse dentro de TikTato (Electron).');
    return;
  }
  try {
    state = await api.bootstrap();
    render(state);
    applyConfiguredTheme();
    wireEvents();
  } catch (error) {
    setError(error.message || 'No se pudo iniciar la interfaz.');
    console.error(error);
  }
}

init();
