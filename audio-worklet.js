class SignalFrames extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.total = 0;
    this.peak = 0;
    this.frameSize = Math.round(sampleRate * .02);
    this.step = Math.round(sampleRate * .01);
    this.nextFrame = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      this.samples.push(sample);
      this.peak = Math.min(1, Math.max(this.peak, Math.abs(sample)));
      this.total++;
      if (this.total >= this.nextFrame + this.frameSize) {
        let energy = 0;
        const start = this.samples.length - this.frameSize;
        for (let j = start; j < this.samples.length; j++) energy += this.samples[j] ** 2;
        this.port.postMessage({ rms: Math.sqrt(energy / this.frameSize), peak: this.peak, samples: this.total, sampleRate });
        this.nextFrame += this.step;
        this.samples.splice(0, this.step);
      }
    }
    return true;
  }
}
registerProcessor('signal-frames', SignalFrames);
