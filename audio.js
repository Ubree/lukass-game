// ============ audio.js — Web Audio synth: SFX + procedural music ============
// No audio files: everything is synthesized. Unlocks on first user gesture.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = localStorage.getItem('cs_muted') === '1';
    this.theme = null;          // 'sky' | 'lava' | null
    this.step = 0;
    this.nextNoteTime = 0;
    this.schedulerId = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    // soft space via feedback delay on the music bus
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const fb = this.ctx.createGain(); fb.gain.value = 0.25;
    const wet = this.ctx.createGain(); wet.gain.value = 0.35;
    this.musicGain.connect(this.master);
    this.musicGain.connect(delay);
    delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(this.master);

    // shared noise buffer
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._startScheduler();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('cs_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- low-level helpers ----------
  _osc(type, freq, t0, dur, vol, dest, freqEnd, curve) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (curve || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  _noise(t0, dur, vol, dest, filterFreq, filterType) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType || 'lowpass';
    filt.frequency.value = filterFreq || 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---------- SFX ----------
  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const d = this.sfxGain;
    switch (name) {
      case 'jump':
        this._osc('sine', 300, t, 0.25, 0.25, d, 700);
        this._noise(t, 0.15, 0.08, d, 1200, 'highpass');
        break;
      case 'thrust':
        this._noise(t, 0.12, 0.05, d, 900, 'bandpass');
        break;
      case 'slash':
        this._noise(t, 0.16, 0.22, d, 3200, 'bandpass');
        this._osc('sawtooth', 900, t, 0.12, 0.1, d, 200);
        break;
      case 'hit':
        this._osc('square', 220, t, 0.1, 0.3, d, 80);
        this._noise(t, 0.08, 0.2, d, 2500, 'highpass');
        break;
      case 'virusHit':
        this._osc('square', 500, t, 0.12, 0.22, d, 150);
        this._osc('sawtooth', 1200, t + 0.02, 0.1, 0.12, d, 300);
        break;
      case 'hurt':
        this._osc('sawtooth', 300, t, 0.25, 0.3, d, 90);
        this._noise(t, 0.2, 0.15, d, 800, 'lowpass');
        break;
      case 'collect': { // chime arpeggio
        const notes = [660, 880, 1100, 1320];
        notes.forEach((f, i) => this._osc('sine', f, t + i * 0.07, 0.35, 0.22, d));
        break;
      }
      case 'explosion':
        this._noise(t, 0.5, 0.4, d, 900, 'lowpass');
        this._osc('sine', 130, t, 0.4, 0.4, d, 40);
        break;
      case 'laser':
        this._osc('sawtooth', 1400, t, 0.18, 0.14, d, 300);
        break;
      case 'shield':
        this._osc('sine', 500, t, 0.2, 0.15, d, 800);
        break;
      case 'deflect':
        this._osc('triangle', 1200, t, 0.15, 0.25, d, 2200);
        break;
      case 'portal':
        this._osc('sine', 200, t, 1.4, 0.3, d, 900);
        this._osc('sine', 300, t + 0.15, 1.3, 0.2, d, 1350);
        this._noise(t, 1.2, 0.1, d, 600, 'bandpass');
        break;
      case 'checkpoint':
        [523, 659, 784].forEach((f, i) => this._osc('triangle', f, t + i * 0.09, 0.3, 0.2, d));
        break;
      case 'powerup':
        [392, 523, 659, 784, 1046].forEach((f, i) => this._osc('square', f, t + i * 0.08, 0.22, 0.12, d));
        break;
      case 'fanfare':
        [523, 523, 523, 659, 784, 1046].forEach((f, i) => {
          this._osc('square', f, t + i * 0.14, 0.3, 0.14, d);
          this._osc('triangle', f / 2, t + i * 0.14, 0.3, 0.14, d);
        });
        break;
      case 'teleport':
        this._osc('sine', 1200, t, 0.4, 0.25, d, 100);
        this._noise(t, 0.3, 0.12, d, 3000, 'highpass');
        break;
      case 'boing':
        this._osc('sine', 150, t, 0.35, 0.35, d, 450);
        break;
      case 'bubble':
        this._osc('sine', 400, t, 0.2, 0.2, d, 900);
        break;
      case 'pop':
        this._osc('sine', 900, t, 0.08, 0.3, d, 300);
        this._noise(t, 0.06, 0.15, d, 4000, 'highpass');
        break;
      case 'stomp':
        this._osc('sine', 90, t, 0.35, 0.5, d, 35);
        this._noise(t, 0.25, 0.25, d, 400, 'lowpass');
        break;
      case 'warning':
        this._osc('square', 340, t, 0.12, 0.2, d);
        this._osc('square', 340, t + 0.18, 0.12, 0.2, d);
        break;
      case 'drill':
        this._noise(t, 0.5, 0.2, d, 1600, 'bandpass');
        this._osc('sawtooth', 200, t, 0.5, 0.18, d, 260);
        break;
      case 'vacuum':
        this._noise(t, 0.6, 0.18, d, 700, 'bandpass');
        this._osc('sine', 180, t, 0.6, 0.12, d, 320);
        break;
      case 'beep': { // friendly robot voice
        const seq = [660, 520, 720, 600];
        seq.forEach((f, i) => this._osc('square', f + Math.random() * 60, t + i * 0.1, 0.09, 0.1, d));
        break;
      }
      case 'heal':
        [523, 659, 784].forEach((f, i) => this._osc('sine', f, t + i * 0.06, 0.3, 0.18, d));
        break;
      case 'click':
        this._osc('sine', 800, t, 0.06, 0.2, d, 500);
        break;
      case 'trapped':
        this._osc('sine', 700, t, 0.5, 0.15, d, 500);
        break;
    }
  }

  // ---------- music ----------
  setTheme(theme) { // 'sky' | 'lava' | 'boss' | null
    if (this.theme === theme) return;
    this.theme = theme;
    this.step = 0;
    if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.1;
  }

  _startScheduler() {
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.schedulerId = setInterval(() => {
      if (!this.theme || this.muted || this.ctx.state !== 'running') {
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        return;
      }
      const bpm = this.theme === 'sky' ? 92 : (this.theme === 'boss' ? 132 : 116);
      const stepDur = 60 / bpm / 2; // 8th notes
      while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
        this._scheduleStep(this.step, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.step++;
      }
    }, 40);
  }

  _scheduleStep(step, t, stepDur) {
    const g = this.musicGain;
    if (this.theme === 'sky') {
      // dreamy major arpeggios: Cmaj7 / Am7 / Fmaj7 / G6, 16 steps per chord
      const chords = [
        [261.6, 329.6, 392.0, 493.9],
        [220.0, 261.6, 329.6, 392.0],
        [174.6, 220.0, 261.6, 329.6],
        [196.0, 246.9, 293.7, 392.0],
      ];
      const chord = chords[Math.floor(step / 16) % 4];
      const arpNote = chord[[0, 1, 2, 3, 2, 1, 2, 3][step % 8]] * 2;
      this._osc('triangle', arpNote, t, stepDur * 1.8, 0.10, g);
      if (step % 16 === 0) { // pad
        chord.forEach(f => this._osc('sine', f, t, stepDur * 15, 0.045, g));
        this._osc('sine', chord[0] / 2, t, stepDur * 15, 0.07, g);
      }
      if (step % 8 === 4) this._noise(t, 0.05, 0.015, g, 6000, 'highpass'); // gentle tick
    } else if (this.theme === 'lava' || this.theme === 'boss') {
      const boss = this.theme === 'boss';
      // tense minor: Em / C / D / Bm riff
      const roots = [82.4, 65.4, 73.4, 61.7];
      const root = roots[Math.floor(step / 16) % 4];
      // driving bass on every step, accent pattern
      const accent = [1, 0, 0.6, 0, 0.8, 0, 0.6, 0.3][step % 8];
      if (accent > 0) this._osc('sawtooth', root * (step % 8 === 6 ? 1.5 : 1), t, stepDur * 0.9, 0.09 * accent, g, root * 0.99);
      // dark arp
      const minor = [1, 1.189, 1.498, 2];
      const an = root * 4 * minor[[0, 2, 1, 3, 2, 0, 3, 1][step % 8]];
      if (step % 2 === 0) this._osc('square', an, t, stepDur * 0.8, boss ? 0.05 : 0.035, g);
      // hats + kick
      if (step % 4 === 2) this._noise(t, 0.05, 0.03, g, 7000, 'highpass');
      if (step % 8 === 0) { this._osc('sine', 100, t, 0.18, 0.22, g, 40); }
      if (boss && step % 8 === 4) this._noise(t, 0.12, 0.08, g, 1500, 'bandpass'); // snare-ish
    }
  }
}

export const Sfx = new AudioEngine();
