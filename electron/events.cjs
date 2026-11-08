const { findGiftById, findGiftByName, normalizeGiftText } = require('./gifts-catalog.cjs');

const STREAK_STALE_MS = 60_000;

function createStreakTracker() {
  const streaks = new Map();

  function evictStale(now) {
    for (const [key, entry] of streaks.entries()) {
      if (now - entry.lastSeen >= STREAK_STALE_MS) {
        streaks.delete(key);
      }
    }
  }

  return {
    streaks,
    process({ userId = '', username = '', giftId = '', giftName = '', groupId = '', giftType = 0, repeatCount = 1, repeatEnd = true }, now = Date.now()) {
      const count = Math.max(1, Number(repeatCount) || 1);
      const isCombo = Number(giftType) === 1;
      const isFinal = Boolean(repeatEnd);

      if (!isCombo) {
        return {
          streakKey: '',
          isActive: false,
          isFinal: true,
          streakDelta: count,
          totalCount: count,
          suppressAlert: false
        };
      }

      evictStale(now);
      const actor = String(userId || username || 'anon');
      const giftKey = String(giftId || giftName || 'gift');
      const key = `${actor}:${giftKey}`;

      const prev = streaks.get(key);
      const prevCount = prev ? prev.lastRepeatCount : 0;
      const delta = Math.max(0, count - prevCount);

      streaks.set(key, { lastRepeatCount: isFinal ? 0 : count, lastSeen: now });

      const suppressAlert = isFinal && prev !== undefined && delta === 0;
      return {
        streakKey: key,
        isActive: !isFinal,
        isFinal,
        streakDelta: delta,
        totalCount: count,
        suppressAlert
      };
    },
    reset() {
      streaks.clear();
    }
  };
}

function firstUrl(image) {
  if (!image) return '';
  if (Array.isArray(image.urlList)) return image.urlList.find(Boolean) || '';
  if (Array.isArray(image.urls)) return image.urls.find(Boolean) || '';
  if (Array.isArray(image.url)) return image.url.find(Boolean) || '';
  if (typeof image.url === 'string') return image.url;
  if (typeof image.uri === 'string' && image.uri.startsWith('http')) return image.uri;
  return '';
}

