function firstUrl(image) {
  if (!image) return '';
  if (Array.isArray(image.url)) return image.url.find(Boolean) || '';
  if (typeof image.url === 'string') return image.url;
  return '';
}

function userInfo(user) {
  const profile = user || {};
  return {
    userId: String(profile.userId || profile.uniqueId || ''),
    username: String(profile.uniqueId || ''),
    displayName: String(profile.nickname || profile.uniqueId || 'Alguien'),
    avatarUrl:
      firstUrl(profile.profilePictureMedium) ||
      firstUrl(profile.profilePicture) ||
      firstUrl(profile.profilePictureLarge)
  };
}

function normalizeTikTokEvent(type, data, now = Date.now()) {
  const base = {
    type,
    timestamp: now,
    ...userInfo(data && data.user)
  };

  if (type === 'gift') {
    const details = (data && data.giftDetails) || {};
    const giftType = Number(details.giftType ?? data.giftType ?? 0);
    const repeatEnd = Number(data.repeatEnd ?? 1);
    if (giftType === 1 && repeatEnd === 0) return null;
    const repeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || 1));
    const coinsPerGift = Math.max(0, Number(details.diamondCount ?? data.diamondCount ?? 0));
    return {
      ...base,
      giftId: String(data.giftId || details.id || ''),
      giftName: String(details.giftName || data.giftName || 'Regalo'),
      giftImageUrl: firstUrl(details.giftImage) || firstUrl(details.icon) || firstUrl(details.previewImage),
      coins: coinsPerGift * repeatCount,
      coinsPerGift,
      repeatCount,
      repeatEnd: repeatEnd !== 0
    };
  }

  if (type === 'like') {
    return {
      ...base,
      repeatCount: Math.max(1, Number(data.likeCount || 1)),
      coins: 0,
      message: ''
    };
  }

  return {
    ...base,
    repeatCount: 1,
    coins: 0
  };
}

function makeTestEvent(input = {}) {
  const type = ['gift', 'follow', 'share', 'like'].includes(input.type) ? input.type : 'gift';
  const repeatCount = Math.max(1, Number(input.repeatCount || 1));
  const coinsPerGift = Math.max(0, Number(input.coins ?? 1));
  return {
    type,
    userId: 'test_user',
    username: 'tiktato_test',
    displayName: String(input.displayName || 'Viewer de prueba'),
    avatarUrl: '',
    giftName: type === 'gift' ? String(input.giftName || 'Rosa') : '',
    giftImageUrl: '',
    coins: type === 'gift' ? coinsPerGift * repeatCount : 0,
    coinsPerGift: type === 'gift' ? coinsPerGift : 0,
    repeatCount,
    repeatEnd: true,
    message: String(input.message || ''),
    timestamp: Date.now()
  };
}

module.exports = {
  makeTestEvent,
  normalizeTikTokEvent
};
