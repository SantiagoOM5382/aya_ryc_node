import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import logger from './utils/logger.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export async function callClaude(userMessage) {
  try {
    logger.debug(`Sending message to Claude: "${userMessage}"`);

    const message = await getClient().messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const response = message.content[0].text;
    logger.debug(`Claude response: "${response}"`);
    return response;
  } catch (error) {
    logger.error('Claude API call failed', error);
    // Return fallback message in Spanish
    return 'Disculpa, tuve un problema procesando tu mensaje. Conectamos con un agente: +57 1 XXXX XXXX';
  }
}
