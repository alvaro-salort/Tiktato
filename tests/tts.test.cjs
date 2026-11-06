const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig, normalizeTts, createDefaultConfig } = require('../electron/config.cjs');
const { normalizeTikTokEvent, makeTestEvent } = require('../electron/events.cjs');
const { selectRule, markPlayed } = require('../electron/alert-matcher.cjs');

test('normaliza configuración de TTS y combos por defecto', () => {
  const config = createDefaultConfig();
  assert.equal(config.tts.enabled, true);
  assert.equal(config.tts.chatEnabled, true);
  assert.equal(config.tts.giftsEnabled, true);
  assert.equal(config.tts.minCoins, 1);
  assert.equal(config.tts.volume, 0.8);
  assert.equal(config.tts.voiceProvider, 'google');
  assert.equal(config.tts.ducking, true);
  assert.equal(config.tts.duckingLevel, 0.25);
  // Por requerimiento del usuario: antiSpam es falso por defecto y los combos se repiten por defecto
  assert.equal(config.tts.antiSpam, false);
  assert.equal(config.tts.playEveryStreak, true);
  assert.equal(config.tts.maxChars, 120);
});

test('normaliza valores extremos o inválidos de TTS', () => {
  const tts = normalizeTts({
    volume: 5,
    minCoins: -10,
    voiceProvider: 'hacker_voice',
    duckingLevel: 99,
    maxChars: 5000,
    antiSpam: true,
    playEveryStreak: false
  });
  assert.equal(tts.volume, 1);
  assert.equal(tts.minCoins, 0);
  assert.equal(tts.voiceProvider, 'google');
  assert.equal(tts.duckingLevel, 1);
  assert.equal(tts.maxChars, 500);
  assert.equal(tts.antiSpam, true);
  assert.equal(tts.playEveryStreak, false);
});

test('filtro anti-spam opcional en tts-engine', async () => {
  const { filterTtsText } = await import('../shared/tts-engine.js');

  // Con antiSpam DESACTIVADO (comportamiento divertido preferido por el usuario)
  assert.equal(filterTtsText('holaaaaaa', { antiSpam: false }), 'holaaaaaa');
  assert.equal(filterTtsText('!song request', { antiSpam: false }), '!song request');
  assert.equal(filterTtsText('/help me', { antiSpam: false }), '/help me');

  // Con antiSpam ACTIVADO (opcional para cuando hay spam excesivo)
  assert.equal(filterTtsText('!song request', { antiSpam: true }), '');
  assert.equal(filterTtsText('/help me', { antiSpam: true }), '');
  assert.equal(filterTtsText('.play song', { antiSpam: true }), '');
  assert.equal(filterTtsText('holaaaaaaa', { antiSpam: true }), 'holaa');
  assert.equal(filterTtsText('jaja jaja jaja jaja jaja', { antiSpam: true }), 'jaja jaja');
  assert.equal(filterTtsText('sí sí sí sí', { antiSpam: true }), 'sí sí');
  assert.equal(filterTtsText('???!!!', { antiSpam: true }), '');
});

test('formateadores de texto para chat y regalos', async () => {
  const { formatChatTTS, formatGiftTTS, buildGoogleTTSUrl } = await import('../shared/tts-engine.js');

  assert.equal(formatChatTTS('Pepe', 'hola directo'), 'Pepe dice: hola directo');
  assert.equal(formatChatTTS('', 'hola directo'), 'hola directo');
  assert.equal(formatGiftTTS('Ana', 'Rosa', 1), 'Ana envió Rosa');
  assert.equal(formatGiftTTS('Leo', 'Galaxy', 5), 'Leo envió 5 Galaxy');

  const url = buildGoogleTTSUrl('prueba de voz', 'es-ES');
  assert.match(url, /google\.com\/speech-api\/v2\/synthesize/);
  assert.match(url, /lang=es-ES/);
  assert.match(url, /text=prueba%20de%20voz/);
});

test('cola TTSQueue gestiona encolado, saltos y vaciado de cola', async () => {
  const { TTSQueue } = await import('../shared/tts-engine.js');

  const notifications = [];
  const fakeSoundEngine = {
    ducked: false,
    duck(factor) { this.ducked = true; this.factor = factor; },
    restore() { this.ducked = false; }
  };

  const queue = new TTSQueue({
    soundEngine: fakeSoundEngine,
    onStateChange(st) { notifications.push({ ...st }); }
  });

  // Encolar mensaje con antiSpam desactivado
  queue.enqueue({ text: 'Primer mensaje', antiSpam: false, volume: 0.8 });
  assert.equal(queue.queue.length + (queue.isSpeaking ? 1 : 0) >= 1, true);

  // Saltar mensaje
  queue.skip();

  // Silenciar cola y verificar que no encole
  queue.mute(true);
  assert.equal(queue.isMuted, true);
  queue.enqueue({ text: 'Mensaje mientras está silenciado' });
  assert.equal(queue.queue.length, 0);

  // Desilenciar cola
  queue.mute(false);
  assert.equal(queue.isMuted, false);

  // Limpiar / vaciar cola
  queue.clear();
  assert.equal(queue.queue.length, 0);
  assert.equal(fakeSoundEngine.ducked, false);
});

