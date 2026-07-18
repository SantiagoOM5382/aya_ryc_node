import dotenv from 'dotenv';
dotenv.config();

import logger from './src/utils/logger.js';
import { initializeClient, getClient, sendMessage } from './src/whatsappClient.js';
import { callClaude } from './src/claudeHandler.js';

// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY not found in .env file');
  process.exit(1);
}

async function startBot() {
  try {
    logger.info('🤖 Starting AYA Bot...');

    // Initialize WhatsApp client
    const client = await initializeClient();

    // Set up message listener for Baileys
    client.on('message', async (messageData) => {
      const { from, body } = messageData;

      try {
        logger.debug(`Processing message from ${from}: "${body}"`);

        // Call Claude
        const response = await callClaude(body);

        // Send response back
        await sendMessage(from, response);
        logger.info(`✅ Response sent to ${from}`);
      } catch (error) {
        logger.error(`Failed to process message from ${from}`, error);
        // Send error message to user
        await sendMessage(from, 'Disculpa, hubo un error. Intenta de nuevo.');
      }
    });

    logger.info('🎧 Bot is listening for messages...');
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
