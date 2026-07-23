const logger = require('../../utils/logger.js');

const conversations = new Map();
const MAX_HISTORY = 20;

function addMessage(userId, role, content) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  const history = conversations.get(userId);
  history.push({ role, content });

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  logger.debug(`Added message to ${userId}. History length: ${history.length}`);
}

function getHistory(userId) {
  return conversations.get(userId) || [];
}

function clearHistory(userId) {
  conversations.delete(userId);
  logger.info(`Cleared history for ${userId}`);
}

module.exports = { addMessage, getHistory, clearHistory };
