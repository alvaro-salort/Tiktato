export function filterTtsText(rawText, { antiSpam = false, maxChars = 120 } = {}) {
  if (!rawText) return '';
  let clean = String(rawText).trim();

  if (antiSpam) {
    // Omite comandos tipo !song, /help, .play, #tag
    if (/^[!/.#]/i.test(clean)) return '';

    // Colapsa letras repetidas a un máximo de 2 consecutivas (ej. "holaaaaa" -> "holaa")
    clean = clean.replace(/(.)\1{2,}/gu, '$1$1');

    // Colapsa palabras repetidas sucesivamente con soporte Unicode (ej. "jaja jaja jaja jaja" -> "jaja jaja", "sí sí sí" -> "sí sí")
    clean = clean.replace(/(?<!\p{L})(\p{L}+)(?:\s+\1){2,}(?!\p{L})/giu, '$1 $1');

    // Descarta mensajes que sean solo signos o sin contenido inteligible (soporte Unicode completo)
    if (!/[\p{L}\p{N}]/u.test(clean)) {
      return '';
    }
  }

  // Límite de caracteres alineado con config.cjs (20..500, default 120)
  const rawMax = Number(maxChars);
  const limit = Math.max(20, Math.min(500, Number.isFinite(rawMax) ? Math.round(rawMax) : 120));
  if (clean.length > limit) {
    clean = clean.slice(0, limit).trim();
  }

  return clean;
}

export function formatChatTTS(username, message, options = {}) {
  const name = String(username || '').trim();
  const text = String(message || '').trim();
  if (!text) return '';
  const readUsername =
    typeof options === 'boolean'
      ? options
      : options && typeof options === 'object'
        ? options.readUsername !== false
        : true;
  if (!readUsername || !name) return text;
  return `${name}: ${text}`;
}

export function shouldReadChatMessage(event, ttsConfig = {}) {
  if (!event || event.type !== 'chat') return false;
  if (ttsConfig.chatEnabled === false) return false;
  if (event.test) return true;
  if (!ttsConfig.filterChatByRole) return true;

  if (ttsConfig.allowModerators !== false && event.isModerator) return true;
  if (ttsConfig.allowSubscribers !== false && (event.isSubscriber || event.isSuperFan)) return true;
  if (ttsConfig.allowHighlighted !== false && event.isHighlighted) return true;
  if (ttsConfig.allowFriends === true && event.isFriend) return true;
  if (ttsConfig.allowFollowers === true && event.isFollower) return true;
  if (
    ttsConfig.allowGifter === true &&
    Number(event.gifterLevel || 0) >= Math.max(1, Number(ttsConfig.minGifterLevel || 1))
  ) {
    return true;
  }
  if (
    ttsConfig.allowMember === true &&
    Number(event.memberLevel || 0) >= Math.max(1, Number(ttsConfig.minMemberLevel || 1))
  ) {
    return true;
  }

  return false;
}

export function formatGiftTTS(username, giftName, count = 1) {
  const name = String(username || 'Alguien').trim();
  const gift = String(giftName || 'un regalo').trim();
  const repeat = Number(count) || 1;
  if (repeat > 1) {
    return `${name} envió ${repeat} ${gift}`;
  }
  return `${name} envió ${gift}`;
}

const MAX_CHAT_AGE_MS = 20_000;

export class TTSQueue {
  constructor({
    soundEngine = null,
    onStateChange = null,
    maxQueueSize = 5,
    fishSynthesizer = null,
    maxCacheEntries = 40,
    maxCacheBytes = 5 * 1024 * 1024
  } = {}) {
    this.soundEngine = soundEngine;
    this.onStateChange = onStateChange || (() => {});
    this.maxQueueSize = Math.max(1, Number(maxQueueSize) || 5);
    this.fishSynthesizer = typeof fishSynthesizer === 'function' ? fishSynthesizer : null;
    this.maxCacheEntries = Math.max(0, Number(maxCacheEntries ?? 40));
    this.maxCacheBytes = Math.max(0, Number(maxCacheBytes ?? 5 * 1024 * 1024));
    this.audioCache = new Map();
    this.audioCacheBytes = 0;
    this.cacheGen = 0;
    this.prefetchPromises = new Map();
    this.queue = [];
    this.seenMsgIds = new Set();
    this.isSpeaking = false;
    this.isPlayingAudio = false;
    this.currentItem = null;
    this.currentAbort = null;
    this.lastLocalCancelAt = 0;
    this.isMuted = false;
  }

  setFishSynthesizer(fn) {
    this.fishSynthesizer = typeof fn === 'function' ? fn : null;
  }

  clearAudioCache() {
    this.cacheGen += 1;
    this.audioCache.clear();
    this.audioCacheBytes = 0;
    this.prefetchPromises.clear();
  }

  #getCachedAudio(key) {
    if (!this.maxCacheEntries || !this.maxCacheBytes) return null;
    const entry = this.audioCache.get(key);
    if (!entry) return null;
    this.audioCache.delete(key);
    this.audioCache.set(key, entry);
    return entry.src;
  }

  #setCachedAudio(key, src) {
    if (!this.maxCacheEntries || !this.maxCacheBytes || !src) return;
    const size = String(src).length;
    if (size > this.maxCacheBytes) return;

    if (this.audioCache.has(key)) {
      const prev = this.audioCache.get(key);
      this.audioCacheBytes -= prev?.size || 0;
      this.audioCache.delete(key);
    }

    while (
      this.audioCache.size >= this.maxCacheEntries ||
      this.audioCacheBytes + size > this.maxCacheBytes
    ) {
      const oldestKey = this.audioCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.audioCache.get(oldestKey);
      this.audioCache.delete(oldestKey);
      this.audioCacheBytes -= oldest?.size || 0;
    }

    this.audioCache.set(key, { src, size });
    this.audioCacheBytes += size;
  }

  enqueue(item) {
    if (this.isMuted) return;
    if (!item || !item.text) return;
    const msgId = item.msgId ? String(item.msgId) : '';
    if (msgId) {
      if (this.seenMsgIds.has(msgId)) return;
      this.seenMsgIds.add(msgId);
      if (this.seenMsgIds.size > 2000) {
        const oldest = this.seenMsgIds.values().next().value;
        this.seenMsgIds.delete(oldest);
      }
    }
    const cleanText = filterTtsText(item.text, {
      antiSpam: Boolean(item.antiSpam),
      maxChars: item.maxChars ?? 120
    });
    if (!cleanText) return;

    const now = Date.now();
    this.queue.push({
      ...item,
      msgId,
      userId: item.userId ? String(item.userId) : '',
      text: cleanText,
      enqueuedAt: Number(item.enqueuedAt) || now,
      id: item.id || `tts_${now}_${Math.random().toString(36).slice(2, 6)}`
    });

    this.queue = this.queue.filter((entry) => !this.#isExpiredChat(entry, now));
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }

    this.#notify();
    if (this.isSpeaking) {
      if (this.isPlayingAudio) this.#prefetchNextFish();
    } else {
      this.#process();
    }
  }

  removeByModeration({ deleteMsgIds = [], deleteUserIds = [] } = {}) {
    const msgSet = new Set((Array.isArray(deleteMsgIds) ? deleteMsgIds : []).map((id) => String(id)).filter(Boolean));
    const userSet = new Set((Array.isArray(deleteUserIds) ? deleteUserIds : []).map((id) => String(id)).filter(Boolean));
    if (msgSet.size === 0 && userSet.size === 0) return 0;

    for (const id of msgSet) {
      this.seenMsgIds.add(id);
      if (this.seenMsgIds.size > 2000) {
        const oldest = this.seenMsgIds.values().next().value;
        this.seenMsgIds.delete(oldest);
      }
    }

    const matches = (entry) => {
      if (!entry) return false;
      if (entry.msgId && msgSet.has(String(entry.msgId))) return true;
      if (entry.userId && userSet.has(String(entry.userId))) return true;
      return false;
    };

    const before = this.queue.length;
    this.queue = this.queue.filter((entry) => !matches(entry));
    let removed = before - this.queue.length;

    if (this.currentItem && matches(this.currentItem)) {
      removed += 1;
      this.skip();
    } else if (removed > 0) {
      this.#notify();
    }

    return removed;
  }

  skip() {
    if (this.currentAbort) {
      try {
        this.currentAbort();
      } catch (err) {
        console.warn('[tts] error al saltar mensaje', err);
      }
      this.currentAbort = null;
    }
  }

  clear() {
    this.queue = [];
    this.prefetchPromises.clear();
    this.skip();
    if (this.soundEngine) {
      this.soundEngine.restore();
    }
    this.#notify();
  }

  mute(muted) {
    this.isMuted = Boolean(muted);
    if (this.isMuted) {
      this.clear();
    } else {
      this.#notify();
    }
  }

  #notify() {
    try {
      this.onStateChange({
        speaking: this.isSpeaking,
        current: this.currentItem,
        queueLength: this.queue.length,
        isMuted: this.isMuted
      });
    } catch {}
  }

  #isFishItem(item) {
    const rawVoiceId = String(item?.voiceId || '');
    return (
      rawVoiceId.startsWith('fish:') ||
      (!rawVoiceId.startsWith('google:') && !rawVoiceId.startsWith('local:') && item?.voiceProvider === 'fish')
    );
  }

  #fishParams(item) {
    const voiceId = String(item?.voiceId || '');
    const referenceId = String(
      item?.referenceId || (voiceId.startsWith('fish:') ? voiceId.slice(5) : '')
    ).trim();
    const speed = item?.speed ?? 1;
    const model = item?.fishModel || undefined;
    const cacheKey = `${item?.fishModel || 'default'}|${referenceId}|${speed}|${item?.text || ''}`;
    return { referenceId, speed, model, cacheKey };
  }

  #isExpiredChat(item, now = Date.now()) {
    return item?.type === 'chat' && !item?.test && item.enqueuedAt > 0 && now - item.enqueuedAt > MAX_CHAT_AGE_MS;
  }

  #prefetchNextFish() {
    if (
      this.isMuted ||
      typeof this.fishSynthesizer !== 'function' ||
      this.queue.length === 0 ||
      this.prefetchPromises.size > 0
    ) {
      return;
    }
    const now = Date.now();
    const next = this.queue.find((candidate) => !this.#isExpiredChat(candidate, now));
    if (!next || next.skipCache || !this.#isFishItem(next)) return;
    const { referenceId, model, cacheKey } = this.#fishParams(next);
    if (!referenceId || this.#getCachedAudio(cacheKey) || this.prefetchPromises.has(cacheKey)) return;

    const cacheGen = this.cacheGen;
    const promise = Promise.resolve()
      .then(() =>
        this.fishSynthesizer({
          text: next.text,
          referenceId,
          model,
          speed: next.speed
        })
      )
      .then((result) => {
        if (!this.isMuted && cacheGen === this.cacheGen && result?.ok && (result.audioBase64 || result.audioUrl)) {
          const src =
            result.audioUrl ||
            `data:${result.contentType || 'audio/mpeg'};base64,${result.audioBase64}`;
          this.#setCachedAudio(cacheKey, src);
        }
        return result;
      })
      .catch((err) => ({ ok: false, error: err?.message || 'Error al sintetizar en Fish Audio' }))
      .finally(() => {
        if (this.prefetchPromises.get(cacheKey) === promise) {
          this.prefetchPromises.delete(cacheKey);
        }
      });

    this.prefetchPromises.set(cacheKey, promise);
  }

  async #process() {
    if (this.isSpeaking || this.queue.length === 0 || this.isMuted) return;

    const now = Date.now();
    let item = null;
    while (this.queue.length > 0) {
      const candidate = this.queue.shift();
      if (this.#isExpiredChat(candidate, now)) continue;
      item = candidate;
      break;
    }
    if (!item) {
      if (this.soundEngine) this.soundEngine.restore();
      this.#notify();
      return;
    }

    this.isSpeaking = true;
    this.currentItem = item;
    this.#notify();

    const rawDuck = Number(item.duckingLevel ?? 0.25);
    const duckLevel = Number.isFinite(rawDuck) ? rawDuck : 0.25;
    const ducking = item.ducking !== false;
    if (ducking && this.soundEngine) {
      this.soundEngine.duck(duckLevel);
    } else if (!ducking && this.soundEngine) {
      this.soundEngine.restore();
    }

    const rawVoiceId = String(item.voiceId || '');
    const resolvedLang =
      item.voiceLanguage ||
      (rawVoiceId.startsWith('google:') ? rawVoiceId.slice(7) : '') ||
      'es-ES';
    const isFish = this.#isFishItem(item);

    try {
      if (this.isMuted) return;
      if (isFish) {
        try {
          await this.#speakFish(item);
        } catch (fishError) {
          console.warn('[tts] Fish Audio falló, intentando voz local', fishError);
          if (!this.isMuted && !fishError?.playbackStarted) {
            this.isPlayingAudio = true;
            this.#prefetchNextFish();
            await this.#speakLocal({
              ...item,
              voiceProvider: 'local',
              voiceId: 'local',
              voiceLanguage: resolvedLang
            });
          }
        }
      } else {
        // Fallback transparente a voz local si una configuración antigua tenía voiceProvider='google' o voiceId='google:...'
        const normalizedItem = rawVoiceId.startsWith('google:')
          ? { ...item, voiceProvider: 'local', voiceId: 'local', voiceLanguage: resolvedLang }
          : { ...item, voiceProvider: 'local', voiceLanguage: resolvedLang };
        this.isPlayingAudio = true;
        this.#prefetchNextFish();
        await this.#speakLocal(normalizedItem);
      }
    } catch (err) {
      console.warn('[tts] error durante la reproducción de voz', err);
    } finally {
      this.isSpeaking = false;
      this.isPlayingAudio = false;
      this.currentItem = null;
      this.currentAbort = null;

      if ((this.queue.length === 0 || this.isMuted) && this.soundEngine) {
        this.soundEngine.restore();
      }
      this.#notify();
      this.#process();
    }
  }

  async #speakFish(item) {
    const { referenceId, model, cacheKey } = this.#fishParams(item);
    if (!referenceId) {
      throw new Error('Falta reference_id de Fish Audio');
    }

    let audioSrc = item.skipCache ? null : this.#getCachedAudio(cacheKey);

    if (!audioSrc) {
      const cacheGen = this.cacheGen;
      const inFlightPrefetch = !item.skipCache ? this.prefetchPromises.get(cacheKey) : null;
      if (!inFlightPrefetch && typeof this.fishSynthesizer !== 'function') {
        throw new Error('Sintetizador de Fish Audio no disponible');
      }

      let aborted = false;
      let resolveAbort = null;
      const abortPromise = new Promise((resolve) => {
        resolveAbort = resolve;
      });
      this.currentAbort = () => {
        aborted = true;
        resolveAbort?.({ __aborted: true });
      };

      const synthPromise =
        inFlightPrefetch ||
        Promise.resolve()
          .then(() =>
            this.fishSynthesizer({
              text: item.text,
              referenceId,
              model,
              speed: item.speed
            })
          )
          .catch((err) => ({ ok: false, error: err?.message || 'Error al sintetizar en Fish Audio' }));

      let result;
      try {
        result = await Promise.race([synthPromise, abortPromise]);
      } finally {
        this.currentAbort = null;
      }

      if (aborted || result?.__aborted || this.isMuted) {
        return;
      }
      if (!result || !result.ok || (!result.audioBase64 && !result.audioUrl)) {
        throw new Error(result?.error || 'Fish Audio no devolvió audio');
      }

      audioSrc =
        result.audioUrl ||
        `data:${result.contentType || 'audio/mpeg'};base64,${result.audioBase64}`;
      if (!item.skipCache && cacheGen === this.cacheGen) {
        this.#setCachedAudio(cacheKey, audioSrc);
      }
    }

    if (this.isMuted) return;
    this.isPlayingAudio = true;
    this.#prefetchNextFish();
    try {
      await this.#playAudioUrl(audioSrc, item.volume, 'No se pudo reproducir audio de Fish Audio');
    } finally {
      this.isPlayingAudio = false;
    }
  }

  #playAudioUrl(url, volume = 0.8, errorMessage = 'No se pudo reproducir audio de TTS') {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      const rawVolume = Number(volume ?? 0.8);
      const safeVolume = Number.isFinite(rawVolume) ? rawVolume : 0.8;
      audio.volume = Math.max(0, Math.min(1, safeVolume));

      let settled = false;
      let started = false;
      let timer = null;

      const onPlaying = () => {
        started = true;
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.currentAbort = null;
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('error', onError);
      };

      const onEnd = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const err = new Error(errorMessage);
        err.playbackStarted = started || Number(audio.currentTime || 0) > 0;
        reject(err);
      };

      this.currentAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          audio.pause();
          audio.src = '';
        } catch {}
        resolve();
      };

      audio.addEventListener('playing', onPlaying, { once: true });
      audio.addEventListener('ended', onEnd, { once: true });
      audio.addEventListener('error', onError, { once: true });

      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          try {
            audio.pause();
            audio.src = '';
          } catch {}
          resolve();
        }
      }, 15_000);

      audio.play().then(
        () => {
          started = true;
        },
        (err) => {
          if (!settled) {
            settled = true;
            cleanup();
            if (err && typeof err === 'object') err.playbackStarted = started;
            reject(err);
          }
        }
      );
    });
  }
  #speakLocal(item) {
    return new Promise((resolve) => {
      if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }

      let settled = false;
      let spoke = false;
      let timer = null;
      let startTimer = null;
      const synth = window.speechSynthesis;

      const utterance = new SpeechSynthesisUtterance(item.text);
      const voices = synth.getVoices() || [];
      const voiceName = item.voiceId?.startsWith('local:')
        ? item.voiceId.slice(6)
        : item.voiceName || '';
      const match = voiceName
        ? voices.find((v) => v.name === voiceName || v.voiceURI === voiceName)
        : null;
      if (match) {
        utterance.voice = match;
        utterance.lang = match.lang;
      } else {
        utterance.lang = item.voiceLanguage || 'es-ES';
      }

      const rawVolume = Number(item.volume ?? 0.8);
      const safeVolume = Number.isFinite(rawVolume) ? rawVolume : 0.8;
      utterance.volume = Math.max(0, Math.min(1, safeVolume));
      this.currentUtterance = utterance;

      const cancelSynth = () => {
        try {
          if (typeof synth.cancel === 'function') {
            synth.cancel();
            this.lastLocalCancelAt = Date.now();
          }
        } catch {}
      };

      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(startTimer);
        utterance.onend = null;
        utterance.onerror = null;
        this.currentAbort = null;
        this.currentUtterance = null;
      };

      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      utterance.onend = done;
      utterance.onerror = (e) => {
        console.warn('[tts:local] error', e);
        done();
      };

      this.currentAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (spoke || synth.speaking || synth.pending) {
          cancelSynth();
        }
        resolve();
      };

      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          cancelSynth();
          resolve();
        }
      }, 15_000);

      const startSpeak = () => {
        if (settled || this.isMuted) {
          done();
          return;
        }
        try {
          if (synth.paused) {
            try {
              synth.resume();
            } catch {}
          }
          spoke = true;
          synth.speak(utterance);
        } catch {
          done();
        }
      };

      if (synth.speaking || synth.pending) {
        cancelSynth();
        startTimer = setTimeout(startSpeak, 40);
      } else {
        const sinceCancel = Date.now() - this.lastLocalCancelAt;
        if (sinceCancel >= 0 && sinceCancel < 40) {
          startTimer = setTimeout(startSpeak, 40 - sinceCancel);
        } else {
          startSpeak();
        }
      }
    });
  }
}
