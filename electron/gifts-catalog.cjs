const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_GIFTS = [
  {
    id: '5655',
    name: 'Rosa',
    nameEn: 'Rose',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp'
  },
  {
    id: '15232',
    name: 'Eres increíble',
    nameEn: "You're awesome",
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/e9cafce8279220ed26016a71076d6a8a.png~tplv-obj.webp'
  },
  {
    id: '6064',
    name: 'GG',
    nameEn: 'GG',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/3f02fa9594bd1495ff4e8aa5ae265eef~tplv-obj.webp'
  },
  {
    id: '7032',
    name: 'Maracas',
    nameEn: 'Maracas',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/00204efcf0573192ad5d872c7beeaf5b~tplv-obj.webp'
  },
  {
    id: '6247',
    name: 'Corazón',
    nameEn: 'Heart',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/dd300fd35a757d751301fba862a258f1~tplv-obj.webp'
  },
  {
    id: '7934',
    name: 'Quiéreme',
    nameEn: 'Heart Me',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/d56945782445b0b8c8658ed44f894c7b~tplv-resize:258:258.webp'
  },
  {
    id: '10716',
    name: 'Beso',
    nameEn: 'Blow a kiss',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/cdb55940740d5c83879b2934f9a7d08e.png~tplv-obj.webp'
  },
  {
    id: '5487',
    name: 'Corazón coreano',
    nameEn: 'Finger Heart',
    coins: 5,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/a4c4dc437fd3a6632aba149769491f49.png~tplv-obj.webp'
  },
  {
    id: '8239',
    name: 'Rosa blanca',
    nameEn: 'White Rose',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/a2d81f3847457be9083a9c76a59b08cb~tplv-obj.webp'
  },
  {
    id: '56560',
    name: 'Mi primera rosa',
    nameEn: 'My First Rose',
    coins: 1,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/55163429fc2a3043a3273d2fcd7cd85e.png~tplv-obj.webp'
  },
  {
    id: '5269',
    name: 'TikTok',
    nameEn: 'TikTok',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/802a21ae29f9fae5abe3693de9f874bd~tplv-obj.webp'
  },
  {
    id: '5827',
    name: 'Cono de helado',
    nameEn: 'Ice Cream Cone',
    coins: 1,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/968820bc85e274713c795a6aef3f7c67~tplv-obj.webp'
  },
  {
    id: '5576',
    name: 'Corazón (10)',
    nameEn: 'Heart',
    coins: 10,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/98bea1b189fba75bf0ca766b4dc1976e.png~tplv-obj.webp'
  },
  {
    id: '8913',
    name: 'Rosa (10)',
    nameEn: 'Rosa',
    coins: 10,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eb77ead5c3abb6da6034d3cf6cfeb438~tplv-obj.webp'
  },
  {
    id: '5658',
    name: 'Perfume',
    nameEn: 'Perfume',
    coins: 20,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/20b8f61246c7b6032777bb81bf4ee055~tplv-obj.webp'
  },
  {
    id: '6104',
    name: 'Gorra',
    nameEn: 'Cap',
    coins: 99,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/6c2ab2da19249ea570a2ece5e3377f04~tplv-obj.webp'
  },
  {
    id: '6427',
    name: 'Sombrero y bigote',
    nameEn: 'Hat and Mustache',
    coins: 99,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/2f1e4f3f5c728ffbfa35705b480fdc92~tplv-obj.webp'
  },
  {
    id: '5659',
    name: 'Cisne de papel',
    nameEn: 'Paper Crane',
    coins: 99,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/0f158a08f7886189cdabf496e8a07c21~tplv-obj.webp'
  },
  {
    id: '5660',
    name: 'Corazón con las manos',
    nameEn: 'Hand Heart',
    coins: 100,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/374dfe46d5b09ce1db19be06202d34f5.png~tplv-obj.webp'
  },
  {
    id: '5585',
    name: 'Confeti',
    nameEn: 'Confetti',
    coins: 100,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/472bf660b0804bb37f616d173edb8a9d.png~tplv-obj.webp'
  },
  {
    id: '5509',
    name: 'Gafas de sol',
    nameEn: 'Sunglasses',
    coins: 199,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/08af67ab13a8053269bf539fd27f3873.png~tplv-obj.webp'
  },
  {
    id: '5586',
    name: 'Corazones',
    nameEn: 'Hearts',
    coins: 199,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/934b5a10dee8376df5870a61d2ea5cb6.png~tplv-obj.webp'
  },
  {
    id: '6267',
    name: 'Corgi',
    nameEn: 'Corgi',
    coins: 299,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/148eef0884fdb12058d1c6897d1e02b9~tplv-obj.webp'
  },
  {
    id: '17984',
    name: 'Maracas de playa',
    nameEn: 'Beach Maracas',
    coins: 349,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/db8bf15e39052e17289b70d9eaa926e0.png~tplv-obj.webp'
  },
  {
    id: '8914',
    name: 'Rosa de la eternidad',
    nameEn: 'Forever Rosa',
    coins: 399,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/863e7947bc793f694acbe970d70440a1.png~tplv-obj.webp'
  },
  {
    id: '7168',
    name: 'Pistola de dinero',
    nameEn: 'Money Gun',
    coins: 500,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/e0589e95a2b41970f0f30f6202f5fce6~tplv-obj.webp'
  },
  {
    id: '7122',
    name: 'Pistola de Gemas',
    nameEn: 'Gem Gun',
    coins: 500,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/dd06007ade737f1001977590b11d3f61~tplv-obj.webp'
  },
  {
    id: '17491',
    name: 'Rosas',
    nameEn: 'Roses',
    coins: 500,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/5bbfdb351eb6d69cfe9576b4f3683709.png~tplv-obj.webp'
  },
  {
    id: '11046',
    name: 'Galaxia',
    nameEn: 'Galaxy',
    coins: 1000,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/79a02148079526539f7599150da9fd28.png~tplv-obj.webp'
  },
  {
    id: '6789',
    name: 'Estrella de la alfombra roja',
    nameEn: 'Star of Red Carpet',
    coins: 1999,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/5b9bf90278f87b9ca0c286d3c8a12936~tplv-obj.webp'
  },
  {
    id: '5765',
    name: 'Moto',
    nameEn: 'Motorcycle',
    coins: 2988,
    popular: false,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/motor_icon_green.png~tplv-obj.webp'
  },
  {
    id: '5338',
    name: 'Unicornio de fantasía',
    nameEn: 'Unicorn Fantasy',
    coins: 5000,
    popular: true,
    imageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/483c644e67e9bb1dd5970f2df00b7576~tplv-obj.webp'
  }
];

