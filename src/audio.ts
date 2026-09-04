export class CityAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private music?: HTMLAudioElement;
  private muted = false;

  start(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.master.gain.value = 1;
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
    if (!this.music) {
      this.music = new Audio(`${import.meta.env.BASE_URL}audio/main.mp3`);
      this.music.loop = true;
      this.music.volume = 0.7;
      this.music.preload = "auto";
    }
    this.music.muted = this.muted;
    void this.music.play();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, 0.04);
    }
    if (this.music) this.music.muted = this.muted;
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

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = frequency,
  ): void {
    const output = this.sfxBus;
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
}
