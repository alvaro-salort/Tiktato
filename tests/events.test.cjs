const test = require('node:test');
const assert = require('node:assert/strict');

const { makeTestEvent, normalizeTikTokEvent, createStreakTracker } = require('../electron/events.cjs');
const {
  cleanUsername,
  friendlyError,
  resolveRoomId,
  sessionCookie,
  TikTokService
} = require('../electron/tiktok-service.cjs');
const { buildAlert } = require('../electron/alert-matcher.cjs');

test('ignora los eventos intermedios de una racha de regalos cuando playEveryStreak es false', () => {
  const message = {
    user: { uniqueId: 'ana', nickname: 'Ana', userId: '42' },
    giftId: 1,
    repeatEnd: 0,
    repeatCount: 3,
    giftDetails: {
      giftType: 1,
      giftName: 'Rosa',
      diamondCount: 1,
      giftImage: { url: ['https://example.com/rose.png'] }
    }
  };
  assert.equal(normalizeTikTokEvent('gift', message), null);
});

test('corrige el bug de doble sonido al enviar un único regalo (repeatEnd 0 y luego repeatEnd 1 con repeatCount 1)', () => {
  const streakTracker = createStreakTracker();
  const baseGift = {
    user: { uniqueId: 'ana', nickname: 'Ana', userId: '42' },
    giftId: 5655,
    repeatCount: 1,
    gift: {
      type: 1,
      name: 'Rosa',
      diamondCount: 1
    }
  };

  // Primer paquete enviado por TikTok al tocar el regalo (repeatEnd: 0, repeatCount: 1)
  const firstEvent = normalizeTikTokEvent('gift', { ...baseGift, repeatEnd: 0 }, 1000, {
    playEveryStreak: true,
    streakTracker
  });
  assert.notEqual(firstEvent, null);
  assert.equal(firstEvent.repeatEnd, false);
  assert.equal(firstEvent.repeatCount, 1);
  assert.equal(firstEvent.streakDelta, 1);
  assert.equal(firstEvent.suppressAlert, false);

  // Segundo paquete enviado ~3s después al cerrar el combo sin más toques (repeatEnd: 1, repeatCount: 1)
  const closeEvent = normalizeTikTokEvent('gift', { ...baseGift, repeatEnd: 1 }, 4000, {
    playEveryStreak: true,
    streakTracker
  });
  assert.notEqual(closeEvent, null);
  assert.equal(closeEvent.repeatEnd, true);
  assert.equal(closeEvent.repeatCount, 1);
  assert.equal(closeEvent.streakDelta, 0);
  assert.equal(closeEvent.suppressAlert, true);
});

test('no suena dos veces cuando el paquete final trae un groupId distinto al intermedio', () => {
  const streakTracker = createStreakTracker();
  const base = {
    user: { uniqueId: 'ana', userId: '42' },
    giftId: 5655,
    repeatCount: 1,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  };

  const a = normalizeTikTokEvent(
    'gift',
    { ...base, repeatEnd: 0, groupId: 'abc123' },
    1000,
    { playEveryStreak: true, streakTracker }
  );
  const b = normalizeTikTokEvent(
    'gift',
    { ...base, repeatEnd: 1, groupId: 'xyz789' },
    4000,
    { playEveryStreak: true, streakTracker }
  );

  assert.equal(a.streakDelta, 1);
  assert.equal(a.suppressAlert, false);
  assert.equal(b.streakDelta, 0);
  assert.equal(b.suppressAlert, true);
});

test('combo tras combo en la misma sesión dispara de nuevo en el primer golpe del segundo combo', () => {
  const streakTracker = createStreakTracker();
  const base = {
    user: { uniqueId: 'ana', userId: '42' },
    giftId: 5655,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  };

  // Primer combo de 2 rosas: A1, A2, Cierre
  const c1_a1 = normalizeTikTokEvent('gift', { ...base, repeatCount: 1, repeatEnd: 0, groupId: 'g1' }, 1000, { playEveryStreak: true, streakTracker });
  const c1_a2 = normalizeTikTokEvent('gift', { ...base, repeatCount: 2, repeatEnd: 0, groupId: 'g1' }, 1500, { playEveryStreak: true, streakTracker });
  const c1_end = normalizeTikTokEvent('gift', { ...base, repeatCount: 2, repeatEnd: 1, groupId: 'g1' }, 4000, { playEveryStreak: true, streakTracker });

  assert.equal(c1_a1.streakDelta, 1);
  assert.equal(c1_a1.suppressAlert, false);
  assert.equal(c1_a2.streakDelta, 1);
  assert.equal(c1_a2.suppressAlert, false);
  assert.equal(c1_end.streakDelta, 0);
  assert.equal(c1_end.suppressAlert, true);

  // Segundo combo del mismo usuario y regalo ~10s después: A1, Cierre
  const c2_a1 = normalizeTikTokEvent('gift', { ...base, repeatCount: 1, repeatEnd: 0, groupId: 'g2' }, 15000, { playEveryStreak: true, streakTracker });
  const c2_end = normalizeTikTokEvent('gift', { ...base, repeatCount: 1, repeatEnd: 1, groupId: '' }, 18000, { playEveryStreak: true, streakTracker });

  assert.equal(c2_a1.streakDelta, 1);
  assert.equal(c2_a1.suppressAlert, false);
  assert.equal(c2_end.streakDelta, 0);
  assert.equal(c2_end.suppressAlert, true);
});

