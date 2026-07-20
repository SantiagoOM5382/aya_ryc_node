const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger.js');
const { callClaude } = require('./claudeHandler.js');
const { transcribeAudio } = require('./utils/transcriptionHandler.js');
const path = require('path');
const fs = require('fs');

let client = null;

async function initializeClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // QR code for authentication
  client.on('qr', (qr) => {
    logger.info('📱 Scan this QR code with your phone:');
    qrcode.generate(qr, { small: true });
  });

  // Ready event
  client.on('ready', () => {
    logger.info('✅ WhatsApp client is ready!');
  });

  // Authentication failure
  client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
  });

  // Disconnected
  client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp disconnected: ${reason}`);
  });

  // Handle incoming messages
  client.on('message', async (message) => {
    // Ignore group messages and bot's own messages
    if (message.isGroupMsg) {
      return;
    }

    try {
      // Check if message has media (audio)
      if (message.hasMedia) {
        logger.info(`📻 Audio message from ${message.from}`);

        try {
          // Download media
          const media = await message.downloadMedia();
          logger.debug(`Media downloaded, MIME type: ${media.mimetype}`);

          // ONLY process audio files
          if (!media.mimetype.startsWith('audio/')) {
            logger.debug(`Non-audio media received (${media.mimetype}), ignoring`);
            return; // Silently ignore non-audio media
          }

          // Create temporary file with correct extension
          const ext = media.mimetype.split('/')[1] === 'ogg' ? 'ogg' : 'm4a';
          const tempFileName = `audio_${Date.now()}.${ext}`;
          const tempFilePath = path.join(__dirname, '..', '.wwebjs_cache', tempFileName);

          // Ensure directory exists
          const tempDir = path.dirname(tempFilePath);
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          // Write audio file
          fs.writeFileSync(tempFilePath, Buffer.from(media.data, 'base64'));
          logger.debug(`Audio file saved to: ${tempFilePath}`);

          // Transcribe audio using Whisper
          const transcript = await transcribeAudio(tempFilePath);

          // Check for errors (null means validation failed or transcription error)
          if (!transcript) {
            logger.warn(`Audio transcription failed or audio too long`);
            try {
              await message.reply('Por favor, envía audios de máximo 1 minuto o intenta de nuevo.');
            } catch (replyError) {
              logger.error(`Failed to send error message`, replyError);
            }
            // Clean up temp file
            try {
              fs.unlinkSync(tempFilePath);
            } catch (unlinkError) {
              logger.warn(`Failed to delete temp audio file: ${unlinkError.message}`);
            }
            return;
          }

          logger.info(`✅ Audio transcribed: "${transcript.substring(0, 50)}..."`);

          // Call Claude with transcribed text (normal text flow)
          const response = await callClaude(transcript, message.from);
          logger.debug(`Claude response ready: "${response}"`);

          // Send response
          try {
            await message.reply(response);
            logger.info(`✅ Response sent to ${message.from}`);
          } catch (sendError) {
            logger.error(`Failed to send via reply(): ${sendError.message}`);
            try {
              const chat = await message.getChat();
              await chat.sendMessage(response);
              logger.info(`✅ Response sent to ${message.from} (via chat)`);
            } catch (chatError) {
              logger.error(`Failed to send via chat.sendMessage(): ${chatError.message}`);
            }
          }

          // Clean up temporary file
          try {
            fs.unlinkSync(tempFilePath);
            logger.debug(`Temporary audio file deleted: ${tempFilePath}`);
          } catch (unlinkError) {
            logger.warn(`Failed to delete temporary file: ${unlinkError.message}`);
          }

        } catch (mediaError) {
          logger.error(`Failed to process audio message: ${mediaError.message}`);
          try {
            await message.reply('Disculpa, no pude descargar el audio. Intenta de nuevo.');
          } catch (replyError) {
            logger.error(`Failed to send media error message`, replyError);
          }
        }
        return;
      }

      // Text message handling (existing flow)
      if (!message.body?.trim()) {
        return;
      }

      logger.info(`📨 Message from ${message.from}: "${message.body}"`);

      // Call Claude to get response with user ID for conversation history
      const response = await callClaude(message.body, message.from);
      logger.debug(`Claude response ready: "${response}"`);

      // Send response back
      logger.debug(`Attempting to send message to ${message.from}`);

      try {
        await message.reply(response);
        logger.info(`✅ Response sent to ${message.from}`);
      } catch (sendError) {
        logger.error(`Failed to send via reply(): ${sendError.message}`);
        logger.debug(`Send error details:`, sendError);

        // Try alternative send method
        try {
          const chat = await message.getChat();
          await chat.sendMessage(response);
          logger.info(`✅ Response sent to ${message.from} (via chat)`);
        } catch (chatError) {
          logger.error(`Failed to send via chat.sendMessage(): ${chatError.message}`);
          logger.debug(`Chat send error details:`, chatError);
        }
      }
    } catch (error) {
      logger.error(`Failed to process message from ${message.from}`, error);
      try {
        await message.reply('Disculpa, hubo un error. Intenta de nuevo.');
      } catch (replyError) {
        logger.error(`Failed to send error message`, replyError);
      }
    }
  });

  // Initialize client
  logger.info('Initializing WhatsApp client...');
  await client.initialize();
  logger.info('🎧 Bot is listening for messages...');

  return client;
}

function getClient() {
  if (!client) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return client;
}

module.exports = { initializeClient, getClient };
