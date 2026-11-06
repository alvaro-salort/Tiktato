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

test('crea y normaliza los parámetros de Frasco Pro', () => {
  const jarDefault = createDefaultConfig().jar;
  assert.equal(jarDefault.giftType, 'allGifts');
  assert.equal(jarDefault.minimumValue, 1);
  assert.equal(jarDefault.scale, 1.0);
  assert.equal(jarDefault.giftScale, 1.0);
  assert.equal(jarDefault.xOffset, 0);
  assert.equal(jarDefault.yOffset, 0);
  assert.deepEqual(jarDefault.selectedGifts, []);
  assert.equal(jarDefault.numberOfRanks, 'top5');
  assert.equal(jarDefault.displayRankBadges, true);
  assert.equal(jarDefault.displayLeaderboard, true);
  assert.equal(jarDefault.showTotalCoins, true);
  assert.equal(jarDefault.displayAlert, true);
  assert.equal(jarDefault.leaderboardDuration, 5);
  assert.equal(jarDefault.alertDuration, 5);
  assert.deepEqual(jarDefault.topDonors, []);

  const normalized = normalizeJar({
    giftType: 'invalidType',
    minimumValue: -50,
    scale: 99,
    giftScale: 0.01,
    xOffset: -50,
    yOffset: 120,
    selectedGifts: ['5655', '  Rosa  ', ''],
    numberOfRanks: 'top99',
    displayRankBadges: false,
    displayLeaderboard: false,
    showTotalCoins: false,
    displayAlert: false,
    leaderboardDuration: 999,
    alertDuration: -10,
    topDonors: [
      { username: 'alvaro', displayName: 'Alvaro ⭐', totalCoins: 250 },
      { username: 'bad_donor', totalCoins: -10 }
    ]
  });

  assert.equal(normalized.giftType, 'allGifts');
  assert.equal(normalized.minimumValue, 1);
  assert.equal(normalized.scale, 3.0);
  assert.equal(normalized.giftScale, 0.1);
  assert.equal(normalized.xOffset, -50);
  assert.equal(normalized.yOffset, 120);
  assert.deepEqual(normalized.selectedGifts, ['5655', 'Rosa']);
  assert.equal(normalized.numberOfRanks, 'top5');
  assert.equal(normalized.displayRankBadges, false);
  assert.equal(normalized.displayLeaderboard, false);
  assert.equal(normalized.showTotalCoins, false);
  assert.equal(normalized.displayAlert, false);
  assert.equal(normalized.leaderboardDuration, 60);
  assert.equal(normalized.alertDuration, 1);
  assert.equal(normalized.topDonors.length, 2);
  assert.equal(normalized.topDonors[0].username, 'alvaro');
  assert.equal(normalized.topDonors[0].totalCoins, 250);
  assert.equal(normalized.topDonors[1].totalCoins, 0);
});

test('calcula la fórmula matemática de radio conforme a la sección 6.4 de CLONE_FRASCO.md', () => {
  const { computeGiftRadius, computeBaseRadius } = require('../electron/config.cjs');

  // Regalo de 1 moneda (Rosa): R = 11 px
  const r1 = computeBaseRadius(1);
  assert.equal(Math.round(r1), 11);

  // Regalo de 100 monedas: R ≈ 22.1 px
  const r100 = computeBaseRadius(100);
  assert.ok(r100 > 21 && r100 < 23);

  // Regalo de 1.000 monedas: R ≈ 52.4 px
  const r1000 = computeBaseRadius(1000);
  assert.ok(r1000 > 51 && r1000 < 54);

  // Regalo de 100.000 monedas (Universe): R = 100 px
  const r100k = computeBaseRadius(100000);
  assert.equal(Math.round(r100k), 100);

  // Con factores de escala multiplicativos
  const scaled = computeGiftRadius(1, 1.5, 2.0);
  assert.equal(Math.round(scaled), Math.round(11 * 1.5 * 2.0));
});

test('filtra regalos del frasco según giftType, minimumValue y selectedGifts', () => {
  const { shouldPassJarFilter } = require('../electron/config.cjs');

  // allGifts
  const cfgAll = { giftType: 'allGifts' };
  assert.equal(shouldPassJarFilter(cfgAll, { type: 'gift', coins: 1, coinsPerGift: 1 }), true);
  assert.equal(shouldPassJarFilter(cfgAll, { type: 'follow' }), false);

  // minimumValue
  const cfgMin = { giftType: 'minimumValue', minimumValue: 50 };
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 1, coinsPerGift: 1 }), false);
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 50, coinsPerGift: 50 }), true);
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 100, coinsPerGift: 10, repeatCount: 10 }), true);

  // selectedGifts
  const cfgSel = { giftType: 'selectedGifts', selectedGifts: ['5655', 'Galaxy'] };
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '5655', giftName: 'Rosa', coins: 1 }), true);
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '9999', giftName: 'galaxy', coins: 1000 }), true);
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '1234', giftName: 'Panda', coins: 5 }), false);
});

test('acumula y ordena donantes destacados en el Leaderboard', () => {
  const { updateTopDonorsList } = require('../electron/config.cjs');

  let list = [];
  list = updateTopDonorsList(list, { username: 'ana', displayName: 'Ana', coins: 50 });
  list = updateTopDonorsList(list, { username: 'carlos', displayName: 'Carlos', coins: 200 });
  list = updateTopDonorsList(list, { username: 'ana', displayName: 'Ana ⭐', coins: 300 });

  assert.equal(list.length, 2);
  assert.equal(list[0].username, 'ana');
  assert.equal(list[0].totalCoins, 350);
  assert.equal(list[0].displayName, 'Ana ⭐');
  assert.equal(list[1].username, 'carlos');
  assert.equal(list[1].totalCoins, 200);
});
