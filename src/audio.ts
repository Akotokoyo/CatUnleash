export class CityAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private music?: HTMLAudioElement;
  private samples = new Map<string, AudioBuffer>();
  private loadingSamples = new Set<string>();
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
      void this.loadSample("meow", `${import.meta.env.BASE_URL}audio/cat-meow.ogg`);
      void this.loadSample("bark", `${import.meta.env.BASE_URL}audio/dog-bark.ogg`);
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

  meow(): void {
    this.playSample("meow");
  }

  bark(): void {
    this.playSample("bark");
  }

  gameOver(): void {
    [392, 330, 262, 196].forEach((frequency, index) => {
      window.setTimeout(
        () => this.tone(frequency, index === 3 ? 0.38 : 0.18, "triangle", 0.17, frequency * 0.82),
        index * 145,
      );
    });
  }

  hit(): void {
    this.tone(95, 0.22, "sawtooth", 0.22, 45);
  }

  victory(): void {
    [440, 554, 659, 880].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.16, "triangle", 0.13), index * 70);
    });
  }

  private async loadSample(name: string, path: string): Promise<void> {
    if (!this.context || this.samples.has(name) || this.loadingSamples.has(name)) return;
    this.loadingSamples.add(name);
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      this.samples.set(name, await this.context.decodeAudioData(buffer));
    } catch (error) {
      console.warn(`Impossibile caricare l'effetto audio ${name}.`, error);
    } finally {
      this.loadingSamples.delete(name);
    }
  }

  private playSample(name: string): void {
    const buffer = this.samples.get(name);
    if (!this.context || !this.sfxBus || !buffer || this.muted) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = 1;
    source.connect(gain).connect(this.sfxBus);
    source.start();
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
