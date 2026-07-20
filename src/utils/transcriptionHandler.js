const { execSync } = require('child_process');
const path = require('path');
const logger = require('./logger.js');
const { validateAudioDuration } = require('./audioHandler.js');

// Transcribe audio file using local Whisper
async function transcribeAudio(filePath) {
  try {
    logger.debug(`Starting transcription for: ${filePath}`);

    // Validate duration
    const durationCheck = await validateAudioDuration(filePath, 60);
    if (!durationCheck.valid) {
      logger.warn(`Audio too long: ${durationCheck.duration.toFixed(2)}s (max: 60s)`);
      return null; // Signal duration validation failed
    }

    // Run Whisper to transcribe
    logger.debug(`Running whisper transcription...`);
    const command = `whisper "${filePath}" --output_format txt --output_dir /tmp --quiet --language es`;

    try {
      execSync(command, { stdio: 'pipe' });
    } catch (execError) {
      logger.error(`Whisper execution failed: ${execError.message}`);
      return null; // Return null on transcription failure
    }

    // Read transcribed text from output file
    const fs = require('fs');
    const outputFile = `/tmp/${path.basename(filePath, path.extname(filePath))}.txt`;

    if (!fs.existsSync(outputFile)) {
      logger.error(`Whisper output file not found: ${outputFile}`);
      return null;
    }

    const transcript = fs.readFileSync(outputFile, 'utf-8').trim();
    logger.debug(`Transcription successful: "${transcript.substring(0, 50)}..."`);

    // Clean up output file
    try {
      fs.unlinkSync(outputFile);
      logger.debug(`Cleaned up transcript file: ${outputFile}`);
    } catch (unlinkError) {
      logger.warn(`Failed to clean transcript file: ${unlinkError.message}`);
    }

    return transcript;
  } catch (error) {
    logger.error(`Transcription error: ${error.message}`);
    return null;
  }
}

module.exports = {
  transcribeAudio
};