const GIFT_SYNONYM_GROUPS = [
  ['rosa', 'rose', 'rosa de prueba', 'test rose', 'regalo de prueba'],
  ['eres increible', "you're awesome", 'youre awesome', 'you are awesome'],
  ['gg', 'good game'],
  ['maracas'],
  ['corazon', 'heart'],
  ['quiereme', 'heart me'],
  ['beso', 'blow a kiss', 'kiss'],
  ['rosa blanca', 'white rose'],
  ['mi primera rosa', 'my first rose'],
  ['corazon coreano', 'finger heart', 'korean heart'],
  ['cono de helado', 'ice cream cone', 'helado'],
  ['corazon con las manos', 'hand heart'],
  ['corazones', 'hearts'],
  ['rosa de la eternidad', 'forever rosa', 'forever rose'],
  ['maracas de playa', 'beach maracas'],
  ['rosas', 'roses'],
  ['galaxia', 'galaxy'],
  ['gorra', 'cap'],
  ['perfume'],
  ['confeti', 'confetti'],
  ['gafas de sol', 'sunglasses', 'lentes de sol'],
  ['corgi'],
  ['pistola de dinero', 'money gun'],
  ['pistola de gemas', 'gem gun'],
  ['cisne de papel', 'paper crane'],
  ['sombrero y bigote', 'hat and mustache'],
  ['moto', 'motorcycle'],
  ['unicornio de fantasia', 'unicorn fantasy', 'unicornio'],
  ['pegaso', 'pegasus'],
  ['fenix de fuego', 'fire phoenix']
];

