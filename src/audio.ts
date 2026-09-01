export class CityAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private timer?: number;
  private step = 0;
  private muted = false;

  start(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.master.gain.value = 1;
      this.musicBus.gain.value = 0.7;
      this.sfxBus.gain.value = 1;
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
    if (this.timer) return;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 165);
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, 0.04);
    }
    return this.muted;
  }

  pickup(high = false): void {
    this.tone(high ? 880 : 520, 0.08, "sine", 0.14);
    window.setTimeout(() => this.tone(high ? 1175 : 660, 0.1, "triangle", 0.1), 55);
  }

  hit(): void {
    this.tone(95, 0.22, "sawtooth", 0.22, 45);
  }

  victory(): void {
    [440, 554, 659, 880].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.16, "triangle", 0.13), index * 70);
    });
  }

  private tick(): void {
    const bass = [131, 165, 196, 165, 147, 175, 220, 175];
    const melody = [659, 784, 880, 784, 587, 659, 784, 988, 880, 784, 659, 587, 659, 784, 587, 523];
    const index = this.step % melody.length;
    if (index % 2 === 0) this.tone(bass[(index / 2) % bass.length], 0.22, "sine", 0.18, undefined, "music");
    this.tone(melody[index], 0.09, index % 4 === 3 ? "sine" : "triangle", 0.14, undefined, "music");
    if (index % 4 === 2) this.tone(melody[index] / 2, 0.055, "triangle", 0.07, undefined, "music");
    if (index === 7 || index === 15) this.noise(0.025, "music");
    this.step += 1;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = frequency,
    channel: "music" | "sfx" = "sfx",
  ): void {
    const output = channel === "music" ? this.musicBus : this.sfxBus;
    if (!this.context || !output || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private noise(duration: number, channel: "music" | "sfx" = "sfx"): void {
    const output = channel === "music" ? this.musicBus : this.sfxBus;
    if (!this.context || !output || this.muted) return;
    const frames = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.08, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    source.connect(gain).connect(output);
    source.start();
  }
}
