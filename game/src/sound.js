// VOLTGRID — WebAudio sound synthesis. Nothing is loaded from disk or the network:
// every effect is a short stack of oscillators plus a generated noise buffer.

/** Per-sound minimum gap, so a burst of shots cannot stack into clipping. */
const THROTTLE = {
  'shoot:pulse': 0.045,
  'shoot:arc': 0.07,
  'shoot:rail': 0.09,
  impact: 0.04,
  explosion: 0.045,
  leak: 0.09,
  build: 0.08,
  upgrade: 0.1,
  sell: 0.1,
  waveStart: 0.25,
  waveClear: 0.3,
  victory: 0.6,
  defeat: 0.6,
  deny: 0.12,
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseState = 0x9e3779b9;
    this.lastPlayed = Object.create(null);
    this.enabled = true;
  }

  /** Create (or resume) the AudioContext. Must be called from a user gesture the first time. */
  unlock() {
    if (this.ctx === null) {
      const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (Ctor === undefined || Ctor === null) return;
      try {
        this.ctx = new Ctor();
      } catch (err) {
        this.ctx = null;
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      const resumed = this.ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
  }

  /** Flip sound on or off; returns the new enabled state. */
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    return this.enabled;
  }

  /** Play one named effect, silently ignoring unknown names. */
  play(name) {
    if (!this.enabled) return;
    if (this.ctx === null) this.unlock();
    if (this.ctx === null || this.ctx.state !== 'running' || this.master === null) return;
    const now = this.ctx.currentTime;
    const gap = THROTTLE[name] ?? 0.03;
    const last = this.lastPlayed[name];
    if (typeof last === 'number' && now - last < gap) return;
    this.lastPlayed[name] = now;
    switch (name) {
      case 'shoot:pulse':
        this.tone({ freq: 920, slide: 540, dur: 0.09, type: 'triangle', gain: 0.13 });
        this.noise({ dur: 0.03, gain: 0.05, freq: 2600, type: 'highpass' });
        break;
      case 'shoot:arc':
        this.tone({ freq: 190, slide: 1500, dur: 0.13, type: 'sawtooth', gain: 0.1 });
        this.noise({ dur: 0.1, gain: 0.07, freq: 2100, q: 4, type: 'bandpass' });
        break;
      case 'shoot:rail':
        this.tone({ freq: 150, slide: 58, dur: 0.24, type: 'square', gain: 0.16 });
        this.noise({ dur: 0.16, gain: 0.11, freq: 900, type: 'lowpass' });
        break;
      case 'impact':
        this.tone({ freq: 260, slide: 140, dur: 0.05, type: 'square', gain: 0.07 });
        this.noise({ dur: 0.035, gain: 0.06, freq: 1800, type: 'highpass' });
        break;
      case 'explosion':
        this.noise({ dur: 0.32, gain: 0.2, freq: 620, slide: 90, type: 'lowpass' });
        this.tone({ freq: 110, slide: 38, dur: 0.28, type: 'triangle', gain: 0.16 });
        break;
      case 'leak':
        this.tone({ freq: 320, slide: 70, dur: 0.3, type: 'square', gain: 0.14 });
        this.noise({ dur: 0.2, gain: 0.14, freq: 420, type: 'lowpass' });
        break;
      case 'build':
        this.tone({ freq: 430, dur: 0.07, type: 'triangle', gain: 0.13 });
        this.tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.12, delay: 0.07 });
        this.noise({ dur: 0.05, gain: 0.05, freq: 1500, type: 'highpass' });
        break;
      case 'upgrade':
        this.tone({ freq: 523, dur: 0.08, type: 'triangle', gain: 0.1 });
        this.tone({ freq: 659, dur: 0.08, type: 'triangle', gain: 0.1, delay: 0.07 });
        this.tone({ freq: 784, dur: 0.08, type: 'triangle', gain: 0.1, delay: 0.14 });
        this.tone({ freq: 1046, dur: 0.14, type: 'sine', gain: 0.11, delay: 0.21 });
        break;
      case 'sell':
        this.tone({ freq: 760, slide: 520, dur: 0.1, type: 'triangle', gain: 0.11 });
        this.tone({ freq: 420, dur: 0.1, type: 'sine', gain: 0.09, delay: 0.09 });
        break;
      case 'waveStart':
        this.tone({ freq: 84, slide: 190, dur: 0.55, type: 'sawtooth', gain: 0.12 });
        this.tone({ freq: 420, dur: 0.08, type: 'square', gain: 0.06, delay: 0.02 });
        break;
      case 'waveClear':
        this.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.1 });
        this.tone({ freq: 523, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.1 });
        this.tone({ freq: 659, dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.2 });
        break;
      case 'victory':
        this.chord([523, 659, 784, 1046], 0.22, 0.09, 'triangle', 0.28);
        this.chord([659, 784, 1046, 1318], 0.5, 0.07, 'sine', 0.42);
        break;
      case 'defeat':
        this.chord([220, 175, 139, 98], 0.42, 0.1, 'sawtooth', 0.1);
        this.noise({ dur: 0.8, gain: 0.14, freq: 200, slide: 60, type: 'lowpass', delay: 0.1 });
        break;
      case 'deny':
        this.tone({ freq: 128, slide: 96, dur: 0.09, type: 'square', gain: 0.09 });
        break;
      default:
        break;
    }
  }

  /** A short note. */
  tone(options) {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const freq = options.freq;
    const dur = options.dur ?? 0.12;
    const type = options.type ?? 'sine';
    const gain = options.gain ?? 0.12;
    const delay = options.delay ?? 0;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), start);
    if (typeof options.slide === 'number') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.slide), start + dur);
    }
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0003, gain), start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env);
    env.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  /** A burst of generated white noise through one filter. */
  noise(options) {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const dur = options.dur ?? 0.15;
    const gain = options.gain ?? 0.12;
    const delay = options.delay ?? 0;
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = this.noiseState;
    for (let i = 0; i < length; i++) {
      state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      data[i] = (state / 2147483648 - 1) * 0.9;
    }
    this.noiseState = state;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type ?? 'lowpass';
    filter.frequency.setValueAtTime(Math.max(20, options.freq ?? 900), start);
    if (typeof options.slide === 'number') {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.slide), start + dur);
    }
    filter.Q.value = options.q ?? 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0003, gain), start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    source.start(start);
    source.stop(start + dur + 0.02);
  }

  /** Notes played in sequence, each a little later than the last. */
  chord(freqs, dur, step, type, gain) {
    for (let i = 0; i < freqs.length; i++) {
      this.tone({ freq: freqs[i], dur: dur, type: type, gain: gain, delay: i * step });
    }
  }
}
