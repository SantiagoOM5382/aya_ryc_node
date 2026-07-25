require('dotenv').config();

const logger = require('./src/utils/logger.js');
const { startBot } = require('./src/bot.js');

// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY not found in .env file');
  process.exit(1);
}

async function start() {
  try {
    // Start WhatsApp bot
    await startBot();

    logger.info('✅ Bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot', error);
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
