const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAlert, giftMatches, markPlayed, selectRule } = require('../electron/alert-matcher.cjs');

const rules = [
  {
    id: 'rule_any',
    eventType: 'gift',
    giftName: '',
    minCoins: 1,
    soundId: 'builtin:coin',
    volume: 1,
    cooldownSeconds: 2,
    enabled: true,
    order: 0
  },
  {
    id: 'rule_galaxy',
    eventType: 'gift',
    giftName: 'Galaxy',
    minCoins: 100,
    soundId: 'builtin:horn',
    volume: 1,
    cooldownSeconds: 0,
    enabled: true,
    order: 1
  },
  {
    id: 'rule_follow',
    eventType: 'follow',
    giftName: '',
    minCoins: 0,
    soundId: 'builtin:chime',
    volume: 0.8,
    cooldownSeconds: 0,
    enabled: true,
    order: 2
  }
];

const gift = {
  type: 'gift',
  userId: 'u1',
  username: 'viewer',
  giftName: 'Rosa',
  coins: 1,
  repeatCount: 1
};

test('los comodines de regalo funcionan sin distinguir mayúsculas', () => {
  assert.equal(giftMatches('', 'Rosa'), true);
  assert.equal(giftMatches('rosa', 'Rosa'), true);
  assert.equal(giftMatches('*osa*', 'Rosa'), true);
  assert.equal(giftMatches('Galaxy', 'Rosa'), false);
  assert.equal(giftMatches('Rosa', ''), false);
});

test('elige la regla más específica y respeta el mínimo de monedas', () => {
  const galaxy = { ...gift, giftName: 'Galaxy', coins: 100 };
  assert.equal(selectRule(rules, galaxy).id, 'rule_galaxy');
  assert.equal(selectRule(rules, { ...galaxy, coins: 99 }).id, 'rule_any');
});

test('el cooldown es por regla y usuario', () => {
  const now = 1_000_000;
  const cooldowns = new Map();
  const rule = selectRule(rules, gift, cooldowns, now);
  assert.equal(rule.id, 'rule_any');
  markPlayed(rule, gift, cooldowns, now);
  assert.equal(selectRule(rules, gift, cooldowns, now + 500), null);
  assert.equal(selectRule(rules, gift, cooldowns, now + 2100).id, 'rule_any');
  assert.equal(selectRule(rules, { ...gift, userId: 'u2' }, cooldowns, now + 500).id, 'rule_any');
});

test('construye una alerta con sonido y datos normalizados', () => {
  const rule = rules[2];
  const alert = buildAlert({ ...gift, type: 'follow', giftName: '' }, rule, {
    sound: { id: 'builtin:chime', name: 'Campanilla', kind: 'builtin', key: 'chime' },
    now: 1_234
  });
  assert.equal(alert.type, 'follow');
  assert.equal(alert.sound.kind, 'builtin');
  assert.equal(alert.sound.volume, 0.8);
  assert.equal(alert.username, 'viewer');
  assert.equal(alert.id.startsWith('alert_'), true);
});

test('las reglas desactivadas no se usan', () => {
  const disabled = [{ ...rules[0], enabled: false }];
  assert.equal(selectRule(disabled, gift, new Map(), Date.now()), null);
});

test('coincide regalos en español e inglés aunque TikTok envíe el nombre en inglés o sin tilde', () => {
  assert.equal(giftMatches('Rosa', 'Rose'), true);
  assert.equal(giftMatches('Rose', 'Rosa'), true);
  assert.equal(giftMatches('Eres increible', "You're awesome"), true);
  assert.equal(giftMatches('Eres increíble', "You're awesome"), true);
  assert.equal(giftMatches('eres increible', 'Eres increíble'), true);
  assert.equal(giftMatches('GG', 'GG'), true);
  assert.equal(giftMatches('Maracas', 'Maracas'), true);
  assert.equal(giftMatches('Corazon coreano', 'Finger Heart'), true);
  assert.equal(giftMatches('Galaxia', 'Galaxy'), true);
  assert.equal(giftMatches('Quiereme', 'Heart Me'), true);
});

