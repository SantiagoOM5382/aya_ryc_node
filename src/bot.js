const logger = require('./utils/logger.js');
const { initializeClient } = require('./bot/whatsapp/whatsappClient.js');
const { printReadySummary } = require('./bot/tracker/advisorTransferTracker.js');

async function startBot() {
  try {
    logger.info('🤖 Starting AYA Bot...');
    await initializeClient();

    // Show summary of chats ready for payment
    setTimeout(() => {
      printReadySummary();
    }, 2000);
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

module.exports = { startBot };