function parseBadgeNumber(badge) {
  if (!badge || typeof badge !== 'object') return 0;
  const fromLog = Number(badge.logExtra?.level || 0);
  if (Number.isFinite(fromLog) && fromLog > 0) return fromLog;
  const strVal = String(
    badge.combineBadge?.strValue ||
    badge.stringBadge?.strValue ||
    badge.textBadge?.defaultPattern ||
    ''
  );
  const match = strVal.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function userInfo(user, data = {}) {
  const profile = user || {};
  const identity = (data && data.userIdentity) || profile.userIdentity || {};
  const msgFilter = (data && data.msgFilter) || {};
  const attr = profile.userAttr || {};
  const badges = Array.isArray(profile.badgeList) ? profile.badgeList : [];

  let badgeAdmin = false;
  let badgeSubscriber = false;
  let badgeTopRank = 0;
  let badgeGifterLevel = 0;
  let badgeMemberLevel = 0;

  for (const badge of badges) {
    if (!badge || typeof badge !== 'object') continue;
    const scene = Number(badge.badgeScene || 0);
    if (scene === 1) badgeAdmin = true;
    else if (scene === 4) badgeSubscriber = true;
    else if (scene === 6) badgeTopRank = Math.max(badgeTopRank, parseBadgeNumber(badge));
    else if (scene === 8) badgeGifterLevel = Math.max(badgeGifterLevel, parseBadgeNumber(badge));
    else if (scene === 10) badgeMemberLevel = Math.max(badgeMemberLevel, parseBadgeNumber(badge));
  }

  const followStatus = Number(
    profile.followInfo?.followStatus ?? profile.followStatus ?? profile.followRole ?? 0
  );
  const gifterLevel = Math.max(
    0,
    Number(
      profile.gifterLevel ??
      profile.payGrade?.level ??
      profile.userHonor?.level ??
      badgeGifterLevel ??
      0
    )
  );
  const memberLevel = Math.max(
    0,
    Number(
      profile.memberLevel ??
      profile.fansClub?.data?.level ??
      profile.fansClubInfo?.fansLevel ??
      badgeMemberLevel ??
      0
    )
  );
  const isModerator = Boolean(
    profile.isModerator ||
    identity.isModeratorOfAnchor ||
    identity.isAnchor ||
    attr.isAdmin ||
    attr.isSuperAdmin ||
     data?.isSetToAdmin ||
    badgeAdmin
  );
  const isSubscriber = Boolean(
    profile.isSubscriber ||
    identity.isSubscriberOfAnchor ||
    msgFilter.isSubscribedToAnchor ||
    profile.isSubscribe ||
    profile.subscribeInfo?.isSubscribe ||
    badgeSubscriber
  );
  const isSuperFan = Boolean(
    profile.isSuperFan ||
    isSubscriber ||
    memberLevel > 0 ||
    Number(profile.fansClub?.data?.userFansClubStatus || 0) === 1
  );
  const isFriend = Boolean(
    profile.isFriend ||
    identity.isMutualFollowingWithAnchor ||
    followStatus === 2
  );
  const isFollower = Boolean(
    profile.isFollower ||
    isFriend ||
    identity.isFollowerOfAnchor ||
    followStatus >= 1
  );
  const isGifter = Boolean(
    profile.isGifter ||
    identity.isGiftGiverOfAnchor ||
    msgFilter.isGifter ||
    gifterLevel > 0
  );
  const topViewerRank = Math.max(
    0,
    Number(profile.topViewerRank ?? profile.topVipNo ?? data?.topUserNo ?? badgeTopRank ?? 0)
  );

  return {
    userId: String(profile.userId || profile.idStr || profile.id || profile.uniqueId || ''),
    username: String(profile.uniqueId || ''),
    displayName: String(profile.nickname || profile.uniqueId || 'Alguien'),
    avatarUrl:
      firstUrl(profile.avatarThumb) ||
      firstUrl(profile.profilePictureMedium) ||
      firstUrl(profile.profilePicture) ||
      firstUrl(profile.avatarMedium) ||
      firstUrl(profile.avatarLarge),
    isModerator,
    isSubscriber,
    isSuperFan,
    isFollower,
    isFriend,
    isGifter,
    gifterLevel,
    memberLevel,
    topViewerRank
  };
}

function normalizeTikTokEvent(type, data, now = Date.now(), options = {}) {
  if (type === 'imDelete') {
    const rawMsgIds = data?.deleteMsgIdsList || data?.deleteMsgIds || [];
    const rawUserIds = data?.deleteUserIdsList || data?.deleteUserIds || [];
    return {
      type: 'imDelete',
      timestamp: now,
      deleteMsgIds: Array.isArray(rawMsgIds) ? rawMsgIds.map((id) => String(id)).filter(Boolean) : [],
      deleteUserIds: Array.isArray(rawUserIds) ? rawUserIds.map((id) => String(id)).filter(Boolean) : []
    };
  }

  const normalizedType =
    type === 'subNotify' || type === 'subscriptionNotify'
      ? 'subscribe'
      : type === 'barrage'
        ? 'chat'
        : type === 'member'
          ? 'join'
          : type;

  const rawUser = (data && (data.user || data.sender)) || {};
  const msgId = String(data?.common?.msgId ?? data?.msgId ?? data?.id ?? '');
  const rawCreateTime = Number(data?.common?.createTime ?? data?.createTime ?? 0);
  const createTime = rawCreateTime > 0 && rawCreateTime < 1e12 ? rawCreateTime * 1000 : rawCreateTime;

  const base = {
    type: normalizedType,
    timestamp: now,
    msgId,
    ...(createTime > 0 ? { createTime } : {}),
    ...userInfo(rawUser, data)
  };

  if (normalizedType === 'gift') {
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
    const groupId = String(data?.groupId ?? '');

    let streakDelta = giftType === 1 && !repeatEnd ? 1 : repeatCount;
    let suppressAlert = false;
    if (options && options.streakTracker && typeof options.streakTracker.process === 'function') {
      const tracked = options.streakTracker.process(
        {
          userId: base.userId,
          username: base.username,
          giftId: resolvedGiftId,
          giftName: displayGiftName,
          groupId,
          giftType,
          repeatCount,
          repeatEnd
        },
        now
      );
      streakDelta = tracked.streakDelta;
      suppressAlert = tracked.suppressAlert;
    }

    return {
      ...base,
      groupId,
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
      streakDelta,
      suppressAlert,
      test: isTest
    };
  }

  if (normalizedType === 'chat') {
    const text = String(
      data?.comment ||
      data?.content ||
      data?.text ||
      data?.message ||
      data?.common?.displayText?.defaultPattern ||
      ''
    ).trim();
    const isHighlighted = Boolean(
      type === 'barrage' ||
      data?.isHighlighted ||
      data?.barrage ||
      data?.publicAreaMessageCommon?.isAnchorMarked ||
      rawUser?.isAnchorMarked ||
      (Array.isArray(data?.commentTag) && data.commentTag.length > 0) ||
      data?.backgroundImageV2 ||
      data?.background
    );
    return {
      ...base,
      comment: text,
      message: text,
      isHighlighted,
      repeatCount: 1,
      coins: 0
    };
  }

  if (normalizedType === 'like') {
    return {
      ...base,
      repeatCount: Math.max(1, Number(data.count || data.likeCount || 1)),
      coins: 0,
      message: ''
    };
  }

  if (normalizedType === 'subscribe') {
    const subMonth = Math.max(1, Number(data?.subMonth || 1));
    return {
      ...base,
      isSubscriber: true,
      isSuperFan: true,
      subMonth,
      repeatCount: 1,
      coins: 0,
      message: String(data?.message || '')
    };
  }

  return {
    ...base,
    repeatCount: 1,
    coins: 0
  };
}

function makeTestEvent(input = {}) {
  const type = ['gift', 'follow', 'share', 'like', 'chat', 'subscribe', 'join'].includes(input.type)
    ? input.type
    : 'gift';
  const roleFields = {
    isModerator: Boolean(input.isModerator),
    isSubscriber: Boolean(input.isSubscriber || type === 'subscribe'),
    isSuperFan: Boolean(input.isSuperFan || input.isSubscriber || type === 'subscribe'),
    isFollower: Boolean(input.isFollower),
    isFriend: Boolean(input.isFriend),
    isGifter: Boolean(input.isGifter || type === 'gift'),
    gifterLevel: Math.max(0, Number(input.gifterLevel || 0)),
    memberLevel: Math.max(0, Number(input.memberLevel || 0)),
    topViewerRank: Math.max(0, Number(input.topViewerRank || 0)),
    isHighlighted: Boolean(input.isHighlighted)
  };
  if (type === 'chat') {
    const message = String(input.message || input.comment || '¡Hola a todos en el directo!');
    return {
      type: 'chat',
      msgId: String(input.msgId || `test_msg_${Date.now()}`),
      userId: String(input.userId || 'test_user'),
      username: String(input.username || 'tiktato_test'),
      displayName: String(input.displayName || 'Viewer de prueba'),
      avatarUrl: '',
      comment: message,
      message,
      repeatCount: 1,
      coins: 0,
      test: true,
      timestamp: Date.now(),
      ...roleFields
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
    msgId: String(input.msgId || `test_msg_${Date.now()}`),
    userId: String(input.userId || 'test_user'),
    username: String(input.username || 'tiktato_test'),
    displayName: String(input.displayName || 'Viewer de prueba'),
    avatarUrl: '',
    giftId: type === 'gift' ? String(input.giftId || catalogGift?.id || '') : '',
    giftName: type === 'gift' ? giftNameInput : '',
    giftImageUrl: type === 'gift' ? String(input.giftImageUrl || catalogGift?.imageUrl || '') : '',
    coins: type === 'gift' ? coinsPerGift * repeatCount : 0,
    coinsPerGift: type === 'gift' ? coinsPerGift : 0,
    repeatCount,
    streakDelta: repeatCount,
    suppressAlert: false,
    repeatEnd: true,
    test: true,
    message: String(input.message || ''),
    timestamp: Date.now(),
    ...roleFields
  };
}

module.exports = {
  createStreakTracker,
  makeTestEvent,
  normalizeTikTokEvent,
  userInfo
};
