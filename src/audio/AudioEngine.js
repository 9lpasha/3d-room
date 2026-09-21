export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.humNodes = [];
    this.unlocked = false;
  }

  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.unlocked = true;
  }

  playBoot() {
    if (!this.ctx) {
      return;
    }

    const t = this.ctx.currentTime;
    this.playClick(t);
    this.playThump(t + 0.05);
    this.playCharge(t + 0.12);
    this.startHum(t + 0.2);
    this.playPop(t + 0.58);
  }

  playClick(time) {
    const noise = this.makeNoiseSource(0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.55, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  playThump(time) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(78, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.7, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.34);
  }

  playCharge(time) {
    const noise = this.makeNoiseSource(0.7);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, time);
    filter.frequency.exponentialRampToValueAtTime(2400, time + 0.55);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.68);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.7);
  }

  startHum(time) {
    this.stopHum();

    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, time);
    humGain.gain.exponentialRampToValueAtTime(0.045, time + 0.8);
    humGain.connect(this.master);

    const tones = [60, 120, 180];
    for (const freq of tones) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const voice = this.ctx.createGain();
      voice.gain.value = freq === 60 ? 1 : 0.35;
      osc.connect(voice);
      voice.connect(humGain);
      osc.start(time);
      this.humNodes.push(osc);
    }

    this.humNodes.push(humGain);
  }

  playPop(time) {
    const noise = this.makeNoiseSource(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.22, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.08);
  }

  stopHum() {
    for (const node of this.humNodes) {
      try {
        if (node.stop) {
          node.stop();
        }
        node.disconnect();
      } catch {
        // already stopped
      }
    }
    this.humNodes = [];
  }

  makeNoiseSource(duration) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }
}
