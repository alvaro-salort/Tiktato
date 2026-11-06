const { findGiftById, findGiftByName, normalizeGiftText } = require('./gifts-catalog.cjs');

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

function normalizeTikTokEvent(type, data, now = Date.now(), options = {}) {
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

    const playEveryStreak = Boolean(options && (options.playEveryStreak || options.allowCombos));
    if (giftType === 1 && !repeatEnd && !playEveryStreak) return null;

    const rawGiftName = String(gift.name || gift.giftName || data.giftName || '').trim();
    const isTest = Boolean(
      data?.test ||
      data?.isTest ||
      /prueba|test/i.test(rawGiftName)
    );

    const giftId = String(data.giftId || gift.id || '');
    let catalogGift = (giftId && giftId !== '0') ? findGiftById(giftId) : null;
    if (!catalogGift && isTest) {
      catalogGift = findGiftByName(rawGiftName);
    }
    const resolvedGiftId = giftId && giftId !== '0' ? giftId : (catalogGift?.id || '');

    const shouldTranslateToEs =
      !isTest &&
      catalogGift &&
      (!rawGiftName || normalizeGiftText(rawGiftName) === normalizeGiftText(catalogGift.nameEn));
    const displayGiftName = shouldTranslateToEs
      ? String(catalogGift.name).replace(/\s*\(\d+\)\s*$/, '')
      : rawGiftName || catalogGift?.name || 'Regalo';

    const repeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || 1));
    const rawCoins = Number(gift.diamondCount ?? data.diamondCount ?? 0);
    const coinsPerGift = Math.max(
      0,
      rawCoins > 0 ? rawCoins : Number(catalogGift?.coins || 0)
    );

    return {
      ...base,
      giftId: resolvedGiftId,
      giftName: displayGiftName,
      giftNameRaw: rawGiftName || displayGiftName,
      giftImageUrl:
        firstUrl(gift.image) ||
        firstUrl(gift.giftImage) ||
        firstUrl(gift.icon) ||
        firstUrl(gift.previewImage) ||
        catalogGift?.imageUrl ||
        '',
      coins: coinsPerGift * repeatCount,
      coinsPerGift,
      repeatCount,
      repeatEnd,
      test: isTest
    };
  }

  if (type === 'chat') {
    const text = String(
      data?.comment ||
      data?.content ||
      data?.text ||
      data?.message ||
      ''
    ).trim();
    return {
      ...base,
      comment: text,
      message: text,
      repeatCount: 1,
      coins: 0
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
  const type = ['gift', 'follow', 'share', 'like', 'chat'].includes(input.type) ? input.type : 'gift';
  if (type === 'chat') {
    const message = String(input.message || input.comment || '¡Hola a todos en el directo!');
    return {
      type: 'chat',
      userId: 'test_user',
      username: 'tiktato_test',
      displayName: String(input.displayName || 'Viewer de prueba'),
      avatarUrl: '',
      comment: message,
      message,
      repeatCount: 1,
      coins: 0,
      test: true,
      timestamp: Date.now()
    };
  }
  const repeatCount = Math.max(1, Number(input.repeatCount || 1));
  const rawInputName = type === 'gift' ? String(input.giftName || '').trim() : '';
  const catalogGift =
    type === 'gift'
      ? (input.giftId ? findGiftById(input.giftId) : null) ||
        (rawInputName ? findGiftByName(rawInputName) : null) ||
        findGiftById('5655')
      : null;
  const giftNameInput =
    type === 'gift'
      ? rawInputName || catalogGift?.name || 'Rosa'
      : '';
  const coinsPerGift = Math.max(
    0,
    Number(input.coins ?? catalogGift?.coins ?? 1)
  );
  return {
    type,
    userId: 'test_user',
    username: 'tiktato_test',
    displayName: String(input.displayName || 'Viewer de prueba'),
    avatarUrl: '',
    giftId: type === 'gift' ? String(input.giftId || catalogGift?.id || '') : '',
    giftName: type === 'gift' ? giftNameInput : '',
    giftImageUrl: type === 'gift' ? String(input.giftImageUrl || catalogGift?.imageUrl || '') : '',
    coins: type === 'gift' ? coinsPerGift * repeatCount : 0,
    coinsPerGift: type === 'gift' ? coinsPerGift : 0,
    repeatCount,
    repeatEnd: true,
    test: true,
    message: String(input.message || ''),
    timestamp: Date.now()
  };
}

module.exports = {
  makeTestEvent,
  normalizeTikTokEvent
};
