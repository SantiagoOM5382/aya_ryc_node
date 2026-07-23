require('dotenv').config();

const logger = require('./src/utils/logger.js');
const { startBot } = require('./src/bot.js');
const { startAPI } = require('./src/api.js');

// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY not found in .env file');
  process.exit(1);
}

async function start() {
  try {
    // Start API server
    await startAPI();

    // Start WhatsApp bot
    await startBot();

    logger.info('✅ All services started successfully');
  } catch (error) {
    logger.error('Failed to start services', error);
    process.exit(1);
  }
}

// Start everything
start();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
