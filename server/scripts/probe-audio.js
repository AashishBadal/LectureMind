import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testAudioModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Generate 3 seconds of sound
  const sampleRate = 16000;
  const numSamples = sampleRate * 3;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.3 * 32767;
    buffer_writeInt16LE(buf, Math.round(sample), 44 + i * 2);
  }

  function buffer_writeInt16LE(b, val, offset) {
    b.writeInt16LE(val, offset);
  }

  const modelsToTest = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-transcribe'];

  for (const m of modelsToTest) {
    console.log(`Testing model: ${m}...`);
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent([
        'Please transcribe this audio clip. If it contains audio tones or no clear speech, describe the audio and output JSON: {"content": "audio description", "language": "en", "segments": [{"id": 1, "start": 0, "end": 3, "speaker": "Speaker 1", "text": "description"}]}',
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: buf.toString('base64')
          }
        }
      ]);
      console.log(`Model ${m} SUCCESS:`, res.response.text());
      break;
    } catch (err) {
      console.log(`Model ${m} FAILED:`, err.message);
    }
  }
}

testAudioModels();
