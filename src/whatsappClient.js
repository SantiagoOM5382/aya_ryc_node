import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import logger from './utils/logger.js';
import { callClaude } from './claudeHandler.js';

let client = null;

export async function initializeClient() {
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
    // Ignore group messages, bot's own messages, and empty messages
    if (message.isGroupMsg || !message.body?.trim()) {
      return;
    }

    try {
      logger.info(`📨 Message from ${message.from}: "${message.body}"`);

      // Call Claude to get response
      const response = await callClaude(message.body);
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

export function getClient() {
  if (!client) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return client;
}
