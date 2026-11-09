const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EVENT_TYPES = ['gift', 'follow', 'share', 'like', 'chat', 'subscribe', 'join'];
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
      cooldownSeconds: 5,
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
    playInDashboard: false,
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
    jar: {
      title: 'Frasco de donaciones',
      goalCoins: 1000,
      currentCoins: 0,
      currentGifts: 0,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: [],
      giftType: 'allGifts',
      minimumValue: 1,
      selectedGifts: [],
      xOffset: 0,
      yOffset: 0,
      scale: 1.0,
      giftScale: 1.0,
      numberOfRanks: 'top5',
      leaderboardDisplayFormat: 'avatarNameCoins',
      displayRankBadges: true,
      displayLeaderboard: true,
      showTotalCoins: true,
      displayAlert: true,
      leaderboardDuration: 5,
      alertDuration: 5,
      topDonors: []
    },
    tts: {
      enabled: true,
      chatEnabled: true,
      readUsername: true,
      giftsEnabled: false,
      minCoins: 1,
      volume: 0.8,
      voiceProvider: 'google',
      voiceLanguage: 'es-ES',
      voiceId: 'google:es-ES',
      ducking: true,
      duckingLevel: 0.25,
      antiSpam: true,
      playEveryStreak: true,
      maxChars: 120,
      filterChatByRole: false,
      allowModerators: true,
      allowSubscribers: true,
      allowHighlighted: true,
      allowFriends: false,
      allowFollowers: false,
      allowGifter: false,
      minGifterLevel: 1,
      allowMember: false,
      minMemberLevel: 1
    },
    rules: defaultRules(),
    sounds: Object.assign([], { playEveryStreak: true }),
    soundsPlayEveryStreak: true
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
  const giftId = eventType === 'gift' ? String(input.giftId || '').trim().slice(0, 40) : '';
  const giftImageUrl = eventType === 'gift' ? String(input.giftImageUrl || '').trim().slice(0, 500) : '';
  const soundId = String(input.soundId || 'builtin:coin');
  const rule = {
    id: /^rule_[a-z0-9_]+$/i.test(String(input.id || '')) ? String(input.id) : makeId('rule'),
    eventType,
    giftName,
    minCoins: eventType === 'gift' ? Math.round(clampNumber(input.minCoins, 0, 0, 1_000_000)) : 0,
    soundId,
    volume: clampNumber(input.volume, 1, 0, 1.5),
    cooldownSeconds: Math.round(clampNumber(input.cooldownSeconds, 0, 0, 86_400)),
    enabled: input.enabled !== false,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : index
  };
  if (giftId) rule.giftId = giftId;
  if (giftImageUrl) rule.giftImageUrl = giftImageUrl;
  return rule;
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

function computeBaseRadius(v) {
  const value = Math.max(1, Math.min(100000, Number(v) || 1));
  const normalized = (value - 1) / 99999;
  const inner = Math.pow(normalized, 0.6) * 8;
  return 11 + 89 * Math.tanh(inner);
}

function computeGiftRadius(value, scale = 1.0, giftScale = 1.0) {
  const s = clampNumber(scale, 1.0, 0.1, 3.0);
  const gs = clampNumber(giftScale, 1.0, 0.1, 3.0);
  return computeBaseRadius(value) * s * gs;
}

function shouldPassJarFilter(jarConfig, event) {
  if (!event || event.type !== 'gift') return false;
  const giftType = jarConfig?.giftType || 'allGifts';
  const coinsPerGift = Number(
    event.coinsPerGift || (event.repeatCount ? Math.round(event.coins / event.repeatCount) : event.coins) || 0
  );
  const totalCoins = Number(event.coins || 0);

  if (giftType === 'minimumValue') {
    const min = Math.max(1, Number(jarConfig?.minimumValue) || 1);
    if (coinsPerGift < min && totalCoins < min) {
      return false;
    }
  }

  if (giftType === 'selectedGifts') {
    const selected = Array.isArray(jarConfig?.selectedGifts) ? jarConfig.selectedGifts : [];
    if (selected.length > 0) {
      const idMatch = event.giftId && selected.includes(String(event.giftId));
      const nameMatch = event.giftName && selected.some((s) => s.toLowerCase() === event.giftName.toLowerCase());
      if (!idMatch && !nameMatch) {
        return false;
      }
    }
  }

  return true;
}

function updateTopDonorsList(currentDonors = [], { username, displayName, avatarUrl, coins = 0 } = {}) {
  if (!username || coins <= 0) return Array.isArray(currentDonors) ? currentDonors : [];
  const list = (Array.isArray(currentDonors) ? currentDonors : []).map((d) => ({ ...d }));
  const existing = list.find((d) => d.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    existing.totalCoins += coins;
    if (displayName) existing.displayName = displayName;
    if (avatarUrl) existing.avatarUrl = avatarUrl;
  } else {
    list.push({
      username,
      displayName: displayName || username,
      avatarUrl: avatarUrl || '',
      totalCoins: coins
    });
  }
  list.sort((a, b) => b.totalCoins - a.totalCoins);
  if (list.length > 20) list.length = 20;
  return list;
}

