const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger.js');
const { validateAudioDuration } = require('./audioHandler.js');

// Transcribe audio file using local Whisper
async function transcribeAudio(filePath) {
  try {
    logger.debug(`Iniciando transcripción para: ${filePath}`);

    // Validate duration
    const durationCheck = await validateAudioDuration(filePath, 60);
    if (!durationCheck.valid) {
      logger.warn(`Audio demasiado largo: ${durationCheck.duration.toFixed(2)}s (máx: 60s)`);
      return null; // Signal duration validation failed
    }

    // Run Whisper to transcribe
    logger.debug(`Ejecutando transcripción con whisper...`);
    const command = `whisper "${filePath}" --output_format txt --output_dir /tmp --quiet --language es`;

    try {
      execSync(command, { stdio: 'pipe' });
    } catch (execError) {
      logger.error(`Ejecución de whisper falló: ${execError.message}`);
      return null; // Return null on transcription failure
    }

    // Read transcribed text from output file
    const outputFile = `/tmp/${path.basename(filePath, path.extname(filePath))}.txt`;

    if (!fs.existsSync(outputFile)) {
      logger.error(`Archivo de salida de whisper no encontrado: ${outputFile}`);
      return null;
    }

    const transcript = fs.readFileSync(outputFile, 'utf-8').trim();
    logger.debug(`Transcripción exitosa: "${transcript.substring(0, 50)}..."`);

    // Clean up output file
    try {
      fs.unlinkSync(outputFile);
      logger.debug(`Archivo de transcripción eliminado: ${outputFile}`);
    } catch (unlinkError) {
      logger.warn(`Error al limpiar archivo de transcripción: ${unlinkError.message}`);
    }

    return transcript;
  } catch (error) {
    // Clean up orphaned output file if it exists
    const outputFile = `/tmp/${path.basename(filePath, path.extname(filePath))}.txt`;
    try {
      fs.unlinkSync(outputFile);
    } catch (ignored) {}

    logger.error(`Error de transcripción: ${error.message}`);
    return null;
  }
}

module.exports = {
  transcribeAudio
};
