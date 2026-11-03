const test = require('node:test');
const assert = require('node:assert/strict');

const { makeTestEvent, normalizeTikTokEvent } = require('../electron/events.cjs');
const { cleanUsername, friendlyError } = require('../electron/tiktok-service.cjs');

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
  assert.equal(event.coins, 6);
  assert.equal(event.repeatCount, 2);
  assert.equal(event.displayName, 'Viewer de prueba');
});
