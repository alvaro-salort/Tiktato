const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig, normalizeTts, createDefaultConfig } = require('../electron/config.cjs');
const { normalizeTikTokEvent, makeTestEvent } = require('../electron/events.cjs');
const { selectRule, markPlayed } = require('../electron/alert-matcher.cjs');

test('normaliza configuración de TTS y combos por defecto', () => {
  const config = createDefaultConfig();
  assert.equal(config.tts.enabled, true);
  assert.equal(config.tts.chatEnabled, true);
  assert.equal(config.tts.giftsEnabled, false);
  assert.equal(config.tts.minCoins, 1);
  assert.equal(config.tts.volume, 0.8);
  assert.equal(config.tts.voiceProvider, 'local');
  assert.equal(config.tts.voiceId, 'local');
  assert.equal(config.tts.ducking, true);
  assert.equal(config.tts.duckingLevel, 0.25);
  assert.equal(config.tts.antiSpam, true);
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
  assert.equal(tts.voiceProvider, 'local');
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

test('formateadores de texto para chat y regalos (sin "dice" y con readUsername opcional)', async () => {
  const ttsEngine = await import('../shared/tts-engine.js');
  const { formatChatTTS, formatGiftTTS, shouldReadChatMessage } = ttsEngine;

  assert.equal(formatChatTTS('Pepe', 'hola directo'), 'Pepe: hola directo');
  assert.equal(formatChatTTS('Pepe', 'hola directo', { readUsername: true }), 'Pepe: hola directo');
  assert.equal(formatChatTTS('Pepe', 'hola directo', { readUsername: false }), 'hola directo');
  assert.equal(formatChatTTS('', 'hola directo'), 'hola directo');
  assert.equal(formatGiftTTS('Ana', 'Rosa', 1), 'Ana envió Rosa');
  assert.equal(formatGiftTTS('Leo', 'Galaxy', 5), 'Leo envió 5 Galaxy');

  // Por defecto lee todos los mensajes cuando filterChatByRole está desactivado
  const normalUserMsg = { type: 'chat', username: 'viewer1', comment: 'hola' };
  assert.equal(shouldReadChatMessage(normalUserMsg, { chatEnabled: true, filterChatByRole: false }), true);

  // Cuando filterChatByRole está activo, solo lee los roles habilitados
  const roleFilterCfg = {
    chatEnabled: true,
    filterChatByRole: true,
    allowModerators: true,
    allowSubscribers: true,
    allowHighlighted: true,
    allowFriends: false,
    allowFollowers: false,
    allowGifter: true,
    minGifterLevel: 10,
    allowMember: true,
    minMemberLevel: 5
  };

  assert.equal(shouldReadChatMessage(normalUserMsg, roleFilterCfg), false);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, isModerator: true }, roleFilterCfg), true);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, isSuperFan: true }, roleFilterCfg), true);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, isHighlighted: true }, roleFilterCfg), true);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, gifterLevel: 5 }, roleFilterCfg), false);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, gifterLevel: 12 }, roleFilterCfg), true);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, memberLevel: 3 }, roleFilterCfg), false);
  assert.equal(shouldReadChatMessage({ ...normalUserMsg, memberLevel: 6 }, roleFilterCfg), true);

  assert.equal('GOOGLE_TTS_API_KEY' in ttsEngine, false);
  assert.equal('buildGoogleTTSUrl' in ttsEngine, false);
});