function normalizeJar(input) {
  const defaults = createDefaultConfig().jar;
  const jar = input && typeof input === 'object' ? input : {};
  const recentGifts = Array.isArray(jar.recentGifts)
    ? jar.recentGifts
        .filter((gift) => gift && typeof gift === 'object')
        .slice(0, 8)
        .map((gift) => ({
          name: String(gift.name || 'Regalo').slice(0, 60),
          imageUrl: String(gift.imageUrl || '').slice(0, 500),
          coins: Math.max(0, Number(gift.coins) || 0),
          username: String(gift.username || '').slice(0, 80),
          at: String(gift.at || new Date().toISOString())
        }))
    : [];

  const topDonors = Array.isArray(jar.topDonors)
    ? jar.topDonors
        .filter((donor) => donor && typeof donor === 'object')
        .slice(0, 20)
        .map((donor) => ({
          username: String(donor.username || '').slice(0, 80),
          displayName: String(donor.displayName || donor.username || 'Alguien').slice(0, 80),
          avatarUrl: String(donor.avatarUrl || '').slice(0, 500),
          totalCoins: Math.max(0, Number(donor.totalCoins) || 0)
        }))
    : [];

  const selectedGifts = Array.isArray(jar.selectedGifts)
    ? jar.selectedGifts.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 100)
    : [];

  return {
    title: String(jar.title || defaults.title).trim().slice(0, 40) || defaults.title,
    goalCoins: Math.round(clampNumber(jar.goalCoins, defaults.goalCoins, 1, 1_000_000_000)),
    currentCoins: Math.round(clampNumber(jar.currentCoins, 0, 0, 1_000_000_000)),
    currentGifts: Math.round(clampNumber(jar.currentGifts, 0, 0, 1_000_000_000)),
    accent: /^#[0-9a-f]{6}$/i.test(String(jar.accent || '')) ? String(jar.accent) : defaults.accent,
    showRecentGifts: jar.showRecentGifts !== false,
    recentGifts,
    giftType: ['allGifts', 'minimumValue', 'selectedGifts'].includes(jar.giftType)
      ? jar.giftType
      : defaults.giftType,
    minimumValue: Math.round(clampNumber(jar.minimumValue, defaults.minimumValue, 1, 1_000_000)),
    selectedGifts,
    xOffset: clampNumber(jar.xOffset, 0, -2000, 2000),
    yOffset: clampNumber(jar.yOffset, 0, -2000, 2000),
    scale: Number(clampNumber(jar.scale, 1.0, 0.1, 3.0).toFixed(2)),
    giftScale: Number(clampNumber(jar.giftScale, 1.0, 0.1, 3.0).toFixed(2)),
    numberOfRanks: ['top3', 'top5', 'top10'].includes(jar.numberOfRanks)
      ? jar.numberOfRanks
      : defaults.numberOfRanks,
    leaderboardDisplayFormat: 'avatarNameCoins',
    displayRankBadges: jar.displayRankBadges !== false,
    displayLeaderboard: jar.displayLeaderboard !== false,
    showTotalCoins: jar.showTotalCoins !== false,
    displayAlert: jar.displayAlert !== false,
    leaderboardDuration: Math.round(clampNumber(jar.leaderboardDuration, defaults.leaderboardDuration, 1, 60)),
    alertDuration: Math.round(clampNumber(jar.alertDuration, defaults.alertDuration, 1, 60)),
    topDonors
  };
}

function normalizeTts(input) {
  const defaults = createDefaultConfig().tts;
  const tts = input && typeof input === 'object' ? input : {};
  const voiceProvider = ['google', 'local'].includes(tts.voiceProvider)
    ? tts.voiceProvider
    : defaults.voiceProvider;

  return {
    enabled: tts.enabled !== false,
    chatEnabled: tts.chatEnabled !== false,
    readUsername: tts.readUsername !== false,
    giftsEnabled: tts.giftsEnabled === true,
    minCoins: Math.round(clampNumber(tts.minCoins, defaults.minCoins, 0, 1_000_000)),
    volume: clampNumber(tts.volume, defaults.volume, 0, 1),
    voiceProvider,
    voiceLanguage: String(tts.voiceLanguage || defaults.voiceLanguage).slice(0, 20),
    voiceId: String(tts.voiceId || defaults.voiceId || 'google:es-ES').slice(0, 100),
    ducking: tts.ducking !== false,
    duckingLevel: clampNumber(tts.duckingLevel, defaults.duckingLevel, 0, 1),
    antiSpam: tts.antiSpam !== undefined ? Boolean(tts.antiSpam) : true,
    playEveryStreak: tts.playEveryStreak !== false,
    maxChars: Math.round(clampNumber(tts.maxChars, defaults.maxChars, 20, 500)),
    filterChatByRole: tts.filterChatByRole === true,
    allowModerators: tts.allowModerators !== false,
    allowSubscribers: tts.allowSubscribers !== false,
    allowHighlighted: tts.allowHighlighted !== false,
    allowFriends: tts.allowFriends === true,
    allowFollowers: tts.allowFollowers === true,
    allowGifter: tts.allowGifter === true,
    minGifterLevel: Math.round(clampNumber(tts.minGifterLevel, defaults.minGifterLevel, 1, 100)),
    allowMember: tts.allowMember === true,
    minMemberLevel: Math.round(clampNumber(tts.minMemberLevel, defaults.minMemberLevel, 1, 100))
  };
}

