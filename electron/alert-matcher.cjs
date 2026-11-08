const {
  findGiftById,
  getEquivalentGiftNames,
  normalizeGiftText,
  stripCoinSuffix
} = require('./gifts-catalog.cjs');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function giftMatches(pattern, giftName, options = {}) {
  const normalizedPattern = normalizeGiftText(pattern);
  if (!normalizedPattern) return true;

  const eventCandidates = new Set([
    ...getEquivalentGiftNames(giftName),
    ...getEquivalentGiftNames(options.giftNameRaw)
  ]);

  if (options.eventGiftId) {
    const catalogGift = findGiftById(options.eventGiftId);
    if (catalogGift) {
      getEquivalentGiftNames(catalogGift).forEach((name) => eventCandidates.add(name));
    }
  }

  if (eventCandidates.size === 0) return false;

  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(
      `^${normalizedPattern.split('*').map(escapeRegExp).join('.*')}$`,
      'i'
    );
    for (const candidate of eventCandidates) {
      if (regex.test(candidate)) return true;
    }
    return false;
  }

  const patternCandidates = new Set([
    normalizedPattern,
    stripCoinSuffix(normalizedPattern),
    ...getEquivalentGiftNames(pattern)
  ]);

  for (const candidate of eventCandidates) {
    if (patternCandidates.has(candidate)) return true;
  }
  return false;
}

function cooldownKey(rule, event) {
  return `${rule.id}:${event.userId || event.username || 'anon'}`;
}

function isRuleEligible(rule, event, cooldowns, now) {
  if (!rule || rule.enabled === false) return false;
  if (rule.eventType !== event.type) return false;

  if (event.type === 'gift') {
    if (Number(event.coins || 0) < Number(rule.minCoins || 0)) return false;
    const ruleGiftId = String(rule.giftId || '').trim();
    const eventGiftId = String(event.giftId || '').trim();

    if (ruleGiftId && eventGiftId) {
      if (ruleGiftId !== eventGiftId) {
        if (!rule.giftName || !giftMatches(rule.giftName, event.giftName, { eventGiftId, giftNameRaw: event.giftNameRaw })) {
          return false;
        }
      }
    } else if (!giftMatches(rule.giftName, event.giftName, { eventGiftId, giftNameRaw: event.giftNameRaw })) {
      return false;
    }
  }

  if (event.test) return true;

  if (event.type === 'gift' && event.repeatEnd === false) {
    return true;
  }

  const cooldownMs = Math.max(0, Number(rule.cooldownSeconds) || 0) * 1000;
  if (cooldownMs <= 0) return true;
  const lastPlayed = cooldowns.get(cooldownKey(rule, event)) || 0;
  return now - lastPlayed >= cooldownMs;
}

function specificity(rule, event) {
  let giftBonus = 0;
  if (rule.eventType === 'gift') {
    const ruleGiftId = String(rule.giftId || '').trim();
    const eventGiftId = String(event?.giftId || '').trim();
    if (ruleGiftId && eventGiftId && ruleGiftId === eventGiftId) {
      giftBonus = 2_000_000;
    } else if (ruleGiftId || rule.giftName) {
      giftBonus = 1_000_000;
    }
  }
  return giftBonus + Number(rule.minCoins || 0) * 100;
}

function selectRule(rules, event, cooldowns = new Map(), now = Date.now()) {
  const eligible = (Array.isArray(rules) ? rules : [])
    .filter((rule) => isRuleEligible(rule, event, cooldowns, now))
    .sort((left, right) => {
      const bySpecificity = specificity(right, event) - specificity(left, event);
      if (bySpecificity !== 0) return bySpecificity;
      return Number(left.order || 0) - Number(right.order || 0);
    });
  return eligible[0] || null;
}

const MAX_COOLDOWN_ENTRIES = 2000;

function markPlayed(rule, event, cooldowns = new Map(), now = Date.now(), maxEntries = MAX_COOLDOWN_ENTRIES) {
  if (event.type === 'gift' && event.repeatEnd === false) {
    return cooldowns;
  }
  const key = cooldownKey(rule, event);
  if (cooldowns.has(key)) {
    cooldowns.delete(key);
  }
  cooldowns.set(key, now);
  const limit = Math.max(1, Number(maxEntries) || MAX_COOLDOWN_ENTRIES);
  while (cooldowns.size > limit) {
    const oldestKey = cooldowns.keys().next().value;
    if (oldestKey === undefined) break;
    cooldowns.delete(oldestKey);
  }
  return cooldowns;
}

function buildAlert(event, rule, { sound, now = Date.now(), test = false, playEveryStreak = false } = {}) {
  // Salvaguarda: un cierre de combo con streakDelta 0 nunca debe sonar
  if (event.type === 'gift' && event.repeatEnd !== false && Number(event.streakDelta) === 0) {
    return null;
  }

  const repeat =
    event.type === 'gift' && playEveryStreak
      ? Math.max(1, Number(event.streakDelta ?? event.repeatCount ?? 1))
      : 1;
  return {
    id: `alert_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: event.type,
    username: event.username || 'alguien',
    displayName: event.displayName || event.username || 'Alguien',
    avatarUrl: event.avatarUrl || '',
    giftId: event.giftId || rule.giftId || '',
    giftName: event.giftName || '',
    giftImageUrl: event.giftImageUrl || rule.giftImageUrl || '',
    coins: Number(event.coins || 0),
    repeatCount: Number(event.repeatCount || 1),
    streakDelta: Number(event.streakDelta ?? event.repeatCount ?? 1),
    message: event.message || '',
    createdAt: new Date(now).toISOString(),
    test: Boolean(test || event.test),
    ruleId: rule.id,
    sound: sound
      ? {
          id: sound.id,
          name: sound.name || rule.soundId,
          kind: sound.kind || (String(rule.soundId).startsWith('builtin:') ? 'builtin' : 'file'),
          key: sound.key || String(rule.soundId).replace('builtin:', ''),
          url: sound.url || '',
          volume: Number(rule.volume ?? 1),
          repeat
        }
      : null
  };
}

module.exports = {
  MAX_COOLDOWN_ENTRIES,
  buildAlert,
  giftMatches,
  markPlayed,
  selectRule
};
