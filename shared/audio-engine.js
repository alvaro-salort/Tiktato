export const BUILTIN_SOUNDS = [
  { id: 'builtin:coin', name: 'Moneda', description: 'Ding-ding clásico de donación', emoji: '🪙' },
  { id: 'builtin:chime', name: 'Campanilla', description: 'Arpegio suave para follows', emoji: '🔔' },
  { id: 'builtin:pop', name: 'Pop', description: 'Un pop corto y limpio', emoji: '🫧' },
  { id: 'builtin:sparkle', name: 'Destello', description: 'Chispas brillantes', emoji: '✨' },
  { id: 'builtin:horn', name: 'Fanfarria', description: 'Para regalos grandes', emoji: '📣' },
  { id: 'builtin:drum', name: 'Redoble', description: 'Redoble de tambor', emoji: '🥁' }
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
    this.activeNodes = new Set();
    this.activeAudio = new Set();
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

  async #playOne(sound, volume) {
    if (!sound) return;
    await this.unlock();
    if (!this.context) return;

    if (sound.kind === 'file' && sound.url) {
      await this.#playFile(sound.url, volume);
      return;
    }

    await this.#playBuiltin(sound.key || String(sound.id || '').replace('builtin:', ''), volume);
  }

  async #playFile(url, volume) {
    await new Promise((resolve) => {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      this.activeAudio.add(audio);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.activeAudio.delete(audio);
        resolve();
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      audio.play().catch(finish);
    });
  }

  async #playBuiltin(key, volume) {
    const ctx = this.context;
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(ctx.destination);
    this.activeNodes.add(master);

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
    for (const audio of this.activeAudio) {
      try {
        audio.pause();
      } catch {
        // Ignorado: el elemento ya terminó.
      }
    }
    this.activeAudio.clear();
    for (const node of this.activeNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignorado: el nodo ya terminó.
      }
    }
    this.activeNodes.clear();
  }
}