test('una racha de 5 rosas calcula streakDelta incremental y reproduce 5 veces en total', () => {
  const streakTracker = createStreakTracker();
  const rule = {
    id: 'rule_rosa',
    eventType: 'gift',
    giftId: '5655',
    giftName: 'Rosa',
    soundId: 'builtin:coin',
    volume: 1
  };
  const sound = { id: 'builtin:coin', name: 'Moneda', kind: 'builtin', key: 'coin' };
  const overlayConfig = { durationMs: 4000 };

  let totalRepeatsPlayed = 0;

  // El usuario manda una racha: llegan paquetes con repeatCount = 1, 3, 5 (repeatEnd: 0) y cierre repeatCount = 5 (repeatEnd: 1)
  const packets = [
    { repeatCount: 1, repeatEnd: 0 },
    { repeatCount: 3, repeatEnd: 0 },
    { repeatCount: 5, repeatEnd: 0 },
    { repeatCount: 5, repeatEnd: 1 }
  ];

  for (const pkt of packets) {
    const ev = normalizeTikTokEvent(
      'gift',
      {
        user: { uniqueId: 'leo', nickname: 'Leo', userId: '77' },
        giftId: 5655,
        repeatCount: pkt.repeatCount,
        repeatEnd: pkt.repeatEnd,
        gift: { type: 1, name: 'Rosa', diamondCount: 1 }
      },
      Date.now(),
      { playEveryStreak: true, streakTracker }
    );
    if (!ev.suppressAlert && ev.streakDelta !== 0) {
      const alert = buildAlert(ev, rule, {
        sound,
        playEveryStreak: true
      });
      totalRepeatsPlayed += alert.sound.repeat;
    }
  }

  assert.equal(totalRepeatsPlayed, 5);
});

test('normaliza el final de una racha y calcula monedas', () => {
  const message = {
    user: { uniqueId: 'ana', nickname: 'Ana', userId: '42' },
    giftId: 1,
    repeatEnd: 1,
    repeatCount: 5,
    giftDetails: {
      giftType: 1,
      giftName: 'Galaxy',
      diamondCount: 100,
      giftImage: { url: ['https://example.com/galaxy.png'] }
    }
  };
  const event = normalizeTikTokEvent('gift', message, 123);
  assert.equal(event.giftName, 'Galaxy');
  assert.equal(event.repeatCount, 5);
  assert.equal(event.coins, 500);
  assert.equal(event.username, 'ana');
  assert.equal(event.giftImageUrl, 'https://example.com/galaxy.png');
  assert.equal(event.timestamp, 123);
});

test('normaliza el formato de piratetok-live-js y enriquece roles de usuario', () => {
  const message = {
    msgId: '9001',
    user: {
      id: '42',
      uniqueId: 'ana',
      nickname: 'Ana',
      isModerator: true,
      isSubscriber: true,
      followRole: 2,
      gifterLevel: 12,
      memberLevel: 4,
      avatarThumb: { urlList: ['https://example.com/avatar.webp'] }
    },
    giftId: 5655,
    repeatEnd: 1,
    repeatCount: 2,
    gift: {
      type: 1,
      name: 'Rosa',
      diamondCount: 5,
      image: { urlList: ['https://example.com/rose.png'] }
    }
  };
  const event = normalizeTikTokEvent('gift', message);
  assert.equal(event.giftName, 'Rosa');
  assert.equal(event.coins, 10);
  assert.equal(event.msgId, '9001');
  assert.equal(event.isModerator, true);
  assert.equal(event.isSubscriber, true);
  assert.equal(event.isSuperFan, true);
  assert.equal(event.isFriend, true);
  assert.equal(event.isFollower, true);
  assert.equal(event.gifterLevel, 12);
  assert.equal(event.memberLevel, 4);
  assert.equal(event.avatarUrl, 'https://example.com/avatar.webp');
  assert.equal(event.giftImageUrl, 'https://example.com/rose.png');
});

