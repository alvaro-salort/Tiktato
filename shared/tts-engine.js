export const GOOGLE_TTS_API_KEY = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

export function buildGoogleTTSUrl(text, lang = 'es-ES') {
  const safeLang = encodeURIComponent(lang || 'es-ES');
  const safeText = encodeURIComponent(String(text || '').slice(0, 300));
  return `https://www.google.com/speech-api/v2/synthesize?key=${GOOGLE_TTS_API_KEY}&enc=mpeg&lang=${safeLang}&text=${safeText}`;
}

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

    // Descarta mensajes que sean solo signos o sin contenido inteligible
    if (!/[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/.test(clean)) {
      return '';
    }
  }

  // Límite de caracteres
  const limit = Math.max(10, Math.min(500, Number(maxChars) || 120));
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

export class TTSQueue {
  constructor({ soundEngine = null, onStateChange = null, maxQueueSize = 5 } = {}) {
    this.soundEngine = soundEngine;
    this.onStateChange = onStateChange || (() => {});
    this.maxQueueSize = Math.max(1, Number(maxQueueSize) || 5);
    this.queue = [];
    this.seenMsgIds = new Set();
    this.isSpeaking = false;
    this.currentItem = null;
    this.currentAbort = null;
    this.isMuted = false;
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
      maxChars: item.maxChars || 120
    });
    if (!cleanText) return;

    this.queue.push({
      ...item,
      msgId,
      userId: item.userId ? String(item.userId) : '',
      text: cleanText,
      id: item.id || `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    });

    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }

    this.#notify();
    this.#process();
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

  async #process() {
    if (this.isSpeaking || this.queue.length === 0 || this.isMuted) return;
    this.isSpeaking = true;
    const item = this.queue.shift();
    this.currentItem = item;
    this.#notify();

    const ducking = item.ducking !== false;
    if (ducking && this.soundEngine) {
      this.soundEngine.duck(item.duckingLevel ?? 0.25);
    } else if (!ducking && this.soundEngine) {
      this.soundEngine.restore();
    }

    const voiceId = item.voiceId || (item.voiceProvider === 'google' ? 'google:es-ES' : 'local');
    const isGoogle = voiceId.startsWith('google:') || (!voiceId.startsWith('local:') && item.voiceProvider === 'google');

    try {
      if (isGoogle) {
        const googleLang = voiceId.startsWith('google:') ? voiceId.slice(7) : (item.voiceLanguage || 'es-ES');
        try {
          await this.#speakGoogle({ ...item, voiceLanguage: googleLang });
        } catch (googleError) {
          console.warn('[tts] Google Speech API v2 falló, intentando voz local', googleError);
          await this.#speakLocal({ ...item, voiceLanguage: googleLang });
        }
      } else {
        await this.#speakLocal(item);
      }
    } catch (err) {
      console.warn('[tts] error durante la reproducción de voz', err);
    } finally {
      this.isSpeaking = false;
      this.currentItem = null;
      this.currentAbort = null;

      if (this.queue.length === 0 && this.soundEngine) {
        this.soundEngine.restore();
      }
      this.#notify();
      this.#process();
    }
  }

  #speakGoogle(item) {
    return new Promise((resolve, reject) => {
      const url = buildGoogleTTSUrl(item.text, item.voiceLanguage || 'es-ES');
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, Number(item.volume ?? 0.8)));

      let settled = false;
      let timer = null;

      const cleanup = () => {
        clearTimeout(timer);
        this.currentAbort = null;
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('error', onError);
      };

      const onEnd = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = (e) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('No se pudo reproducir audio de Google TTS'));
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

      audio.play().catch((err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  #speakLocal(item) {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }

      let settled = false;
      let timer = null;
      const synth = window.speechSynthesis;

      const cleanup = () => {
        clearTimeout(timer);
        this.currentAbort = null;
        this.currentUtterance = null;
      };

      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const utterance = new SpeechSynthesisUtterance(item.text);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices() || [];
        const voiceName = item.voiceId?.startsWith('local:')
          ? item.voiceId.slice(6)
          : item.voiceName || '';
        const match = voices.find((v) => v.name === voiceName || v.voiceURI === voiceName);
        if (match) {
          utterance.voice = match;
          utterance.lang = match.lang;
        } else {
          utterance.lang = item.voiceLanguage || 'es-ES';
        }
      } else {
        utterance.lang = item.voiceLanguage || 'es-ES';
      }
      utterance.volume = Math.max(0, Math.min(1, Number(item.volume ?? 0.8)));
      this.currentUtterance = utterance;

      utterance.onend = done;
      utterance.onerror = (e) => {
        console.warn('[tts:local] error', e);
        done();
      };

      this.currentAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          synth.cancel();
        } catch {}
        resolve();
      };

      timer = setTimeout(() => {
        if (!settled) {
          try {
            synth.cancel();
          } catch {}
          done();
        }
      }, 15_000);

      try {
        if (synth.paused) {
          try {
            synth.resume();
          } catch {}
        }
        synth.speak(utterance);
      } catch (err) {
        done();
      }
    });
  }
}
