// AudioWorkletProcessor that:
//   1. Resamples mono Float32 input from the device sample rate (typically
//      44.1 kHz or 48 kHz) down to 16 kHz using linear interpolation.
//   2. Converts Float32 samples to clamped little-endian Int16 PCM.
//   3. Posts ~20 ms chunks (320 samples at 16 kHz) back to the main thread
//      as transferable Int16Array buffers.
//
// The Gemini Live API accepts `audio/pcm;rate=16000` chunks of 20-100 ms;
// 20 ms (320 samples) keeps end-to-end latency low.

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20ms at 16kHz

class Pcm16Downsampler extends AudioWorkletProcessor {
    constructor() {
        super();
        // Cumulative read position in the source stream, expressed in source samples.
        this._readIndex = 0;
        // Cumulative number of source samples we've received so far.
        this._sourceWritten = 0;
        // Ring of recent source samples we still need for interpolation.
        // We only ever need the latest two source samples, so a small buffer suffices.
        this._lastSample = 0;
        this._haveLastSample = false;
        // Output accumulator: pushes Int16 samples until we have a full FRAME_SAMPLES, then flushes.
        this._outBuffer = new Int16Array(FRAME_SAMPLES);
        this._outWritten = 0;

        this._ratio = sampleRate / TARGET_SAMPLE_RATE;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;
        const channel = input[0];
        if (!channel || channel.length === 0) return true;

        // Process every incoming render quantum (typically 128 frames).
        for (let i = 0; i < channel.length; i++) {
            const currentAbs = this._sourceWritten + i;

            // Emit as many output samples as fit between the previous source sample
            // and the current one.
            while (this._readIndex <= currentAbs) {
                const frac = this._readIndex - (currentAbs - 1);
                let sample;
                if (frac <= 0 || !this._haveLastSample) {
                    // Not enough history yet: just use the current sample.
                    sample = channel[i];
                } else {
                    // Linear interpolate between previous and current.
                    sample = this._lastSample * (1 - frac) + channel[i] * frac;
                }

                // Clamp + scale to Int16.
                let s16;
                if (sample >= 1) s16 = 32767;
                else if (sample <= -1) s16 = -32768;
                else s16 = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);

                this._outBuffer[this._outWritten++] = s16;

                if (this._outWritten === FRAME_SAMPLES) {
                    // Transfer the buffer to the main thread (no copy).
                    const out = this._outBuffer;
                    this._outBuffer = new Int16Array(FRAME_SAMPLES);
                    this._outWritten = 0;
                    this.port.postMessage(out, [out.buffer]);
                }

                this._readIndex += this._ratio;
            }

            this._lastSample = channel[i];
            this._haveLastSample = true;
        }

        this._sourceWritten += channel.length;
        return true;
    }
}

registerProcessor('pcm16-downsampler', Pcm16Downsampler);
