export const BUILTIN_SOUNDS = [
  { id: 'builtin:coin', name: 'Moneda', description: 'Ding-ding clásico de donación' },
  { id: 'builtin:chime', name: 'Campanilla', description: 'Arpegio suave para follows' },
  { id: 'builtin:pop', name: 'Pop', description: 'Un pop corto y limpio' },
  { id: 'builtin:sparkle', name: 'Destello', description: 'Chispas brillantes' },
  { id: 'builtin:horn', name: 'Fanfarria', description: 'Para regalos grandes' },
  { id: 'builtin:drum', name: 'Redoble', description: 'Redoble de tambor' }
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function note(ctx, destination, frequency, start, duration, type = 'sine', gain = 0.22) {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export class SoundEngine {
  constructor() {
    this.context = null;
    this.queue = Promise.resolve();
    this.activeNodes = new Map();
    this.activeAudio = new Map();
    this.isDucked = false;
    this.duckFactor = 0.25;
  }

  duck(factor = 0.25) {
    this.isDucked = true;
    this.duckFactor = Math.max(0, Math.min(1, Number(factor) || 0.25));
    for (const [audio, baseVol] of this.activeAudio.entries()) {
      try {
        audio.volume = Math.max(0, Math.min(1, baseVol * this.duckFactor));
      } catch {}
    }
    for (const [node, baseVol] of this.activeNodes.entries()) {
      try {
        if (this.context) {
          node.gain.setValueAtTime(node.gain.value, this.context.currentTime);
          node.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, baseVol * this.duckFactor)), this.context.currentTime + 0.05);
        } else {
          node.gain.value = Math.max(0, Math.min(1, baseVol * this.duckFactor));
        }
      } catch {}
    }
  }

  restore() {
    this.isDucked = false;
    for (const [audio, baseVol] of this.activeAudio.entries()) {
      try {
        audio.volume = Math.max(0, Math.min(1, baseVol));
      } catch {}
    }
    for (const [node, baseVol] of this.activeNodes.entries()) {
      try {
        if (this.context) {
          node.gain.setValueAtTime(node.gain.value, this.context.currentTime);
          node.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, baseVol)), this.context.currentTime + 0.08);
        } else {
          node.gain.value = Math.max(0, Math.min(1, baseVol));
        }
      } catch {}
    }
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    return this.context.state === 'running';
  }

  play(sound, volume = 1) {
    const item = { sound, volume: Math.max(0, Math.min(2, Number(volume) || 0)) };
    this.queue = this.queue
      .then(() => this.#playOne(item.sound, item.volume))
      .catch((error) => console.warn('[audio] no se pudo reproducir', error));
    return this.queue;
  }

  async preview(sound, volume = 1) {
    if (!sound) return;
    this.stopAll();
    const safeVolume = Math.max(0, Math.min(2, Number(volume) || 0));
    await this.unlock();

    if (sound.kind === 'file' && sound.url) {
      await this.#startFile(sound.url, safeVolume, { waitForEnd: false });
      return;
    }

    if (!this.context) throw new Error('Audio no disponible.');
    this.#playBuiltin(sound.key || String(sound.id || '').replace('builtin:', ''), safeVolume).catch(
      (error) => console.warn('[audio] error en vista previa', error)
    );
  }

  async #playOne(sound, volume) {
    if (!sound) return;
    await this.unlock();

    if (sound.kind === 'file' && sound.url) {
      await this.#startFile(sound.url, volume, { waitForEnd: true });
      return;
    }

    if (!this.context) return;
    await this.#playBuiltin(sound.key || String(sound.id || '').replace('builtin:', ''), volume);
  }

  async #startFile(url, volume, { waitForEnd = true } = {}) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    const baseVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    const effectiveVolume = this.isDucked
      ? Math.max(0, Math.min(1, baseVolume * this.duckFactor))
      : baseVolume;
    audio.volume = effectiveVolume;
    this.activeAudio.set(audio, baseVolume);

    const cleanup = () => {
      this.activeAudio.delete(audio);
    };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });

    if (!waitForEnd) {
      try {
        await audio.play();
      } catch (error) {
        cleanup();
        throw new Error('No se pudo reproducir el archivo de audio.');
      }
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err && !audio.__stoppedByUser) reject(err);
        else resolve();
      };
      audio.addEventListener('ended', () => done(), { once: true });
      audio.addEventListener(
        'error',
        () => done(new Error('No se pudo cargar o reproducir el archivo de audio.')),
        { once: true }
      );
      audio.play().catch((err) => done(err));
    });
  }

  async #playBuiltin(key, volume) {
    const ctx = this.context;
    const master = ctx.createGain();
    const baseVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    const effectiveVolume = this.isDucked
      ? Math.max(0, Math.min(1, baseVolume * this.duckFactor))
      : baseVolume;
    master.gain.value = effectiveVolume;
    master.connect(ctx.destination);
    this.activeNodes.set(master, baseVolume);

    const now = ctx.currentTime + 0.01;
    const safe = (frequency, duration, type, gain) =>
      note(ctx, master, frequency, now, duration, type, gain);

    switch (key) {
      case 'chime':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          note(ctx, master, frequency, now + index * 0.085, 0.28, 'triangle', 0.16);
        });
        await wait(650);
        break;
      case 'pop':
        safe(180, 0.16, 'sine', 0.35);
        await wait(180);
        break;
      case 'sparkle':
        [1318.5, 1568, 2093, 2637].forEach((frequency, index) => {
          note(ctx, master, frequency, now + index * 0.055, 0.18, 'triangle', 0.12);
        });
        await wait(520);
        break;
      case 'horn':
        [261.63, 329.63, 392, 523.25].forEach((frequency) => {
          note(ctx, master, frequency, now, 0.55, 'sawtooth', 0.08);
        });
        note(ctx, master, 783.99, now + 0.2, 0.45, 'sawtooth', 0.06);
        await wait(800);
        break;
      case 'drum': {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.55, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) {
          const decay = Math.exp(-index / (ctx.sampleRate * 0.12));
          data[index] = (Math.random() * 2 - 1) * decay * 0.35;
        }
        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(master);
        source.start(now);
        source.stop(now + 0.55);
        await wait(600);
        break;
      }
      case 'coin':
      default:
        safe(987.77, 0.12, 'sine', 0.28);
        note(ctx, master, 1318.51, now + 0.09, 0.2, 'sine', 0.24);
        await wait(330);
        break;
    }

    this.activeNodes.delete(master);
    try {
      master.disconnect();
    } catch {
      // El nodo ya puede estar desconectado.
    }
  }

  stopAll() {
    for (const [audio] of this.activeAudio.entries()) {
      try {
        audio.__stoppedByUser = true;
        audio.pause();
        audio.dispatchEvent(new Event('ended'));
      } catch {
        // Ignorado: el elemento ya terminó.
      }
    }
    this.activeAudio.clear();
    for (const [node] of this.activeNodes.entries()) {
      try {
        node.disconnect();
      } catch {
        // Ignorado: el nodo ya terminó.
      }
    }
    this.activeNodes.clear();
  }
}