function normalizeConfig(input) {
  const defaults = createDefaultConfig();
  const source = input && typeof input === 'object' ? input : {};
  const overlay = source.overlay && typeof source.overlay === 'object' ? source.overlay : {};
  const rules = Array.isArray(source.rules)
    ? source.rules.map(normalizeRule).filter(Boolean)
    : defaults.rules;
  const soundsPlayEveryStreak =
    source?.sounds?.playEveryStreak !== undefined
      ? Boolean(source.sounds.playEveryStreak)
      : (source?.soundsPlayEveryStreak !== undefined
          ? Boolean(source.soundsPlayEveryStreak)
          : true);
  const sounds = Array.isArray(source.sounds)
    ? source.sounds.map(normalizeSound).filter(Boolean)
    : [];
  sounds.playEveryStreak = soundsPlayEveryStreak;

  return {
    ...defaults,
    ...source,
    version: 1,
    username: String(source.username || '').replace(/^@/, '').trim().slice(0, 80),
    autoConnect: source.autoConnect === true,
    masterVolume: clampNumber(source.masterVolume, defaults.masterVolume, 0, 1),
    playInDashboard: source.playInDashboard === true,
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
    jar: normalizeJar(source.jar),
    tts: normalizeTts(source.tts),
    rules,
    sounds,
    soundsPlayEveryStreak
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

const pendingConfigSaves = new Map();
const inFlightConfigSaves = new Map();
const configSaveGenerations = new Map();

function bumpGeneration(dirKey) {
  const next = (configSaveGenerations.get(dirKey) || 0) + 1;
  configSaveGenerations.set(dirKey, next);
  return next;
}

function saveConfig(userDataDir, config) {
  const dirKey = path.resolve(userDataDir);
  const pending = pendingConfigSaves.get(dirKey);
  if (pending) {
    clearTimeout(pending.timer);
    pendingConfigSaves.delete(dirKey);
  }
  inFlightConfigSaves.delete(dirKey);
  bumpGeneration(dirKey);
  ensureDirectories(userDataDir);
  const normalized = normalizeConfig(config);
  const file = configPath(userDataDir);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(temporary, file);
  return normalized;
}

async function writeConfigAsync(userDataDir, normalized, expectedGen) {
  const dirKey = path.resolve(userDataDir);
  await fs.promises.mkdir(userDataDir, { recursive: true });
  await fs.promises.mkdir(soundsDir(userDataDir), { recursive: true });
  if (configSaveGenerations.get(dirKey) !== expectedGen) return normalized;

  const file = configPath(userDataDir);
  const temporary = `${file}.${process.pid}.${expectedGen}.tmp`;
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(normalized, null, 2), 'utf8');
    if (configSaveGenerations.get(dirKey) !== expectedGen) {
      await fs.promises.unlink(temporary).catch(() => {});
      return normalized;
    }
    await fs.promises.rename(temporary, file);
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => {});
    throw error;
  }
  return normalized;
}

function scheduleSaveConfig(userDataDir, config, { delayMs = 1000, maxWaitMs = 5000 } = {}) {
  const dirKey = path.resolve(userDataDir);
  const normalized = normalizeConfig(config);
  const now = Date.now();
  const existing = pendingConfigSaves.get(dirKey);
  const firstQueuedAt = existing ? existing.firstQueuedAt : now;

  if (existing) {
    clearTimeout(existing.timer);
  }

  const elapsed = now - firstQueuedAt;
  const effectiveDelay = Math.max(0, Math.min(Number(delayMs) || 1000, Math.max(0, (Number(maxWaitMs) || 5000) - elapsed)));

  const timer = setTimeout(() => {
    const current = pendingConfigSaves.get(dirKey);
    if (!current) return;
    pendingConfigSaves.delete(dirKey);
    const gen = bumpGeneration(dirKey);
    inFlightConfigSaves.set(dirKey, {
      userDataDir: current.userDataDir,
      config: current.config,
      gen
    });
    writeConfigAsync(current.userDataDir, current.config, gen)
      .catch(() => {
        try {
          if (configSaveGenerations.get(dirKey) === gen) {
            saveConfig(current.userDataDir, current.config);
          }
        } catch {
          // Ignorado si el directorio temporal ya fue eliminado.
        }
      })
      .finally(() => {
        if (inFlightConfigSaves.get(dirKey)?.gen === gen) {
          inFlightConfigSaves.delete(dirKey);
        }
      });
  }, effectiveDelay);
  timer.unref?.();

  pendingConfigSaves.set(dirKey, {
    userDataDir,
    config: normalized,
    firstQueuedAt,
    timer
  });

  return normalized;
}

