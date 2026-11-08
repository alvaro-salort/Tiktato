import { BUILTIN_SOUNDS, SoundEngine } from '../shared/audio-engine.js';
import { TTSQueue, formatChatTTS, formatGiftTTS, shouldReadChatMessage } from '../shared/tts-engine.js';

const api = window.tiktato;
const audio = new SoundEngine();
const ttsQueue = new TTSQueue({
  soundEngine: audio,
  onStateChange: (stateData) => updateTtsQueueUI(stateData)
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = null;
let toastTimer = null;
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
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', kind === 'error');
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast?.classList.remove('is-visible'), 3200);
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

  pill.className = `status-pill status-${status.state || 'disconnected'}`;
  const labels = {
    connected: 'Conectado',
    connecting: 'Conectando…',
    error: 'Error',
    disconnected: 'Desconectado'
  };
  label.textContent = labels[status.state] || 'Desconectado';
  liveBadge.textContent = status.state === 'connected' ? 'LIVE' : 'OFFLINE';
  liveBadge.classList.toggle('is-live', status.state === 'connected');
  disconnect.disabled = !['connected', 'connecting', 'error'].includes(status.state);
  connect.disabled = status.state === 'connecting';
  connect.textContent = status.state === 'connecting' ? 'Conectando…' : 'Conectar';
  message.textContent = status.state === 'connected' ? '' : (status.message || 'Sin conexión');
  message.classList.toggle('is-error', status.state === 'error');
  $('#statViewers').textContent = formatNumber(status.viewerCount || 0);

  const sideCard = $('#sidebarStatusCard');
  const sideText = $('#sidebarStatusText');
  const sideLive = $('#sidebarLiveTag');
  if (sideCard) {
    sideCard.className = `sidebar-status-card status-${status.state || 'disconnected'}`;
  }
  if (sideText) {
    sideText.textContent = labels[status.state] || 'Desconectado';
  }
  if (sideLive) {
    sideLive.textContent = status.state === 'connected' ? 'LIVE' : 'OFFLINE';
    sideLive.classList.toggle('is-live', status.state === 'connected');
  }
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
  $('#masterVolume').value = Math.round(state.masterVolume * 100);
  $('#volumeValue').textContent = `${Math.round(state.masterVolume * 100)}%`;
  $('#sessionState').textContent = state.hasSession
    ? 'Sesión guardada cifrada'
    : 'Sin sesión guardada';

  $('#statGifts').textContent = formatNumber(state.stats.gifts);
  $('#statCoins').textContent = formatNumber(state.stats.coins);
  $('#statFollows').textContent = formatNumber(state.stats.follows);

  if (state.appVersion) {
    const verEl = $('#appVersion') || document.querySelector('.footer-version');
    if (verEl) verEl.textContent = `v${state.appVersion}`;
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
            <button class="icon-btn" data-gift-rule-action="test" type="button" title="Probar alerta y sonido de ${escapeHtml(title)}">
              ${iconSvg('play')}
            </button>
            <button class="icon-btn" data-gift-rule-action="edit" type="button" title="Personalizar opciones y volumen de ${escapeHtml(title)}">
              ${iconSvg('edit')}
            </button>
            <button class="icon-btn" data-gift-rule-action="delete" type="button" title="Quitar sonido de ${escapeHtml(title)}">
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
          <button class="icon-btn" data-quick-preview type="button" title="Probar sonido">
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
            <button class="icon-btn" data-action="test" type="button" title="Probar regla">${iconSvg('play')}</button>
            <button class="icon-btn" data-action="edit" type="button" title="Editar">${iconSvg('edit')}</button>
            <button class="icon-btn" data-action="delete" type="button" title="Eliminar">${iconSvg('trash')}</button>
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

function populateVoiceOptions(selectedVoiceId) {
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

  if (selectedVoiceId && select) {
    select.value = selectedVoiceId;
  }
}

function renderTTS() {
  const tts = state?.tts;
  if (!tts) return;
  const chatCheckbox = $('#ttsChatEnabled');
  const readUsernameCheckbox = $('#ttsReadUsername');
  const giftsCheckbox = $('#ttsGiftsEnabled');
  const duckingCheckbox = $('#ttsDucking');
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
  if (duckingCheckbox) duckingCheckbox.checked = tts.ducking !== false;
  if (streaksCheckbox) streaksCheckbox.checked = tts.playEveryStreak !== false;
  const soundsStreaks = $('#soundsPlayEveryStreak');
  if (soundsStreaks) soundsStreaks.checked = tts.playEveryStreak !== false;
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

  const currentVoiceId = tts.voiceId || (tts.voiceProvider === 'google' ? `google:${tts.voiceLanguage || 'es-ES'}` : 'local');
  populateVoiceOptions(currentVoiceId);
  if (providerSelect) providerSelect.value = currentVoiceId;

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
      volume: (state.masterVolume ?? 0.8) * (ttsSettings.volume ?? 0.8),
      ducking: ttsSettings.ducking !== false,
      duckingLevel: ttsSettings.duckingLevel ?? 0.25,
      antiSpam: Boolean(ttsSettings.antiSpam),
      maxChars: ttsSettings.maxChars || 120
    });
  } else if (event.type === 'gift') {
    if (!ttsSettings.giftsEnabled) return;
    if (event.repeatEnd === false) return;
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
          <button class="icon-btn" data-sound-action="play" type="button" title="Reproducir">${iconSvg('play')}</button>
          <button class="icon-btn" data-sound-action="delete" type="button" title="Eliminar">${iconSvg('trash')}</button>
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
          <span class="activity-coins">${item.coins > 0 ? `${formatNumber(item.coins)} monedas` : '—'}</span>
          <span class="activity-sound ${item.played ? '' : 'is-muted'}">${item.played ? escapeHtml(item.soundName) : 'sin sonido'}</span>
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
      await previewSoundById(imported.id, 1);
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
      await previewSoundById(existing.soundId, existing.volume ?? 1);
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
    const rules = [
      ...state.rules,
      newRule
    ];
    await saveRules(rules, `${cleanName} configurado: personaliza su sonido`);
    const savedRule = state.rules.find((r) => r.eventType === 'gift' && (String(r.giftId) === String(gift.id) || r.giftName === cleanName));
    openRuleForm(savedRule || newRule);
    await previewSoundById(soundId, 1);
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
    await previewSoundById(soundId, rule.volume ?? 1);
  });

  $('#giftQuickList')?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-gift-rule-id]');
    if (!row) return;
    const rule = state.rules.find((item) => item.id === row.dataset.giftRuleId);
    if (!rule) return;
    const action = event.target.closest('[data-gift-rule-action]')?.dataset.giftRuleAction;
    if (!action) return;

    if (action === 'test') {
      await triggerTestForRule(rule);
      return;
    }
    if (action === 'edit') {
      openRuleForm(rule);
      await previewSoundById(rule.soundId, rule.volume ?? 1);
      return;
    }
    if (action === 'delete') {
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
      await previewSoundById(soundId, existing?.volume ?? 1);
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
      button.disabled = false;
      button.textContent = 'Conectar';
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
    if (!confirm('¿Borrar las cookies de TikTok guardadas?')) return;
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
    if (!confirm('¿Reiniciar el frasco a cero?')) return;
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

  $('#btnAddRule').addEventListener('click', () => openRuleForm());
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
      await triggerTestForRule(rule);
      return;
    }
    if (action === 'edit') {
      openRuleForm(rule);
      return;
    }
    if (action === 'delete') {
      if (!confirm(`¿Eliminar la regla de ${rule.giftName || EVENT_LABELS[rule.eventType]}?`)) return;
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
      if (!confirm(`¿Eliminar "${sound.name}"? Las reglas que lo usen pasarán a Moneda.`)) return;
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

  $('#ttsDucking')?.addEventListener('change', (e) => {
    saveTtsPatch({ ducking: e.target.checked });
  });

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
    saveTtsPatch({ minGifterLevel: Math.max(1, Number(e.target.value) || 1) });
  });

  $('#ttsAllowMember')?.addEventListener('change', (e) => {
    saveTtsPatch({ allowMember: e.target.checked });
  });

  $('#ttsMinMemberLevel')?.addEventListener('change', (e) => {
    saveTtsPatch({ minMemberLevel: Math.max(1, Number(e.target.value) || 1) });
  });

  $('#ttsVoiceProvider')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.startsWith('google:')) {
      const lang = val.split(':')[1] || 'es-ES';
      saveTtsPatch({ voiceProvider: 'google', voiceLanguage: lang, voiceId: val });
    } else if (val.startsWith('local:')) {
      saveTtsPatch({ voiceProvider: 'local', voiceLanguage: 'es-ES', voiceId: val });
    } else {
      saveTtsPatch({ voiceProvider: val, voiceId: val });
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
    await audio.unlock();
    const currentVoiceId = state?.tts?.voiceId || (state?.tts?.voiceProvider === 'google' ? `google:${state?.tts?.voiceLanguage || 'es-ES'}` : 'local');
    ttsQueue.enqueue({
      text: '¡Hola! La voz y el texto a voz de Tiktato están funcionando en directo.',
      username: 'Tiktato',
      type: 'test',
      voiceId: currentVoiceId,
      voiceProvider: state?.tts?.voiceProvider || 'google',
      voiceLanguage: state?.tts?.voiceLanguage || 'es-ES',
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
  $('#soundsPlayEveryStreak')?.addEventListener('change', (e) => {
    saveTtsPatch({ playEveryStreak: e.target.checked });
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
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      const currentVoiceId = state?.tts?.voiceId || (state?.tts?.voiceProvider === 'google' ? `google:${state?.tts?.voiceLanguage || 'es-ES'}` : 'local');
      populateVoiceOptions(currentVoiceId);
    };
  }
  if (!api) {
    setError('Esta interfaz debe abrirse dentro de Tiktato (Electron).');
    return;
  }
  try {
    state = await api.bootstrap();
    render(state);
    wireEvents();
  } catch (error) {
    setError(error.message || 'No se pudo iniciar la interfaz.');
    console.error(error);
  }
}

init();
