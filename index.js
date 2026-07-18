import dotenv from 'dotenv';
dotenv.config();

import logger from './src/utils/logger.js';
import { initializeClient } from './src/whatsappClient.js';

// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY not found in .env file');
  process.exit(1);
}

async function startBot() {
  try {
    logger.info('🤖 Starting AYA Bot...');
    await initializeClient();
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
