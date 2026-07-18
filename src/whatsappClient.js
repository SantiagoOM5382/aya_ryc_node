import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import logger from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let sock = null;

export async function initializeClient() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', '.auth_data'));

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: logger
  });

  // Handle credentials update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting') {
      logger.info('🔄 Connecting to WhatsApp...');
    }

    if (connection === 'open') {
      logger.info('✅ WhatsApp client is ready!');
    }

    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
        logger.error('Device logged out');
      } else {
        logger.warn('Connection closed, reconnecting...');
        // Auto reconnect
        setTimeout(() => initializeClient(), 5000);
      }
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if (!text?.trim()) continue;

      const from = msg.key.remoteJid;
      logger.info(`📨 Message from ${from}: "${text}"`);

      // Emit message event for index.js to handle
      sock.emit('message', { from, body: text });
    }
  });

  logger.info('WhatsApp client initialized');
  return sock;
}

export function getClient() {
  if (!sock) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return sock;
}

export async function sendMessage(chatId, message) {
  if (!sock) {
    logger.error('WhatsApp client not initialized');
    return;
  }

  try {
    await sock.sendMessage(chatId, { text: message });
    logger.info(`✅ Message sent to ${chatId}`);
  } catch (error) {
    logger.error(`Failed to send message to ${chatId}`, error);
  }
}