test('normaliza eventos imDelete, subNotify y join', () => {
  const delEvent = normalizeTikTokEvent('imDelete', {
    deleteMsgIdsList: ['101', '102'],
    deleteUserIdsList: ['555']
  });
  assert.equal(delEvent.type, 'imDelete');
  assert.deepEqual(delEvent.deleteMsgIds, ['101', '102']);
  assert.deepEqual(delEvent.deleteUserIds, ['555']);

  const subEvent = normalizeTikTokEvent('subNotify', {
    user: { id: '88', uniqueId: 'sub_viewer', nickname: 'Sub Viewer' }
  });
  assert.equal(subEvent.type, 'subscribe');
  assert.equal(subEvent.isSubscriber, true);
  assert.equal(subEvent.username, 'sub_viewer');

  const joinEvent = normalizeTikTokEvent('join', {
    user: { id: '89', uniqueId: 'join_viewer', nickname: 'Join Viewer' }
  });
  assert.equal(joinEvent.type, 'join');
  assert.equal(joinEvent.username, 'join_viewer');
});

test('normaliza likes del formato nuevo', () => {
  const event = normalizeTikTokEvent('like', {
    count: 7,
    user: { id: '42', uniqueId: 'ana', nickname: 'Ana' }
  });
  assert.equal(event.repeatCount, 7);
  assert.equal(event.username, 'ana');
});

test('construye la cookie de sesión para la librería', () => {
  assert.equal(
    sessionCookie('abc', 'useast1a'),
    'sessionid=abc; sid_tt=abc; tt-target-idc=useast1a'
  );
  assert.equal(sessionCookie('', 'useast1a'), '');
});

