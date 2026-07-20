const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger.js');
const { addMessage, getHistory } = require('./conversationHistory.js');

let client = null;

// Load system prompt from file
let systemPrompt = '';
try {
  const promptPath = path.join(__dirname, '..', 'prompts', 'ryc-system-prompt.txt');
  systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  logger.info('System prompt loaded successfully');
} catch (error) {
  logger.error('Failed to load system prompt', error);
  process.exit(1);
}

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return client;
}

async function callClaude(userMessage, userId) {
  try {
    logger.debug(`Processing message from ${userId}`);
    logger.debug(`Sending message to Claude: "${userMessage}"`);

    // Track user message in history
    addMessage(userId, 'user', userMessage);
    const history = getHistory(userId);

    const message = await getClient().messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      system: systemPrompt,
      messages: history
    });

    const response = message.content[0].text;
    logger.debug(`Claude response: "${response}"`);

    // Track assistant response in history
    addMessage(userId, 'assistant', response);

    return response;
  } catch (error) {
    logger.error('Claude API call failed', error);
    // Return fallback message in Spanish
    return 'Disculpa, tuve un problema procesando tu mensaje. Conectamos con un agente: +57 1 XXXX XXXX';
  }
}

module.exports = { callClaude };
