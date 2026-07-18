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

    // Set up message listener
    client.on('message', async (message) => {
      // Ignore group messages and bot's own messages
      if (message.from === message.to || message.isGroupMsg) {
        return;
      }

      try {
        logger.info(`📨 Message from ${message.from}: "${message.body}"`);

        // Call Claude
        const response = await callClaude(message.body);

        // Send response back
        await sendMessage(message.from, response);
        logger.info(`✅ Response sent to ${message.from}`);
      } catch (error) {
        logger.error(`Failed to process message from ${message.from}`, error);
        // Optionally send error message to user
        await sendMessage(message.from, 'Disculpa, hubo un error. Intenta de nuevo.');
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