test('una regla personalizada para Rosa nunca cae en el sonido por defecto Moneda cuando llega Rose en un LIVE', () => {
  const liveRules = [
    {
      id: 'rule_gift_default',
      eventType: 'gift',
      giftName: '',
      minCoins: 1,
      soundId: 'builtin:coin',
      volume: 1,
      cooldownSeconds: 2,
      enabled: true,
      order: 0
    },
    {
      id: 'rule_rosa_custom',
      eventType: 'gift',
      giftId: '5655',
      giftName: 'Rosa',
      minCoins: 0,
      soundId: 'sound_custom_mp3',
      volume: 1,
      cooldownSeconds: 0,
      enabled: true,
      order: 1
    },
    {
      id: 'rule_awesome_custom',
      eventType: 'gift',
      giftName: 'eres increible',
      minCoins: 0,
      soundId: 'sound_awesome_mp3',
      volume: 1,
      cooldownSeconds: 0,
      enabled: true,
      order: 2
    }
  ];

  const liveRoseEvent = {
    type: 'gift',
    userId: 'u99',
    username: 'fan1',
    giftId: '5655',
    giftName: 'Rose',
    giftNameRaw: 'Rose',
    coins: 1,
    repeatCount: 1
  };
  const selectedRose = selectRule(liveRules, liveRoseEvent);
  assert.equal(selectedRose.id, 'rule_rosa_custom');
  assert.equal(selectedRose.soundId, 'sound_custom_mp3');

  const liveAwesomeEvent = {
    type: 'gift',
    userId: 'u99',
    username: 'fan1',
    giftId: '15232',
    giftName: "You're awesome",
    giftNameRaw: "You're awesome",
    coins: 1,
    repeatCount: 1
  };
  const selectedAwesome = selectRule(liveRules, liveAwesomeEvent);
  assert.equal(selectedAwesome.id, 'rule_awesome_custom');
  assert.equal(selectedAwesome.soundId, 'sound_awesome_mp3');

  const otherGiftEvent = {
    type: 'gift',
    userId: 'u99',
    username: 'fan1',
    giftId: '7032',
    giftName: 'Maracas',
    coins: 1,
    repeatCount: 1
  };
  const selectedOther = selectRule(liveRules, otherGiftEvent);
  assert.equal(selectedOther.id, 'rule_gift_default');
});

test('distingue regalos distintos por giftId cuando ambos están configurados', () => {
  const heartRules = [
    {
      id: 'rule_heart_1',
      eventType: 'gift',
      giftId: '6247',
      giftName: 'Corazón',
      minCoins: 0,
      soundId: 'sound_heart_1',
      enabled: true,
      order: 0
    },
    {
      id: 'rule_heart_10',
      eventType: 'gift',
      giftId: '5576',
      giftName: 'Corazón (10)',
      minCoins: 0,
      soundId: 'sound_heart_10',
      enabled: true,
      order: 1
    }
  ];

  assert.equal(
    selectRule(heartRules, { type: 'gift', giftId: '6247', giftName: 'Heart', coins: 1 }).id,
    'rule_heart_1'
  );
  assert.equal(
    selectRule(heartRules, { type: 'gift', giftId: '5576', giftName: 'Heart', coins: 10 }).id,
    'rule_heart_10'
  );
});

test('coincide regalos de prueba con sufijos "de prueba" o "test" con la regla personalizada de Rosa', () => {
  const customRosaRules = [
    {
      id: 'rule_default_coin',
      eventType: 'gift',
      giftName: '',
      minCoins: 1,
      soundId: 'builtin:coin',
      volume: 1,
      cooldownSeconds: 0,
      enabled: true,
      order: 0
    },
    {
      id: 'rule_custom_rosa',
      eventType: 'gift',
      giftName: 'Rosa',
      minCoins: 1,
      soundId: 'sound_custom_mp3',
      volume: 1,
      cooldownSeconds: 30,
      enabled: true,
      order: 1
    }
  ];

  const testEvent1 = {
    type: 'gift',
    userId: 'test_user',
    username: 'tiktato_test',
    giftName: 'Rosa de prueba',
    coins: 10,
    test: true
  };
  const matched1 = selectRule(customRosaRules, testEvent1);
  assert.equal(matched1?.id, 'rule_custom_rosa');
  assert.equal(matched1?.soundId, 'sound_custom_mp3');

  const testEvent2 = {
    type: 'gift',
    userId: 'test_user',
    username: 'tiktato_test',
    giftName: 'Test Rose',
    coins: 10,
    test: true
  };
  const matched2 = selectRule(customRosaRules, testEvent2);
  assert.equal(matched2?.id, 'rule_custom_rosa');

  const cooldowns = new Map();
  const now = 1_000_000;
  markPlayed(matched1, testEvent1, cooldowns, now);
  const matchedAfterCooldown = selectRule(customRosaRules, testEvent1, cooldowns, now + 100);
  assert.equal(matchedAfterCooldown?.id, 'rule_custom_rosa');
});

test('markPlayed acota el mapa de cooldowns para evitar fugas de memoria en directos largos', () => {
  const { MAX_COOLDOWN_ENTRIES } = require('../electron/alert-matcher.cjs');
  assert.equal(MAX_COOLDOWN_ENTRIES, 2000);

  const cooldowns = new Map();
  const rule = { id: 'rule_any', eventType: 'gift', cooldownSeconds: 10 };
  for (let i = 1; i <= 150; i += 1) {
    markPlayed(rule, { type: 'gift', userId: `user_${i}`, repeatEnd: true }, cooldowns, 1000 + i, 100);
  }
  assert.equal(cooldowns.size, 100);
  assert.equal(cooldowns.has('rule_any:user_1'), false);
  assert.equal(cooldowns.has('rule_any:user_50'), false);
  assert.equal(cooldowns.has('rule_any:user_51'), true);
  assert.equal(cooldowns.has('rule_any:user_150'), true);
});