let activeCatalog = [...DEFAULT_GIFTS];

function normalizeGiftText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/\s+/g, ' ');
}

function stripCoinSuffix(value) {
  return normalizeGiftText(value).replace(/\s*\(\d+\)\s*$/, '');
}

function stripTestSuffix(value) {
  return stripCoinSuffix(value)
    .replace(/\s*(?:de\s+)?prueba\s*$/i, '')
    .replace(/^test\s+/i, '')
    .replace(/\s+test\s*$/i, '');
}

function getActiveCatalog() {
  return activeCatalog;
}

function findGiftById(giftId, catalog = activeCatalog) {
  const id = String(giftId || '').trim();
  if (!id) return null;
  return (catalog || activeCatalog).find((item) => String(item.id) === id) || null;
}

function findGiftByName(giftName, catalog = activeCatalog) {
  const normalized = stripCoinSuffix(giftName);
  if (!normalized) return null;
  const testStripped = stripTestSuffix(giftName);
  const list = catalog || activeCatalog;
  return (
    list.find((item) => {
      const es = stripCoinSuffix(item.name);
      const en = stripCoinSuffix(item.nameEn);
      return (
        es === normalized ||
        en === normalized ||
        (testStripped && (es === testStripped || en === testStripped))
      );
    }) || null
  );
}

function getEquivalentGiftNames(nameOrGift, catalog = activeCatalog) {
  const names = new Set();
  const add = (text) => {
    const clean = normalizeGiftText(text);
    const stripped = stripCoinSuffix(text);
    const testStripped = stripTestSuffix(text);
    if (clean) names.add(clean);
    if (stripped) names.add(stripped);
    if (testStripped) names.add(testStripped);
  };

  if (typeof nameOrGift === 'string') {
    add(nameOrGift);
  } else if (nameOrGift && typeof nameOrGift === 'object') {
    add(nameOrGift.name);
    add(nameOrGift.nameEn);
    add(nameOrGift.giftName);
    add(nameOrGift.giftNameRaw);
  }

  const list = catalog || activeCatalog;
  for (const current of [...names]) {
    for (const group of GIFT_SYNONYM_GROUPS) {
      if (group.some((alias) => normalizeGiftText(alias) === current)) {
        group.forEach(add);
      }
    }
    for (const gift of list) {
      const es = stripCoinSuffix(gift.name);
      const en = stripCoinSuffix(gift.nameEn);
      if (es === current || en === current) {
        add(gift.name);
        add(gift.nameEn);
      }
    }
  }

  return [...names];
}

function mergeGifts(baseList, extraList) {
  const byId = new Map();
  const popularIds = new Set(DEFAULT_GIFTS.filter((item) => item.popular).map((item) => String(item.id)));

  const upsert = (gift, isDefault = false) => {
    if (!gift || !gift.id) return;
    const id = String(gift.id).trim();
    if (!id) return;
    const existing = byId.get(id);
    const coins = Math.max(1, Number(gift.coins || existing?.coins || 1));
    const name = String(gift.name || existing?.name || gift.nameEn || 'Regalo').trim();
    const nameEn = String(gift.nameEn || existing?.nameEn || name).trim();
    const imageUrl = String(gift.imageUrl || existing?.imageUrl || '').trim();
    byId.set(id, {
      id,
      name: isDefault && existing?.name ? existing.name : name,
      nameEn,
      coins,
      popular: Boolean(gift.popular || existing?.popular || popularIds.has(id)),
      imageUrl
    });
  };

  (baseList || []).forEach((gift) => upsert(gift, true));
  (extraList || []).forEach((gift) => upsert(gift, false));

  return [...byId.values()].sort((left, right) => {
    if (left.popular !== right.popular) return left.popular ? -1 : 1;
    if (left.coins !== right.coins) return left.coins - right.coins;
    return left.name.localeCompare(right.name, 'es');
  });
}

