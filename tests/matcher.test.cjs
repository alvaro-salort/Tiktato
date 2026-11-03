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
