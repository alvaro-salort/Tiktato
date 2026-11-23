const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FISH_API_BASE = 'https://api.fish.audio';
const DEFAULT_FISH_MODEL = 's2.1-pro-free';
const FISH_CATEGORIES = ['all', 'everyday', 'characters', 'celebrities', 'accents', 'singing'];
const MAX_TTS_TEXT_CHARS = 500;

const CURATED_FISH_VOICES = [
  {
    referenceId: '47d00a02c75f47b7877fe925ab66b5f2',
    name: 'Babidi',
    category: 'characters',
    languages: ['es'],
    tags: ['character-voice', 'anime', 'dragon-ball', 'energetic', 'recommended'],
    description: 'Voz clásica de Babidi en español, aguda y expresiva.',
    recommended: true,
    sampleAudioUrl: ''
  },
  {
    referenceId: '9f850ee9ada24b20a6866825eaefd3f8',
    name: 'Goku (Mario Castañeda)',
    category: 'characters',
    languages: ['es'],
    tags: ['male', 'anime', 'goku', 'character'],
    description: 'Voz clásica de anime en español latino.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/66265341eb22496e970f39078a9225da.mp3'
  },
  {
    referenceId: 'bcdc2d4b044d4a6992d9260ce16715eb',
    name: 'Loquendo Clásico',
    category: 'characters',
    languages: ['es'],
    tags: ['male', 'loquendo', 'narration', 'classic'],
    description: 'Voz clásica estilo Loquendo para memes y directos.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/2f7c9024036f484b82d65947026c3091.mp3'
  },
  {
    referenceId: '3f45a7fd7a614655a61eb7027b955783',
    name: 'Voz de Locutor',
    category: 'everyday',
    languages: ['es'],
    tags: ['male', 'narration', 'deep', 'clear'],
    description: 'Locutor español con tono grave y claro.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/9c0265a65e544536abbd8176e0d9214f.mp3'
  },
  {
    referenceId: '35929683c49c4ec0bf779dc07d22620b',
    name: 'Chica (Español)',
    category: 'everyday',
    languages: ['es'],
    tags: ['female', 'young', 'conversational'],
    description: 'Voz femenina joven y natural en español.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/f2314568bc764d01bbc6056d4ccb84ed.mp3'
  },
  {
    referenceId: '8d2c17a9b26d4d83888ea67a1ee565b2',
    name: 'Valentino Narrador',
    category: 'everyday',
    languages: ['es'],
    tags: ['male', 'narration', 'calm'],
    description: 'Narración pausada y profunda en español.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/59ce7df6935c42249759327ddf70f37b.mp3'
  },
  {
    referenceId: 'acc8237220d8470985ec9be6c4c480a9',
    name: 'Hatsune Miku',
    category: 'singing',
    languages: ['es', 'en'],
    tags: ['female', 'singing', 'vocaloid', 'energetic'],
    description: 'Voz aguda estilo idol virtual.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/543841a007194d9381029bedff4a82d2.mp3'
  },
  {
    referenceId: '0118a35dcb604837abe7961a43e13ba8',
    name: 'Kasane Teto (Español)',
    category: 'singing',
    languages: ['es'],
    tags: ['female', 'singing', 'character', 'energetic'],
    description: 'Voz expresiva estilo synth vocal en español.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/41030975301c444c9b33961541dc27b8.mp3'
  },
  {
    referenceId: '4f7b3d2243ae422a8e4bd061abfb0fd6',
    name: 'L-gang (Acento Urbano)',
    category: 'accents',
    languages: ['es'],
    tags: ['male', 'accent', 'entertainment'],
    description: 'Voz con acento urbano en español.',
    sampleAudioUrl: 'https://platform.r2.fish.audio/task/d5dc752042fe49bbaf389afdb1d10568.mp3'
  }
].map((voice) => ({
  ...voice,
  id: `fish:${voice.referenceId}`,
  source: 'curated'
}));

function extractFishReferenceId(value) {
  const raw = String(value || '').trim();
  const candidate = raw.startsWith('fish:') ? raw.slice(5).trim() : raw;
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(candidate)) {
    return '';
  }
  return candidate;
}

