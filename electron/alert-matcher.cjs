function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function giftMatches(pattern, giftName) {
  const normalizedPattern = String(pattern || '').trim().toLowerCase();
  if (!normalizedPattern) return true;
  const normalizedGift = String(giftName || '').trim().toLowerCase();
  if (!normalizedGift) return false;
  const regex = new RegExp(
    `^${normalizedPattern.split('*').map(escapeRegExp).join('.*')}$`,
    'i'
  );
  return regex.test(normalizedGift);
}

function cooldownKey(rule, event) {
  return `${rule.id}:${event.userId || event.username || 'anon'}`;
}

function isRuleEligible(rule, event, cooldowns, now) {
  if (!rule || rule.enabled === false) return false;
  if (rule.eventType !== event.type) return false;

  if (event.type === 'gift') {
    if (Number(event.coins || 0) < Number(rule.minCoins || 0)) return false;
    if (!giftMatches(rule.giftName, event.giftName)) return false;
  }

  const cooldownMs = Math.max(0, Number(rule.cooldownSeconds) || 0) * 1000;
  if (cooldownMs <= 0) return true;
  const lastPlayed = cooldowns.get(cooldownKey(rule, event)) || 0;
  return now - lastPlayed >= cooldownMs;
}

function specificity(rule) {
  const giftBonus = rule.eventType === 'gift' && rule.giftName ? 1_000_000 : 0;
  return giftBonus + Number(rule.minCoins || 0) * 100;
}

function selectRule(rules, event, cooldowns = new Map(), now = Date.now()) {
  const eligible = (Array.isArray(rules) ? rules : [])
    .filter((rule) => isRuleEligible(rule, event, cooldowns, now))
    .sort((left, right) => {
      const bySpecificity = specificity(right) - specificity(left);
      if (bySpecificity !== 0) return bySpecificity;
      return Number(left.order || 0) - Number(right.order || 0);
    });
  return eligible[0] || null;
}

function markPlayed(rule, event, cooldowns = new Map(), now = Date.now()) {
  cooldowns.set(cooldownKey(rule, event), now);
  return cooldowns;
}

function buildAlert(event, rule, { sound, now = Date.now(), test = false } = {}) {
  return {
    id: `alert_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: event.type,
    username: event.username || 'alguien',
    displayName: event.displayName || event.username || 'Alguien',
    avatarUrl: event.avatarUrl || '',
    giftName: event.giftName || '',
    giftImageUrl: event.giftImageUrl || '',
    coins: Number(event.coins || 0),
    repeatCount: Number(event.repeatCount || 1),
    message: event.message || '',
    createdAt: new Date(now).toISOString(),
    test,
    ruleId: rule.id,
    sound: sound
      ? {
          id: sound.id,
          name: sound.name || rule.soundId,
          kind: sound.kind || (String(rule.soundId).startsWith('builtin:') ? 'builtin' : 'file'),
          key: sound.key || String(rule.soundId).replace('builtin:', ''),
          url: sound.url || '',
          volume: Number(rule.volume ?? 1)
        }
      : null
  };
}

module.exports = {
  buildAlert,
  giftMatches,
  markPlayed,
  selectRule
};