test('cola TTSQueue limita a 5 mensajes, deduplica msgId y cancela por moderación (imDelete)', async () => {
  const { TTSQueue } = await import('../shared/tts-engine.js');

  const queue = new TTSQueue({ maxQueueSize: 5 });
  // Evitar que processNext consuma la cola durante la prueba unitaria de estructura
  queue.isSpeaking = true;
  queue.currentItem = { text: 'Actual', msgId: 'm_0', userId: 'u_banned' };

  for (let i = 1; i <= 7; i++) {
    queue.enqueue({
      text: `Mensaje ${i}`,
      msgId: `m_${i}`,
      userId: i === 5 ? 'u_banned' : `u_${i}`,
      antiSpam: false
    });
  }

  // Solo conserva los últimos 5 en cola (m_3 a m_7)
  assert.equal(queue.queue.length, 5);
  assert.deepEqual(
    queue.queue.map((item) => item.msgId),
    ['m_3', 'm_4', 'm_5', 'm_6', 'm_7']
  );

  // Deduplicación por msgId: intentar volver a encolar m_6 no lo duplica
  queue.enqueue({ text: 'Mensaje 6 repetido', msgId: 'm_6', userId: 'u_6', antiSpam: false });
  assert.equal(queue.queue.length, 5);

  // Moderación: borrar m_4 y banear a u_banned (que tenía m_5 en cola)
  queue.isSpeaking = false;
  queue.currentItem = null;
  const removed = queue.removeByModeration({
    deleteMsgIds: ['m_4'],
    deleteUserIds: ['u_banned']
  });
  assert.equal(removed, 2);
  assert.deepEqual(
    queue.queue.map((item) => item.msgId),
    ['m_3', 'm_6', 'm_7']
  );
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

test('SoundEngine ducking y restore admiten volumen de hasta 1.5', async () => {
  const { SoundEngine } = await import('../shared/audio-engine.js');
  const engine = new SoundEngine();

  const mockNode = {
    gain: { value: 1.5, setValueAtTime() {}, linearRampToValueAtTime(val) { this.value = val; } }
  };
  engine.activeNodes.set(mockNode, 1.5);

  engine.duck(0.5);
  assert.equal(mockNode.gain.value, 0.75); // 1.5 * 0.5

  engine.restore();
  assert.equal(mockNode.gain.value, 1.5);
});

test('config.soundsPlayEveryStreak es independiente de config.tts.playEveryStreak', () => {
  const { createDefaultConfig, normalizeConfig } = require('../electron/config.cjs');
  const defaults = createDefaultConfig();
  assert.equal(defaults.soundsPlayEveryStreak, true);
  assert.equal(Array.isArray(defaults.sounds), true);
  assert.equal('playEveryStreak' in defaults.sounds, false);
  assert.equal(defaults.tts.playEveryStreak, true);

  // Modificar solo soundsPlayEveryStreak (incluyendo migración desde propiedad legacy)
  const customSounds = normalizeConfig({
    soundsPlayEveryStreak: false,
    tts: { playEveryStreak: true }
  });
  assert.equal(customSounds.soundsPlayEveryStreak, false);
  assert.equal(customSounds.tts.playEveryStreak, true);

  const migratedLegacy = normalizeConfig({
    sounds: Object.assign([], { playEveryStreak: false }),
    tts: { playEveryStreak: true }
  });
  assert.equal(migratedLegacy.soundsPlayEveryStreak, false);
  assert.equal('playEveryStreak' in migratedLegacy.sounds, false);

  // Modificar solo tts
  const customTts = normalizeConfig({
    soundsPlayEveryStreak: true,
    tts: { playEveryStreak: false }
  });
  assert.equal(customTts.soundsPlayEveryStreak, true);
  assert.equal(customTts.tts.playEveryStreak, false);

  // Ingesta de combos debe permitirse si cualquiera de los dos switches está activo
  const shouldIngestCombos = (cfg) =>
    Boolean(cfg.soundsPlayEveryStreak ?? true) ||
    Boolean(cfg.tts?.playEveryStreak !== false);

  assert.equal(shouldIngestCombos({ soundsPlayEveryStreak: true, tts: { playEveryStreak: false } }), true);
  assert.equal(shouldIngestCombos({ soundsPlayEveryStreak: false, tts: { playEveryStreak: true } }), true);
  assert.equal(shouldIngestCombos({ soundsPlayEveryStreak: false, tts: { playEveryStreak: false } }), false);
});

test('sounds.playEveryStreak false con tts.playEveryStreak true reproduce exactamente un solo sonido al final de cada combo y no silencia regalos posteriores', () => {
  const { createStreakTracker, normalizeTikTokEvent } = require('../electron/events.cjs');
  const { buildAlert } = require('../electron/alert-matcher.cjs');

  const rule = {
    id: 'rule_rosa',
    eventType: 'gift',
    giftId: '5655',
    giftName: 'Rosa',
    soundId: 'builtin:coin',
    volume: 1
  };
  const sound = { id: 'builtin:coin', name: 'Moneda', kind: 'builtin', key: 'coin' };

  const ttsStreakTracker = createStreakTracker();
  const soundStreakTracker = createStreakTracker();

  const soundPerStreak = false;
  const ttsPerStreak = true;

  const allowCombos = soundPerStreak || ttsPerStreak;
  assert.equal(allowCombos, true);

  function processGiftPacket(pkt, time) {
    const event = normalizeTikTokEvent(
      'gift',
      {
        user: { uniqueId: 'fan_combo', userId: '888' },
        giftId: 5655,
        repeatCount: pkt.repeatCount,
        repeatEnd: pkt.repeatEnd,
        groupId: pkt.groupId || '',
        gift: { type: 1, name: 'Rosa', diamondCount: 1 }
      },
      time,
      { playEveryStreak: allowCombos, streakTracker: ttsStreakTracker }
    );

    assert.notEqual(event, null);

    const soundTracked = soundStreakTracker.process(
      {
        userId: event.userId,
        username: event.username,
        giftId: event.giftId,
        giftName: event.giftName,
        groupId: event.groupId,
        giftType: event.giftType,
        repeatCount: event.repeatCount,
        repeatEnd: event.repeatEnd
      },
      time,
      { playEveryStreak: soundPerStreak }
    );

    const soundEvent = {
      ...event,
      streakDelta: soundTracked.streakDelta,
      suppressAlert: soundTracked.suppressAlert
    };

    const suppressAlert = Boolean(
      soundEvent.suppressAlert || (soundEvent.type === 'gift' && soundEvent.streakDelta === 0)
    );

    let alert = null;
    if (!suppressAlert) {
      alert = buildAlert(soundEvent, rule, { sound, playEveryStreak: soundPerStreak });
    }
    return { event, soundEvent, alert };
  }

  // 1. Combo 1: racha de 5 rosas (intermedios 1, 3, 5 y cierre 5)
  let c1Played = 0;
  const c1Packets = [
    { repeatCount: 1, repeatEnd: 0, time: 1000 },
    { repeatCount: 3, repeatEnd: 0, time: 1300 },
    { repeatCount: 5, repeatEnd: 0, time: 1600 },
    { repeatCount: 5, repeatEnd: 1, time: 2000 }
  ];
  for (const pkt of c1Packets) {
    const res = processGiftPacket(pkt, pkt.time);
    if (res.alert) c1Played += 1;
  }
  // Solo debe haber sonado 1 vez al final del combo
  assert.equal(c1Played, 1);

  // 2. Paquete duplicado de cierre de Combo 1 enviado por TikTok 200ms después
  const c1Dup = processGiftPacket({ repeatCount: 5, repeatEnd: 1 }, 2200);
  assert.equal(c1Dup.alert, null);

  // 3. Combo 2 del mismo usuario 1.5s después (dentro de la ventana de cierre): 1 rosa, 2 rosas
  let c2Played = 0;
  const c2Packets = [
    { repeatCount: 1, repeatEnd: 0, time: 3500 },
    { repeatCount: 2, repeatEnd: 1, time: 3800 }
  ];
  for (const pkt of c2Packets) {
    const res = processGiftPacket(pkt, pkt.time);
    if (res.alert) c2Played += 1;
  }
  // El segundo combo DEBE sonar 1 vez y NO ser silenciado por el combo anterior
  assert.equal(c2Played, 1);

  // 4. Regalo individual directo enviado 1s después: repeatCount 1, repeatEnd 1
  const singleRes = processGiftPacket({ repeatCount: 1, repeatEnd: 1 }, 4800);
  assert.notEqual(singleRes.alert, null);
  assert.equal(singleRes.alert.sound.repeat, 1);

  // 5. Cierre duplicado del regalo individual directo 200ms después
  const singleDup = processGiftPacket({ repeatCount: 1, repeatEnd: 1 }, 5000);
  assert.equal(singleDup.alert, null);
});

test('normalizeTts acepta proveedor fish, voiceId fish:<id>, fishVoiceName y fishModel por defecto', () => {
  const tts = normalizeTts({
    voiceProvider: 'fish',
    voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
    fishVoiceName: 'Goku (Mario Castañeda)'
  });
  assert.equal(tts.voiceProvider, 'fish');
  assert.equal(tts.voiceId, 'fish:9f850ee9ada24b20a6866825eaefd3f8');
  assert.equal(tts.fishVoiceName, 'Goku (Mario Castañeda)');
  assert.equal(tts.fishModel, 's2.1-pro-free');
});

test('FishAudioService valida clave, lista/filtra voces y sintetiza con caché acotada en memoria y disco', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { FishAudioService, DEFAULT_FISH_MODEL } = require('../electron/fish-audio.cjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-fish-'));
  const calls = [];

  const mockFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/wallet/self/api-credit')) {
      if (init.headers?.Authorization === 'Bearer valid-key-123') {
        return new Response(JSON.stringify({ credit: '10.00' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    if (String(url).includes('/model')) {
      return new Response(
        JSON.stringify({
          total: 2,
          items: [
            {
              _id: 'aaaa1111bbbb2222cccc3333dddd4444',
              title: 'Voz Celebridad Test',
              tags: ['celebrity', 'spanish'],
              languages: ['es'],
              samples: [{ audio: 'https://example.com/sample.mp3' }],
              task_count: 500
            },
            {
              _id: '9f850ee9ada24b20a6866825eaefd3f8',
              title: 'Goku duplicado API',
              tags: ['character'],
              languages: ['es']
            }
          ]
        }),
        { status: 200 }
      );
    }
    if (String(url).includes('/v1/tts')) {
      if (init.headers?.Authorization !== 'Bearer valid-key-123') {
        return new Response('Unauthorized', { status: 401 });
      }
      const parsed = JSON.parse(init.body);
      const fakeMp3 = Buffer.from(`MP3:${parsed.reference_id}:${parsed.text}`);
      return new Response(fakeMp3, { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const service = new FishAudioService({
      userDataDir: dir,
      fetchImpl: mockFetch,
      maxMemoryEntries: 2,
      maxDiskEntries: 2
    });

    // 1. Validación de API key
    const emptyKey = await service.testApiKey('');
    assert.equal(emptyKey.valid, false);
    assert.equal(emptyKey.code, 'MISSING_API_KEY');

    const badKey = await service.testApiKey('wrong-key');
    assert.equal(badKey.valid, false);
    assert.equal(badKey.code, 'INVALID_API_KEY');

    const goodKey = await service.testApiKey('valid-key-123');
    assert.equal(goodKey.valid, true);
    assert.equal(goodKey.credit, '10.00');

    // 2. Listado y deduplicación de voces + categorías
    const listRes = await service.listVoices({ apiKey: 'valid-key-123', category: 'all' });
    assert.equal(listRes.ok, true);
    assert.ok(listRes.voices.some((v) => v.referenceId === 'aaaa1111bbbb2222cccc3333dddd4444'));
    const gokuCount = listRes.voices.filter((v) => v.referenceId === '9f850ee9ada24b20a6866825eaefd3f8').length;
    assert.equal(gokuCount, 1);

    const selfNoKey = await service.listVoices({ apiKey: '', selfOnly: true });
    assert.equal(selfNoKey.ok, false);

    // 3. Síntesis sin key -> error limpio sin petición HTTP
    const missingKeySynth = await service.synthesize({
      apiKey: '',
      text: 'hola',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(missingKeySynth.ok, false);
    assert.equal(missingKeySynth.code, 'MISSING_API_KEY');

    // 4. Síntesis con key: verifica header model s2.1-pro-free y reference_id en body
    const synth1 = await service.synthesize({
      apiKey: 'valid-key-123',
      text: 'Hola chat',
      referenceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(synth1.ok, true);
    assert.equal(synth1.cached, false);
    assert.equal(
      Buffer.from(synth1.audioBase64, 'base64').toString('utf8'),
      'MP3:9f850ee9ada24b20a6866825eaefd3f8:Hola chat'
    );
    const ttsCall = calls.find((c) => c.url.includes('/v1/tts'));
    assert.equal(ttsCall.init.headers.model, DEFAULT_FISH_MODEL);
    assert.equal(ttsCall.init.headers.Authorization, 'Bearer valid-key-123');

    // 5. Segunda llamada idéntica golpea caché en memoria (sin nuevo fetch)
    const ttsCallsBefore = calls.filter((c) => c.url.includes('/v1/tts')).length;
    const synthMem = await service.synthesize({
      apiKey: 'valid-key-123',
      text: 'Hola chat',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(synthMem.ok, true);
    assert.equal(synthMem.cached, 'memory');
    assert.equal(calls.filter((c) => c.url.includes('/v1/tts')).length, ttsCallsBefore);

    // 6. Nueva instancia lee caché desde disco sin API call
    const service2 = new FishAudioService({ userDataDir: dir, fetchImpl: mockFetch });
    const synthDisk = await service2.synthesize({
      apiKey: '',
      text: 'Hola chat',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(synthDisk.ok, true);
    assert.equal(synthDisk.cached, 'disk');

    // 7. Evicción acotada (maxMemoryEntries=2, maxDiskEntries=2)
    await service.synthesize({
      apiKey: 'valid-key-123',
      text: 'Frase 2',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    await service.synthesize({
      apiKey: 'valid-key-123',
      text: 'Frase 3',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    const cacheStats = await service.getCacheStats();
    assert.equal(cacheStats.memoryEntries, 2);
    assert.equal(cacheStats.diskEntries, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TTSQueue reproduce fish:<reference_id>, cachea frases repetidas, respeta ducking/skip y hace fallback limpio', async () => {
  const { TTSQueue } = await import('../shared/tts-engine.js');

  const playedUrls = [];
  const origAudio = globalThis.Audio;
  globalThis.Audio = class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.listeners = {};
    }
    addEventListener(evt, cb) {
      this.listeners[evt] = cb;
    }
    removeEventListener(evt) {
      delete this.listeners[evt];
    }
    pause() {}
    play() {
      playedUrls.push({ src: this.src, volume: this.volume });
      setTimeout(() => this.listeners.ended?.(), 5);
      return Promise.resolve();
    }
  };
  const localSpoken = [];
  const origWindow = globalThis.window;
  const origUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = '';
    }
  };
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [],
      speak(u) {
        localSpoken.push(u);
        u.onend?.();
      },
      cancel() {}
    }
  };

  try {
    let synthCalls = 0;
    const fakeSoundEngine = {
      ducked: false,
      duck(level) { this.ducked = true; this.level = level; },
      restore() { this.ducked = false; }
    };

    const queue = new TTSQueue({
      soundEngine: fakeSoundEngine,
      maxCacheEntries: 2,
      fishSynthesizer: async ({ text, referenceId }) => {
        synthCalls += 1;
        if (text === 'falla') {
          return { ok: false, error: 'Sin clave' };
        }
        return {
          ok: true,
          audioBase64: Buffer.from(`${referenceId}:${text}`).toString('base64'),
          contentType: 'audio/mpeg'
        };
      }
    });

    // 1. Primera reproducción Fish Audio con ducking y volumen
    queue.enqueue({
      text: 'Hola TikTok',
      voiceProvider: 'fish',
      voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
      volume: 0.6,
      ducking: true,
      duckingLevel: 0.2
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(synthCalls, 1);
    assert.equal(playedUrls.length, 1);
    assert.match(playedUrls[0].src, /^data:audio\/mpeg;base64,/);
    assert.equal(playedUrls[0].volume, 0.6);
    assert.equal(fakeSoundEngine.ducked, false);

    // 2. Segunda frase idéntica reutiliza caché de TTSQueue (synthCalls sigue en 1)
    queue.enqueue({
      text: 'Hola TikTok',
      voiceProvider: 'fish',
      voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
      volume: 0.9
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(synthCalls, 1);
    assert.equal(playedUrls.length, 2);

    // 3. Fallback limpio a voz local si Fish Audio falla
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      queue.enqueue({
        text: 'falla',
        voiceProvider: 'fish',
        voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
        voiceLanguage: 'es-ES'
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
    } finally {
      console.warn = origWarn;
    }
    assert.equal(playedUrls.length, 2);
    assert.equal(localSpoken.length, 1);
    assert.equal(localSpoken[0].text, 'falla');

    // 4. Skip inmediato durante síntesis lenta de Fish Audio
    const slowQueue = new TTSQueue({
      soundEngine: fakeSoundEngine,
      fishSynthesizer: () => new Promise(() => {}) // Nunca resuelve
    });
    slowQueue.enqueue({
      text: 'Lenta',
      voiceProvider: 'fish',
      voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8'
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(slowQueue.isSpeaking, true);
    slowQueue.skip();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(slowQueue.isSpeaking, false);
    assert.equal(fakeSoundEngine.ducked, false);
  } finally {
    if (origAudio === undefined) {
      delete globalThis.Audio;
    } else {
      globalThis.Audio = origAudio;
    }
    if (origWindow === undefined) delete globalThis.window;
    else globalThis.window = origWindow;
    if (origUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = origUtterance;
  }
});

test('FishAudioService maneja catálogo local sin API key, errores de cuota/JSON, clearCache y entradas inválidas', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { FishAudioService } = require('../electron/fish-audio.cjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-fish-edge-'));
  let fetchCalls = 0;

  const mockFetch = async (url) => {
    fetchCalls += 1;
    if (String(url).includes('/v1/tts')) {
      if (fetchCalls === 1) {
        return new Response(JSON.stringify({ detail: 'Rate limit' }), { status: 429 });
      }
      if (fetchCalls === 2) {
        return new Response(JSON.stringify({ error: 'unexpected' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(Buffer.from('OK_MP3'), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const service = new FishAudioService({ userDataDir: dir, fetchImpl: mockFetch });

    // Sin API key: listVoices devuelve voces curadas sin disparar /model (evita 401 falso al abrir el menú)
    const noKeyList = await service.listVoices({ apiKey: '', category: 'characters' });
    assert.equal(noKeyList.ok, true);
    assert.equal(noKeyList.needsApiKey, true);
    assert.equal(noKeyList.source, 'curated');
    assert.ok(noKeyList.voices.length > 0);
    assert.equal(fetchCalls, 0);

    // Texto vacío e ID inválido
    const emptyText = await service.synthesize({
      apiKey: 'k',
      text: '   ',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(emptyText.ok, false);
    assert.equal(emptyText.code, 'EMPTY_TEXT');

    const badRef = await service.synthesize({
      apiKey: 'k',
      text: 'hola',
      referenceId: 'no!'
    });
    assert.equal(badRef.ok, false);
    assert.equal(badRef.code, 'INVALID_REFERENCE_ID');

    // Cuota / 429 y JSON inesperado con 200
    const rateLimited = await service.synthesize({
      apiKey: 'k',
      text: 'hola',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(rateLimited.ok, false);
    assert.equal(rateLimited.code, 'QUOTA_OR_RATE_LIMIT');

    const jsonResp = await service.synthesize({
      apiKey: 'k',
      text: 'hola',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(jsonResp.ok, false);
    assert.equal(jsonResp.code, 'UNEXPECTED_JSON');

    // Síntesis válida + clearCache
    const okResp = await service.synthesize({
      apiKey: 'k',
      text: 'hola',
      referenceId: '9f850ee9ada24b20a6866825eaefd3f8'
    });
    assert.equal(okResp.ok, true);
    let stats = await service.getCacheStats();
    assert.equal(stats.memoryEntries, 1);
    assert.equal(stats.diskEntries, 1);

    await service.clearCache();
    stats = await service.getCacheStats();
    assert.equal(stats.memoryEntries, 0);
    assert.equal(stats.diskEntries, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FishAudioService reporta error cuando /model falla sin voces curadas y amplía page_size en categorías locales', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { FishAudioService } = require('../electron/fish-audio.cjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-fish-401-'));
  const seenUrls = [];
  const mockFetch = async (url) => {
    seenUrls.push(String(url));
    if (seenUrls.length === 1) {
      return new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 });
    }
    return new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 });
  };

  try {
    const service = new FishAudioService({ userDataDir: dir, fetchImpl: mockFetch });
    const badRes = await service.listVoices({ apiKey: 'bad-key', query: 'voz_inexistente_xyz' });
    assert.equal(badRes.ok, false);
    assert.equal(badRes.voices.length, 0);
    assert.match(badRes.error, /inválida/i);

    await service.listVoices({ apiKey: 'good-key', category: 'celebrities' });
    assert.match(seenUrls[1], /page_size=50/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TTSQueue incluye speed en la clave de caché de Fish Audio y lo reenvía al sintetizador', async () => {
  const { TTSQueue } = await import('../shared/tts-engine.js');
  const origAudio = globalThis.Audio;
  globalThis.Audio = class FakeAudio {
    constructor() {
      this.listeners = {};
    }
    addEventListener(evt, cb) { this.listeners[evt] = cb; }
    removeEventListener() {}
    pause() {}
    play() {
      setTimeout(() => this.listeners.ended?.(), 2);
      return Promise.resolve();
    }
  };

  try {
    const synthPayloads = [];
    const queue = new TTSQueue({
      fishSynthesizer: async (payload) => {
        synthPayloads.push(payload);
        return {
          ok: true,
          audioBase64: Buffer.from(`MP3:${payload.speed ?? 1}`).toString('base64'),
          contentType: 'audio/mpeg'
        };
      }
    });

    queue.enqueue({
      text: 'Velocidad distinta',
      voiceProvider: 'fish',
      voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
      speed: 1
    });
    await new Promise((r) => setTimeout(r, 30));

    queue.enqueue({
      text: 'Velocidad distinta',
      voiceProvider: 'fish',
      voiceId: 'fish:9f850ee9ada24b20a6866825eaefd3f8',
      speed: 1.25
    });
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(synthPayloads.length, 2);
    assert.equal(synthPayloads[0].speed, 1);
    assert.equal(synthPayloads[1].speed, 1.25);
  } finally {
    if (origAudio === undefined) {
      delete globalThis.Audio;
    } else {
      globalThis.Audio = origAudio;
    }
  }
});

test('CURATED_FISH_VOICES prioriza Babidi como voz recomendada y mantiene solo voces en español activas', () => {
  const { CURATED_FISH_VOICES } = require('../electron/fish-audio.cjs');
  assert.ok(CURATED_FISH_VOICES.length > 0);
  assert.equal(CURATED_FISH_VOICES[0].referenceId, '47d00a02c75f47b7877fe925ab66b5f2');
  assert.equal(CURATED_FISH_VOICES[0].name, 'Babidi');
  assert.equal(CURATED_FISH_VOICES[0].recommended, true);
  assert.ok(CURATED_FISH_VOICES.every((v) => Array.isArray(v.languages) && v.languages.includes('es')));
});

test('TTS local no contiene API key hardcodeada, migra google:* a local, soporta Unicode y respeta mute(true)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ttsSource = fs.readFileSync(path.join(__dirname, '..', 'shared', 'tts-engine.js'), 'utf8');
  assert.doesNotMatch(ttsSource, /AIzaSy/);
  assert.doesNotMatch(ttsSource, /speech-api\/v2\/synthesize/);

  const legacyTts = normalizeTts({ voiceProvider: 'google', voiceId: 'google:es-MX', voiceLanguage: 'es-MX' });
  assert.equal(legacyTts.voiceProvider, 'local');
  assert.equal(legacyTts.voiceId, 'local');
  assert.equal(legacyTts.voiceLanguage, 'es-MX');

  const { filterTtsText, TTSQueue } = await import('../shared/tts-engine.js');
  assert.equal(filterTtsText('привет привет привет', { antiSpam: true }), 'привет привет');

  const spoken = [];
  const origWindow = globalThis.window;
  const origUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.volume = 1;
      this.rate = 1;
      this.pitch = 1;
      this.voice = null;
    }
  };
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [{ name: 'Microsoft Sabina', voiceURI: 'Sabina', lang: 'es-MX' }],
      speak(utterance) {
        spoken.push(utterance);
        if (typeof utterance.onend === 'function') utterance.onend();
      },
      cancel() {}
    }
  };

  try {
    const queue = new TTSQueue();
    queue.enqueue({
      text: 'Hola México',
      voiceProvider: 'google',
      voiceId: 'google:es-MX'
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].text, 'Hola México');
    assert.equal(spoken[0].lang, 'es-MX');

    queue.mute(true);
    queue.queue.push({ text: 'No debe sonar', voiceId: 'local', voiceLanguage: 'es-ES', volume: 0.8, ducking: false, duckingLevel: 0.25 });
    await queue.skip();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(spoken.length, 1);
  } finally {
    if (origWindow === undefined) delete globalThis.window;
    else globalThis.window = origWindow;
    if (origUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = origUtterance;
  }
});

test('SoundEngine respeta duck(0) y cancela la cola pendiente en stopAll() y preview()', async () => {
  const { SoundEngine } = await import('../shared/audio-engine.js');
  const engine = new SoundEngine();

  const mockNode = {
    gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime(val) { this.value = val; } }
  };
  engine.activeNodes.set(mockNode, 1);

  engine.duck(0);
  assert.equal(engine.isDucked, true);
  assert.equal(engine.duckFactor, 0);
  assert.equal(mockNode.gain.value, 0);
  engine.restore();
  assert.equal(mockNode.gain.value, 1);

  const origWindow = globalThis.window;
  globalThis.window = {
    AudioContext: class {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }
      resume() { return Promise.resolve(); }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {}
        };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {}
        };
      }
    }
  };

  try {
    let resolveFirst;
    const origDrain = engine.play.bind(engine);
    assert.equal(typeof origDrain, 'function');
    engine.isPlayingQueue = true;
    const p1 = engine.play({ kind: 'builtin', key: 'coin' }, 1);
    const p2 = engine.play({ kind: 'builtin', key: 'bell' }, 1);
    assert.equal(engine.queue.length, 2);

    engine.stopAll();
    assert.equal(engine.queue.length, 0);
    assert.equal(engine.isPlayingQueue, false);
    await Promise.all([p1, p2]);

    engine.isPlayingQueue = true;
    const p3 = engine.play({ kind: 'builtin', key: 'coin' }, 1);
    const p4 = engine.play({ kind: 'builtin', key: 'bell' }, 1);
    assert.equal(engine.queue.length, 2);
    await engine.preview({ kind: 'file', url: '' }, 1);
    assert.equal(engine.queue.length, 0);
    assert.equal(engine.isPlayingQueue, false);
    await Promise.all([p3, p4]);
    void resolveFirst;
  } finally {
    if (origWindow === undefined) delete globalThis.window;
    else globalThis.window = origWindow;
  }
});
