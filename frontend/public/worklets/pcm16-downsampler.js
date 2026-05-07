// AudioWorkletProcessor for the Gemini Live API mic pipeline.
//
// Per-call this processor:
//   1. Resamples mono Float32 input from the device's native sample rate
//      (typically 44.1 kHz or 48 kHz) down to 16 kHz, using linear
//      interpolation. Linear is sufficient quality for speech-to-text and
//      avoids the cost of a polyphase FIR filter on the audio thread.
//   2. Converts each Float32 sample to clamped little-endian Int16 PCM.
//   3. Posts ~20 ms chunks (FRAME_SAMPLES at 16 kHz) back to the main thread
//      as transferable Int16Array buffers. The main thread base64-encodes and
//      sends them as `realtimeInput.audio` with mimeType "audio/pcm;rate=16000".
//
// 20 ms chunks keep end-to-end latency low; the Gemini Live API accepts
// 20–100 ms.

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20 ms at 16 kHz.

class Pcm16Downsampler extends AudioWorkletProcessor {
    constructor() {
        super();
        // Read position in the source stream, in fractional source samples.
        // Advances by `ratio` for every output sample emitted.
        this.readIndex = 0;
        // Total number of source samples we've received so far.
        this.sourceWritten = 0;
        // Most recent source sample, kept for linear interpolation between
        // process() calls.
        this.lastSample = 0;
        this.haveLastSample = false;
        // Fixed-size accumulator: when full we transfer it to the main thread
        // and allocate a fresh one. Allocation per chunk avoids copies.
        this.outBuffer = new Int16Array(FRAME_SAMPLES);
        this.outWritten = 0;

        this.ratio = sampleRate / TARGET_SAMPLE_RATE;
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel || channel.length === 0) return true;

        for (let i = 0; i < channel.length; i++) {
            const currentAbs = this.sourceWritten + i;

            // Emit every output sample whose interpolation point falls between
            // the previous and current source samples.
            while (this.readIndex <= currentAbs) {
                const frac = this.readIndex - (currentAbs - 1);
                const sample =
                    frac <= 0 || !this.haveLastSample
                        ? channel[i]
                        : this.lastSample * (1 - frac) + channel[i] * frac;

                this.outBuffer[this.outWritten++] = floatToInt16(sample);

                if (this.outWritten === FRAME_SAMPLES) {
                    // Transfer ownership of the buffer (no copy).
                    const out = this.outBuffer;
                    this.outBuffer = new Int16Array(FRAME_SAMPLES);
                    this.outWritten = 0;
                    this.port.postMessage(out, [out.buffer]);
                }

                this.readIndex += this.ratio;
            }

            this.lastSample = channel[i];
            this.haveLastSample = true;
        }

        this.sourceWritten += channel.length;
        return true;
    }
}

function floatToInt16(sample) {
    if (sample >= 1) return 32767;
    if (sample <= -1) return -32768;
    return Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
}

registerProcessor('pcm16-downsampler', Pcm16Downsampler);
