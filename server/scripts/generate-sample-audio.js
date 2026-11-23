import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSyntheticWavAudio(durationSeconds = 4, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate speech-like harmonic frequencies
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 250 + 80 * Math.sin(2 * Math.PI * 3 * t);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.5 * 32767;
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  return buffer;
}

const outPath = path.resolve(__dirname, '../../sample_lecture.wav');
const wavBuf = createSyntheticWavAudio(4, 16000);
fs.writeFileSync(outPath, wavBuf);
console.log(`Generated synthetic sample audio at: ${outPath} (${wavBuf.length} bytes)`);
