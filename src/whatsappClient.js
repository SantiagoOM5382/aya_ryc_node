import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import logger from './utils/logger.js';
import { callClaude } from './claudeHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let sock = null;

export async function initializeClient() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', '.auth_data'));

  sock = makeWASocket({
    auth: state
  });

  // Handle credentials update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('📱 Scan this QR code with your phone:');
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
      }
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      // Ignore messages from self, group messages, and system messages
      if (msg.key.fromMe || msg.key.participant || !msg.message) continue;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if (!text?.trim()) continue;

      const from = msg.key.remoteJid;
      logger.info(`📨 Message from ${from}: "${text}"`);

      try {
        // Call Claude to get response
        const response = await callClaude(text);

        // Send response back
        await sock.sendMessage(from, { text: response });
        logger.info(`✅ Response sent to ${from}`);
      } catch (error) {
        logger.error(`Failed to process message from ${from}`, error);
        try {
          await sock.sendMessage(from, { text: 'Disculpa, hubo un error. Intenta de nuevo.' });
        } catch (sendError) {
          logger.error(`Failed to send error message to ${from}`, sendError);
        }
      }
    }
  });

  logger.info('🎧 Bot is listening for messages...');
  return sock;
}

export function getClient() {
  if (!sock) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return sock;
}