function flushConfigSave(userDataDir) {
  if (userDataDir) {
    const dirKey = path.resolve(userDataDir);
    const pending = pendingConfigSaves.get(dirKey);
    const inFlight = inFlightConfigSaves.get(dirKey);
    if (!pending && !inFlight) return null;
    if (pending) {
      clearTimeout(pending.timer);
      pendingConfigSaves.delete(dirKey);
    }
    inFlightConfigSaves.delete(dirKey);
    const target = pending || inFlight;
    return saveConfig(target.userDataDir, target.config);
  }

  let lastSaved = null;
  const allKeys = new Set([...pendingConfigSaves.keys(), ...inFlightConfigSaves.keys()]);
  for (const dirKey of allKeys) {
    const pending = pendingConfigSaves.get(dirKey);
    const inFlight = inFlightConfigSaves.get(dirKey);
    if (pending) {
      clearTimeout(pending.timer);
      pendingConfigSaves.delete(dirKey);
    }
    inFlightConfigSaves.delete(dirKey);
    const target = pending || inFlight;
    if (!target) continue;
    try {
      lastSaved = saveConfig(target.userDataDir, target.config);
    } catch {
      // Ignorado al cerrar si no se puede escribir.
    }
  }
  return lastSaved;
}

function hasPendingConfigSave(userDataDir) {
  if (userDataDir) {
    const dirKey = path.resolve(userDataDir);
    return pendingConfigSaves.has(dirKey) || inFlightConfigSaves.has(dirKey);
  }
  return pendingConfigSaves.size > 0 || inFlightConfigSaves.size > 0;
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

function publicJar(config) {
  const jar = config.jar || createDefaultConfig().jar;
  const percent = Math.max(0, Math.min(100, (Number(jar.currentCoins) / Math.max(1, Number(jar.goalCoins))) * 100));
  return {
    title: jar.title,
    goalCoins: jar.goalCoins,
    currentCoins: jar.currentCoins,
    currentGifts: jar.currentGifts,
    accent: jar.accent,
    showRecentGifts: jar.showRecentGifts,
    recentGifts: jar.recentGifts,
    giftType: jar.giftType || 'allGifts',
    minimumValue: jar.minimumValue ?? 1,
    selectedGifts: jar.selectedGifts || [],
    xOffset: jar.xOffset || 0,
    yOffset: jar.yOffset || 0,
    scale: jar.scale ?? 1.0,
    giftScale: jar.giftScale ?? 1.0,
    numberOfRanks: jar.numberOfRanks || 'top5',
    leaderboardDisplayFormat: jar.leaderboardDisplayFormat || 'avatarNameCoins',
    displayRankBadges: jar.displayRankBadges !== false,
    displayLeaderboard: jar.displayLeaderboard !== false,
    showTotalCoins: jar.showTotalCoins !== false,
    displayAlert: jar.displayAlert !== false,
    leaderboardDuration: jar.leaderboardDuration || 5,
    alertDuration: jar.alertDuration || 5,
    topDonors: jar.topDonors || [],
    percent,
    completed: percent >= 100
  };
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
    jar: publicJar(config),
    tts: config.tts || createDefaultConfig().tts,
    rules: config.rules,
    sounds: Object.assign(config.sounds, {
      playEveryStreak: config.sounds?.playEveryStreak ?? config.soundsPlayEveryStreak ?? true
    }),
    soundsPlayEveryStreak: config.sounds?.playEveryStreak ?? config.soundsPlayEveryStreak ?? true
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  BUILTIN_IDS,
  EVENT_TYPES,
  MAX_SOUND_BYTES,
  computeBaseRadius,
  computeGiftRadius,
  configPath,
  createDefaultConfig,
  deleteSoundFile,
  flushConfigSave,
  hasPendingConfigSave,
  importSound,
  loadConfig,
  normalizeConfig,
  normalizeJar,
  normalizeRule,
  normalizeTts,
  publicConfig,
  publicJar,
  saveConfig,
  scheduleSaveConfig,
  shouldPassJarFilter,
  soundsDir,
  updateTopDonorsList
};
