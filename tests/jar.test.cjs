const test = require('node:test');
const assert = require('node:assert/strict');

const { createDefaultConfig, normalizeJar, publicJar } = require('../electron/config.cjs');

test('crea un frasco con meta y estado inicial', () => {
  const jar = createDefaultConfig().jar;
  assert.equal(jar.goalCoins, 1000);
  assert.equal(jar.currentCoins, 0);
  assert.equal(jar.currentGifts, 0);
  assert.deepEqual(jar.recentGifts, []);
});

test('normaliza meta, monedas y regalos recientes', () => {
  const jar = normalizeJar({
    title: '  Mi frasco  ',
    goalCoins: -10,
    currentCoins: 500,
    currentGifts: 3,
    accent: 'rosa',
    showRecentGifts: false,
    recentGifts: [
      { name: 'Rosa', coins: 1, username: 'ana', imageUrl: 'https://example.com/rose.png' },
      { name: 'Galaxy', coins: 100, username: 'leo' }
    ]
  });
  assert.equal(jar.title, 'Mi frasco');
  assert.equal(jar.goalCoins, 1);
  assert.equal(jar.currentCoins, 500);
  assert.equal(jar.currentGifts, 3);
  assert.equal(jar.accent, '#e83e5f');
  assert.equal(jar.showRecentGifts, false);
  assert.equal(jar.recentGifts.length, 2);
  assert.equal(jar.recentGifts[0].name, 'Rosa');
});

test('calcula porcentaje y meta completada', () => {
  const half = publicJar({
    jar: {
      title: 'Frasco',
      goalCoins: 200,
      currentCoins: 100,
      currentGifts: 4,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: []
    }
  });
  assert.equal(half.percent, 50);
  assert.equal(half.completed, false);

  const complete = publicJar({
    jar: {
      title: 'Frasco',
      goalCoins: 100,
      currentCoins: 150,
      currentGifts: 5,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: []
    }
  });
  assert.equal(complete.percent, 100);
  assert.equal(complete.completed, true);
});
