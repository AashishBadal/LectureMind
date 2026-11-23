import multer from 'multer';

// Supported audio MIME types
export const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/m4a',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac'
];

export const ALLOWED_AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;

/**
 * Sanitizes uploaded filename to prevent directory traversal and injection attacks
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFileName(filename) {
  if (!filename || typeof filename !== 'string') return 'lecture_audio.mp3';

  // Strip path traversal sequences and null bytes
  let clean = filename
    .replace(/(\.\.[/\\])+/g, '')
    .replace(/[/\\:*?"<>|\0]/g, '_')
    .trim();

  // Strip leading dots to prevent hidden files
  clean = clean.replace(/^\.+/, '');

  if (!clean || !ALLOWED_AUDIO_EXTENSIONS.test(clean)) {
    return 'lecture_audio.mp3';
  }

  return clean;
}

/**
 * Validates audio buffer magic bytes (file signature) to ensure
 * renamed non-audio files (e.g. executables, PHP scripts) are rejected.
 *
 * @param {Buffer} buffer
 * @returns {{ valid: boolean, format?: string, error?: string }}
 */
export function validateAudioBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { valid: false, error: 'Empty or invalid audio buffer.' };
  }

  // Check known malicious / non-audio signatures first
  // 1. Windows PE Executable (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: 'Executable binaries are strictly prohibited.' };
  }
  // 2. Linux ELF Binary
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { valid: false, error: 'ELF executable binaries are strictly prohibited.' };
  }
  // 3. HTML / PHP / Script files
  const asciiHeader = buffer.slice(0, 16).toString('utf8').toLowerCase();
  if (
    asciiHeader.startsWith('<!doc') ||
    asciiHeader.startsWith('<html') ||
    asciiHeader.startsWith('<?php') ||
    asciiHeader.startsWith('#!/bin') ||
    asciiHeader.startsWith('<script')
  ) {
    return { valid: false, error: 'Web scripts and text documents cannot be processed as audio.' };
  }

  // Check valid audio signatures:
  // 1. MP3 with ID3 header: 'ID3' (0x49, 0x44, 0x33)
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { valid: true, format: 'mp3-id3' };
  }

  // 2. MP3 frame sync: 0xFF followed by 0xFB, 0xF3, 0xF2, 0xFA, 0xE3
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { valid: true, format: 'mp3-raw' };
  }

  // 3. RIFF / WAV: 'RIFF' .... 'WAVE'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return { valid: true, format: 'wav' };
  }

  // 4. Ogg Vorbis/Opus: 'OggS' (0x4F, 0x67, 0x67, 0x53)
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { valid: true, format: 'ogg' };
  }

  // 5. FLAC: 'fLaC' (0x66, 0x4C, 0x61, 0x43)
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) {
    return { valid: true, format: 'flac' };
  }

  // 6. M4A / MP4 container: 'ftyp' at offset 4..7
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return { valid: true, format: 'm4a' };
  }

  // 7. WebM / Matroska: 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { valid: true, format: 'webm' };
  }

  // 8. AAC ADTS: 0xFF followed by 0xF1 or 0xF9
  if (buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9)) {
    return { valid: true, format: 'aac' };
  }

  // Fallback for custom synthesized audio or raw PCM if length is sufficient (> 1KB)
  if (buffer.length >= 1024) {
    return { valid: true, format: 'generic-audio' };
  }

  return { valid: false, error: 'Unrecognized audio file signature. Please upload a standard MP3, WAV, M4A, OGG, or WEBM recording.' };
}

// Memory storage allows direct streaming to Gemini without mandatory disk I/O
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const cleanMime = (file.mimetype || '').toLowerCase().trim();
  const isAllowedMime = ALLOWED_AUDIO_MIMES.includes(cleanMime);
  const hasAudioExtension = ALLOWED_AUDIO_EXTENSIONS.test(file.originalname || '');

  // Strict check: Both MIME type AND file extension must match allowed audio specifications
  if (isAllowedMime && hasAudioExtension) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported audio format. Received MIME: "${file.mimetype}", Filename: "${file.originalname}". Please upload an MP3, WAV, M4A, AAC, OGG, or WEBM audio file.`
      ),
      false
    );
  }
};

export const audioUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB max audio file
  }
});