test('combos de regalos suenan en cada evento cuando playEveryStreak está activo', () => {
  const comboMessage = {
    user: { uniqueId: 'combo_fan', nickname: 'Combo Fan', userId: '100' },
    giftId: 5655,
    repeatEnd: 0, // racha aún en progreso
    repeatCount: 12,
    gift: {
      type: 1,
      name: 'Rosa',
      diamondCount: 1
    }
  };

  // Por defecto sin opciones: mantiene compatibilidad (ignora intermedios)
  assert.equal(normalizeTikTokEvent('gift', comboMessage), null);
  assert.equal(normalizeTikTokEvent('gift', comboMessage, Date.now(), { playEveryStreak: false }), null);

  // Con playEveryStreak: true (activado por el usuario)
  const event = normalizeTikTokEvent('gift', comboMessage, Date.now(), { playEveryStreak: true });
  assert.notEqual(event, null);
  assert.equal(event.giftName, 'Rosa');
  assert.equal(event.repeatCount, 12);
  assert.equal(event.repeatEnd, false);
});

test('los impactos intermedios de combo ignoran el cooldown de regla para sonar varias veces', () => {
  const rules = [
    {
      id: 'rule_rosa',
      eventType: 'gift',
      giftName: 'Rosa',
      minCoins: 1,
      soundId: 'builtin:coin',
      cooldownSeconds: 5,
      enabled: true
    }
  ];

  const now = 1_000_000;
  const cooldowns = new Map();

  const comboEvent1 = {
    type: 'gift',
    userId: 'fan1',
    giftName: 'Rosa',
    coins: 1,
    repeatCount: 1,
    repeatEnd: false // combo en progreso
  };

  const comboEvent2 = {
    type: 'gift',
    userId: 'fan1',
    giftName: 'Rosa',
    coins: 1,
    repeatCount: 2,
    repeatEnd: false // combo en progreso
  };

  // El primer impacto de combo coincide y se registra
  const matched1 = selectRule(rules, comboEvent1, cooldowns, now);
  assert.equal(matched1?.id, 'rule_rosa');
  markPlayed(matched1, comboEvent1, cooldowns, now);

  // 100ms después, el segundo impacto de combo aún coincide (NO es bloqueado por cooldownSeconds: 5)
  const matched2 = selectRule(rules, comboEvent2, cooldowns, now + 100);
  assert.equal(matched2?.id, 'rule_rosa');
});

test('normaliza eventos de tipo chat y genera eventos de prueba de chat', () => {
  const chatData = {
    user: { uniqueId: 'streamer_lover', nickname: 'Streamer Fan', id: '555' },
    content: '¡Excelente directo!'
  };

  const normalized = normalizeTikTokEvent('chat', chatData);
  assert.equal(normalized.type, 'chat');
  assert.equal(normalized.username, 'streamer_lover');
  assert.equal(normalized.displayName, 'Streamer Fan');
  assert.equal(normalized.comment, '¡Excelente directo!');
  assert.equal(normalized.message, '¡Excelente directo!');

  const testChat = makeTestEvent({ type: 'chat', message: 'Mensaje de prueba' });
  assert.equal(testChat.type, 'chat');
  assert.equal(testChat.message, 'Mensaje de prueba');
  assert.equal(testChat.test, true);
});

test('SoundEngine ducking y restore ajustan el volumen relativo', async () => {
  const { SoundEngine } = await import('../shared/audio-engine.js');
  const engine = new SoundEngine();

  assert.equal(engine.isDucked, false);
  engine.duck(0.2);
  assert.equal(engine.isDucked, true);
  assert.equal(engine.duckFactor, 0.2);

  engine.restore();
  assert.equal(engine.isDucked, false);
});

test('un combo de regalos no multiplica las monedas ni los regalos en el frasco', () => {
  const streakEvents = [1, 2, 3, 4, 5].map((count) => {
    const isFinal = count === 5;
    return normalizeTikTokEvent(
      'gift',
      {
        user: { uniqueId: 'fan_combo', nickname: 'Fan' },
        giftId: 5655,
        repeatCount: count,
        repeatEnd: isFinal ? 1 : 0,
        gift: { type: 1, name: 'Rosa', diamondCount: 1 }
      },
      Date.now(),
      { playEveryStreak: true }
    );
  });

  assert.equal(streakEvents.length, 5);
  for (let i = 0; i < 4; i++) {
    assert.equal(streakEvents[i].repeatEnd, false);
    assert.equal(streakEvents[i].repeatCount, i + 1);
  }
  assert.equal(streakEvents[4].repeatEnd, true);
  assert.equal(streakEvents[4].repeatCount, 5);
  assert.equal(streakEvents[4].coins, 5);

  const jarCredits = streakEvents.filter((ev) => ev.repeatEnd !== false);
  assert.equal(jarCredits.length, 1);
  assert.equal(jarCredits[0].coins, 5);
});
