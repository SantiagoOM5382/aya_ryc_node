import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode-terminal';
import logger from './utils/logger.js';

let client = null;

export async function initializeClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // QR code for first authentication
  client.on('qr', (qr) => {
    logger.info('QR code generated - scan with your phone:');
    QRCode.generate(qr, { small: true });
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

  // Initialize client
  await client.initialize();
  logger.info('WhatsApp client initialized');

  return client;
}

export function getClient() {
  if (!client) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return client;
}

export async function sendMessage(chatId, message) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendMessage(message);
    logger.debug(`Message sent to ${chatId}: "${message}"`);
  } catch (error) {
    logger.error(`Failed to send message to ${chatId}`, error);
  }
}