function classifyFishVoice(item) {
  const explicit = String(item?.category || '').toLowerCase();
  if (FISH_CATEGORIES.includes(explicit) && explicit !== 'all') {
    return explicit;
  }
  const haystack = [
    item?.title || item?.name || '',
    item?.description || '',
    ...(Array.isArray(item?.tags) ? item.tags : [])
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(sing|singing|vocaloid|utau|song|rap|canto|cantante)\b/.test(haystack)) {
    return 'singing';
  }
  if (/\b(accent|acento|dialect|british|australian|italian|mexican|argentin|scottish|irish)\b/.test(haystack)) {
    return 'accents';
  }
  if (/\b(celebrity|celebrities|actor|actress|streamer|youtuber|wwe|president|singer|famous)\b/.test(haystack)) {
    return 'celebrities';
  }
  if (/\b(character|character-voice|anime|cartoon|gaming|game|announcer|loquendo|goku|vegeta|naruto|meme)\b/.test(haystack)) {
    return 'characters';
  }
  return 'everyday';
}

function normalizeFishModelItem(item) {
  const referenceId = extractFishReferenceId(item?._id || item?.referenceId || item?.id);
  if (!referenceId) return null;
  const languages = Array.isArray(item?.languages)
    ? item.languages.map((lang) => String(lang).toLowerCase()).filter(Boolean)
    : [];
  const tags = Array.isArray(item?.tags)
    ? item.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
    : [];
  const sampleAudioUrl =
    String(item?.sampleAudioUrl || item?.samples?.[0]?.audio || '').trim();

  return {
    id: `fish:${referenceId}`,
    referenceId,
    name: String(item?.title || item?.name || referenceId).trim().slice(0, 100),
    category: classifyFishVoice(item),
    languages,
    tags,
    description: String(item?.description || '').trim().slice(0, 180),
    recommended: referenceId === '47d00a02c75f47b7877fe925ab66b5f2' || Boolean(item?.recommended),
    sampleAudioUrl,
    taskCount: Number(item?.task_count || item?.taskCount || 0) || 0,
    source: item?.source || 'api'
  };
}

class FishAudioService {
  constructor({
    userDataDir = '',
    fetchImpl = globalThis.fetch,
    logger = console,
    maxMemoryEntries = 50,
    maxMemoryBytes = 15 * 1024 * 1024,
    maxDiskEntries = 150,
    maxDiskBytes = 40 * 1024 * 1024,
    diskTtlMs = 24 * 60 * 60 * 1000,
    diskPruneIntervalMs = 60_000,
    synthesizeTimeoutMs = 8_000
  } = {}) {
    this.userDataDir = userDataDir || '';
    this.cacheDir = this.userDataDir ? path.join(this.userDataDir, 'tts-cache') : '';
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.maxMemoryEntries = Math.max(1, Number(maxMemoryEntries) || 50);
    this.maxMemoryBytes = Math.max(1024, Number(maxMemoryBytes) || 15 * 1024 * 1024);
    this.maxDiskEntries = Math.max(1, Number(maxDiskEntries) || 150);
    this.maxDiskBytes = Math.max(1024, Number(maxDiskBytes) || 40 * 1024 * 1024);
    this.diskTtlMs = Math.max(60_000, Number(diskTtlMs) || 24 * 60 * 60 * 1000);
    const parsedPrune = Number(diskPruneIntervalMs);
    this.diskPruneIntervalMs = Number.isFinite(parsedPrune) && parsedPrune >= 0 ? parsedPrune : 60_000;
    const parsedTimeout = Number(synthesizeTimeoutMs);
    this.synthesizeTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 8_000;

    this.memoryCache = new Map();
    this.memoryBytes = 0;
    this.inFlight = new Map();
    this.lastDiskPruneAt = 0;
    this.diskWriteQueue = Promise.resolve();
  }