function cachePath(userDataDir) {
  return path.join(userDataDir, 'gifts-cache.json');
}

function loadGiftsCatalog(userDataDir) {
  if (!userDataDir) {
    activeCatalog = mergeGifts(DEFAULT_GIFTS, []);
    return activeCatalog;
  }
  try {
    const file = cachePath(userDataDir);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(parsed)) {
        activeCatalog = mergeGifts(DEFAULT_GIFTS, parsed);
        return activeCatalog;
      }
    }
  } catch {
    // Si falla el caché, usamos el catálogo por defecto.
  }
  activeCatalog = mergeGifts(DEFAULT_GIFTS, []);
  return activeCatalog;
}

async function fetchTikTokGiftMap(lang) {
  const params = new URLSearchParams({
    aid: '1988',
    app_name: 'tiktok_web',
    device_platform: 'web_pc',
    app_language: lang,
    webcast_language: lang,
    browser_language: lang,
    region: 'AR'
  });
  const response = await fetch(`https://webcast.tiktok.com/webcast/gift/list/?${params}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.tiktok.com/'
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text) return new Map();
  const payload = JSON.parse(text);
  const map = new Map();
  const collect = (gift) => {
    if (!gift || !gift.id) return;
    const id = String(gift.id);
    if (map.has(id)) return;
    const imageUrl =
      (gift.image && Array.isArray(gift.image.url_list) && gift.image.url_list[0]) ||
      (gift.icon && Array.isArray(gift.icon.url_list) && gift.icon.url_list[0]) ||
      '';
    map.set(id, {
      id,
      name: String(gift.name || '').trim(),
      coins: Math.max(1, Number(gift.diamond_count || 1)),
      imageUrl: String(imageUrl || '').trim()
    });
  };
  (payload.data?.gifts || []).forEach(collect);
  (payload.data?.pages || []).forEach((page) => (page.gifts || []).forEach(collect));
  return map;
}

async function refreshGiftsCatalog(userDataDir) {
  const [esMap, enMap] = await Promise.all([
    fetchTikTokGiftMap('es').catch(() => new Map()),
    fetchTikTokGiftMap('en').catch(() => new Map())
  ]);
  const allIds = new Set([...esMap.keys(), ...enMap.keys()]);
  const fetched = [];
  for (const id of allIds) {
    const es = esMap.get(id);
    const en = enMap.get(id);
    const name = (es && es.name) || (en && en.name) || '';
    if (!name) continue;
    fetched.push({
      id,
      name,
      nameEn: (en && en.name) || name,
      coins: (es && es.coins) || (en && en.coins) || 1,
      imageUrl: (es && es.imageUrl) || (en && en.imageUrl) || ''
    });
  }
  if (fetched.length > 0) {
    activeCatalog = mergeGifts(DEFAULT_GIFTS, fetched);
    if (userDataDir) {
      try {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(cachePath(userDataDir), JSON.stringify(activeCatalog, null, 2), 'utf8');
      } catch {
        // Ignorado si no se puede escribir el caché.
      }
    }
  }
  return activeCatalog;
}

module.exports = {
  DEFAULT_GIFTS,
  GIFT_SYNONYM_GROUPS,
  findGiftById,
  findGiftByName,
  getActiveCatalog,
  getEquivalentGiftNames,
  loadGiftsCatalog,
  normalizeGiftText,
  refreshGiftsCatalog,
  stripCoinSuffix,
  stripTestSuffix
};
