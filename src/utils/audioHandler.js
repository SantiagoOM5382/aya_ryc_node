const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('./logger.js');

// Validate audio duration
async function validateAudioDuration(filePath, maxSeconds = 60) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error('ffprobe error:', err.message);
        resolve({ valid: false, duration: 0 });
        return;
      }

      const duration = metadata.format.duration;
      const valid = duration <= maxSeconds;

      logger.debug(`Audio duration: ${duration.toFixed(2)}s, max: ${maxSeconds}s, valid: ${valid}`);
      resolve({ valid, duration });
    });
  });
}

// Convert audio file to base64 string
async function audioToBase64(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    logger.debug(`Audio converted to base64, size: ${base64.length} chars`);
    return base64;
  } catch (error) {
    logger.error('Failed to convert audio to base64:', error.message);
    throw error;
  }
}

// Get MIME type based on file extension
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

module.exports = {
  validateAudioDuration,
  audioToBase64,
  getMimeType
};
