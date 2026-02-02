
import { Gap } from '../types';

export class MultiVoicePlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private isPlaying: boolean = false;
  private sequenceInterval?: number;

  private initContext() {
    if (this.ctx && this.ctx.state !== 'closed') return;
    
    // @ts-ignore
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.reverb = this.ctx.createConvolver();
    
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2.0;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 3);
      }
    }
    this.reverb.buffer = impulse;

    this.masterGain.connect(this.reverb);
    this.reverb.connect(this.ctx.destination);
    
    const dryGain = this.ctx.createGain();
    dryGain.gain.value = 0.4;
    this.masterGain.connect(dryGain);
    dryGain.connect(this.ctx.destination);
    
    this.masterGain.gain.value = 0.6;
  }

  private getNoteFreq(index: number): number {
    const scale = [220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00, 493.88]; 
    const len = scale.length;
    const normalizedIndex = ((Math.floor(index) % len) + len) % len;
    const octaves = Math.floor(index / len);
    const freq = scale[normalizedIndex] * Math.pow(2, octaves);
    return isFinite(freq) && freq > 20 ? freq : 220;
  }

  async playSync(gap: Gap, onEnded: () => void) {
    this.stop();
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(0.6, now + 0.1);

    this.isPlaying = true;
    
    const similarity = isFinite(gap.semanticSimilarity) ? gap.semanticSimilarity : 0.1;
    const distance = isFinite(gap.distance) ? gap.distance : 1.0;
    const centerX = gap.center[0];
    const centerY = gap.center[1];

    const baseTempo = 90 + similarity * 120;
    const stepTime = 60 / baseTempo;
    const rhythmicElasticity = Math.min(0.4, distance / 20);

    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(this.getNoteFreq(centerX) / 2, now);
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.4, now + 1.0);
    bassOsc.connect(bassGain).connect(this.masterGain);
    bassOsc.start();
    this.oscillators.push(bassOsc);

    const harmOsc = this.ctx.createOscillator();
    const harmGain = this.ctx.createGain();
    const harmLFO = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    harmOsc.type = 'triangle';
    harmOsc.frequency.setValueAtTime(this.getNoteFreq(centerY + 4), now);
    harmLFO.frequency.value = 0.5 + Math.abs(centerY);
    lfoGain.gain.value = 0.15;
    harmLFO.connect(lfoGain).connect(harmGain.gain);
    harmGain.gain.setValueAtTime(0.1, now);
    harmOsc.connect(harmGain).connect(this.masterGain);
    harmOsc.start();
    harmLFO.start();
    this.oscillators.push(harmOsc, harmLFO);

    let step = 0;
    const melodyOsc = this.ctx.createOscillator();
    const melodyGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800 + similarity * 4000;
    filter.Q.value = 5;
    melodyOsc.type = 'square';
    melodyGain.gain.value = 0;
    melodyOsc.connect(filter).connect(melodyGain).connect(this.masterGain);
    melodyOsc.start();
    this.oscillators.push(melodyOsc);

    const seedString = gap.sharedLinks.join('') || gap.id;
    
    const playStep = () => {
      if (!this.ctx || !this.isPlaying) return;
      const time = this.ctx.currentTime;
      const charCode = seedString.charCodeAt(step % seedString.length) || 0;
      const freq = this.getNoteFreq(((charCode + step) % 16) + 16);
      
      melodyOsc.frequency.setTargetAtTime(freq, time, 0.01);
      melodyGain.gain.cancelScheduledValues(time);
      melodyGain.gain.setValueAtTime(0, time);
      melodyGain.gain.linearRampToValueAtTime(0.25, time + 0.005);
      melodyGain.gain.exponentialRampToValueAtTime(0.001, time + (stepTime / 2) * 0.7);
      
      step++;
      if (step >= 32) {
        this.stop();
        onEnded();
        return;
      }
      const jitter = (Math.random() - 0.5) * rhythmicElasticity * stepTime;
      const nextDelay = (stepTime / 2) + jitter;
      this.sequenceInterval = window.setTimeout(playStep, nextDelay * 1000);
    };

    playStep();
  }

  stop() {
    this.isPlaying = false;
    if (this.sequenceInterval) clearTimeout(this.sequenceInterval);
    this.oscillators.forEach(osc => { try { osc.stop(); } catch(e) {} });
    this.oscillators = [];
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Renders the gap's audio offline and triggers a download.
   */
  async exportWav(gap: Gap) {
    const similarity = isFinite(gap.semanticSimilarity) ? gap.semanticSimilarity : 0.1;
    const distance = isFinite(gap.distance) ? gap.distance : 1.0;
    const centerX = gap.center[0];
    const centerY = gap.center[1];
    const baseTempo = 90 + similarity * 120;
    const stepTime = 60 / baseTempo;
    const totalDuration = stepTime * 17; // Roughly 32 half-steps

    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * totalDuration, sampleRate);
    
    const masterGain = offlineCtx.createGain();
    const reverb = offlineCtx.createConvolver();
    const length = sampleRate * 2.0;
    const impulse = offlineCtx.createBuffer(2, length, sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 3);
      }
    }
    reverb.buffer = impulse;
    masterGain.connect(reverb).connect(offlineCtx.destination);
    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 0.4;
    masterGain.connect(dryGain).connect(offlineCtx.destination);
    masterGain.gain.setValueAtTime(0, 0);
    masterGain.gain.linearRampToValueAtTime(0.6, 0.1);

    // Bass
    const bassOsc = offlineCtx.createOscillator();
    const bassGain = offlineCtx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(this.getNoteFreq(centerX) / 2, 0);
    bassGain.gain.setValueAtTime(0, 0);
    bassGain.gain.linearRampToValueAtTime(0.4, 1.0);
    bassOsc.connect(bassGain).connect(masterGain);
    bassOsc.start(0);

    // Harmony
    const harmOsc = offlineCtx.createOscillator();
    const harmGain = offlineCtx.createGain();
    const harmLFO = offlineCtx.createOscillator();
    const lfoGain = offlineCtx.createGain();
    harmOsc.type = 'triangle';
    harmOsc.frequency.setValueAtTime(this.getNoteFreq(centerY + 4), 0);
    harmLFO.frequency.value = 0.5 + Math.abs(centerY);
    lfoGain.gain.value = 0.15;
    harmLFO.connect(lfoGain).connect(harmGain.gain);
    harmGain.gain.setValueAtTime(0.1, 0);
    harmOsc.connect(harmGain).connect(masterGain);
    harmOsc.start(0);
    harmLFO.start(0);

    // Melody
    const melodyOsc = offlineCtx.createOscillator();
    const melodyGain = offlineCtx.createGain();
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800 + similarity * 4000;
    filter.Q.value = 5;
    melodyOsc.type = 'square';
    melodyGain.gain.value = 0;
    melodyOsc.connect(filter).connect(melodyGain).connect(masterGain);
    melodyOsc.start(0);

    const seedString = gap.sharedLinks.join('') || gap.id;
    const rhythmicElasticity = Math.min(0.4, distance / 20);
    let currentTime = 0;
    for(let step=0; step<32; step++) {
      const charCode = seedString.charCodeAt(step % seedString.length) || 0;
      const freq = this.getNoteFreq(((charCode + step) % 16) + 16);
      melodyOsc.frequency.setValueAtTime(freq, currentTime);
      melodyGain.gain.setValueAtTime(0, currentTime);
      melodyGain.gain.linearRampToValueAtTime(0.25, currentTime + 0.005);
      melodyGain.gain.exponentialRampToValueAtTime(0.001, currentTime + (stepTime / 2) * 0.7);
      
      const jitter = (Math.random() - 0.5) * rhythmicElasticity * stepTime;
      currentTime += (stepTime / 2) + jitter;
    }

    masterGain.gain.setTargetAtTime(0, currentTime, 0.5);

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = this.bufferToWav(renderedBuffer);
    const url = URL.createObjectURL(wavBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Gap_${gap.from.title}_to_${gap.to.title}.wav`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const outBuffer = new ArrayBuffer(length);
    const view = new DataView(outBuffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);         // length
    setUint16(1);          // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);         // 16-bit
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return new Blob([outBuffer], { type: 'audio/wav' });
  }
}
