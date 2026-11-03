const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EVENT_TYPES = ['gift', 'follow', 'share', 'like'];
const BUILTIN_IDS = [
  'builtin:coin',
  'builtin:chime',
  'builtin:pop',
  'builtin:sparkle',
  'builtin:horn',
  'builtin:drum'
];
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']);
const MAX_SOUND_BYTES = 30 * 1024 * 1024;

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function defaultRules() {
  return [
    {
      id: 'rule_gift_default',
      eventType: 'gift',
      giftName: '',
      minCoins: 1,
      soundId: 'builtin:coin',
      volume: 1,
      cooldownSeconds: 2,
      enabled: true
    },
    {
      id: 'rule_follow_default',
      eventType: 'follow',
      giftName: '',
      minCoins: 0,
      soundId: 'builtin:chime',
      volume: 0.85,
      cooldownSeconds: 0,
      enabled: true
    },
    {
      id: 'rule_share_default',
      eventType: 'share',
      giftName: '',
      minCoins: 0,
      soundId: 'builtin:pop',
      volume: 0.8,
      cooldownSeconds: 0,
      enabled: true
    }
  ];
}

function createDefaultConfig() {
  return {
    version: 1,
    username: '',
    autoConnect: false,
    masterVolume: 0.8,
    playInDashboard: true,
    sessionIdEncrypted: '',
    ttTargetIdcEncrypted: '',
    overlay: {
      port: 3477,
      token: crypto.randomBytes(24).toString('hex'),
      position: 'bottom',
      accent: '#ff3d81',
      title: 'TIKTATO',
      showGiftImage: true,
      durationMs: 5000
    },
    rules: defaultRules(),
    sounds: []
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeRule(input, index = 0) {
  if (!input || typeof input !== 'object') return null;
  const eventType = EVENT_TYPES.includes(input.eventType) ? input.eventType : 'gift';
  const giftName = eventType === 'gift' ? String(input.giftName || '').trim().slice(0, 80) : '';
  const soundId = String(input.soundId || 'builtin:coin');
  return {
    id: /^rule_[a-z0-9]+$/i.test(String(input.id || '')) ? String(input.id) : makeId('rule'),
    eventType,
    giftName,
    minCoins: eventType === 'gift' ? Math.round(clampNumber(input.minCoins, 0, 0, 1_000_000)) : 0,
    soundId,
    volume: clampNumber(input.volume, 1, 0, 1.5),
    cooldownSeconds: Math.round(clampNumber(input.cooldownSeconds, 0, 0, 86_400)),
    enabled: input.enabled !== false,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : index
  };
}

function normalizeSound(input) {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id || '');
  const filename = path.basename(String(input.filename || ''));
  if (!/^sound_[a-z0-9]+$/i.test(id) || !filename) return null;
  return {
    id,
    name: String(input.name || filename).trim().slice(0, 80) || filename,
    filename,
    mime: String(input.mime || 'application/octet-stream').slice(0, 100),
    size: Math.max(0, Number(input.size) || 0),
    createdAt: String(input.createdAt || new Date().toISOString())
  };
}

function normalizeConfig(input) {
  const defaults = createDefaultConfig();
  const source = input && typeof input === 'object' ? input : {};
  const overlay = source.overlay && typeof source.overlay === 'object' ? source.overlay : {};
  const rules = Array.isArray(source.rules)
    ? source.rules.map(normalizeRule).filter(Boolean)
    : defaults.rules;
  const sounds = Array.isArray(source.sounds)
    ? source.sounds.map(normalizeSound).filter(Boolean)
    : [];

  return {
    ...defaults,
    ...source,
    version: 1,
    username: String(source.username || '').replace(/^@/, '').trim().slice(0, 80),
    autoConnect: source.autoConnect === true,
    masterVolume: clampNumber(source.masterVolume, defaults.masterVolume, 0, 1),
    playInDashboard: source.playInDashboard !== false,
    sessionIdEncrypted: String(source.sessionIdEncrypted || ''),
    ttTargetIdcEncrypted: String(source.ttTargetIdcEncrypted || ''),
    overlay: {
      ...defaults.overlay,
      ...overlay,
      port: Math.round(clampNumber(overlay.port, defaults.overlay.port, 1024, 65535)),
      token: /^[a-f0-9]{16,128}$/i.test(String(overlay.token || ''))
        ? String(overlay.token)
        : defaults.overlay.token,
      position: overlay.position === 'top' ? 'top' : 'bottom',
      accent: /^#[0-9a-f]{6}$/i.test(String(overlay.accent || ''))
        ? String(overlay.accent)
        : defaults.overlay.accent,
      title: String(overlay.title || defaults.overlay.title).trim().slice(0, 30) || defaults.overlay.title,
      showGiftImage: overlay.showGiftImage !== false,
      durationMs: Math.round(clampNumber(overlay.durationMs, defaults.overlay.durationMs, 1500, 20_000))
    },
    rules,
    sounds
  };
}

function configPath(userDataDir) {
  return path.join(userDataDir, 'config.json');
}

function soundsDir(userDataDir) {
  return path.join(userDataDir, 'sounds');
}

function ensureDirectories(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(soundsDir(userDataDir), { recursive: true });
}

function loadConfig(userDataDir) {
  ensureDirectories(userDataDir);
  const file = configPath(userDataDir);
  if (!fs.existsSync(file)) {
    const config = createDefaultConfig();
    saveConfig(userDataDir, config);
    return config;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeConfig(parsed);
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(file, backup);
    } catch {
      // Si no se puede respaldar, se continúa con la configuración por defecto.
    }
    const config = createDefaultConfig();
    saveConfig(userDataDir, config);
    return config;
  }
}