  getCuratedVoices({ query = '', category = 'all', language = '' } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const cat = FISH_CATEGORIES.includes(category) ? category : 'all';
    const lang = String(language || '').trim().toLowerCase();

    return CURATED_FISH_VOICES.filter((voice) => {
      if (cat !== 'all' && voice.category !== cat) return false;
      if (lang && !voice.languages.includes(lang)) return false;
      if (q) {
        const hay = `${voice.name} ${voice.description} ${voice.tags.join(' ')} ${voice.referenceId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).map((voice) => ({ ...voice }));
  }

  async testApiKey(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) {
      return {
        ok: false,
        valid: false,
        code: 'MISSING_API_KEY',
        error: 'Introduce tu API Key de Fish Audio.'
      };
    }
    if (typeof this.fetchImpl !== 'function') {
      return { ok: false, valid: false, code: 'NO_FETCH', error: 'Fetch no disponible.' };
    }

    try {
      const response = await this.fetchImpl(`${FISH_API_BASE}/wallet/self/api-credit`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10_000)
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          valid: false,
          code: 'INVALID_API_KEY',
          error: 'La API Key de Fish Audio no es válida o fue revocada.'
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          valid: false,
          code: 'HTTP_ERROR',
          error: `Fish Audio respondió con estado HTTP ${response.status}.`
        };
      }

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      return {
        ok: true,
        valid: true,
        credit: data?.credit ?? data?.balance ?? null
      };
    } catch (error) {
      return {
        ok: false,
        valid: false,
        code: 'NETWORK_ERROR',
        error: `No se pudo conectar con Fish Audio: ${error?.message || 'error de red'}`
      };
    }
  }

  async listVoices({
    apiKey = '',
    query = '',
    category = 'all',
    language = '',
    page = 1,
    pageSize = 24,
    selfOnly = false
  } = {}) {
    const key = String(apiKey || '').trim();
    const cleanQuery = String(query || '').trim();
    const cat = FISH_CATEGORIES.includes(category) ? category : 'all';
    const lang = String(language || '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.round(Number(page) || 1));
    const size = Math.max(1, Math.min(50, Math.round(Number(pageSize) || 24)));

    if (selfOnly && !key) {
      return {
        ok: false,
        voices: [],
        total: 0,
        error: 'Configura tu API Key de Fish Audio para ver tus voces guardadas.'
      };
    }

    const curated = !selfOnly && pageNum === 1
      ? this.getCuratedVoices({ query: cleanQuery, category: cat, language: lang })
      : [];

    if (typeof this.fetchImpl !== 'function') {
      return { ok: true, voices: curated, total: curated.length, source: 'curated' };
    }

    if (!key) {
      return {
        ok: true,
        voices: curated,
        total: curated.length,
        source: 'curated',
        needsApiKey: true
      };
    }

    try {
      const fetchSize =
        !selfOnly && !cleanQuery && ['celebrities', 'accents', 'everyday'].includes(cat)
          ? Math.max(size, 50)
          : size;
      const url = new URL(`${FISH_API_BASE}/model`);
      url.searchParams.set('page_size', String(fetchSize));
      url.searchParams.set('page_number', String(pageNum));
      url.searchParams.set('sort_by', 'task_count');
      if (cleanQuery) url.searchParams.set('title', cleanQuery);
      if (lang) url.searchParams.set('language', lang);
      if (selfOnly) url.searchParams.set('self_only', 'true');
      if (cat === 'singing' && !cleanQuery) url.searchParams.set('tags', 'singing');
      if (cat === 'characters' && !cleanQuery) url.searchParams.set('tags', 'character-voice');

      const headers = { Accept: 'application/json' };
      if (key) {
        headers.Authorization = `Bearer ${key}`;
      }

      const response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000)
      });

      if (!response.ok) {
        const message = response.status === 401
          ? 'API Key de Fish Audio inválida.'
          : `Error al consultar voces de Fish Audio (HTTP ${response.status}).`;
        return {
          ok: !selfOnly && curated.length > 0,
          voices: curated,
          total: curated.length,
          source: 'curated',
          warning: curated.length > 0 ? message : undefined,
          error: (selfOnly || curated.length === 0) ? message : undefined
        };
      }

      const data = await response.json();
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const apiVoices = rawItems
        .map((item) => normalizeFishModelItem(item))
        .filter(Boolean)
        .filter((voice) => (cat === 'all' ? true : voice.category === cat || Boolean(cleanQuery)));

      const seen = new Set();
      const merged = [];
      for (const voice of [...curated, ...apiVoices]) {
        if (seen.has(voice.referenceId)) continue;
        seen.add(voice.referenceId);
        merged.push(voice);
      }

      return {
        ok: true,
        voices: merged,
        total: Number(data?.total) || merged.length,
        source: apiVoices.length > 0 ? 'api+curated' : 'curated'
      };
    } catch (error) {
      this.logger?.warn?.('[fish-audio] error listando voces', error?.message || error);
      const netMsg = error?.message || 'Error de red';
      return {
        ok: !selfOnly && curated.length > 0,
        voices: curated,
        total: curated.length,
        source: 'curated',
        warning: curated.length > 0 ? `No se pudo consultar el catálogo en línea: ${netMsg}` : undefined,
        error: (selfOnly || curated.length === 0) ? `No se pudo consultar el catálogo en línea: ${netMsg}` : undefined
      };
    }
  }

  #buildCacheKey({ text, referenceId, model, speed }) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ text, referenceId, model, speed }))
      .digest('hex');
  }

  #getMemoryCache(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    this.memoryCache.delete(key);
    this.memoryCache.set(key, entry);
    return entry.buffer;
  }

  #setMemoryCache(key, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return;
    if (buffer.length > this.maxMemoryBytes) return;

    if (this.memoryCache.has(key)) {
      const prev = this.memoryCache.get(key);
      this.memoryBytes -= prev.size;
      this.memoryCache.delete(key);
    }

    while (
      this.memoryCache.size >= this.maxMemoryEntries ||
      this.memoryBytes + buffer.length > this.maxMemoryBytes
    ) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.memoryCache.get(oldestKey);
      this.memoryCache.delete(oldestKey);
      this.memoryBytes -= oldest?.size || 0;
    }

    this.memoryCache.set(key, { buffer, size: buffer.length, createdAt: Date.now() });
    this.memoryBytes += buffer.length;
  }

  async #getDiskCache(key) {
    if (!this.cacheDir) return null;
    const file = path.join(this.cacheDir, `${key}.mp3`);
    try {
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) return null;
      if (Date.now() - stat.mtimeMs > this.diskTtlMs) {
        await fs.promises.unlink(file).catch(() => {});
        return null;
      }
      const buffer = await fs.promises.readFile(file);
      if (!buffer.length) return null;
      const now = new Date();
      fs.promises.utimes(file, now, now).catch(() => {});
      return buffer;
    } catch {
      return null;
    }
  }

  #enqueueDiskWrite(key, buffer) {
    if (!this.cacheDir || !Buffer.isBuffer(buffer) || buffer.length === 0) return;
    if (buffer.length > this.maxDiskBytes) return;
    this.diskWriteQueue = this.diskWriteQueue
      .catch(() => {})
      .then(() => this.#setDiskCache(key, buffer));
  }

  async flushDiskCache() {
    await this.diskWriteQueue.catch(() => {});
  }

  async #setDiskCache(key, buffer) {
    if (!this.cacheDir || !Buffer.isBuffer(buffer) || buffer.length === 0) return;
    if (buffer.length > this.maxDiskBytes) return;

    const file = path.join(this.cacheDir, `${key}.mp3`);
    const temp = `${file}.${process.pid}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    try {
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
      await fs.promises.writeFile(temp, buffer);
      await fs.promises.rename(temp, file);
      const now = Date.now();
      if (now - this.lastDiskPruneAt >= this.diskPruneIntervalMs) {
        this.lastDiskPruneAt = now;
        await this.#pruneDiskCache();
      }
    } catch (error) {
      await fs.promises.unlink(temp).catch(() => {});
      this.logger?.warn?.('[fish-audio] no se pudo guardar caché en disco', error?.message || error);
    }
  }

  async #pruneDiskCache() {
    if (!this.cacheDir) return;
    try {
      const names = await fs.promises.readdir(this.cacheDir);
      const now = Date.now();
      const entries = [];
      let totalBytes = 0;

      for (const name of names) {
        if (!name.endsWith('.mp3')) continue;
        const full = path.join(this.cacheDir, name);
        try {
          const stat = await fs.promises.stat(full);
          if (!stat.isFile()) continue;
          if (now - stat.mtimeMs > this.diskTtlMs) {
            await fs.promises.unlink(full).catch(() => {});
            continue;
          }
          entries.push({ full, size: stat.size, mtimeMs: stat.mtimeMs });
          totalBytes += stat.size;
        } catch {
          // Ignorado
        }
      }

      if (entries.length <= this.maxDiskEntries && totalBytes <= this.maxDiskBytes) {
        return;
      }

      entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
      while (
        entries.length > 0 &&
        (entries.length > this.maxDiskEntries || totalBytes > this.maxDiskBytes)
      ) {
        const oldest = entries.shift();
        await fs.promises.unlink(oldest.full).catch(() => {});
        totalBytes -= oldest.size;
      }
    } catch {
      // Ignorado
    }
  }

  async clearCache() {
    this.memoryCache.clear();
    this.memoryBytes = 0;
    await this.flushDiskCache();
    if (!this.cacheDir) return { ok: true };
    try {
      const names = await fs.promises.readdir(this.cacheDir);
      await Promise.all(
        names
          .filter((name) => name.endsWith('.mp3'))
          .map((name) => fs.promises.unlink(path.join(this.cacheDir, name)).catch(() => {}))
      );
    } catch {
      // El directorio puede no existir aún.
    }
    return { ok: true };
  }

  async getCacheStats() {
    await this.flushDiskCache();
    let diskEntries = 0;
    let diskBytes = 0;
    if (this.cacheDir) {
      try {
        const names = await fs.promises.readdir(this.cacheDir);
        for (const name of names) {
          if (!name.endsWith('.mp3')) continue;
          const stat = await fs.promises.stat(path.join(this.cacheDir, name)).catch(() => null);
          if (stat?.isFile()) {
            diskEntries += 1;
            diskBytes += stat.size;
          }
        }
      } catch {
        // Ignorado
      }
    }
    return {
      memoryEntries: this.memoryCache.size,
      memoryBytes: this.memoryBytes,
      diskEntries,
      diskBytes
    };
  }

  async synthesize({
    apiKey = '',
    text = '',
    referenceId = '',
    model = DEFAULT_FISH_MODEL,
    speed = 1
  } = {}) {
    const cleanText = String(text || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TTS_TEXT_CHARS);
    if (!cleanText) {
      return { ok: false, code: 'EMPTY_TEXT', error: 'El texto para sintetizar está vacío.' };
    }

    const cleanRef = extractFishReferenceId(referenceId);
    if (!cleanRef) {
      return {
        ok: false,
        code: 'INVALID_REFERENCE_ID',
        error: 'Falta un reference_id válido de Fish Audio.'
      };
    }

    const cleanModel = String(model || DEFAULT_FISH_MODEL).trim() || DEFAULT_FISH_MODEL;
    const numericSpeed = Number(speed);
    const cleanSpeed = Number.isFinite(numericSpeed)
      ? Math.max(0.5, Math.min(2, Number(numericSpeed.toFixed(2))))
      : 1;

    const cacheKey = this.#buildCacheKey({
      text: cleanText,
      referenceId: cleanRef,
      model: cleanModel,
      speed: cleanSpeed
    });

    const memHit = this.#getMemoryCache(cacheKey);
    if (memHit) {
      return {
        ok: true,
        audioBase64: memHit.toString('base64'),
        contentType: 'audio/mpeg',
        cached: 'memory'
      };
    }

    const diskHit = await this.#getDiskCache(cacheKey);
    if (diskHit) {
      this.#setMemoryCache(cacheKey, diskHit);
      return {
        ok: true,
        audioBase64: diskHit.toString('base64'),
        contentType: 'audio/mpeg',
        cached: 'disk'
      };
    }

    const key = String(apiKey || '').trim();
    if (!key) {
      return {
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'Configura tu API Key de Fish Audio para sintetizar con esta voz.'
      };
    }

    if (typeof this.fetchImpl !== 'function') {
      return { ok: false, code: 'NO_FETCH', error: 'Fetch no disponible.' };
    }

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey);
    }

    const task = (async () => {
      try {
        const body = {
          text: cleanText,
          reference_id: cleanRef,
          format: 'mp3'
        };
        if (cleanSpeed !== 1) {
          body.prosody = { speed: cleanSpeed };
        }

        const response = await this.fetchImpl(`${FISH_API_BASE}/v1/tts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            model: cleanModel
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.synthesizeTimeoutMs)
        });

        if (response.status === 401 || response.status === 403) {
          return {
            ok: false,
            code: 'INVALID_API_KEY',
            error: 'La API Key de Fish Audio no es válida o fue revocada.'
          };
        }
        if (response.status === 402 || response.status === 429) {
          return {
            ok: false,
            code: 'QUOTA_OR_RATE_LIMIT',
            error: 'Se alcanzó el límite de uso o saldo de tu cuenta de Fish Audio.'
          };
        }
        if (!response.ok) {
          return {
            ok: false,
            code: 'HTTP_ERROR',
            error: `Fish Audio devolvió HTTP ${response.status}.`
          };
        }

        const respContentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (respContentType.includes('application/json')) {
          return {
            ok: false,
            code: 'UNEXPECTED_JSON',
            error: 'Fish Audio devolvió JSON en lugar de audio.'
          };
        }

        const arrayBuf = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length === 0) {
          return {
            ok: false,
            code: 'EMPTY_AUDIO',
            error: 'Fish Audio devolvió una respuesta de audio vacía.'
          };
        }

        this.#setMemoryCache(cacheKey, buffer);
        this.#enqueueDiskWrite(cacheKey, buffer);

        return {
          ok: true,
          audioBase64: buffer.toString('base64'),
          contentType: 'audio/mpeg',
          cached: false
        };
      } catch (error) {
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          error: `Error al sintetizar en Fish Audio: ${error?.message || 'error de red'}`
        };
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, task);
    return task;
  }
}

module.exports = {
  CURATED_FISH_VOICES,
  DEFAULT_FISH_MODEL,
  FISH_API_BASE,
  FISH_CATEGORIES,
  FishAudioService,
  classifyFishVoice,
  extractFishReferenceId,
  normalizeFishModelItem
};
