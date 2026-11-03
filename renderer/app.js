import { BUILTIN_SOUNDS, SoundEngine } from '../shared/audio-engine.js';

const api = window.tiktato;
const audio = new SoundEngine();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = null;
let toastTimer = null;
let editingRuleId = null;

const EVENT_LABELS = {
  gift: 'Regalo',
  follow: 'Follow',
  share: 'Share',
  like: 'Like'
};

const EVENT_ICONS = {
  gift: '🎁',
  follow: '💜',
  share: '🔁',
  like: '❤️'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  toast.textContent = message;
  toast.classList.toggle('is-error', kind === 'error');
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
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
  connect.textContent = status.state === 'connecting' ? 'Conectando…' : 'Conectar LIVE';
  message.textContent = status.message || 'Sin conexión';
  message.classList.toggle('is-error', status.state === 'error');
  $('#statViewers').textContent = formatNumber(status.viewerCount || 0);
}

function setInputValue(selector, value) {
  const input = $(selector);
  if (!input || document.activeElement === input) return;
  input.value = value ?? '';
}

function render(nextState) {
  if (!nextState) return;
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

  updateStatus(state.status);
  renderRules();
  renderSounds();
  renderActivity();
  updateRuleSoundOptions();
}

function renderRules() {
  const list = $('#rulesList');
  const empty = $('#rulesEmpty');
  const rules = [...(state.rules || [])].sort((left, right) => {
    const byType = left.eventType.localeCompare(right.eventType);
    if (byType !== 0) return byType;
    return (left.order || 0) - (right.order || 0);
  });

  empty.hidden = rules.length > 0;
  list.innerHTML = rules
    .map((rule) => {
      const trigger =
        rule.eventType === 'gift'
          ? rule.giftName
            ? escapeHtml(rule.giftName)
            : 'Cualquier regalo'
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
          <span class="rule-gift">${trigger}</span>
          <span class="rule-sound">${escapeHtml(soundName(rule.soundId))}</span>
          <span class="rule-meta">${meta}</span>
          <span class="rule-actions">
            <button class="icon-btn" data-action="edit" type="button" title="Editar">✎</button>
            <button class="icon-btn" data-action="delete" type="button" title="Eliminar">✕</button>
          </span>
        </div>
      `;
    })
    .join('');
}

function renderSounds() {
  $('#builtinSounds').innerHTML = BUILTIN_SOUNDS.map(
    (sound) => `
      <button class="sound-card" data-builtin="${escapeHtml(sound.id)}" type="button">
        <span class="sound-emoji">${sound.emoji}</span>
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
          <span class="sound-emoji">🎵</span>
          <span class="sound-name" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</span>
          <span class="sound-size">${formatBytes(sound.size)}</span>
          <button class="icon-btn" data-sound-action="play" type="button" title="Reproducir">▶</button>
          <button class="icon-btn" data-sound-action="delete" type="button" title="Eliminar">✕</button>
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
              : `envió ${formatNumber(item.repeatCount)} likes`;
      return `
        <div class="activity-row ${item.test ? 'is-test' : ''}">
          <span class="activity-icon">${EVENT_ICONS[item.type] || '•'}</span>
          <span class="activity-user">${escapeHtml(item.displayName || item.username)}</span>
          <span class="activity-detail">${detail}${item.test ? ' <em>(prueba)</em>' : ''}</span>
          <span class="activity-coins">${item.coins > 0 ? `${formatNumber(item.coins)} 🪙` : '—'}</span>
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
  const options = [
    ...BUILTIN_SOUNDS.map((sound) => `<option value="${escapeHtml(sound.id)}">${sound.emoji} ${escapeHtml(sound.name)}</option>`),
    ...(state.sounds || []).map((sound) => `<option value="${escapeHtml(sound.id)}">🎵 ${escapeHtml(sound.name)}</option>`)
  ];
  select.innerHTML = options.join('');
  if (current && [...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function toggleGiftFields() {
  const isGift = $('#ruleEventType').value === 'gift';
  $$('.gift-only').forEach((element) => {
    element.hidden = !isGift;
  });
}

function openRuleForm(rule = null) {
  editingRuleId = rule?.id || null;
  $('#ruleFormWrap').hidden = false;
  $('#ruleId').value = rule?.id || '';
  $('#ruleEventType').value = rule?.eventType || 'gift';
  $('#ruleGiftName').value = rule?.giftName || '';
  $('#ruleMinCoins').value = rule?.minCoins ?? 0;
  $('#ruleSound').value = rule?.soundId || 'builtin:coin';
  $('#ruleVolume').value = Math.round((rule?.volume ?? 1) * 100);
  $('#ruleCooldown').value = rule?.cooldownSeconds ?? 0;
  toggleGiftFields();
  $('#ruleFormWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#ruleGiftName').focus();
}

function closeRuleForm() {
  editingRuleId = null;
  $('#ruleFormWrap').hidden = true;
  $('#ruleForm').reset();
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

function wireEvents() {
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
        ttTargetIdc: $('#ttTargetIdc').value.trim()
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
      button.textContent = 'Conectar LIVE';
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

  $('#btnClearSession').addEventListener('click', async () => {
    if (!confirm('¿Borrar las cookies de TikTok guardadas?')) return;
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

  $('#ruleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const eventType = $('#ruleEventType').value;
    const rule = {
      id: $('#ruleId').value || undefined,
      eventType,
      giftName: eventType === 'gift' ? $('#ruleGiftName').value.trim() : '',
      minCoins: eventType === 'gift' ? Number($('#ruleMinCoins').value) || 0 : 0,
      soundId: $('#ruleSound').value,
      volume: (Number($('#ruleVolume').value) || 100) / 100,
      cooldownSeconds: Number($('#ruleCooldown').value) || 0,
      enabled: true,
      order: state.rules.length
    };

    const rules = [...state.rules];
    const index = editingRuleId ? rules.findIndex((item) => item.id === editingRuleId) : -1;
    if (index >= 0) {
      rules[index] = { ...rules[index], ...rule, enabled: rules[index].enabled };
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

    if (action === 'edit') {
      openRuleForm(rule);
      return;
    }
    if (action === 'delete') {
      if (!confirm(`¿Eliminar la regla de ${EVENT_LABELS[rule.eventType]}?`)) return;
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
    const id = button.dataset.builtin;
    const builtin = BUILTIN_SOUNDS.find((sound) => sound.id === id);
    await audio.play({ id, kind: 'builtin', key: id.replace('builtin:', '') }, state?.masterVolume ?? 0.8);
    showToast(`Reproduciendo ${builtin?.name || 'sonido'}`);
  });

  $('#customSounds').addEventListener('click', async (event) => {
    const row = event.target.closest('[data-sound-id]');
    if (!row) return;
    const sound = state.sounds.find((item) => item.id === row.dataset.soundId);
    if (!sound) return;
    const action = event.target.closest('[data-sound-action]')?.dataset.soundAction;
    if (action === 'play') {
      await audio.play({ kind: 'file', url: sound.url }, state?.masterVolume ?? 0.8);
      showToast(`Reproduciendo ${sound.name}`);
    }
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
    }
  });

  $('#btnImportSound').addEventListener('click', async () => {
    try {
      const result = await api.importSound();
      if (result.canceled) return;
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      state = await api.bootstrap();
      render(state);
      showToast('Sonido añadido');
    } catch (error) {
      showToast(error.message || 'No se pudo añadir el sonido', 'error');
    }
  });

  $$('[data-test]').forEach((button) => {
    button.addEventListener('click', async () => {
      const type = button.dataset.test;
      const result = await api.testEvent({
        type,
        giftName: type === 'gift' ? 'Rosa de prueba' : '',
        coins: 10,
        repeatCount: type === 'like' ? 25 : 1
      });
      if (result.state) render(result.state);
    });
  });

  api.onAlert((alert) => {
    if (!state?.playInDashboard || !alert?.sound) return;
    audio.play(alert.sound, (state.masterVolume ?? 0.8) * (alert.sound.volume ?? 1));
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

async function init() {
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
