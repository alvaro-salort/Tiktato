function firstUrl(image) {
  if (!image) return '';
  if (Array.isArray(image.urlList)) return image.urlList.find(Boolean) || '';
  if (Array.isArray(image.urls)) return image.urls.find(Boolean) || '';
  if (Array.isArray(image.url)) return image.url.find(Boolean) || '';
  if (typeof image.url === 'string') return image.url;
  if (typeof image.uri === 'string' && image.uri.startsWith('http')) return image.uri;
  return '';
}

function userInfo(user) {
  const profile = user || {};
  return {
    userId: String(profile.userId || profile.id || profile.uniqueId || ''),
    username: String(profile.uniqueId || ''),
    displayName: String(profile.nickname || profile.uniqueId || 'Alguien'),
    avatarUrl:
      firstUrl(profile.avatarThumb) ||
      firstUrl(profile.profilePictureMedium) ||
      firstUrl(profile.profilePicture) ||
      firstUrl(profile.avatarMedium) ||
      firstUrl(profile.avatarLarge)
  };
}

function normalizeTikTokEvent(type, data, now = Date.now()) {
  const base = {
    type,
    timestamp: now,
    ...userInfo(data && data.user)
  };

  if (type === 'gift') {
    const gift = (data && (data.gift || data.giftDetails)) || {};
    const giftType = Number(gift.type ?? gift.giftType ?? data.giftType ?? 0);
    const repeatEndRaw = data.repeatEnd ?? 1;
    const repeatEnd =
      typeof repeatEndRaw === 'boolean' ? repeatEndRaw : Number(repeatEndRaw) !== 0;

    if (giftType === 1 && !repeatEnd) return null;

    const repeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || 1));
    const coinsPerGift = Math.max(
      0,
      Number(gift.diamondCount ?? data.diamondCount ?? 0)
    );

    return {
      ...base,
      giftId: String(data.giftId || gift.id || ''),
      giftName: String(gift.name || gift.giftName || data.giftName || 'Regalo'),
      giftImageUrl:
        firstUrl(gift.image) ||
        firstUrl(gift.giftImage) ||
        firstUrl(gift.icon) ||
        firstUrl(gift.previewImage),
      coins: coinsPerGift * repeatCount,
      coinsPerGift,
      repeatCount,
      repeatEnd
    };
  }

  if (type === 'like') {
    return {
      ...base,
      repeatCount: Math.max(1, Number(data.count || data.likeCount || 1)),
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
