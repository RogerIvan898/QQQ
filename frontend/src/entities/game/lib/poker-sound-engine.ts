import { canPlaySound, getAudioContext } from 'shared/lib/audio';

import { ACTION_SOUND_RECIPES } from './constants';
import type { PokerSoundAction } from './types';

class PokerSoundEngine {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;

  private masterVolume = 0.65;

  init(context = getAudioContext()) {
    if (this.context) {
      return true;
    }

    this.context = context;
    this.masterGain = context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(context.destination);

    const length = context.sampleRate * 0.5;
    this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    return true;
  }

  async resume() {
    if (!this.context) {
      this.init();
    }

    if (this.context && this.context.state !== 'running') {
      await this.context.resume();
    }
  }

  setVolume(value: number) {
    this.masterVolume = Math.max(0, Math.min(1, value));

    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(
        this.masterVolume,
        this.context.currentTime,
        0.01
      );
    }
  }

  playSingleClick(pitchOffset = 1, volume = 1, isSoft = false, delay = 0) {
    if (!this.context || !this.masterGain || !this.noiseBuffer) {
      return;
    }

    const time = this.context.currentTime + 0.01 + delay;
    const osc = this.context.createOscillator();
    const oscGain = this.context.createGain();
    osc.type = 'sine';

    const startFreq = isSoft ? 350 : 800 * pitchOffset;
    const endFreq = isSoft ? 80 : 100 * pitchOffset;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.02);

    oscGain.gain.setValueAtTime(0, time);
    oscGain.gain.linearRampToValueAtTime(1.0 * volume, time + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(
      0.001,
      time + (isSoft ? 0.05 : 0.035)
    );

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.06);

    if (!isSoft) {
      const noiseSrc = this.context.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;

      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 4000;

      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0, time);
      noiseGain.gain.linearRampToValueAtTime(0.35 * volume, time + 0.001);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSrc.start(time);
      noiseSrc.stop(time + 0.02);
    }
  }

  playSingleSwoosh() {
    if (!this.context || !this.masterGain || !this.noiseBuffer) {
      return;
    }

    const time = this.context.currentTime + 0.01;
    const noiseSrc = this.context.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.03);
    gain.gain.linearRampToValueAtTime(0, time + 0.12);

    noiseSrc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noiseSrc.start(time);
    noiseSrc.stop(time + 0.12);
  }

  playRumble(delay = 0) {
    if (!this.context || !this.masterGain || !this.noiseBuffer) {
      return;
    }

    const context = this.context;
    const destination = this.masterGain;
    const time = context.currentTime + 0.01 + delay;

    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(64, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.28);

    const oscillatorGain = context.createGain();
    oscillatorGain.gain.setValueAtTime(0.0001, time);
    oscillatorGain.gain.linearRampToValueAtTime(0.24, time + 0.016);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);

    oscillator.connect(oscillatorGain);
    oscillatorGain.connect(destination);

    oscillator.start(time);
    oscillator.stop(time + 0.36);

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, time);
    filter.frequency.exponentialRampToValueAtTime(90, time + 0.29);

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.linearRampToValueAtTime(0.07, time + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.31);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    noiseSource.start(time);
    noiseSource.stop(time + 0.33);
  }

  async playAction(action: PokerSoundAction) {
    if (!canPlaySound()) {
      return;
    }

    try {
      if (!this.context) {
        this.init();
      }

      // Awaiting resume() would release every queued action at the same
      // instant once audio unlocks; skip sounds until the context runs.
      if (this.context?.state !== 'running') {
        await this.resume();
        return;
      }

      const recipe = ACTION_SOUND_RECIPES[action];

      recipe.clicks.forEach(({ pitch, volume, soft, delay = 0 }) => {
        this.playSingleClick(pitch, volume, soft, delay);
      });

      if (recipe.swoosh) {
        this.playSingleSwoosh();
      }

      if (recipe.rumble) {
        this.playRumble(0.02);
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
    }
  }
}

export const pokerSoundEngine = new PokerSoundEngine();