function saveConfig(userDataDir, config) {
  ensureDirectories(userDataDir);
  const normalized = normalizeConfig(config);
  const file = configPath(userDataDir);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(temporary, file);
  return normalized;
}

function importSound(userDataDir, sourcePath, displayName) {
  const stats = fs.statSync(sourcePath);
  if (!stats.isFile()) throw new Error('El archivo seleccionado no es válido.');
  if (stats.size > MAX_SOUND_BYTES) throw new Error('El sonido supera el límite de 30 MB.');
  const extension = path.extname(sourcePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error('Formato no compatible. Usa MP3, WAV, OGG, M4A, AAC, FLAC o WEBM.');
  }
  ensureDirectories(userDataDir);
  const id = makeId('sound');
  const filename = `${id}${extension}`;
  fs.copyFileSync(sourcePath, path.join(soundsDir(userDataDir), filename));
  return {
    id,
    name: String(displayName || path.basename(sourcePath, extension)).trim().slice(0, 80) || 'Sonido',
    filename,
    mime: mimeForExtension(extension),
    size: stats.size,
    createdAt: new Date().toISOString()
  };
}

function deleteSoundFile(userDataDir, sound) {
  if (!sound || !sound.filename) return;
  const file = path.join(soundsDir(userDataDir), path.basename(sound.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function mimeForExtension(extension) {
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  };
  return map[extension] || 'application/octet-stream';
}

function publicConfig(config, { overlayUrl } = {}) {
  return {
    version: config.version,
    username: config.username,
    autoConnect: config.autoConnect,
    masterVolume: config.masterVolume,
    playInDashboard: config.playInDashboard,
    hasSession: Boolean(config.sessionIdEncrypted),
    overlay: {
      port: config.overlay.port,
      position: config.overlay.position,
      accent: config.overlay.accent,
      title: config.overlay.title,
      showGiftImage: config.overlay.showGiftImage,
      durationMs: config.overlay.durationMs
    },
    overlayUrl: overlayUrl || '',
    rules: config.rules,
    sounds: config.sounds
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  BUILTIN_IDS,
  EVENT_TYPES,
  MAX_SOUND_BYTES,
  configPath,
  createDefaultConfig,
  deleteSoundFile,
  importSound,
  loadConfig,
  normalizeConfig,
  normalizeRule,
  publicConfig,
  saveConfig,
  soundsDir
};
