// WebAudio sound engine: every effect is synthesised from oscillators, so the
// game ships no audio files and still has shots, chains, booms and UI blips.

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  /** The AudioContext is created lazily on the first user gesture. */
  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.35 : 0;
    return this.enabled;
  }

  /** One enveloped oscillator blip. */
  blip({ freq = 440, end = null, type = 'square', dur = 0.09, vol = 0.5, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst, for explosions. */
  noise({ dur = 0.25, vol = 0.5, freq = 900, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const size = Math.ceil(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot(kind) {
    if (kind === 'pulse') this.blip({ freq: 780, end: 320, type: 'square', dur: 0.07, vol: 0.18 });
    else if (kind === 'arc') this.blip({ freq: 220, end: 1900, type: 'sawtooth', dur: 0.12, vol: 0.2 });
    else this.blip({ freq: 160, end: 60, type: 'sawtooth', dur: 0.22, vol: 0.3 });
  }

  hit() { this.blip({ freq: 300, end: 180, type: 'triangle', dur: 0.05, vol: 0.14 }); }

  kill() { this.noise({ dur: 0.18, vol: 0.22, freq: 700 }); }

  build() { this.blip({ freq: 300, end: 620, type: 'triangle', dur: 0.14, vol: 0.3 }); }

  upgrade() {
    this.blip({ freq: 440, end: 660, type: 'square', dur: 0.09, vol: 0.22 });
    this.blip({ freq: 660, end: 880, type: 'square', dur: 0.1, vol: 0.22, delay: 0.09 });
  }

  sell() { this.blip({ freq: 500, end: 240, type: 'triangle', dur: 0.12, vol: 0.22 }); }

  leak() { this.blip({ freq: 200, end: 90, type: 'square', dur: 0.25, vol: 0.35 }); }

  waveStart() {
    this.blip({ freq: 330, type: 'square', dur: 0.1, vol: 0.25 });
    this.blip({ freq: 440, type: 'square', dur: 0.1, vol: 0.25, delay: 0.11 });
    this.blip({ freq: 550, type: 'square', dur: 0.14, vol: 0.25, delay: 0.22 });
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.blip({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.13 }));
  }

  defeat() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this.blip({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.28, delay: i * 0.16 }));
  }

  click() { this.blip({ freq: 620, type: 'square', dur: 0.04, vol: 0.14 }); }
}
