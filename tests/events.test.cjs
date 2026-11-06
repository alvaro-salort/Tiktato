const test = require('node:test');
const assert = require('node:assert/strict');

const { makeTestEvent, normalizeTikTokEvent } = require('../electron/events.cjs');
const {
  cleanUsername,
  friendlyError,
  resolveRoomId,
  sessionCookie
} = require('../electron/tiktok-service.cjs');

test('ignora los eventos intermedios de una racha de regalos', () => {
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

test('normaliza el formato de piratetok-live-js', () => {
  const message = {
    user: {
      id: '42',
      uniqueId: 'ana',
      nickname: 'Ana',
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
  assert.equal(event.avatarUrl, 'https://example.com/avatar.webp');
  assert.equal(event.giftImageUrl, 'https://example.com/rose.png');
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

test('resuelve una sala de prueba por API con estado 4', async () => {
  const originalFetch = global.fetch;
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
    assert.equal(
      await resolveRoomId('dopillo5', 'sessionid=abc'),
      '7703967199593630471'
    );
  } finally {
    global.fetch = originalFetch;
  }
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