test('resuelve una sala en directo por API cuando status === 2 y rechaza status === 4 (offline)', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      statusCode: 0,
      data: {
        user: { roomId: '7703967199593630471', status: 2 },
        liveRoom: { status: 2 }
      }
    })
  });
  try {
    assert.equal(
      await resolveRoomId('dopillo5', 'sessionid=abc'),
      '7703967199593630471'
    );
  } finally {
    global.fetch = originalFetch;
  }

  // Cuando status === 4 (stream finalizado/offline), debe lanzar HostNotOnlineError
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      statusCode: 0,
      data: {
        user: { roomId: '7703967199593630471', status: 4 },
        liveRoom: { status: 4 }
      }
    })
  });
  try {
    await assert.rejects(() => resolveRoomId('dopillo5', 'sessionid=abc'), /not currently live/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('TikTokService filtra backlog de chat a los últimos 5 mensajes y no repite msgId en reconexión', () => {
  const received = [];
  const service = new TikTokService();
  service.on('event', (ev) => received.push(ev));

  service.beginBacklogWindow();

  // Llegan 8 mensajes históricos durante la ventana de backlog
  for (let i = 1; i <= 8; i++) {
    service.ingestEvent('chat', {
      msgId: `msg_${i}`,
      createTime: 5_000 + i,
      user: { id: `u_${i}`, uniqueId: `user_${i}`, nickname: `User ${i}` },
      content: `Mensaje histórico ${i}`
    });
  }

  service.flushBacklog();
  assert.equal(received.length, 5);
  assert.deepEqual(
    received.map((e) => e.msgId),
    ['msg_4', 'msg_5', 'msg_6', 'msg_7', 'msg_8']
  );

  // Si en una reconexión vuelve a llegar msg_8, se ignora por deduplicación
  service.ingestEvent('chat', {
    msgId: 'msg_8',
    createTime: 20_000,
    user: { id: 'u_8', uniqueId: 'user_8', nickname: 'User 8' },
    content: 'Mensaje histórico 8'
  });
  assert.equal(received.length, 5);
});

test('TikTokService maneja EventType.control para pausa, reanudación y STREAM_SUSPENDED (action 4)', () => {
  const statuses = [];
  const service = new TikTokService();
  service.on('status', (st) => statuses.push(st));
  service.status.username = 'streamer_test';
  service.status.roomId = '12345';

  service.handleControlEvent({ action: 1 });
  assert.equal(statuses[statuses.length - 1].state, 'connected');
  assert.equal(statuses[statuses.length - 1].paused, true);
  assert.match(statuses[statuses.length - 1].message, /pausa/i);

  service.handleControlEvent({ action: 2 });
  assert.equal(statuses[statuses.length - 1].state, 'connected');
  assert.equal(statuses[statuses.length - 1].paused, false);
  assert.match(statuses[statuses.length - 1].message, /Conectado a @streamer_test/);

  service.handleControlEvent({ action: 4 });
  assert.equal(statuses[statuses.length - 1].state, 'error');
  assert.equal(statuses[statuses.length - 1].suspended, true);
  assert.match(statuses[statuses.length - 1].message, /STREAM_SUSPENDED/);
});

test('distingue usuario inexistente al resolver la sala', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ statusCode: 19881007, data: null })
  });
  try {
    await assert.rejects(() => resolveRoomId('nadie', ''), /does not exist/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('convierte URLs y arrobas a un nombre limpio', () => {
  assert.equal(cleanUsername('@alvaro'), 'alvaro');
  assert.equal(cleanUsername('https://www.tiktok.com/@alvaro/live'), 'alvaro');
  assert.equal(cleanUsername('  @Alvaro.Salort  '), 'Alvaro.Salort');
  assert.equal(cleanUsername(''), '');
});

test('traduce errores comunes de TikTok', () => {
  assert.match(friendlyError({ code: 'UserOfflineError' }), /no está en directo/);
  assert.match(friendlyError(new Error('429 rate limit')), /limitó la conexión/);
  assert.match(friendlyError(new Error('ECONNRESET')), /conexión a Internet/);
});

test('crea eventos de prueba reproducibles', () => {
  const event = makeTestEvent({ type: 'gift', giftName: 'Rosa', coins: 3, repeatCount: 2 });
  assert.equal(event.type, 'gift');
  assert.equal(event.giftId, '5655');
  assert.equal(event.coins, 6);
  assert.equal(event.repeatCount, 2);
  assert.equal(event.displayName, 'Viewer de prueba');
  assert.equal(event.test, true);
});

test('traduce nombres de regalos de inglés a español usando el catálogo cuando coincide el giftId', () => {
  const roseEvent = normalizeTikTokEvent('gift', {
    user: { id: '10', uniqueId: 'viewer1', nickname: 'Viewer 1' },
    giftId: 5655,
    repeatEnd: 1,
    repeatCount: 1,
    gift: {
      type: 1,
      name: 'Rose',
      diamondCount: 1
    }
  });
  assert.equal(roseEvent.giftId, '5655');
  assert.equal(roseEvent.giftName, 'Rosa');
  assert.equal(roseEvent.giftNameRaw, 'Rose');
  assert.equal(Boolean(roseEvent.giftImageUrl), true);

  const awesomeEvent = normalizeTikTokEvent('gift', {
    user: { id: '11', uniqueId: 'viewer2', nickname: 'Viewer 2' },
    giftId: 15232,
    repeatEnd: 1,
    repeatCount: 1,
    gift: {
      type: 1,
      name: "You're awesome",
      diamondCount: 1
    }
  });
  assert.equal(awesomeEvent.giftId, '15232');
  assert.equal(awesomeEvent.giftName, 'Eres increíble');
  assert.equal(awesomeEvent.giftNameRaw, "You're awesome");
});

test('makeTestEvent resuelve el nombre desde el giftId cuando se omite giftName', () => {
  const ggEvent = makeTestEvent({ type: 'gift', giftId: '6064' });
  assert.equal(ggEvent.giftName, 'GG');
  assert.equal(ggEvent.giftId, '6064');
  assert.equal(ggEvent.coins, 1);
});

test('normalizeTikTokEvent resuelve regalo de prueba sin giftId como test y asigna monedas del catalogo', () => {
  const testGiftEvent = normalizeTikTokEvent('gift', {
    user: { id: '99', uniqueId: 'tester', nickname: 'Tester' },
    giftId: 0,
    repeatEnd: 1,
    repeatCount: 1,
    gift: {
      type: 1,
      name: 'Rosa de prueba',
      diamondCount: 0
    }
  });
  assert.equal(testGiftEvent.giftId, '5655');
  assert.equal(testGiftEvent.giftName, 'Rosa de prueba');
  assert.equal(testGiftEvent.coins, 1);
  assert.equal(testGiftEvent.test, true);
});

